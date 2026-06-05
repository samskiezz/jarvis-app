# TARGET_RUNTIME — eBPF kernel probes

| Field | Value |
|-------|-------|
| **Artifact** | `audit_exec.bpf.c` (CO-RE eBPF, sched_process_exec tracepoint) |
| **Future owner** | Go fleet-agent (`fleet-agents/go-agent`) compiles + attaches via libbpf |
| **Emits** | `kernel.process.exec` events onto the Kafka `audit`/`fleet` topics |
| **Requires** | Linux kernel, CAP_BPF + CAP_PERFMON (or root), kernel BTF, clang/llvm + libbpf |
| **Status** | **Layer B (INFRA)** — cannot load in the sandbox; runs on real nodes |

## Why it cannot run here
Loading eBPF needs privileged kernel access (`bpf()` syscall, CAP_BPF), kernel
BTF, and a build toolchain not present in the lightweight container. The probe
source is real and CO-RE-portable; `loader.py` documents the attach/poll contract
and raises a clean `RuntimeError` when the capability is absent, so the platform
degrades rather than crashing.

## Role in the platform
Kernel-level, tamper-evident provenance of process execution per fleet node,
independent of app logging — feeds the observability/audit plane (Layer 15) and
the security plane's runtime posture.
