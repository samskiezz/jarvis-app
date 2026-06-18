"""Concrete workflows wired around real subsystems.

ClaudeRunWorkflow   — pending → running → done | failed | archived
GpuLifecycleWorkflow — requested → provisioning → ready → degraded → disposing → disposed
ChatRequestWorkflow  — received → routed → answered | failed
"""
from __future__ import annotations

from .state_machine import StateMachine, Transition

claude_run_workflow = StateMachine(
    name="claude_run",
    states=["pending", "running", "done", "failed", "archived"],
    initial="pending",
    transitions=[
        Transition("pending", "start", "running"),
        Transition("running", "complete", "done"),
        Transition("running", "fail", "failed"),
        Transition("done", "archive", "archived", required=("done",)),
        Transition("failed", "archive", "archived", required=("failed",)),
    ],
    terminal=("archived",),
)

gpu_lifecycle_workflow = StateMachine(
    name="gpu_lifecycle",
    states=["requested", "provisioning", "ready", "degraded", "disposing", "disposed"],
    initial="requested",
    transitions=[
        Transition("requested", "provision", "provisioning"),
        Transition("provisioning", "ready", "ready"),
        Transition("provisioning", "fail", "disposed"),
        Transition("ready", "degrade", "degraded"),
        Transition("degraded", "recover", "ready"),
        Transition("ready", "dispose", "disposing", required=("ready",)),
        Transition("degraded", "dispose", "disposing"),
        Transition("disposing", "disposed", "disposed"),
    ],
    terminal=("disposed",),
)

chat_request_workflow = StateMachine(
    name="chat_request",
    states=["received", "routed", "answered", "failed"],
    initial="received",
    transitions=[
        Transition("received", "route", "routed"),
        Transition("routed", "answer", "answered"),
        Transition("routed", "fail", "failed"),
        Transition("received", "fail", "failed"),
    ],
    terminal=("answered", "failed"),
)


def list_workflows() -> dict:
    return {
        wf.name: {
            "states": list(wf.states),
            "initial": wf.initial,
            "terminal": sorted(wf.terminal),
            "transitions": [
                {"src": t.src, "event": t.event, "dst": t.dst,
                 "required": list(t.required), "forbidden_after": list(t.forbidden_after)}
                for t in wf.transitions
            ],
        }
        for wf in (claude_run_workflow, gpu_lifecycle_workflow, chat_request_workflow)
    }
