"""Discovers all named subsystems: routes, pm2 entries, mini-apps, forge agents,
world_os runtimes, underworld services. Cross-references against the named-
subsystem catalog provided by the Explore-agent map."""
from __future__ import annotations

import json
import os
import re
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Known named subsystems with their primary entry-file fragments. Sourced from
# the Explore-agent mapping run (Apollo/Ontology/AIP/Underworld/Forge/Brain/etc.)
NAMED = {
    # Palantir-family
    "apollo":     {"family": "palantir", "primary": "server/services/jarvis_apollo.py"},
    "ontology":   {"family": "palantir", "primary": "server/services/jarvis_ontology.py"},
    "aip":        {"family": "palantir", "primary": "server/routes/aip.py"},
    "gotham":     {"family": "palantir", "primary": "world_os/gotham_runtime"},
    "foundry":    {"family": "palantir", "primary": "world_os/foundry_runtime"},
    "palantir":   {"family": "palantir", "primary": "scripts/build_palantir_manifest.py"},
    # JARVIS subsystems
    "assurance":  {"family": "jarvis-core", "primary": "assurance/"},
    "forge":      {"family": "jarvis-core", "primary": "forge/forge_agent.py"},
    "underworld": {"family": "jarvis-core", "primary": "underworld/server/main.py"},
    "brain":      {"family": "jarvis-core", "primary": "server/services/brain_autopilot.py"},
    "solar":      {"family": "jarvis-app",  "primary": "server/routes/solar.py"},
    "nexus":      {"family": "jarvis-app",  "primary": "server/routes/search_semantic.py"},
    "celestial":  {"family": "jarvis-app",  "primary": "scripts/scan_repo_to_celestial_index.py"},
    "codepulse":  {"family": "jarvis-app",  "primary": "server/routes/codepulse.py"},
    "voiceforge": {"family": "jarvis-app",  "primary": "server/routes/voice_forge.py"},
    "specforge":  {"family": "jarvis-app",  "primary": "server/routes/spec_forge.py"},
    "decision_ledger": {"family": "jarvis-app", "primary": "server/routes/decision_ledger.py"},
    "dead_zone_finder": {"family": "jarvis-app", "primary": "server/routes/dead_zone_finder.py"},
    "friction_map": {"family": "jarvis-app", "primary": "server/routes/friction_map.py"},
    "proof_pack": {"family": "jarvis-app", "primary": "server/routes/proof_pack.py"},
    "panickey":   {"family": "jarvis-app", "primary": "server/routes/panickey.py"},
    "swarms":     {"family": "jarvis-app", "primary": "server/services/inf_swarm.py"},
    "investigations": {"family": "jarvis-app", "primary": "server/routes/investigations.py"},
    "intent_inbox": {"family": "jarvis-app", "primary": "server/routes/intent_inbox.py"},
    "ritual_deck": {"family": "jarvis-app", "primary": "server/routes/ritual_deck.py"},
    "thought_compressor": {"family": "jarvis-app", "primary": "server/routes/thought_compressor.py"},
    "mode_mixer": {"family": "jarvis-app", "primary": "server/routes/mode_mixer.py"},
    "asset_dna":  {"family": "jarvis-app", "primary": "server/routes/asset_dna.py"},
    "guardian":   {"family": "jarvis-app", "primary": "server/care.html"},
    "motor":      {"family": "jarvis-app", "primary": "server/routes/motor.py"},
    "vision":     {"family": "jarvis-app", "primary": "server/routes/vision.py"},
    "voice":      {"family": "jarvis-app", "primary": "server/routes/voice.py"},
    "music":      {"family": "jarvis-app", "primary": "server/routes/music.py"},
    "second_brain": {"family": "jarvis-app", "primary": "server/routes/second_brain.py"},
    "brain_crm":  {"family": "jarvis-app", "primary": "server/routes/brain_crm.py"},
    "brain_research": {"family": "jarvis-app", "primary": "server/routes/brain_research.py"},
    "graph":      {"family": "jarvis-app", "primary": "server/routes/graph.py"},
    "datasets":   {"family": "jarvis-app", "primary": "server/routes/datasets.py"},
    "connectors": {"family": "jarvis-app", "primary": "server/routes/connectors.py"},
    "pipelines":  {"family": "jarvis-app", "primary": "server/routes/pipelines.py"},
    "predict":    {"family": "jarvis-app", "primary": "server/routes/predict.py"},
    "scenario":   {"family": "jarvis-app", "primary": "server/routes/scenario.py"},
    "claude_code": {"family": "jarvis-app", "primary": "server/routes/claude_code.py"},
    "cinematic":  {"family": "jarvis-app", "primary": "server/routes/cinematic.py"},
    "openclaw":   {"family": "jarvis-app", "primary": "server/services/openclaw_manager.py"},
    "vault":      {"family": "jarvis-app", "primary": "server/routes/vault.py"},
    "tenancy":    {"family": "jarvis-app", "primary": "server/routes/tenancy.py"},
    "security":   {"family": "jarvis-app", "primary": "server/routes/security.py"},
    "labs":       {"family": "jarvis-app", "primary": "server/routes/labs.py"},
    "workshop":   {"family": "jarvis-app", "primary": "server/routes/workshop.py"},
    "ops":        {"family": "jarvis-app", "primary": "server/routes/ops.py"},
    "history":    {"family": "jarvis-app", "primary": "server/routes/history.py"},
    "reminders":  {"family": "jarvis-app", "primary": "server/routes/reminders.py"},
    "geo":        {"family": "jarvis-app", "primary": "server/routes/geo.py"},
    "temporal":   {"family": "jarvis-app", "primary": "server/routes/temporal.py"},
    "messages":   {"family": "jarvis-app", "primary": "server/routes/messages.py"},
    "phone":      {"family": "jarvis-app", "primary": "server/routes/phone.py"},
    "sensors":    {"family": "jarvis-app", "primary": "server/routes/sensors.py"},
    "vpn":        {"family": "jarvis-app", "primary": "server/routes/vpn.py"},
    "agent":      {"family": "jarvis-app", "primary": "server/routes/jarvis_agent.py"},
    "a11y":       {"family": "jarvis-app", "primary": "server/routes/a11y_drivers.py"},
    "collab":     {"family": "jarvis-app", "primary": "server/routes/collab.py"},
    "reports":    {"family": "jarvis-app", "primary": "server/routes/reports.py"},
    "governance": {"family": "jarvis-app", "primary": "server/routes/governance.py"},
    "panic":      {"family": "jarvis-app", "primary": "server/routes/panickey.py"},
}


def _exists(rel: str) -> bool:
    return os.path.exists(os.path.join(ROOT, rel))


def _mtime(rel: str) -> float:
    p = os.path.join(ROOT, rel)
    if not os.path.exists(p):
        return 0.0
    try:
        if os.path.isdir(p):
            return max(
                (os.path.getmtime(os.path.join(r, f))
                 for r, _, fs in os.walk(p) for f in fs),
                default=0.0,
            )
        return os.path.getmtime(p)
    except OSError:
        return 0.0


def _find_route_module(name: str) -> str | None:
    candidates = [
        f"server/routes/{name}.py",
        f"server/routes/jarvis_{name}.py",
        f"server/routes/{name}_routes.py",
    ]
    for c in candidates:
        if _exists(c):
            return c
    return None


def _find_service_module(name: str) -> str | None:
    candidates = [
        f"server/services/{name}.py",
        f"server/services/jarvis_{name}.py",
        f"server/services/{name}_service.py",
    ]
    for c in candidates:
        if _exists(c):
            return c
    return None


def _scan_pm2() -> dict[str, dict[str, Any]]:
    """Parse ecosystem.config.cjs name: + script: pairs (no JS exec)."""
    path = os.path.join(ROOT, "ecosystem.config.cjs")
    out: dict[str, dict[str, Any]] = {}
    if not os.path.exists(path):
        return out
    try:
        with open(path, encoding="utf-8") as fh:
            txt = fh.read()
    except OSError:
        return out
    entries = re.findall(
        r"name:\s*['\"]([^'\"]+)['\"][^}]*?script:\s*['\"]([^'\"]+)['\"]",
        txt, re.DOTALL,
    )
    for name, script in entries:
        out[name] = {"script": script, "source": "ecosystem.config.cjs"}
    return out


def _scan_miniapps() -> list[dict[str, Any]]:
    """Pull MINI_APPS=[{id,ic,t,d}] from server/jarvis_live.html (regex; no JS exec)."""
    path = os.path.join(ROOT, "server", "jarvis_live.html")
    out: list[dict[str, Any]] = []
    if not os.path.exists(path):
        return out
    try:
        with open(path, encoding="utf-8") as fh:
            txt = fh.read()
    except OSError:
        return out
    start = txt.find("const MINI_APPS=[")
    if start < 0:
        return out
    end = txt.find("\n];", start)
    if end < 0:
        return out
    chunk = txt[start:end]
    for m in re.finditer(r"\{id:'([^']+)',ic:'([^']+)',t:'([^']+)',d:'([^']*)'\}", chunk):
        out.append({"id": m.group(1), "icon": m.group(2), "title": m.group(3),
                    "desc": m.group(4)})
    return out


def _scan_routes_registered() -> list[str]:
    path = os.path.join(ROOT, "server", "main.py")
    out: list[str] = []
    if not os.path.exists(path):
        return out
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                m = re.search(r"include_router\(([a-zA-Z_]+)\.router\)", line)
                if m:
                    out.append(m.group(1))
    except OSError:
        return out
    return out


def classify_one(name: str, meta: dict[str, Any], pm2: dict, miniapps: list,
                 registered: set, now: float) -> dict[str, Any]:
    primary = meta["primary"]
    primary_exists = _exists(primary)
    primary_mtime = _mtime(primary) if primary_exists else 0.0
    age_days = (now - primary_mtime) / 86400.0 if primary_mtime else 1e6

    route = _find_route_module(name) or (primary if primary.startswith("server/routes/") else None)
    service = _find_service_module(name) or (primary if primary.startswith("server/services/") else None)

    pm2_entry = None
    for pm2_name in pm2:
        if name in pm2_name or pm2_name.replace("-", "_").endswith(name):
            pm2_entry = pm2_name
            break

    mini = None
    for ma in miniapps:
        if ma["id"] == name or name in ma["id"] or ma["id"] in name:
            mini = ma
            break

    # Status decision tree
    if not primary_exists:
        status = "missing"
    elif pm2_entry:
        status = "alive_supervised"
    elif route and any(name in r or r.endswith(name) for r in registered):
        status = "alive_routed"
    elif age_days < 30 and primary.startswith(("server/routes/", "server/services/", "scripts/")):
        status = "alive_recent"
    elif primary.startswith("world_os/") or any(p in primary for p in ("plane", "/scaffold")):
        status = "dormant_scaffold"
    elif age_days > 180:
        status = "stale"
    else:
        status = "present"

    return {
        "name": name,
        "family": meta["family"],
        "primary": primary,
        "primary_exists": primary_exists,
        "primary_age_days": round(age_days, 1) if age_days < 1e5 else None,
        "route_module": route,
        "service_module": service,
        "pm2_entry": pm2_entry,
        "mini_app": mini,
        "status": status,
    }


def extract() -> dict[str, Any]:
    now = time.time()
    pm2 = _scan_pm2()
    miniapps = _scan_miniapps()
    registered = set(_scan_routes_registered())
    out = {"generated_at": now, "subsystems": {}, "summary": {}, "n_subsystems": len(NAMED)}
    by_status: dict[str, int] = {}
    by_family: dict[str, int] = {}
    for name, meta in NAMED.items():
        info = classify_one(name, meta, pm2, miniapps, registered, now)
        out["subsystems"][name] = info
        by_status[info["status"]] = by_status.get(info["status"], 0) + 1
        by_family[info["family"]] = by_family.get(info["family"], 0) + 1
    out["summary"] = {
        "by_status": by_status,
        "by_family": by_family,
        "pm2_entries_found": len(pm2),
        "mini_apps_found": len(miniapps),
        "registered_routers": len(registered),
    }
    out["pm2"] = pm2
    out["mini_apps"] = miniapps
    out["registered_routers"] = sorted(registered)
    return out


def write_outputs(intel_dir: str) -> None:
    out = extract()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "subsystem-registry.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    lines = [
        "# Subsystem Registry",
        "",
        f"**Generated**: {int(out['generated_at'])}",
        f"**Total**: {out['n_subsystems']} known + auto-detected",
        f"**pm2 entries**: {out['summary']['pm2_entries_found']}",
        f"**mini-apps**: {out['summary']['mini_apps_found']}",
        f"**registered routers**: {out['summary']['registered_routers']}",
        "",
        "## By status",
        "| Status | Count |",
        "|---|---|",
    ]
    for s, c in sorted(out["summary"]["by_status"].items(), key=lambda kv: -kv[1]):
        lines.append(f"| {s} | {c} |")
    lines += [
        "",
        "## By family",
        "| Family | Count |",
        "|---|---|",
    ]
    for f, c in sorted(out["summary"]["by_family"].items(), key=lambda kv: -kv[1]):
        lines.append(f"| {f} | {c} |")
    lines += [
        "",
        "## Subsystems",
        "| Name | Family | Status | Primary | Route | Service | pm2 | mini-app | age (d) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for n, info in sorted(out["subsystems"].items()):
        lines.append(
            f"| `{n}` | {info['family']} | {info['status']} | "
            f"`{info['primary']}` | "
            f"{info['route_module'] or '—'} | "
            f"{info['service_module'] or '—'} | "
            f"{info['pm2_entry'] or '—'} | "
            f"{(info['mini_app'] or {}).get('id', '—')} | "
            f"{info['primary_age_days'] or '—'} |"
        )
    with open(os.path.join(intel_dir, "subsystem-registry.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"subsystem-registry written to {intel}")
