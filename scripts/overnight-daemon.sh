#!/usr/bin/env bash
set -uo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# JARVIS Overnight Daemon
# ═══════════════════════════════════════════════════════════════════════════════
# Three-phase engineering loop, not just a feature factory.
#
#   Phase 1 — HEALTH:  Build check, dev server, Playwright route validation.
#                       If broken → diagnose, fix, retry. Loop until green.
#   Phase 2 — HARDEN:  Dead imports, mount verification, wiring checks,
#                       toggle collisions, ESLint. Fix what's fixable.
#   Phase 3 — BUILD:   Only after P1+P2 pass. Pick next backlog feature,
#                       implement, validate build+browser, commit+push.
#
# Usage:
#   bash scripts/overnight-daemon.sh                  # Run all 3 phases once
#   bash scripts/overnight-daemon.sh --phase 1        # Run only Phase 1
#   bash scripts/overnight-daemon.sh --phase 2        # Run only Phase 2
#   bash scripts/overnight-daemon.sh --phase 3        # Run only Phase 3
#   bash scripts/overnight-daemon.sh --loop           # Continuous loop mode
#   bash scripts/overnight-daemon.sh --loop --interval 1800  # Loop every 30min
# ═══════════════════════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs"
DAEMON_LOG="$LOG_DIR/overnight-daemon.log"
mkdir -p "$LOG_DIR" "$LOG_DIR/overnight-screenshots"

# ── Parse args ────────────────────────────────────────────────────────────────
PHASE="all"
LOOP=false
INTERVAL=3600  # default: 1 hour between loops

while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase)   PHASE="$2"; shift 2 ;;
    --loop)    LOOP=true; shift ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    *)         echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

timestamp() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
say()  { echo -e "${GREEN}[DAEMON $(timestamp)]${NC} $*" | tee -a "$DAEMON_LOG"; }
warn() { echo -e "${YELLOW}[DAEMON $(timestamp)]${NC} $*" | tee -a "$DAEMON_LOG"; }
fail() { echo -e "${RED}[DAEMON $(timestamp)]${NC} $*" | tee -a "$DAEMON_LOG"; }
info() { echo -e "${CYAN}[DAEMON $(timestamp)]${NC} $*" | tee -a "$DAEMON_LOG"; }

# ── Phase Runners ─────────────────────────────────────────────────────────────

run_phase1() {
  say "═══ PHASE 1: HEALTH & FIX ═══"
  local max_retries=3
  local attempt=0

  while [ $attempt -lt $max_retries ]; do
    attempt=$((attempt + 1))
    say "Phase 1 attempt $attempt/$max_retries"

    if node scripts/overnight-phase1-health.mjs 2>&1 | tee -a "$DAEMON_LOG"; then
      say "Phase 1: PASSED"
      return 0
    else
      warn "Phase 1: attempt $attempt failed"
      if [ $attempt -lt $max_retries ]; then
        say "Retrying Phase 1 in 10s..."
        sleep 10
      fi
    fi
  done

  fail "Phase 1: FAILED after $max_retries attempts"
  return 1
}

run_phase2() {
  say "═══ PHASE 2: HARDEN ═══"

  if node scripts/overnight-phase2-harden.mjs 2>&1 | tee -a "$DAEMON_LOG"; then
    say "Phase 2: PASSED"
    return 0
  else
    warn "Phase 2: ISSUES FOUND (see report)"
    # Phase 2 issues are non-blocking for Phase 3 — they're reported but
    # the daemon continues. Only Phase 1 (actual crashes) blocks.
    return 1
  fi
}

run_phase3() {
  say "═══ PHASE 3: FEATURE BUILD ═══"

  # Phase 3 is gated by the overnight agent (Claude), not this script.
  # This wrapper just validates prerequisites and provides the post-check.
  if [ -f scripts/overnight-phase3-feature.sh ]; then
    bash scripts/overnight-phase3-feature.sh pre 2>&1 | tee -a "$DAEMON_LOG"
    say "Phase 3: Ready for feature build. Run the overnight agent."
    say "Phase 3: After implementation, run: bash scripts/overnight-phase3-feature.sh post <feature_name>"
    return 0
  else
    warn "Phase 3: overnight-phase3-feature.sh not found"
    return 1
  fi
}

# ── Summary Reporter ──────────────────────────────────────────────────────────

write_summary() {
  local p1_status="${1:-unknown}"
  local p2_status="${2:-unknown}"
  local p3_status="${3:-unknown}"

  cat > "$LOG_DIR/overnight-daemon-summary.json" <<EOJSON
{
  "timestamp": "$(timestamp)",
  "phase1_health": "$p1_status",
  "phase2_harden": "$p2_status",
  "phase3_feature": "$p3_status",
  "branch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "head": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')",
  "reports": {
    "phase1": "logs/overnight-phase1-report.json",
    "phase2": "logs/overnight-phase2-report.json",
    "phase3": "logs/overnight-phase3-report.json"
  }
}
EOJSON
  say "Summary written to $LOG_DIR/overnight-daemon-summary.json"
}

# ── Main Execution ────────────────────────────────────────────────────────────

run_cycle() {
  say "╔═══════════════════════════════════════════════════════════════╗"
  say "║  JARVIS OVERNIGHT DAEMON — $(timestamp)             ║"
  say "║  Branch: $(git branch --show-current 2>/dev/null || echo '?')  HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo '?')  ║"
  say "╚═══════════════════════════════════════════════════════════════╝"

  local p1="skip" p2="skip" p3="skip"

  # Phase 1
  if [ "$PHASE" = "all" ] || [ "$PHASE" = "1" ]; then
    if run_phase1; then
      p1="pass"
    else
      p1="fail"
      if [ "$PHASE" = "all" ]; then
        fail "Phase 1 failed — skipping Phase 3 (feature build)"
        fail "Phase 2 (harden) will still run for diagnostics"
      fi
    fi
  fi

  # Phase 2
  if [ "$PHASE" = "all" ] || [ "$PHASE" = "2" ]; then
    if run_phase2; then
      p2="pass"
    else
      p2="issues"
    fi
  fi

  # Phase 3 (only if Phase 1 passed or running standalone)
  if [ "$PHASE" = "3" ] || ([ "$PHASE" = "all" ] && [ "$p1" = "pass" ]); then
    if run_phase3; then
      p3="ready"
    else
      p3="fail"
    fi
  fi

  write_summary "$p1" "$p2" "$p3"

  say "══════════════════════════════════════"
  say "  Phase 1 (Health):  $p1"
  say "  Phase 2 (Harden):  $p2"
  say "  Phase 3 (Feature): $p3"
  say "══════════════════════════════════════"
}

if [ "$LOOP" = true ]; then
  say "Starting continuous daemon mode (interval: ${INTERVAL}s)"
  while true; do
    run_cycle
    say "Next cycle in ${INTERVAL}s ($(date -u -d "+${INTERVAL} seconds" +%H:%M:%S 2>/dev/null || echo '?'))..."
    sleep "$INTERVAL"
  done
else
  run_cycle
fi
