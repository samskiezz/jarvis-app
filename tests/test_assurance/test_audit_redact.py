"""Test audit redaction."""
from assurance.audit.log import AUDIT_FILE, append_audit, read_recent
from assurance.audit.redact import has_secret, redact_str, redact_value


def test_redact_password_key():
    out = redact_value({"password": "hunter2"})
    assert out["password"] == "***REDACTED***"


def test_redact_sk_prefix_in_string():
    s = "Authorization: Bearer sk-1234567890abcdefghijklmn extra"
    assert "REDACTED" in redact_str(s)


def test_redact_aws_key():
    s = "AKIAIOSFODNN7EXAMPLE leaked here"
    assert "REDACTED" in redact_str(s)


def test_redact_basic_auth_in_url():
    s = "redis://user:p4ss@host:6379/0"
    out = redact_str(s)
    assert "p4ss" not in out and "REDACTED" in out


def test_has_secret_detects_jwt():
    s = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghij"
    assert has_secret(s) is True


def test_has_secret_false_on_normal_text():
    assert has_secret("hello world") is False


def test_append_audit_redacts_payload():
    append_audit("test.action", actor="alice", outcome="ok",
                 detail={"api_key": "sk-LEAKKEY1234567890ABCDEFGHI",
                         "msg": "no secret here"})
    items = read_recent(limit=5)
    assert items
    last = items[-1]
    txt = str(last)
    assert "sk-LEAKKEY" not in txt
    assert "REDACTED" in txt


def test_audit_jsonl_no_raw_secret_after_writes(tmp_path):
    append_audit("x", actor="x", detail={"password": "p4ssw0rd1234"})
    with open(AUDIT_FILE, encoding="utf-8") as fh:
        content = fh.read()
    assert "p4ssw0rd1234" not in content
