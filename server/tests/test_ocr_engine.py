"""OCR engine tests — fully OFFLINE / deterministic.

No network, no real Paddle/Tesseract/model: the engine seams
(``_paddle_ocr_image``, ``_tesseract_ocr_image``, ``_post_generate``) are
monkeypatched so the selection + dispatch logic is verified without heavy libs.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import pytest  # noqa: E402

from server.services import ocr_engine as oe  # noqa: E402


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for k in ("OCR_ENGINE", "OCR_LANG", "OCR_VISION_MODEL"):
        monkeypatch.delenv(k, raising=False)
    yield


def test_empty_input_graceful():
    r = oe.ocr_image_bytes(b"")
    assert r["ok"] is False and r["text"] == ""


def test_paddle_preferred_in_auto(monkeypatch):
    monkeypatch.setattr(oe, "_paddle_ocr_image", lambda b: "from paddle")
    monkeypatch.setattr(oe, "_tesseract_ocr_image", lambda b: "from tesseract")
    r = oe.ocr_image_bytes(b"\x89PNGfake")
    assert r["ok"] is True
    assert r["engine"] == "paddleocr"
    assert r["text"] == "from paddle"


def test_falls_back_to_tesseract(monkeypatch):
    monkeypatch.setattr(oe, "_paddle_ocr_image", lambda b: None)  # paddle absent
    monkeypatch.setattr(oe, "_tesseract_ocr_image", lambda b: "tess text")
    r = oe.ocr_image_bytes(b"img")
    assert r["ok"] is True and r["engine"] == "tesseract" and r["text"] == "tess text"


def test_engine_forced_tesseract(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "tesseract")
    monkeypatch.setattr(oe, "_paddle_ocr_image", lambda b: "paddle")  # must be ignored
    monkeypatch.setattr(oe, "_tesseract_ocr_image", lambda b: "only tess")
    r = oe.ocr_image_bytes(b"img")
    assert r["engine"] == "tesseract" and r["text"] == "only tess"


def test_vision_engine_via_seam(monkeypatch):
    monkeypatch.setenv("OCR_ENGINE", "vision")
    monkeypatch.setenv("OCR_VISION_MODEL", "fake-vision")
    monkeypatch.setattr(oe, "_post_generate", lambda payload, **kw: {"response": "vision said hi"})
    r = oe.ocr_image_bytes(b"img")
    assert r["ok"] is True and r["engine"] == "ollama-vision" and "vision said hi" in r["text"]


def test_no_engine_produces_text(monkeypatch):
    monkeypatch.setattr(oe, "_paddle_ocr_image", lambda b: None)
    monkeypatch.setattr(oe, "_tesseract_ocr_image", lambda b: None)
    monkeypatch.setattr(oe, "_vision_ocr_image", lambda b, **kw: None)
    r = oe.ocr_image_bytes(b"img")
    assert r["ok"] is False and "no OCR engine" in r["reason"]


def test_extract_pdf_text_garbage_degrades():
    r = oe.extract_pdf_text(b"not a pdf at all")
    assert r["ok"] is False  # never raises


def test_ocr_document_routes_image(monkeypatch):
    monkeypatch.setattr(oe, "_tesseract_ocr_image", lambda b: "img text")
    monkeypatch.setattr(oe, "_paddle_ocr_image", lambda b: None)
    r = oe.ocr_document(b"\x89PNG...", content_type="image/png", url="http://x/a.png")
    assert r["ok"] is True and r["text"] == "img text"


def test_ocr_document_unsupported():
    r = oe.ocr_document(b"<html>", content_type="text/html", url="http://x/p")
    assert r["ok"] is False


def test_available_shape():
    a = oe.available()
    for k in ("engine_selected", "paddleocr", "tesseract", "pypdf", "rasterizer"):
        assert k in a
