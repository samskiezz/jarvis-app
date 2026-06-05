"""Bulk-ingest the repository into the Second Brain as a real knowledge graph.

This builds a *genuine* second brain of this project — not synthetic filler:
  * one ``entity`` note per source file (the perception node for that file),
  * one ``concept`` note per top-level symbol (def / class / React component / const),
  * a ``note_link`` synapse for every resolved ``import`` between local files, plus
    a containment synapse from each symbol back to its file.

Records use the SAME deterministic id scheme as server/services/second_brain.py
(``uuid5(NAMESPACE_URL, "brain|{kind}|{title}")``) so they are first-class notes
the live /v1/brain API can read. Idempotent: re-running upserts the same rows.

Run:  python -m server.scripts.ingest_codebase
"""

from __future__ import annotations

import os
import re
import sqlite3
import time
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BRAIN_DB = os.environ.get("BRAIN_DB", os.path.join(ROOT, "server", "data", "brain.db"))

SRC_DIRS = ("src", "server")
EXTS = (".py", ".jsx", ".js", ".ts", ".tsx", ".md")
SKIP = ("__pycache__", "node_modules", ".git", "dist", "/data/", "/scripts/ingest_codebase")

# top-level symbol patterns per language family
RE_PY = re.compile(r"^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)", re.M)
RE_JS = re.compile(
    r"^(?:export\s+)?(?:default\s+)?(?:async\s+)?"
    r"(?:function\s+([A-Za-z_]\w*)|(?:const|let|class)\s+([A-Za-z_]\w*)\s*=)",
    re.M,
)
# local imports -> the file/module they point at
RE_IMP_JS = re.compile(r"""import\s+[^'"]*from\s+['"](@/[^'"]+|\.\.?/[^'"]+)['"]""")
RE_IMP_PY = re.compile(r"^\s*from\s+([.\w]+)\s+import", re.M)


def _id(kind: str, title: str) -> str:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"brain|{kind}|{title.strip().lower()}").hex


def iter_files() -> list[str]:
    out = []
    for d in SRC_DIRS:
        base = os.path.join(ROOT, d)
        for dirpath, _dirs, files in os.walk(base):
            if any(s in dirpath for s in SKIP):
                continue
            for f in files:
                if f.endswith(EXTS):
                    p = os.path.join(dirpath, f)
                    if not any(s in p for s in SKIP):
                        out.append(p)
    return out


def rel(p: str) -> str:
    return os.path.relpath(p, ROOT)


def summarize(text: str, path: str) -> str:
    """A real, compact summary: the module docstring or first non-trivial lines."""
    m = re.search(r'"""(.*?)"""', text, re.S) or re.search(r"/\*\*?(.*?)\*/", text, re.S)
    if m:
        doc = " ".join(m.group(1).split())[:280]
        if doc:
            return doc
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith(("//", "#", "*"))]
    return " ".join(lines[:3])[:280] or f"Source file {os.path.basename(path)}"


def main() -> None:
    files = iter_files()
    now = int(time.time() * 1000)
    notes: dict[str, tuple] = {}   # id -> row tuple
    links: set[tuple] = set()      # (src_id, dst_title, relation)

    # resolve helper: map a JS "@/x" or relative import, or py "a.b.c", to a file note title if we have it
    titles = {rel(p) for p in files}

    def resolve_js(spec: str, from_path: str) -> str | None:
        if spec.startswith("@/"):
            cand = os.path.join("src", spec[2:])
        else:
            cand = os.path.normpath(os.path.join(os.path.dirname(rel(from_path)), spec))
        for ext in ("", ".jsx", ".js", ".ts", ".tsx", "/index.jsx", "/index.js"):
            if cand + ext in titles:
                return cand + ext
        return None

    def add_note(kind: str, title: str, body: str, fm: dict, conf: float) -> str:
        nid = _id(kind, title)
        notes[nid] = (nid, kind, title, _dumps(fm), body, conf, now, now, now)
        return nid

    def _dumps(d: dict) -> str:
        import json
        return json.dumps(d, separators=(",", ":"))

    for p in files:
        try:
            text = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        rp = rel(p)
        kind_file = "entity"
        fm = {"path": rp, "lines": text.count("\n") + 1, "ext": os.path.splitext(p)[1]}
        add_note(kind_file, rp, summarize(text, p), fm, 1.0)
        file_title = rp

        # symbols -> concept notes + containment synapse
        syms = set()
        if p.endswith(".py"):
            syms = {m.group(1) for m in RE_PY.finditer(text)}
        elif p.endswith((".jsx", ".js", ".ts", ".tsx")):
            for m in RE_JS.finditer(text):
                syms.add(m.group(1) or m.group(2))
        for s in filter(None, syms):
            stitle = f"{rp}::{s}"
            sid = add_note("concept", stitle, f"Symbol [[{file_title}]] · {s}", {"file": rp, "symbol": s}, 0.9)
            links.add((sid, file_title, "DEFINED_IN"))

        # imports -> synapses between files
        if p.endswith((".jsx", ".js", ".ts", ".tsx")):
            for m in RE_IMP_JS.finditer(text):
                tgt = resolve_js(m.group(1), p)
                if tgt and tgt != file_title:
                    links.add((_id(kind_file, file_title), tgt, "IMPORTS"))
        elif p.endswith(".py"):
            for m in RE_IMP_PY.finditer(text):
                mod = m.group(1).lstrip(".").replace(".", "/")
                for cand in (f"server/{mod}.py", f"{mod}.py"):
                    if cand in titles and cand != file_title:
                        links.add((_id(kind_file, file_title), cand, "IMPORTS"))

    # bulk write
    conn = sqlite3.connect(BRAIN_DB)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executemany(
            """INSERT INTO note (id,kind,title,frontmatter_json,body_md,confidence,created_ts,learned_ts,updated_ts)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET body_md=excluded.body_md, updated_ts=excluded.updated_ts""",
            list(notes.values()),
        )
        # resolve dst_id where the destination title is a known note
        rows = []
        for src_id, dst_title, reln in links:
            did = _id("entity", dst_title) if dst_title in titles else None
            rows.append((src_id, dst_title, did, reln))
        conn.executemany(
            """INSERT OR IGNORE INTO note_link (src_id,dst_title,dst_id,relation) VALUES (?,?,?,?)""",
            rows,
        )
        conn.commit()
        n = conn.execute("SELECT COUNT(*) FROM note").fetchone()[0]
        l = conn.execute("SELECT COUNT(*) FROM note_link").fetchone()[0]
        kinds = conn.execute("SELECT COUNT(DISTINCT kind) FROM note").fetchone()[0]
        print(f"ingested files={len(files)} notes(neurons)={n} clusters(kinds)={kinds} links(synapses)={l}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
