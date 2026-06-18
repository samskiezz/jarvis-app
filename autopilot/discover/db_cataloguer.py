"""Catalogues every SQLite DB: path, size, mtime, tables, row counts, writer."""
from __future__ import annotations

import json
import os
import re
import sqlite3
import subprocess
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _find_dbs() -> list[str]:
    out: list[str] = []
    for r, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in (
            "__pycache__", "node_modules", ".venv", ".venv-tts",
            "vendor", "dist", "build"
        )]
        for f in files:
            if f.endswith((".db", ".sqlite", ".sqlite3")) and not any(
                f.endswith(x) for x in ("-shm", "-wal")
            ):
                out.append(os.path.join(r, f))
    return sorted(out)


def _list_tables(path: str) -> list[dict[str, Any]]:
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=2)
        cur = con.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [r[0] for r in cur.fetchall()]
        out: list[dict[str, Any]] = []
        for t in tables[:50]:  # cap at 50
            try:
                cur.execute(f"SELECT count(*) FROM '{t}'")
                rows = cur.fetchone()[0]
            except sqlite3.Error:
                rows = -1
            out.append({"table": t, "rows": rows})
        con.close()
        return out
    except sqlite3.Error:
        return []


def _writer_module(db_path: str) -> str | None:
    """Grep for the basename to find which Python module opens it for write."""
    fname = os.path.basename(db_path)
    try:
        r = subprocess.run(
            ["grep", "-rl", "--include=*.py", "--exclude-dir=.venv",
             "--exclude-dir=.venv-tts", "--exclude-dir=node_modules",
             "--exclude-dir=vendor", fname, ROOT],
            capture_output=True, text=True, timeout=15,
        )
        if r.returncode != 0:
            return None
        # Prefer the first non-test, non-script writer
        for line in r.stdout.strip().splitlines()[:10]:
            if "tests/" in line or "autopilot/" in line:
                continue
            return os.path.relpath(line, ROOT)
    except (subprocess.SubprocessError, OSError):
        return None
    return None


def catalogue() -> dict[str, Any]:
    now = time.time()
    dbs = _find_dbs()
    out: dict[str, Any] = {"generated_at": now, "n_dbs": len(dbs), "dbs": [], "total_size_bytes": 0}
    for path in dbs:
        try:
            st = os.stat(path)
        except OSError:
            continue
        size = st.st_size
        out["total_size_bytes"] += size
        tables = _list_tables(path)
        writer = _writer_module(path)
        rel = os.path.relpath(path, ROOT)
        out["dbs"].append({
            "path": rel,
            "size_bytes": size,
            "size_mb": round(size / (1024 * 1024), 1),
            "mtime": st.st_mtime,
            "age_days": round((now - st.st_mtime) / 86400.0, 1),
            "n_tables": len(tables),
            "tables_sample": tables[:8],
            "writer_module": writer,
        })
    out["dbs"].sort(key=lambda d: -d["size_bytes"])
    return out


def write_outputs(intel_dir: str) -> None:
    out = catalogue()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "db-catalogue.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    total_mb = round(out["total_size_bytes"] / (1024 * 1024), 1)
    lines = [
        "# Database Catalogue",
        "",
        f"**Generated**: {int(out['generated_at'])}",
        f"**Total**: {out['n_dbs']} databases, {total_mb} MB",
        "",
        "## Top 30 by size",
        "| Path | MB | Tables | Age (d) | Writer |",
        "|---|---|---|---|---|",
    ]
    for d in out["dbs"][:30]:
        lines.append(
            f"| `{d['path']}` | {d['size_mb']} | {d['n_tables']} | "
            f"{d['age_days']} | {d['writer_module'] or '—'} |"
        )
    with open(os.path.join(intel_dir, "db-catalogue.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"db-catalogue written to {intel}")
