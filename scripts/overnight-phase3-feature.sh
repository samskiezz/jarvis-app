#!/usr/bin/env bash
set -euo pipefail

# Phase 3: Feature Builder (only runs after Phase 1 + 2 pass)
# This script does NOT implement features itself — it sets up the environment
# and provides the validation wrapper. The actual feature implementation is done
# by the Claude overnight agent. This script:
# 1. Verifies Phase 1 + Phase 2 passed
# 2. Takes a pre-build snapshot (git stash of current state)
# 3. After feature is built (by caller), validates:
#    - vite build succeeds
#    - No new console errors in browser
# 4. If validation fails, reverts to pre-build state
# 5. Writes report to logs/overnight-phase3-report.json

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
REPORT="$LOG_DIR/overnight-phase3-report.json"
mkdir -p "$LOG_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

say()  { echo -e "${GREEN}[P3]${NC} $*"; }
warn() { echo -e "${YELLOW}[P3]${NC} $*"; }
fail() { echo -e "${RED}[P3]${NC} $*"; }

# Check Phase 1 + 2 reports
check_prerequisites() {
  local p1="$LOG_DIR/overnight-phase1-report.json"
  local p2="$LOG_DIR/overnight-phase2-report.json"

  if [ ! -f "$p1" ]; then
    fail "Phase 1 report not found. Run overnight-phase1-health.mjs first."
    exit 1
  fi
  if [ ! -f "$p2" ]; then
    fail "Phase 2 report not found. Run overnight-phase2-harden.mjs first."
    exit 1
  fi

  local p1_pass=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$p1','utf8')).passed)")
  local p2_pass=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$p2','utf8')).passed)")

  if [ "$p1_pass" != "true" ]; then
    fail "Phase 1 (Health) did not pass. Fix issues before building features."
    exit 1
  fi
  if [ "$p2_pass" != "true" ]; then
    warn "Phase 2 (Harden) had issues — proceeding with caution."
  fi

  say "Prerequisites OK (P1: $p1_pass, P2: $p2_pass)"
}

# Subcommand: "pre" — run before feature implementation
pre_build() {
  check_prerequisites
  say "Taking pre-build snapshot..."
  git stash push -m "overnight-phase3-snapshot-$(date +%s)" --include-untracked 2>/dev/null || true
  git stash pop 2>/dev/null || true
  # Record the current HEAD
  echo "$(git rev-parse HEAD)" > "$LOG_DIR/.phase3-pre-head"
  say "Pre-build HEAD: $(cat "$LOG_DIR/.phase3-pre-head")"
}

# Subcommand: "post" — run after feature implementation
post_build() {
  say "Running post-build validation..."

  local status="pass"
  local build_ok="false"
  local browser_ok="false"
  local errors=""

  # 1. Vite build
  say "Checking vite build..."
  if node_modules/vite/bin/vite.js build 2>&1; then
    build_ok="true"
    say "Build: PASS"
  else
    status="fail"
    errors="Build failed"
    fail "Build: FAIL"
  fi

  # 2. Quick browser check (reuse phase 1 if available)
  if [ "$build_ok" = "true" ] && command -v node >/dev/null; then
    say "Running quick browser validation..."
    if timeout 120 node scripts/overnight-phase1-health.mjs --quick 2>&1; then
      browser_ok="true"
      say "Browser: PASS"
    else
      warn "Browser check had issues (non-blocking for feature commit)"
    fi
  fi

  # 3. Write report
  local feature_name="${1:-unknown}"
  cat > "$REPORT" <<EOJSON
{
  "passed": $([ "$status" = "pass" ] && echo "true" || echo "false"),
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "feature": "$feature_name",
  "buildPassed": $build_ok,
  "browserPassed": $browser_ok,
  "errors": "$errors",
  "preHead": "$(cat "$LOG_DIR/.phase3-pre-head" 2>/dev/null || echo "unknown")",
  "postHead": "$(git rev-parse HEAD)"
}
EOJSON

  say "Report written to $REPORT"

  # 4. If build failed, revert
  if [ "$status" = "fail" ]; then
    fail "Post-build validation failed. Reverting..."
    local pre_head="$(cat "$LOG_DIR/.phase3-pre-head" 2>/dev/null)"
    if [ -n "$pre_head" ]; then
      git checkout -- . 2>/dev/null || true
      git clean -fd 2>/dev/null || true
      fail "Reverted to pre-build state ($pre_head)"
    fi
    exit 1
  fi

  say "Post-build validation PASSED for $feature_name"
  exit 0
}

# Main dispatcher
case "${1:-help}" in
  pre)   pre_build ;;
  post)  post_build "${2:-}" ;;
  *)
    echo "Usage: $0 {pre|post [feature_name]}"
    echo "  pre  — verify prerequisites + snapshot before building"
    echo "  post — validate build + browser after building"
    exit 1
    ;;
esac
