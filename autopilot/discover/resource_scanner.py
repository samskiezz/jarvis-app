"""Resource inventory: pm2 processes + brain_health + vast_events + Wasabi
manifest + Ollama models + LLM router. READ-ONLY."""
from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _read_json(path: str, default: Any = None) -> Any:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default


def _tail_jsonl(path: str, n: int = 50) -> list[dict]:
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as fh:
            tail = fh.readlines()[-n:]
    except OSError:
        return []
    out: list[dict] = []
    for line in tail:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def _pm2_jlist() -> list[dict]:
    try:
        r = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=10)
        if r.returncode != 0:
            return []
        return json.loads(r.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError):
        return []


def _summarize_pm2(items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for it in items:
        env = it.get("pm2_env") or {}
        monit = it.get("monit") or {}
        out.append({
            "name": it.get("name"),
            "status": env.get("status"),
            "restarts": env.get("restart_time"),
            "exec_path": env.get("exec_interpreter") or env.get("pm_exec_path"),
            "cwd": env.get("pm_cwd"),
            "uptime_ms": (int(time.time() * 1000) - env.get("pm_uptime", 0)) if env.get("pm_uptime") else 0,
            "cpu_pct": monit.get("cpu"),
            "mem_mb": round((monit.get("memory") or 0) / (1024 * 1024), 1),
        })
    return out


def scan() -> dict[str, Any]:
    now = time.time()
    out: dict[str, Any] = {"generated_at": now, "resources": {}}

    # pm2
    pm2 = _summarize_pm2(_pm2_jlist())
    out["resources"]["pm2"] = {
        "count": len(pm2),
        "online": sum(1 for p in pm2 if p["status"] == "online"),
        "processes": pm2,
    }

    # brain
    brain = _read_json(os.path.join(ROOT, "server", "data", "brain_health.json"), {})
    out["resources"]["brain"] = brain or {"state": "unknown"}

    # vast events (last 20)
    vast_events = _tail_jsonl(os.path.join(ROOT, "server", "data", "vast_events.jsonl"), 20)
    by_kind: dict[str, int] = {}
    for e in vast_events:
        by_kind[e.get("kind", "?")] = by_kind.get(e.get("kind", "?"), 0) + 1
    last_throttle = next((e for e in reversed(vast_events) if "throttle" in e.get("kind", "")), None)
    out["resources"]["vast"] = {
        "recent_events_n": len(vast_events),
        "by_kind": by_kind,
        "last_throttle": last_throttle,
    }

    # Ollama (parse env from ecosystem.config.cjs without exec)
    eco_path = os.path.join(ROOT, "ecosystem.config.cjs")
    ollama_models: list[str] = []
    if os.path.exists(eco_path):
        try:
            with open(eco_path, encoding="utf-8") as fh:
                txt = fh.read()
            import re
            for m in re.finditer(r"OLLAMA_(?:MODEL|EMBED_MODEL|VISION_MODEL):\s*'([^']+)'", txt):
                ollama_models.append(m.group(1))
        except OSError:
            pass
    out["resources"]["ollama"] = {"models_declared": sorted(set(ollama_models))}

    # Wasabi manifest summary
    wasabi_cfg = _read_json(os.path.join(ROOT, "config", "wasabi_storage.json"), {})
    out["resources"]["wasabi"] = {
        "configured": bool(wasabi_cfg),
        "buckets": list((wasabi_cfg.get("buckets") or {}).keys())
                   if isinstance(wasabi_cfg, dict) else [],
        "region": wasabi_cfg.get("region") if isinstance(wasabi_cfg, dict) else None,
    }

    # LLM router
    llm_router = _read_json(os.path.join(ROOT, "config", "llm_router.json"), {})
    out["resources"]["llm_router"] = {
        "configured": bool(llm_router),
        "tiers_n": len(llm_router.get("tiers") or []) if isinstance(llm_router, dict) else 0,
    }

    # health.json
    health = _read_json(os.path.join(ROOT, "server", "data", "health.json"), {})
    out["resources"]["health_watchdog"] = {
        "overall_ok": health.get("overall_ok"),
        "probes_n": len(health.get("probes") or []) if isinstance(health, dict) else 0,
        "last_ts": health.get("ts"),
    }

    return out


def write_outputs(intel_dir: str) -> None:
    out = scan()
    os.makedirs(intel_dir, exist_ok=True)
    with open(os.path.join(intel_dir, "resource-map.json"), "w") as fh:
        json.dump(out, fh, indent=2)
    r = out["resources"]
    pm2 = r["pm2"]
    lines = [
        "# Resource Map",
        "",
        f"**Generated**: {int(out['generated_at'])}",
        "",
        f"- **pm2**: {pm2['online']} online / {pm2['count']} total",
        f"- **brain**: state=`{(r['brain'] or {}).get('state')}`",
        f"- **Vast**: recent events by kind: {r['vast']['by_kind']}",
        f"- **Ollama models declared**: {', '.join(r['ollama']['models_declared']) or '—'}",
        f"- **Wasabi**: configured={r['wasabi']['configured']}, buckets={r['wasabi']['buckets']}",
        f"- **LLM router**: configured={r['llm_router']['configured']}, tiers={r['llm_router']['tiers_n']}",
        f"- **health_watchdog**: overall_ok={r['health_watchdog']['overall_ok']}, probes={r['health_watchdog']['probes_n']}",
        "",
        "## pm2 processes",
        "| Name | Status | Restarts | CPU% | Mem MB |",
        "|---|---|---|---|---|",
    ]
    for p in pm2["processes"]:
        lines.append(
            f"| `{p['name']}` | {p['status']} | {p['restarts']} | "
            f"{p['cpu_pct']} | {p['mem_mb']} |"
        )
    with open(os.path.join(intel_dir, "resource-map.md"), "w") as fh:
        fh.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    intel = os.path.join(ROOT, "autopilot", "intelligence")
    write_outputs(intel)
    print(f"resource-map written to {intel}")
