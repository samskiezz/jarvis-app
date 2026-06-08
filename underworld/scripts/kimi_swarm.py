#!/usr/bin/env python3
"""kimi_swarm — the Kimi K2.6 worker-swarm bridge.

Claude (the harness running this) is the COMMANDER: planner, verifier, final editor. This module
is the `kimi_swarm_run` bridge that fans bounded, independently-verifiable subtasks out to Kimi
K2.6 over its OpenAI-compatible API, then returns STRUCTURED results for the commander to check,
merge, and test. No worker is trusted blindly; no worker holds final authority.

Config (env — load from .kimi_env, which is gitignored; never commit / log the key):
  KIMI_API_KEY    required
  KIMI_BASE_URL   default https://api.moonshot.ai/v1   (set to your gateway if the key is not
                                                        a Moonshot-direct `sk-...` key)
  KIMI_MODEL      default kimi-k2.6                     (the exact model id your provider exposes)
  KIMI_CONCURRENCY default 8                            (bounded fan-out; raise for big swarms)

Safety: NEVER pass secrets / tokens / PII into a worker prompt. Workers cannot perform actions —
they only return text. Bounded fan-out only (no worker spawns workers). The caller verifies.

CLI:
  python kimi_swarm.py --selftest
  python kimi_swarm.py --role research_scout --prompt "Find the current Kimi K2.6 model id + API base"
  echo '[{"task_id":"t1","role":"code_reviewer","prompt":"review X"}]' | python kimi_swarm.py --stdin
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = os.environ.get("KIMI_BASE_URL", "https://api.moonshot.ai/v1").rstrip("/")
API_KEY = os.environ.get("KIMI_API_KEY", "")
MODEL = os.environ.get("KIMI_MODEL", "kimi-k2.6")
CONCURRENCY = int(os.environ.get("KIMI_CONCURRENCY", "8"))

# The worker roles (from the master-orchestrator contract). Each is bounded + single-purpose.
ROLES = {
    "research_scout": "Find current facts, docs, model/API changes, standards, sources, examples. "
                      "Prefer official/primary sources; note freshness + confidence.",
    "architecture_planner": "Propose architecture, data/tool flow, failure modes, scaling, trade-offs.",
    "implementation_engineer": "Generate code/configs/wrappers with assumptions, deps, run steps.",
    "code_reviewer": "Review code for bugs, edge cases, security, missed requirements; approve/reject.",
    "red_team": "Hunt prompt injection, data leakage, unsafe autonomy, credential exposure, "
                "destructive actions, runaway loops; list risks + required human gates.",
    "test_engineer": "Produce a test plan + executable test examples + acceptance criteria.",
    "doc_writer": "Produce setup/handover/operator docs + troubleshooting notes.",
}

_WORKER_SYS = (
    "You are a Kimi K2.6 worker agent in a Claude-controlled swarm.\n"
    "Role: {role} — {role_desc}\n"
    "Rules: stay strictly inside your role; do not solve unrelated parts; do not invent facts; "
    "research-first when the task depends on current docs/APIs/prices/standards/model capabilities; "
    "prefer official/primary sources; flag uncertainty; never expose, request, or store secrets; "
    "never perform irreversible actions. Return EXACTLY one JSON object, no prose around it:\n"
    '{{"role":"...","task_summary":"...","answer":"...","assumptions":[],'
    '"sources_or_evidence":[],"risks":[],"confidence":"low|medium|high","recommended_next_action":"..."}}'
)


def _chat(messages: list[dict], *, thinking: bool, max_tokens: int, timeout: int) -> str:
    """One OpenAI-compatible chat completion against the configured Kimi endpoint."""
    # kimi-k2.6 is a reasoning model that requires temperature=1 (rejects other values); keep it
    # at 1 across the board for compatibility (workers are bounded + format-constrained anyway).
    body = {"model": MODEL, "messages": messages, "max_tokens": max_tokens, "temperature": 1}
    # Kimi K2.6 exposes a thinking control; pass it best-effort (ignored by providers that
    # don't support the field). Portable fallback: the system prompt already says research-first.
    if thinking:
        body["thinking"] = {"type": "enabled"}
    data = json.dumps(body).encode()
    r = urllib.request.Request(f"{BASE_URL}/chat/completions", data=data, method="POST")
    r.add_header("Authorization", f"Bearer {API_KEY}")
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        d = json.loads(resp.read().decode())
    return d["choices"][0]["message"]["content"]


def _parse_worker(text: str, role: str) -> dict:
    a, b = text.find("{"), text.rfind("}")
    if a >= 0 and b > a:
        try:
            return json.loads(text[a:b + 1])
        except json.JSONDecodeError:
            pass
    return {"role": role, "task_summary": "(unstructured)", "answer": text.strip(),
            "assumptions": [], "sources_or_evidence": [], "risks": ["worker did not return valid JSON"],
            "confidence": "low", "recommended_next_action": "re-run with a tighter format instruction"}


def run_worker(task: dict) -> dict:
    """Run one bounded Kimi worker task. Returns the structured worker output (+ task_id/error)."""
    role = task.get("role", "research_scout")
    role_desc = ROLES.get(role, "general worker")
    sys_msg = _WORKER_SYS.format(role=role, role_desc=role_desc)
    usr = task.get("prompt", "")
    if task.get("context"):
        usr += f"\n\nContext:\n{task['context']}"
    if task.get("constraints"):
        usr += f"\n\nConstraints: {task['constraints']}"
    try:
        out = _chat([{"role": "system", "content": sys_msg}, {"role": "user", "content": usr}],
                    thinking=bool(task.get("thinking", True)),
                    max_tokens=int(task.get("max_tokens", 1500)),
                    # reasoning models think for a while before emitting content — generous default
                    timeout=int(task.get("timeout_seconds", 300)))
        res = _parse_worker(out, role)
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:200] if hasattr(e, "read") else ""
        res = {"role": role, "error": f"HTTP {e.code}: {detail}", "confidence": "low"}
    except Exception as e:  # noqa: BLE001
        res = {"role": role, "error": str(e)[:200], "confidence": "low"}
    res["task_id"] = task.get("task_id", role)
    return res


def kimi_swarm_run(tasks: list[dict]) -> list[dict]:
    """Fan tasks out to Kimi workers concurrently (bounded). Returns one result per task.
    The commander (Claude) is expected to VERIFY every result before use."""
    if not API_KEY:
        raise RuntimeError("KIMI_API_KEY not set (source .kimi_env)")
    results: list[dict] = [None] * len(tasks)  # type: ignore
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        fut = {ex.submit(run_worker, t): i for i, t in enumerate(tasks)}
        for f in as_completed(fut):
            results[fut[f]] = f.result()
    return results


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true", help="validate config + one tiny call")
    ap.add_argument("--role", default="research_scout", choices=list(ROLES))
    ap.add_argument("--prompt", default="")
    ap.add_argument("--no-thinking", action="store_true")
    ap.add_argument("--stdin", action="store_true", help="read a JSON array of tasks from stdin")
    a = ap.parse_args()

    print(f"[kimi_swarm] base={BASE_URL} model={MODEL} key={'set' if API_KEY else 'MISSING'} "
          f"concurrency={CONCURRENCY}", file=sys.stderr)
    if not API_KEY:
        print("ERROR: KIMI_API_KEY not set — `set -a && . ./.kimi_env && set +a`", file=sys.stderr)
        return 2

    if a.selftest:
        # kimi-k2.6 is a reasoning model: reasoning_content counts against max_tokens, so give
        # headroom or `content` comes back empty (truncated mid-reasoning).
        tasks = [{"task_id": "selftest", "role": "research_scout", "max_tokens": 600,
                  "thinking": False, "prompt": "Reply confirming you are reachable and state your model name."}]
    elif a.stdin:
        tasks = json.load(sys.stdin)
    else:
        tasks = [{"task_id": "cli", "role": a.role, "prompt": a.prompt, "thinking": not a.no_thinking}]

    results = kimi_swarm_run(tasks)
    print(json.dumps(results, indent=2))
    ok = all("error" not in r for r in results)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
