#!/usr/bin/env bash
# Set up the ECC plugin-root symlink so the hooks in .claude/settings.json fire.
# Idempotent — safe to run any number of times.
#
# The ECC hooks (PreToolUse, PostToolUse, Stop, SessionStart, etc.) bootstrap
# themselves by searching for ~/.claude/plugins/ecc/scripts/lib/utils.js. We
# satisfy that by symlinking ~/.claude/plugins/ecc -> ./vendor/ecc (the
# vendored ECC snapshot already committed to this repo).
#
# Run this once after `git clone`. The Jarvis bootstrap may already do this
# for you; safe to call regardless.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ECC_VENDOR="$REPO_ROOT/vendor/ecc"
LINK="$HOME/.claude/plugins/ecc"

if [[ ! -d "$ECC_VENDOR" ]]; then
  echo "error: vendor/ecc not found at $ECC_VENDOR — run from inside a checked-out jarvis-app repo" >&2
  exit 1
fi

mkdir -p "$(dirname "$LINK")"

# If the link already points to the right place, do nothing
if [[ -L "$LINK" ]] && [[ "$(readlink -f "$LINK")" == "$(readlink -f "$ECC_VENDOR")" ]]; then
  echo "ECC plugin-root symlink already set up: $LINK -> $ECC_VENDOR"
  exit 0
fi

# If something else is at the path, refuse — never delete owner state
if [[ -e "$LINK" ]] && [[ ! -L "$LINK" ]]; then
  echo "error: $LINK exists and is not a symlink — refusing to overwrite" >&2
  echo "       inspect manually and move it aside if you want this setup to proceed" >&2
  exit 2
fi

ln -sfn "$ECC_VENDOR" "$LINK"
echo "linked: $LINK -> $ECC_VENDOR"

# Sanity check: the bootstrap loads
if node -e "require('$LINK/scripts/lib/utils.js')" 2>/dev/null; then
  echo "verified: ECC bootstrap loads"
else
  echo "warning: ECC bootstrap failed to load — check node version (need 18+)" >&2
fi
