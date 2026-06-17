#!/usr/bin/env python3
"""Secure, interactive one-time Higgsfield setup + tiny smoke test.

This script:
  1. Prompts you (masked) for your Higgsfield KEY_ID and KEY_SECRET.
  2. Writes them to your local .env file (already gitignored).
  3. Runs one small image generation to verify the pipeline.

Your credentials are never printed, logged, or stored in source code.
"""

from __future__ import annotations

import asyncio
import getpass
import sys
from pathlib import Path

# Make the repo root importable as `underworld.*`.
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

ENV_PATH = REPO_ROOT / ".env"


def _read_dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def _write_dotenv(updates: dict[str, str]) -> None:
    values = _read_dotenv()
    values.update(updates)
    lines = ["# Underworld local environment overrides (gitignored)\n"]
    for key, value in sorted(values.items()):
        # Quote values that contain spaces or special characters.
        if any(c in value for c in " \\t#\"'\n\r"):
            value = f'"{value.replace("\\", "\\\\").replace('"', '\\"')}"'
        lines.append(f"{key}={value}\n")
    ENV_PATH.write_text("".join(lines), encoding="utf-8")
    print(f"[setup] wrote {len(updates)} value(s) to {ENV_PATH}")


def _prompt_credentials() -> tuple[str, str]:
    print("\n=== Higgsfield platform API v2 credential setup ===")
    print("Get these from https://cloud.higgsfield.ai/api-keys")
    key_id = getpass.getpass("Paste your Higgsfield KEY_ID: ").strip()
    key_secret = getpass.getpass("Paste your Higgsfield KEY_SECRET: ").strip()
    if not key_id or not key_secret:
        print("[error] both KEY_ID and KEY_SECRET are required.")
        sys.exit(1)
    return key_id, key_secret


def _configure_env(key_id: str, key_secret: str) -> None:
    _write_dotenv({
        "UNDERWORLD_HIGGSFIELD_ENABLED": "true",
        "UNDERWORLD_HIGGSFIELD_KEY_ID": key_id,
        "UNDERWORLD_HIGGSFIELD_KEY_SECRET": key_secret,
        "UNDERWORLD_HIGGSFIELD_BASE_URL": "https://platform.higgsfield.ai",
        # Keep the first test very cheap.
        "UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY": "5",
        "UNDERWORLD_HIGGSFIELD_MAX_JOBS_PER_WORLD_PER_TICK": "1",
    })


async def _run_smoke_test() -> None:
    # Reload settings from the freshly-written .env.
    from underworld.server.config import get_settings
    get_settings.cache_clear()

    settings = get_settings()
    if not settings.higgsfield_enabled or not (settings.higgsfield_key_id and settings.higgsfield_key_secret):
        print("[error] credentials were not loaded properly.")
        sys.exit(1)

    print("\n=== Running one tiny smoke test ===")
    print("Prompt: 'a small futuristic avatar village at dusk, concept art'")
    print("This should cost ~2 image credits.\n")

    from underworld.server.services import higgsfield

    result = await higgsfield.submit_image(
        "a small futuristic avatar village at dusk, concept art",
        seed=42,
    )

    if not result.get("ok"):
        print("[error] submission failed:")
        print(" ", result.get("error"))
        print(" ", result.get("detail", ""))
        sys.exit(1)

    request_id = higgsfield.request_id_from_response(result["data"])
    if not request_id:
        print("[error] no request_id in response:")
        print(" ", result["data"])
        sys.exit(1)

    print(f"[ok] submitted. request_id: {request_id}")
    print("[info] waiting 10 seconds, then polling once...")
    await asyncio.sleep(10)

    status = await higgsfield.get_status(request_id)
    print("[info] status response:")
    print(" ", status)

    url = higgsfield.extract_output_url(status.get("data", {}))
    if url:
        print(f"\n[ok] result URL: {url}")
    else:
        print("\n[info] generation is still in progress or no URL yet.")
        print("       Higgsfield jobs can take 30-120 seconds.")
        print(f"       You can re-check later with request_id: {request_id}")


def main() -> None:
    key_id, key_secret = _prompt_credentials()
    _configure_env(key_id, key_secret)
    try:
        asyncio.run(_run_smoke_test())
    except KeyboardInterrupt:
        print("\n[setup] interrupted.")
        sys.exit(0)


if __name__ == "__main__":
    main()
