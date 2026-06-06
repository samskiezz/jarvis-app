/* amx_probe.c — definitively test whether AMX tile instructions EXECUTE here.
 *
 * 1. Request XTILEDATA permission (the kernel-mandated step for AMX).
 * 2. Confirm the grant via ARCH_GET_XCOMP_PERM.
 * 3. Configure a tile, load/zero it, and run one TDPBSSD (int8 matmul) — the
 *    exact class of instruction ggml's AMX backend uses. If the CPU/hypervisor
 *    truly supports AMX, this returns 0; if AMX is advertised but not backed,
 *    the process takes SIGILL/SIGSEGV here.
 */
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <sys/syscall.h>

#define ARCH_GET_XCOMP_PERM 0x1022
#define ARCH_REQ_XCOMP_PERM 0x1023
#define XFEATURE_XTILEDATA  18

struct tilecfg {
    uint8_t palette_id;
    uint8_t start_row;
    uint8_t reserved[14];
    uint16_t colsb[16];
    uint8_t rows[16];
};

int main(void) {
    long r = syscall(SYS_arch_prctl, ARCH_REQ_XCOMP_PERM, XFEATURE_XTILEDATA);
    if (r != 0) { printf("REQ_XCOMP_PERM failed\n"); return 2; }
    unsigned long long mask = 0;
    syscall(SYS_arch_prctl, ARCH_GET_XCOMP_PERM, &mask);
    int granted = (mask >> XFEATURE_XTILEDATA) & 1;
    printf("XTILEDATA granted=%d mask=0x%llx\n", granted, mask);
    if (!granted) return 3;

    struct tilecfg cfg;
    memset(&cfg, 0, sizeof(cfg));
    cfg.palette_id = 1;
    /* one 16x64 int8 tile in each of t0,t1,t2 */
    for (int i = 0; i < 3; i++) { cfg.colsb[i] = 64; cfg.rows[i] = 16; }

    __asm__ volatile ("ldtilecfg %0" :: "m"(cfg));
    __asm__ volatile ("tilezero %%tmm0" ::);
    __asm__ volatile ("tilezero %%tmm1" ::);
    __asm__ volatile ("tilezero %%tmm2" ::);
    /* tmm0 += tmm1 (int8) * tmm2 (int8) — the AMX int8 matmul ggml uses */
    __asm__ volatile ("tdpbssd %%tmm2, %%tmm1, %%tmm0" ::);
    __asm__ volatile ("tilerelease" ::);

    printf("AMX_EXECUTED_OK\n");
    return 0;
}
