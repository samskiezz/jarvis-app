#!/usr/bin/env bash
# infra/backup.sh — snapshot ALL the knowledge/state so it's safe + restorable.
# The databases are gitignored (too big + churny for git), so this is how the
# billion-dollar knowledge is backed up: every *.db gzipped into a timestamped
# tarball under infra/backups/ (and optionally pushed to a remote via BACKUP_REMOTE).
#
#   bash infra/backup.sh                 # local snapshot
#   BACKUP_REMOTE=user@host:/backups bash infra/backup.sh   # + rsync offsite
#   bash infra/backup.sh restore <tarball>                  # restore a snapshot
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/infra/backups"
mkdir -p "$DEST"

if [ "${1:-}" = "restore" ]; then
  TAR="${2:?usage: backup.sh restore <tarball>}"
  echo "Restoring $TAR …"; tar -xzf "$TAR" -C "$ROOT"; echo "restored."; exit 0
fi

STAMP="$(date -u +%Y%m%d-%H%M%S 2>/dev/null || echo snapshot)"
OUT="$DEST/jarvis-knowledge-$STAMP.tar.gz"

# everything stateful: JARVIS dbs, underworld dbs, brain/vectors/enrich/docs, catalogs.
tar -czf "$OUT" \
  --ignore-failed-read \
  -C "$ROOT" \
  server/data \
  underworld/data \
  underworld/web/public/models/asset_catalog.json \
  2>/dev/null || true

SZ="$(du -h "$OUT" 2>/dev/null | awk '{print $1}')"
echo "backup -> $OUT ($SZ)"

# keep the 7 most recent local snapshots
ls -1t "$DEST"/jarvis-knowledge-*.tar.gz 2>/dev/null | tail -n +8 | xargs -r rm -f

if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "offsite -> $BACKUP_REMOTE"
  rsync -az "$OUT" "$BACKUP_REMOTE/" 2>/dev/null || scp "$OUT" "$BACKUP_REMOTE/" 2>/dev/null || echo "  (remote copy failed)"
fi
