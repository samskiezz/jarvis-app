#!/usr/bin/env bash
# setup.sh — install the COMPLETE runtime environment, idempotently.
#
# Everything the app needs to actually run end-to-end on a fresh / recreated box:
#   1. Python deps        — server/requirements.txt
#   2. Node deps          — npm (ROBUST: repairs a missing OR broken node_modules)
#   3. Go toolchain       — needed to install the scraper's discovery binaries
#   4. Scraper binaries   — katana (the document-finder's URL discovery), httpx,
#                           ffuf, kr — `go install`ed into ~/go/bin (NOT in git, so
#                           a recreated instance loses them → scraper finds 0 docs)
#   5. Ollama (optional)  — local GPU LLM
#
# Safe to run on EVERY boot: each step is guarded, so an already-complete box is a
# fast no-op. Never aborts the boot — best-effort; the app still starts if an
# optional tool can't install (the scraper just degrades to fewer engines).
#
# Knobs: SKIP_SETUP=1 (bypass), SETUP_OLLAMA=0 (don't install Ollama),
#        SETUP_GO_TOOLS=0 (don't install the Go scraper binaries).
set -uo pipefail
cd "$(dirname "$0")"; ROOT="$PWD"
LOG="${SETUP_LOG:-/tmp/jarvis-setup}"; mkdir -p "$LOG"
say(){ printf '\033[36m[setup]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[setup]\033[0m %s\n' "$*"; }

# Where `go install` drops binaries — must be on PATH for the backend to find them.
export GOBIN="${GOBIN:-$HOME/go/bin}"
export PATH="$GOBIN:$PATH"
mkdir -p "$GOBIN"

# ── 1. Python ──────────────────────────────────────────────────────────────────
say "1/5 python deps (server/requirements.txt)…"
python3 -m pip install -q --upgrade pip 2>>"$LOG/pip.log" || true
python3 -m pip install -q -r server/requirements.txt 2>>"$LOG/pip.log" \
  && say "    python deps ✓" || warn "    pip issues (see $LOG/pip.log)"

# ── 2. Node (robust: install if missing, REPAIR if broken/partial) ─────────────
say "2/5 node deps…"
need_npm=1
if [ -d node_modules ]; then
  # a present-but-broken node_modules is the usual 'npm wtf': verify it can resolve
  # the build toolchain; if not, reinstall.
  if npm ls vite >/dev/null 2>&1; then need_npm=0; say "    node_modules ok ✓"; fi
fi
if [ "$need_npm" = 1 ]; then
  say "    installing node deps (clean)…"
  if [ -f package-lock.json ] && npm ci >"$LOG/npm.log" 2>&1; then
    say "    npm ci ✓"
  elif npm install >"$LOG/npm.log" 2>&1; then
    say "    npm install ✓"
  else
    warn "    npm failed (see $LOG/npm.log)"
  fi
fi

# ── 3. Go toolchain (to install the scraper's discovery binaries) ──────────────
if [ "${SETUP_GO_TOOLS:-1}" = "1" ]; then
  say "3/5 go toolchain…"
  if ! command -v go >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      say "    installing go + build tools (apt)…"
      (apt-get update -qq && apt-get install -y -qq golang-go gcc build-essential) \
        >>"$LOG/go.log" 2>&1 || warn "    apt install go failed (see $LOG/go.log)"
    else
      warn "    go missing and no apt-get — install Go manually for the scraper binaries"
    fi
  fi

  # ── 4. Scraper / recon binaries (katana = the document finder's discovery) ───
  if command -v go >/dev/null 2>&1; then
    say "4/5 scraper binaries → $GOBIN …"
    _go_get(){  # name  module
      if command -v "$1" >/dev/null 2>&1; then say "    $1 ✓ (present)"; return; fi
      say "    installing $1…"
      if GOBIN="$GOBIN" GOFLAGS=-mod=mod go install "$2" >>"$LOG/go.log" 2>&1; then
        say "    $1 ✓"
      else
        warn "    $1 failed (see $LOG/go.log) — that engine will be unavailable"
      fi
    }
    _go_get katana github.com/projectdiscovery/katana/cmd/katana@latest
    _go_get httpx  github.com/projectdiscovery/httpx/cmd/httpx@latest
    _go_get ffuf   github.com/ffuf/ffuf/v2@latest
    _go_get kr     github.com/assetnote/kiterunner@latest
  else
    warn "4/5 scraper binaries: SKIPPED (no go) — discovery (katana) unavailable"
  fi
  # Persist ~/go/bin on PATH for future shells (so a manual run finds katana too).
  for rc in "$HOME/.profile" "$HOME/.bashrc"; do
    [ -f "$rc" ] || continue
    grep -q 'go/bin' "$rc" 2>/dev/null || echo 'export PATH="$HOME/go/bin:$PATH"' >>"$rc"
  done
else
  say "3-4/5 go scraper binaries: skipped (SETUP_GO_TOOLS=0)"
fi

# ── 5. Ollama (optional local GPU LLM) ─────────────────────────────────────────
if [ "${SETUP_OLLAMA:-1}" = "1" ]; then
  if command -v ollama >/dev/null 2>&1; then
    say "5/5 ollama ✓ (present)"
  else
    say "5/5 installing ollama…"
    curl -fsSL https://ollama.com/install.sh 2>/dev/null | sh >>"$LOG/ollama.log" 2>&1 \
      && say "    ollama ✓" || warn "    ollama install skipped (see $LOG/ollama.log)"
  fi
else
  say "5/5 ollama: skipped (SETUP_OLLAMA=0)"
fi

echo
say "environment ready · katana=$(command -v katana 2>/dev/null || echo MISSING) · node=$(node -v 2>/dev/null || echo MISSING) · logs in $LOG/"
