#!/usr/bin/env python3
"""Request AMX (XTILEDATA) XSTATE permission, then exec ``ollama serve``.

AMX tile instructions fault unless the process holds ARCH_REQ_XCOMP_PERM for
XFEATURE_XTILEDATA (Linux >= 5.16). The grant is inherited across fork + execve,
so the llama-server children ollama spawns run AMX kernels correctly. This is the
kernel's prescribed way to enable AMX — not a workaround.

Usage:  python3 scripts/amx_ollama.py        # becomes `ollama serve` with AMX on
"""
from __future__ import annotations

import ctypes
import os
import sys

SYS_arch_prctl = 158          # x86_64 arch_prctl
ARCH_GET_XCOMP_PERM = 0x1022
ARCH_REQ_XCOMP_PERM = 0x1023
XFEATURE_XTILEDATA = 18


def enable_amx() -> bool:
    """Request permission to use the AMX tile XSTATE. Returns True if granted."""
    try:
        libc = ctypes.CDLL("libc.so.6", use_errno=True)
    except OSError:
        return False
    if libc.syscall(SYS_arch_prctl, ARCH_REQ_XCOMP_PERM, XFEATURE_XTILEDATA) != 0:
        print(f"[amx] ARCH_REQ_XCOMP_PERM failed errno={ctypes.get_errno()}", file=sys.stderr)
        return False
    mask = ctypes.c_ulonglong(0)
    libc.syscall(SYS_arch_prctl, ARCH_GET_XCOMP_PERM, ctypes.byref(mask))
    ok = bool(mask.value & (1 << XFEATURE_XTILEDATA))
    print(f"[amx] XTILEDATA {'granted' if ok else 'NOT granted'} (mask={hex(mask.value)})",
          file=sys.stderr)
    return ok


if __name__ == "__main__":
    enable_amx()
    argv = sys.argv[1:] or ["serve"]
    os.execvp("ollama", ["ollama", *argv])
