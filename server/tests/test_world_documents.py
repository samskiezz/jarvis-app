"""Baseline document ingestion: HTML text extraction + governed store (mocked fetch)."""
from server.services import world_documents as wd, second_brain as sb

HTML = ("<html><head><title>OGC API Features</title></head><body>"
        "<script>var x=1;</script><h1>Standard</h1>"
        "<p>This document specifies the OGC API Features standard for geospatial data.</p>"
        "<style>.a{}</style></body></html>")

def test_extract_text_strips_scripts_and_gets_title():
    title, text = wd.extract_text(HTML)
    assert title == "OGC API Features"
    assert "OGC API Features standard" in text and "var x=1" not in text and ".a{}" not in text

def test_ingest_url_stores_searchable_document(tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_DB", str(tmp_path/"docs.db"))
    monkeypatch.setattr(wd.nr, "polite_get",
                        lambda url, **k: {"ok": True, "body": HTML, "json": None,
                                          "from_cache": False, "status": 200, "error": None})
    r = wd.ingest_url("https://www.ogc.org/standard/ogcapi-features", subject_id="SUBJ-1", source_name="OGC")
    assert r["ok"] and r["stored"] and r["title"] == "OGC API Features" and r["chars"] > 0
    note = sb.get_note("OGC API Features")
    assert note is not None and note["frontmatter"].get("doc") is True
    assert "ogcapi-features" in note["frontmatter"].get("url", "")
