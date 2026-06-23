"""Owner consent 2026-06-19: code_modify/worker_start/worker_stop are auto:true now."""
from autopilot.policy.guard import PolicyGuard


def test_code_modify_auto_in_allowed_path(tmp_path):
    v = PolicyGuard().evaluate("code.modify.docfix",
                                paths=["autopilot/reports/foo.md"])
    assert v.allowed is True
    assert v.blocked is False


def test_worker_start_auto_allowed():
    v = PolicyGuard().evaluate("worker.start.example")
    assert v.allowed is True


def test_worker_stop_auto_allowed():
    v = PolicyGuard().evaluate("worker.stop.example")
    assert v.allowed is True


def test_destructive_still_hard_blocked():
    v = PolicyGuard().evaluate("rm.everything")
    assert v.blocked is True


def test_deploy_still_blocked():
    v = PolicyGuard().evaluate("deploy.production")
    assert v.blocked is True


def test_database_write_still_blocked():
    v = PolicyGuard().evaluate("db.write.delete")
    assert v.blocked is True
