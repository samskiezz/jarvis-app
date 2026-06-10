"""Agent OS — the REAL TOOL CATALOG.

This module registers the canonical JARVIS Agent OS tool catalog onto the shared
registry in ``server.agent.tools``. Every handler runs an *actual* shell command
or HTTP call against THIS machine and returns *real* data — there are no
placeholder/stub handlers. Importing this module performs the registration as a
side effect (idempotent: re-registering an id just overwrites it).

Catalog (exact tool ids, what each really does, risk):

    server.disk.audit        safe_read      df -h /opt + du of largest dirs under repo
    server.cpu.inspect       safe_read      /proc/loadavg + nproc + top 5 ps by cpu
    server.logs.read         safe_read      pm2 logs <service> --nostream --lines N
    docker.usage.inspect     safe_read      docker system df + docker ps count
    docker.prune.safe        system_change  docker system prune -f   (confirm-gated)
    storage.large_files.find safe_read      find biggest files (top 25) under /opt
    storage.duplicates.find  safe_read      size+hash-sample dedupe candidates (top 20)
    storage.folder.compress  safe_write     tar + zstd/gzip a folder -> {out,bytes,sha256}
    storage.manifest.create  safe_write     JSON manifest of files+sizes+sha256
    storage.restore          destructive    restore an archive/manifest (confirm-gated)
    gpu.status.inspect       safe_read      box Ollama /api/ps + /api/tags (resident models/VRAM)
    file.search              safe_read      rg/grep within repo (top 40 matches)
    file.read                safe_read      file content <=20000 chars, repo-sandboxed
    file.write               safe_write     write within repo only (rejects "..")
    agent.memory.search      safe_read      wraps memory.search
    agent.memory.write       safe_write     wraps memory.write
    knowledge.stats          safe_read      counts from BRAIN_DB (Topics/Measurements/...)

The risk levels feed ``server.agent.permission.decide`` — safe_read/safe_write
auto-run, while system_change/destructive require human confirmation (and, for
``storage.restore``, a backup is taken first per the permission policy).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import time
from typing import Any, Dict, List, Optional

from . import memory as _memory
from .tools import (  # reuse the real helpers + registry
    BRAIN_DB,
    REPO_ROOT,
    Tool,
    _http_get_json,
    _human,
    _run,
    register,
)

# /opt sandbox root for the storage-scanning tools (the task scopes them to /opt).
OPT_ROOT = "/opt"
# Box host for the Ollama GPU/model status (same default the dashboard/core use).
BOX = (os.environ.get("OLLAMA_HOST") or "http://211.72.13.201:41137").rstrip("/")
if BOX.endswith("/v1"):
    BOX = BOX[: -len("/v1")]


# --------------------------------------------------------------------------- #
# Path sandboxing helpers
# --------------------------------------------------------------------------- #
def _resolve_under(path: str, root: str) -> str:
    """Resolve `path` (abs or relative-to-root) and ensure it stays under `root`.
    Rejects ".." traversal and symlink escapes. Raises ValueError on escape."""
    if path is None or str(path).strip() == "":
        raise ValueError("empty path")
    p = str(path)
    if ".." in p.split(os.sep):
        raise ValueError(f"path contains '..': {p}")
    candidate = p if os.path.isabs(p) else os.path.join(root, p)
    real = os.path.realpath(candidate)
    root_real = os.path.realpath(root)
    if not (real == root_real or real.startswith(root_real + os.sep)):
        raise ValueError(f"path escapes {root_real}: {p}")
    return real


def _safe_repo_path(path: str) -> str:
    return _resolve_under(path, REPO_ROOT)


def _safe_opt_path(path: str) -> str:
    return _resolve_under(path, OPT_ROOT)


def _sha256_file(fp: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(fp, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def _sha256_sample(fp: str, size: int, sample: int = 65536) -> str:
    """Cheap content fingerprint for dedupe: hash head+tail (+size) so we don't
    read multi-GB files in full while scanning."""
    h = hashlib.sha256()
    h.update(str(size).encode())
    try:
        with open(fp, "rb") as f:
            head = f.read(sample)
            h.update(head)
            if size > sample * 2:
                f.seek(max(0, size - sample))
                h.update(f.read(sample))
    except OSError:
        return ""
    return h.hexdigest()


# --------------------------------------------------------------------------- #
# server.disk.audit
# --------------------------------------------------------------------------- #
def _h_server_disk_audit(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """df -h /opt + du -sh of the largest dirs under the repo (top 15)."""
    ctx.progress(10, "df -h /opt")
    df = _run(["df", "-h", "/opt"], timeout=15)
    fs: Dict[str, Any] = {}
    df_lines = [ln for ln in (df["stdout"] or "").splitlines() if ln.strip()]
    if len(df_lines) >= 2:
        p = df_lines[1].split()
        if len(p) >= 6:
            fs = {"filesystem": p[0], "size": p[1], "used": p[2],
                  "avail": p[3], "use_pct": p[4], "mount": " ".join(p[5:])}
    ctx.progress(45, "du of repo subdirs")
    # du -sh each immediate child of the repo, sort desc, take top 15.
    du = _run(["bash", "-lc",
               f"du -sh {json.dumps(REPO_ROOT)}/* 2>/dev/null | sort -rh | head -n 15"],
              timeout=120)
    top_dirs: List[Dict[str, str]] = []
    for line in (du["stdout"] or "").splitlines():
        if "\t" not in line:
            continue
        size, path = line.split("\t", 1)
        top_dirs.append({"path": path.strip(), "size": size.strip()})
    ctx.progress(100, f"{len(top_dirs)} dirs")
    return {
        "filesystem": fs,
        "top_dirs": top_dirs,
        "summary": (f"/opt {fs.get('used', '?')}/{fs.get('size', '?')} used "
                    f"({fs.get('use_pct', '?')}), {fs.get('avail', '?')} free; "
                    f"largest under repo: "
                    + ", ".join(f"{d['size']} {os.path.basename(d['path'])}" for d in top_dirs[:3])),
    }


# --------------------------------------------------------------------------- #
# server.cpu.inspect
# --------------------------------------------------------------------------- #
def _h_server_cpu_inspect(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """loadavg + cpu count + top 5 processes by cpu (ps)."""
    ctx.progress(20, "reading /proc/loadavg")
    load1 = load5 = load15 = None
    try:
        with open("/proc/loadavg", "r") as f:
            parts = f.read().split()
        load1, load5, load15 = float(parts[0]), float(parts[1]), float(parts[2])
    except Exception:  # noqa: BLE001
        pass
    cpu_count = os.cpu_count() or 0
    ctx.progress(60, "ps top by cpu")
    ps = _run(["ps", "-eo", "pid,comm,%cpu,%mem", "--sort=-%cpu"], timeout=15)
    top: List[Dict[str, Any]] = []
    for line in (ps["stdout"] or "").splitlines()[1:6]:
        p = line.split(None, 3)
        if len(p) < 4:
            continue
        try:
            top.append({"pid": int(p[0]), "command": p[1],
                        "cpu_pct": float(p[2]), "mem_pct": float(p[3])})
        except ValueError:
            continue
    ctx.progress(100, "done")
    load_per_core = round(load1 / cpu_count, 2) if (load1 is not None and cpu_count) else None
    return {
        "loadavg": {"1m": load1, "5m": load5, "15m": load15},
        "cpu_count": cpu_count,
        "load_per_core_1m": load_per_core,
        "top_processes": top,
        "summary": (f"load {load1}/{load5}/{load15} over {cpu_count} cores "
                    f"({load_per_core}x/core); hottest: "
                    + (f"{top[0]['command']} {top[0]['cpu_pct']}%" if top else "n/a")),
    }


# --------------------------------------------------------------------------- #
# server.logs.read
# --------------------------------------------------------------------------- #
def _h_server_logs_read(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """pm2 logs <service> --nostream --lines N (read-only tail)."""
    service = str(args.get("service") or "").strip()
    lines = max(1, min(int(args.get("lines") or 50), 1000))
    if not service:
        return {"service": service, "lines": [], "error": "service is required",
                "summary": "no service specified"}
    # pm2 names may contain a-z0-9 . _ - ; reject anything else (no shell injection).
    if not all(ch.isalnum() or ch in "._-" for ch in service):
        return {"service": service, "lines": [], "error": "invalid service name",
                "summary": f"refused: bad service name {service!r}"}
    ctx.progress(30, f"pm2 logs {service}")
    res = _run(["pm2", "logs", service, "--nostream", "--lines", str(lines)], timeout=30)
    out_lines = [ln for ln in (res["stdout"] or "").splitlines()]
    ctx.progress(100, f"{len(out_lines)} lines")
    return {
        "service": service,
        "lines_requested": lines,
        "lines": out_lines[-(lines * 2):],  # pm2 interleaves out+err streams
        "line_count": len(out_lines),
        "error": (res.get("stderr") or "").strip() or None,
        "summary": f"tailed {len(out_lines)} log line(s) for {service}",
    }


# --------------------------------------------------------------------------- #
# docker.usage.inspect
# --------------------------------------------------------------------------- #
def _h_docker_usage_inspect(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """docker system df (parsed) + docker ps count."""
    ctx.progress(25, "docker system df")
    df = _run(["docker", "system", "df", "--format",
               "{{.Type}}|{{.TotalCount}}|{{.Active}}|{{.Size}}|{{.Reclaimable}}"], timeout=30)
    usage: List[Dict[str, str]] = []
    for line in (df["stdout"] or "").splitlines():
        p = line.split("|")
        if len(p) >= 4:
            usage.append({"type": p[0], "total": p[1], "active": p[2],
                          "size": p[3], "reclaimable": p[4] if len(p) > 4 else ""})
    ctx.progress(70, "docker ps -q")
    ps = _run(["docker", "ps", "-q"], timeout=20)
    running = [x for x in (ps["stdout"] or "").splitlines() if x.strip()]
    psa = _run(["docker", "ps", "-aq"], timeout=20)
    all_ct = [x for x in (psa["stdout"] or "").splitlines() if x.strip()]
    ctx.progress(100, "done")
    err = (df.get("stderr") or "").strip() or (ps.get("stderr") or "").strip()
    return {
        "usage": usage,
        "containers_running": len(running),
        "containers_total": len(all_ct),
        "error": err or None,
        "summary": (f"{len(running)} running / {len(all_ct)} total containers; "
                    + "; ".join(f"{u['type']} {u['size']} ({u['reclaimable']} reclaimable)"
                                for u in usage)) if usage else (err or "no docker data"),
    }


# --------------------------------------------------------------------------- #
# docker.prune.safe   (system_change -> confirm-gated by permission engine)
# --------------------------------------------------------------------------- #
def _h_docker_prune_safe(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """docker system prune -f. Only the permission engine should let this run
    (system_change => confirm). Reports reclaimed space the engine reports."""
    ctx.progress(20, "docker system df (before)")
    before = _run(["docker", "system", "df", "--format", "{{.Type}}|{{.Reclaimable}}"], timeout=30)
    ctx.progress(50, "docker system prune -f")
    pr = _run(["docker", "system", "prune", "-f"], timeout=180)
    reclaimed = ""
    for line in (pr["stdout"] or "").splitlines():
        if "reclaimed space" in line.lower():
            reclaimed = line.strip()
    ctx.progress(100, "done")
    return {
        "before_reclaimable": [ln for ln in (before["stdout"] or "").splitlines()],
        "stdout": (pr["stdout"] or "")[-4000:],
        "reclaimed": reclaimed or "see stdout",
        "rc": pr["rc"],
        "error": (pr.get("stderr") or "").strip() or None,
        "summary": reclaimed or f"docker prune rc={pr['rc']}",
    }


# --------------------------------------------------------------------------- #
# storage.large_files.find   (sandboxed to /opt)
# --------------------------------------------------------------------------- #
def _h_storage_large_files(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    root = _safe_opt_path(args.get("root") or OPT_ROOT)
    min_mb = float(args.get("min_mb") or 0)
    top = 25
    min_bytes = int(min_mb * 1024 * 1024)
    ctx.progress(15, f"scanning {root}")
    res = _run(["bash", "-lc",
                f"find {json.dumps(root)} -xdev -type f -size +{int(min_bytes / 512) if min_bytes else 0}c "
                f"-printf '%s\\t%p\\n' 2>/dev/null | sort -rn | head -n {top}"],
               timeout=180)
    files: List[Dict[str, Any]] = []
    for line in (res["stdout"] or "").splitlines():
        if "\t" not in line:
            continue
        size_s, fp = line.split("\t", 1)
        try:
            sz = int(size_s)
        except ValueError:
            continue
        if sz < min_bytes:
            continue
        files.append({"size_bytes": sz, "size": _human(sz), "path": fp})
    ctx.progress(100, f"{len(files)} files")
    total = sum(f["size_bytes"] for f in files)
    return {
        "root": root, "min_mb": min_mb, "files": files, "count": len(files),
        "summary": f"top {len(files)} file(s) >= {min_mb}MB under {root}, totalling {_human(total)}",
    }


# --------------------------------------------------------------------------- #
# storage.duplicates.find   (sandboxed to /opt)
# --------------------------------------------------------------------------- #
def _h_storage_duplicates(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Find likely-duplicate files: group by identical size, then by a head+tail
    sha256 sample. Returns the top 20 duplicate groups by reclaimable bytes."""
    root = _safe_opt_path(args.get("root") or OPT_ROOT)
    min_bytes = int(float(args.get("min_mb") or 1) * 1024 * 1024)  # ignore tiny files
    ctx.progress(10, f"listing files under {root}")
    res = _run(["bash", "-lc",
                f"find {json.dumps(root)} -xdev -type f -size +{int(min_bytes / 512)}c "
                f"-printf '%s\\t%p\\n' 2>/dev/null"], timeout=180)
    by_size: Dict[int, List[str]] = {}
    for line in (res["stdout"] or "").splitlines():
        if "\t" not in line:
            continue
        size_s, fp = line.split("\t", 1)
        try:
            sz = int(size_s)
        except ValueError:
            continue
        by_size.setdefault(sz, []).append(fp)
    # Only sizes with >1 file are dup candidates; sample-hash those.
    candidates = {s: ps for s, ps in by_size.items() if len(ps) > 1}
    ctx.progress(55, f"hashing {sum(len(v) for v in candidates.values())} candidates")
    groups: List[Dict[str, Any]] = []
    for sz, paths in candidates.items():
        by_hash: Dict[str, List[str]] = {}
        for fp in paths:
            hh = _sha256_sample(fp, sz)
            if hh:
                by_hash.setdefault(hh, []).append(fp)
        for hh, fps in by_hash.items():
            if len(fps) > 1:
                reclaimable = sz * (len(fps) - 1)
                groups.append({
                    "size_bytes": sz, "size": _human(sz), "count": len(fps),
                    "reclaimable_bytes": reclaimable, "reclaimable": _human(reclaimable),
                    "sample_sha256": hh[:16], "paths": sorted(fps),
                })
    groups.sort(key=lambda g: g["reclaimable_bytes"], reverse=True)
    groups = groups[:20]
    ctx.progress(100, f"{len(groups)} dup groups")
    total = sum(g["reclaimable_bytes"] for g in groups)
    return {
        "root": root, "groups": groups, "group_count": len(groups),
        "reclaimable_bytes": total, "reclaimable": _human(total),
        "note": "matches are by size + head/tail sha256 sample (not full-content) — verify before deleting",
        "summary": f"{len(groups)} duplicate group(s) under {root}; ~{_human(total)} reclaimable",
    }


# --------------------------------------------------------------------------- #
# storage.folder.compress   (safe_write)
# --------------------------------------------------------------------------- #
def _h_storage_compress(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """tar + zstd (or gzip) a folder to `out`. Returns {out, bytes, sha256}."""
    path = _safe_repo_path(args.get("path") or "")
    if not os.path.isdir(path):
        raise ValueError(f"not a directory: {path}")
    have_zstd = shutil.which("zstd") is not None
    default_ext = "tar.zst" if have_zstd else "tar.gz"
    out = args.get("out") or f"{path.rstrip(os.sep)}.{default_ext}"
    out = _safe_repo_path(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    parent = os.path.dirname(path) or "/"
    base = os.path.basename(path.rstrip(os.sep))
    ctx.progress(20, f"compressing {base}")
    if out.endswith(".zst") and have_zstd:
        cmd = ["bash", "-lc",
               f"tar -C {json.dumps(parent)} -cf - {json.dumps(base)} "
               f"| zstd -q -19 --long -T0 -o {json.dumps(out)} -f"]
    else:
        if not out.endswith((".tar.gz", ".tgz")):
            out = out + ".tar.gz"
            out = _safe_repo_path(out)
        cmd = ["bash", "-lc",
               f"tar -C {json.dumps(parent)} -czf {json.dumps(out)} {json.dumps(base)}"]
    res = _run(cmd, timeout=600)
    if res["rc"] != 0 or not os.path.exists(out):
        raise RuntimeError(f"compression failed rc={res['rc']}: {res.get('stderr')}")
    ctx.progress(80, "hashing archive")
    size = os.path.getsize(out)
    digest = _sha256_file(out)
    ctx.progress(100, "done")
    return {
        "out": out, "bytes": size, "size": _human(size), "sha256": digest,
        "codec": "zstd" if out.endswith(".zst") else "gzip",
        "source": path,
        "summary": f"compressed {base} -> {out} ({_human(size)}, sha256 {digest[:12]}…)",
    }


# --------------------------------------------------------------------------- #
# storage.manifest.create   (safe_write)
# --------------------------------------------------------------------------- #
def _h_storage_manifest(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Build a JSON manifest of every file under `path` (relpath, size, sha256)."""
    path = _safe_repo_path(args.get("path") or "")
    out = args.get("out")
    if not os.path.isdir(path):
        raise ValueError(f"not a directory: {path}")
    out = _safe_repo_path(out) if out else f"{path.rstrip(os.sep)}.manifest.json"
    out = _safe_repo_path(out)
    ctx.progress(10, f"walking {path}")
    entries: List[Dict[str, Any]] = []
    total_bytes = 0
    file_list: List[str] = []
    for dirpath, _dirs, names in os.walk(path):
        for n in names:
            file_list.append(os.path.join(dirpath, n))
    n_files = len(file_list)
    for i, fp in enumerate(file_list):
        if ctx.cancelled:
            break
        try:
            sz = os.path.getsize(fp)
        except OSError:
            continue
        try:
            digest = _sha256_file(fp)
        except OSError:
            digest = ""
        entries.append({"path": os.path.relpath(fp, path), "size_bytes": sz, "sha256": digest})
        total_bytes += sz
        if n_files and i % 50 == 0:
            ctx.progress(10 + int(80 * i / n_files), f"hashed {i}/{n_files}")
    manifest = {
        "root": path, "created_ts": time.time(), "file_count": len(entries),
        "total_bytes": total_bytes, "total": _human(total_bytes), "files": entries,
    }
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False)
    ctx.progress(100, "done")
    return {
        "manifest": out, "file_count": len(entries), "total_bytes": total_bytes,
        "total": _human(total_bytes), "root": path,
        "summary": f"manifest of {len(entries)} file(s) ({_human(total_bytes)}) -> {out}",
    }


# --------------------------------------------------------------------------- #
# storage.restore   (destructive -> confirm + backup-first per policy)
# --------------------------------------------------------------------------- #
def _h_storage_restore(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Restore an archive (.tar.zst/.tar.gz/.tgz) into `dest`, or verify files
    against a manifest. Destructive: only runs once the permission engine has a
    human confirmation."""
    archive = args.get("archive")
    manifest = args.get("manifest")
    dest = _safe_repo_path(args.get("dest") or "")
    os.makedirs(dest, exist_ok=True)

    if manifest:
        mpath = _safe_repo_path(manifest)
        ctx.progress(20, f"verifying against {mpath}")
        with open(mpath, "r", encoding="utf-8") as f:
            man = json.load(f)
        checked = missing = mismatched = 0
        problems: List[str] = []
        for ent in man.get("files", []):
            target = os.path.join(dest, ent["path"])
            checked += 1
            if not os.path.isfile(target):
                missing += 1
                problems.append(f"missing: {ent['path']}")
                continue
            if ent.get("sha256") and _sha256_file(target) != ent["sha256"]:
                mismatched += 1
                problems.append(f"sha mismatch: {ent['path']}")
        ctx.progress(100, "verified")
        return {
            "mode": "manifest-verify", "dest": dest, "checked": checked,
            "missing": missing, "mismatched": mismatched, "problems": problems[:50],
            "summary": f"verified {checked} file(s) vs manifest: {missing} missing, {mismatched} mismatched",
        }

    if not archive:
        raise ValueError("storage.restore needs `archive` or `manifest`")
    apath = _safe_repo_path(archive)
    if not os.path.isfile(apath):
        raise ValueError(f"archive not found: {apath}")
    ctx.progress(30, f"extracting {os.path.basename(apath)} -> {dest}")
    if apath.endswith(".zst"):
        cmd = ["bash", "-lc",
               f"zstd -dc {json.dumps(apath)} | tar -C {json.dumps(dest)} -xf -"]
    else:
        cmd = ["tar", "-C", dest, "-xzf", apath]
    res = _run(cmd, timeout=600)
    if res["rc"] != 0:
        raise RuntimeError(f"restore failed rc={res['rc']}: {res.get('stderr')}")
    ctx.progress(100, "done")
    return {
        "mode": "extract", "archive": apath, "dest": dest, "rc": res["rc"],
        "summary": f"restored {os.path.basename(apath)} -> {dest}",
    }


# --------------------------------------------------------------------------- #
# gpu.status.inspect
# --------------------------------------------------------------------------- #
def _h_gpu_status_inspect(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """GET {box}/api/ps and /api/tags -> resident models + VRAM."""
    ctx.progress(25, f"GET {BOX}/api/ps")
    ps = _http_get_json(f"{BOX}/api/ps", timeout=12)
    ctx.progress(65, f"GET {BOX}/api/tags")
    tags = _http_get_json(f"{BOX}/api/tags", timeout=12)
    resident: List[Dict[str, Any]] = []
    vram_total = 0
    if ps.get("ok") and isinstance(ps.get("json"), dict):
        for m in ps["json"].get("models", []) or []:
            v = int(m.get("size_vram") or 0)
            vram_total += v
            resident.append({
                "name": m.get("name"),
                "vram_bytes": v, "vram": _human(v),
                "context_length": m.get("context_length"),
                "param_size": (m.get("details") or {}).get("parameter_size"),
                "quant": (m.get("details") or {}).get("quantization_level"),
            })
    available: List[Dict[str, Any]] = []
    if tags.get("ok") and isinstance(tags.get("json"), dict):
        for m in tags["json"].get("models", []) or []:
            available.append({
                "name": m.get("name"),
                "size_bytes": int(m.get("size") or 0),
                "size": _human(int(m.get("size") or 0)),
                "family": (m.get("details") or {}).get("family"),
            })
    ctx.progress(100, f"{len(resident)} resident")
    reachable = bool(ps.get("ok") or tags.get("ok"))
    return {
        "box": BOX, "reachable": reachable, "ps_latency_ms": ps.get("latency_ms"),
        "resident_models": resident, "available_models": available,
        "vram_in_use_bytes": vram_total, "vram_in_use": _human(vram_total),
        "error": None if reachable else (ps.get("error") or tags.get("error")),
        "summary": (f"{len(resident)} model(s) resident using {_human(vram_total)} VRAM; "
                    f"{len(available)} available on box"
                    if reachable else f"box unreachable: {ps.get('error')}"),
    }


# --------------------------------------------------------------------------- #
# file.search   (rg/grep within repo)
# --------------------------------------------------------------------------- #
_RG = shutil.which("rg")


def _h_file_search(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    query = str(args.get("query") or "")
    glob = str(args.get("glob") or "")
    top = 40
    if not query:
        return {"query": query, "matches": [], "summary": "empty query"}
    ctx.progress(20, f"searching for {query!r}")
    if _RG:
        cmd = [_RG, "--no-heading", "--line-number", "--color", "never",
               "--max-count", "5", "-S", "--fixed-strings", query, REPO_ROOT]
        if glob:
            cmd[1:1] = ["-g", glob]
    else:
        # grep fallback: honour glob via --include, recursive, fixed-string.
        cmd = ["grep", "-rnI", "--fixed-strings"]
        if glob:
            cmd += [f"--include={glob}"]
        cmd += [query, REPO_ROOT]
    res = _run(cmd, timeout=60)
    matches: List[Dict[str, Any]] = []
    for line in (res["stdout"] or "").splitlines():
        # path:line:content
        parts = line.split(":", 2)
        if len(parts) < 3:
            continue
        path, lineno, content = parts
        try:
            ln = int(lineno)
        except ValueError:
            continue
        matches.append({"path": path, "line": ln, "text": content.strip()[:300]})
        if len(matches) >= top:
            break
    ctx.progress(100, f"{len(matches)} matches")
    return {
        "query": query, "glob": glob or None, "engine": "rg" if _RG else "grep",
        "matches": matches, "count": len(matches),
        "summary": f"{len(matches)} match(es) for {query!r}" + (f" in {glob}" if glob else ""),
    }


# --------------------------------------------------------------------------- #
# file.read / file.write   (repo-sandboxed; reject "..")
# --------------------------------------------------------------------------- #
def _h_file_read(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    path = _safe_repo_path(args.get("path") or "")
    max_chars = 20000
    ctx.progress(40, f"reading {path}")
    if not os.path.isfile(path):
        return {"path": path, "exists": False, "summary": "not a file"}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        data = f.read(max_chars + 1)
    truncated = len(data) > max_chars
    ctx.progress(100, "done")
    return {
        "path": path, "exists": True, "truncated": truncated,
        "content": data[:max_chars], "bytes": os.path.getsize(path),
        "summary": f"read {len(data[:max_chars])} chars from {path}"
                   + (" (truncated at 20000)" if truncated else ""),
    }


def _h_file_write(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    path = _safe_repo_path(args.get("path") or "")
    content = args.get("content") or ""
    ctx.progress(30, f"writing {path}")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    ctx.progress(100, "done")
    n = len(content.encode("utf-8"))
    return {"path": path, "bytes_written": n,
            "summary": f"wrote {n} byte(s) to {path}"}


# --------------------------------------------------------------------------- #
# agent.memory.search / agent.memory.write   (wrap memory.py)
# --------------------------------------------------------------------------- #
def _h_agent_memory_search(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    q = args.get("query") or ""
    limit = int(args.get("limit") or 20)
    ctx.progress(40, "searching agent memory")
    hits = _memory.search(q, limit=limit)
    ctx.progress(100, f"{len(hits)} hits")
    return {"query": q, "hits": hits, "count": len(hits),
            "summary": f"{len(hits)} memory hit(s) for {q!r}"}


def _h_agent_memory_write(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    ctx.progress(40, "writing agent memory")
    rid = _memory.write(
        kind=args.get("kind") or "fact",
        key=args.get("key") or "",
        value=args.get("value"),
        tags=args.get("tags") or "",
    )
    ctx.progress(100, "stored")
    return {"id": rid, "stored": rid > 0,
            "summary": (f"remembered {args.get('key')!r} (#{rid})" if rid > 0 else "memory write failed")}


# --------------------------------------------------------------------------- #
# knowledge.stats   (counts from BRAIN_DB; path read from dashboard.py)
# --------------------------------------------------------------------------- #
def _h_knowledge_stats(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Real counts from BRAIN_DB (server/data/brain.db). Reports the per-type
    object breakdown (Topic/Measurement/Document/...), the notes count, and the
    enriched-notes count — read-only."""
    ctx.progress(20, "opening brain.db (ro)")
    out: Dict[str, Any] = {"db": BRAIN_DB, "by_type": [], "totals": {}}
    if not os.path.exists(BRAIN_DB):
        return {**out, "error": "brain.db not found", "summary": "brain.db missing"}
    try:
        c = sqlite3.connect(f"file:{BRAIN_DB}?mode=ro", uri=True, timeout=8)
        try:
            ctx.progress(50, "counting ont_object by type")
            try:
                rows = c.execute(
                    "SELECT type, COUNT(*) FROM ont_object GROUP BY type ORDER BY 2 DESC"
                ).fetchall()
                out["by_type"] = [{"type": t, "count": n} for (t, n) in rows]
            except Exception as e:  # noqa: BLE001
                out["by_type_error"] = str(e)

            def _one(sql: str) -> Optional[int]:
                try:
                    return int(c.execute(sql).fetchone()[0])
                except Exception:  # noqa: BLE001
                    return None

            ctx.progress(80, "totals")
            out["totals"] = {
                "ontology_objects": _one("SELECT COUNT(*) FROM ont_object"),
                "topics": _one("SELECT COUNT(*) FROM ont_object WHERE type='Topic'"),
                "measurements": _one("SELECT COUNT(*) FROM ont_object WHERE type='Measurement'"),
                "documents": _one("SELECT COUNT(*) FROM ont_object WHERE type='Document'"),
                "notes": _one("SELECT COUNT(*) FROM note"),
                "enriched_notes": _one(
                    "SELECT COUNT(*) FROM note WHERE frontmatter_json LIKE '%\"batch_loader\"%'"),
                "links": _one("SELECT COUNT(*) FROM ont_link"),
            }
        finally:
            c.close()
    except Exception as e:  # noqa: BLE001
        return {**out, "error": str(e), "summary": f"knowledge stats failed: {e}"}
    ctx.progress(100, "done")
    t = out["totals"]
    return {
        **out,
        "summary": (f"{t.get('topics')} topics, {t.get('measurements')} measurements, "
                    f"{t.get('documents')} documents, {t.get('notes')} notes "
                    f"({t.get('enriched_notes')} enriched); "
                    f"{t.get('ontology_objects')} ontology objects across {len(out['by_type'])} types"),
    }


# --------------------------------------------------------------------------- #
# D1: Accessibility Core handlers
# --------------------------------------------------------------------------- #
def _h_a11y_status(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Get current accessibility state and capabilities."""
    from server import dashboard as D
    ctx.progress(50, "reading a11y state")
    cur = D._a11y_read()
    ctx.progress(100, "done")
    return {
        "state": cur,
        "summary": f"HC: {cur.get('hc', False)}, scale: {cur.get('scale', 100)}%, captions: {cur.get('captions', False)}, calm: {cur.get('calm', False)}"
    }


def _h_a11y_set_mode(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Set an accessibility mode (calm, hc, reduce_motion, scan, dwell, gaze, predict)."""
    from server import dashboard as D
    mode = args.get("mode", "").lower()
    on = args.get("on", True)
    valid = {"calm", "hc", "reduce_motion", "scan", "dwell", "gaze", "predict"}
    if mode not in valid:
        return {"error": f"invalid mode {mode!r}; must be one of {valid}", "summary": "invalid mode"}

    ctx.progress(50, f"setting {mode}={on}")
    D._a11y_write({"state": {mode: on}}, "agent")
    ctx.progress(100, "done")
    return {"mode": mode, "on": on, "summary": f"{mode}: {'on' if on else 'off'}"}


def _h_a11y_text_scale(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Set text scale (100–220%)."""
    from server import dashboard as D
    scale = int(args.get("scale", 100))
    if scale < 100 or scale > 220:
        return {"error": f"scale {scale}% out of range 100–220", "summary": "invalid scale"}

    ctx.progress(50, f"setting scale {scale}%")
    D._a11y_write({"state": {"scale": scale}}, "agent")
    ctx.progress(100, "done")
    return {"scale": scale, "summary": f"text scale: {scale}%"}


def _h_a11y_read_screen(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Queue a read-screen command via the _cmd channel."""
    from server import dashboard as D
    import secrets
    import time as time_mod

    region = args.get("region", "body")
    nonce = f"{int(time_mod.time() * 1_000_000)}-{secrets.token_hex(8)}"
    ctx.progress(50, f"queueing read-screen {region!r}")
    D._a11y_write({}, "agent", cmd={"action": "read_screen", "region": region, "nonce": nonce, "ts": int(time_mod.time() * 1000)})
    ctx.progress(100, "done")
    return {"action": "read_screen", "region": region, "summary": f"queued: read {region}"}


def _h_a11y_captions(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Toggle captions on/off."""
    from server import dashboard as D
    on = args.get("on", True)
    ctx.progress(50, f"setting captions={on}")
    D._a11y_write({"state": {"captions": on, "captionVideo": on}}, "agent")
    ctx.progress(100, "done")
    return {"captions": on, "summary": f"captions: {'on' if on else 'off'}"}


def _h_a11y_speak(args: Dict[str, Any], ctx: Any) -> Dict[str, Any]:
    """Queue a speak command via the _cmd channel."""
    from server import dashboard as D
    import secrets
    import time as time_mod

    text = args.get("text", "")
    priority = args.get("priority", "normal")
    if not text:
        return {"error": "text is required", "summary": "no text"}

    nonce = f"{int(time_mod.time() * 1_000_000)}-{secrets.token_hex(8)}"
    ctx.progress(50, f"queueing speak ({priority})")
    D._a11y_write({}, "agent", cmd={"action": "speak", "text": text, "priority": priority, "nonce": nonce, "ts": int(time_mod.time() * 1000)})
    ctx.progress(100, "done")
    return {"text": text[:50], "priority": priority, "summary": f"queued: {text[:50]}..."}


# --------------------------------------------------------------------------- #
# Register the catalog (idempotent)
# --------------------------------------------------------------------------- #
def register_catalog() -> List[str]:
    register(Tool(
        id="server.disk.audit", name="Disk audit", risk="safe_read", timeout=140,
        description="df -h /opt plus du of the largest directories under the repo (top 15).",
        input_schema={"type": "object", "properties": {}},
        tags=["server", "disk", "storage"], handler=_h_server_disk_audit))

    register(Tool(
        id="server.cpu.inspect", name="CPU inspect", risk="safe_read", timeout=20,
        description="Load average, CPU count, and the top 5 processes by CPU.",
        input_schema={"type": "object", "properties": {}},
        tags=["server", "cpu", "system"], handler=_h_server_cpu_inspect))

    register(Tool(
        id="server.logs.read", name="Read service logs", risk="safe_read", timeout=35,
        description="Tail a pm2 service's logs (read-only, --nostream).",
        input_schema={"type": "object", "properties": {
            "service": {"type": "string", "description": "pm2 process name"},
            "lines": {"type": "integer", "default": 50, "description": "How many lines to tail"}},
            "required": ["service"]},
        tags=["server", "logs", "pm2"], handler=_h_server_logs_read))

    register(Tool(
        id="docker.usage.inspect", name="Docker usage", risk="safe_read", timeout=35,
        description="docker system df (parsed) plus running/total container counts.",
        input_schema={"type": "object", "properties": {}},
        tags=["docker", "storage"], handler=_h_docker_usage_inspect))

    register(Tool(
        id="docker.prune.safe", name="Docker prune (safe)", risk="system_change", timeout=200,
        description="docker system prune -f to reclaim dangling images/containers/networks. "
                    "Requires confirmation (system_change).",
        input_schema={"type": "object", "properties": {}},
        tags=["docker", "cleanup"], handler=_h_docker_prune_safe))

    register(Tool(
        id="storage.large_files.find", name="Find large files", risk="safe_read", timeout=200,
        description="Find the largest files (top 25) under a path, sandboxed to /opt.",
        input_schema={"type": "object", "properties": {
            "root": {"type": "string", "default": "/opt", "description": "Scan root (must be under /opt)"},
            "min_mb": {"type": "number", "default": 0, "description": "Minimum file size in MB"}}},
        tags=["storage", "disk"], handler=_h_storage_large_files))

    register(Tool(
        id="storage.duplicates.find", name="Find duplicates", risk="safe_read", timeout=240,
        description="Find duplicate-file candidates by size + head/tail sha256 sample (top 20 groups), "
                    "sandboxed to /opt.",
        input_schema={"type": "object", "properties": {
            "root": {"type": "string", "default": "/opt", "description": "Scan root (must be under /opt)"},
            "min_mb": {"type": "number", "default": 1, "description": "Ignore files smaller than this"}}},
        tags=["storage", "dedupe"], handler=_h_storage_duplicates))

    register(Tool(
        id="storage.folder.compress", name="Compress folder", risk="safe_write", timeout=600,
        description="tar + zstd (or gzip) a folder to an archive; returns {out, bytes, sha256}. "
                    "Both path and out must be inside the repo.",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string", "description": "Folder to compress (in-repo)"},
            "out": {"type": "string", "description": "Output archive path (in-repo); default <path>.tar.zst"}},
            "required": ["path"]},
        tags=["storage", "compress"], handler=_h_storage_compress))

    register(Tool(
        id="storage.manifest.create", name="Create manifest", risk="safe_write", timeout=600,
        description="Write a JSON manifest of every file under a folder (relpath, size, sha256). In-repo only.",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string", "description": "Folder to manifest (in-repo)"},
            "out": {"type": "string", "description": "Output manifest path; default <path>.manifest.json"}},
            "required": ["path"]},
        tags=["storage", "manifest"], handler=_h_storage_manifest))

    register(Tool(
        id="storage.restore", name="Restore archive/manifest", risk="destructive", timeout=600,
        description="Extract an archive into dest, or verify dest against a manifest. "
                    "Destructive — requires confirmation; a backup/manifest is taken first by policy.",
        input_schema={"type": "object", "properties": {
            "archive": {"type": "string", "description": "Archive to extract (in-repo)"},
            "manifest": {"type": "string", "description": "Manifest to verify against (in-repo)"},
            "dest": {"type": "string", "description": "Destination directory (in-repo)"}},
            "required": ["dest"]},
        tags=["storage", "restore"], handler=_h_storage_restore))

    register(Tool(
        id="gpu.status.inspect", name="GPU / box model status", risk="safe_read", timeout=20,
        description="GET the box Ollama /api/ps and /api/tags: resident models + VRAM, plus available models.",
        input_schema={"type": "object", "properties": {}},
        tags=["gpu", "box", "llm"], handler=_h_gpu_status_inspect))

    register(Tool(
        id="file.search", name="Search files", risk="safe_read", timeout=60,
        description="ripgrep/grep within the repo; returns the top 40 matches (path, line, text).",
        input_schema={"type": "object", "properties": {
            "query": {"type": "string", "description": "Literal text to search for"},
            "glob": {"type": "string", "description": "Optional filename glob, e.g. *.py"}},
            "required": ["query"]},
        tags=["file", "search"], handler=_h_file_search))

    register(Tool(
        id="file.read", name="Read file", risk="safe_read", timeout=15,
        description="Read a UTF-8 text file inside the repo (<=20000 chars). Rejects '..'.",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string"}}, "required": ["path"]},
        tags=["file"], handler=_h_file_read))

    register(Tool(
        id="file.write", name="Write file", risk="safe_write", timeout=15,
        description="Write a text file inside the repo (rejects '..'; auto-allowed in-repo).",
        input_schema={"type": "object", "properties": {
            "path": {"type": "string"}, "content": {"type": "string"}},
            "required": ["path", "content"]},
        tags=["file"], handler=_h_file_write))

    register(Tool(
        id="agent.memory.search", name="Search agent memory", risk="safe_read", timeout=10,
        description="Search durable agent memory (LIKE over key/value/tags).",
        input_schema={"type": "object", "properties": {
            "query": {"type": "string"}, "limit": {"type": "integer", "default": 20}}},
        tags=["memory"], handler=_h_agent_memory_search))

    register(Tool(
        id="agent.memory.write", name="Write agent memory", risk="safe_write", timeout=10,
        description="Persist a fact into durable agent memory (kind/key/value/tags).",
        input_schema={"type": "object", "properties": {
            "key": {"type": "string"}, "value": {"type": "string"},
            "kind": {"type": "string", "default": "fact"}, "tags": {"type": "string", "default": ""}},
            "required": ["value"]},
        tags=["memory"], handler=_h_agent_memory_write))

    register(Tool(
        id="knowledge.stats", name="Knowledge stats", risk="safe_read", timeout=20,
        description="Real counts from BRAIN_DB (brain.db): objects by type, topics, measurements, "
                    "documents, notes, enriched notes, links.",
        input_schema={"type": "object", "properties": {}},
        tags=["brain", "knowledge"], handler=_h_knowledge_stats))

    # D1: Accessibility Core agent tools
    register(Tool(
        id="accessibility.status", name="A11Y status", risk="safe_read", timeout=5,
        description="Get current accessibility mode state and capabilities (HC, scale, captions, gaze, etc.).",
        input_schema={"type": "object", "properties": {}},
        tags=["accessibility", "a11y"], handler=_h_a11y_status))

    register(Tool(
        id="accessibility.set_mode", name="A11Y set mode", risk="safe_write", timeout=5,
        description="Set accessibility mode (calm, hc, reduce_motion, scan, dwell, gaze, predict).",
        input_schema={"type": "object", "properties": {
            "mode": {"type": "string", "enum": ["calm", "hc", "reduce_motion", "scan", "dwell", "gaze", "predict"]},
            "on": {"type": "boolean", "default": True}},
            "required": ["mode"]},
        tags=["accessibility", "a11y"], handler=_h_a11y_set_mode))

    register(Tool(
        id="accessibility.text_scale", name="A11Y text scale", risk="safe_write", timeout=5,
        description="Set text scale from 100–220%.",
        input_schema={"type": "object", "properties": {
            "scale": {"type": "integer", "minimum": 100, "maximum": 220, "default": 100}},
            "required": ["scale"]},
        tags=["accessibility", "a11y"], handler=_h_a11y_text_scale))

    register(Tool(
        id="accessibility.read_screen", name="A11Y read screen", risk="safe_write", timeout=10,
        description="Read the entire screen aloud (from body or optional region selector).",
        input_schema={"type": "object", "properties": {
            "region": {"type": "string", "description": "CSS selector for region to read (default: body)"}}},
        tags=["accessibility", "a11y"], handler=_h_a11y_read_screen))

    register(Tool(
        id="accessibility.captions", name="A11Y captions", risk="safe_write", timeout=5,
        description="Toggle captions on/off (both bar and video).",
        input_schema={"type": "object", "properties": {
            "on": {"type": "boolean", "default": True}},
            "required": ["on"]},
        tags=["accessibility", "a11y"], handler=_h_a11y_captions))

    register(Tool(
        id="accessibility.speak", name="A11Y speak", risk="safe_write", timeout=5,
        description="Speak a text message with optional priority (barge-in interrupts current speech).",
        input_schema={"type": "object", "properties": {
            "text": {"type": "string"},
            "priority": {"type": "string", "enum": ["emergency", "barge-in", "normal", "background"], "default": "normal"}},
            "required": ["text"]},
        tags=["accessibility", "a11y"], handler=_h_a11y_speak))

    return [
        "server.disk.audit", "server.cpu.inspect", "server.logs.read",
        "docker.usage.inspect", "docker.prune.safe",
        "storage.large_files.find", "storage.duplicates.find",
        "storage.folder.compress", "storage.manifest.create", "storage.restore",
        "gpu.status.inspect", "file.search", "file.read", "file.write",
        "agent.memory.search", "agent.memory.write", "knowledge.stats",
        "accessibility.status", "accessibility.set_mode", "accessibility.text_scale",
        "accessibility.read_screen", "accessibility.captions", "accessibility.speak",
    ]


CATALOG_IDS = register_catalog()
