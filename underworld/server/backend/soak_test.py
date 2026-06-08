"""Soak Test Harness — Layer 69 architecture.

Runs unattended simulation with N agents, validates bounded memory growth,
checks for crashes, and validates deterministic replay.
"""
from __future__ import annotations

import random
import time
import tracemalloc
from dataclasses import dataclass, field, replace
from typing import Any

from . import (
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
    valence,
)


@dataclass
class SoakReport:
    ticks_run: int = 0
    agent_count: int = 0
    event_count: int = 0
    memory_growth_mb: float = 0.0
    avg_tick_ms: float = 0.0
    crashes: list[str] = field(default_factory=list)
    anomalies_detected: int = 0
    illegal_actions_rejected: int = 0
    valence_updates: int = 0
    relationships_formed: int = 0
    max_awakening: float = 0.0
    memory_records: int = 0
    deterministic_checksum: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "ticks_run": self.ticks_run,
            "agent_count": self.agent_count,
            "event_count": self.event_count,
            "memory_growth_mb": round(self.memory_growth_mb, 2),
            "avg_tick_ms": round(self.avg_tick_ms, 2),
            "crashes": list(self.crashes),
            "anomalies_detected": self.anomalies_detected,
            "illegal_actions_rejected": self.illegal_actions_rejected,
            "valence_updates": self.valence_updates,
            "relationships_formed": self.relationships_formed,
            "max_awakening": round(self.max_awakening, 3),
            "memory_records": self.memory_records,
            "deterministic_checksum": self.deterministic_checksum,
        }


class SoakTestHarness:
    """Headless soak tester that exercises all backend systems."""

    def __init__(
        self,
        agent_count: int = 100,
        ticks: int = 1000,
        seed: int = 42,
    ) -> None:
        self.agent_count = agent_count
        self.ticks = ticks
        self.rng = random.Random(seed)
        self.event_stream = events.EventStream()
        self.anomaly_detector = anomaly.AnomalyDetector()
        self.validator = action_validation.ActionValidator()
        self.lod_scheduler = cognitive_lod.CognitiveLODScheduler()
        self.player_model = player_model.PlayerModelBackend(world_id="soak-world")
        self.rel_graph = relationships.RelationshipGraph()
        self.ident_registry = identity.IdentityRegistry()
        self.memories: list[memory_backend.MemoryRecord] = []
        self.valence_states: dict[str, valence.ValenceState] = {}
        self.self_models: dict[str, self_model.SelfModelState] = {}
        self.body_states: dict[str, body_state.BodyState] = {}

    def run(self) -> SoakReport:
        report = SoakReport()
        tracemalloc.start()
        start_mem = tracemalloc.get_traced_memory()[0]

        # Seed agents
        for i in range(self.agent_count):
            aid = f"agent-{i:03d}"
            self.ident_registry.register(
                identity.AgentIdentity(
                    id=aid,
                    display_name=f"Minion {i}",
                    birth_tick=0,
                    origin=identity.OriginKind.NATURAL_BIRTH,
                )
            )
            self.lod_scheduler.register(aid)
            self.valence_states[aid] = valence.ValenceState()
            self.self_models[aid] = self_model.SelfModelState(agent_id=aid)
            self.body_states[aid] = body_state.BodyState()
            # Seed some relationships
            for _ in range(3):
                other = f"agent-{self.rng.randint(0, self.agent_count - 1):03d}"
                if other != aid:
                    self.rel_graph.upsert(
                        relationships.RelationshipState(from_id=aid, to_id=other)
                    )

        report.agent_count = self.agent_count
        tick_times: list[float] = []
        checksum = 0

        for tick in range(1, self.ticks + 1):
            t0 = time.perf_counter()
            try:
                self._run_tick(tick, report)
            except Exception as exc:
                report.crashes.append(f"tick {tick}: {exc}")
                break
            t1 = time.perf_counter()
            tick_times.append(t1 - t0)

            # Deterministic checksum from agent states
            for i in range(self.agent_count):
                aid = f"agent-{i:03d}"
                vs = self.valence_states[aid]
                checksum += int(vs.fear * 1000) + int(vs.hope * 1000)
                bs = self.body_states[aid]
                checksum += int(bs.health * 1000)

        report.ticks_run = tick
        report.event_count = self.event_stream.count()
        report.deterministic_checksum = checksum % 2**31
        report.memory_records = len(self.memories)

        end_mem = tracemalloc.get_traced_memory()[0]
        tracemalloc.stop()
        report.memory_growth_mb = (end_mem - start_mem) / (1024 * 1024)
        if tick_times:
            report.avg_tick_ms = (sum(tick_times) / len(tick_times)) * 1000

        report.relationships_formed = self.rel_graph.count()
        report.anomalies_detected = self.anomaly_detector.count()
        report.illegal_actions_rejected = len(self.validator.illegal_actions())
        report.max_awakening = max(
            (s.awakening_score for s in self.self_models.values()), default=0.0
        )

        return report

    def _run_tick(self, tick: int, report: SoakReport) -> None:
        # 1. Emit random events
        for _ in range(self.rng.randint(0, 3)):
            cat = self.rng.choice(list(events.EventCategory))
            actor = f"agent-{self.rng.randint(0, self.agent_count - 1):03d}"
            evt = self.event_stream.emit(
                tick=tick,
                category=cat,
                actor_ids=(actor,),
                player_caused=self.rng.random() < 0.1,
                anomaly=cat == events.EventCategory.MIRACLE_ANOMALY,
            )
            # 2. Update valence
            if actor in self.valence_states:
                self.valence_states[actor] = valence.update_from_event(
                    self.valence_states[actor],
                    cat.value,
                    player_caused=evt.player_caused,
                )
                report.valence_updates += 1
            # 3. Update self-model
            if actor in self.self_models:
                self.self_models[actor] = self_model.update_from_event(
                    self.self_models[actor],
                    cat.value,
                    player_caused=evt.player_caused,
                )
            # 4. Memory
            rec = memory_backend.MemoryRecord(
                id=f"mem-{tick}-{actor}",
                agent_id=actor,
                source_event_id=evt.id,
                memory_type="episodic",
                content=f"Event {cat.value} at tick {tick}",
                tick_created=tick,
            )
            rec = replace(
                rec,
                importance=memory_backend.compute_importance(
                    emotional_intensity=self.rng.random(),
                    player_caused=evt.player_caused,
                    anomaly=evt.anomaly,
                ),
            )
            self.memories.append(rec)
            # 5. Player model
            if evt.player_caused:
                self.player_model.log_action(
                    tick=tick,
                    action_kind=cat.value,
                    target_agent_id=actor,
                )

        # 6. Body state ticks
        for i in range(self.agent_count):
            aid = f"agent-{i:03d}"
            self.body_states[aid] = body_state.tick_update(self.body_states[aid])

        # 7. LOD scheduling
        for i in range(self.agent_count):
            aid = f"agent-{i:03d}"
            self.lod_scheduler.update_state(
                aid,
                player_proximity=self.rng.random(),
                trauma_score=self.valence_states[aid].trauma_load,
                awakening_score=self.self_models[aid].awakening_score,
            )
        self.lod_scheduler.schedule()

        # 8. Anomaly detection
        for i in range(self.agent_count):
            aid = f"agent-{i:03d}"
            expected = {"health": 1.0, "hunger": 0.8}
            actual = {
                "health": self.body_states[aid].health,
                "hunger": self.body_states[aid].hunger,
            }
            self.anomaly_detector.detect(
                agent_id=aid,
                tick=tick,
                expected=expected,
                actual=actual,
            )

        # 9. Action validation
        for i in range(self.agent_count):
            aid = f"agent-{i:03d}"
            proposal = action_validation.ActionProposal(
                actor_id=aid,
                action=self.rng.choice(list(action_validation.ActionKind)),
                risk_score=self.rng.random(),
            )
            self.validator.validate(
                proposal,
                body_state=self.body_states[aid].to_dict(),
            )

        # 10. Memory pruning (bounded growth)
        max_memories_per_agent = 200
        by_agent: dict[str, list[memory_backend.MemoryRecord]] = {}
        for m in self.memories:
            by_agent.setdefault(m.agent_id, []).append(m)
        pruned: list[memory_backend.MemoryRecord] = []
        for aid, mems in by_agent.items():
            if len(mems) > max_memories_per_agent:
                mems = memory_backend.retrieve_salient(
                    mems, current_tick=tick, k=max_memories_per_agent
                )
            pruned.extend(mems)
        self.memories = pruned



