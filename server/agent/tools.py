"""Agent OS — tool registry + ALL real handlers (the TOOLS catalog).

A Tool is a typed, risk-classified capability the agent can call. Every handler
in this module runs a *real* command or HTTP/sqlite call and returns *real* data
— there are no placeholder/stub handlers. Importing this module registers the
full catalog (see CATALOG_IDS) on the in-process registry.

Catalog (17 tools, id -> what it really does):
    server.disk.audit       df -h /opt + du -sh of repo children (host free/used + biggest dirs)
    server.cpu.inspect      /proc/loadavg + os.cpu_count() + ps top processes
    server.logs.read        pm2 logs <service> --nostream --lines N (read-only)
    docker.usage.inspect    docker system df + docker ps -q / -aq counts
    docker.prune.safe       docker system df then docker system prune -f   [system_change]
    storage.large_files.find  find -xdev -type f -size +Nc -printf | sort | head
    storage.duplicates.find   size-grouped + head/tail sha256 sampled dup groups
    storage.folder.compress   tar | zstd -19 (gzip fallback) -> repo archive
    storage.manifest.create   os.walk + per-file sha256 -> JSON manifest
    storage.restore           extract archive OR manifest-verify sha256   [destructive]
    gpu.status.inspect        box Ollama /api/ps + /api/tags (real VRAM + models)
    file.search             rg (grep -rnI fallback) literal search over the repo
    file.read               read a real file inside the repo (sandboxed)
    file.write              write a real file inside the repo (safe_write, sandboxed)
    agent.memory.search     memory.search() over server/data/agent_memory.db
    agent.memory.write      memory.write() into server/data/agent_memory.db
    knowledge.stats         RO sqlite over server/data/brain.db (real knowledge counts)

`ctx` (from jobs._JobCtx or _SimpleCtx) exposes ctx.progress(pct,msg),
ctx.log(msg), ctx.cancelled. tools.call(id, args, ctx) validates args against the
tool's JSON-ish input_schema, emits tool.started/completed/failed when called
directly (jobs.run emits its own), and returns the handler's result.

Hard constraints honored: files live only under server/agent/; sqlite DBs under
server/data/; no pm2 start/stop/restart (only read-only pm2 logs --nostream);
no edits to dashboard.py / jarvis_voice.html; importing starts no server.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sqlite3
import subprocess
import threading
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

try:  # package import (normal)
    from . import memory as _memory
    from .events import BUS
except Exception:  # pragma: no cover — allow `python server/agent/tools.py`
    import memory as _memory  # type: ignore
    from events import BUS  # type: ignore

# server/agent/tools.py -> repo root is three dirs up.
_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPO_ROOT = _ROOT
BRAIN_DB = os.path.join(_ROOT, "server", "data", "brain.db")

# Storage tools are sandboxed to this root (the box's app/data tree).
STORAGE_ROOT = "/opt"

# Box LLM / Ollama host — same default the dashboard uses.
BOX = (os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434").rstrip("/")


# --------------------------------------------------------------------------- #
# Tool dataclass + registry
# --------------------------------------------------------------------------- #
@dataclass
class Tool:
    id: str
    name: str
    description: str
    input_schema: Dict[str, Any]
    risk: str
    timeout: int
    handler: Callable[[Dict[str, Any], Any], Any]
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        # UI-renderable view (no handler).
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "risk": self.risk,
            "timeout": self.timeout,
            "tags": self.tags,
        }


_REGISTRY: Dict[str, Tool] = {}
_REG_LOCK = threading.RLock()


def register(tool: Tool) -> Tool:
    """Register (or replace) a tool by id. Returns the tool."""
    with _REG_LOCK:
        _REGISTRY[tool.id] = tool
    return tool


def all() -> List[Dict[str, Any]]:  # noqa: A001 — matches the spec'd public name
    """UI renders the palette from this — list of tool dicts (sorted by id)."""
    with _REG_LOCK:
        return [t.to_dict() for t in sorted(_REGISTRY.values(), key=lambda t: t.id)]


def get(tool_id: str) -> Optional[Tool]:
    with _REG_LOCK:
        return _REGISTRY.get(str(tool_id))


def ids() -> List[str]:
    with _REG_LOCK:
        return sorted(_REGISTRY.keys())


class _SimpleCtx:
    """Lightweight ctx for direct (non-job) tool.call invocations. Mirrors the
    shape of jobs._JobCtx so handlers run unchanged sync or async."""

    def __init__(self, tool_id: str) -> None:
        self.job_id = None
        self.tool = tool_id
        self.run_id = None
        self.cancelled = False

    def progress(self, pct: Any, msg: str = "") -> None:
        try:
            p = max(0, min(100, int(pct)))
        except (TypeError, ValueError):
            p = 0
        BUS.emit("tool.progress", {"tool": self.tool, "pct": p, "msg": str(msg)})

    def log(self, msg: str) -> None:  # noqa: D401
        # Direct calls have no job row to append to; no-op is fine.
        pass


def _coerce_to_schema(schema: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    """Light, forgiving validation/coercion against an input_schema's properties.
    Drops unknown keys, applies declared defaults, coerces simple types, and
    raises ValueError if a `required` field is missing. No jsonschema dependency."""
    args = args if isinstance(args, dict) else {}
    props = (schema or {}).get("properties", {}) or {}
    required = (schema or {}).get("required", []) or []
    out: Dict[str, Any] = {}
    for key, spec in props.items():
        spec = spec if isinstance(spec, dict) else {}
        if key in args and args[key] is not None:
            v = args[key]
            t = spec.get("type")
            try:
                if t == "integer":
                    v = int(v)
                elif t == "number":
                    v = float(v)
                elif t == "boolean":
                    v = v if isinstance(v, bool) else str(v).lower() in ("1", "true", "yes", "on")
                elif t == "string":
                    v = str(v)
            except (TypeError, ValueError):
                pass
            out[key] = v
        elif "default" in spec:
            out[key] = spec["default"]
    for req in required:
        if req not in out or out[req] in (None, ""):
            raise ValueError(f"missing required argument: {req}")
    return out


def call(tool_id: str, args: Optional[Dict[str, Any]] = None, ctx: Any = None) -> Any:
    """Validate args + invoke a tool handler directly (synchronous). Emits
    tool.started/completed/failed. For async execution use jobs.create + jobs.run
    with `lambda a,c: tools.call_handler(tool_id, a, c)`. Raises KeyError on an
    unknown id and ValueError on a missing required arg; re-raises handler errors
    after emitting tool.failed."""
    tool = get(tool_id)
    if tool is None:
        raise KeyError(f"unknown tool: {tool_id}")
    ctx = ctx or _SimpleCtx(tool_id)
    validated = _coerce_to_schema(tool.input_schema, args or {})
    BUS.emit("tool.started", {"tool": tool_id, "args": validated})
    try:
        result = tool.handler(validated, ctx)
        BUS.emit("tool.completed", {"tool": tool_id, "result": result})
        return result
    except Exception as e:  # noqa: BLE001
        BUS.emit("tool.failed", {"tool": tool_id, "error": str(e)})
        raise


def call_handler(tool_id: str, args: Dict[str, Any], ctx: Any) -> Any:
    """Validate + run just the handler (no tool.* events here — used by jobs.run,
    which emits its own tool.started/completed/failed)."""
    tool = get(tool_id)
    if tool is None:
        raise KeyError(f"unknown tool: {tool_id}")
    validated = _coerce_to_schema(tool.input_schema, args or {})
    return tool.handler(validated, ctx)


# --------------------------------------------------------------------------- #
# Helpers shared by handlers
# --------------------------------------------------------------------------- #
def _run(cmd: List[str], timeout: int = 30) -> Dict[str, Any]:
    """Run a subprocess and capture rc/stdout/stderr. Never raises.

    rc -1 = timeout, -2 = command not found, -3 = other error.
    """
    try:
        p = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, check=False
        )
        return {"rc": p.returncode, "stdout": p.stdout, "stderr": p.stderr,
                "cmd": " ".join(cmd)}
    except subprocess.TimeoutExpired:
        return {"rc": -1, "stdout": "", "stderr": f"timeout after {timeout}s", "cmd": " ".join(cmd)}
    except FileNotFoundError:
        return {"rc": -2, "stdout": "", "stderr": f"command not found: {cmd[0]}", "cmd": " ".join(cmd)}
    except Exception as e:  # noqa: BLE001
        return {"rc": -3, "stdout": "", "stderr": str(e), "cmd": " ".join(cmd)}


def _http_get_json(url: str, timeout: int = 12) -> Dict[str, Any]:
    """GET a URL and parse JSON, with latency. Never raises."""
    t0 = time.time()
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 — fixed internal host
            raw = r.read().decode("utf-8", "replace")
        ms = round((time.time() - t0) * 1000, 1)
        try:
            return {"ok": True, "latency_ms": ms, "json": json.loads(raw), "url": url}
        except Exception:  # noqa: BLE001
            return {"ok": True, "latency_ms": ms, "text": raw[:4000], "url": url}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "latency_ms": round((time.time() - t0) * 1000, 1),
                "error": str(e), "url": url}


def _human(n: Any) -> str:
    """Bytes -> human string, e.g. '41.4GB'. Never raises."""
    try:
        n = float(n or 0)
    except (TypeError, ValueError):
        n = 0.0
    for unit in ("B", "KB", "MB", "GB", "TB", "PB"):
        if abs(n) < 1024.0:
            return f"{n:.1f}{unit}"
        n /= 1024.0
    return f"{n:.1f}EB"


def _safe_repo_path(path: str) -> str:
    """Resolve a path and ensure it is inside the repo, else raise. Rejects `..`."""
    if not isinstance(path, str) or not path:
        raise ValueError("path is required")
    if ".." in path.split(os.sep):
        raise ValueError(f"path traversal rejected: {path}")
    candidate = path if os.path.isabs(path) else os.path.join(REPO_ROOT, path)
    real = os.path.realpath(candidate)
    root = os.path.realpath(REPO_ROOT)
    if not (real == root or real.startswith(root + os.sep)):
        raise ValueError(f"path escapes repo: {path}")
    return real


def _safe_storage_path(path: str) -> str:
    """Resolve a path and ensure it is inside STORAGE_ROOT (/opt), else raise."""
    if not isinstance(path, str) or not path:
        raise ValueError("path is required")
    candidate = path if os.path.isabs(path) else os.path.join(STORAGE_ROOT, path)
    real = os.path.realpath(candidate)
    root = os.path.realpath(STORAGE_ROOT)
    if not (real == root or real.startswith(root + os.sep)):
        raise ValueError(f"path escapes {STORAGE_ROOT}: {path}")
    return real


def _sha256_file(path: str, chunk: int = 1 << 20) -> str:
    """Full-file sha256, streamed. Raises on read error (caller handles)."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _sha256_sample(path: str, head: int = 65536) -> str:
    """sha256 of size + head + tail — a cheap collision sampler for dup-finding."""
    try:
        size = os.path.getsize(path)
    except OSError:
        size = 0
    h = hashlib.sha256()
    h.update(str(size).encode())
    try:
        with open(path, "rb") as f:
            h.update(f.read(head))
            if size > head * 2:
                f.seek(-head, os.SEEK_END)
                h.update(f.read(head))
    except OSError:
        pass
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# REAL handlers
# --------------------------------------------------------------------------- #
def _h_server_disk_audit(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`df -h /opt` + `du -sh <repo>/* | sort -rh | head -15` — real disk truth."""
    ctx.progress(10, "df -h /opt")
    df = _run(["df", "-h", STORAGE_ROOT], timeout=15)
    filesystem: Dict[str, Any] = {}
    lines = [ln for ln in (df["stdout"] or "").splitlines() if ln.strip()]
    if len(lines) >= 2:
        p = lines[1].split()
        if len(p) >= 6:
            filesystem = {
                "filesystem": p[0], "size": p[1], "used": p[2],
                "avail": p[3], "use_pct": p[4], "mount": " ".join(p[5:]),
            }
    ctx.progress(50, f"du -sh under {REPO_ROOT}")
    du = _run(["bash", "-lc",
               f"du -sh {json.dumps(REPO_ROOT)}/* 2>/dev/null | sort -rh | head -15"],
              timeout=18)
    top_dirs: List[Dict[str, Any]] = []
    for line in (du["stdout"] or "").splitlines():
        if "\t" in line:
            size_s, path = line.split("\t", 1)
            top_dirs.append({"size": size_s.strip(), "path": path.strip()})
    ctx.progress(100, "done")
    largest = top_dirs[0] if top_dirs else None
    summary = (
        f"{STORAGE_ROOT} {filesystem.get('used','?')}/{filesystem.get('size','?')} "
        f"({filesystem.get('use_pct','?')}), {filesystem.get('avail','?')} free"
    )
    if largest:
        summary += f"; largest dir {largest['size']} {os.path.basename(largest['path'])}"
    return {"filesystem": filesystem, "top_dirs": top_dirs, "summary": summary}


def _h_server_cpu_inspect(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """/proc/loadavg + os.cpu_count() + top processes by %cpu (real)."""
    ctx.progress(15, "reading /proc/loadavg")
    load1 = load5 = load15 = 0.0
    try:
        with open("/proc/loadavg", "r") as f:
            parts = f.read().split()
        load1, load5, load15 = float(parts[0]), float(parts[1]), float(parts[2])
    except Exception:  # noqa: BLE001
        pass
    cpu_count = os.cpu_count() or 1
    ctx.progress(55, "ps top processes")
    ps = _run(["ps", "-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu", "--no-headers"], timeout=15)
    top: List[Dict[str, Any]] = []
    for line in (ps["stdout"] or "").splitlines()[:5]:
        p = line.split(None, 3)
        if len(p) >= 4:
            try:
                top.append({"pid": int(p[0]), "command": p[1],
                            "cpu_pct": float(p[2]), "mem_pct": float(p[3])})
            except ValueError:
                continue
    ctx.progress(100, "done")
    per_core = round(load1 / cpu_count, 2) if cpu_count else load1
    hottest = top[0] if top else None
    summary = (f"load {load1}/{load5}/{load15} over {cpu_count} cores "
               f"({per_core} per-core)")
    if hottest:
        summary += f"; hottest {hottest['command']} {hottest['cpu_pct']}%"
    return {
        "loadavg": {"1m": load1, "5m": load5, "15m": load15},
        "cpu_count": cpu_count,
        "load_per_core_1m": per_core,
        "top_processes": top,
        "summary": summary,
    }


_SERVICE_RE = re.compile(r"^[a-z0-9._-]+$", re.IGNORECASE)


def _h_server_logs_read(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`pm2 logs <service> --nostream --lines N` — read-only, never restarts."""
    service = str(args.get("service") or "").strip()
    lines_n = int(args.get("lines") or 50)
    lines_n = max(1, min(lines_n, 500))
    if not service or not _SERVICE_RE.match(service):
        return {"service": service, "lines_requested": lines_n, "lines": [],
                "line_count": 0, "error": "invalid service name",
                "summary": f"refused invalid service name {service!r}"}
    ctx.progress(30, f"pm2 logs {service} --nostream")
    res = _run(["pm2", "logs", service, "--nostream", "--lines", str(lines_n)],
               timeout=int(args.get("_timeout") or 25))
    out_lines = [ln for ln in (res["stdout"] or "").splitlines() if ln.strip()]
    err = (res.get("stderr") or "").strip() or None
    if res["rc"] not in (0,) and not out_lines:
        err = err or f"pm2 rc={res['rc']}"
    ctx.progress(100, "done")
    return {
        "service": service,
        "lines_requested": lines_n,
        "lines": out_lines,
        "line_count": len(out_lines),
        "error": err,
        "summary": f"{len(out_lines)} log line(s) for {service}",
    }


def _h_docker_usage_inspect(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`docker system df` + container counts from `docker ps -q` / `-aq`."""
    ctx.progress(20, "docker system df")
    df = _run(["docker", "system", "df", "--format",
               "{{.Type}}|{{.TotalCount}}|{{.Active}}|{{.Size}}|{{.Reclaimable}}"], timeout=30)
    usage: List[Dict[str, Any]] = []
    for line in (df["stdout"] or "").splitlines():
        p = line.split("|")
        if len(p) >= 4:
            usage.append({"type": p[0], "total": p[1], "active": p[2],
                          "size": p[3], "reclaimable": p[4] if len(p) > 4 else ""})
    ctx.progress(60, "docker ps -q")
    run_q = _run(["docker", "ps", "-q"], timeout=15)
    all_q = _run(["docker", "ps", "-aq"], timeout=15)
    running = len([x for x in (run_q["stdout"] or "").splitlines() if x.strip()])
    total = len([x for x in (all_q["stdout"] or "").splitlines() if x.strip()])
    err = (df.get("stderr") or "").strip() or (run_q.get("stderr") or "").strip() or None
    ctx.progress(100, "done")
    return {
        "usage": usage,
        "containers_running": running,
        "containers_total": total,
        "error": err,
        "summary": (f"{running}/{total} containers running; "
                    f"{len(usage)} usage categories"
                    if usage or total else f"docker unavailable: {err or 'unknown'}"),
    }


def _h_docker_prune_safe(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`docker system prune -f` (safe: dangling/stopped only). system_change risk —
    the permission engine gates this to confirm; the handler still runs for real
    once approved."""
    ctx.progress(15, "measuring reclaimable (before)")
    before = _run(["docker", "system", "df"], timeout=20)
    before_reclaimable = ""
    for line in (before["stdout"] or "").splitlines():
        if "RECLAIMABLE" in line.upper():
            continue
        # crude: capture the last whitespace token that looks like a size
        m = re.findall(r"([\d.]+\s?[KMGT]?B)", line)
        if m:
            before_reclaimable += line.strip() + " | "
    ctx.progress(45, "docker system prune -f")
    pr = _run(["docker", "system", "prune", "-f"],
              timeout=int(args.get("_timeout") or 120))
    reclaimed = None
    for line in (pr["stdout"] or "").splitlines():
        if "reclaimed space" in line.lower():
            reclaimed = line.strip()
    ctx.progress(100, "done")
    err = (pr.get("stderr") or "").strip() or None
    return {
        "before_reclaimable": before_reclaimable.strip(" |") or None,
        "stdout": (pr["stdout"] or "").strip(),
        "reclaimed": reclaimed,
        "rc": pr["rc"],
        "error": err if pr["rc"] != 0 else None,
        "summary": (reclaimed or
                    (f"prune rc={pr['rc']}" if pr["rc"] != 0 else "prune completed, nothing to reclaim")),
    }


def _h_storage_large_files(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`find <root> -xdev -type f -size +Nc -printf '%s\\t%p\\n' | sort -rn | head`."""
    root = _safe_storage_path(args.get("root") or STORAGE_ROOT)
    min_mb = float(args.get("min_mb") or 50)
    top = int(args.get("top") or 25)
    min_bytes = int(min_mb * 1024 * 1024)
    ctx.progress(15, f"scanning {root} (>= {min_mb}MB)")
    res = _run(["bash", "-lc",
                f"find {json.dumps(root)} -xdev -type f -size +{min_bytes}c "
                f"-printf '%s\\t%p\\n' 2>/dev/null | sort -rn | head -n {top}"],
               timeout=int(args.get("_timeout") or 70))
    files: List[Dict[str, Any]] = []
    for line in (res["stdout"] or "").splitlines():
        if "\t" not in line:
            continue
        size_s, path = line.split("\t", 1)
        try:
            sz = int(size_s)
        except ValueError:
            continue
        files.append({"size_bytes": sz, "size": _human(sz), "path": path})
    ctx.progress(100, f"{len(files)} files")
    total = sum(f["size_bytes"] for f in files)
    return {
        "root": root, "min_mb": min_mb, "files": files, "count": len(files),
        "summary": f"{len(files)} file(s) >= {min_mb}MB under {root}, total {_human(total)}",
    }


def _h_storage_duplicates(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Find likely duplicates: group files by exact size, then within each
    size-collision sample head+tail sha256 and group identical samples."""
    root = _safe_storage_path(args.get("root") or STORAGE_ROOT)
    min_mb = float(args.get("min_mb") or 10)
    min_bytes = int(min_mb * 1024 * 1024)
    ctx.progress(10, f"enumerating files >= {min_mb}MB under {root}")
    res = _run(["bash", "-lc",
                f"find {json.dumps(root)} -xdev -type f -size +{min_bytes}c "
                f"-printf '%s\\t%p\\n' 2>/dev/null"],
               timeout=int(args.get("_timeout") or 90))
    by_size: Dict[int, List[str]] = {}
    for line in (res["stdout"] or "").splitlines():
        if "\t" not in line:
            continue
        size_s, path = line.split("\t", 1)
        try:
            sz = int(size_s)
        except ValueError:
            continue
        by_size.setdefault(sz, []).append(path)
    # Only size-collisions can be dups.
    collisions = {sz: paths for sz, paths in by_size.items() if len(paths) > 1}
    ctx.progress(50, f"sampling {len(collisions)} size-collision groups")
    groups: List[Dict[str, Any]] = []
    for sz, paths in collisions.items():
        by_hash: Dict[str, List[str]] = {}
        for p in paths:
            by_hash.setdefault(_sha256_sample(p), []).append(p)
        for h, hp in by_hash.items():
            if len(hp) > 1:
                groups.append({
                    "size": sz, "size_human": _human(sz), "count": len(hp),
                    "reclaimable": sz * (len(hp) - 1),
                    "sample_sha256": h, "paths": hp[:25],
                })
    groups.sort(key=lambda g: g["reclaimable"], reverse=True)
    groups = groups[:20]
    reclaimable = sum(g["reclaimable"] for g in groups)
    ctx.progress(100, f"{len(groups)} dup groups")
    return {
        "root": root, "min_mb": min_mb, "groups": groups,
        "reclaimable_bytes": reclaimable, "reclaimable": _human(reclaimable),
        "summary": (f"{len(groups)} duplicate group(s) under {root}, "
                    f"~{_human(reclaimable)} reclaimable"),
    }


def _h_storage_compress(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """`tar -C parent -cf - base | zstd -19 --long -T0 -o out` (gzip fallback).
    Both source and out are sandboxed in-repo (safe_write)."""
    source = _safe_repo_path(args.get("source") or "")
    out = _safe_repo_path(args.get("out") or "")
    if not os.path.exists(source):
        raise ValueError(f"source does not exist: {source}")
    parent = os.path.dirname(source)
    base = os.path.basename(source)
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    have_zstd = shutil.which("zstd") is not None
    ctx.progress(20, f"compressing {base} ({'zstd' if have_zstd else 'gzip'})")
    if have_zstd:
        codec = "zstd"
        cmd = (f"tar -C {json.dumps(parent)} -cf - {json.dumps(base)} | "
               f"zstd -19 --long -T0 -q -o {json.dumps(out)} -f")
    else:
        codec = "gzip"
        cmd = (f"tar -C {json.dumps(parent)} -czf {json.dumps(out)} {json.dumps(base)}")
    res = _run(["bash", "-lc", cmd], timeout=int(args.get("_timeout") or 600))
    if res["rc"] != 0 or not os.path.exists(out):
        raise RuntimeError(f"compress failed rc={res['rc']}: {(res.get('stderr') or '')[:300]}")
    ctx.progress(80, "hashing archive")
    size = os.path.getsize(out)
    sha = _sha256_file(out)
    ctx.progress(100, "done")
    return {
        "out": out, "bytes": size, "size": _human(size), "sha256": sha,
        "codec": codec, "source": source,
        "summary": f"compressed {base} -> {os.path.basename(out)} ({_human(size)}, {codec})",
    }


def _h_storage_manifest(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """os.walk + per-file sha256 -> a JSON manifest written in-repo (safe_write)."""
    root = _safe_repo_path(args.get("root") or "")
    out = _safe_repo_path(args.get("manifest") or args.get("out") or "")
    if not os.path.isdir(root):
        raise ValueError(f"root is not a directory: {root}")
    ctx.progress(10, f"walking {root}")
    entries: List[Dict[str, Any]] = []
    total_bytes = 0
    file_count = 0
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            fp = os.path.join(dirpath, name)
            try:
                sz = os.path.getsize(fp)
                sha = _sha256_file(fp)
            except OSError:
                continue
            rel = os.path.relpath(fp, root)
            entries.append({"path": rel, "bytes": sz, "sha256": sha})
            total_bytes += sz
            file_count += 1
            if file_count % 200 == 0:
                ctx.progress(min(90, 10 + file_count // 50), f"{file_count} files")
    manifest = {
        "root": root, "created_ts": time.time(),
        "file_count": file_count, "total_bytes": total_bytes,
        "files": sorted(entries, key=lambda e: e["path"]),
    }
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    ctx.progress(100, "done")
    return {
        "manifest": out, "file_count": file_count, "total_bytes": total_bytes,
        "total": _human(total_bytes), "root": root,
        "summary": f"manifest of {file_count} file(s) ({_human(total_bytes)}) -> {os.path.basename(out)}",
    }


def _h_storage_restore(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Two modes (destructive — gated to confirm + backup-first by permission):
      * extract: archive -> dest (zstd -dc | tar -xf -, or tar -xzf)
      * manifest-verify: re-hash files vs a manifest, report missing/mismatched.
    """
    archive = args.get("archive")
    manifest = args.get("manifest")
    if manifest and not archive:
        # ---- manifest verify mode ----
        mpath = _safe_repo_path(manifest)
        ctx.progress(20, "loading manifest")
        with open(mpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        root = data.get("root") or REPO_ROOT
        files = data.get("files", []) or []
        missing: List[str] = []
        mismatched: List[str] = []
        checked = 0
        for i, ent in enumerate(files):
            rel = ent.get("path")
            want = ent.get("sha256")
            fp = os.path.join(root, rel)
            if not os.path.exists(fp):
                missing.append(rel)
            else:
                try:
                    got = _sha256_file(fp)
                    if got != want:
                        mismatched.append(rel)
                except OSError:
                    mismatched.append(rel)
            checked += 1
            if files and i % 100 == 0:
                ctx.progress(min(95, 20 + int(i / max(1, len(files)) * 75)), f"{i}/{len(files)}")
        ctx.progress(100, "done")
        problems = len(missing) + len(mismatched)
        return {
            "mode": "manifest-verify", "manifest": mpath, "root": root,
            "checked": checked, "missing": missing[:50], "mismatched": mismatched[:50],
            "problems": problems,
            "summary": (f"verified {checked} file(s): {len(missing)} missing, "
                        f"{len(mismatched)} mismatched"),
        }
    # ---- extract mode ----
    apath = _safe_repo_path(archive or "")
    dest = _safe_repo_path(args.get("dest") or "")
    if not os.path.exists(apath):
        raise ValueError(f"archive does not exist: {apath}")
    os.makedirs(dest, exist_ok=True)
    ctx.progress(30, f"extracting {os.path.basename(apath)} -> {dest}")
    if apath.endswith(".zst") or apath.endswith(".zstd"):
        cmd = f"zstd -dc {json.dumps(apath)} | tar -C {json.dumps(dest)} -xf -"
    else:
        cmd = f"tar -C {json.dumps(dest)} -xzf {json.dumps(apath)}"
    res = _run(["bash", "-lc", cmd], timeout=int(args.get("_timeout") or 600))
    ctx.progress(100, "done")
    if res["rc"] != 0:
        raise RuntimeError(f"extract failed rc={res['rc']}: {(res.get('stderr') or '')[:300]}")
    return {
        "mode": "extract", "archive": apath, "dest": dest, "rc": res["rc"],
        "summary": f"extracted {os.path.basename(apath)} into {dest}",
    }


def _h_gpu_status(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Real GPU/model state from the box Ollama. nvidia-smi lives on the box, so
    the source of truth is the box's resident models + their VRAM footprint."""
    ctx.progress(25, "GET box /api/ps")
    ps = _http_get_json(f"{BOX}/api/ps", timeout=12)
    ctx.progress(65, "GET box /api/tags")
    tags = _http_get_json(f"{BOX}/api/tags", timeout=12)
    resident: List[Dict[str, Any]] = []
    vram_total = 0
    if ps.get("ok") and isinstance(ps.get("json"), dict):
        for m in ps["json"].get("models", []) or []:
            v = int(m.get("size_vram") or m.get("size") or 0)
            vram_total += v
            det = m.get("details") or {}
            resident.append({
                "name": m.get("name"), "vram_bytes": v, "vram": _human(v),
                "context_length": m.get("context_length"),
                "param_size": det.get("parameter_size"),
                "quant": det.get("quantization_level"),
            })
    available: List[Dict[str, Any]] = []
    if tags.get("ok") and isinstance(tags.get("json"), dict):
        for m in tags["json"].get("models", []) or []:
            available.append({
                "name": m.get("name"),
                "size": _human(int(m.get("size") or 0)),
                "family": (m.get("details") or {}).get("family"),
            })
    reachable = bool(ps.get("ok") or tags.get("ok"))
    ctx.progress(100, f"{len(resident)} resident")
    return {
        "box": BOX,
        "reachable": reachable,
        "ps_latency_ms": ps.get("latency_ms"),
        "resident_models": resident,
        "available_models": available,
        "vram_in_use_bytes": vram_total,
        "vram_in_use": _human(vram_total),
        "summary": (f"{len(resident)} model(s) resident on box using {_human(vram_total)} VRAM; "
                    f"{len(available)} available"
                    if reachable else f"box unreachable: {ps.get('error')}"),
    }


def _h_file_search(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Literal search across the repo: `rg --no-heading -n -S -F q [-g glob]`,
    falling back to `grep -rnI -F --include=` when ripgrep is absent."""
    query = str(args.get("query") or "")
    glob = args.get("glob")
    if not query:
        raise ValueError("query is required")
    ctx.progress(20, "searching repo")
    if shutil.which("rg"):
        engine = "rg"
        cmd = ["rg", "--no-heading", "-n", "-S", "-F", "--max-count", "200", query]
        if glob:
            cmd += ["-g", str(glob)]
        cmd += [REPO_ROOT]
    else:
        engine = "grep"
        cmd = ["grep", "-rnI", "-F", query]
        if glob:
            cmd += [f"--include={glob}"]
        cmd += [REPO_ROOT]
    res = _run(cmd, timeout=int(args.get("_timeout") or 40))
    matches: List[Dict[str, Any]] = []
    for line in (res["stdout"] or "").splitlines():
        # path:line:text
        parts = line.split(":", 2)
        if len(parts) >= 3:
            try:
                ln = int(parts[1])
            except ValueError:
                continue
            matches.append({"path": parts[0], "line": ln, "text": parts[2][:300]})
        if len(matches) >= 40:
            break
    ctx.progress(100, f"{len(matches)} matches")
    return {
        "query": query, "glob": glob, "engine": engine,
        "matches": matches, "count": len(matches),
        "summary": f"{len(matches)} match(es) for {query!r} via {engine}",
    }


def _h_file_read(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Read a real repo file (sandboxed, rejects `..`), truncating large reads."""
    path = _safe_repo_path(args.get("path") or "")
    max_bytes = int(args.get("max_bytes") or 20000)
    max_bytes = max(1, min(max_bytes, 1_000_000))
    ctx.progress(30, f"reading {os.path.basename(path)}")
    if not os.path.isfile(path):
        ctx.progress(100, "missing")
        return {"path": path, "exists": False, "truncated": False,
                "content": "", "bytes": 0, "summary": f"{path} does not exist"}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read(max_bytes + 1)
    truncated = len(content) > max_bytes
    if truncated:
        content = content[:max_bytes]
    ctx.progress(100, "done")
    return {
        "path": path, "exists": True, "truncated": truncated,
        "content": content, "bytes": len(content.encode("utf-8", "replace")),
        "summary": f"read {len(content)} chars from {os.path.basename(path)}"
                   + (" (truncated)" if truncated else ""),
    }


def _h_file_write(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Write a real repo file (sandboxed). Optional append."""
    path = _safe_repo_path(args.get("path") or "")
    content = args.get("content")
    if content is None:
        raise ValueError("content is required")
    content = str(content)
    append = bool(args.get("append"))
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    ctx.progress(40, f"{'appending to' if append else 'writing'} {os.path.basename(path)}")
    with open(path, "a" if append else "w", encoding="utf-8") as f:
        f.write(content)
    n = len(content.encode("utf-8", "replace"))
    ctx.progress(100, "done")
    return {"path": path, "bytes_written": n, "append": append,
            "summary": f"wrote {n} bytes to {os.path.basename(path)}"}


def _h_agent_memory_search(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """LIKE search over agent_memory.db via memory.search()."""
    query = str(args.get("query") or "")
    limit = int(args.get("limit") or 20)
    ctx.progress(40, "searching agent memory")
    hits = _memory.search(query, limit=limit)
    ctx.progress(100, "done")
    return {"query": query, "hits": hits, "count": len(hits),
            "summary": f"{len(hits)} memory hit(s) for {query!r}"}


def _h_agent_memory_write(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Persist a row into agent_memory.db via memory.write(). Tolerates the 8B
    planner putting content in either key or value."""
    key = args.get("key")
    value = args.get("value")
    kind = str(args.get("kind") or "note")
    tags = args.get("tags")
    # Be forgiving: derive value<->key either direction.
    if (value is None or value == "") and key:
        value = key
    if (key is None or key == "") and value not in (None, ""):
        key = str(value)[:60]
    if (key in (None, "")) and (value in (None, "")):
        ctx.progress(100, "no-op")
        return {"id": -1, "stored": False, "summary": "nothing to remember (empty key+value)"}
    ctx.progress(40, "writing agent memory")
    rid = _memory.write(kind, str(key or ""), value, tags=tags)
    ctx.progress(100, "done")
    return {"id": rid, "stored": rid > 0, "kind": kind, "key": key,
            "summary": (f"remembered '{key}' (id={rid})" if rid > 0 else "memory write failed")}


def _h_knowledge_stats(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Real knowledge counts from brain.db (read-only)."""
    ctx.progress(25, "opening brain.db (ro)")
    by_type: List[Dict[str, Any]] = []
    totals: Dict[str, Any] = {}
    err = None
    try:
        c = sqlite3.connect(f"file:{BRAIN_DB}?mode=ro", uri=True, timeout=10)
        try:
            ctx.progress(50, "grouping ont_object by type")
            for row in c.execute(
                "SELECT type, COUNT(*) FROM ont_object GROUP BY type ORDER BY 2 DESC"
            ):
                by_type.append({"type": row[0], "count": int(row[1])})

            def _count(sql: str) -> int:
                try:
                    r = c.execute(sql).fetchone()
                    return int(r[0]) if r else 0
                except Exception:  # noqa: BLE001
                    return 0

            totals = {
                "ontology_objects": _count("SELECT COUNT(*) FROM ont_object"),
                "topics": _count("SELECT COUNT(*) FROM ont_object WHERE type='Topic'"),
                "notes": _count("SELECT COUNT(*) FROM note"),
                "notes_enriched": _count(
                    "SELECT COUNT(*) FROM note WHERE frontmatter_json LIKE '%\"batch_loader\"%'"),
                "links": _count("SELECT COUNT(*) FROM ont_link"),
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        err = str(e)
    ctx.progress(100, "done")
    return {
        "db": BRAIN_DB, "by_type": by_type[:40], "totals": totals, "error": err,
        "summary": (f"{totals.get('topics',0)} topics, {totals.get('notes',0)} notes, "
                    f"{totals.get('ontology_objects',0)} ontology objects"
                    if not err else f"brain.db error: {err}"),
    }


# --------------------------------------------------------------------------- #
# Catalog registration (runs on import)
# --------------------------------------------------------------------------- #
def _register_all() -> None:
    register(Tool(
        id="server.disk.audit", name="Disk Audit",
        description="Real disk usage of /opt plus the largest repo subdirectories (df -h + du -sh | sort).",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="safe_read", timeout=20, handler=_h_server_disk_audit, tags=["server", "disk"],
    ))
    register(Tool(
        id="server.cpu.inspect", name="CPU Inspect",
        description="Live load average, core count, per-core load and the top CPU processes.",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="safe_read", timeout=15, handler=_h_server_cpu_inspect, tags=["server", "cpu"],
    ))
    register(Tool(
        id="server.logs.read", name="Service Logs",
        description="Read-only tail of a pm2 service's logs (pm2 logs --nostream --lines N). Never restarts anything.",
        input_schema={"type": "object", "properties": {
            "service": {"type": "string"},
            "lines": {"type": "integer", "default": 50},
        }, "required": ["service"]},
        risk="safe_read", timeout=30, handler=_h_server_logs_read, tags=["server", "logs", "pm2"],
    ))
    register(Tool(
        id="docker.usage.inspect", name="Docker Usage",
        description="Docker disk usage (docker system df) and running/total container counts.",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="safe_read", timeout=35, handler=_h_docker_usage_inspect, tags=["docker"],
    ))
    register(Tool(
        id="docker.prune.safe", name="Docker Prune (safe)",
        description="Reclaim space with `docker system prune -f` (dangling images/stopped containers/unused networks).",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="system_change", timeout=130, handler=_h_docker_prune_safe, tags=["docker", "cleanup"],
    ))
    register(Tool(
        id="storage.large_files.find", name="Find Large Files",
        description="Largest files under a sandboxed root (/opt) over a size threshold.",
        input_schema={"type": "object", "properties": {
            "root": {"type": "string", "default": STORAGE_ROOT},
            "min_mb": {"type": "number", "default": 50},
            "top": {"type": "integer", "default": 25},
        }, "required": []},
        risk="safe_read", timeout=75, handler=_h_storage_large_files, tags=["storage"],
    ))
    register(Tool(
        id="storage.duplicates.find", name="Find Duplicates",
        description="Likely duplicate files grouped by size then head/tail sha256 sample, with reclaimable bytes.",
        input_schema={"type": "object", "properties": {
            "root": {"type": "string", "default": STORAGE_ROOT},
            "min_mb": {"type": "number", "default": 10},
        }, "required": []},
        risk="safe_read", timeout=95, handler=_h_storage_duplicates, tags=["storage", "dedupe"],
    ))
    register(Tool(
        id="storage.folder.compress", name="Compress Folder",
        description="Compress an in-repo folder to an in-repo archive (tar|zstd -19, gzip fallback) and hash it.",
        input_schema={"type": "object", "properties": {
            "source": {"type": "string"},
            "out": {"type": "string"},
        }, "required": ["source", "out"]},
        risk="safe_write", timeout=600, handler=_h_storage_compress, tags=["storage", "compress"],
    ))
    register(Tool(
        id="storage.manifest.create", name="Create Manifest",
        description="Walk an in-repo folder and write a JSON sha256 manifest of every file.",
        input_schema={"type": "object", "properties": {
            "root": {"type": "string"},
            "manifest": {"type": "string"},
        }, "required": ["root", "manifest"]},
        risk="safe_write", timeout=600, handler=_h_storage_manifest, tags=["storage", "manifest"],
    ))
    register(Tool(
        id="storage.restore", name="Restore / Verify",
        description="Extract an in-repo archive into a dest, OR verify files against a sha256 manifest.",
        input_schema={"type": "object", "properties": {
            "archive": {"type": "string"},
            "dest": {"type": "string"},
            "manifest": {"type": "string"},
        }, "required": []},
        risk="destructive", timeout=600, handler=_h_storage_restore, tags=["storage", "restore"],
    ))
    register(Tool(
        id="gpu.status.inspect", name="GPU Status",
        description="Resident/available models and VRAM in use on the box Ollama (/api/ps + /api/tags).",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="safe_read", timeout=20, handler=_h_gpu_status, tags=["gpu", "box", "llm"],
    ))
    register(Tool(
        id="file.search", name="Search Files",
        description="Literal text search across the repo (ripgrep, grep fallback).",
        input_schema={"type": "object", "properties": {
            "query": {"type": "string"},
            "glob": {"type": "string"},
        }, "required": ["query"]},
        risk="safe_read", timeout=40, handler=_h_file_search, tags=["file", "search"],
    ))
    register(Tool(
        id="file.read", name="Read File",
        description="Read a file inside the repo (sandboxed; large files truncated).",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string"},
            "max_bytes": {"type": "integer", "default": 20000},
        }, "required": ["path"]},
        risk="safe_read", timeout=15, handler=_h_file_read, tags=["file"],
    ))
    register(Tool(
        id="file.write", name="Write File",
        description="Write (or append to) a file inside the repo (sandboxed).",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string"},
            "content": {"type": "string"},
            "append": {"type": "boolean", "default": False},
        }, "required": ["path", "content"]},
        risk="safe_write", timeout=15, handler=_h_file_write, tags=["file"],
    ))
    register(Tool(
        id="agent.memory.search", name="Recall Memory",
        description="Search durable agent memory (LIKE over key/value/tags).",
        input_schema={"type": "object", "properties": {
            "query": {"type": "string"},
            "limit": {"type": "integer", "default": 20},
        }, "required": ["query"]},
        risk="safe_read", timeout=10, handler=_h_agent_memory_search, tags=["memory"],
    ))
    register(Tool(
        id="agent.memory.write", name="Remember",
        description="Persist a fact/note into durable agent memory.",
        input_schema={"type": "object", "properties": {
            "key": {"type": "string"},
            "value": {"type": "string"},
            "kind": {"type": "string", "default": "note"},
            "tags": {"type": "string"},
        }, "required": []},
        risk="safe_write", timeout=10, handler=_h_agent_memory_write, tags=["memory"],
    ))
    register(Tool(
        id="knowledge.stats", name="Knowledge Stats",
        description="Real counts from the knowledge base (brain.db, read-only): ontology objects by type, topics, notes, links.",
        input_schema={"type": "object", "properties": {}, "required": []},
        risk="safe_read", timeout=15, handler=_h_knowledge_stats, tags=["knowledge", "brain"],
    ))


_register_all()

CATALOG_IDS: List[str] = ids()


if __name__ == "__main__":
    # Self-contained smoke test: every handler runs a REAL command/HTTP/sqlite call
    # against this box and returns real data. Writes/storage tests stay inside a
    # throwaway tmp dir under the repo and clean up after themselves.
    import tempfile

    failures = 0

    def check(cond: bool, label: str, extra: Any = "") -> None:
        global failures
        ok = bool(cond)
        if not ok:
            failures += 1
        print(("PASS " if ok else "FAIL ") + label + (f"  -- {extra}" if extra else ""))

    import builtins  # `all()` is shadowed by the registry function in this module

    ctx = _SimpleCtx("smoke")

    # Registry shape.
    cat = all()
    check(len(cat) == 17, f"17 tools registered", len(cat))
    check(len(CATALOG_IDS) == 17, "CATALOG_IDS has 17 ids")
    _valid_risks = ("safe_read", "safe_write", "system_change", "destructive",
                    "financial", "deployment", "security_sensitive")
    check(builtins.all(t.get("risk") in _valid_risks for t in cat), "all risks valid")
    check(get("server.disk.audit") is not None, "get() finds a tool")

    # safe_read handlers — real data.
    disk = call("server.disk.audit", {}, ctx)
    check(bool(disk.get("filesystem")) and disk.get("summary"), "server.disk.audit returns df data", disk.get("summary"))

    cpu = call("server.cpu.inspect", {}, ctx)
    check(cpu.get("cpu_count", 0) >= 1 and "loadavg" in cpu, "server.cpu.inspect returns load", cpu.get("summary"))

    logs = call("server.logs.read", {"service": "this-service-does-not-exist", "lines": 5}, ctx)
    check(isinstance(logs.get("lines"), list), "server.logs.read returns lines list")
    bad_logs = call("server.logs.read", {"service": "bad; rm -rf", "lines": 5}, ctx)
    check(bad_logs.get("error") == "invalid service name", "server.logs.read rejects bad service name")

    du = call("docker.usage.inspect", {}, ctx)
    check("usage" in du and "containers_total" in du, "docker.usage.inspect returns usage", du.get("summary"))

    lf = call("storage.large_files.find", {"root": "/opt", "min_mb": 200, "top": 5}, ctx)
    check(isinstance(lf.get("files"), list), "storage.large_files.find returns files", lf.get("summary"))

    gpu = call("gpu.status.inspect", {}, ctx)
    check("resident_models" in gpu and "vram_in_use" in gpu, "gpu.status.inspect returns model state", gpu.get("summary"))

    fs = call("file.search", {"query": "EventBus"}, ctx)
    check(isinstance(fs.get("matches"), list) and fs.get("engine") in ("rg", "grep"),
          "file.search returns matches", fs.get("summary"))

    fr = call("file.read", {"path": "server/agent/events.py", "max_bytes": 200}, ctx)
    check(fr.get("exists") and fr.get("truncated") and len(fr.get("content", "")) == 200,
          "file.read reads + truncates")

    ks = call("knowledge.stats", {}, ctx)
    check(ks.get("totals", {}).get("topics", 0) > 0, "knowledge.stats returns real topic count", ks.get("summary"))

    # Sandbox enforcement.
    try:
        call("file.read", {"path": "../../etc/passwd"}, ctx)
        check(False, "file.read rejects traversal")
    except Exception:
        check(True, "file.read rejects traversal")
    try:
        _safe_storage_path("/etc")
        check(False, "storage sandbox rejects /etc")
    except Exception:
        check(True, "storage sandbox rejects /etc")

    # required-arg validation.
    try:
        call("file.read", {}, ctx)
        check(False, "missing required arg raises")
    except ValueError:
        check(True, "missing required arg raises ValueError")
    try:
        call("nope.nope", {}, ctx)
        check(False, "unknown tool raises")
    except KeyError:
        check(True, "unknown tool raises KeyError")

    # agent.memory round-trip (real DB).
    mw = call("agent.memory.write", {"key": "smoke_key", "value": "smoke_value_xyz", "tags": "smoke"}, ctx)
    check(mw.get("stored"), "agent.memory.write stored", mw.get("id"))
    ms = call("agent.memory.search", {"query": "smoke_value_xyz"}, ctx)
    check(any("smoke_value_xyz" in str(h.get("value", "")) for h in ms.get("hits", [])),
          "agent.memory.search finds the row")

    # safe_write + storage round-trip inside a throwaway in-repo tmp dir.
    tmp = tempfile.mkdtemp(prefix="tools_smoke_", dir=os.path.join(REPO_ROOT, "server", "data"))
    try:
        src = os.path.join(tmp, "src")
        os.makedirs(src)
        wpath = os.path.join(src, "hello.txt")
        fw = call("file.write", {"path": wpath, "content": "hello world\n" * 40}, ctx)
        check(fw.get("bytes_written", 0) > 0, "file.write wrote bytes")

        arc = os.path.join(tmp, "src.tar.zst" if shutil.which("zstd") else "src.tar.gz")
        cz = call("storage.folder.compress", {"source": src, "out": arc}, ctx)
        check(os.path.exists(arc) and cz.get("sha256"), "storage.folder.compress produced archive", cz.get("codec"))

        man = os.path.join(tmp, "manifest.json")
        cm = call("storage.manifest.create", {"root": src, "manifest": man}, ctx)
        check(cm.get("file_count", 0) >= 1 and os.path.exists(man), "storage.manifest.create wrote manifest")

        # manifest-verify (destructive tool, but we invoke handler directly here).
        ver = call("storage.restore", {"manifest": man}, ctx)
        check(ver.get("mode") == "manifest-verify" and ver.get("problems") == 0,
              "storage.restore manifest-verify clean", ver.get("summary"))

        # extract round-trip.
        dest = os.path.join(tmp, "restored")
        ex = call("storage.restore", {"archive": arc, "dest": dest}, ctx)
        check(ex.get("mode") == "extract" and os.path.exists(os.path.join(dest, "src", "hello.txt")),
              "storage.restore extract round-trip")

        # duplicates: make a dup and detect it (small min to catch our ~480B file).
        shutil.copy(wpath, os.path.join(src, "hello_copy.txt"))
        dups = call("storage.duplicates.find", {"root": tmp, "min_mb": 0}, ctx)
        check(isinstance(dups.get("groups"), list), "storage.duplicates.find returns groups", dups.get("summary"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\nRESULT:", "ALL TOOLS SMOKE TESTS PASSED" if failures == 0 else f"{failures} FAILURE(S)")
    raise SystemExit(0 if failures == 0 else 1)
