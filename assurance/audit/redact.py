"""Secret redaction for audit payloads.

Patterns cover everything the codebase already protects: API keys, GitHub
tokens, AWS / Wasabi access keys, bearer tokens, OpenAI/Anthropic/HF prefixes,
basic auth in URLs, JWTs, and arbitrary `password=...` / `secret=...` k/v.
"""
from __future__ import annotations

import re
from typing import Any

REDACTED = "***REDACTED***"

# Order matters — most-specific first.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}\b"), REDACTED),              # OpenAI / Anthropic
    (re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"), REDACTED),                  # Hugging Face
    (re.compile(r"\bghp_[A-Za-z0-9]{30,}\b"), REDACTED),                 # GitHub PAT
    (re.compile(r"\bgho_[A-Za-z0-9]{30,}\b"), REDACTED),                 # GitHub OAuth
    (re.compile(r"\bghs_[A-Za-z0-9]{30,}\b"), REDACTED),                 # GitHub server
    (re.compile(r"\bAKIA[0-9A-Z]{16}\b"), REDACTED),                     # AWS access key id
    (re.compile(r"\bASIA[0-9A-Z]{16}\b"), REDACTED),                     # AWS temp creds
    (re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}\b"), REDACTED),              # Google API
    (re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END[^-]+-----"), REDACTED),
    (re.compile(r"\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b"), REDACTED),  # JWT
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9_\-\.=]{16,}"), r"\1" + REDACTED),
    (re.compile(r"(?i)(authorization\s*[:=]\s*)[\"']?[^\s\"'&]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(password\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(passwd\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(api[_\-]?key\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(secret\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(token\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    (re.compile(r"(?i)(wasabi[_\-]?(?:key|secret)\s*[:=]\s*)[\"']?[^\s\"'&,}]+"), r"\1" + REDACTED),
    # basic auth in URL: scheme://user:pass@host
    (re.compile(r"(://[^/:]+:)[^@\s/]+(@)"), r"\1" + REDACTED + r"\2"),
]

# Keys whose values should always be flattened to REDACTED regardless of value shape.
_SECRET_KEYS = {
    "password",
    "passwd",
    "secret",
    "token",
    "api_key",
    "apikey",
    "authorization",
    "bearer",
    "wasabi_key",
    "wasabi_secret",
    "aws_secret_access_key",
    "aws_access_key_id",
    "anthropic_api_key",
    "openai_api_key",
    "kimi_api_key",
    "hf_token",
    "github_token",
    "private_key",
}


def redact_str(s: str) -> str:
    out = s
    for pat, repl in _PATTERNS:
        out = pat.sub(repl, out)
    return out


def redact_value(v: Any) -> Any:
    if isinstance(v, str):
        return redact_str(v)
    if isinstance(v, dict):
        return {k: (REDACTED if k.lower() in _SECRET_KEYS else redact_value(vv)) for k, vv in v.items()}
    if isinstance(v, list):
        return [redact_value(x) for x in v]
    if isinstance(v, tuple):
        return tuple(redact_value(x) for x in v)
    return v


def has_secret(s: str) -> bool:
    """Cheap probe: returns True if a redaction pattern would match."""
    if not s:
        return False
    return any(p.search(s) for p, _ in _PATTERNS)
