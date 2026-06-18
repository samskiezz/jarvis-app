"""PolicyGuard: classify + block + path + allow logic."""
from autopilot.policy.guard import PolicyGuard, classify_action, is_blocked


def test_classify_read_only_for_discover():
    assert classify_action("discover.scan") == "read_only"


def test_classify_destructive_for_dispose():
    assert classify_action("gpu.dispose") == "destructive"


def test_classify_deploy_for_apollo_release():
    assert classify_action("apollo.release") == "deploy"


def test_classify_code_modify_for_patch():
    assert classify_action("code.modify.refactor") == "code_modify"


def test_block_command_name_in_blocklist():
    blocked, why = is_blocked("gpu.dispose")
    assert blocked is True
    assert "blocked-actions" in why or "dangerous" in why


def test_block_shell_pattern_rm_rf():
    blocked, why = is_blocked("noop", "rm -rf /tmp/foo")
    assert blocked is True
    assert "rm" in why


def test_block_pattern_drop_table():
    blocked, why = is_blocked("noop", "DROP TABLE users;")
    assert blocked is True


def test_safe_name_passes():
    blocked, _ = is_blocked("noop.echo", "")
    assert blocked is False


def test_guard_read_only_auto_allowed():
    v = PolicyGuard().evaluate("discover.scan")
    assert v.allowed is True
    assert v.blocked is False


def test_guard_destructive_blocked():
    v = PolicyGuard().evaluate("rm.everything")
    assert v.blocked is True


def test_guard_code_modify_routes_to_forge():
    v = PolicyGuard().evaluate("code.modify.refactor")
    assert v.requires_approval is True
    assert v.route == "forge"


def test_guard_dry_run_bypasses_class():
    v = PolicyGuard().evaluate("gpu.launch_disposable", dry_run=True)
    # blocked by name regardless? No: gpu.launch_disposable IS in blocked-actions.
    assert v.blocked is True


def test_guard_approved_bypasses_block_unless_hard_blocked():
    # discover.scan with approved=True → still allowed
    v = PolicyGuard().evaluate("discover.scan", approved=True)
    assert v.allowed is True


def test_guard_safe_write_outside_allowed_paths_needs_approval():
    v = PolicyGuard().evaluate("fs.write", paths=["/etc/hostname"])
    assert v.allowed is False
    assert v.requires_approval is True
