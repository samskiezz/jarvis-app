"""SCRAPE ENGINE REGISTRY — every crawler/recon tool, with honest availability.

A pluggable bundle. Each engine declares its kind, how to detect whether it's
actually installed here, and an install hint. Nothing is faked: ``list_engines``
reports ``available`` from a real import / ``which`` probe, so the UI shows exactly
what can run in this environment vs. what to install on a bigger host.

Three classes of engine:

  * content   — fetch + store page content (the catalogue use case). Safe on the
                public open-data sources. e.g. scrapling, scrapy, cloudscraper.
  * browser   — stealth/JS-rendering browsers for bot-walled or JS pages. Need
                browser binaries (~80-400MB). e.g. camoufox, undetected-chromedriver,
                botasaurus.
  * recon     — endpoint/parameter discovery + fuzzing (httpx, katana, ffuf,
                kiterunner, arjun). DUAL-USE: these probe/brute-force a target, so
                they are GOVERNED — only runnable against an explicit allow-list of
                assets you own/are authorised to test, never the third-party
                catalogue. See ``recon_allowed``.

stdlib + best-effort imports. Never raises.
"""

from __future__ import annotations

import importlib.util
import os
import shutil

# name -> (kind, how-to-detect, install hint). detect: ("py", module) or ("bin", cmd).
_REGISTRY = {
    # ── content ────────────────────────────────────────────────────────────────
    "sequential":  ("content", ("py", "urllib"),       "stdlib (always available)"),
    "scrapling":   ("content", ("py", "scrapling"),    "pip install scrapling curl_cffi browserforge"),
    "scrapy":      ("content", ("py", "scrapy"),       "pip install scrapy"),
    "cloudscraper":("content", ("py", "cloudscraper"), "pip install cloudscraper"),
    # ── browser (stealth / JS) ─────────────────────────────────────────────────
    "camoufox":              ("browser", ("py", "camoufox"),               "pip install camoufox[geoip] && camoufox fetch"),
    "undetected_chromedriver":("browser", ("py", "undetected_chromedriver"),"pip install undetected-chromedriver (needs Chrome)"),
    "botasaurus":            ("browser", ("py", "botasaurus_driver"),      "pip install botasaurus-driver (needs Chrome)"),
    # ── recon (GOVERNED — authorised targets only) ─────────────────────────────
    "httpx_pd":   ("recon", ("bin", "httpx"),      "go install github.com/projectdiscovery/httpx/cmd/httpx@latest"),
    "katana":     ("recon", ("bin", "katana"),     "go install github.com/projectdiscovery/katana/cmd/katana@latest"),
    "ffuf":       ("recon", ("bin", "ffuf"),       "go install github.com/ffuf/ffuf/v2@latest"),
    "kiterunner": ("recon", ("bin", "kr"),         "go install github.com/assetnote/kiterunner@latest"),
    "arjun":      ("recon", ("bin", "arjun"),      "pipx install arjun"),
}


def _is_elf(path: str) -> bool:
    """True if path is a real compiled binary (excludes python-CLI shims that share
    a name, e.g. the python 'httpx' vs ProjectDiscovery's Go 'httpx')."""
    try:
        with open(path, "rb") as f:
            return f.read(4) == b"\x7fELF"
    except Exception:  # noqa: BLE001
        return False


def _detect(spec) -> bool:
    how = spec[1]
    try:
        if how[0] == "py":
            if how[1] == "urllib":
                return True
            return importlib.util.find_spec(how[1]) is not None
        if how[0] == "bin":
            p = shutil.which(how[1])
            return bool(p) and _is_elf(p)  # must be a real compiled tool, not a shim
    except Exception:  # noqa: BLE001
        return False
    return False


def list_engines() -> dict:
    """Every engine with real availability, grouped by kind. Never raises."""
    out: dict = {"content": [], "browser": [], "recon": []}
    for name, spec in _REGISTRY.items():
        kind, how, hint = spec
        out[kind].append({
            "name": name, "available": _detect(spec),
            "detect": f"{how[0]}:{how[1]}", "install": hint,
        })
    counts = {k: sum(1 for e in v if e["available"]) for k, v in out.items()}
    return {"engines": out, "available_counts": counts,
            "note": ("content/browser engines fetch page content (safe on public "
                     "open-data sources); recon engines are governed — authorised, "
                     "allow-listed targets only (your own assets), never the catalogue.")}


def best_content_engine() -> str:
    """Pick the strongest installed content engine (impersonation > plain)."""
    for name in ("scrapling", "cloudscraper", "scrapy", "sequential"):
        if _detect(_REGISTRY[name]):
            return name
    return "sequential"


# ── recon governance ─────────────────────────────────────────────────────────────
def _recon_allowlist() -> set:
    """Hosts you are authorised to probe/fuzz — from RECON_ALLOWLIST (comma-sep).
    Empty by default: recon is OFF until you opt in with your own assets."""
    raw = os.environ.get("RECON_ALLOWLIST", "")
    return {h.strip().lower() for h in raw.split(",") if h.strip()}


def _run_tool(argv: list, timeout: int = 120) -> dict:
    """Shell out to a recon/crawl binary, capture stdout. Never raises."""
    import subprocess
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        out = (p.stdout or "").strip()
        return {"ok": p.returncode == 0 or bool(out), "returncode": p.returncode,
                "lines": [l for l in out.splitlines() if l.strip()],
                "stderr": (p.stderr or "")[:400]}
    except FileNotFoundError:
        return {"ok": False, "error": "tool not installed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout after {timeout}s"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def katana_discover(seed_url: str, *, depth: int = 2, max_urls: int = 200,
                    timeout: int = 120) -> dict:
    """Crawl a seed with katana (read-only link discovery) and return URLs found.
    Crawling links is gentle content discovery — fine on public open-data sources.
    Falls back cleanly if katana isn't installed. Never raises."""
    if not _detect(_REGISTRY["katana"]):
        return {"ok": False, "error": "katana not installed", "urls": []}
    res = _run_tool(["katana", "-u", seed_url, "-d", str(int(depth)),
                     "-jc", "-silent", "-rl", "10"], timeout=timeout)
    urls = [u for u in res.get("lines", []) if u.startswith("http")][:max_urls]
    return {"ok": bool(urls), "seed": seed_url, "count": len(urls), "urls": urls,
            "error": res.get("error")}


# Tool → argv builder for the governed recon runner. {target} is substituted.
_RECON_CMD = {
    "katana": lambda t, extra: ["katana", "-u", t, "-silent", "-d", "2", *extra],
    "ffuf": lambda t, extra: ["ffuf", "-u", t, "-mc", "200,204,301,302,401,403", "-s", *extra],
    "kiterunner": lambda t, extra: ["kr", "scan", t, "-x", "10", *extra],
    "httpx_pd": lambda t, extra: ["httpx-pd", "-u", t, "-silent", *extra],
}


def run_recon(tool: str, target: str, *, authorized: bool = False,
              extra: list | None = None, timeout: int = 180) -> dict:
    """Run a recon/fuzz tool against an AUTHORISED, allow-listed target.

    The gate exists to protect the platform: pointing fuzzers (ffuf/kiterunner) at
    third-party infrastructure gets the IP banned and can DoS them. Targets must be
    on RECON_ALLOWLIST (hosts you own/control). katana (read-only crawl) is the
    gentle option. Never raises."""
    import urllib.parse
    host = urllib.parse.urlparse(target if "://" in target else f"//{target}").netloc.lower()
    host = host.split(":")[0]
    ok, reason = recon_allowed(host, authorized=authorized)
    if not ok:
        return {"ok": False, "blocked": True, "reason": reason, "target": target}
    if tool not in _RECON_CMD:
        return {"ok": False, "error": f"unknown recon tool: {tool}"}
    if not _detect(_REGISTRY.get(tool, ("recon", ("bin", tool), ""))):
        return {"ok": False, "error": f"{tool} not installed"}
    argv = _RECON_CMD[tool](target, extra or [])
    res = _run_tool(argv, timeout=timeout)
    res.update({"tool": tool, "target": target, "authorized": True})
    return res


def recon_allowed(target_host: str, *, authorized: bool) -> tuple[bool, str]:
    """Gate a recon run. Requires explicit authorization AND the target host on the
    allow-list. Returns (ok, reason). This is what keeps the offensive tools from
    ever being pointed at third-party public APIs."""
    host = (target_host or "").lower().strip()
    if not authorized:
        return False, "recon requires explicit authorization (authorized=true)"
    allow = _recon_allowlist()
    if not allow:
        return False, "RECON_ALLOWLIST is empty — add hosts you own/control to enable recon"
    if host not in allow and not any(host.endswith("." + a) or host == a for a in allow):
        return False, f"target '{host}' not in RECON_ALLOWLIST"
    return True, "authorized"
