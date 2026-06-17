"""REPO + INFRA KNOWLEDGE GRAPH — the Nexus-style whole-system map.

Produces a single JSON graph that the Palantir-style UI renders:

  NODES
    * file: every .py / .html / .js / .ts / .md in the repo (skipping vendored dirs)
    * func: top-level def / class in .py
    * mem:  each entry in ~/.claude/projects/-opt-jarvis-app-1/memory/
    * svc:  every pm2-managed service
    * port: every TCP port a service binds
    * vast: every Vast.ai instance ever recorded in server/data/vast_events.jsonl
    * model: every Ollama model on the brain + local CPU

  EDGES
    * imports:   file -> file  (Python import resolution; conservative)
    * contains:  file -> func  (a function lives in a file)
    * binds:     svc -> port
    * runs_at:   model -> port (the Ollama endpoint serving it)
    * mentions:  mem -> mem    ([[wiki-link]] in memory body)
    * spawned:   svc -> vast   (best-effort label match)

Doctrine: stdlib only, never raises on bad input, cached so /graph/everything
is fast (~10 ms warm). Truncate large per-file scans rather than blocking.
"""
from __future__ import annotations

import ast
import json
import os
import re
import subprocess
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MEM_DIR = "/root/.claude/projects/-opt-jarvis-app-1/memory"
EVENTS_PATH = os.path.join(ROOT, "server", "data", "vast_events.jsonl")
# EXTRA_ROOTS — walk EVERY directory the owner cares about, not just the app tree. Includes /opt
# (kgik, openclaw-bridge, solarflow, supabase, apex-venv, …), /etc (system config), and /root.
_BASE_ROOTS = (
    "/opt/jarvis-app-1/underworld",
    "/opt/kgik", "/opt/openclaw-bridge", "/opt/openai-venv", "/opt/apex-venv",
    "/opt/solar-flow2", "/opt/solarflow", "/opt/solarflowminoinworldlloader",
    "/opt/supabase", "/opt/jarvis-backups",
    "/etc",
    "/root/.claude", "/root/.pm2", "/root/.config", "/root/.local/share", "/root/.local/bin",
    "/root/.ssh",
)
# Owner rule: never modify or touch /opt/UnrealEngine — only READ as graph nodes. The walk over 175K
# engine source files is the dominant cost (~30 min). Opt in via REPO_GRAPH_INCLUDE_UE=1 for the deep
# index; default off so the build lands fast (~30s) for routine refreshes.
EXTRA_ROOTS = _BASE_ROOTS + (("/opt/UnrealEngine",) if os.environ.get(
    "REPO_GRAPH_INCLUDE_UE", "0") in ("1", "true", "yes") else ())
# Only the truly-derived dirs are skipped — Python's parser cache, git pack data, vendored deps. Every
# DOCUMENT (.pdf, .docx, .xlsx, .md, .txt, .csv, .log) and every BINARY (.glb, .obj, .png, .jpg, .mp4)
# IS indexed as a node — owner explicitly asked for it.
EXCLUDE_DIRS = {
    "__pycache__", ".cache", "objects", "pack",  # .git/objects/pack contains opaque blobs
}
# CODE_EXTS only steers which files get DEEP parsing (funcs/syms/imports). The walker itself indexes
# every file regardless of extension — that's what makes the graph reach into documents + media.
CODE_EXTS = (".py", ".html", ".js", ".ts", ".tsx", ".jsx", ".md", ".cpp", ".c", ".h",
             ".cs", ".cmake", ".sh", ".sql", ".json", ".yaml", ".yml", ".toml", ".cfg",
             ".ini", ".uasset", ".umap")
MAX_FILES = int(os.environ.get("REPO_GRAPH_MAX_FILES", "5000000"))
LOC_PER_FILE_CAP = int(os.environ.get("REPO_GRAPH_LOC_PER_FILE", "200"))
_DISK_CACHE = os.environ.get("REPO_GRAPH_DISK_CACHE",
                             "/opt/jarvis-app-1/server/data/repo_graph_cache.json")
_CACHE: dict[str, Any] = {"ts": 0.0, "data": None}
_CACHE_TTL_S = float(os.environ.get("REPO_GRAPH_TTL_S", "300"))


def _walk_repo():
    """Yield (path, rel, ext, size) for EVERY file under the repo + UE5 project + engine + /opt sub-apps
    + /etc + /root config. NO extension filter — documents (.pdf/.docx/.xlsx), images (.png/.glb),
    media (.mp4/.mp3), logs, csv, xml are ALL indexed as nodes. Owner rule: everything. Cap at
    MAX_FILES (5M default) only as a safety stop."""
    count = 0
    seen: set[str] = set()
    roots = [ROOT] + list(EXTRA_ROOTS)
    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
            dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                # Cheap symlink-loop / dedup guard.
                if p in seen:
                    continue
                seen.add(p)
                try:
                    st = os.lstat(p)
                    if not (st.st_mode & 0o170000) == 0o100000:    # regular file only
                        continue
                    sz = st.st_size
                except OSError:
                    continue
                rel = os.path.relpath(p, ROOT) if p.startswith(ROOT) else p
                yield (p, rel, os.path.splitext(fn)[1].lower(), sz)
                count += 1
                if count >= MAX_FILES:
                    return


_IMPORT_RE = re.compile(r"^\s*(?:from\s+(\.{0,3}[\w.]*)\s+import|import\s+(\.{0,3}[\w.]+))", re.M)
_JS_FUNC_RE = re.compile(r"(?:^|\W)(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|class\s+(\w+))")
_CPP_SYM_RE = re.compile(r"^\s*(?:[A-Z][\w<>:&*\s]+\s+)?([A-Z]\w*)::([\w~]+)\s*\(", re.M)


def _js_funcs(path: str) -> list[str]:
    """Cheap regex pass for JS/TS/HTML script blocks — names of functions/classes/arrow-fns."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read(80_000)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for m in _JS_FUNC_RE.finditer(src):
        name = m.group(1) or m.group(2) or m.group(3)
        if name and name not in ("if", "for", "while", "switch", "return"):
            out.append(name)
    return out[:600]


def _cpp_syms(path: str) -> list[tuple[str, str]]:
    """Cheap regex pass for C++ ClassName::Method definitions in .cpp/.h files."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read(80_000)
    except Exception:  # noqa: BLE001
        return []
    return [(m.group(1), m.group(2)) for m in _CPP_SYM_RE.finditer(src)][:400]


def _pkg_manifest(path: str, rel: str) -> list[tuple[str, str]]:
    """Names of dependencies declared in package.json or requirements.txt-style files."""
    out = []
    base = os.path.basename(rel).lower()
    try:
        if base == "package.json" or base.endswith(".json") and "package" in base:
            with open(path, encoding="utf-8", errors="replace") as fh:
                data = json.loads(fh.read(200_000) or "{}")
            for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                for k, v in (data.get(section) or {}).items():
                    out.append((f"npm:{k}", str(v)))
        elif base in ("requirements.txt", "requirements-dev.txt") or base.startswith("requirements"):
            with open(path, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        out.append((f"pip:{line.split('==')[0].split('>=')[0].split('<')[0].strip()}", line))
    except Exception:  # noqa: BLE001
        pass
    return out


def _py_imports(path: str) -> list[str]:
    """Top-level imports in a .py file (cheap regex; we don't need AST precision for the graph)."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            src = fh.read(40_000)        # cap each file at 40KB for the scan
    except Exception:  # noqa: BLE001
        return []
    out = []
    for m in _IMPORT_RE.finditer(src):
        mod = (m.group(1) or m.group(2) or "").strip(".")
        if mod:
            out.append(mod)
    return out


def _py_funcs(path: str) -> list[tuple[str, int]]:
    """Top-level + nested function/class names in a .py file. Owner rule: surface EVERYTHING — internal
    underscore-prefixed helpers included. No per-file cap beyond what ast.parse can hold."""
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            tree = ast.parse(fh.read(120_000), filename=path)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            out.append((node.name, node.lineno))
    return out


def _pm2_services() -> list[dict]:
    """Live snapshot of pm2 services + their bound ports (cheap; ~50 ms)."""
    try:
        out = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=4)
        if out.returncode != 0:
            return []
        procs = json.loads(out.stdout or "[]")
    except Exception:  # noqa: BLE001
        return []
    svcs = []
    for p in procs:
        env = p.get("pm2_env") or {}
        svcs.append({
            "name": p.get("name"),
            "status": env.get("status"),
            "pid": env.get("pid"),
            "exec": env.get("pm_exec_path", "")[-60:],
            "uptime_ms": env.get("pm_uptime"),
            "restarts": env.get("restart_time", 0),
            "memory": (p.get("monit") or {}).get("memory"),
            "cpu": (p.get("monit") or {}).get("cpu"),
        })
    return svcs


def _listen_ports() -> list[dict]:
    """Every TCP port currently bound on the box → (port, pid, process)."""
    try:
        out = subprocess.run(["ss", "-ltnp"], capture_output=True, text=True, timeout=3)
    except Exception:  # noqa: BLE001
        return []
    ports = []
    for line in (out.stdout or "").splitlines()[1:]:
        m = re.search(r":(\d+)\s+.*users:\(\(\"([^\"]+)\",pid=(\d+)", line)
        if m:
            ports.append({"port": int(m.group(1)), "proc": m.group(2), "pid": int(m.group(3))})
    return ports


def _vast_events(limit: int = 200) -> list[dict]:
    """Recent Vast lifecycle events written by scripts/vast_kill_switch.py."""
    if not os.path.exists(EVENTS_PATH):
        return []
    events = []
    try:
        with open(EVENTS_PATH, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except Exception:  # noqa: BLE001
                    continue
    except Exception:  # noqa: BLE001
        return []
    return events[-limit:]


def _memory_entries() -> list[dict]:
    """Memory entries + their [[wiki-link]] mentions for the mem→mem edges."""
    if not os.path.isdir(MEM_DIR):
        return []
    out = []
    link_re = re.compile(r"\[\[([a-z0-9-]+)\]\]")
    for fn in sorted(os.listdir(MEM_DIR)):
        if not fn.endswith(".md") or fn == "MEMORY.md":
            continue
        path = os.path.join(MEM_DIR, fn)
        try:
            with open(path, encoding="utf-8") as fh:
                body = fh.read(20_000)
        except Exception:  # noqa: BLE001
            continue
        name = os.path.splitext(fn)[0]
        out.append({
            "name": name,
            "size": os.path.getsize(path),
            "mentions": sorted(set(link_re.findall(body))),
            "title": body.split("\n", 1)[0][:120],
        })
    return out


def _brain_models() -> list[dict]:
    """Live model list from the GPU brain + local CPU Ollamas (best-effort, 2s timeout each)."""
    import urllib.request
    out = []
    for label, base in (("gpu", "http://127.0.0.1:11434"), ("cpu", "http://127.0.0.1:11435")):
        try:
            with urllib.request.urlopen(base + "/api/tags", timeout=2) as r:
                d = json.loads(r.read().decode())
            for m in d.get("models", []) or []:
                out.append({
                    "name": m.get("name"),
                    "size_gb": round((m.get("size") or 0) / 1e9, 2),
                    "host": label,
                    "params": (m.get("details") or {}).get("parameter_size", "?"),
                })
        except Exception:  # noqa: BLE001
            continue
    return out


def build_graph() -> dict:
    """Composite graph: codebase + pm2 + ports + Vast lifecycle + Ollama + memory."""
    nodes: list[dict] = []
    edges: list[dict] = []
    file_index: dict[str, str] = {}                # rel_path → node_id

    # FILES + FUNCS
    for p, rel, ext, sz in _walk_repo():
        fid = f"file:{rel}"
        file_index[rel] = fid
        nodes.append({
            "id": fid, "kind": "file", "label": os.path.basename(rel), "path": rel,
            "ext": ext, "size_b": sz,
        })
        if ext == ".py":
            for fname, lineno in _py_funcs(p):
                func_id = f"func:{rel}:{fname}:{lineno}"
                nodes.append({"id": func_id, "kind": "func", "label": fname,
                              "path": rel, "line": lineno})
                edges.append({"src": fid, "dst": func_id, "kind": "contains"})
            for mod in _py_imports(p):
                cand = mod.replace(".", "/")
                for ext_try in (".py", "/__init__.py"):
                    rel_try = cand + ext_try
                    if rel_try in file_index:
                        edges.append({"src": fid, "dst": file_index[rel_try], "kind": "imports"})
                        break
        elif ext in (".js", ".ts", ".tsx", ".jsx", ".html"):
            for fname in _js_funcs(p):
                fnid = f"jsfn:{rel}:{fname}"
                nodes.append({"id": fnid, "kind": "jsfn", "label": fname, "path": rel})
                edges.append({"src": fid, "dst": fnid, "kind": "contains"})
        elif ext in (".cpp", ".c", ".h"):
            # Only deep-parse C++ in the owner's project tree — NOT in /opt/UnrealEngine's engine
            # source (the 17-minute build was the engine's hundreds of thousands of .h/.cpp). Engine
            # files still appear as file nodes; we just don't extract their Class::method symbols.
            if not p.startswith("/opt/UnrealEngine"):
                for cls, meth in _cpp_syms(p):
                    sid = f"cppsym:{rel}:{cls}::{meth}"
                    nodes.append({"id": sid, "kind": "cppsym", "label": f"{cls}::{meth}", "path": rel})
                    edges.append({"src": fid, "dst": sid, "kind": "contains"})
        # Package manifests: every npm/pip dependency becomes a node + edge
        for pkg_id, ver in _pkg_manifest(p, rel):
            if not any(n["id"] == pkg_id for n in nodes):
                nodes.append({"id": pkg_id, "kind": "pkg", "label": pkg_id.split(":", 1)[1],
                              "ecosystem": pkg_id.split(":", 1)[0], "version": ver})
            edges.append({"src": fid, "dst": pkg_id, "kind": "depends_on"})
        # Lines of code — every non-empty line in every text-shaped file becomes a node. This is what
        # pushes the graph past millions, as owner asked. Capped per-file by env to keep memory bounded.
        if LOC_PER_FILE_CAP > 0 and ext in (".py", ".html", ".js", ".ts", ".tsx", ".jsx", ".md",
                ".cpp", ".c", ".h", ".cs", ".sh", ".sql", ".json", ".yaml", ".yml", ".toml",
                ".cfg", ".ini", ".txt", ".csv", ".log", ".xml") and not p.startswith("/opt/UnrealEngine"):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    for i, line in enumerate(fh, 1):
                        if i > LOC_PER_FILE_CAP:
                            break
                        if not line.strip():
                            continue
                        lid = f"loc:{rel}:{i}"
                        nodes.append({"id": lid, "kind": "loc", "label": str(i),
                                      "path": rel, "preview": line.rstrip("\n")[:140]})
                        edges.append({"src": fid, "dst": lid, "kind": "has_line"})
            except Exception:  # noqa: BLE001
                pass

    # PM2 SERVICES + PORTS
    pid_to_svc: dict[int, dict] = {}
    for s in _pm2_services():
        sid = f"svc:{s['name']}"
        nodes.append({"id": sid, "kind": "svc", "label": s["name"], "status": s.get("status"),
                      "restarts": s.get("restarts"), "memory": s.get("memory"), "cpu": s.get("cpu"),
                      "exec": s.get("exec")})
        if s.get("pid"):
            pid_to_svc[int(s["pid"])] = s
    for pr in _listen_ports():
        pid = f"port:{pr['port']}"
        if not any(n["id"] == pid for n in nodes):
            nodes.append({"id": pid, "kind": "port", "label": str(pr["port"]),
                          "proc": pr["proc"]})
        svc = pid_to_svc.get(pr["pid"])
        if svc:
            edges.append({"src": f"svc:{svc['name']}", "dst": pid, "kind": "binds"})

    # VAST INSTANCES (lifecycle history)
    seen_vast: set[str] = set()
    for ev in _vast_events():
        iid = str(ev.get("id") or "")
        if not iid or iid in seen_vast:
            continue
        seen_vast.add(iid)
        nodes.append({
            "id": f"vast:{iid}", "kind": "vast", "label": ev.get("label") or iid,
            "gpu": ev.get("gpu_name"), "dph": ev.get("dph_total"),
            "lifetime_s": ev.get("lifetime_s"),
            "status": "live" if ev.get("kind") == "first_seen" else (ev.get("kind") or "?"),
        })

    # OLLAMA MODELS on GPU brain + local CPU
    for m in _brain_models():
        mid = f"model:{m['host']}:{m['name']}"
        nodes.append({"id": mid, "kind": "model", "label": m["name"], "host": m["host"],
                      "params": m["params"], "size_gb": m["size_gb"]})
        port = 11434 if m["host"] == "gpu" else 11435
        port_id = f"port:{port}"
        if not any(n["id"] == port_id for n in nodes):
            nodes.append({"id": port_id, "kind": "port", "label": str(port), "proc": "ollama"})
        edges.append({"src": mid, "dst": port_id, "kind": "runs_at"})

    # SQLITE TABLES + COLUMNS — every .db / .sqlite under the repo, schema surfaced
    for p, rel, ext, _sz in _walk_repo():
        if ext not in (".db", ".sqlite", ".sqlite3"):
            continue
        try:
            import sqlite3
            con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=2)
            tables = con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            db_id = f"db:{rel}"
            nodes.append({"id": db_id, "kind": "db", "label": os.path.basename(rel), "path": rel})
            for (tname,) in tables:
                tid = f"tbl:{rel}:{tname}"
                nodes.append({"id": tid, "kind": "tbl", "label": tname, "db": rel})
                edges.append({"src": db_id, "dst": tid, "kind": "has_table"})
                try:
                    rowct = con.execute(f"SELECT COUNT(*) FROM \"{tname}\"").fetchone()[0]
                except Exception:  # noqa: BLE001
                    rowct = -1
                nodes[-1]["row_count"] = rowct
            con.close()
        except Exception:  # noqa: BLE001
            continue

    # ENV VARS (sanitised — only names + lengths, never values, for any *.env* file in the repo)
    for p, rel, ext, _sz in _walk_repo():
        base = os.path.basename(rel)
        if not (base.startswith(".env") or base.endswith(".env") or base in ("env.example",)):
            continue
        env_id = f"env:{rel}"
        nodes.append({"id": env_id, "kind": "envfile", "label": base, "path": rel})
        try:
            with open(p, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    name = line.split("=", 1)[0].strip()
                    if not name or any(c in name for c in " \t'\""):
                        continue
                    vid = f"envvar:{rel}:{name}"
                    nodes.append({"id": vid, "kind": "envvar", "label": name, "envfile": rel})
                    edges.append({"src": env_id, "dst": vid, "kind": "declares"})
        except Exception:  # noqa: BLE001
            continue

    # GIT COMMITS — every commit in the repo + every git ref (branches/tags). Bounded by env
    # REPO_GRAPH_MAX_COMMITS (default 50000; raises to whatever the repo has).
    try:
        max_commits = int(os.environ.get("REPO_GRAPH_MAX_COMMITS", "50000"))
        cp = subprocess.run(
            ["git", "-C", ROOT, "log", f"-n{max_commits}", "--all", "--pretty=%H%x09%an%x09%at%x09%s"],
            capture_output=True, text=True, timeout=30,
        )
        for line in (cp.stdout or "").splitlines():
            parts = line.split("\t", 3)
            if len(parts) < 4:
                continue
            sha, author, ats, subj = parts
            nodes.append({"id": f"commit:{sha[:12]}", "kind": "commit", "label": sha[:8],
                          "author": author, "ts": ats, "subject": subj[:160]})
    except Exception:  # noqa: BLE001
        pass

    # GIT REFS
    try:
        cp = subprocess.run(["git", "-C", ROOT, "for-each-ref", "--format=%(refname)%x09%(objectname)"],
                            capture_output=True, text=True, timeout=8)
        for line in (cp.stdout or "").splitlines():
            ref, sha = (line.split("\t", 1) + [""])[:2]
            if not ref:
                continue
            nodes.append({"id": f"gitref:{ref}", "kind": "gitref", "label": ref, "sha": sha[:12]})
            if sha:
                edges.append({"src": f"gitref:{ref}", "dst": f"commit:{sha[:12]}", "kind": "points_to"})
    except Exception:  # noqa: BLE001
        pass

    # PIP SITE-PACKAGES from the project's venvs — every installed wheel becomes a node
    for venv in (".venv", ".venv-tts", ".venv-clip"):
        sp = os.path.join(ROOT, venv, "lib")
        if not os.path.isdir(sp):
            continue
        try:
            for py_ver in os.listdir(sp):
                pkgs_dir = os.path.join(sp, py_ver, "site-packages")
                if not os.path.isdir(pkgs_dir):
                    continue
                for name in os.listdir(pkgs_dir):
                    if name.endswith(".dist-info") or name.endswith(".egg-info"):
                        pkg_name = name.split("-")[0]
                        nid = f"installed:{venv}:{pkg_name}"
                        if not any(n["id"] == nid for n in nodes):
                            nodes.append({"id": nid, "kind": "installed",
                                          "label": pkg_name, "venv": venv})
        except Exception:  # noqa: BLE001
            continue

    # WASABI CLOUD MANIFEST — every file the storage router uploaded to Wasabi
    try:
        import sqlite3
        manifest = os.path.join(ROOT, "server", "data", "cloud_manifest.db")
        if os.path.exists(manifest):
            con = sqlite3.connect(f"file:{manifest}?mode=ro", uri=True, timeout=3)
            cap = int(os.environ.get("REPO_GRAPH_MAX_WASABI", "20000"))
            for row in con.execute(f"SELECT original_path, bucket, key, size FROM uploads LIMIT {cap}"):
                op, bucket, key, sz = row
                nodes.append({"id": f"wasabi:{bucket}:{key}", "kind": "wasabi",
                              "label": (key or "").split("/")[-1], "bucket": bucket,
                              "key": key, "size_b": sz, "from": op})
                local_id = f"file:{op}"
                if any(n["id"] == local_id for n in nodes):
                    edges.append({"src": local_id, "dst": f"wasabi:{bucket}:{key}",
                                  "kind": "synced_to"})
            con.close()
    except Exception:  # noqa: BLE001
        pass

    # DB ROW SAMPLING — surface actual rows (capped) so the graph isn't just empty table nodes
    try:
        import sqlite3
        max_rows = int(os.environ.get("REPO_GRAPH_MAX_ROWS_PER_TABLE", "200"))
        for n in list(nodes):
            if n.get("kind") != "tbl":
                continue
            db_rel = n.get("db") or ""
            db_path = os.path.join(ROOT, db_rel) if not db_rel.startswith("/") else db_rel
            if not os.path.exists(db_path):
                continue
            con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=2)
            try:
                tname = n["label"]
                rows = con.execute(
                    f"SELECT rowid, * FROM \"{tname}\" LIMIT {max_rows}"
                ).fetchall()
                for r in rows:
                    rid = f"row:{db_rel}:{tname}:{r[0]}"
                    nodes.append({"id": rid, "kind": "row", "label": f"#{r[0]}",
                                  "table": tname, "preview": str(r[1:5])[:140]})
                    edges.append({"src": n["id"], "dst": rid, "kind": "row_of"})
            except Exception:  # noqa: BLE001
                pass
            con.close()
    except Exception:  # noqa: BLE001
        pass

    # MEMORY ENTRIES + LINKS
    mem_ids: dict[str, str] = {}
    for m in _memory_entries():
        nid = f"mem:{m['name']}"
        mem_ids[m["name"]] = nid
        nodes.append({"id": nid, "kind": "mem", "label": m["name"], "title": m["title"],
                      "size_b": m["size"]})
    for m in _memory_entries():
        src = f"mem:{m['name']}"
        for target in m["mentions"]:
            if target in mem_ids:
                edges.append({"src": src, "dst": mem_ids[target], "kind": "mentions"})

    # Per-kind counts (everything that exists in the node list — no hard-coded omissions).
    from collections import Counter as _Counter
    kind_counts = dict(_Counter(n["kind"] for n in nodes))
    return {
        "generated_at": time.time(),
        "stats": {"nodes": len(nodes), "edges": len(edges), **kind_counts},
        "nodes": nodes,
        "edges": edges,
    }


def _load_disk_cache() -> dict | None:
    """Read the disk cache populated by the most recent successful build. Lets a freshly-restarted
    dashboard serve /graph/everything instantly from the last known graph instead of paying a multi-
    minute rebuild on every restart."""
    try:
        with open(_DISK_CACHE, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict) and "stats" in data:
            return data
    except Exception:  # noqa: BLE001
        pass
    return None


def _save_disk_cache(data: dict) -> None:
    try:
        os.makedirs(os.path.dirname(_DISK_CACHE), exist_ok=True)
        tmp = _DISK_CACHE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(data, fh)
        os.replace(tmp, _DISK_CACHE)
    except Exception:  # noqa: BLE001
        pass


def get_graph(force: bool = False) -> dict:
    """Cache with two layers — in-memory (TTL=5min) for fast polling, and on-disk for surviving
    dashboard restarts. force=True bypasses both and rebuilds from scratch."""
    now = time.time()
    if not force:
        if _CACHE["data"] is not None and (now - _CACHE["ts"]) < _CACHE_TTL_S:
            return _CACHE["data"]
        disk = _load_disk_cache()
        if disk is not None:
            _CACHE["ts"] = now
            _CACHE["data"] = disk
            return disk
    data = build_graph()
    _CACHE["ts"] = now
    _CACHE["data"] = data
    _save_disk_cache(data)
    return data
