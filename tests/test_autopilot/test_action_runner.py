"""ActionRunner: respects policy guard + writes proposals."""
import os
from autopilot.control.action_runner import ActionRunner


def test_safe_command_executes_dry_run():
    r = ActionRunner().execute(name="noop.echo", dry_run=True)
    assert r["ok"] is True
    assert r["verdict"]["allowed"] is True


def test_dangerous_command_blocked():
    r = ActionRunner().execute(name="gpu.dispose")
    assert r["ok"] is False
    assert r["verdict"]["blocked"] is True


def test_proposal_creates_markdown_file(tmp_path, monkeypatch):
    # redirect proposals dir
    runner = ActionRunner()
    monkeypatch.setattr(
        "autopilot.control.action_runner.ROOT", str(tmp_path)
    )
    os.makedirs(os.path.join(tmp_path, "autopilot", "reports", "proposals"),
                exist_ok=True)
    path = runner.propose(kind="fix", title="Test proposal", body="Body line.")
    assert os.path.exists(path)
    with open(path) as fh:
        content = fh.read()
    assert "Test proposal" in content
    assert "Body line." in content
