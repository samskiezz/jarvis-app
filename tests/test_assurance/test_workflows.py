"""Test state-machine workflows: allowed + forbidden transitions."""
import pytest

from assurance.workflows.state_machine import WorkflowError
from assurance.workflows.workflows import (
    chat_request_workflow,
    claude_run_workflow,
    gpu_lifecycle_workflow,
    list_workflows,
)


def test_claude_run_happy_path():
    i = claude_run_workflow.new_instance()
    assert i.state == "pending"
    i.fire("start"); assert i.state == "running"
    i.fire("complete"); assert i.state == "done"
    i.fire("archive"); assert i.state == "archived"
    assert i.terminated


def test_claude_run_cannot_archive_from_pending():
    i = claude_run_workflow.new_instance()
    with pytest.raises(WorkflowError):
        i.fire("archive")


def test_claude_run_cannot_archive_from_running():
    i = claude_run_workflow.new_instance()
    i.fire("start")
    with pytest.raises(WorkflowError):
        i.fire("archive")


def test_gpu_lifecycle_dispose_requires_ready_first():
    i = gpu_lifecycle_workflow.new_instance()
    i.fire("provision")
    with pytest.raises(WorkflowError):
        i.fire("dispose")  # not ready yet


def test_gpu_lifecycle_full_happy():
    i = gpu_lifecycle_workflow.new_instance()
    i.fire("provision"); i.fire("ready")
    i.fire("dispose"); i.fire("disposed")
    assert i.terminated


def test_chat_request_failed_terminal():
    i = chat_request_workflow.new_instance()
    i.fire("route"); i.fire("fail")
    assert i.terminated and i.state == "failed"


def test_list_workflows_returns_metadata():
    m = list_workflows()
    for name in ("claude_run", "gpu_lifecycle", "chat_request"):
        assert name in m
        assert "states" in m[name]
        assert "transitions" in m[name]
