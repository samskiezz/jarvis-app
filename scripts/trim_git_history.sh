#!/usr/bin/env bash
# ── TRIM GIT BLOAT (reclaim ~6 GB of committed binaries from .git history) ─────────────────────────
# SAFE BY DESIGN — run this in a CALM window (low load), NOT while the box is slammed.
#
# What it does, in order:
#   1. DRY RUN unless you pass CONFIRM=yes  (so it can never fire by accident)
#   2. refuses on a dirty working tree (a rewrite must not risk uncommitted work)
#   3. backs up the ENTIRE .git to /opt/jarvis-backups first (fully reversible)
#   4. UNTRACKS the big binary dirs (git rm --cached) — your files STAY ON DISK, just no longer in git
#   5. gitignores them so the bloat never comes back
#   6. git-filter-repo strips them from ALL past history (working files are untracked now → preserved)
#   7. repacks .git
#
# Your data is safe regardless: working files are kept, .git is backed up, and GitHub still holds the
# full old history until YOU choose to force-push (the last step is printed, not executed).
#
# Usage:  bash scripts/trim_git_history.sh            # dry run — shows what it will do
#         CONFIRM=yes bash scripts/trim_git_history.sh   # execute (calm window only)
set -euo pipefail
REPO=/opt/jarvis-app-1
cd "$REPO"

echo "== git bloat trim =="
echo "current .git size: $(du -sh .git | cut -f1)"
LOAD=$(cut -d' ' -f1 /proc/loadavg)
echo "current load: $LOAD  (recommend < 4 before running)"

if [ "${CONFIRM:-no}" != "yes" ]; then
  echo
  echo "DRY RUN — nothing changed. To execute (in a calm window): CONFIRM=yes bash scripts/trim_git_history.sh"
  echo "It will untrack + purge these from history (files kept on disk):"
  echo "   underworld/web/public/models   server/data   ontology/world_pack/catalogues"
  exit 0
fi

# 1) safety: clean tree
if [ -n "$(git status --porcelain)" ]; then
  echo "ABORT: working tree is dirty — commit or stash first so nothing is lost:"; git status --short | head
  exit 1
fi

# 2) back up .git (reversible)
BK="/opt/jarvis-backups/git-backup-$(date +%Y%m%d-%H%M%S).tar.zst"
echo "backing up .git -> $BK"
nice -n 15 ionice -c3 tar -C "$REPO" -cf - .git | zstd -q -10 -T0 -o "$BK"

# 3) untrack the big dirs (KEEP the files on disk)
for p in underworld/web/public/models server/data ontology/world_pack/catalogues; do
  git rm -r --cached --quiet "$p" 2>/dev/null || true
done

# 4) gitignore so they never re-bloat
printf '%s\n' \
  'underworld/web/public/models/' \
  'server/data/*.db' 'server/data/*.db-*' 'server/data/*.db.gz' \
  'ontology/world_pack/catalogues/*.csv' >> .gitignore
git add .gitignore
git commit -q -m "chore: stop tracking large binaries (kept on disk, backed up via snapshot)"

# 5) ensure git-filter-repo is available
command -v git-filter-repo >/dev/null 2>&1 || "$REPO/.venv/bin/pip" install -q git-filter-repo
export PATH="$REPO/.venv/bin:$PATH"

# 6) strip from ALL history — working files are untracked now, so they are NOT deleted
nice -n 15 ionice -c3 git filter-repo --force \
  --path underworld/web/public/models \
  --path server/data \
  --path ontology/world_pack/catalogues \
  --invert-paths

# 7) repack
git reflog expire --expire=now --all
nice -n 15 git gc --prune=now

echo
echo "DONE. New .git size: $(du -sh .git | cut -f1)   (backup at $BK)"
echo "filter-repo removed the 'origin' remote as a safety measure."
echo "To publish the slimmed history (THIS REWRITES YOUR GITHUB — only when you're ready):"
echo "  git remote add origin https://github.com/samskiezz/jarvis-app.git"
echo "  git push --force origin main"
