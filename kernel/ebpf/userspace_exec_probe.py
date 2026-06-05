"""USERSPACE EXEC PROBE — the no-privilege workaround for the eBPF audit probe.

True eBPF (`audit_exec.bpf.c`) needs CAP_BPF/root + kernel BTF, unavailable in an
unprivileged container. This achieves the SAME capability — kernel-sourced process
execution telemetry feeding the audit/event plane — using only `/proc`, which any
process can read. It emits the identical `kernel.process.exec` event contract, so
the audit plane cannot tell (or care) which collector produced it. On a real node
the Go agent prefers the eBPF path (lower overhead, no sampling gap) and falls back
to this; here, this runs.

Mechanism: snapshot the set of PIDs in /proc, diff against the previous snapshot,
and for each newly-appeared PID read /proc/<pid>/{comm,status,cmdline}. Pure stdlib.
"""

from __future__ import annotations

import os
import time

try:
    from server.services import jarvis_events as events
except Exception:  # noqa: BLE001
    events = None  # type: ignore


def available() -> bool:
    return os.path.isdir("/proc") and os.access("/proc", os.R_OK)


def _read(path: str) -> str:
    try:
        with open(path, "r", errors="ignore") as f:
            return f.read().strip()
    except Exception:  # noqa: BLE001
        return ""


def _pid_set() -> set[int]:
    out = set()
    try:
        for name in os.listdir("/proc"):
            if name.isdigit():
                out.add(int(name))
    except Exception:  # noqa: BLE001
        pass
    return out


def _exec_event(pid: int) -> dict | None:
    comm = _read(f"/proc/{pid}/comm")
    if not comm:
        return None
    status = _read(f"/proc/{pid}/status")
    uid = ppid = None
    for line in status.splitlines():
        if line.startswith("Uid:"):
            uid = int(line.split()[1])
        elif line.startswith("PPid:"):
            ppid = int(line.split()[1])
    cmdline = _read(f"/proc/{pid}/cmdline").replace("\x00", " ").strip()
    return {"event_type": "kernel.process.exec", "pid": pid, "ppid": ppid,
            "uid": uid, "comm": comm, "filename": cmdline or comm,
            "collector": "userspace-proc", "ts_ns": time.time_ns()}


def poll_once(prev: set[int]) -> tuple[set[int], list[dict]]:
    """One diff cycle: return (current_pids, list of exec events for new pids)."""
    cur = _pid_set()
    evs = []
    for pid in cur - prev:
        e = _exec_event(pid)
        if e:
            evs.append(e)
            if events is not None:
                events.emit("audit", "kernel.process.exec", e, actor="userspace-exec-probe")
    return cur, evs


def stream(duration_s: float = 2.0, interval_s: float = 0.05) -> list[dict]:
    """Capture process-exec events for ``duration_s`` and return them."""
    if not available():
        raise RuntimeError("/proc not readable — exec telemetry unavailable")
    prev = _pid_set()
    collected: list[dict] = []
    end = time.time() + duration_s
    while time.time() < end:
        prev, evs = poll_once(prev)
        collected.extend(evs)
        time.sleep(interval_s)
    return collected


if __name__ == "__main__":
    print("userspace exec probe — capturing 2s of process execs ...")
    evs = stream(2.0)
    for e in evs[:20]:
        print(f"  pid={e['pid']:>7} uid={e['uid']} comm={e['comm']!r} cmd={e['filename'][:60]!r}")
    print(f"captured {len(evs)} exec events")
