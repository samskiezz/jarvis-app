"""Renders the markdown mission-control reports."""
from __future__ import annotations

import json
import os
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REPORTS_DIR = os.path.join(ROOT, "autopilot", "reports")
INTEL_DIR = os.path.join(ROOT, "autopilot", "intelligence")


def write_system_status() -> str:
    """Aggregate the latest discoveries + state into a system-status report."""
    intel: dict[str, Any] = {}
    for fname in ("plane-map.json", "subsystem-registry.json", "resource-map.json",
                  "db-catalogue.json", "capability-registry.json", "integration-graph.json",
                  "unknown-systems.json", "system-limitations.json"):
        p = os.path.join(INTEL_DIR, fname)
        if os.path.exists(p):
            try:
                with open(p) as fh:
                    intel[fname.rsplit(".", 1)[0]] = json.load(fh)
            except (OSError, json.JSONDecodeError):
                pass

    # Compute health score (simple weighted)
    score = 100
    issues: list[str] = []
    if intel.get("resource-map", {}).get("resources", {}).get("brain", {}).get("state") in ("missing", "offline"):
        score -= 25
        issues.append("brain offline")
    if intel.get("resource-map", {}).get("resources", {}).get("health_watchdog", {}).get("overall_ok") is False:
        score -= 15
        issues.append("health watchdog probes failing")
    dangerous = intel.get("unknown-systems", {}).get("summary", {}).get("dangerous_patterns_n", 0)
    if dangerous > 5:
        score -= 5
        issues.append(f"{dangerous} dangerous patterns")
    orphans = intel.get("unknown-systems", {}).get("summary", {}).get("orphan_scripts_n", 0)
    if orphans > 0:
        score -= 3
        issues.append(f"{orphans} orphan scripts")
    lims = intel.get("system-limitations", {}).get("by_kind", {})
    if lims.get("swallowed_exception", 0) > 50:
        score -= 5
        issues.append(f"{lims['swallowed_exception']} swallowed exceptions")
    score = max(0, min(100, score))

    snap = {
        "timestamp": time.time(),
        "health_score": score,
        "issues": issues,
        "planes": {
            "total": (intel.get("plane-map") or {}).get("n_planes", 0),
            "alive": (intel.get("plane-map") or {}).get("n_alive", 0),
            "dormant": (intel.get("plane-map") or {}).get("n_dormant", 0),
        },
        "subsystems": {
            "total": (intel.get("subsystem-registry") or {}).get("n_subsystems", 0),
            "by_status": (intel.get("subsystem-registry") or {}).get("summary", {}).get("by_status", {}),
        },
        "resources": {
            "pm2_total": (intel.get("resource-map") or {}).get("resources", {}).get("pm2", {}).get("count", 0),
            "pm2_online": (intel.get("resource-map") or {}).get("resources", {}).get("pm2", {}).get("online", 0),
            "brain_state": (intel.get("resource-map") or {}).get("resources", {}).get("brain", {}).get("state"),
        },
        "dbs": {
            "n_dbs": (intel.get("db-catalogue") or {}).get("n_dbs", 0),
            "total_mb": round((intel.get("db-catalogue") or {}).get("total_size_bytes", 0) / 1024 / 1024, 1),
        },
        "capabilities": {
            "endpoints_total": len((intel.get("capability-registry") or {}).get("capabilities", [])),
            "by_risk": (intel.get("capability-registry") or {}).get("by_risk", {}),
        },
        "unknowns": (intel.get("unknown-systems") or {}).get("summary", {}),
        "limitations_by_kind": (intel.get("system-limitations") or {}).get("by_kind", {}),
    }

    os.makedirs(REPORTS_DIR, exist_ok=True)
    json_path = os.path.join(REPORTS_DIR, "system-status.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(snap, fh, indent=2)

    md = [
        "# Mission Control — System Status",
        "",
        f"**Generated**: {int(snap['timestamp'])}",
        f"**Health Score**: {snap['health_score']}/100",
        "",
    ]
    if snap["issues"]:
        md.append("**Issues**:")
        for i in snap["issues"]:
            md.append(f"- {i}")
        md.append("")
    md += [
        f"## Planes — {snap['planes']['total']} total ({snap['planes']['alive']} alive, {snap['planes']['dormant']} dormant)",
        "",
        f"## Subsystems — {snap['subsystems']['total']} total",
        "",
        "| Status | Count |",
        "|---|---|",
    ]
    for s, c in sorted(snap["subsystems"]["by_status"].items(), key=lambda kv: -kv[1]):
        md.append(f"| {s} | {c} |")
    md += [
        "",
        f"## Resources",
        f"- **pm2**: {snap['resources']['pm2_online']} online / {snap['resources']['pm2_total']} total",
        f"- **brain**: {snap['resources']['brain_state']}",
        "",
        f"## Databases — {snap['dbs']['n_dbs']} dbs, {snap['dbs']['total_mb']} MB",
        "",
        f"## Capabilities — {snap['capabilities']['endpoints_total']} endpoints",
        "",
        "| Risk | Count |",
        "|---|---|",
    ]
    for r, c in sorted(snap["capabilities"]["by_risk"].items(), key=lambda kv: -kv[1]):
        md.append(f"| {r} | {c} |")
    md += [
        "",
        f"## Unknowns",
    ]
    for k, v in snap["unknowns"].items():
        md.append(f"- {k}: {v}")
    md += [
        "",
        f"## Top limitations",
    ]
    for k, c in sorted(snap["limitations_by_kind"].items(), key=lambda kv: -kv[1])[:10]:
        md.append(f"- {k}: {c}")

    md_path = os.path.join(REPORTS_DIR, "system-status.md")
    with open(md_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(md) + "\n")
    return md_path


def write_health_score() -> str:
    """Stand-alone health-score report (subset of system-status)."""
    status_path = os.path.join(REPORTS_DIR, "system-status.json")
    if not os.path.exists(status_path):
        write_system_status()
    with open(status_path) as fh:
        snap = json.load(fh)
    out = {
        "timestamp": snap["timestamp"],
        "health_score": snap["health_score"],
        "issues": snap["issues"],
    }
    with open(os.path.join(REPORTS_DIR, "health-score.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    with open(os.path.join(REPORTS_DIR, "health-score.md"), "w") as fh:
        fh.write(f"# Health Score: {out['health_score']}/100\n\n")
        if out["issues"]:
            fh.write("## Issues\n\n")
            for i in out["issues"]:
                fh.write(f"- {i}\n")
    return os.path.join(REPORTS_DIR, "health-score.md")
