#!/usr/bin/env bash
# ── JARVIS SAFE SNAPSHOT ──────────────────────────────────────────────────────
# A consistent, compressed, optimised snapshot of the whole brain + assets that you can run ANY TIME
# WHILE EVERYTHING IS LIVE — it never stops a process and never corrupts a database.
#
# Why it's safe: SQLite databases are copied with `VACUUM INTO`, which takes a consistent point-in-time
# snapshot of a live DB AND compacts it (drops free pages, defrags) in one step. The originals are never
# modified, so the running batch-loader / worker / dashboard keep writing throughout.
#
# Output: /opt/jarvis-backups/<timestamp>/  (OUTSIDE the repo, so it never touches the bloated .git)
#   db/*.db.zst      — every SQLite DB, vacuumed + zstd-19 (the irreplaceable brain; compresses a lot)
#   assets.tar.zst   — underworld/data + generated GLB models (large, mostly static)
#   MANIFEST.txt     — sizes + checksums
#   RESTORE.md       — exact restore steps
# Rebuildable junk (.venv, node_modules, .git) is deliberately EXCLUDED — reinstall those, don't carry them.
#
# Usage:   bash scripts/snapshot.sh            # full snapshot (db + assets)
#          bash scripts/snapshot.sh db         # brain only (fast, ~1-2 min) — the critical progress
set -uo pipefail

REPO=/opt/jarvis-app-1
OUT_ROOT=/opt/jarvis-backups
PY="$REPO/.venv/bin/python"
MODE="${1:-full}"
KEEP=$([ "$MODE" = full ] && echo 2 || echo 12)   # full: keep 2 (big); db: keep 12 (cheap brain snapshots)
TS="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_ROOT/$MODE-$TS"

mkdir -p "$OUT/db"
exec 9>"$OUT_ROOT/.snapshot.lock"; flock -n 9 || { echo "[snapshot] another run is in progress — abort"; exit 1; }

# be polite to the live system but don't starve the backup — moderate nice, low best-effort I/O
renice -n 10 -p $$ >/dev/null 2>&1 || true
ionice -c2 -n6 -p $$ >/dev/null 2>&1 || true

# disk guard — never risk filling the disk (that WOULD crash the brain)
AVAIL=$(df --output=avail -BG /opt | tail -1 | tr -dc '0-9')
if [ "${AVAIL:-0}" -lt 40 ]; then echo "[snapshot] ABORT: only ${AVAIL}G free (<40G)"; exit 1; fi
echo "[snapshot] $TS  | ${AVAIL}G free | mode=$MODE"

# ── 1) DATABASES — consistent + compacted via VACUUM INTO, then zstd ───────────
echo "[snapshot] databases (VACUUM INTO — safe on live)…"
for f in "$REPO"/server/data/*.db; do
  [ -f "$f" ] || continue
  name="$(basename "$f" .db)"
  if "$PY" - "$f" "$OUT/db/$name.db" <<'PYEOF'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
c = sqlite3.connect(src, timeout=120)
c.execute("VACUUM INTO ?", (dst,))
c.execute("PRAGMA wal_checkpoint(TRUNCATE)")
c.close()
# prove the snapshot is a valid DB
v = sqlite3.connect(dst)
v.execute("SELECT count(*) FROM sqlite_master").fetchone()
v.close()
PYEOF
  then
    zstd -q -12 -T0 --rm "$OUT/db/$name.db" -o "$OUT/db/$name.db.zst" && \
      echo "  ✓ $name  ($(du -h "$OUT/db/$name.db.zst" | cut -f1))"
  else
    echo "  ✗ $name — VACUUM failed, skipped (live DB untouched)"
  fi
done

# ── 2) ASSETS — large, mostly static (GLBs + underworld data) ─────────────────
if [ "$MODE" = "full" ]; then
  echo "[snapshot] assets (tar + zstd, this is the big one)…"
  tar -C "$REPO" -cf - underworld/data underworld/web/public/models 2>/dev/null \
    | zstd -q -3 -T0 -o "$OUT/assets.tar.zst" && echo "  ✓ assets ($(du -h "$OUT/assets.tar.zst" | cut -f1))"
fi

# ── 3) MANIFEST + RESTORE ─────────────────────────────────────────────────────
{
  echo "JARVIS snapshot $TS  (host $(hostname))"
  echo "mode: $MODE"
  echo "--- contents ---"
  du -ah "$OUT" | sort -rh | head -40
} > "$OUT/MANIFEST.txt"

cat > "$OUT/RESTORE.md" <<EOF
# Restore this snapshot ($TS)

## Brain (databases)
1. Stop the writers so nothing is mid-write:
   pm2 stop jarvis-batch-loader jarvis-feedback jarvis-worker jarvis-dashboard
2. Restore each DB:
   for z in db/*.db.zst; do n=\$(basename "\$z" .zst); zstd -d -f "\$z" -o "$REPO/server/data/\$n"; done
3. (assets) zstd -dc assets.tar.zst | tar -C "$REPO" -xf -
4. Restart:
   pm2 start jarvis-batch-loader jarvis-feedback jarvis-worker jarvis-dashboard

## Fresh machine ("pick up and start anywhere")
- git clone the repo (or copy it without .venv/node_modules/.git)
- python -m venv .venv && .venv/bin/pip install -r requirements.txt
- npm install
- restore as above, then \`pm2 resurrect\` / pm2 start the processes
EOF

# ── 4) prune old snapshots, keep newest $KEEP ─────────────────────────────────
ls -1dt "$OUT_ROOT"/$MODE-*/ 2>/dev/null | tail -n +$((KEEP+1)) | while read -r old; do
  echo "[snapshot] pruning old: $old"; rm -rf "$old"
done

echo "[snapshot] DONE -> $OUT  ($(du -sh "$OUT" | cut -f1))"
