# KLEE — Symbolic-Execution Targets

KLEE (https://github.com/klee/klee) runs symbolic execution on LLVM IR.

This repo is mostly Python, so KLEE is **not directly applicable** to the live
runtime. However, the following pieces compile to C-extensions or could be
ported and audited with KLEE:

1. **Hash / dedup helpers** — `scripts/skill_miner.py:cluster_key()` is a pure
   string hash function. Could be ported to a tiny C util and KLEE-verified
   against collision properties.

2. **Path-normalisation** — `server/services/cloud_storage.py` does input
   normalisation on paths before S3 keys. Worth a KLEE pass once ported.

3. **JSONL parser** — the audit/event JSONL readers currently rely on the
   stdlib parser. The Rust `serde_json` impl has been KLEE-tested upstream;
   for our purposes we trust stdlib.

## Running KLEE (when a target exists)

```bash
clang -emit-llvm -c -g -O0 -Xclang -disable-O0-optnone target.c -o target.bc
klee target.bc
```

CI does NOT include a KLEE step today — no target compiled yet.
