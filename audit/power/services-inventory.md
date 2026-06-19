# Services & Scheduled Tasks Inventory — Power Audit

**Date:** 2026-06-18
**Host:** /opt/jarvis-app-1
**Mode:** READ-ONLY (no services were stopped, killed, or modified)

---

## Section 1 — pm2 Services

### 1a. Stopped / Dead

| ID | Name | Script | Status | Restarts | Verdict | Recommendation | Savings |
|----|------|--------|--------|----------|---------|----------------|---------|
| 1 | `kgik-python` | `/opt/kgik/vast_dispatch.py` | **stopped** | 0 | **DROP** — `/opt/kgik` only referenced in stale `ecosystem.config.cjs`, `netlify.toml`, and old HTML backup. No live caller. Hardcoded `VAST_API_KEY` in source (security smell). | `pm2 delete kgik-python` and consider archiving `/opt/kgik`. | Reclaims pm2 slot + dump-file noise |
| 12 | `openclaw-gateway` | `scripts/openclaw_gateway_runner.sh` | **stopped** | **3561** | **DROP** — wraps `docker exec openclaw-8zfp-openclaw-1 openclaw gateway`; the container/binary is gone (the 3561 restarts proved it can't start). The actual gateway is now running under **PID 1440554 (user `ubuntu`, 3d 14h)** — that orphan process is the real gateway and is *not under pm2 supervision*. | `pm2 delete openclaw-gateway`. Decide separately whether the orphan `ubuntu` process should be brought back under supervision or terminated. | Removes 3561-restart noise from `pm2 list`; recovers slot |

### 1b. Online — Right-sized & Keep

| ID | Name | Mem | Purpose | Verdict |
|----|------|-----|---------|---------|
| 0 | `pm2-logrotate` | 69 MB | Rotates pm2 logs (50MB cap, retain 5, every 6h) | KEEP |
| 3 | `apex-orchestrator` | 33 MB | Fires kgik.base44.app webhook pipelines on a 10/30/60/180s schedule | KEEP (but see security note below) |
| 8 | `jarvis-tasks` | 14 MB | Durable task daemon | KEEP |
| 10 | `jarvis-watchdog` | 23 MB | Pings 3 critical HTTP endpoints every 15s, restarts on hang | KEEP — this is the only hang-detector |
| 14 | `jarvis-frontend` | 77 MB | `vite preview` static frontend on :5173 | KEEP |
| 15 | `underworld-web` | 51 MB | `vite preview` underworld on :5180 | KEEP |
| 13 | `ollama-claw-bridge` | 4 MB | socat 172.19.0.1:11435 → 127.0.0.1:11434 (Docker → Ollama) | KEEP — tiny, used by tiered_llm/repo_graph |
| 23 | `vast-kill-switch` | 22 MB | Polls Vast every 30s, destroys non-whitelisted GPU boxes spawned by external kgik service | KEEP — cost-control critical |
| 25 | `burst-watcher` | 22 MB | SSH-polls Vast burst instances every 60s for `/workspace/.done` | KEEP |
| 22 | `brain-watchdog` | 23 MB | Detects Vast brain box state, writes brain_health.json | KEEP |
| 11 | `openclaw-bridge` | 59 MB | Bridges to OpenClaw provider used by tiered_llm and repo_graph | KEEP — has real consumers |

### 1c. Online — Likely Right-sized but FLAG

| ID | Name | Mem | Restarts | Notes | Recommendation |
|----|------|-----|----------|-------|----------------|
| 6 | `jarvis-backend` | 298 MB | 5 | uvicorn on :8001 — main FastAPI app | KEEP — 5 restarts on a fresh 44min uptime is borderline flapping; investigate next failure |
| 5 | `underworld-backend` | 227 MB | 1 | uvicorn on :8091 | KEEP |
| 9 | `jarvis-voiceclone` | **2.5 GB** | 0 | XTTS clone service on :8097 | KEEP — large but expected (PyTorch model loaded). |
| 21 | `jarvis-glb-loader` | 3.4 MB | 0 | Idle bash loop checking for missing GLB previews/conversions; sleeps 30min between cycles | KEEP — near-zero footprint. Could be a cron instead of pm2, but cost saving is negligible. |
| 16 | `ollama-cpu` | 30 MB | 0 | `ollama serve` bound 127.0.0.1:11435 (CPU mode) — supervisor only; child workers spawn on demand | KEEP |
| 19 | `lessons-distiller` | 14 MB | 0 | Mines `tiered_llm.db` for routing patterns | KEEP |

### 1d. Online — HIGH-RISK / WASTE

| ID | Name | Mem | Issue | Recommendation | Savings |
|----|------|-----|-------|----------------|---------|
| 7 | `jarvis-dashboard` | **5.2 GB** | Single Python process consuming 5.2 GB resident — **16.6% of total system RAM**. Running since 08:08 with ~61 CPU-minutes. No restart limit visible. Likely a memory leak (long-lived numpy/embedding caches not bounded) or accumulated in-process index. | **INVESTIGATE FIRST** — capture heap snapshot, then add `--max-memory-restart 2G` to pm2 config. Most impactful waste finding on the box. | **~3 GB RAM** reclaimable with periodic restart |
| 2 | `laravel-web` | 54 MB | `php artisan serve` on :8000 for `/opt/solar-flow2` (solar inverter app); spawns 7 sub-processes | KEEP IF solar mini-app is live; OTHERWISE STOP. The solar-flow2 references in JARVIS are mostly stub paths. | ~150 MB across PHP children |
| 4 | `laravel-reverb` | 60 MB | WebSocket server on :8081 for same solar-flow2 app | Same as ID 2 — coupled. STOP TOGETHER. | ~60 MB |

### 1e. Untracked Orphan

- **PID 1440554** — `openclaw-gateway` (user `ubuntu`), uptime 3d 14h, 525 MB RSS. Not in pm2. Likely the real gateway that the broken pm2 entry (ID 12) was meant to wrap. **Flag for owner**: bring under supervision or terminate; pick one.

---

## Section 2 — Crontabs

### 2a. Root crontab

| Schedule | Command | Verdict |
|----------|---------|---------|
| `*/10 * * * *` | `apex_orchestrator.py` (one-shot) | **DUPLICATE** — pm2 ID 3 already runs `apex_orchestrator.py --daemon` continuously. The cron one-shot fires every 10 min on top. **DROP the cron entry** OR drop the pm2 service — pick one model. Savings: ~6 spurious launches/hour. |
| `*/30 * * * *` | `jarvis-disk-guard` | KEEP — allowlist-only reclaim |
| `@reboot` | `pm2 resurrect` | KEEP |
| `@reboot` | `curl /gpu/brain_check` after 30s | KEEP |
| `0 */6 * * *` | `find /tmp -mtime +1 -type f -delete` | KEEP (tiny) |

### 2b. /etc/cron.d/

| File | Schedule | Verdict |
|------|----------|---------|
| `docker-image-prune` | daily 00:26 — `docker image prune -af --filter "until=24h"` | KEEP |
| `sysstat` | every 10 min + daily | KEEP (Ubuntu default, tiny) |
| `certbot` | every 12h (no-op on systemd hosts → covered by `certbot.timer`) | **REDUNDANT** with `certbot.timer`. Harmless because the entry self-skips when `/run/systemd/system` exists. NOTE only. |
| `php` | every 30 min (no-op on systemd hosts → covered by `phpsessionclean.timer`) | Same — harmless skip. NOTE. |
| `e2scrub_all` | weekly | KEEP |

### 2c. Ubuntu crontab

Empty. None.

---

## Section 3 — Systemd Timers (19 total)

All standard Ubuntu maintenance timers — `apt-daily`, `apt-daily-upgrade`, `logrotate`, `man-db`, `motd-news`, `fwupd-refresh`, `update-notifier-*`, `sysstat-*`, `phpsessionclean`, `dpkg-db-backup`, `systemd-tmpfiles-clean`, `fstrim`, `e2scrub_all`, `certbot`. **KEEP ALL** — no JARVIS-installed timer exists at the systemd layer.

Optional NOTE: `motd-news.timer` is purely cosmetic; mask if you want. Negligible.

---

## Section 4 — Harness Scheduled Jobs

No `cron-*.json`, `schedule-*.json`, `routines/`, or `cron/` directory under `/root/.claude/`. No ScheduleWakeup/CronCreate persistent jobs found. Nothing to remove.

---

## Section 5 — Other Long-Running Processes (not in pm2)

| PID | Owner | Process | Verdict |
|-----|-------|---------|---------|
| 1063 | root | `code-server` (1.15 GB) | Owner uses for dev. KEEP. |
| 3213525 | root | `claude` extension host (440 MB) | Active session. KEEP. |
| 1440554 | ubuntu | `openclaw-gateway` (orphan, 525 MB) | See 1e — needs decision. |
| 3120563 | root | `migrate_to_wasabi.py --apply --prune` (running 2h+) | Migration job in progress; KEEP. |

---

## Section 6 — Security finding (out of scope but flagged)

`/root/apex_env.sh` contains a **plaintext OpenAI API key** and `VPS_SECRET`. It is `chmod 644` readable. Rotate immediately and move to `.env` with 600 perms. Also `/opt/kgik/vast_dispatch.py` has a hardcoded `VAST_API_KEY`.

---

## TOP 10 WASTE CANDIDATES — Ranked by Savings

| Rank | Item | Action | Estimated Savings |
|------|------|--------|-------------------|
| 1 | `jarvis-dashboard` (ID 7) — 5.2 GB resident | Investigate leak; add `--max-memory-restart 2G` | **~3 GB RAM** |
| 2 | `laravel-web` + `laravel-reverb` (IDs 2,4) if solar-flow2 unused | Stop both | **~200 MB RAM** + 9 PHP processes |
| 3 | Orphan `openclaw-gateway` PID 1440554 | Bring under pm2 or kill | **525 MB RAM** if killed |
| 4 | `openclaw-gateway` pm2 entry (ID 12) — 3561 failed restarts | `pm2 delete` | List hygiene, log noise |
| 5 | `kgik-python` pm2 entry (ID 1) — dead service | `pm2 delete` | List hygiene |
| 6 | **Duplicate apex orchestration** — pm2 daemon + */10min cron | Remove cron line | 6 wasted spawns/hr |
| 7 | `jarvis-backend` (ID 6) — 5 restarts in 44 min | Investigate flap cause | Stability, not RAM |
| 8 | `jarvis-glb-loader` (ID 21) — pm2 for a sleeping bash loop | Move to systemd timer / cron @30m | Marginal |
| 9 | `certbot` cron in /etc/cron.d/ duplicates `certbot.timer` | Note only — self-skips | None measurable |
| 10 | `php` cron in /etc/cron.d/ duplicates `phpsessionclean.timer` | Note only — self-skips | None measurable |

---

## Summary

- **22 pm2 services**, **2 dead** (kgik-python, openclaw-gateway). Both safe to `pm2 delete`.
- **1 huge memory hog**: `jarvis-dashboard` at 5.2 GB — by far the most impactful finding.
- **1 confirmed duplication**: apex orchestrator runs both as pm2 daemon AND as a */10 min cron.
- **1 orphan process** outside pm2 supervision: `openclaw-gateway` (ubuntu user, 525 MB).
- **No systemd timers** to prune; all are Ubuntu defaults.
- **No Claude harness cron entries** found.
- **Security**: rotate OpenAI key in `/root/apex_env.sh` and VAST key in `/opt/kgik/vast_dispatch.py`.
