"""FEEDBACK IMPROVER — where Llama ↔ Kimi ↔ Claude talk to each other about the running code.

Reads the open issues that every .py reports to the feedback_bus and turns each into a durable LESSON,
via a model conference scaled by how serious the issue is:

  info / note   →  Llama (base) drafts the lesson alone (cheap, on the GPU box).
  warn / slow   →  Llama drafts  →  Kimi critiques & tightens it.
  error/excptn  →  Llama drafts  →  Kimi critiques  →  Claude arbitrates the final lesson.

The lesson is stored against the module; tiered_llm then prepends it to future calls on that module
(get_lessons_preamble) — so the system feeds its own corrections back in and gets smarter over time.

Run:  cd /opt/jarvis-app-1 && .venv/bin/python -m server.services.feedback_improver [interval_s]
Env:  FEEDBACK_IMPROVER_INTERVAL_S (default 45), same provider env as tiered_llm.
"""
from __future__ import annotations

import os
import time

from . import feedback_bus as fb
from . import tiered_llm as T

_SYS = ("You are a senior engineer doing root-cause analysis on a running system. "
        "Reply with ONE actionable lesson in a single sentence (max 30 words). "
        "No preamble, no markdown, no restating the error — just the lesson/fix.")


def _draft(issue: dict) -> tuple[str, str]:
    """Llama drafts the first lesson. Returns (lesson, chain_label)."""
    p = (f"Module: {issue['module']}\nKind: {issue['kind']} ({issue['severity']})\n"
         f"Detail: {issue['detail']}\n" + (f"Traceback tail:\n{issue['tb'][-800:]}\n" if issue.get('tb') else ""))
    r = T.complete(p + "\nGive the one-sentence lesson.", system=_SYS, tier="base", max_tokens=160)
    return (r.get("content", "").strip() if r.get("ok") else "", "llama")


def _critique(issue: dict, draft: str) -> tuple[str, str]:
    """Kimi tightens / corrects the draft."""
    p = (f"Issue in {issue['module']}: {issue['detail']}\n"
         f"A junior engineer proposed this lesson:\n\"{draft}\"\n"
         "If it is correct, return it verbatim. If it is wrong, vague, or missing the real root cause, "
         "replace it with a better one-sentence lesson.")
    r = T.complete(p, system=_SYS, tier="kimi", max_tokens=200)
    return (r.get("content", "").strip(), "kimi") if r.get("ok") and r.get("content") else (draft, "llama")


def _arbitrate(issue: dict, draft: str) -> tuple[str, str]:
    """Claude makes the final call on serious issues."""
    p = (f"Production error in {issue['module']}:\n{issue['detail']}\n"
         + (f"{issue['tb'][-1000:]}\n" if issue.get('tb') else "")
         + f"Best lesson so far:\n\"{draft}\"\n"
         "Return the single most useful one-sentence lesson to prevent this recurring.")
    r = T.complete(p, system=_SYS, tier="claude", max_tokens=200)
    return (r.get("content", "").strip(), "claude") if r.get("ok") and r.get("content") else (draft, "kimi")


def improve_issue(issue: dict) -> dict:
    sev = issue.get("severity", "info")
    lesson, chain = _draft(issue)
    if not lesson:
        return {"ok": False, "module": issue["module"]}
    if sev in ("warn", "error", "exception", "slow"):
        lesson, chain = _critique(issue, lesson)
    if sev in ("error", "exception"):
        lesson, chain = _arbitrate(issue, lesson)
    fb.lesson(issue["module"], lesson, trigger=issue.get("detail", "")[:160], source_tier=chain)
    fb.mark_resolved(issue["id"])
    return {"ok": True, "module": issue["module"], "tier": chain, "lesson": lesson}


def run_once(limit: int = 12) -> int:
    # pull more, then DEDUP by (module, kind): one lesson per distinct issue-type, collapse repeats
    # so a recurring failure can't spam thousands of lessons
    issues = fb.open_issues(60)
    seen, n = set(), 0
    for it in issues:
        key = (it.get("module"), it.get("kind"))
        if key in seen:
            fb.mark_resolved(it["id"])
            continue
        seen.add(key)
        if n >= limit:
            break
        try:
            r = improve_issue(it)
            if r.get("ok"):
                n += 1
                print(f"[improver] {r['tier']:6} | {r['module']}: {r['lesson'][:90]}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[improver] error on {it.get('module')}: {str(e)[:120]}", flush=True)
    return n


def scout() -> dict:
    """Proactive self-review — analyse real system signals and write ONE improvement lesson.
    This is what makes self-learning visibly ACTIVE even when nothing is erroring."""
    signals = []
    try:
        for r in T.stats():
            if isinstance(r, dict) and r.get("calls"):
                fail = (r.get("calls") or 0) - (r.get("ok") or 0)
                if fail > 0 or (r.get("avg_ms") or 0) > 8000:
                    signals.append(f"LLM tier {r.get('tier')} ({r.get('model')}): {fail}/{r.get('calls')} "
                                   f"calls failed, avg {r.get('avg_ms')}ms")
    except Exception:  # noqa: BLE001
        pass
    try:
        from . import correlator as C
        cs = C.stats()
        if cs.get("top"):
            t = cs["top"][0]
            signals.append(f"worst duplication: '{t['name']}' stored {t['members']}x as {t['types']} — "
                           f"ingestion isn't deduping at insert time")
        signals.append(f"{cs.get('raw_objects')} objects collapse to {cs.get('distinct_after_dedup')} distinct entities")
    except Exception:  # noqa: BLE001
        pass
    if not signals:
        return {"ok": False}
    p = ("Real signals from the live intelligence pipeline:\n" + "\n".join(f"- {s}" for s in signals[:6])
         + "\nGive ONE concrete, actionable engineering improvement (one sentence).")
    r = T.complete(p, system=_SYS, tier="base", max_tokens=200)
    draft = (r.get("content") or "").strip() if r.get("ok") else ""
    if not draft:
        return {"ok": False}
    lesson, chain = _critique({"module": "system", "detail": "; ".join(signals[:3])}, draft)
    fb.lesson("system", lesson, trigger="self-review", source_tier=chain)
    return {"ok": True, "lesson": lesson, "tier": chain}


def run_forever(interval_s: float = 45.0) -> None:
    print(f"[improver] started — Llama→Kimi→Claude conference + proactive scout, every {interval_s}s", flush=True)
    passes = 0
    while True:
        try:
            done = run_once()
            passes += 1
            if done:
                print(f"[improver] wrote {done} lesson(s) this pass", flush=True)
            if passes == 1 or passes % 7 == 0:  # proactive self-review every ~7 passes
                s = scout()
                if s.get("ok"):
                    print(f"[improver] scout [{s['tier']}]: {s['lesson'][:100]}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"[improver] loop error: {str(e)[:140]}", flush=True)
        time.sleep(interval_s)


if __name__ == "__main__":
    import sys
    run_forever(float(sys.argv[1]) if len(sys.argv) > 1 else
                float(os.environ.get("FEEDBACK_IMPROVER_INTERVAL_S", "45")))
