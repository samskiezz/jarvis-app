"""JARVIS AGENT — the real planner/executor tool-calling loop (closes the audit gap).

The audit was right about ONE thing that mattered: the bot could stream LLM text
but could not *call tools and chain them*. The governed tool layer already exists
(``services.aip_tools``: ``list_tools`` / ``call_tool`` / ``propose_action``) — it
was simply never wired into the conversation. This module is that wire.

``run_agent`` is a ReAct-style planner/executor:

  1. Build a system prompt advertising the REAL tool catalogue (from aip_tools).
  2. Ask the local LLM (Ollama/Llama via ``llm_research.llm_complete``, JSON mode)
     for the next step: either call a tool or give the final answer.
  3. Dispatch the tool through the GOVERNED dispatcher:
       * read/meta tools execute immediately (``aip_tools.call_tool``),
       * write tools are NOT silently executed — they become a PENDING proposal
         (``aip_tools.propose_action``); the human approves later.
  4. Feed the observation back into the scratchpad (step memory) and loop, up to
     ``max_steps``. Then synthesise a final answer from what was gathered.

Honest degradation: if no LLM backend is reachable, we still do something useful —
run the grounded ``search`` tool over the message and return real snippets, clearly
labelled as a no-LLM fallback. Every tool call is audited by ``aip_tools``; the loop
itself is audited too. Never raises.

stdlib + existing services only.
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from . import aip_tools as _tools
from . import llm_research as _llm

try:
    from . import audit as _audit
except Exception:  # noqa: BLE001
    _audit = None  # type: ignore[assignment]

MAX_STEPS_DEFAULT = 4


# ── Tool catalogue → compact prompt block ────────────────────────────────────────
def _tool_brief() -> list[dict]:
    """A trimmed, prompt-friendly view of the real tool catalogue."""
    out: list[dict] = []
    for t in _tools.list_tools():
        if t.get("kind") == "meta":
            continue  # discovery tools add noise for a small model
        out.append({
            "name": t.get("name"),
            "kind": t.get("kind"),
            "params": t.get("params_schema", {}),
            "desc": (t.get("description") or "")[:140],
        })
    return out


def _system_prompt(tools: list[dict]) -> str:
    from . import jarvis_persona
    lines = [
        jarvis_persona.AGENT_PREAMBLE,
        "You answer by REASONING then optionally CALLING TOOLS to gather real data.",
        "You have these tools (kind=read runs immediately; kind=write is proposed for human approval):",
    ]
    for t in tools:
        lines.append(f"  - {t['name']} ({t['kind']}): {t['desc']} params={json.dumps(t['params'])}")
    lines += [
        "",
        "Respond with ONE JSON object and nothing else. Two shapes:",
        '  {"action":"tool","tool":"<name>","params":{...},"thought":"<why>"}',
        '  {"action":"final","answer":"<concise answer grounded in observations>"}',
        "Rules: prefer the 'search' tool to ground claims. Never invent data. "
        "Use at most a few tool calls, then give a final answer. "
        "If you already have enough, answer immediately with action=final.",
    ]
    return "\n".join(lines)


def _scratchpad(message: str, history: list[dict], trace: list[dict]) -> str:
    parts = []
    for h in history[-6:]:
        role = "Operator" if h.get("role") in ("user", "sam") else "JARVIS"
        parts.append(f"{role}: {h.get('text') or h.get('content') or ''}")
    parts.append(f"Operator: {message}")
    for step in trace:
        parts.append(f"JARVIS thought: {step.get('thought','')}")
        obs = json.dumps(step.get("observation"), default=str)
        parts.append(f"TOOL {step.get('tool')} -> {obs[:700]}")
    parts.append("JARVIS next JSON:")
    return "\n".join(parts)


_JSON_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_step(text: Optional[str]) -> Optional[dict]:
    """Extract the first JSON object from a model reply, tolerant of chatter."""
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        pass
    m = _JSON_RE.search(text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


def _dispatch(tool: str, params: dict, actor: Optional[str]) -> dict:
    """Governed dispatch: writes are proposed (not executed), reads run now."""
    kind = None
    for t in _tools.list_tools():
        if t.get("name") == tool:
            kind = t.get("kind")
            break
    if kind == "write":
        action = tool.split(".", 1)[1] if "." in tool else tool
        object_id = str(params.get("object_id") or "")
        payload = {k: v for k, v in params.items() if k != "object_id"}
        pr = _tools.propose_action(object_id, action, payload,
                                   rationale="jarvis agent step", actor=actor)
        return {"mode": "proposed", **pr}
    return {"mode": "executed", **_tools.call_tool(tool, params, actor=actor)}


def _search_bullets(hits: list) -> list[str]:
    bullets = []
    for h in hits[:6]:
        if isinstance(h, dict):
            label = h.get("label") or h.get("title") or h.get("id") or ""
            snip = h.get("snippet") or h.get("text") or h.get("summary") or ""
            bullets.append(f"• {label}: {str(snip)[:160]}".rstrip(": "))
        else:
            bullets.append(f"• {str(h)[:160]}")
    return bullets


def _fallback(message: str, actor: Optional[str], *, preamble: str = "") -> dict:
    """No usable LLM — still useful: grounded search over the message.

    Grounds over BOTH the real acquisition corpus (92k endpoints / subjects / OCR /
    benchmarks via corpus.search) AND the ontology, so the answer cites real data
    rather than the demo objects. ``preamble`` explains WHY we fell back.
    """
    corpus = _tools.call_tool("corpus.search", {"query": message, "k": 6}, actor=actor)
    chits = corpus.get("result") if isinstance(corpus, dict) else None
    onto = _tools.call_tool("search", {"query": message, "k": 4}, actor=actor)
    ohits = onto.get("result") if isinstance(onto, dict) else None
    if not preamble:
        preamble = "No language model is reachable, so I grounded this with a direct search."
    blocks = []
    if isinstance(chits, list) and chits:
        blocks.append("From the acquisition corpus (real sources):\n" + "\n".join(_search_bullets(chits)))
    if isinstance(ohits, list) and ohits:
        blocks.append("From the ontology:\n" + "\n".join(_search_bullets(ohits)))
    if blocks:
        answer = preamble + "\n\n" + "\n\n".join(blocks)
    else:
        answer = (preamble + " Search returned nothing for that query. "
                  "Start Ollama (OLLAMA_HOST) or set KIMI_API_KEY to enable full reasoning.")
    return {
        "answer": answer, "backend": None, "steps": 1,
        "used_tools": ["corpus.search", "search"],
        "trace": [
            {"thought": "LLM unavailable — corpus grounding", "tool": "corpus.search",
             "params": {"query": message, "k": 6}, "observation": corpus},
            {"thought": "LLM unavailable — ontology grounding", "tool": "search",
             "params": {"query": message, "k": 4}, "observation": onto},
        ],
    }


def _synthesise_from_trace(message: str, trace: list[dict], backend: Optional[str],
                           used: list[str], llm_failed: bool) -> dict:
    """Deterministic, honest summary of tool observations when the LLM can't write
    the final answer. Surfaces real results — never invents a narrative."""
    lines = ["Here is what the tools returned (the model could not compose a prose "
             "summary, so this is the raw grounded result):"]
    for step in trace:
        obs = step.get("observation") or {}
        res = obs.get("result") if isinstance(obs, dict) else obs
        head = f"\n[{step.get('tool')}]"
        if isinstance(res, list) and res:
            lines.append(head)
            for h in res[:6]:
                if isinstance(h, dict):
                    label = h.get("label") or h.get("title") or h.get("id") or ""
                    snip = h.get("snippet") or h.get("text") or h.get("summary") or ""
                    lines.append(f"  • {label}: {str(snip)[:160]}".rstrip(": "))
                else:
                    lines.append(f"  • {str(h)[:160]}")
        elif isinstance(res, dict):
            lines.append(f"{head} {json.dumps(res, default=str)[:300]}")
        else:
            lines.append(f"{head} {str(obs)[:200]}")
    return {"answer": "\n".join(lines), "trace": trace, "backend": backend,
            "steps": len(trace), "used_tools": used}


def run_agent(message: str, history: Optional[list] = None,
              actor: Any = None, max_steps: int = MAX_STEPS_DEFAULT) -> dict:
    """Run the planner/executor loop. Returns
    ``{answer, trace, backend, steps, used_tools}``. Never raises."""
    message = str(message or "").strip()
    history = history if isinstance(history, list) else []
    actor_id = actor.get("id") if isinstance(actor, dict) else actor
    if not message:
        return {"answer": "", "trace": [], "backend": _llm.backend(),
                "steps": 0, "used_tools": []}

    backend = _llm.backend()
    if backend is None:
        return _fallback(message, actor_id)

    tools = _tool_brief()
    system = _system_prompt(tools)
    trace: list[dict] = []
    used: list[str] = []
    answer: Optional[str] = None
    llm_failed = False

    for _ in range(max(1, max_steps)):
        prompt = _scratchpad(message, history, trace)
        raw = _llm.llm_complete(prompt, system=system, fmt="json", max_tokens=512)
        if raw is None:
            # Backend advertised but inference failed (e.g. model crash/timeout).
            llm_failed = True
            break
        step = _parse_step(raw)
        if not step:
            # model gave prose, not JSON — accept it as the final answer.
            answer = (raw or "").strip() or None
            break
        if step.get("action") == "final" or "answer" in step:
            answer = str(step.get("answer") or "").strip() or None
            break
        tool = str(step.get("tool") or "")
        params = step.get("params") if isinstance(step.get("params"), dict) else {}
        if not tool:
            answer = str(step.get("thought") or "").strip() or None
            break
        obs = _dispatch(tool, params, actor_id)
        used.append(tool)
        trace.append({"thought": str(step.get("thought") or ""),
                      "tool": tool, "params": params, "observation": obs})

    if answer is None and not llm_failed:
        # Ran out of steps — try one LLM synthesis from what we gathered.
        synth_prompt = (_scratchpad(message, history, trace)
                        + '\nGive the final answer now as {"action":"final","answer":"..."}.')
        raw = _llm.llm_complete(synth_prompt, system=system, fmt="json", max_tokens=512)
        if raw is None:
            llm_failed = True
        else:
            step = _parse_step(raw)
            answer = (str(step.get("answer")) if step and step.get("answer")
                      else (raw or "").strip() or None)

    if answer is None:
        # LLM unavailable/crashed. If tools already produced observations, give a
        # deterministic, grounded synthesis of them; otherwise run the search
        # fallback. Honest either way — never a fabricated summary.
        if trace:
            return _synthesise_from_trace(message, trace, backend, used, llm_failed)
        preamble = ("The language model backend failed during inference "
                    "(model crash/timeout), so I grounded this with a direct search instead."
                    if llm_failed else "")
        fb = _fallback(message, actor_id, preamble=preamble)
        if llm_failed:
            fb["backend"] = backend
        return fb

    if _audit is not None:
        try:
            _audit.record(actor_id or "anonymous", "jarvis.agent.chat", message[:120],
                          {"steps": len(trace), "tools": used, "backend": backend})
        except Exception:  # noqa: BLE001
            pass

    return {"answer": answer, "trace": trace, "backend": backend,
            "steps": len(trace), "used_tools": used}
