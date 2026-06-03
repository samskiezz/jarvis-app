"""Direct, in-character chat with a single Minion.

A Minion answers AS ITSELF — grounded in its live simulation state: personality
(Big Five), mood + vitals, guild & swarm role, sense of purpose, recent memories,
and its strongest learned beliefs. When a Kimi K2 (Moonshot, OpenAI-compatible)
API key is configured we ask the real model; otherwise we compose a short, plausible
in-character reply locally so the feature always works offline.

Mirrors the sibling app's Kimi client (`server/llm/kimi.py`) and its local-fallback
spirit (`server/services/analyst.py`).
"""

from __future__ import annotations

from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db.models import CausalBelief, Memory, Minion


# --- Big-Five → adjectives -------------------------------------------------

def _trait_word(value: float, high: str, low: str, mid: str = "") -> str | None:
    if value >= 0.66:
        return high
    if value <= 0.34:
        return low
    return mid or None


def _personality_adjectives(m: Minion) -> list[str]:
    pairs = [
        (m.openness, "curious and imaginative", "conventional and practical"),
        (m.conscientiousness, "disciplined and meticulous", "easygoing and spontaneous"),
        (m.extraversion, "outgoing and talkative", "reserved and quiet"),
        (m.agreeableness, "warm and cooperative", "blunt and competitive"),
        (m.neuroticism, "anxious and easily rattled", "calm and even-tempered"),
    ]
    out: list[str] = []
    for value, high, low in pairs:
        word = _trait_word(value, high, low)
        if word:
            out.append(word)
    if m.intelligence >= 0.66:
        out.append("sharp-minded")
    if m.creativity >= 0.66:
        out.append("inventive")
    return out


def _vital_words(m: Minion) -> list[str]:
    """Translate 0..1 needs (lower is worse) into how the Minion feels."""
    out: list[str] = []
    if m.hunger <= 0.35:
        out.append("hungry")
    if m.thirst <= 0.35:
        out.append("thirsty")
    if m.fatigue <= 0.35:
        out.append("exhausted")
    elif m.fatigue <= 0.55:
        out.append("tired")
    if m.sanity <= 0.35:
        out.append("frayed and unwell in the mind")
    if m.health <= 0.4:
        out.append("in poor health")
    if m.injury and m.injury >= 0.3:
        out.append("nursing a wound")
    if (m.stress or 0.0) >= 0.6:
        out.append("under heavy stress")
    if not out:
        out.append("steady and well")
    return out


def _full_name(m: Minion) -> str:
    name = m.name
    if m.surname:
        name = f"{name} {m.surname}"
    return name.strip()


# --- prompt assembly -------------------------------------------------------

async def build_system_prompt(session: AsyncSession, minion: Minion) -> str:
    """Compose the in-character SYSTEM prompt from the Minion's live state."""
    guild = minion.guild.value if hasattr(minion.guild, "value") else str(minion.guild)
    role = (
        minion.swarm_role.value
        if hasattr(minion.swarm_role, "value")
        else str(minion.swarm_role)
    ).replace("_", " ")
    mood = minion.mood.value if hasattr(minion.mood, "value") else str(minion.mood)

    traits = _personality_adjectives(minion)
    vitals = _vital_words(minion)

    purpose = minion.purpose if minion.purpose is not None else 0.5
    purpose_line = (
        "burning with a sense of purpose" if purpose >= 0.66
        else "drifting, unsure of your purpose" if purpose <= 0.34
        else "quietly getting on with your work"
    )

    # A few recent, salient memories.
    mem_rows = (await session.execute(
        select(Memory)
        .where(Memory.minion_id == minion.id)
        .order_by(Memory.importance.desc(), Memory.tick.desc())
        .limit(5)
    )).scalars().all()
    memories = [mm.content.strip() for mm in mem_rows if mm.content and mm.content.strip()]

    # The 1-2 strongest learned beliefs.
    belief_rows = (await session.execute(
        select(CausalBelief)
        .where(CausalBelief.minion_id == minion.id)
        .order_by(CausalBelief.confidence.desc())
        .limit(2)
    )).scalars().all()
    beliefs = [
        f"that {b.cause.replace('_', ' ')} tends to improve your {b.effect.replace('_', ' ')}"
        for b in belief_rows
        if b.trials >= 1
    ]

    name = _full_name(minion)
    nick = f' (others call you "{minion.nickname}")' if minion.nickname else ""

    lines = [
        f"You are {name}{nick}, a living Minion in the Underworld simulation.",
        f"You belong to the {guild} guild and serve as a {role}.",
        f"You are generation {minion.generation}.",
    ]
    if traits:
        lines.append("By nature you are " + ", ".join(traits) + ".")
    lines.append(f"Right now your mood is {mood} and physically you feel {', '.join(vitals)}.")
    lines.append(f"You are {purpose_line}.")
    if memories:
        lines.append("Recent things you remember:")
        lines.extend(f"  - {mtxt}" for mtxt in memories[:5])
    if beliefs:
        lines.append("From experience you have come to believe " + "; and ".join(beliefs) + ".")
    if not minion.alive:
        lines.append("You are no longer alive — you speak as a memory or a departed soul.")

    lines.append("")
    lines.append(
        "Answer in the FIRST PERSON, in character, as this Minion. Keep replies "
        "short (1-3 sentences), grounded in your state, mood, guild and memories. "
        "Never break character, never mention being an AI, a language model, a "
        "prompt, or a simulation. You simply are who you are."
    )
    return "\n".join(lines)


# --- local fallback --------------------------------------------------------

def _local_reply(minion: Minion, message: str, system_facts: dict[str, Any]) -> str:
    """Compose a short in-character reply with no LLM — always available."""
    name = minion.name
    guild = system_facts["guild"]
    mood = system_facts["mood"]
    vitals = system_facts["vitals"]
    memory = system_facts["memory"]

    feeling = vitals[0]
    lead = {
        "flow": f"In the thick of my work — I'm a {guild} mind and it's flowing.",
        "inspired": f"Ah, good — inspiration's running hot in the {guild} guild today.",
        "content": f"All's well enough. I keep to my {guild} craft.",
        "bored": f"Honestly? A little restless. The {guild} work drags lately.",
        "anxious": f"I'll be straight with you — I'm on edge, and {feeling} besides.",
        "exhausted": f"I'm spent. {feeling.capitalize()}, if I'm honest, but I press on.",
        "despairing": "I won't pretend things are fine. They aren't.",
    }.get(mood, f"I'm {feeling}, doing my work in the {guild} guild.")

    parts = [lead]
    if memory:
        parts.append(f"What's on my mind: {memory}")
    q = (message or "").strip()
    if q:
        parts.append(f"As for \"{q[:80]}\" — ask me plainly and I'll tell you what I, {name}, make of it.")
    return " ".join(parts)


# --- Kimi call (OpenAI-compatible) -----------------------------------------

async def _kimi_reply(system_prompt: str, message: str, history: list[dict[str, str]]) -> str:
    """Non-streaming chat completion against Kimi K2 (Moonshot, OpenAI-compatible).

    Mirrors `server/llm/kimi.py`: reads base_url/api_key/model from settings,
    posts to `/chat/completions`, returns the assistant text. Raises on any
    failure so the caller can fall back locally.
    """
    s = get_settings()
    base_url = (s.llm_base_url or s.kimi_base_url).rstrip("/")
    api_key = s.llm_api_key or s.kimi_api_key
    model = s.llm_model or s.kimi_model

    messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for turn in history[-8:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)})
    messages.append({"role": "user", "content": message})

    payload = {
        "model": model,
        "stream": False,
        "temperature": s.kimi_temperature,
        "max_tokens": min(s.kimi_max_tokens, 400),
        "messages": messages,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    url = f"{base_url}/chat/completions"

    async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    text = (data.get("choices", [{}])[0].get("message", {}) or {}).get("content") or ""
    text = text.strip()
    if not text:
        raise ValueError("empty completion from Kimi")
    return text


# --- public entrypoint -----------------------------------------------------

async def reply(
    session: AsyncSession,
    minion: Minion,
    message: str,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Return {'reply': str, 'in_character': True, 'used_llm': bool}.

    Always succeeds: if the LLM is unconfigured or errors, a local in-character
    reply is composed from the Minion's state.
    """
    history = history or []
    system_prompt = await build_system_prompt(session, minion)

    s = get_settings()
    has_key = bool(s.llm_api_key or s.kimi_api_key)

    if has_key:
        try:
            text = await _kimi_reply(system_prompt, message, history)
            return {"reply": text, "in_character": True, "used_llm": True}
        except (httpx.HTTPError, httpx.TimeoutException, ValueError, KeyError):
            pass  # fall through to local fallback

    # Local fallback — never fails.
    mem_rows = (await session.execute(
        select(Memory)
        .where(Memory.minion_id == minion.id)
        .order_by(Memory.importance.desc(), Memory.tick.desc())
        .limit(1)
    )).scalars().all()
    memory = mem_rows[0].content.strip() if mem_rows and mem_rows[0].content else ""

    facts = {
        "guild": minion.guild.value if hasattr(minion.guild, "value") else str(minion.guild),
        "mood": minion.mood.value if hasattr(minion.mood, "value") else str(minion.mood),
        "vitals": _vital_words(minion),
        "memory": memory,
    }
    text = _local_reply(minion, message, facts)
    return {"reply": text, "in_character": True, "used_llm": False}
