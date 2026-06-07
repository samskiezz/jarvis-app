"""Multi-Agent Orchestration — specialist agents coordinated by a conductor.

Specialists:
  * analyst   — data summarisation, grounded retrieval
  * scientist — method invocation, quantitative reasoning
  * security  — policy checks, threat assessment
  * ops       — infrastructure, monitoring, alerting

The conductor breaks a task into subtasks, assigns each to a specialist,
collects results, and synthesises a final answer.

Tool execution reuses the existing ``jarvis_agent.py`` dispatch pattern.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from . import aip_tools as _tools
from . import jarvis_agent as _agent
from . import llm_research as _llm

try:
    from . import audit as _audit
except Exception:  # noqa: BLE001
    _audit = None  # type: ignore[assignment]


_SPECIALIST_PROMPTS = {
    "analyst": (
        "You are an Analyst agent. Ground every claim with search or retrieval. "
        "Prefer the 'search' and 'corpus.search' tools. Return concise, evidence-backed answers."
    ),
    "scientist": (
        "You are a Scientist agent. Use quantitative tools and the science registry. "
        "Prefer 'science.run' and 'ontology.query'. Return structured results with units/numbers."
    ),
    "security": (
        "You are a Security agent. Evaluate risks, check policies, and flag anomalies. "
        "Prefer read-only tools; write tools become proposals. Be paranoid and precise."
    ),
    "ops": (
        "You are an Ops agent. Monitor systems, check health, and trigger alerts. "
        "Return status summaries and recommend concrete actions."
    ),
}

_TOOL_SUBSETS: dict[str, list[str]] = {
    "analyst": ["search", "corpus.search", "docs.search", "ontology.query", "ontology.get"],
    "scientist": ["science.run", "science.list", "ontology.query", "search"],
    "security": ["search", "ontology.query", "ontology.get", "corpus.search"],
    "ops": ["search", "ontology.query", "ontology.get", "science.list"],
}


def _tool_brief_for_agent(agent_type: str) -> list[dict]:
    allowed = set(_TOOL_SUBSETS.get(agent_type, []))
    out: list[dict] = []
    for t in _tools.list_tools():
        if t.get("name") in allowed or t.get("kind") == "meta":
            out.append({
                "name": t.get("name"),
                "kind": t.get("kind"),
                "params_schema": t.get("params_schema", {}),
                "desc": (t.get("description") or "")[:140],
            })
    return out


def _system_prompt_for(agent_type: str) -> str:
    base = _SPECIALIST_PROMPTS.get(agent_type, "You are a generalist agent.")
    tools = _tool_brief_for_agent(agent_type)
    lines = [base, "", "Available tools:"]
    for t in tools:
        lines.append(f"  - {t['name']} ({t['kind']}): {t['desc']} params={json.dumps(t['params_schema'])}")
    lines += [
        "",
        "Respond with ONE JSON object and nothing else. Two shapes:",
        '  {"action":"tool","tool":"<name>","params":{...},"thought":"<why>"}',
        '  {"action":"final","answer":"<concise answer>"}',
    ]
    return "\n".join(lines)


class AgentStudio:
    """Registry of specialist agents."""

    def __init__(self):
        self.agents: dict[str, dict] = {}
        for name in _SPECIALIST_PROMPTS:
            self.register(name)

    def register(self, agent_type: str, system_prompt: Optional[str] = None) -> dict:
        """Add (or override) a specialist agent."""
        self.agents[agent_type] = {
            "type": agent_type,
            "system_prompt": system_prompt or _system_prompt_for(agent_type),
            "tools": _tool_brief_for_agent(agent_type),
        }
        return self.agents[agent_type]

    def list_agents(self) -> list[dict]:
        return [{"type": k, "tools": [t["name"] for t in v["tools"]]} for k, v in self.agents.items()]

    def get_agent(self, agent_type: str) -> dict | None:
        return self.agents.get(agent_type)


# Global studio instance
_studio = AgentStudio()


def _parse_step(text: Optional[str]) -> Optional[dict]:
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        pass
    import re
    m = re.search(r"\{.*\}", str(text), re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:  # noqa: BLE001
        return None


def _run_specialist(agent_type: str, subtask: str, actor: Any, max_steps: int = 4) -> dict:
    """Run a single specialist to completion (sync, bounded). Reuses jarvis_agent loop."""
    agent_def = _studio.get_agent(agent_type)
    if agent_def is None:
        return {"agent": agent_type, "error": "unknown agent type", "answer": ""}

    # We reuse jarvis_agent.run_agent but override its system prompt via monkey-patch
    # to the specialist version. This keeps the same dispatch/audit/trace machinery.
    original_system = _agent._system_prompt

    def specialist_system(tools):
        return agent_def["system_prompt"]

    _agent._system_prompt = specialist_system  # type: ignore[assignment]
    try:
        result = _agent.run_agent(subtask, actor=actor, max_steps=max_steps)
    finally:
        _agent._system_prompt = original_system  # type: ignore[assignment]

    return {
        "agent": agent_type,
        "answer": result.get("answer", ""),
        "trace": result.get("trace", []),
        "steps": result.get("steps", 0),
        "used_tools": result.get("used_tools", []),
        "backend": result.get("backend"),
    }


def _plan_subtasks(task: str, agents: list[str]) -> list[dict]:
    """Conductor LLM plans subtask decomposition. Falls back to simple split if no LLM."""
    if _llm.backend() is None:
        # Deterministic fallback: one subtask per agent, verbatim task.
        return [{"agent": a, "subtask": task} for a in agents]

    prompt = (
        f"You are a Conductor agent. Break the following task into subtasks for the specified specialists.\n"
        f"Task: {task}\n"
        f"Specialists available: {', '.join(agents)}\n\n"
        f"Return ONLY a JSON array of objects like: "
        f'[{{"agent":"analyst","subtask":"..."}}, ...]'
    )
    raw = _llm.llm_complete(prompt, system="You are a task planner. Output only valid JSON.", fmt="json", max_tokens=1024)
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [s for s in parsed if isinstance(s, dict) and s.get("agent") in agents]
        except Exception:  # noqa: BLE001
            pass
    return [{"agent": a, "subtask": task} for a in agents]


def _synthesise(task: str, sub_results: list[dict]) -> str:
    """Conductor synthesises specialist outputs into a coherent answer."""
    if _llm.backend() is None:
        lines = [f"[{r['agent']}] {r.get('answer', '')}" for r in sub_results]
        return "\n\n".join(lines)

    context = "\n\n".join(
        f"Agent: {r['agent']}\nAnswer: {r.get('answer', '')}\nTools used: {r.get('used_tools', [])}"
        for r in sub_results
    )
    prompt = (
        f"S synthesise a unified answer to the original task based on specialist outputs.\n\n"
        f"Original task: {task}\n\n"
        f"Specialist outputs:\n{context}\n\n"
        f"Unified answer:"
    )
    return _llm.llm_complete(prompt, system="You are a synthesis engine. Be concise and accurate.", max_tokens=1024) or ""


async def run_multi_agent(
    task: str,
    agents: list[str],
    max_steps: int = 8,
    actor: Any = None,
) -> dict:
    """Plan, delegate, collect, and synthesise a multi-agent response.

    Returns ``{ok, answer, plan, results, synthesis, conductor_backend}``. Never raises.
    """
    task = str(task or "").strip()
    if not task:
        return {"ok": True, "answer": "", "plan": [], "results": [], "synthesis": "", "conductor_backend": None}

    agent_types = [a for a in agents if a in _SPECIALIST_PROMPTS]
    if not agent_types:
        return {"ok": False, "error": "no valid agents specified", "plan": [], "results": [], "synthesis": "", "conductor_backend": None}

    plan = _plan_subtasks(task, agent_types)
    results: list[dict] = []
    for p in plan:
        # Cap per-agent steps so total stays bounded
        per_agent_steps = max(1, max_steps // len(plan))
        res = _run_specialist(p["agent"], p["subtask"], actor, max_steps=per_agent_steps)
        results.append(res)

    synthesis = _synthesise(task, results)

    if _audit is not None:
        try:
            _audit.record(
                _agent._actor_id(actor) or "anonymous",
                "agent_studio.multi",
                task[:120],
                {"agents": agent_types, "results": len(results), "steps": max_steps},
            )
        except Exception:  # noqa: BLE001
            pass

    return {
        "ok": True,
        "answer": synthesis,
        "plan": plan,
        "results": results,
        "synthesis": synthesis,
        "conductor_backend": _llm.backend(),
    }
