/* amx_enable.c — LD_PRELOAD shim that enables AMX in whatever process loads it.
 *
 * AMX XTILEDATA is a dynamically-enabled XSTATE feature: a process must call
 * arch_prctl(ARCH_REQ_XCOMP_PERM, XFEATURE_XTILEDATA) before executing AMX tile
 * instructions, and on this kernel that grant is NOT preserved across execve.
 * ollama's llama-server runner never makes the request, so its AMX kernels fault.
 *
 * Loaded via LD_PRELOAD, this constructor runs at .so load time inside EVERY
 * process in the tree (ollama AND each runner it exec()s, because LD_PRELOAD is
 * inherited through the environment), performing the request in-process — exactly
 * where the kernel requires it. This ENABLES AMX; it does not bypass it.
 */
#include <sys/syscall.h>
#include <unistd.h>

#define ARCH_REQ_XCOMP_PERM 0x1023
#define XFEATURE_XTILEDATA  18

__attribute__((constructor))
static void amx_enable(void) {
    /* Best-effort: if unsupported, the syscall simply returns non-zero and the
     * existing (non-AMX) path is used. No output, so we never pollute stdio. */
    syscall(SYS_arch_prctl, ARCH_REQ_XCOMP_PERM, XFEATURE_XTILEDATA);
}
