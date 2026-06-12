"""Agent OS — AgentCore (planner + permission-gated executor).

`AgentCore` (singleton `CORE`) is the brain of the Agent OS. It turns a natural
language command into a structured, tool-constrained plan, then executes that
plan one step at a time under the permission engine, streaming the whole thing
onto the shared `EventBus` and persisting jobs + run records.

Two phases:

  plan(command) -> {"steps": [{tool, args, why}], "summary": str, "source": ...}
      Asks the box LLM (OpenAI-compatible /v1/chat/completions, model
      `llama3.1:8b` unless AGENT_PLANNER_MODEL is set) for a JSON plan whose
      `tool` ids are constrained to the registered tool catalog. The reply is
      parsed defensively (fence stripping + balanced-block extraction + repair),
      normalized, and any step whose tool is not registered is dropped. If the
      box is unreachable / the reply is unparseable / zero valid steps survive,
      a deterministic keyword `_fallback_plan` takes over so the agent always
      has *something* real to run. `source` is "llm" | "fallback" | "empty".

  execute(command, auto_only=False) -> run_id
      Emits agent.thinking + agent.plan, then for each step asks
      permission.decide(tool, args):
        * auto    -> launch a real job (jobs.create + jobs.run with the tool
                     handler), a watcher copies the job's status/result back into
                     the step and writes a `tool_result` memory row.
        * confirm -> mark the step "awaiting", emit permission.required, and pause
                     it (the run becomes "awaiting_approval").
        * deny    -> mark the step "denied", emit tool.failed.
      With auto_only=True, any non-auto step is "skipped" instead.

  continue_run(run_id, approvals) -> run record
      Resumes the "awaiting" steps. approvals maps step index -> bool (default
      approve). A rejected step becomes "rejected"; an approved destructive step
      first records a `backup_manifest` memory row before its job launches.

Nothing here raises to the caller: execute() always returns a run_id,
plan()/continue_run()/get_run()/list_runs() always return a dict/list. Runs live
in an in-process map (under an RLock) and are mirrored to agent memory
(kind="run") so they survive a dashboard reload.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.request
import uuid
from typing import Any, Dict, List, Optional, Union

try:  # normal package import
    from . import jobs as _jobs
    from . import memory as _memory
    from . import permission as _permission
    from . import tools as _tools
    from .events import BUS
except ImportError:  # pragma: no cover — allow `python server/agent/core.py`
    # No parent package: put the repo root on sys.path and import as a package so
    # the submodules' own relative imports keep working.
    import sys as _sys

    _repo = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if _repo not in _sys.path:
        _sys.path.insert(0, _repo)
    from server.agent import jobs as _jobs  # type: ignore
    from server.agent import memory as _memory  # type: ignore
    from server.agent import permission as _permission  # type: ignore
    from server.agent import tools as _tools  # type: ignore
    from server.agent.events import BUS  # type: ignore


# --------------------------------------------------------------------------- #
# Box LLM configuration (same defaults the dashboard / tools use)
# --------------------------------------------------------------------------- #
BOX = (os.environ.get("OLLAMA_HOST") or "http://127.0.0.1:11434").rstrip("/")
# Chat completions base: BOX already ends in /v1 -> use as-is, else append /v1.
_LLM_BASE = BOX if BOX.endswith("/v1") else BOX + "/v1"
PLANNER_MODEL = os.environ.get("AGENT_PLANNER_MODEL") or "qwen2.5:32b"

# Use the tiered LLM seam for planning so the agent can use the GPU brain, Moonshot/Kimi, etc.
try:
    from ..services import tiered_llm as _T
except Exception:  # noqa: BLE001
    _T = None  # type: ignore[assignment]

# Bound the plan size so a chatty model can't queue a hundred jobs.
_MAX_STEPS = 8


# --------------------------------------------------------------------------- #
# Defensive JSON extraction from an LLM reply
# --------------------------------------------------------------------------- #
def _strip_code_fences(text: str) -> str:
    """Remove ```json ... ``` / ``` ... ``` fences, returning the inner body."""
    if not text:
        return ""
    t = text.strip()
    # Grab the first fenced block if present.
    m = re.search(r"```(?:json|JSON)?\s*(.*?)```", t, re.DOTALL)
    if m:
        return m.group(1).strip()
    return t


def _extract_balanced(text: str) -> Optional[str]:
    """Return the first balanced {...} or [...] block in `text` (string-aware)."""
    if not text:
        return None
    start = None
    opener = closer = ""
    for i, ch in enumerate(text):
        if ch in "{[":
            start = i
            opener = ch
            closer = "}" if ch == "{" else "]"
            break
    if start is None:
        return None
    depth = 0
    in_str = False
    esc = False
    for j in range(start, len(text)):
        ch = text[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == opener:
            depth += 1
        elif ch == closer:
            depth -= 1
            if depth == 0:
                return text[start : j + 1]
    return None


def _parse_llm_json(text: str) -> Optional[Union[dict, list]]:
    """Best-effort parse of an LLM reply into a dict/list. Never raises."""
    if not text:
        return None
    candidate = _strip_code_fences(text)
    for attempt in (candidate, _extract_balanced(candidate) or "", text,
                    _extract_balanced(text) or ""):
        attempt = (attempt or "").strip()
        if not attempt:
            continue
        try:
            return json.loads(attempt)
        except Exception:  # noqa: BLE001
            # Common repair: trailing commas before } or ].
            try:
                repaired = re.sub(r",\s*([}\]])", r"\1", attempt)
                return json.loads(repaired)
            except Exception:  # noqa: BLE001
                continue
    return None


# --------------------------------------------------------------------------- #
# AgentCore
# --------------------------------------------------------------------------- #
class AgentCore:
    """LLM planner + permission-gated, event-streaming executor."""

    def __init__(self) -> None:
        self._runs: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ #
    # Tool catalog helpers
    # ------------------------------------------------------------------ #
    @staticmethod
    def _registered_ids() -> List[str]:
        try:
            return list(_tools.ids())
        except Exception:  # noqa: BLE001
            return []

    @staticmethod
    def _tool_signature(tool_id: str) -> str:
        """A compact 'id(arg*, arg) — desc' signature for the planner prompt."""
        try:
            t = _tools.get(tool_id)
            schema = getattr(t, "input_schema", {}) or {}
            props = schema.get("properties", {}) or {}
            required = set(schema.get("required", []) or [])
            parts = []
            for name, spec in props.items():
                spec = spec if isinstance(spec, dict) else {}
                typ = spec.get("type", "any")
                mark = "*" if name in required else ""
                parts.append(f"{name}{mark}:{typ}")
            sig = ", ".join(parts)
            desc = (getattr(t, "description", "") or "").strip()
            return f"{tool_id}({sig}) — {desc}"
        except Exception:  # noqa: BLE001
            return tool_id

    def _resolve_id(self, candidates: List[str]) -> Optional[str]:
        """Return the first candidate id that is actually registered."""
        ids = set(self._registered_ids())
        for c in candidates:
            if c in ids:
                return c
        return None

    # ------------------------------------------------------------------ #
    # Planning
    # ------------------------------------------------------------------ #
    def _llm_plan(self, command: str) -> Optional[Dict[str, Any]]:
        """Ask the tiered LLM seam for a JSON plan. Returns a normalized plan or None."""
        ids = self._registered_ids()
        if not ids:
            return None
        catalog = "\n".join("  - " + self._tool_signature(tid) for tid in ids)
        system = (
            "You are JARVIS's planning module. Convert the user's request into a "
            "JSON plan that ONLY uses the registered tools below. Respond with "
            "STRICT JSON and nothing else, in this exact shape:\n"
            '{"summary": "<one sentence>", "steps": [{"tool": "<exact tool id>", '
            '"args": {<key:value>}, "why": "<short reason>"}]}\n'
            "Rules: use ONLY tool ids from the catalog (copy them exactly); put "
            "required args (marked with *) in `args`; prefer the fewest steps that "
            "answer the request; if a request mentions several things (e.g. disk "
            "AND gpu) include a step for each; never invent tools or args.\n\n"
            "Registered tools:\n" + catalog
        )
        content = None
        # PRIMARY: tiered seam (GPU/Moonshot/OpenAI/Anthropic), strong tier, JSON mode
        if _T is not None:
            try:
                r = _T.complete(prompt=str(command), system=system, tier="strong", fmt="json",
                                module="server/agent/core")
                if r and r.get("ok"):
                    content = (r.get("content") or "").strip()
            except Exception:  # noqa: BLE001
                content = None
        # FALLBACK: direct box call if tiered seam unavailable
        if not content:
            body = json.dumps({
                "model": PLANNER_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": str(command)},
                ],
                "temperature": 0.1,
                "max_tokens": 700,
                "stream": False,
            }).encode("utf-8")
            url = _LLM_BASE + "/chat/completions"
            try:
                req = urllib.request.Request(
                    url, data=body,
                    headers={"Content-Type": "application/json", "Authorization": "Bearer ollama"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=20) as r:  # noqa: S310 — fixed internal host
                    raw = r.read().decode("utf-8", "replace")
                payload = json.loads(raw)
                content = payload["choices"][0]["message"]["content"]
            except Exception:  # noqa: BLE001
                return None
        if not content:
            return None
        parsed = _parse_llm_json(content)
        if parsed is None:
            return None
        plan = self._normalize_plan(parsed)
        if not plan["steps"]:
            return None
        plan["source"] = "llm"
        return plan

    def _normalize_plan(self, parsed: Any) -> Dict[str, Any]:
        """Coerce an arbitrary parsed object into {steps, summary, source}. Drops
        steps whose tool is not registered; coerces args to dict. Never raises."""
        ids = set(self._registered_ids())
        summary = ""
        raw_steps: List[Any] = []
        try:
            if isinstance(parsed, dict):
                summary = str(parsed.get("summary") or parsed.get("plan") or "")
                if isinstance(parsed.get("steps"), list):
                    raw_steps = parsed["steps"]
                elif parsed.get("tool"):
                    # A single-step object.
                    raw_steps = [parsed]
            elif isinstance(parsed, list):
                raw_steps = parsed
        except Exception:  # noqa: BLE001
            raw_steps = []

        steps: List[Dict[str, Any]] = []
        for item in raw_steps[: _MAX_STEPS * 3]:  # scan generously, cap output below
            try:
                if not isinstance(item, dict):
                    continue
                tool_id = item.get("tool") or item.get("id") or item.get("name")
                if not tool_id or tool_id not in ids:
                    continue
                args = item.get("args")
                if not isinstance(args, dict):
                    args = {}
                why = str(item.get("why") or item.get("reason") or "")
                steps.append({"tool": str(tool_id), "args": args, "why": why})
            except Exception:  # noqa: BLE001
                continue
            if len(steps) >= _MAX_STEPS:
                break
        if not summary:
            summary = ("Plan: " + ", ".join(s["tool"] for s in steps)) if steps else ""
        return {"steps": steps, "summary": summary, "source": "llm"}

    def _fallback_plan(self, command: str) -> Dict[str, Any]:
        """Deterministic keyword router used when the LLM is unavailable or empty.
        Maps intents to whichever real tool ids are registered (catalog or base
        naming). Always returns a runnable plan (system snapshot default)."""
        text = (command or "").lower()
        steps: List[Dict[str, Any]] = []

        def add(candidates: List[str], args: Dict[str, Any], why: str) -> bool:
            tid = self._resolve_id(candidates)
            if tid and not any(s["tool"] == tid for s in steps):
                steps.append({"tool": tid, "args": args, "why": why})
                return True
            return False

        def has(*words: str) -> bool:
            return any(w in text for w in words)

        if has("disk", "storage", "space", "df", "/opt", "filesystem"):
            add(["server.disk.audit", "disk.audit"], {}, "report disk usage")
            add(["storage.large_files.find", "large_files.find"],
                {"root": "/opt", "min_mb": 100, "top": 15}, "find largest files")
        if has("gpu", "vram", "cuda", "model", "ollama"):
            add(["gpu.status.inspect", "gpu.status"], {}, "report GPU / model state")
        if has("docker", "container"):
            add(["docker.usage.inspect", "docker.usage"], {}, "report docker usage")
        if has("ram", "memory usage", "swap", "free memory"):
            add(["server.cpu.inspect", "memory.status"], {}, "report memory/cpu state")
        if has("cpu", "load", "process"):
            add(["server.cpu.inspect"], {}, "report cpu load + top processes")
        if has("pm2", "service", "logs", "log "):
            m = re.search(r"\b(jarvis[-\w.]*)\b", text)
            svc = m.group(1) if m else None
            if svc:
                add(["server.logs.read"], {"service": svc, "lines": 50},
                    f"read logs for {svc}")
            else:
                add(["pm2.status"], {}, "report pm2 process status")
        if has("box health", "reachable", "ollama health", "is the box"):
            add(["box.health", "gpu.status.inspect", "gpu.status"], {}, "check box health")
        if has("brain", "knowledge", "topics", "notes", "lookup"):
            add(["knowledge.stats", "brain.query"], {"query": command, "limit": 10},
                "query the knowledge base")
        if has("remember", "note that", "save that"):
            add(["agent.memory.write", "memory.remember"],
                {"key": command[:60], "value": command}, "store to memory")
        if has("recall", "what do you know", "remind me"):
            add(["agent.memory.search", "memory.recall"],
                {"query": command, "limit": 20}, "recall from memory")
        if has("duplicate", "dedupe", "dupes"):
            add(["storage.duplicates.find"], {"root": "/opt", "min_mb": 50},
                "find duplicate files")

        if not steps:
            # System snapshot default — broadly useful, all safe_read.
            add(["server.disk.audit", "disk.audit"], {}, "disk snapshot")
            add(["server.cpu.inspect", "memory.status"], {}, "cpu/memory snapshot")
            add(["gpu.status.inspect", "gpu.status"], {}, "gpu snapshot")

        steps = steps[:_MAX_STEPS]
        summary = "System snapshot" if not command else f"Plan for: {command[:80]}"
        source = "fallback" if steps else "empty"
        return {"steps": steps, "summary": summary, "source": source}

    def plan(self, command: str) -> Dict[str, Any]:
        """Produce a tool-constrained plan. Never raises."""
        try:
            llm = self._llm_plan(command)
            if llm and llm.get("steps"):
                return llm
        except Exception:  # noqa: BLE001
            pass
        try:
            return self._fallback_plan(command)
        except Exception:  # noqa: BLE001
            return {"steps": [], "summary": "", "source": "empty"}

    # ------------------------------------------------------------------ #
    # Run-record bookkeeping
    # ------------------------------------------------------------------ #
    def _save_run(self, run: Dict[str, Any]) -> None:
        run["updated_ts"] = time.time()
        with self._lock:
            self._runs[run["run_id"]] = run
        try:
            _memory.write("run", run["run_id"], run, tags=["run", run.get("status", "")])
        except Exception:  # noqa: BLE001
            pass

    def _new_run(self, command: str, plan: Dict[str, Any]) -> Dict[str, Any]:
        run_id = "run-" + uuid.uuid4().hex[:12]
        steps = []
        for i, s in enumerate(plan.get("steps", [])):
            steps.append({
                "index": i,
                "tool": s.get("tool"),
                "args": s.get("args") or {},
                "why": s.get("why") or "",
                # pending|running|completed|failed|awaiting|denied|skipped|rejected|cancelled
                "status": "pending",
                "mode": None,
                "reason": None,
                "risk": None,
                "requires_backup": False,
                "job_id": None,
                "result": None,
                "error": None,
            })
        return {
            "run_id": run_id,
            "command": command,
            "summary": plan.get("summary", ""),
            "source": plan.get("source", ""),
            "status": "running",          # running|awaiting_approval|completed|failed
            "steps": steps,
            "created_ts": time.time(),
            "updated_ts": time.time(),
        }

    # ------------------------------------------------------------------ #
    # Step launching (real jobs)
    # ------------------------------------------------------------------ #
    def _launch_step(self, run_id: str, step: Dict[str, Any]) -> None:
        """Create + run a real job for `step` and wait for its worker so
        execute()/continue_run() see the final status. The job itself runs in its
        own daemon thread (jobs.run)."""
        tool_id = step["tool"]
        args = step.get("args") or {}
        job_id = _jobs.create(tool_id, args, run_id=run_id)
        step["job_id"] = job_id
        step["status"] = "running"
        if job_id < 0:
            step["status"] = "failed"
            step["error"] = "could not create job"
            BUS.emit("tool.failed", {"tool": tool_id, "error": step["error"], "run_id": run_id})
            return

        def _handler(a: Dict[str, Any], ctx: Any) -> Any:
            return _tools.call_handler(tool_id, a, ctx)

        th = _jobs.run(job_id, _handler, wait=False)
        # Wait for the worker; bound it by the tool's own timeout + slack.
        try:
            t = _tools.get(tool_id)
            limit = int(getattr(t, "timeout", 60) or 60) + 30
        except Exception:  # noqa: BLE001
            limit = 90
        try:
            th.join(timeout=limit)
        except Exception:  # noqa: BLE001
            pass

        job = _jobs.get(job_id) or {}
        step["status"] = job.get("status") or "failed"
        step["result"] = job.get("result")
        step["error"] = job.get("error")
        # Persist the tool result to memory for recall/learning.
        try:
            _memory.write(
                "tool_result", f"{tool_id}@{run_id}",
                {"tool": tool_id, "args": args, "status": step["status"],
                 "result": step.get("result"), "run_id": run_id},
                tags=[tool_id, run_id, step["status"]],
            )
        except Exception:  # noqa: BLE001
            pass

    def _record_backup_manifest(self, run_id: str, step: Dict[str, Any]) -> None:
        """For destructive steps: record a backup/manifest memory row + progress
        event BEFORE the step launches (the permission contract's backup-first)."""
        manifest = {
            "run_id": run_id,
            "tool": step.get("tool"),
            "args": step.get("args"),
            "ts": time.time(),
            "note": "pre-destructive snapshot of intended operation",
        }
        try:
            _memory.write("backup_manifest", f"{step.get('tool')}@{run_id}",
                          manifest, tags=["backup_manifest", run_id])
        except Exception:  # noqa: BLE001
            pass
        BUS.emit("tool.progress", {
            "tool": step.get("tool"), "pct": 1, "run_id": run_id,
            "msg": "recorded backup manifest before destructive step",
        })

    # ------------------------------------------------------------------ #
    # Execution
    # ------------------------------------------------------------------ #
    def _process_step(self, run: Dict[str, Any], step: Dict[str, Any],
                      auto_only: bool) -> None:
        """Apply the permission verdict to a single pending step and act on it."""
        run_id = run["run_id"]
        tool = _tools.get(step["tool"])
        verdict = _permission.decide(tool if tool is not None else step["tool"],
                                     step.get("args"))
        step["mode"] = verdict.get("mode")
        step["reason"] = verdict.get("reason")
        step["risk"] = verdict.get("risk")
        step["requires_backup"] = bool(verdict.get("requires_backup"))

        mode = verdict.get("mode")
        if mode == "auto":
            self._launch_step(run_id, step)
        elif mode == "deny":
            step["status"] = "denied"
            step["error"] = verdict.get("reason")
            BUS.emit("tool.failed", {
                "tool": step["tool"], "error": step["error"], "run_id": run_id,
            })
        else:  # confirm
            if auto_only:
                step["status"] = "skipped"
                step["reason"] = (step.get("reason") or "") + " (auto_only: skipped)"
            else:
                step["status"] = "awaiting"
                BUS.emit("permission.required", {
                    "run_id": run_id,
                    "step": step["index"],
                    "tool": step["tool"],
                    "args": step.get("args") or {},
                    "reason": verdict.get("reason"),
                    "risk": verdict.get("risk"),
                    "requires_backup": step["requires_backup"],
                })

    def _finalize_status(self, run: Dict[str, Any]) -> None:
        """Set the run's overall status from its steps."""
        statuses = [s.get("status") for s in run["steps"]]
        if any(s == "awaiting" for s in statuses):
            run["status"] = "awaiting_approval"
        elif any(s == "failed" for s in statuses):
            run["status"] = "failed"
        else:
            run["status"] = "completed"
        run["updated_ts"] = time.time()

    def _run_async(self, run: Dict[str, Any], auto_only: bool) -> None:
        """Background driver for a single run (one daemon thread)."""
        try:
            for step in run["steps"]:
                if step["status"] != "pending":
                    continue
                self._process_step(run, step, auto_only)
                self._save_run(run)
        except Exception as e:  # noqa: BLE001
            run["status"] = "failed"
            run["error"] = str(e)
        finally:
            try:
                self._finalize_status(run)
            except Exception:  # noqa: BLE001
                run["status"] = "failed"
            self._save_run(run)

    def execute(self, command: str, auto_only: bool = False) -> str:
        """Plan + execute a command. Returns a run_id immediately; the run drives
        itself on a daemon thread, streaming events onto the BUS. Never raises."""
        try:
            plan = self.plan(command)
        except Exception:  # noqa: BLE001
            plan = {"steps": [], "summary": "", "source": "empty"}

        run = self._new_run(command, plan)
        self._save_run(run)

        BUS.emit("agent.thinking", {
            "run_id": run["run_id"], "command": command,
            "msg": "planning with the box LLM",
        })
        BUS.emit("agent.plan", {
            "run_id": run["run_id"], "command": command,
            "summary": plan.get("summary", ""), "source": plan.get("source", ""),
            "steps": [{"tool": s["tool"], "args": s["args"], "why": s["why"]}
                      for s in run["steps"]],
        })

        if not run["steps"]:
            run["status"] = "completed"
            self._save_run(run)
            return run["run_id"]

        th = threading.Thread(
            target=self._run_async, args=(run, auto_only),
            name=f"agentrun-{run['run_id']}", daemon=True,
        )
        th.start()
        return run["run_id"]

    # ------------------------------------------------------------------ #
    # Approvals / resume
    # ------------------------------------------------------------------ #
    def continue_run(self, run_id: str,
                     approvals: Optional[Dict[Union[int, str], bool]] = None) -> Dict[str, Any]:
        """Resume the `awaiting` steps of a run. `approvals` maps step index ->
        bool (default approve). Approved destructive steps record a backup
        manifest first. Returns the refreshed run record. Never raises."""
        try:
            with self._lock:
                run = self._runs.get(run_id)
            if run is None:
                return {"run_id": run_id, "error": "unknown run", "status": "unknown"}

            approvals = approvals or {}

            def _approved(idx: int) -> bool:
                if idx in approvals:
                    return bool(approvals[idx])
                if str(idx) in approvals:
                    return bool(approvals[str(idx)])
                return True  # default approve

            run["status"] = "running"
            self._save_run(run)
            for step in run["steps"]:
                if step.get("status") != "awaiting":
                    continue
                if not _approved(step["index"]):
                    step["status"] = "rejected"
                    step["reason"] = "rejected by approver"
                    BUS.emit("tool.failed", {
                        "tool": step["tool"], "error": "rejected by approver",
                        "run_id": run_id,
                    })
                    self._save_run(run)
                    continue
                if step.get("requires_backup"):
                    self._record_backup_manifest(run_id, step)
                self._launch_step(run_id, step)
                self._save_run(run)
            self._finalize_status(run)
            self._save_run(run)
            return run
        except Exception as e:  # noqa: BLE001
            return {"run_id": run_id, "error": str(e), "status": "failed"}

    # ------------------------------------------------------------------ #
    # Read accessors
    # ------------------------------------------------------------------ #
    def get_run(self, run_id: str) -> Dict[str, Any]:
        """Return a run record, refreshing each step's status/result from the job
        store so a long-poll UI sees live progress. Never raises."""
        try:
            with self._lock:
                run = self._runs.get(run_id)
            if run is None:
                return {"run_id": run_id, "error": "unknown run", "status": "unknown"}
            for step in run["steps"]:
                jid = step.get("job_id")
                if jid:
                    job = _jobs.get(jid)
                    if job:
                        if job.get("status"):
                            step["status"] = job["status"]
                        if job.get("result") is not None:
                            step["result"] = job["result"]
                        if job.get("error"):
                            step["error"] = job["error"]
            return run
        except Exception as e:  # noqa: BLE001
            return {"run_id": run_id, "error": str(e), "status": "failed"}

    def list_runs(self, n: int = 20) -> List[Dict[str, Any]]:
        """Return up to `n` recent runs, newest first. Never raises."""
        try:
            with self._lock:
                runs = sorted(
                    self._runs.values(),
                    key=lambda r: r.get("created_ts", 0),
                    reverse=True,
                )
            try:
                n = max(1, min(int(n), 500))
            except (TypeError, ValueError):
                n = 20
            return [dict(r) for r in runs[:n]]
        except Exception:  # noqa: BLE001
            return []


# Process-wide singleton.
CORE = AgentCore()


# --------------------------------------------------------------------------- #
# Self-contained smoke test
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    failures = 0

    def check(cond: bool, label: str, extra: Any = "") -> None:
        global failures
        ok = bool(cond)
        if not ok:
            failures += 1
        print(("PASS " if ok else "FAIL ") + label + (f"  -- {extra}" if extra else ""))

    # tools.py registers its catalog on import, so _registered_ids() is populated
    # whether core is run as a bare script or imported as part of the package.
    ids = CORE._registered_ids()
    check(len(ids) > 0, "tool catalog is registered", len(ids))

    # 1) plan() always returns the right shape with constrained tool ids.
    p = CORE.plan("how is disk and gpu looking?")
    check(isinstance(p, dict) and "steps" in p and "summary" in p and "source" in p,
          "plan() returns {steps,summary,source}", p.get("source"))
    check(all(s["tool"] in ids for s in p["steps"]),
          "every planned tool id is registered")
    check(len(p["steps"]) >= 1, "disk+gpu command produced at least one step",
          [s["tool"] for s in p["steps"]])

    # 2) fallback planner is deterministic and maps intents to real ids.
    fb = CORE._fallback_plan("check disk space and gpu vram")
    fb_tools = [s["tool"] for s in fb["steps"]]
    check(fb["source"] == "fallback" and len(fb_tools) >= 2,
          "fallback covers multi-intent (disk + gpu)", fb_tools)
    check(all(t in ids for t in fb_tools), "fallback tool ids are all registered")

    fb2 = CORE._fallback_plan("")
    check(fb2["source"] == "fallback" and len(fb2["steps"]) >= 1,
          "empty command -> system snapshot default", [s["tool"] for s in fb2["steps"]])

    # 3) JSON extraction helpers.
    fenced = '```json\n{"summary":"x","steps":[{"tool":"a","args":{}}]}\n```'
    check(_parse_llm_json(fenced) == {"summary": "x", "steps": [{"tool": "a", "args": {}}]},
          "parse strips ```json fences")
    noisy = 'Sure! Here you go: {"steps":[{"tool":"a","args":{},},],}  cheers'
    parsed = _parse_llm_json(noisy)
    check(isinstance(parsed, dict) and parsed.get("steps"),
          "parse extracts balanced block + repairs trailing commas")

    # 4) _normalize_plan drops unknown tools, keeps registered ones.
    real_id = ids[0]
    norm = CORE._normalize_plan({
        "summary": "mixed",
        "steps": [
            {"tool": "not_a_real_tool", "args": {}},
            {"tool": real_id, "args": {"x": 1}, "why": "keep me"},
            {"tool": real_id},
        ],
    })
    check(all(s["tool"] == real_id for s in norm["steps"]) and len(norm["steps"]) == 2,
          "_normalize_plan drops unknown tools, keeps registered", len(norm["steps"]))

    # 5) execute() a safe_read command end-to-end; streams events; completes.
    seq0 = BUS.latest_seq()
    run_id = CORE.execute("how is disk and gpu looking?")
    check(isinstance(run_id, str) and run_id.startswith("run-"),
          "execute() returns a run_id immediately", run_id)
    # Poll get_run until it settles (jobs run on daemon threads).
    deadline = time.time() + 60
    run = CORE.get_run(run_id)
    while time.time() < deadline and run.get("status") not in (
            "completed", "failed", "awaiting_approval"):
        time.sleep(0.5)
        run = CORE.get_run(run_id)
    check(run.get("status") in ("completed", "failed", "awaiting_approval"),
          "execute() run reaches a terminal/awaiting status", run.get("status"))
    completed = [s for s in run["steps"] if s.get("status") == "completed"]
    check(len(completed) >= 1, "at least one step completed with a real result",
          completed[0]["result"].get("summary")
          if completed and isinstance(completed[0].get("result"), dict) else "")
    evs = BUS.since(seq0)["events"]
    types = {e["type"] for e in evs}
    check("agent.thinking" in types and "agent.plan" in types,
          "execute() emitted agent.thinking + agent.plan")
    check("job.running" in types and "job.completed" in types,
          "execute() streamed job.running + job.completed", sorted(types))

    # 6) confirm gate + continue_run on a destructive tool, if one is registered.
    dest_id = None
    for tid in ids:
        t = _tools.get(tid)
        if getattr(t, "risk", None) == "destructive":
            dest_id = tid
            break
    if dest_id:
        run2 = CORE._new_run("verify a manifest", {
            "summary": "manifest verify",
            "source": "test",
            "steps": [{"tool": dest_id,
                       "args": {"manifest": "server/agent/__init__.py"},
                       "why": "verify"}],
        })
        CORE._save_run(run2)
        CORE._process_step(run2, run2["steps"][0], auto_only=False)
        CORE._finalize_status(run2)
        CORE._save_run(run2)
        check(run2["steps"][0]["status"] == "awaiting"
              and run2["status"] == "awaiting_approval",
              "destructive step gated to awaiting (confirm)", dest_id)
        check(run2["steps"][0]["requires_backup"] is True,
              "destructive step flagged requires_backup")
        rj = CORE.continue_run(run2["run_id"], {0: False})
        check(rj["steps"][0]["status"] == "rejected",
              "continue_run rejection -> rejected")
    else:
        check(True, "no destructive tool registered (skip confirm-gate test)")

    # 7) list_runs returns our runs newest-first.
    runs = CORE.list_runs(10)
    check(any(r["run_id"] == run_id for r in runs), "list_runs includes our run")

    # 8) never-raises contract on junk.
    check(isinstance(CORE.plan(None), dict),  # type: ignore[arg-type]
          "plan(None) returns a dict (no raise)")
    check(isinstance(CORE.execute(None), str),  # type: ignore[arg-type]
          "execute(None) returns a run_id (no raise)")
    check(CORE.get_run("nope").get("status") == "unknown",
          "get_run(missing) -> unknown")
    check(CORE.continue_run("nope").get("status") == "unknown",
          "continue_run(missing) -> unknown")

    print("\nRESULT:",
          "ALL AGENTCORE SMOKE TESTS PASSED" if failures == 0 else f"{failures} FAILURE(S)")
    raise SystemExit(0 if failures == 0 else 1)
