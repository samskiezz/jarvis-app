"""OCR_ENGINE — real OCR for the scraped document corpus (PaddleOCR + Tesseract).

The scraper encounters PDFs and images with no machine-readable text layer (scanned
reports, screenshots, image-only PDFs). This module extracts their text, preferring
the cheapest reliable path:

  * pypdf text layer   — born-digital PDFs already carry text; pull it with ``pypdf``.
  * PaddleOCR          — primary OCR engine for images/scanned pages. GPU-accelerated
                         when paddlepaddle-gpu + CUDA are present, CPU otherwise.
  * Tesseract          — fallback OCR via ``pytesseract`` (the ``tesseract`` binary).
  * Ollama vision      — optional last resort when ``OCR_VISION_MODEL`` is set: POST
                         the page/image to a multimodal model on the GPU box.

Engine selection via ``OCR_ENGINE`` (``auto`` [default] | ``paddle`` | ``tesseract``
| ``vision``); ``auto`` tries paddle → tesseract → vision. Language via ``OCR_LANG``
(default ``en``). Everything is graceful: NO public function raises — each returns a
structured ``{"ok": bool, ...}`` dict with a ``reason`` on failure, and every engine
is lazily imported so a missing lib simply drops to the next.

Engine seams (monkeypatched by tests for fully-offline verification):
  ``_paddle_ocr_image(bytes)->str|None``, ``_tesseract_ocr_image(bytes)->str|None``,
  ``_post_generate(payload)->dict`` (the Ollama vision network call).
"""

from __future__ import annotations

import base64
import importlib.util
import os
import threading
from typing import Optional

import httpx

# ── env accessors (read live, never cached at import) ──────────────────────────────


def _ollama_host() -> str:
    return os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").strip() or \
        "http://127.0.0.1:11434"


def _vision_model() -> str:
    return os.environ.get("OCR_VISION_MODEL", "").strip()


def _engine() -> str:
    """Selected engine: auto | paddle | tesseract | vision (default auto)."""
    e = os.environ.get("OCR_ENGINE", "auto").strip().lower()
    return e if e in ("auto", "paddle", "tesseract", "vision") else "auto"


def _lang() -> str:
    return os.environ.get("OCR_LANG", "en").strip() or "en"


# ── capability probes (cheap, no network) ──────────────────────────────────────────


def _have(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:  # noqa: BLE001 - some shims raise on probe
        return False


def _tesseract_bin() -> bool:
    """True iff the tesseract binary is on PATH."""
    try:
        import shutil
        return bool(shutil.which("tesseract"))
    except Exception:  # noqa: BLE001
        return False


def _rasterizer_available() -> bool:
    return _have("pymupdf") or _have("fitz")


# ── PaddleOCR engine (primary; GPU-capable) ────────────────────────────────────────

_paddle_lock = threading.Lock()
_paddle_obj = None
_paddle_failed = False


def _get_paddle():
    """Lazily build + cache a PaddleOCR instance (expensive). None if unavailable."""
    global _paddle_obj, _paddle_failed
    if _paddle_obj is not None or _paddle_failed:
        return _paddle_obj
    with _paddle_lock:
        if _paddle_obj is not None or _paddle_failed:
            return _paddle_obj
        try:
            from paddleocr import PaddleOCR  # type: ignore
            # use_angle_cls + lang; PaddleOCR picks GPU automatically when available.
            _paddle_obj = PaddleOCR(use_angle_cls=True, lang=_lang(), show_log=False)
        except Exception:  # noqa: BLE001 - paddle/paddlepaddle absent or build failed
            _paddle_failed = True
            _paddle_obj = None
        return _paddle_obj


def _paddle_ocr_image(image_bytes: bytes) -> Optional[str]:
    """OCR via PaddleOCR (supports both the 2.x ``.ocr()`` and 3.x ``.predict()``
    APIs). Returns text, or None if paddle is unavailable / errors. On a runtime
    failure it marks paddle failed so the auto-chain fails FAST to Tesseract instead
    of paying the cost on every image."""
    global _paddle_failed
    ocr = _get_paddle()
    if ocr is None:
        return None
    try:
        import io

        import numpy as np
        from PIL import Image

        arr = np.array(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
        lines: list[str] = []
        # 3.x pipeline API
        if hasattr(ocr, "predict"):
            try:
                for r in (ocr.predict(arr) or []):
                    texts = r.get("rec_texts") if hasattr(r, "get") else None
                    if texts:
                        lines.extend(str(t) for t in texts if t)
                if lines:
                    return "\n".join(lines).strip() or None
            except Exception:  # noqa: BLE001 - fall through to 2.x / fail-fast
                raise
        # 2.x API
        result = ocr.ocr(arr, cls=True) if hasattr(ocr, "ocr") else []
        for block in (result or []):
            for line in (block or []):
                try:
                    txt = line[1][0]
                    if txt:
                        lines.append(str(txt))
                except Exception:  # noqa: BLE001
                    continue
        return "\n".join(lines).strip() or None
    except Exception:  # noqa: BLE001 - runtime broken (e.g. paddle PIR bug) -> fail fast
        _paddle_failed = True
        return None


# ── Tesseract engine (fallback; reliable) ──────────────────────────────────────────


def _tesseract_ocr_image(image_bytes: bytes) -> Optional[str]:
    """OCR via pytesseract/tesseract. Returns text, or None if unavailable / errors."""
    try:
        import io

        import pytesseract
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(img)
        return (text or "").strip() or None
    except Exception:  # noqa: BLE001 - pytesseract/binary absent or bad image
        return None


# ── Ollama vision engine (optional last resort) ────────────────────────────────────

_OCR_PROMPT = (
    "Transcribe ALL text in this image exactly, preserving order. Output only the text."
)


def _post_generate(payload: dict, *, timeout: float = 120.0) -> dict:
    """POST to Ollama ``/api/generate`` — the single network seam tests monkeypatch."""
    url = _ollama_host().rstrip("/") + "/api/generate"
    resp = httpx.post(url, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def _vision_ocr_image(image_bytes: bytes, *, timeout: float = 120.0) -> Optional[str]:
    model = _vision_model()
    if not model or not image_bytes:
        return None
    try:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        out = _post_generate({"model": model, "prompt": _OCR_PROMPT,
                              "images": [b64], "stream": False}, timeout=timeout)
        return str((out or {}).get("response") or "").strip() or None
    except Exception:  # noqa: BLE001
        return None


# ── unified image OCR (engine chain) ────────────────────────────────────────────────


def ocr_image_bytes(image_bytes: bytes, *, timeout: float = 120.0) -> dict:
    """OCR a single image through the selected engine chain. Never raises.

    ``OCR_ENGINE=auto`` tries PaddleOCR → Tesseract → Ollama-vision; an explicit value
    forces one engine. Returns ``{"ok","text","chars","engine","reason"?}``."""
    if not image_bytes:
        return {"ok": False, "text": "", "chars": 0, "engine": "none",
                "reason": "empty image bytes"}
    sel = _engine()
    chain = ([("paddleocr", _paddle_ocr_image), ("tesseract", _tesseract_ocr_image),
              ("ollama-vision", lambda b: _vision_ocr_image(b, timeout=timeout))]
             if sel == "auto" else
             {"paddle": [("paddleocr", _paddle_ocr_image)],
              "tesseract": [("tesseract", _tesseract_ocr_image)],
              "vision": [("ollama-vision", lambda b: _vision_ocr_image(b, timeout=timeout))]}[sel])
    tried: list[str] = []
    for name, fn in chain:
        tried.append(name)
        try:
            text = fn(image_bytes)
        except Exception:  # noqa: BLE001 - never let an engine raise
            text = None
        if text and text.strip():
            return {"ok": True, "text": text.strip(), "chars": len(text.strip()),
                    "engine": name}
    return {"ok": False, "text": "", "chars": 0, "engine": "+".join(tried) or sel,
            "reason": f"no OCR engine produced text (tried: {', '.join(tried) or sel})"}


# ── PDF text-layer extraction (pypdf) ──────────────────────────────────────────────

_MIN_CHARS_PER_PAGE = 50


def extract_pdf_text(pdf_bytes: bytes) -> dict:
    """Pull the text layer from a PDF with ``pypdf`` (lazy). Scanned/low-text PDFs
    come back ``needs_ocr=True``. Never raises."""
    if not pdf_bytes:
        return {"ok": False, "text": "", "chars": 0, "engine": "pypdf", "pages": 0,
                "needs_ocr": False, "reason": "empty pdf bytes"}
    try:
        import io

        from pypdf import PdfReader
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "text": "", "chars": 0, "engine": "pypdf", "pages": 0,
                "needs_ocr": True, "reason": f"pypdf unavailable: {exc}"}
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = list(reader.pages)
        n_pages = len(pages)
        parts: list[str] = []
        for pg in pages:
            try:
                parts.append(pg.extract_text() or "")
            except Exception:  # noqa: BLE001
                parts.append("")
        text = "\n".join(p for p in parts if p).strip()
        chars = len(text)
        if n_pages > 0 and chars < _MIN_CHARS_PER_PAGE * n_pages:
            return {"ok": False, "text": text, "chars": chars, "engine": "pypdf",
                    "pages": n_pages, "needs_ocr": True,
                    "reason": "little/no text layer (likely scanned/image PDF)"}
        return {"ok": chars > 0, "text": text, "chars": chars, "engine": "pypdf",
                "pages": n_pages, "needs_ocr": chars == 0}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "text": "", "chars": 0, "engine": "pypdf", "pages": 0,
                "needs_ocr": False, "reason": f"pdf parse error: {exc}"}


def _rasterize_pdf(pdf_bytes: bytes, *, max_pages: int = 20, zoom: float = 2.0) -> list:
    """Render PDF pages to PNG bytes via pymupdf/fitz (lazy). [] on any error."""
    try:
        try:
            import pymupdf as fitz  # type: ignore
        except Exception:  # noqa: BLE001
            import fitz  # type: ignore
    except Exception:  # noqa: BLE001
        return []
    images: list = []
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        try:
            mat = fitz.Matrix(zoom, zoom)
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                try:
                    images.append(page.get_pixmap(matrix=mat).tobytes("png"))
                except Exception:  # noqa: BLE001
                    continue
        finally:
            doc.close()
    except Exception:  # noqa: BLE001
        return []
    return images


# ── content-type helpers ────────────────────────────────────────────────────────────


def _is_pdf(content_type: str, url: str) -> bool:
    ct = (content_type or "").lower()
    return "pdf" in ct or (url or "").lower().split("?")[0].endswith(".pdf")


def _is_image(content_type: str, url: str) -> bool:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return True
    lower = (url or "").lower().split("?")[0]
    return lower.endswith((".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"))


# ── unified dispatcher ──────────────────────────────────────────────────────────────


def ocr_document(content: bytes, content_type: str = "", *, url: str = "") -> dict:
    """Dispatch ``content`` to the right extractor. PDFs → text layer, falling back to
    rasterize + OCR for scanned PDFs; images → the OCR engine chain. Never raises.
    Returns ``{"ok","text","chars","engine","reason"?}``."""
    if not content:
        return {"ok": False, "text": "", "chars": 0, "engine": "none",
                "reason": "empty content"}
    try:
        if _is_pdf(content_type, url):
            res = extract_pdf_text(content)
            if res.get("ok") or not res.get("needs_ocr"):
                return {"ok": bool(res.get("ok")), "text": res.get("text", ""),
                        "chars": res.get("chars", 0), "engine": res.get("engine", "pypdf"),
                        **({"reason": res["reason"]} if res.get("reason") else {})}
            # scanned PDF → rasterize + OCR each page through the engine chain
            if not _rasterizer_available():
                return {"ok": False, "text": res.get("text", ""), "chars": res.get("chars", 0),
                        "engine": "pypdf",
                        "reason": "scanned PDF and no rasterizer (install pymupdf)"}
            parts: list[str] = []
            for png in _rasterize_pdf(content):
                r = ocr_image_bytes(png)
                if r.get("ok") and r.get("text"):
                    parts.append(r["text"])
            text = "\n\n".join(parts).strip()
            return {"ok": bool(text), "text": text, "chars": len(text),
                    "engine": "ocr+pdf",
                    **({} if text else {"reason": "OCR produced no text"})}
        if _is_image(content_type, url):
            return ocr_image_bytes(content)
        return {"ok": False, "text": "", "chars": 0, "engine": "none",
                "reason": f"unsupported content type: {content_type or '(none)'}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "text": "", "chars": 0, "engine": "none",
                "reason": f"ocr_document error: {exc}"}


# ── diagnostics ─────────────────────────────────────────────────────────────────────


def available() -> dict:
    """Report OCR capabilities for health/diagnostics. Cheap, no network."""
    model = _vision_model()
    paddle = _have("paddleocr") and _have("paddle")
    return {
        "engine_selected": _engine(),
        "lang": _lang(),
        "paddleocr": paddle,
        "tesseract": _have("pytesseract") and _tesseract_bin(),
        "tesseract_bin": _tesseract_bin(),
        "vision_configured": bool(model),
        "vision_model": model,
        "pypdf": _have("pypdf"),
        "rasterizer": _rasterizer_available(),
    }
