"""WORLD DOCUMENTS — baseline document ingestion for the catalogued reference URLs.

Most of the 92k catalogued endpoints are AUTHORITATIVE REFERENCE DOCUMENTS
(standards, API docs, schemas: w3.org, json-schema.org, CKAN/Socrata docs, ISO,
CloudEvents). Those are not live data feeds — they are the BASELINE KNOWLEDGE the
platform should read once, extract, store as Document objects, and index for
search/RAG. The live data APIs then keep the operational layer current.

This pipeline: fetch (rate-limited, cached) -> extract title+text (stdlib HTML
parser) -> store as a governed Document (second_brain note, which auto-indexes for
semantic search + mirrors to the ontology graph + Postgres) -> audit + lineage.

stdlib only, never raises.
"""

from __future__ import annotations

import hashlib
import sqlite3
import urllib.parse
from html.parser import HTMLParser

from . import net_ratelimit as nr

try:
    from . import second_brain as sb
except Exception:  # noqa: BLE001
    sb = None  # type: ignore
try:
    from . import jarvis_os as jos
except Exception:  # noqa: BLE001
    jos = None  # type: ignore
try:
    from .second_brain import _db_path
except Exception:  # noqa: BLE001
    def _db_path() -> str:  # type: ignore
        import os
        return os.environ.get("BRAIN_DB", "brain.db")

# hosts whose full text is paywalled/closed — index only metadata, don't store body
RESTRICTED_HOSTS = {"www.iso.org", "iso.org"}
MAX_TEXT = 8000  # bounded excerpt stored per document (reference snippet scale)


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self._in_title = False
        self._skip = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "svg"):
            self._skip += 1
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg") and self._skip:
            self._skip -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._skip:
            return
        t = data.strip()
        if not t:
            return
        if self._in_title and not self.title:
            self.title = t[:200]
        else:
            self.parts.append(t)


def extract_text(html: str) -> tuple[str, str]:
    """(title, cleaned_text) from an HTML document."""
    p = _TextExtractor()
    try:
        p.feed(html or "")
    except Exception:  # noqa: BLE001
        pass
    text = " ".join(p.parts)
    text = " ".join(text.split())  # collapse whitespace
    return p.title, text


# ── OCR (PDF / image documents) ──────────────────────────────────────────────────
# Most HTML is handled above; scanned PDFs and images need OCR. EasyOCR runs on the
# GPU when present (installed by setup.sh); pytesseract drives the system `tesseract`
# as a CPU fallback; PyMuPDF reads a PDF's text layer first (free when it's a real
# text PDF). Everything is lazy + guarded so a box without the engines just degrades.
_OCR: dict = {"reader": None, "tried": False}


def _easyocr_reader():
    """Lazy, cached EasyOCR reader (GPU if available, else CPU). None if not installed."""
    if _OCR["tried"]:
        return _OCR["reader"]
    _OCR["tried"] = True
    try:
        import easyocr  # heavy; installed by setup.sh (SETUP_HEAVY_OCR)
        try:
            _OCR["reader"] = easyocr.Reader(["en"], gpu=True)
        except Exception:  # noqa: BLE001 - no CUDA → CPU
            _OCR["reader"] = easyocr.Reader(["en"], gpu=False)
    except Exception:  # noqa: BLE001
        _OCR["reader"] = None
    return _OCR["reader"]


def _ocr_image_bytes(data: bytes) -> str:
    """OCR raw image bytes → text. EasyOCR (GPU) first, then pytesseract. '' if none."""
    if not data:
        return ""
    rdr = _easyocr_reader()
    if rdr is not None:
        try:
            import io as _io
            import numpy as _np
            from PIL import Image as _Image
            img = _Image.open(_io.BytesIO(data)).convert("RGB")
            return " ".join(rdr.readtext(_np.array(img), detail=0)) or ""
        except Exception:  # noqa: BLE001
            pass
    try:
        import io as _io
        import pytesseract
        from PIL import Image as _Image
        return pytesseract.image_to_string(_Image.open(_io.BytesIO(data))) or ""
    except Exception:  # noqa: BLE001
        return ""


def _ocr_pdf_bytes(data: bytes, *, max_pages: int = 20) -> str:
    """PDF → text: the embedded text layer (free), and for scanned pages with no text,
    rasterise + OCR. Best-effort; '' if PyMuPDF is unavailable. Never raises."""
    try:
        import fitz  # PyMuPDF
    except Exception:  # noqa: BLE001
        return ""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception:  # noqa: BLE001
        return ""
    out: list[str] = []
    try:
        for i in range(min(max_pages, doc.page_count)):
            page = doc.load_page(i)
            txt = (page.get_text() or "").strip()
            if len(txt) < 40:  # scanned page → OCR the rendered image
                try:
                    txt = _ocr_image_bytes(page.get_pixmap(dpi=150).tobytes("png")) or txt
                except Exception:  # noqa: BLE001
                    pass
            if txt:
                out.append(txt)
    finally:
        doc.close()
    return "\n".join(out)


def ocr_extract(data: bytes, *, content_type: str = "", url: str = "") -> tuple[str, str]:
    """(title, text) from a PDF or image document. Best-effort; ('', '') if no OCR
    engine is available. Never raises."""
    ct, head = (content_type or "").lower(), (data[:5] if data else b"")
    is_pdf = "pdf" in ct or head.startswith(b"%PDF") or url.lower().split("?")[0].endswith(".pdf")
    text = _ocr_pdf_bytes(data) if is_pdf else _ocr_image_bytes(data)
    title = (url.rsplit("/", 1)[-1] or _host(url)) if url else ""
    return title[:200], (text or "")


def fetch_bytes(url: str, *, timeout: float = 25.0) -> tuple[bytes, str]:
    """Raw bytes + content-type (polite_get returns decoded text, which corrupts binary
    PDFs). Never raises → (b'', '')."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JarvisDocs/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - public docs
            return r.read(25_000_000), (r.headers.get("Content-Type") or "")
    except Exception:  # noqa: BLE001
        return b"", ""


def _looks_like_doc(url: str) -> bool:
    u = (url or "").lower().split("?")[0]
    return u.endswith((".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".gif"))


def _host(u: str) -> str:
    try:
        return urllib.parse.urlparse(u or "").netloc.lower()
    except Exception:  # noqa: BLE001
        return ""


def ingest_url(url: str, *, subject_id: str = "", source_name: str = "") -> dict:
    """Fetch a reference URL, extract text, store as a governed, searchable Document."""
    host = _host(url)
    title = text = ""
    ocr_used = False
    # PDFs / images → OCR (text layer first, then EasyOCR/tesseract). polite_get only
    # returns decoded text, so fetch raw bytes for these.
    if _looks_like_doc(url):
        data, ct = fetch_bytes(url)
        if data:
            title, text = ocr_extract(data, content_type=ct, url=url)
            ocr_used = bool(text)
    if not text:
        resp = nr.polite_get(url, ttl=86400.0)  # cache docs for a day
        if not resp["ok"] or not resp["body"]:
            return {"ok": False, "url": url, "error": resp.get("error") or "no body"}
        body = resp["body"]
        if body.lstrip()[:5] == "%PDF-":  # a catalogued URL can serve a PDF with no extension
            data, ct = fetch_bytes(url)
            title, text = ocr_extract(data, content_type=ct, url=url)
            ocr_used = bool(text)
        if not text:
            title, text = extract_text(body)
    title = title or url.rsplit("/", 1)[-1] or host
    restricted = host in RESTRICTED_HOSTS
    excerpt = "" if restricted else text[:MAX_TEXT]
    note = None
    if sb is not None:
        body = (f"{excerpt}\n\nReference document. Source: {url}"
                + (f" Subject [[{subject_id}]]" if subject_id else "")).strip()
        fm = {"doc": True, "source": source_name or host, "url": url,
              "subject_id": subject_id, "extracted_chars": len(text),
              "licence_restricted": restricted, "ocr": ocr_used}
        try:
            note = sb.upsert_note("document", title, body, fm, 0.6)
        except Exception:  # noqa: BLE001
            note = None
    if jos is not None:
        jos.audit("document.ingest", actor="world-documents", target=url,
                  meta={"title": title[:80], "chars": len(text), "restricted": restricted, "ocr": ocr_used})
    return {"ok": bool(note), "url": url, "title": title, "host": host,
            "chars": len(text), "stored": bool(note), "restricted": restricted, "ocr": ocr_used,
            "raw_hash": hashlib.sha256((text or "").encode()).hexdigest()[:16]}


def _candidate_urls(limit: int, host_filter: str | None) -> list[tuple[str, str, str]]:
    """(url, subject_id, source_name) distinct doc URLs from the catalogue."""
    try:
        c = sqlite3.connect(_db_path()); c.row_factory = sqlite3.Row
        try:
            if host_filter:
                rows = c.execute(
                    "SELECT DISTINCT official_url, subject_id, source_name FROM world_endpoint "
                    "WHERE official_url LIKE ? LIMIT ?", (f"%{host_filter}%", limit)).fetchall()
            else:
                rows = c.execute(
                    "SELECT DISTINCT official_url, subject_id, source_name FROM world_endpoint "
                    "LIMIT ?", (limit * 4,)).fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []
    seen, out = set(), []
    for r in rows:
        u = r["official_url"]
        if u and u.startswith("http") and u not in seen:
            seen.add(u)
            out.append((u, r["subject_id"], r["source_name"]))
        if len(out) >= limit:
            break
    return out


def ingest_batch(limit: int = 20, *, host: str | None = None) -> dict:
    """Ingest a batch of reference documents from the catalogue into the baseline."""
    cands = _candidate_urls(limit, host)
    ingested, failed, samples = 0, 0, []
    for url, sid, src in cands:
        r = ingest_url(url, subject_id=sid, source_name=src)
        if r.get("stored"):
            ingested += 1
            if len(samples) < 8:
                samples.append({"title": r["title"][:70], "host": r["host"], "chars": r["chars"]})
        else:
            failed += 1
    return {"requested": len(cands), "ingested": ingested, "failed": failed, "samples": samples}


def _ocr_candidate_urls(limit: int) -> list[tuple[str, str, str]]:
    """(url, subject_id, source_name) from the OCR document candidates — the real
    document repositories (GovInfo, World Bank WDS, arXiv, Zenodo, Europeana, Trove…),
    which are the scanned PDFs / images that actually need OCR."""
    try:
        c = sqlite3.connect(_db_path()); c.row_factory = sqlite3.Row
        try:
            rows = c.execute(
                "SELECT source_url, subject_id, source_name FROM world_ocr "
                "WHERE source_url LIKE 'http%' LIMIT ?", (limit * 4,)).fetchall()
        finally:
            c.close()
    except Exception:  # noqa: BLE001
        return []
    seen, out = set(), []
    for r in rows:
        u = r["source_url"]
        if u and u not in seen:
            seen.add(u)
            out.append((u, r["subject_id"] or "", r["source_name"] or _host(u)))
        if len(out) >= limit:
            break
    return out


def ocr_batch(limit: int = 8) -> dict:
    """Fetch + OCR a batch of document candidates (scanned PDFs / images) into the
    searchable baseline — drives the OCR pipeline over the real document repositories.
    Best-effort; degrades cleanly when no OCR engine is installed. Never raises."""
    cands = _ocr_candidate_urls(limit)
    stored = ocr_n = 0
    samples: list[dict] = []
    for url, sid, src in cands:
        try:
            r = ingest_url(url, subject_id=sid, source_name=src)
        except Exception:  # noqa: BLE001
            continue
        if r.get("stored"):
            stored += 1
            if r.get("ocr"):
                ocr_n += 1
            if len(samples) < 6:
                samples.append({"title": r["title"][:60], "ocr": r.get("ocr"), "chars": r["chars"]})
    return {"requested": len(cands), "stored": stored, "ocr": ocr_n, "samples": samples}
