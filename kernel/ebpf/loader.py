"""Loader contract for audit_exec.bpf.c — runs on a real fleet node (Go agent in
prod; this Python sketch documents the libbpf/BCC contract). LAYER B: requires
CAP_BPF and a kernel BTF + clang toolchain; raises cleanly if unavailable so the
platform degrades instead of crashing."""
from __future__ import annotations


def load_and_stream(on_event):
    """Compile+attach audit_exec.bpf.c, poll the ring buffer, call on_event(dict)
    per process exec. Forwarded by the agent as `kernel.process.exec` events."""
    try:
        from bcc import BPF  # type: ignore  # or libbpf via cffi in the Go agent
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(
            "eBPF unavailable: needs CAP_BPF/root, kernel BTF and bcc/libbpf. "
            f"({e}) — Layer B, runs on real nodes only."
        )
    b = BPF(src_file="audit_exec.bpf.c")            # noqa: F841 (illustrative)
    raise NotImplementedError("attach + ringbuf poll runs in the Go fleet-agent")
