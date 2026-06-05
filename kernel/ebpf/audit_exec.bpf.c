// SPDX-License-Identifier: GPL-2.0
// audit_exec.bpf.c — eBPF probe feeding the platform audit plane from the kernel.
//
// Attaches to the sched_process_exec tracepoint and streams every process
// execution (pid, uid, comm, filename) to user space via a BPF ring buffer.
// The user-space loader forwards these as `kernel.process.exec` events onto the
// platform event backbone (Kafka), giving the audit plane tamper-evident,
// kernel-level provenance of what actually ran on each fleet node — independent
// of any application-level logging.
//
// LAYER B — requires the Linux kernel, CAP_BPF/CAP_PERFMON (or root), kernel
// BTF, and a clang/llvm + libbpf build toolchain. It CANNOT be loaded in the
// lightweight sandbox; it is compiled and attached by the Go fleet-agent on a
// real node. See TARGET_RUNTIME.md.

#include <vmlinux.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "GPL";

#define TASK_COMM_LEN 16
#define NAME_MAX 127

struct exec_event {
    __u32 pid;
    __u32 ppid;
    __u32 uid;
    __u64 ts_ns;
    char comm[TASK_COMM_LEN];
    char filename[NAME_MAX + 1];
};

// ring buffer: kernel -> user space, lock-free
struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 1 << 24);   // 16 MiB
} events SEC(".maps");

// tracepoint:sched:sched_process_exec
SEC("tp/sched/sched_process_exec")
int handle_exec(struct trace_event_raw_sched_process_exec *ctx)
{
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    struct exec_event *e;

    e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e)
        return 0;   // ring full: drop, never block the kernel

    __u64 id = bpf_get_current_pid_tgid();
    e->pid = id >> 32;
    e->uid = bpf_get_current_uid_gid() & 0xFFFFFFFF;
    e->ts_ns = bpf_ktime_get_ns();
    e->ppid = BPF_CORE_READ(task, real_parent, tgid);

    bpf_get_current_comm(&e->comm, sizeof(e->comm));

    // filename offset is carried in the tracepoint's __data_loc field
    unsigned fname_off = ctx->__data_loc_filename & 0xFFFF;
    bpf_probe_read_kernel_str(&e->filename, sizeof(e->filename),
                              (void *)ctx + fname_off);

    bpf_ringbuf_submit(e, 0);
    return 0;
}
