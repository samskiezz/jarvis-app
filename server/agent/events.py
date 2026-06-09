"""Agent OS — EventBus.

An in-memory, thread-safe ring buffer of events with a monotonically increasing
sequence number. Every part of the Agent OS (planner, jobs, tools) emits onto a
single shared bus; the dashboard/UI long-polls `since(seq)` (or `wait(seq)`) to
stream activity.

Event types (the contract the UI renders):
    agent.thinking      — the core is reasoning / about to plan
    agent.plan          — a structured plan was produced
    tool.started        — a tool handler began
    tool.progress       — incremental progress  {pct, msg}
    tool.completed      — a tool finished OK     {result}
    tool.failed         — a tool errored         {error}
    job.queued          — a job row was created
    job.running         — a job's worker thread started
    job.progress        — job progress (mirrors tool.progress)
    job.completed       — a job finished OK
    job.failed          — a job errored
    permission.required — a step needs human approval before running

Nothing in here raises to the caller: emitting is best-effort and the bus is the
backbone of the whole system, so it must never take the process down.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

# The canonical set of event types. Not enforced (emit accepts any string) but
# documents the contract and lets the UI build a legend/filter.
EVENT_TYPES: tuple[str, ...] = (
    "agent.thinking",
    "agent.plan",
    "tool.started",
    "tool.progress",
    "tool.completed",
    "tool.failed",
    "job.queued",
    "job.running",
    "job.progress",
    "job.completed",
    "job.failed",
    "permission.required",
)


class EventBus:
    """Thread-safe ring buffer + monotonic seq counter.

    Capacity is the maximum number of events retained in memory (older events are
    dropped); the monotonic `seq` keeps growing regardless of trimming so cursors
    stay valid. A single `Condition` (over an `RLock`) guards all state and powers
    the `wait()` long-poll.
    """

    def __init__(self, capacity: int = 2000) -> None:
        self._cap = max(64, int(capacity))
        self._buf: List[Dict[str, Any]] = []
        self._seq = 0
        self._lock = threading.RLock()
        self._cv = threading.Condition(self._lock)

    def emit(self, type: str, data: Optional[Dict[str, Any]] = None) -> int:
        """Append an event; returns its seq. Never raises (returns -1 on error).

        Non-dict `data` is coerced: ``None`` -> ``{}``, anything else -> ``{"value": data}``.
        """
        try:
            if data is None:
                payload: Dict[str, Any] = {}
            elif isinstance(data, dict):
                payload = data
            else:
                payload = {"value": data}
            with self._cv:
                self._seq += 1
                ev = {
                    "seq": self._seq,
                    "ts": time.time(),
                    "type": str(type),
                    "data": payload,
                }
                self._buf.append(ev)
                if len(self._buf) > self._cap:
                    # Drop oldest in bulk to amortise; seq is unaffected.
                    del self._buf[: len(self._buf) - self._cap]
                self._cv.notify_all()
                return self._seq
        except Exception:  # noqa: BLE001 — the bus must never crash a caller
            return -1

    def since(self, seq: int = 0) -> Dict[str, Any]:
        """Return all events with seq > `seq`. Shape: ``{"seq": int, "events": [...]}``.

        `seq` is the cursor the client last saw; the returned top-level `seq` is
        the newest seq so the client can advance its cursor even when there were
        no new events (e.g. after a trim). Never raises.
        """
        try:
            cursor = int(seq)
        except (TypeError, ValueError):
            cursor = 0
        try:
            with self._lock:
                evs = [e for e in self._buf if e["seq"] > cursor]
                return {"seq": self._seq, "events": evs}
        except Exception:  # noqa: BLE001
            return {"seq": cursor, "events": []}

    def wait(self, seq: int = 0, timeout: float = 25.0) -> Dict[str, Any]:
        """Long-poll helper: block until there is an event with seq > `seq` (or
        `timeout` elapses), then return ``since(seq)``. Great for the UI stream.
        Never raises.
        """
        try:
            cursor = int(seq)
        except (TypeError, ValueError):
            cursor = 0
        try:
            wait_for = max(0.0, float(timeout))
        except (TypeError, ValueError):
            wait_for = 25.0
        try:
            deadline = time.time() + wait_for
            with self._cv:
                while self._seq <= cursor:
                    remaining = deadline - time.time()
                    if remaining <= 0:
                        break
                    self._cv.wait(timeout=remaining)
        except Exception:  # noqa: BLE001
            pass
        return self.since(cursor)

    def latest_seq(self) -> int:
        try:
            with self._lock:
                return self._seq
        except Exception:  # noqa: BLE001
            return 0

    def clear(self) -> None:
        """Drop buffered events. The monotonic `seq` is preserved so existing
        cursors remain valid. Never raises."""
        try:
            with self._lock:
                self._buf.clear()
        except Exception:  # noqa: BLE001
            pass


# Process-wide singleton. Import `BUS` everywhere so all modules share one stream.
BUS = EventBus()


if __name__ == "__main__":
    # Self-contained smoke test: correctness + thread-safety + ring-trim + long-poll.
    import threading as _t

    def check(cond: bool, label: str) -> None:
        print(("PASS " if cond else "FAIL ") + label)
        if not cond:
            raise SystemExit(1)

    bus = EventBus(capacity=64)  # min capacity, easy to overflow

    # 1) emit returns monotonic seq starting at 1.
    s1 = bus.emit("agent.thinking", {"run_id": "r1", "msg": "hello"})
    s2 = bus.emit("agent.plan", {"run_id": "r1", "summary": "do a thing"})
    check(s1 == 1 and s2 == 2, "emit returns monotonic seq (1,2)")

    # 2) since(0) returns both events with full shape.
    out = bus.since(0)
    check(out["seq"] == 2 and len(out["events"]) == 2, "since(0) returns all events")
    ev = out["events"][0]
    check(
        set(ev.keys()) == {"seq", "ts", "type", "data"}
        and ev["type"] == "agent.thinking"
        and isinstance(ev["ts"], float)
        and ev["data"]["run_id"] == "r1",
        "event shape {seq,ts,type,data}",
    )

    # 3) since(cursor) only returns newer events.
    out2 = bus.since(1)
    check(len(out2["events"]) == 1 and out2["events"][0]["seq"] == 2, "since(seq) cursor filtering")

    # 4) non-dict / None data coercion.
    bus.emit("tool.progress", None)
    bus.emit("tool.progress", 42)
    tail = bus.since(2)["events"]
    check(tail[0]["data"] == {} and tail[1]["data"] == {"value": 42}, "data coercion (None->{}, scalar->{value})")

    # 5) ring-trim: emit well past capacity, buffer stays <= cap, seq keeps growing.
    base = bus.latest_seq()
    for i in range(500):
        bus.emit("job.progress", {"pct": i})
    full = bus.since(0)
    check(len(full["events"]) <= 64, "ring buffer trims to capacity")
    check(bus.latest_seq() == base + 500, "monotonic seq survives trimming")
    # A stale cursor still advances via the returned top-level seq.
    check(full["seq"] == bus.latest_seq(), "since() reports newest seq for stale cursors")

    # 6) thread-safety: many concurrent emitters, no lost/duplicate seqs.
    bus2 = EventBus(capacity=100000)
    n_threads, per = 16, 500

    def worker() -> None:
        for _ in range(per):
            bus2.emit("tool.started", {"tool": "x"})

    threads = [_t.Thread(target=worker) for _ in range(n_threads)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    total = n_threads * per
    seqs = [e["seq"] for e in bus2.since(0)["events"]]
    check(bus2.latest_seq() == total, f"concurrent emits produce {total} seqs")
    check(len(seqs) == total and len(set(seqs)) == total, "no lost or duplicate seqs under contention")
    check(seqs == sorted(seqs), "seqs are strictly increasing")

    # 7) wait(): blocks then unblocks when a new event arrives.
    bus3 = EventBus()
    cur = bus3.latest_seq()
    got: Dict[str, Any] = {}

    def waiter() -> None:
        got.update(bus3.wait(cur, timeout=5.0))

    wt = _t.Thread(target=waiter)
    wt.start()
    time.sleep(0.1)
    bus3.emit("agent.plan", {"summary": "woke up"})
    wt.join(timeout=5.0)
    check(not wt.is_alive(), "wait() returned after emit")
    check(got.get("events") and got["events"][-1]["data"]["summary"] == "woke up", "wait() delivered the new event")

    # 8) wait() honours timeout when nothing arrives.
    t0 = time.time()
    empty = bus3.wait(bus3.latest_seq(), timeout=0.3)
    check(0.25 <= time.time() - t0 < 2.0 and empty["events"] == [], "wait() times out cleanly with no new events")

    # 9) clear() drops events but preserves seq.
    seq_before = bus3.latest_seq()
    bus3.clear()
    check(bus3.since(0)["events"] == [] and bus3.latest_seq() == seq_before, "clear() empties buffer, keeps seq")

    # 10) emit never raises (bad type still returns a seq).
    check(isinstance(bus3.emit(object(), {"x": 1}), int), "emit tolerates non-str type")

    print("ALL EVENTBUS SMOKE TESTS PASSED")
