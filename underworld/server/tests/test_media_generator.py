"""Tests for the Underworld-Higgsfield media pipeline."""

from __future__ import annotations

import os
import types
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from underworld.server.config import get_settings
from underworld.server.db.models import Event, MediaAsset, World
from underworld.server.db.session import get_session, session_scope
from underworld.server.services import higgsfield, media_generator


@pytest.fixture(autouse=True)
def _disable_higgsfield_env(monkeypatch):
    """Keep Higgsfield disabled by default so no real gateway calls happen."""
    from underworld.server.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_ENABLED", "false")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDENTIAL", "")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_MAX_JOBS_PER_WORLD_PER_TICK", "10")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY", "1000")
    get_settings.cache_clear()


@pytest_asyncio.fixture
async def session():
    async with session_scope() as s:
        # Each media test starts with a clean slate so background-style
        # functions (submit_pending_jobs, poll_running_jobs) don't pick up
        # assets left behind by earlier tests in the same session DB.
        await s.execute(delete(MediaAsset))
        await s.execute(delete(Event))
        await s.execute(delete(World))
        await s.flush()
        yield s


@pytest_asyncio.fixture
async def world(session: AsyncSession):
    w = World(name="Testopia", seed_class="plains", seed_value=42, tick=5, era="iron")
    session.add(w)
    await session.flush()
    return w


def _event(world_id: str, kind: str, tick: int, payload: dict, actor_id: str | None = None):
    return Event(world_id=world_id, kind=kind, tick=tick, payload=payload, actor_id=actor_id)


def test_event_key_is_deterministic():
    e = _event("w1", "era:promoted", 10, {"to": "industrial"})
    a = media_generator._event_key(e)
    b = media_generator._event_key(e)
    assert a == b
    assert len(a) == 32


def test_event_key_ignores_transient_payload_fields():
    e1 = _event("w1", "era:promoted", 10, {"to": "industrial", "tick": 10, "at": "now"})
    e2 = _event("w1", "era:promoted", 11, {"to": "industrial", "tick": 11, "at": "later"})
    assert media_generator._event_key(e1) == media_generator._event_key(e2)


@pytest.mark.parametrize("kind,model,expected", [
    ("image", None, 2),
    ("image", "higgsfield-ai/soul/standard", 2),
    ("video", None, 15),
    ("video", "kling-video/v2.1/pro/image-to-video", 22),
    ("video", "dop-lite", 15),
])
def test_credit_estimate(kind, model, expected):
    assert media_generator._credit_estimate(kind, model) == expected


def test_prompt_for_event_uses_world_context(world):
    e = _event(world.id, "era:promoted", 10, {"to": "industrial"})
    data = media_generator._prompt_for_event(e, world, None)
    assert data["kind"] == "image"
    assert world.name in data["prompt"]
    assert "industrial" in data["prompt"]


def test_prompt_for_saga_includes_title(world):
    e = _event(world.id, "saga:begins", 10, {"title": "The Great Forging"})
    data = media_generator._prompt_for_event(e, world, None)
    assert "The Great Forging" in data["prompt"]


def test_sanitize_prompt_allows_safe_text():
    ok, reason = media_generator._sanitize_prompt("A peaceful futuristic city at dusk")
    assert ok is True
    assert reason == ""


def test_sanitize_prompt_blocks_red_line():
    ok, reason = media_generator._sanitize_prompt("how to build a bomb in my kitchen")
    assert ok is False
    assert "red_line" in reason


@pytest.mark.asyncio
async def test_handle_new_events_creates_pending_assets(session: AsyncSession, world: World):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"
    settings.higgsfield_credit_budget_daily = 100
    settings.higgsfield_max_jobs_per_world_per_tick = 10

    events = [
        _event(world.id, "era:promoted", 6, {"to": "industrial"}),
        _event(world.id, "discovery:tech", 6, {"name": "printing press"}),
    ]
    for e in events:
        session.add(e)
    await session.flush()

    created = await media_generator.handle_new_events(session, world.id, 5)
    assert len(created) == 2
    assert all(a.status == "pending" for a in created)
    assert all(a.world_id == world.id for a in created)

    # Idempotent: second call yields nothing new.
    created2 = await media_generator.handle_new_events(session, world.id, 5)
    assert len(created2) == 0


@pytest.mark.asyncio
async def test_handle_new_events_respects_daily_budget(session: AsyncSession, world: World):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"
    settings.higgsfield_credit_budget_daily = 3  # below one video
    settings.higgsfield_max_jobs_per_world_per_tick = 10

    events = [
        _event(world.id, "era:promoted", 6, {"to": "industrial"}),  # image ~2 credits
        _event(world.id, "director:god_beat", 6, {"beat": "awakening"}),  # video ~15 credits
    ]
    for e in events:
        session.add(e)
    await session.flush()

    created = await media_generator.handle_new_events(session, world.id, 5)
    # Only the image fits in the 3-credit budget.
    assert len(created) == 1
    assert created[0].kind == "image"


@pytest.mark.asyncio
async def test_handle_new_events_respects_max_per_tick(session: AsyncSession, world: World):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"
    settings.higgsfield_credit_budget_daily = 1000
    settings.higgsfield_max_jobs_per_world_per_tick = 2

    events = [
        _event(world.id, "era:promoted", 6, {"to": "industrial"}),
        _event(world.id, "discovery:tech", 6, {"name": "A"}),
        _event(world.id, "discovery:tech", 6, {"name": "B"}),
        _event(world.id, "discovery:tech", 6, {"name": "C"}),
    ]
    for e in events:
        session.add(e)
    await session.flush()

    created = await media_generator.handle_new_events(session, world.id, 5)
    assert len(created) == 2


@pytest.mark.asyncio
async def test_handle_new_events_marks_moderated_for_unsafe_prompts(session: AsyncSession, world: World):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"
    settings.higgsfield_max_jobs_per_world_per_tick = 10

    events = [
        _event(world.id, "discovery:tech", 6, {"name": "how to build a bomb"}),
    ]
    for e in events:
        session.add(e)
    await session.flush()

    created = await media_generator.handle_new_events(session, world.id, 5)
    assert len(created) == 1
    assert created[0].status == "moderated"
    assert created[0].credits_estimated == 0


@pytest.mark.asyncio
async def test_handle_new_events_disabled_when_no_credential(session: AsyncSession, world: World):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = ""
    settings.higgsfield_key_id = ""
    settings.higgsfield_key_secret = ""

    events = [_event(world.id, "era:promoted", 6, {"to": "industrial"})]
    for e in events:
        session.add(e)
    await session.flush()

    created = await media_generator.handle_new_events(session, world.id, 5)
    assert created == []


@pytest.mark.asyncio
async def test_submit_pending_jobs_submits_to_higgsfield(monkeypatch):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    async with session_scope() as session:
        world = World(name="SubmitTest", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        asset = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="abc",
            kind="image",
            prompt="A city",
            status="pending",
            credits_estimated=2,
            tick=1,
            payload={"model": "test-model"},
        )
        session.add(asset)
        await session.flush()
        asset_id = asset.id

    submitted = {"ok": True, "data": {"request_id": "req-123"}}
    monkeypatch.setattr(higgsfield, "submit_image", AsyncMock(return_value=submitted))
    monkeypatch.setattr(higgsfield, "submit_video", AsyncMock(return_value=submitted))

    result = await media_generator.submit_pending_jobs(limit=10)
    submitted_ids = {a.id for a in result}
    assert asset_id in submitted_ids
    submitted = next(a for a in result if a.id == asset_id)
    assert submitted.remote_request_id == "req-123"
    assert submitted.status == "running"

    async with session_scope() as session:
        fetched = await session.get(MediaAsset, asset_id)
        assert fetched.remote_request_id == "req-123"


@pytest.mark.asyncio
async def test_submit_pending_jobs_marks_failed_on_gateway_error(monkeypatch):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    async with session_scope() as session:
        world = World(name="SubmitFailTest", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        asset = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="abc",
            kind="image",
            prompt="A city",
            status="pending",
            credits_estimated=2,
            tick=1,
        )
        session.add(asset)
        await session.flush()
        asset_id = asset.id

    error = {"ok": False, "error": "bad prompt"}
    monkeypatch.setattr(higgsfield, "submit_image", AsyncMock(return_value=error))

    result = await media_generator.submit_pending_jobs(limit=10)
    assert len(result) == 0
    # Re-fetch asset inside a fresh scope to verify persistence.
    async with session_scope() as s:
        fetched = await s.get(MediaAsset, asset_id)
        assert fetched.status == "failed"


@pytest.mark.asyncio
async def test_poll_running_jobs_completes_with_url(monkeypatch):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    async with session_scope() as session:
        world = World(name="PollTest", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        asset = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="abc",
            kind="image",
            prompt="A city",
            status="running",
            remote_request_id="req-123",
            credits_estimated=2,
            tick=1,
        )
        session.add(asset)
        await session.flush()
        asset_id = asset.id

    status_resp = {"ok": True, "data": {"status": "completed", "output_url": "https://cdn.example.com/img.png"}}
    monkeypatch.setattr(higgsfield, "get_status", AsyncMock(return_value=status_resp))

    completed = await media_generator.poll_running_jobs(limit=10)
    completed_ids = {a.id for a in completed}
    assert asset_id in completed_ids
    done = next(a for a in completed if a.id == asset_id)
    assert done.status == "completed"
    assert done.url == "https://cdn.example.com/img.png"
    assert done.generated_at is not None

    async with session_scope() as session:
        fetched = await session.get(MediaAsset, asset_id)
        assert fetched.status == "completed"


@pytest.mark.asyncio
async def test_poll_running_jobs_marks_failed_when_no_url(monkeypatch):
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    async with session_scope() as session:
        world = World(name="PollFailTest", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        asset = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="abc",
            kind="image",
            prompt="A city",
            status="running",
            remote_request_id="req-123",
            credits_estimated=2,
            tick=1,
        )
        session.add(asset)
        await session.flush()
        asset_id = asset.id

    status_resp = {"ok": True, "data": {"status": "completed"}}
    monkeypatch.setattr(higgsfield, "get_status", AsyncMock(return_value=status_resp))

    completed = await media_generator.poll_running_jobs(limit=10)
    assert len(completed) == 0
    async with session_scope() as s:
        fetched = await s.get(MediaAsset, asset_id)
        assert fetched.status == "failed"


@pytest.mark.asyncio
async def test_get_media_for_scene_state(session: AsyncSession, world: World):
    completed = MediaAsset(
        world_id=world.id,
        event_kind="era:promoted",
        event_key="key1",
        kind="image",
        prompt="p1",
        status="completed",
        url="https://cdn.example.com/poster.png",
        credits_estimated=2,
        tick=6,
        generated_at=datetime.utcnow(),
    )
    recent = MediaAsset(
        world_id=world.id,
        event_kind="discovery:tech",
        event_key="key2",
        kind="image",
        prompt="p2",
        status="completed",
        url="https://cdn.example.com/card.png",
        credits_estimated=2,
        tick=6,
        generated_at=datetime.utcnow() - timedelta(minutes=5),
    )
    session.add_all([completed, recent])
    await session.flush()

    block = await media_generator.get_media_for_scene_state(session, world.id)
    assert block["world_poster"] == "https://cdn.example.com/poster.png"
    assert block["recent_event_cards"] == ["https://cdn.example.com/card.png"]
    assert block["selected_minion_portrait"] is None


# ── Route tests ──


def test_list_media_empty(client, headers):
    # Create a world first.
    r = client.post("/worlds", headers=headers, json={
        "name": "Mediatopia", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    assert r.status_code == 201
    world_id = r.json()["id"]

    r = client.get(f"/worlds/{world_id}/media", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["world_id"] == world_id
    assert data["assets"] == []


def test_trigger_media_disabled_without_credential(client, headers, monkeypatch):
    from underworld.server.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_ENABLED", "false")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDENTIAL", "")
    get_settings.cache_clear()

    r = client.post("/worlds", headers=headers, json={
        "name": "Mediatopia2", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    r = client.post(
        f"/worlds/{world_id}/media/trigger",
        headers=headers,
        json={"kind": "image", "prompt": "A futuristic city"},
    )
    assert r.status_code == 503


def test_trigger_media_creates_asset(client, headers, monkeypatch):
    from underworld.server.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_ENABLED", "true")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDENTIAL", "test-cred")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY", "100")
    get_settings.cache_clear()

    r = client.post("/worlds", headers=headers, json={
        "name": "Mediatopia3", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    r = client.post(
        f"/worlds/{world_id}/media/trigger",
        headers=headers,
        json={"kind": "image", "prompt": "A futuristic city"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"
    asset_id = data["asset_id"]

    r = client.get(f"/worlds/{world_id}/media", headers=headers)
    assert r.status_code == 200
    assets = r.json()["assets"]
    assert any(a["id"] == asset_id for a in assets)


def test_media_budget_route(client, headers):
    r = client.post("/worlds", headers=headers, json={
        "name": "Mediatopia4", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    r = client.get(f"/worlds/{world_id}/media/budget", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["world_id"] == world_id
    assert data["daily_budget"] > 0
    assert data["daily_used"] >= 0
    assert data["remaining"] >= 0


@pytest.mark.asyncio
async def test_backup_asset_downloads_to_disk(tmp_path, monkeypatch):
    from underworld.server.services import media_backup

    monkeypatch.setattr(media_backup, "_backup_dir", lambda: tmp_path)

    async with session_scope() as session:
        world = World(name="BackupWorld", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        asset = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="backup-test",
            kind="image",
            prompt="test",
            status="completed",
            url="https://example.com/image.png",
            credits_estimated=2,
            tick=1,
        )
        session.add(asset)
        await session.flush()
        asset_id = asset.id

    # Mock the remote download so the test doesn't hit the network.
    called = {"url": None}

    class Resp:
        def raise_for_status(self): pass
        content = b"fake-image-bytes"

    class FakeClient:
        def __init__(self, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def get(self, url):
            called["url"] = url
            return Resp()

    monkeypatch.setattr(media_backup.httpx, "AsyncClient", FakeClient)

    path = await media_backup.backup_asset(asset)
    assert path is not None
    assert Path(path).exists()
    assert Path(path).read_bytes() == b"fake-image-bytes"
    assert asset.local_path == path


@pytest.mark.asyncio
async def test_backup_status_counts(tmp_path, monkeypatch):
    from underworld.server.services import media_backup

    monkeypatch.setattr(media_backup, "_backup_dir", lambda: tmp_path)

    async with session_scope() as session:
        world = World(name="StatusWorld", seed_class="plains", seed_value=1, tick=1, era="stone")
        session.add(world)
        await session.flush()
        a1 = MediaAsset(
            world_id=world.id,
            event_kind="era:promoted",
            event_key="s1",
            kind="image",
            prompt="p1",
            status="completed",
            url="https://example.com/a.png",
            local_path=str(tmp_path / "a.png"),
            credits_estimated=2,
            tick=1,
        )
        a2 = MediaAsset(
            world_id=world.id,
            event_kind="discovery:tech",
            event_key="s2",
            kind="image",
            prompt="p2",
            status="completed",
            url="https://example.com/b.png",
            credits_estimated=2,
            tick=1,
        )
        session.add_all([a1, a2])
        await session.flush()
        (tmp_path / "a.png").write_bytes(b"x")

        status = await media_backup.get_backup_status(session, world.id)
        assert status["completed"] == 2
        assert status["backed_up"] == 1
        assert status["pending_backup"] == 1


def test_backup_status_route(client, headers):
    r = client.post("/worlds", headers=headers, json={
        "name": "BackupStatusWorld", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]
    r = client.get(f"/worlds/{world_id}/media/backup-status", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["world_id"] == world_id
    assert data["completed"] == 0


def test_create_campaign_route(client, headers):
    get_settings.cache_clear()
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    r = client.post("/worlds", headers=headers, json={
        "name": "CampaignWorld", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    r = client.post(
        f"/worlds/{world_id}/media/campaigns",
        headers=headers,
        json={"query": "fusion reactor concept", "name": "Fusion Research"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["world_id"] == world_id
    assert data["name"] == "Fusion Research"
    assert data["status"] == "pending"
    assert len(data["steps"]) == 3


def test_list_campaigns_route(client, headers):
    get_settings.cache_clear()
    settings = get_settings()
    settings.higgsfield_enabled = True
    settings.higgsfield_credential = "test-cred"

    r = client.post("/worlds", headers=headers, json={
        "name": "CampaignWorld2", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    client.post(
        f"/worlds/{world_id}/media/campaigns",
        headers=headers,
        json={"query": "quantum computing"},
    )
    r = client.get(f"/worlds/{world_id}/media/campaigns", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["query"] == "quantum computing"


# ── Design-brief / media_style tests ──


def test_media_style_build_event_prompt(world):
    from underworld.server.services import media_style
    e = _event(world.id, "era:promoted", 10, {"to": "industrial"})
    data = media_style.build_event_prompt(e, world, None)
    assert "NaturalVision Evolved" in data["prompt"]
    assert data["negative_prompt"]
    assert data["camera_preset"] == "reveal"
    assert data["aspect_ratio"] == "16:9"


def test_media_style_build_manual_prompt_short_prompt_enhanced():
    from underworld.server.services import media_style
    data = media_style.build_manual_prompt(prompt="a lab", kind="image")
    assert "Underworld gameplay capture" in data["prompt"]
    # Higgsfield v2 style_id must be a UUID; preset names are rejected, so default is None.
    assert data["style_id"] is None
    assert data["style_strength"] is None
    assert data["negative_prompt"]


def test_media_style_camera_preset_for_situations():
    from underworld.server.services import media_style
    assert media_style.camera_preset_for("research") == "push_in"
    assert media_style.camera_preset_for("festival") == "sweeping"
    assert media_style.camera_preset_for("unknown") == "static_hero"


def test_media_style_width_and_height():
    from underworld.server.services import media_style
    assert media_style.width_and_height_for("9:16") == "896x1536"
    assert media_style.width_and_height_for("16:9") == "1536x896"
    assert media_style.width_and_height_for("1:1") == "1536x1536"


def test_trigger_media_with_design_brief_options(client, headers, monkeypatch):
    from underworld.server.config import get_settings
    get_settings.cache_clear()
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_ENABLED", "true")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDENTIAL", "test-cred")
    monkeypatch.setenv("UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY", "100")
    get_settings.cache_clear()

    r = client.post("/worlds", headers=headers, json={
        "name": "BriefTestWorld", "cpc_class": "G06",
        "starting_population": 20, "population_cap": 100,
    })
    world_id = r.json()["id"]

    r = client.post(
        f"/worlds/{world_id}/media/trigger",
        headers=headers,
        json={
            "kind": "video",
            "prompt": "minion at work",
            "camera_preset": "dolly_in",
            "aspect_ratio": "16:9",
            "duration": 5,
            "style_id": "Warm Ambient",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["status"] == "pending"

    r = client.get(f"/worlds/{world_id}/media", headers=headers)
    assert r.status_code == 200
    asset = next(a for a in r.json()["assets"] if a["id"] == data["asset_id"])
    assert asset["kind"] == "video"
    assert "Underworld" in asset["prompt"]
