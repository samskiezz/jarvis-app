"""Direct in-character Minion chat — must work with NO API key (local fallback)."""

from __future__ import annotations

import asyncio

from underworld.server.services import minion_chat


def _seed_minion(client, headers) -> dict:
    create = client.post(
        "/worlds",
        json={"name": "ChatTest", "cpc_class": "H02J", "starting_population": 12},
        headers=headers,
    )
    assert create.status_code == 201, create.text
    world_id = create.json()["id"]
    res = client.get(f"/worlds/{world_id}/minions", headers=headers)
    assert res.status_code == 200, res.text
    minions = res.json()
    assert minions, "world should seed at least one minion"
    return minions[0]


def test_chat_returns_reply_without_api_key(client, headers):
    minion = _seed_minion(client, headers)
    res = client.post(
        f"/minions/{minion['id']}/chat",
        json={"message": "Who are you and how do you feel?"},
        headers=headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert isinstance(body["reply"], str) and body["reply"].strip()
    assert body["in_character"] is True
    # No API key configured in the test env → local fallback was used.
    assert body["used_llm"] is False


def test_chat_with_history(client, headers):
    minion = _seed_minion(client, headers)
    res = client.post(
        f"/minions/{minion['id']}/chat",
        json={
            "message": "What's your guild?",
            "history": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hello yourself."},
            ],
        },
        headers=headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["reply"].strip()


def test_chat_unknown_minion_404(client, headers):
    res = client.post(
        "/minions/does-not-exist/chat",
        json={"message": "hi"},
        headers=headers,
    )
    assert res.status_code == 404
    assert res.json()["detail"] == "minion not found"


def test_system_prompt_includes_name_and_guild(client, headers):
    minion = _seed_minion(client, headers)

    async def _build() -> str:
        from underworld.server.db.models import Minion
        from underworld.server.db.session import session_scope

        async with session_scope() as session:
            m = await session.get(Minion, minion["id"])
            return await minion_chat.build_system_prompt(session, m)

    prompt = asyncio.run(_build())
    assert minion["name"] in prompt
    assert minion["guild"] in prompt
    # In-character guardrails present.
    assert "FIRST PERSON" in prompt
    assert "AI" in prompt
