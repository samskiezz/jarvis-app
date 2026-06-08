#!/usr/bin/env python3
"""Underworld Book V — UE5 conformance polish/verify loop (server-side, Kimi-powered).

Runs on a cron cadence, independent of any chat session. Each pass:
  1. runs the backend contract tests that guard the v2 scene-state ↔ UE5 client seam,
  2. AUTHORITATIVE field-conformance: a deterministic set-diff of the spec keys vs the keys the UE5
     parser reads (instant, exact — no LLM needed for exact matching),
  3. ADVISORY semantic review on the GPU-resident model (Vast 2x4090 Ollama, ~1.5s, VRAM-loaded),
     Kimi K2.6 fallback if the box is unreachable; logged, never blocks,
  4. appends a timestamped entry to the journal,
  5. when the done-gate holds (tests green AND set-diff clean) for N consecutive passes,
     writes a DONE marker and REMOVES its own cron entry — it stops itself when the work is done.

Safety: this loop NEVER edits source or touches git — a sleeping operator must not wake to a
broken tree. It verifies, audits and reports. Anything needing real code work is logged under
'NEEDS-CLAUDE' in the journal for a human/Claude to action. Never raises; cron-safe.

Env: KIMI_API_KEY (source .kimi_env). Tunables: BOOKV_CLEAN_TARGET (default 2),
BOOKV_LOOP_MARKER (cron line marker).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from datetime import datetime, timezone

ROOT = "/opt/jarvis-app-1"
UE5 = os.path.join(ROOT, "underworld/deploy/ue5-project")
JOURNAL = os.path.join(UE5, "BOOKV_LOOP_JOURNAL.md")
STATE = os.path.expanduser("~/.underworld_bookv_loop.json")
DONE_MARKER = os.path.join(UE5, ".bookv_done")
CLEAN_TARGET = int(os.environ.get("BOOKV_CLEAN_TARGET", "2"))
CRON_MARKER = os.environ.get("BOOKV_LOOP_MARKER", "# underworld-bookv-loop")

sys.path.insert(0, os.path.join(ROOT, "underworld/scripts"))


def _load_kimi_env() -> None:
    """cron has no shell env — load KIMI_* from the gitignored .kimi_env if not already set."""
    if os.environ.get("KIMI_API_KEY"):
        return
    envf = os.path.join(ROOT, ".kimi_env")
    try:
        with open(envf) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except Exception:
        pass


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")


def _load_state() -> dict:
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return {"pass": 0, "clean_streak": 0}


def _save_state(s: dict) -> None:
    try:
        with open(STATE, "w") as f:
            json.dump(s, f)
    except Exception:
        pass


def _append_journal(text: str) -> None:
    try:
        header = "" if os.path.exists(JOURNAL) else "# Book V — UE5 conformance loop journal\n\n"
        with open(JOURNAL, "a") as f:
            f.write(header + text + "\n")
    except Exception:
        pass


def run_tests() -> tuple[bool, str]:
    """Run the backend contract tests guarding the v2 ↔ UE5 seam. Returns (ok, summary)."""
    py = os.path.join(ROOT, ".venv/bin/python")
    py = py if os.path.exists(py) else sys.executable
    try:
        r = subprocess.run(
            [py, "-m", "pytest",
             "underworld/server/tests/test_scene_state.py",
             "-q", "--no-header"],
            cwd=ROOT, capture_output=True, text=True, timeout=600)
        tail = (r.stdout or r.stderr).strip().splitlines()[-1:] or [""]
        return r.returncode == 0, tail[0][:200]
    except Exception as e:  # noqa: BLE001
        return False, f"test runner error: {str(e)[:160]}"


def _audit_context() -> str:
    """The compact 'what the parser reads vs what the spec emits' prompt body. Compact ON PURPOSE:
    a big file dump makes a reasoning model reason past its budget and a small model hallucinate."""
    import re
    cpp = ""
    p = os.path.join(UE5, "Source/Underworld/SceneStateClient.cpp")
    if os.path.exists(p):
        cpp = open(p).read()
    keys = set(re.findall(r'TEXT\("([a-z_]+)"\)', cpp))
    # the parser reads `pos` (and maps it); the spec calls it `position` — treat as the same key.
    if "pos" in keys:
        keys.add("position")
    parser_keys = ", ".join(sorted(keys))[:1800]
    # FLAT key set (one token each — no grouped notation, which a small model mis-matches).
    canonical = ("contract_version, tick, sim_year, era, population, time_of_day, weather, biome, "
                 "overmind, chatter, god_beat, possessed_id, presence, epoch, seed, elevation_bias, "
                 "town_radius, heightmap_size, id, name, position, velocity, move_state, speed, "
                 "target_pos, facing, anim, action, target_building, using_asset, awareness, awakened, "
                 "thought, identity, drive, scale, generation, needs, hunger, fatigue, sanity, behavior, "
                 "gene_edit, mood, guild, role, color, possessed")
    return (f"SPEC keys (backend emits): {canonical}\n\nPARSER keys (UE5 client reads): {parser_keys}\n\n"
            "Verdict (CLEAN or GAP: ...):")


_AUDIT_SYS = ("You compare two flat lists of JSON keys. Reply EXACTLY one line: 'CLEAN' if EVERY key "
              "in SPEC also appears in PARSER, or 'GAP: <the spec keys missing from parser>'. Compare "
              "as plain string sets; do not infer extra requirements.")


# A deterministic set-diff backstop so the verdict never hinges on the model's matching ability.
def _deterministic_gap() -> tuple[bool, str]:
    import re
    cpp = ""
    p = os.path.join(UE5, "Source/Underworld/SceneStateClient.cpp")
    if os.path.exists(p):
        cpp = open(p).read()
    pk = set(re.findall(r'TEXT\("([a-z_]+)"\)', cpp))
    if "pos" in pk:
        pk.add("position")
    spec = {"contract_version", "tick", "sim_year", "era", "population", "time_of_day", "weather",
            "biome", "overmind", "chatter", "god_beat", "possessed_id", "presence", "epoch", "seed",
            "elevation_bias", "town_radius", "heightmap_size", "id", "name", "position", "velocity",
            "move_state", "speed", "target_pos", "facing", "anim", "action", "target_building",
            "using_asset", "awareness", "awakened", "thought", "identity", "drive", "scale",
            "generation", "needs", "hunger", "fatigue", "sanity", "behavior", "gene_edit", "mood",
            "guild", "role", "color", "possessed"}
    missing = sorted(spec - pk)
    return (bool(missing), ("GAP: " + ", ".join(missing)) if missing else "CLEAN")


# The GPU model does the SEMANTIC job (exact set-matching is the deterministic check's job): given
# the fields the renderer reads from a living-civilisation sim, does any whole CATEGORY of data a
# high-fidelity renderer would obviously need seem absent? Judgment, not string-diff.
_GPU_SEMANTIC_SYS = (
    "You are a senior technical artist reviewing what a UE5 renderer reads from a living-civilisation "
    "simulation. You will see the list of fields the client already reads. Reply with ONE line: the "
    "word CLEAN if nothing important for rendering a believable living world is obviously missing, or "
    "'CONCERN: <one short phrase>' naming the single most important MISSING CATEGORY. Most reviews are "
    "CLEAN. Judge categories (movement, emotion, identity, world frame, presence), not exact names.")


def gpu_audit() -> tuple[bool, str] | None:
    """Semantic sanity review on the GPU-resident Ollama model (Vast 2×4090, ~1.5s, VRAM-loaded).
    ADVISORY — its CONCERNs are logged for review, they do not gate 'done' (the deterministic set-diff
    + tests do). Returns (concern, note) or None if the box is unreachable (→ Kimi fallback)."""
    import json as _json
    import re
    import urllib.request
    host = (os.environ.get("OLLAMA_AUDIT_URL") or os.environ.get("OLLAMA_HOST")
            or "http://211.72.13.201:41137").rstrip("/")
    model = os.environ.get("OLLAMA_AUDIT_MODEL", "llama3.1:8b")
    cpp = ""
    p = os.path.join(UE5, "Source/Underworld/SceneStateClient.cpp")
    if os.path.exists(p):
        cpp = open(p).read()
    fields = ", ".join(sorted(set(re.findall(r'TEXT\("([a-z_]+)"\)', cpp))))[:1600]
    body = {"model": model, "stream": False, "options": {"temperature": 0, "num_predict": 40},
            "prompt": f"{_GPU_SEMANTIC_SYS}\n\nFields the renderer reads: {fields}\n\nVerdict:"}
    try:
        req = urllib.request.Request(f"{host}/api/generate", data=_json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=45) as r:
            ans = (_json.loads(r.read().decode()).get("response") or "").strip()
    except Exception:  # noqa: BLE001 — box unreachable / ephemeral port moved
        return None
    if not ans:
        return None
    verdict = next((ln.strip() for ln in ans.splitlines()
                    if ln.strip().upper().startswith(("CLEAN", "CONCERN", "GAP"))), ans.splitlines()[0])
    # advisory only — never reports has_gap=True (it cannot gate 'done').
    return False, f"[gpu:{model}] {verdict[:200]}"


def kimi_audit() -> tuple[bool, str]:
    """Fallback auditor: hosted Kimi K2.6. Returns (has_gap, note). A reasoning model starves its own
    output under a strict envelope, so we give big headroom and tolerate the unstructured fallback."""
    if not os.environ.get("KIMI_API_KEY"):
        return False, "kimi key absent — audit skipped (tests are the gate)"
    try:
        import kimi_swarm
        out = kimi_swarm._chat(
            [{"role": "system", "content": _AUDIT_SYS}, {"role": "user", "content": _audit_context()}],
            thinking=False, max_tokens=8000, timeout=240)
        ans = (out or "").strip()
        if not ans:
            return False, "kimi returned empty — treated as no-signal (tests are the gate)"
        verdict = next((ln.strip() for ln in reversed(ans.splitlines())
                        if ln.strip().upper().startswith(("CLEAN", "GAP"))), ans.splitlines()[-1])
        return verdict.upper().startswith("GAP"), f"[kimi] {verdict[:200]}"
    except Exception as e:  # noqa: BLE001
        return False, f"audit error: {str(e)[:160]}"


def audit() -> tuple[bool, str]:
    """Authoritative field-conformance = a deterministic set-diff (instant, exact). The GPU model
    (Vast Ollama, ~1.5s, VRAM-resident) adds a fast SEMANTIC opinion that's logged but cannot
    false-block the done-gate; Kimi is the GPU's fallback. Tests + the set-diff are the hard gate."""
    det_gap, det_note = _deterministic_gap()
    g = gpu_audit()
    llm_note = (g[1] if g is not None else (kimi_audit()[1]))
    note = f"set-diff: {det_note} || llm: {llm_note}"
    return det_gap, note


def remove_own_cron() -> None:
    try:
        cur = subprocess.run(["crontab", "-l"], capture_output=True, text=True).stdout
        kept = [ln for ln in cur.splitlines() if CRON_MARKER not in ln]
        new = ("\n".join(kept) + "\n") if kept else ""
        subprocess.run(["crontab", "-"], input=new, text=True)
    except Exception:
        pass


def main() -> int:
    _load_kimi_env()
    if os.path.exists(DONE_MARKER):
        return 0   # already done; cron should be gone, but be idempotent

    st = _load_state()
    st["pass"] = int(st.get("pass", 0)) + 1

    tests_ok, tsum = run_tests()
    has_gap, note = audit()
    clean = tests_ok and not has_gap

    st["clean_streak"] = (st.get("clean_streak", 0) + 1) if clean else 0

    flag = "NEEDS-CLAUDE" if has_gap else ("OK" if tests_ok else "TESTS-RED")
    entry = (f"## pass {st['pass']} — {_now()}  [{flag}]\n"
             f"- tests: {'PASS' if tests_ok else 'FAIL'} — {tsum}\n"
             f"- audit: {note}\n"
             f"- clean streak: {st['clean_streak']}/{CLEAN_TARGET}\n")
    _append_journal(entry)

    if st["clean_streak"] >= CLEAN_TARGET:
        try:
            open(DONE_MARKER, "w").write(f"done {_now()} after {st['pass']} passes\n")
        except Exception:
            pass
        _append_journal(f"## DONE — {_now()}\nBook V UE5 conformance verified clean "
                        f"{CLEAN_TARGET}× consecutively. Loop self-terminating (cron removed).\n")
        remove_own_cron()

    _save_state(st)
    return 0


if __name__ == "__main__":
    sys.exit(main())
