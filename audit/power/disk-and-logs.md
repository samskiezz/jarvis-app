# Disk & Logs Audit — /opt/jarvis-app-1

**Date:** 2026-06-18
**Disk pressure:** `/dev/sda1` at **90% (345G / 387G, 43G free)**
**Repo footprint:** 119 GB
**Scope:** READ-ONLY. No deletes, no vacuums, no truncates. Commands listed are for owner to apply.

---

## TL;DR — Top 10 Savings Ranked by Impact

| # | Item | Current | Reclaimable | Risk | Idempotent | Command (owner runs) |
|---|------|---------|-------------|------|------------|----------------------|
| 1 | UE5 cooked output | 34 GB | **~34 GB** | None — rebuildable cook artifacts | yes | `rm -rf /opt/jarvis-app-1/underworld/deploy/ue5-project/Saved/Cooked` |
| 2 | Git pack bloated by `.venv-tts/tts_cache` (1.87 GB blob) + torch .so (433 MB) committed | 8.2 GB pack | **~7 GB** (after BFG / filter-repo + `git gc`) | HIGH — rewrites history, forces re-push, destructive | NO | `git filter-repo --strip-blobs-bigger-than 50M --force` then `git gc --prune=now --aggressive` (after backup + agree to force-push) |
| 3 | `.venv-tts` venv | 6.9 GB | **6.9 GB** (if not currently needed) | MEDIUM — rebuilds from torch 2.4.1 + coqui-tts 0.27.5 (~30 min) | yes | `rm -rf /opt/jarvis-app-1/.venv-tts` (only if voice-clone service NOT running; recipe in memory `voice-clone-engine.md`) |
| 4 | `tripo` generated GLBs | 8.4 GB | **~6 GB** (keep latest gen, drop older) | MEDIUM — regenerable but slow; verify nothing live-serves them | yes (per-file) | manual review of `/opt/jarvis-app-1/underworld/web/public/models/generated/tripo` |
| 5 | Docker reclaimable layers | 5.5 GB | **~4 GB** (one image 100% reclaimable per `docker system df`) | LOW — `prune -f` only touches dangling/unused | yes | `docker system prune -af --volumes` (verify openclaw container stays Up first) |
| 6 | `server/data/repo_graph_cache.json` (1.2 GB, plaintext JSON) | 1.2 GB | **~900 MB** (gzip in place; already have `.json.gz` sibling pattern) | LOW — confirm regenerator updates the `.gz` not `.json` | yes | `gzip -k /opt/jarvis-app-1/server/data/repo_graph_cache.json` then update reader to prefer `.gz` |
| 7 | `server/data/brain.db` + `vectors.db` (1.78 GB combined) | 1.78 GB | **200–400 MB** (VACUUM after writes settle) | MEDIUM — locks DB during vacuum; brain.db writes constantly | NO during live | `sqlite3 brain.db 'VACUUM;'` in a quiet window only |
| 8 | `documents.db` (202 MB) + `documents.db.gz` (69 MB) — both kept | 271 MB | **~202 MB** (drop one if duplicate) | LOW — check which one is authoritative | yes | `ls -la documents.db*` then remove the unused one |
| 9 | `server/data/audit.db` (77 MB, growing, last write 15:15) | 77 MB | **~50 MB** (VACUUM + retention policy) | MEDIUM — locks during vacuum | NO during live | `sqlite3 audit.db 'VACUUM;'` in quiet window; add retention cap |
| 10 | journald (already capped at 1 GB, current 102 MB) | 102 MB | **~50 MB** (tighten to 500M) | LOW — system logs | yes | edit `/etc/systemd/journald.conf` → `SystemMaxUse=500M` then `systemctl restart systemd-journald` |

**Total reclaimable (safe, idempotent only — items 1, 5, 6, 8, 10):** ~45 GB
**Total reclaimable (incl. medium-risk 3, 4, 7, 9):** ~60 GB
**With destructive git history rewrite (item 2):** ~67 GB

That moves `/dev/sda1` from 90% → ~73% (safe path) or ~67% (full path).

---

## Full Inventory

### 1. Biggest space consumers in `/opt/jarvis-app-1` (119 GB total)

```
93G  underworld/         <-- 78% of repo
 73G  underworld/deploy/ue5-project/   (UE5 build artifacts)
   34G underworld/deploy/ue5-project/Saved/Cooked/Linux/...   *** REBUILDABLE ***
   32G underworld/deploy/ue5-project/Content/UnderworldAssets *** SOURCE — KEEP ***
 13G  underworld/web/public/models/generated/   (Tripo GLBs)
  8.4G  tripo/                                  *** GROWING ***
  5.4G underworld/data/   (underworld.db = 3.8G)
8.3G .git/                                       <-- 7% of repo  *** BLOATED ***
  8.2G single pack file (1.87G TTS model blob + 433M libtorch.so in history)
6.9G .venv-tts/                                   (rebuildable venv)
3.8G server/data/                                 (live data — see §3)
2.7G .venv/                                       (rebuildable venv)
407M node_modules/
132M vendor/                                      (ECC vendored snapshot)
```

### 2. JSONL streams in `server/data/` — ALL HEALTHY

| File | Size | Lines | Mod time | Read pattern | Rotation? |
|------|------|-------|----------|--------------|-----------|
| `vast_events.jsonl` | 348 KB | 1,497 | 2026-06-18 16:06 | append+tail | none — but tiny |
| `auto_improve.log.jsonl` | 109 KB | 145 | 2026-06-18 13:22 | append+tail | none |
| `action_history.jsonl` | 4.4 KB | 100 | 2026-06-18 13:46 | append+tail | none |
| `agent_audit.jsonl` | 500 B | — | 2026-06-15 | append | none |
| `assurance/events.jsonl` | 1.8 MB | — | 2026-06-18 16:05 | append+tail | none |

**Finding:** No JSONL >2 MB. No JSONL is growing >1 MB/hour. **Not a contributor to the 90% disk pressure.** Optional: add to pm2-logrotate-style cap later if any crosses 50 MB.

### 3. SQLite databases (sorted by size)

| DB | Size | Last write | WAL | Action |
|----|------|------------|-----|--------|
| `vectors.db` | **893 MB** | 06-18 12:51 | 0 | VACUUM candidate (quiet window only) |
| `brain.db` | **882 MB** | 06-18 13:57 | 0 | VACUUM candidate (quiet window only) |
| `revdb.db` | 268 MB | 06-18 12:51 | 0 | check retention |
| `documents.db` | 202 MB | 06-07 09:55 | 0 | dedupe vs `documents.db.gz` |
| `ontology.db` | 157 MB | 06-18 12:51 | 0 | check retention |
| `audit.db` | 77 MB | 06-18 15:15 | — | retention policy needed |
| `tiered_llm.db` | 17 MB | 06-18 13:28 | — | OK |
| `cloud_manifest.db` | 8.3 MB | 06-18 16:07 | — | OK |
| `net_cache.db` | 4.6 MB | 06-08 11:45 | — | stale — review |
| `tasks.db` | 2.3 MB | 06-14 10:05 | — | OK |
| `brain_research.db` | 464 KB | — | 0 | OK |
| `feedback.db` | 388 KB | 06-18 15:34 | — | OK |
| `documents.db.gz` | 69 MB | 06-09 05:22 | — | dedupe vs `documents.db` |
| (52 smaller DBs, total ~3 MB) | | | | OK |

**WAL files:** All 0 bytes — WAL is checkpointing cleanly. **No WAL bloat.**
**VACUUM history:** Unknown — SQLite doesn't expose this. Brain/vectors likely fragmented after months of writes.

### 4. PM2 logs (`~/.pm2/logs/`)

Total: **11 MB.** pm2-logrotate is configured well: `max_size=50M, retain=5, compress=true, rotateInterval=0 */6 * * *`. **Not a contributor.** No action needed.

Largest individual log: `jarvis-glb-loader-out__2026-06-09_18-00-00.log` (2.4 MB).

### 5. `/var/log/`

Total **197 MB**, journald **102 MB**.
Config (`/etc/systemd/journald.conf`): `SystemMaxUse=1G, MaxRetentionSec=7day, MaxFileSec=1day` — already capped, working as intended. Could tighten to 500M for ~50 MB savings.

### 6. `.git` repo (8.3 GB) — **CRITICAL FINDING**

Largest blobs in history:

| Size | Path |
|------|------|
| **1.87 GB** | `.venv-tts/tts_cache/.../model.pth` (XTTS model, was committed) |
| **433 MB** | `.venv-tts/.../libtorch_cpu.so` |
| **168 MB** | `.venv-tts/.../libllvmlite.so` |
| 79 MB | `world_os/catalogues/endpoint_candidates_actual_92000.csv` |
| 72 MB | `server/data/documents.db.gz` |
| 63 MB | `server/voices/en_GB-alan-medium.onnx` |
| 63 MB | `server/voices/en_GB-southern_english_female-low.onnx` |

The 1.87 GB TTS model + libtorch were committed once and live forever in the pack file. Memory note `celestial-os-layer.md` already mentions a prior `filter-branch` to remove a 1.9 GB `.venv-tts`; **this has regressed**.

**`.gitignore` audit recommended** to prevent re-introduction.

### 7. `.venv`, `.venv-tts`, `node_modules`, `vendor`

| Dir | Size | Status |
|-----|------|--------|
| `.venv-tts` | 6.9 GB | Rebuildable from `voice-clone-engine.md` recipe |
| `.git` | 8.3 GB | See §6 |
| `.venv` | 2.7 GB | Active — KEEP |
| `node_modules` | 407 MB | KEEP |
| `vendor/` | 132 MB | ECC reference snapshot — KEEP |

### 8. Docker (`docker system df`)

```
Images       1  ACTIVE 1  5.498GB  RECLAIMABLE 5.498GB (100%)
Containers   1  ACTIVE 1  199.7MB  0B
Volumes      0
Build Cache  0
```

Image: `ghcr.io/hostinger/hvps-openclaw:latest` (5.3 GB). Container `openclaw-8zfp-openclaw-1` running (5 weeks). `docker system df` flags 100% reclaimable but the openclaw container IS using it — flag is misleading because it counts unique-image-layer-not-shared-by-stopped-containers. **A `docker system prune -af` would only nuke dangling/unused, leaving the running container intact** — confirm with `docker images` before running.

---

## Categorized Actions

### Rotate / cap

- JSONL files in `server/data/` are all <2 MB — defer until any crosses 50 MB.

### Vacuum (DO NOT RUN DURING LIVE WRITES)

- `brain.db` (882 MB), `vectors.db` (893 MB), `revdb.db` (268 MB), `audit.db` (77 MB)
- Brain + vectors are written continuously; vacuum will lock — schedule in a true quiet window or use online `VACUUM INTO` followed by atomic rename.

### Prune Docker (safe, idempotent)

- `docker system prune -f` (no `-a`) first to remove dangling only. Then evaluate `-a`.

### journald cap (low risk)

- Tighten `SystemMaxUse=1G` → `500M` in `/etc/systemd/journald.conf`.

### Compress

- `repo_graph_cache.json` (1.2 GB) → gzip in place if reader supports `.gz` fallback.

### Truncate

- None — no pure-debug logs identified that nothing reads.

### Delete (rebuildable artifacts, idempotent)

- `underworld/deploy/ue5-project/Saved/Cooked/` — 34 GB, rebuildable by UE5 cook job.
- Stale `documents.db` vs `documents.db.gz` (whichever isn't authoritative).

### Destructive (require owner approval + backup)

- `git filter-repo` to strip the 1.87 GB TTS model blob + 433 MB libtorch from history. Requires force-push and breaks any active clones. Memory note `celestial-os-layer.md` confirms this was done before and regressed — **also add `.gitignore` entries for `.venv-tts/`, `**/site-packages/`, `**/tts_cache/`** before the rewrite to prevent re-bloat.

---

## Hard Rules Honored

- All inspection was READ-ONLY.
- No files deleted.
- No databases vacuumed.
- No logs truncated.
- No `/var/log/*` modifications.
- This file (`audit/power/disk-and-logs.md`) is the only write.
