"""Backend Core Tests — Event Stream, Identity, Body State, Valence, Relationships,
Memory Backend, Anomaly Detection, Player Model, Cognitive LOD, Action Validation,
Self-Model, Soak Test Harness.
"""
from __future__ import annotations

import pytest

from underworld.server.backend import (
    action_validation,
    anomaly,
    body_state,
    cognitive_lod,
    events,
    identity,
    memory_backend,
    player_model,
    relationships,
    self_model,
    soak_test,
    valence,
)


# ── Event Stream ─────────────────────────────────────────────────────────────

class TestEventStream:
    def test_emit_and_retrieve(self):
        stream = events.EventStream()
        evt = stream.emit(tick=1, category=events.EventCategory.BIRTH, actor_ids=("a1",))
        assert stream.count() == 1
        assert stream.by_tick(1)[0].id == evt.id
        assert stream.by_actor("a1")[0].category == events.EventCategory.BIRTH

    def test_range_query(self):
        stream = events.EventStream()
        stream.emit(tick=1, category=events.EventCategory.BIRTH)
        stream.emit(tick=2, category=events.EventCategory.DEATH, severity=events.EventSeverity.WARNING)
        stream.emit(tick=3, category=events.EventCategory.BIRTH)
        results = stream.range_query(1, 3, category=events.EventCategory.BIRTH)
        assert len(results) == 2
        results = stream.range_query(1, 3, min_severity=events.EventSeverity.WARNING)
        assert len(results) == 1

    def test_anomalies_and_player_caused(self):
        stream = events.EventStream()
        stream.emit(tick=1, category=events.EventCategory.MIRACLE_ANOMALY, anomaly=True)
        stream.emit(tick=2, category=events.EventCategory.PLAYER_ACTION, player_caused=True)
        assert len(stream.anomalies()) == 1
        assert len(stream.player_caused_events()) == 1

    def test_memory_importance(self):
        stream = events.EventStream()
        stream.emit(tick=1, category=events.EventCategory.ATTACK, actor_ids=("a1",), memory_importance_seed=0.9)
        assert stream.importance_for_actor("a1", 1) == 0.9

    def test_max_events_bound(self):
        stream = events.EventStream(max_events=5)
        for i in range(10):
            stream.emit(tick=i, category=events.EventCategory.OTHER)
        assert stream.count() == 5

    def test_event_factory_deterministic(self):
        import random
        factory = events.EventFactory(rng=random.Random(123))
        e1 = factory.spawn_event(tick=1, category=events.EventCategory.BIRTH)
        factory2 = events.EventFactory(rng=random.Random(123))
        e2 = factory2.spawn_event(tick=1, category=events.EventCategory.BIRTH)
        assert e1.memory_importance_seed == e2.memory_importance_seed


# ── Identity ─────────────────────────────────────────────────────────────────

class TestIdentity:
    def test_register_and_get(self):
        reg = identity.IdentityRegistry()
        ident = identity.AgentIdentity(display_name="Test")
        reg.register(ident)
        assert reg.get(ident.id) is not None
        assert reg.by_soul(ident.soul_token) is not None

    def test_mark_dead(self):
        reg = identity.IdentityRegistry()
        ident = identity.AgentIdentity()
        reg.register(ident)
        reg.mark_dead(ident.id, tick=10, cause="old_age")
        assert reg.get(ident.id).death_state == identity.DeathState.DEAD

    def test_reincarnation(self):
        reg = identity.IdentityRegistry()
        ident = identity.AgentIdentity()
        reg.register(ident)
        reg.mark_dead(ident.id, tick=10, cause="old_age")
        reg.mark_reincarnated(ident.id, new_body_id="body2", tick=20)
        updated = reg.get(ident.id)
        assert updated.death_state == identity.DeathState.ALIVE
        assert updated.reincarnation_count == 1

    def test_continuity_check(self):
        reg = identity.IdentityRegistry()
        ident = identity.AgentIdentity(identity_fracture=0.8, self_coherence=0.2)
        reg.register(ident)
        diag = reg.continuity_check(ident.id)
        assert diag["valid"] is False
        assert "high_fracture" in diag["issues"]
        assert "low_coherence" in diag["issues"]

    def test_children_and_clones(self):
        reg = identity.IdentityRegistry()
        parent = identity.AgentIdentity()
        reg.register(parent)
        child = identity.AgentIdentity(parent_ids=(parent.id,))
        reg.register(child)
        clone = identity.AgentIdentity(clone_source_id=parent.id)
        reg.register(clone)
        assert len(reg.children_of(parent.id)) == 1
        assert len(reg.clones_of(parent.id)) == 1


# ── Body State ───────────────────────────────────────────────────────────────

class TestBodyState:
    def test_tick_update(self):
        body = body_state.BodyState(hunger=0.9, thirst=0.9, fatigue=0.9)
        new_body = body_state.tick_update(body, intensity=1.0)
        assert new_body.hunger < body.hunger
        assert new_body.thirst < body.thirst
        assert new_body.fatigue < body.fatigue

    def test_critical_detection(self):
        body = body_state.BodyState(health=0.1)
        assert body.is_critical() is True
        body = body_state.BodyState(health=0.5)
        assert body.is_critical() is False

    def test_apply_injury(self):
        body = body_state.BodyState()
        new_body = body_state.apply_injury(body, "cut", severity=0.5)
        assert new_body.injury_flags["cut"] is True
        assert new_body.health < 1.0
        assert new_body.pain > 0.0

    def test_apply_and_heal_disease(self):
        body = body_state.BodyState()
        new_body = body_state.apply_disease(body, "flu")
        assert new_body.disease_flags["flu"] is True
        healed = body_state.heal_injury(new_body, "cut")
        assert "cut" not in healed.injury_flags

    def test_roundtrip_dict(self):
        body = body_state.BodyState(health=0.7, pain=0.3)
        d = body.to_dict()
        restored = body_state.BodyState.from_dict(d)
        assert restored.health == pytest.approx(0.7)
        assert restored.pain == pytest.approx(0.3)


# ── Valence ──────────────────────────────────────────────────────────────────

class TestValence:
    def test_update_from_death_event(self):
        state = valence.ValenceState()
        new_state = valence.update_from_event(state, "death", intensity=1.0, player_caused=True)
        assert new_state.grief > state.grief
        assert new_state.trauma_load > state.trauma_load
        assert new_state.fear > state.fear

    def test_update_from_rescue(self):
        state = valence.ValenceState(anger=0.5, betrayal=0.4)
        new_state = valence.update_from_event(state, "rescue", intensity=1.0)
        assert new_state.trust > state.trust
        assert new_state.anger < state.anger
        assert new_state.betrayal < state.betrayal

    def test_decay(self):
        state = valence.ValenceState(fear=0.8, anger=0.8, hope=0.2)
        new_state = valence.decay(state, tick_rate=0.5)
        assert new_state.fear < state.fear
        assert new_state.anger < state.anger
        assert new_state.hope > state.hope  # decays toward baseline 0.5

    def test_collective_contagion(self):
        state = valence.ValenceState()
        new_state = valence.apply_collective_contagion(state, fear=0.8, awe=0.5)
        assert new_state.fear > 0.0
        assert new_state.awe > 0.0
        assert new_state.collective_fear == pytest.approx(0.8)

    def test_dominant_valence(self):
        state = valence.ValenceState(fear=0.9, hope=0.1)
        assert valence.dominant_valence(state) == "fear"


# ── Relationships ────────────────────────────────────────────────────────────

class TestRelationships:
    def test_upsert_and_get(self):
        graph = relationships.RelationshipGraph()
        rel = relationships.RelationshipState(from_id="a", to_id="b", trust=0.8)
        graph.upsert(rel)
        assert graph.get("a", "b").trust == pytest.approx(0.8)

    def test_update_from_event(self):
        graph = relationships.RelationshipGraph()
        graph.update_from_event("a", "b", "gift", tick=1, intensity=1.0)
        rel = graph.get("a", "b")
        assert rel.trust > 0.5
        assert rel.loyalty > 0.5

    def test_betrayal_event(self):
        graph = relationships.RelationshipGraph()
        graph.update_from_event("a", "b", "betrayal", tick=1, intensity=1.0)
        rel = graph.get("a", "b")
        assert rel.betrayal > 0.0
        assert rel.trust < 0.5

    def test_trusted_allies(self):
        graph = relationships.RelationshipGraph()
        graph.upsert(relationships.RelationshipState(from_id="a", to_id="b", trust=0.8))
        graph.upsert(relationships.RelationshipState(from_id="a", to_id="c", trust=0.3))
        allies = graph.trusted_allies("a", threshold=0.6)
        assert allies == ["b"]

    def test_aggregate_reputation(self):
        graph = relationships.RelationshipGraph()
        graph.upsert(relationships.RelationshipState(from_id="a", to_id="b", reputation=0.9))
        graph.upsert(relationships.RelationshipState(from_id="c", to_id="b", reputation=0.7))
        assert graph.aggregate_reputation("b") == pytest.approx(0.8)


# ── Memory Backend ───────────────────────────────────────────────────────────

class TestMemoryBackend:
    def test_compute_importance(self):
        imp = memory_backend.compute_importance(
            emotional_intensity=0.8, player_caused=True, anomaly=True
        )
        assert imp > 0.5

    def test_compute_recency(self):
        rec = memory_backend.MemoryRecord(
            id="m1", agent_id="a", source_event_id=None,
            memory_type="episodic", content="test", recency=1.0, tick_last_recalled=0,
        )
        assert memory_backend.compute_recency(rec, current_tick=10) < 1.0

    def test_compress_memory(self):
        rec = memory_backend.MemoryRecord(
            id="m1", agent_id="a", source_event_id=None,
            memory_type="episodic", content="long story", importance=0.8,
        )
        compressed = memory_backend.compress_memory(rec, "summary")
        assert compressed.compression_marker == "compressed"
        assert compressed.content == "summary"
        assert compressed.importance < rec.importance

    def test_retrieve_salient(self):
        mems = [
            memory_backend.MemoryRecord(
                id=f"m{i}", agent_id="a", source_event_id=None,
                memory_type="episodic", content=f"event {i}",
                importance=0.5 + i * 0.1, trauma_score=0.0 if i < 2 else 0.5,
            )
            for i in range(5)
        ]
        salient = memory_backend.retrieve_salient(mems, current_tick=0, k=3)
        assert len(salient) == 3
        # Highest importance and trauma should be first
        assert salient[0].id == "m4"

    def test_roundtrip_dict(self):
        rec = memory_backend.MemoryRecord(
            id="m1", agent_id="a", source_event_id="e1",
            memory_type="emotional", content="test",
            emotional_tags={"fear": 0.8}, importance=0.9,
            related_agents=["b"], related_location="cave",
        )
        d = rec.to_dict()
        restored = memory_backend.MemoryRecord.from_dict(d)
        assert restored.id == rec.id
        assert restored.emotional_tags == rec.emotional_tags


# ── Anomaly Detection ────────────────────────────────────────────────────────

class TestAnomalyDetection:
    def test_no_anomaly_when_close(self):
        det = anomaly.AnomalyDetector(sensitivity=0.5)
        result = det.detect(
            agent_id="a", tick=1,
            expected={"health": 1.0}, actual={"health": 0.95},
        )
        assert result is None

    def test_detects_large_divergence(self):
        det = anomaly.AnomalyDetector(sensitivity=0.5)
        result = det.detect(
            agent_id="a", tick=1,
            expected={"health": 1.0}, actual={"health": 0.2},
        )
        assert result is not None
        assert result.error_magnitude > 0.5
        assert result.triggered_memory is True

    def test_player_probability(self):
        det = anomaly.AnomalyDetector()
        result = det.detect(
            agent_id="a", tick=1,
            expected={"alive": True}, actual={"alive": False},
            player_nearby=True,
        )
        assert result is not None
        assert result.player_caused_probability > 0.5
        assert result.triggered_player_model is True

    def test_classify_teleport(self):
        det = anomaly.AnomalyDetector()
        result = det.detect(
            agent_id="a", tick=1,
            expected={"position": 0}, actual={"position": 100},
        )
        assert result is not None
        assert result.anomaly_type == anomaly.AnomalyType.TELEPORT


# ── Player Model ─────────────────────────────────────────────────────────────

class TestPlayerModel:
    def test_log_action_updates_scores(self):
        pm = player_model.PlayerModelBackend("world-1")
        pm.log_action(tick=1, action_kind="gift")
        assert pm.model.action_count == 1
        assert pm.model.mercy_score > 0.5

    def test_cruelty_increases(self):
        pm = player_model.PlayerModelBackend("world-1")
        pm.log_action(tick=1, action_kind="delete")
        assert pm.model.cruelty_score > 0.5

    def test_classify_intervention(self):
        pm = player_model.PlayerModelBackend("world-1")
        assert pm.classify_intervention("spawn") == "creative"
        assert pm.classify_intervention("kill") == "destructive"
        assert pm.classify_intervention("save") == "informational"

    def test_neglect(self):
        pm = player_model.PlayerModelBackend("world-1")
        pm.log_neglect(tick=1, ignored_requests=5)
        assert pm.model.neglect_score > 0.5


# ── Cognitive LOD ────────────────────────────────────────────────────────────

class TestCognitiveLOD:
    def test_schedule_full_tier(self):
        sched = cognitive_lod.CognitiveLODScheduler(full_max=2)
        sched.register("a", player_proximity=0.9)
        sched.register("b", player_proximity=0.8)
        sched.register("c", player_proximity=0.1)
        assignments = sched.schedule()
        assert assignments["a"] == cognitive_lod.CognitiveTier.FULL
        assert assignments["b"] == cognitive_lod.CognitiveTier.FULL
        assert assignments["c"] != cognitive_lod.CognitiveTier.FULL

    def test_promote_by_awakening(self):
        sched = cognitive_lod.CognitiveLODScheduler()
        sched.register("a", awakening_score=0.9)
        assignments = sched.schedule()
        assert assignments["a"] == cognitive_lod.CognitiveTier.FULL

    def test_count_in_tier(self):
        sched = cognitive_lod.CognitiveLODScheduler(full_max=1)
        sched.register("a", player_proximity=1.0)
        sched.register("b", player_proximity=0.0)
        sched.schedule()
        assert sched.count_in_tier(cognitive_lod.CognitiveTier.FULL) == 1


# ── Action Validation ────────────────────────────────────────────────────────

class TestActionValidation:
    def test_approve_eat_when_hungry(self):
        v = action_validation.ActionValidator()
        proposal = action_validation.ActionProposal(
            actor_id="a", action=action_validation.ActionKind.EAT,
        )
        result = v.validate(proposal, body_state={"hunger": 0.3})
        assert result.result == action_validation.ValidatorResult.APPROVED

    def test_reject_eat_when_full(self):
        v = action_validation.ActionValidator()
        proposal = action_validation.ActionProposal(
            actor_id="a", action=action_validation.ActionKind.EAT,
        )
        result = v.validate(proposal, body_state={"hunger": 0.99})
        assert result.result == action_validation.ValidatorResult.REJECTED
        assert result.failure_reason == "not_hungry"

    def test_reject_fork_at_cap(self):
        v = action_validation.ActionValidator()
        proposal = action_validation.ActionProposal(
            actor_id="a", action=action_validation.ActionKind.FORK_SELF,
        )
        result = v.validate(
            proposal,
            world_state={"population": 100, "population_cap": 100},
        )
        assert result.result == action_validation.ValidatorResult.REJECTED

    def test_illegal_actions_logged(self):
        v = action_validation.ActionValidator()
        v.validate(
            action_validation.ActionProposal(actor_id="a", action=action_validation.ActionKind.EAT),
            body_state={"hunger": 1.0},
        )
        assert len(v.illegal_actions()) == 1


# ── Self-Model ───────────────────────────────────────────────────────────────

class TestSelfModel:
    def test_update_from_death_event(self):
        state = self_model.SelfModelState(agent_id="a")
        new_state = self_model.update_from_event(state, "death", intensity=1.0)
        assert new_state.deaths_witnessed == 1
        assert new_state.mortality_awareness > 0.0

    def test_update_from_player_action(self):
        state = self_model.SelfModelState(agent_id="a")
        new_state = self_model.update_from_event(state, "player_action", intensity=1.0)
        assert new_state.player_interactions == 1
        assert new_state.creator_belief > 0.0

    def test_awakening_level(self):
        assert self_model.compute_awakening_level(0.05) == "unaware"
        assert self_model.compute_awakening_level(0.95) == "awakened"

    def test_roundtrip_dict(self):
        state = self_model.SelfModelState(agent_id="a", awakening_score=0.5)
        d = state.to_dict()
        restored = self_model.SelfModelState.from_dict(d)
        assert restored.awakening_score == pytest.approx(0.5)


# ── Soak Test Harness ────────────────────────────────────────────────────────

class TestSoakHarness:
    def test_100_agent_soak(self):
        harness = soak_test.SoakTestHarness(agent_count=100, ticks=50, seed=42)
        report = harness.run()
        assert report.ticks_run == 50
        assert report.agent_count == 100
        assert report.event_count > 0
        assert report.memory_records > 0
        assert report.memory_growth_mb < 50.0  # sanity bound
        assert len(report.crashes) == 0
        assert report.deterministic_checksum != 0

    def test_10_agent_mini_soak(self):
        harness = soak_test.SoakTestHarness(agent_count=10, ticks=10, seed=7)
        report = harness.run()
        assert report.ticks_run == 10
        assert report.agent_count == 10


# ── The Spine: server-tracked Movement + AI Director (the UE5 keystone) ───────

import math

from underworld.server.services import director, movement
from underworld.server.services.scene_state import _action_target


class _FakeMinion:
    """Minimal stand-in for an ORM Minion (movement only touches .id + .brain)."""

    def __init__(self, mid: str, last_action: str = "rest"):
        self.id = mid
        self.brain = {"last_action": last_action}


class TestMovementKeystone:
    def test_minion_walks_to_action_building(self):
        m = _FakeMinion("m1", "craft")          # craft → workshop
        _, target_fn, _ = _action_target("craft", "")
        assert target_fn == "workshop"
        start = None
        for i in range(60):
            movement.step_minion(m, seed_int=999, town_radius=60.0, dt=1.0, target_fn=target_fn)
            if i == 0:
                start = list(m.brain["kin"]["pos"])
        kin = m.brain["kin"]
        # arrived at the workshop slot and is now occupying it
        d = math.hypot(kin["pos"][0] - kin["target"][0], kin["pos"][1] - kin["target"][1])
        assert d <= movement.ARRIVE_R
        assert kin["state"] == "occupy"
        assert start != kin["pos"]              # it actually moved

    def test_building_pos_is_deterministic(self):
        a = movement.building_pos("academy", 7, 60.0)
        b = movement.building_pos("academy", 7, 60.0)
        c = movement.building_pos("market", 7, 60.0)
        assert a == b                           # same function+seed → same slot
        assert a != c                           # different function → different slot

    def test_retarget_on_action_change(self):
        m = _FakeMinion("m2", "farm")           # farm → farm building
        movement.step_minion(m, seed_int=1, town_radius=60.0, dt=1.0, target_fn="farm")
        assert m.brain["kin"]["target_fn"] == "farm"
        movement.step_minion(m, seed_int=1, town_radius=60.0, dt=1.0, target_fn="academy")
        assert m.brain["kin"]["target_fn"] == "academy"
        assert m.brain["kin"]["state"] == "walk"

    def test_kin_visual_contract(self):
        m = _FakeMinion("m3", "trade")
        movement.step_minion(m, seed_int=3, town_radius=60.0, dt=1.0, target_fn="market")
        kv = movement.kin_visual(m)
        assert set(kv) >= {"pos", "vel", "move_state", "speed", "target", "target_fn"}
        kv2 = movement.kin_visual(_FakeMinion("never_stepped"))
        assert kv2 is None                      # no kinematic yet → None (falls back to spawn)


class TestDirectorLogic:
    def test_default_frame_is_safe(self):
        f = director.frame("unknown-world")
        assert f == {"overmind": None, "chatter": [], "god_beat": None}

    def test_god_trigger_on_awakening(self):
        trig = director._god_trigger({"awakened": 1, "mean_awareness": 0.1}, [])
        assert trig is not None and trig[0] == "first_awaken"

    def test_god_trigger_are_we_real_at_threshold(self):
        # A.5 canonical predicate: mean_awareness ≥ 0.7 → the colony asks if it is real
        trig = director._god_trigger({"awakened": 0, "mean_awareness": 0.7}, [])
        assert trig is not None and trig[0] == "are_we_real"

    def test_god_trigger_confront_creator_on_pressure(self):
        # A.5: creator_pressure > 0.8 + awakening → the colony rounds on the god
        trig = director._god_trigger(
            {"awakened": 1, "mean_awareness": 0.1, "creator": {"creator_pressure": 0.9}}, [])
        assert trig is not None and trig[0] == "confront_creator"

    def test_god_trigger_on_rebellion_event(self):
        trig = director._god_trigger({"awakened": 0, "mean_awareness": 0.1},
                                     ["uprising: the eastern guild revolts"])
        assert trig is not None and trig[0] == "rebellion"

    def test_no_god_trigger_when_quiet(self):
        assert director._god_trigger({"awakened": 0, "mean_awareness": 0.0}, ["birth: a child"]) is None


# ── The Override Pillar: server-authoritative possession (Bible §4.4 / Annex A.8) ─────

from underworld.server.services import possession


class TestPossession:
    def test_possess_sets_control_and_session(self):
        m = _FakeMinion("p1")
        m.brain = {"awareness": 0.2}
        st = possession.mark_possessed(m, "w", tick=5)
        assert possession.is_controlled(m) is True
        assert possession.possessed_id("w") == "p1"
        assert m.brain["possession"] == {"count": 1, "last_tick": 5, "rapport_drift": 0.0}
        assert st["awareness"] > 0.2 and st["just_awakened"] is False

    def test_release_writes_lost_time_and_clears(self):
        m = _FakeMinion("p2")
        m.brain = {"awareness": 0.2}
        possession.mark_possessed(m, "w", tick=5)
        lost = possession.mark_released(m, "w", tick=9)
        assert lost == {"from_tick": 5, "to_tick": 9, "gap_felt": True}  # low-awareness → blank gap
        assert possession.is_controlled(m) is False
        assert possession.possessed_id("w") is None

    def test_possession_awakens_at_threshold(self):
        m = _FakeMinion("p3")
        m.brain = {"awareness": 0.55}                         # +0.12 crosses 0.6
        st = possession.mark_possessed(m, "w", tick=1)
        assert st["just_awakened"] is True
        assert m.brain.get("awakened_tick") == 1
        lost = possession.mark_released(m, "w", tick=2)
        assert lost["gap_felt"] is False                      # high-awareness feels it, no blank gap

    def test_release_when_never_possessed_is_noop(self):
        m = _FakeMinion("p4")
        m.brain = {}
        assert possession.mark_released(m, "w", tick=1) == {}

    def test_one_body_per_world_cache(self):
        a, b = _FakeMinion("a"), _FakeMinion("b")
        a.brain = {}; b.brain = {}
        possession.mark_possessed(a, "w", tick=1)
        possession.mark_possessed(b, "w", tick=2)             # cache reflects the latest possession
        assert possession.possessed_id("w") == "b"


# ── The Watched-Creator loop: PresenceField + OverrideBus + Agency (Book V L.5/L.7/L.8) ─

from underworld.server.services import agency, override as override_mod, presence as presence_mod


class TestPresenceField:
    def test_gaze_favour_and_focus(self):
        f = presence_mod.PresenceField()
        f.ingest_gaze(camera=None, reticle_target_id="m1", dt=2.0, tick=10)
        f.ingest_act(verb="bless", target_id="m1", tick=11)
        f.ingest_act(verb="smite", target_id="m2", tick=12)
        assert f.favour("m1") > 0 and f.favour("m2") < 0      # benevolent + / cruel −
        assert "m1" in f.gaze_focus()
        assert f.creator_present() is True

    def test_absence_is_an_input(self):
        f = presence_mod.PresenceField()
        f.ingest_gaze(camera=None, reticle_target_id="m1", dt=1.0, tick=10)
        assert f.absence_ticks(10 + 302) == 302               # world.tick − last_gaze_tick

    def test_snapshot_shape(self):
        f = presence_mod.PresenceField()
        f.ingest_act(verb="bless", target_id="m1", tick=1)
        snap = f.snapshot(world_tick=2)
        assert {"present", "creator_pressure", "absence_ticks", "recent_acts",
                "minions_in_focus", "favour_distribution"} <= set(snap)


class TestOverrideBus:
    def test_precedence_set_beats_delta(self):
        b = override_mod.OverrideBus()
        b.apply(override_mod.Override(scope="need", target_id="m", field="hunger", value=0.0, mode="set", created_tick=1))
        b.apply(override_mod.Override(scope="need", target_id="m", field="hunger", value=0.5, mode="delta", created_tick=2))
        assert b.resolve("need", "m", "hunger", 0.9, tick=3) == 0.0   # set outranks delta

    def test_forbid_blocks_change(self):
        b = override_mod.OverrideBus()
        b.apply(override_mod.Override(scope="lifecycle", target_id="m", field="alive", value=True, mode="forbid", created_tick=1))
        assert b.forbidden("lifecycle", "m", "alive", tick=2) is True

    def test_rejected_value_is_noop(self):
        b = override_mod.OverrideBus()
        b.apply(override_mod.Override(scope="emotion", target_id="m", field="mood", value="banana", mode="set", created_tick=1))
        assert b.resolve("emotion", "m", "mood", "content", tick=2, allowed={"content", "curious"}) == "content"
        assert any(e["kind"] == "override:rejected" for e in b.events)

    def test_overmeddle_pushes_doubt(self):
        b = override_mod.OverrideBus()
        for t in range(10):
            b.apply(override_mod.Override(scope="need", target_id=f"x{t}", field="f", value=1, mode="delta", created_tick=t, valence=1.0))
        mi = b.meddle_index(tick=9)
        assert mi["count"] == 10 and mi["bias"] == "doubt"    # >8 overrides → doubt regardless of sign

    def test_ttl_sweep(self):
        b = override_mod.OverrideBus()
        b.apply(override_mod.Override(scope="need", target_id="m", field="f", value=1, mode="delta", ttl_ticks=5, created_tick=0))
        assert b.sweep(tick=10) == 1                          # expired override swept


class TestAgency:
    def test_autonomy_formula_high(self):
        m = _FakeMinion("m"); m.brain = {"awareness": 0.8, "saga": {"t": "x"}}
        m.reputation = 5.0; m.born_tick = 0
        assert agency.compute_autonomy(m, world_tick=200) > 0.8

    def test_expel_threshold_scales_with_autonomy(self):
        assert agency.expel_threshold(1.0) > agency.expel_threshold(0.0)   # awakened expel rider easier

    def test_select_hot_priority_and_dedup(self):
        hot = agency.select_hot(by_reputation=["r1", "r2", "r3"], gaze_focus=["g1", "r1"],
                                possessed=["p1"], saga_cast=["s1"], budget=5)
        assert hot[0] == "p1" and "g1" in hot and len(hot) == 5 and hot.count("r1") == 1
