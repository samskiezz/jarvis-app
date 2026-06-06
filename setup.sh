#!/usr/bin/env bash
# setup.sh — install the COMPLETE runtime environment, idempotently.
#
# Everything the app needs to actually run end-to-end on a fresh / recreated box, so
# the toolchain is NEVER lost when an instance is recreated:
#   1. System packages   — build tools, tesseract-ocr + poppler (OCR), Go
#   2. Python deps        — server/requirements.txt  + heavy OCR/browser engines
#                           (easyocr/paddleocr run on the GPU; undetected-chromedriver,
#                            botasaurus, arjun)
#   3. Node deps          — npm (ROBUST: repairs a missing OR broken node_modules) +
#                           the JS scraping/OCR extras (installed --no-save so they
#                           live on the box without touching package.json / CI)
#   4. Scraper binaries   — katana (the document-finder's URL discovery), httpx, ffuf,
#                           kr; GOVERNED recon: nuclei (+templates). All gated by
#                           RECON_ALLOWLIST in-app (your own/authorised assets only).
#   5. Ollama (optional)  — local GPU LLM
#
# Safe to run on EVERY boot: each step is guarded, so an already-complete box is a
# fast no-op. Never aborts the boot — best-effort; the app still starts if an
# optional tool can't install (that engine just degrades).
#
# Knobs: SKIP_SETUP=1, SETUP_OLLAMA=0, SETUP_GO_TOOLS=0, SETUP_HEAVY_OCR=1
#        (easyocr/paddleocr are large — set SETUP_HEAVY_OCR=0 to skip), SETUP_NODE_SCRAPERS=1.
set -uo pipefail
cd "$(dirname "$0")"; ROOT="$PWD"
LOG="${SETUP_LOG:-/tmp/jarvis-setup}"; mkdir -p "$LOG"
say(){ printf '\033[36m[setup]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[setup]\033[0m %s\n' "$*"; }

export GOBIN="${GOBIN:-$HOME/go/bin}"
export PATH="$GOBIN:$PATH"
mkdir -p "$GOBIN"
SUDO=""; [ "$(id -u)" != 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# ── 1. system packages (tesseract = OCR engine, poppler = PDF->image, go) ──────
say "1/5 system packages…"
if command -v apt-get >/dev/null 2>&1; then
  $SUDO apt-get update -qq >>"$LOG/apt.log" 2>&1 || true
  $SUDO apt-get install -y -qq gcc build-essential tesseract-ocr poppler-utils \
        >>"$LOG/apt.log" 2>&1 && say "    tesseract + build tools ✓" || warn "    apt issues ($LOG/apt.log)"
  command -v go >/dev/null 2>&1 || $SUDO apt-get install -y -qq golang-go >>"$LOG/apt.log" 2>&1 || true
else
  warn "    no apt-get — install tesseract-ocr/poppler/go manually"
fi

# ── 2. Python deps (+ heavy GPU OCR / browser engines) ─────────────────────────
say "2/5 python deps…"
python3 -m pip install -q --upgrade pip 2>>"$LOG/pip.log" || true
python3 -m pip install -q -r server/requirements.txt 2>>"$LOG/pip.log" \
  && say "    requirements ✓" || warn "    pip issues ($LOG/pip.log)"
# arjun (recon) + the browser content engines in the scrape registry
python3 -m pip install -q arjun undetected-chromedriver botasaurus-driver 2>>"$LOG/pip.log" \
  && say "    arjun + browser engines ✓" || warn "    some python scrape engines skipped ($LOG/pip.log)"
if [ "${SETUP_HEAVY_OCR:-1}" = "1" ]; then
  say "    GPU OCR (easyocr/paddleocr — large, first run downloads models)…"
  python3 -m pip install -q easyocr 2>>"$LOG/pip.log" && say "    easyocr ✓" || warn "    easyocr skipped ($LOG/pip.log)"
  python3 -m pip install -q paddleocr paddlepaddle-gpu 2>>"$LOG/pip.log" \
    || python3 -m pip install -q paddleocr paddlepaddle 2>>"$LOG/pip.log" \
    && say "    paddleocr ✓" || warn "    paddleocr skipped ($LOG/pip.log)"
else
  say "    heavy GPU OCR skipped (SETUP_HEAVY_OCR=0)"
fi

# ── 3. Node deps (robust) + JS scraping/OCR extras (--no-save: on the box only) ─
say "3/5 node deps…"
need_npm=1
if [ -d node_modules ] && npm ls vite >/dev/null 2>&1; then need_npm=0; say "    node_modules ok ✓"; fi
if [ "$need_npm" = 1 ]; then
  if [ -f package-lock.json ] && npm ci >"$LOG/npm.log" 2>&1; then say "    npm ci ✓"
  elif npm install >"$LOG/npm.log" 2>&1; then say "    npm install ✓"
  else warn "    npm failed ($LOG/npm.log)"; fi
fi
if [ "${SETUP_NODE_SCRAPERS:-1}" = "1" ]; then
  # Installed --no-save so they live in node_modules WITHOUT bloating package.json /
  # the UI build / CI. NOTE: the app's scraper + OCR are Python/Go — these JS libs are
  # available on the box but inert until a Node scraper uses them.
  say "    JS scraping/OCR extras (--no-save)…"
  npm install --no-save --no-audit --no-fund \
    tesseract.js node-tesseract-ocr ocr-space-api-wrapper \
    crawlee got-scraping website-scraper puppeteer-real-browser \
    proxy-chain ghost-cursor >>"$LOG/npm-extras.log" 2>&1 \
    && say "    JS extras ✓" || warn "    some JS extras skipped ($LOG/npm-extras.log)"
fi

# ── 4. Go scraper + GOVERNED recon binaries → ~/go/bin ─────────────────────────
if [ "${SETUP_GO_TOOLS:-1}" = "1" ] && command -v go >/dev/null 2>&1; then
  say "4/5 scraper + recon binaries → $GOBIN …"
  _go_get(){ command -v "$1" >/dev/null 2>&1 && { say "    $1 ✓"; return; }; say "    installing $1…"
    GOBIN="$GOBIN" GOFLAGS=-mod=mod go install "$2" >>"$LOG/go.log" 2>&1 \
      && say "    $1 ✓" || warn "    $1 failed ($LOG/go.log)"; }
  _go_get katana github.com/projectdiscovery/katana/cmd/katana@latest   # document-finder discovery
  _go_get httpx  github.com/projectdiscovery/httpx/cmd/httpx@latest
  _go_get ffuf   github.com/ffuf/ffuf/v2@latest
  _go_get kr     github.com/assetnote/kiterunner@latest
  _go_get nuclei github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest # GOVERNED (RECON_ALLOWLIST)
  command -v nuclei >/dev/null 2>&1 && (nuclei -update-templates >>"$LOG/go.log" 2>&1 &) || true
  for rc in "$HOME/.profile" "$HOME/.bashrc"; do
    [ -f "$rc" ] && { grep -q 'go/bin' "$rc" 2>/dev/null || echo 'export PATH="$HOME/go/bin:$PATH"' >>"$rc"; }
  done
else
  say "4/5 go scraper binaries: skipped"
fi

# ── 5. Ollama (optional local GPU LLM) ─────────────────────────────────────────
if [ "${SETUP_OLLAMA:-1}" = "1" ]; then
  command -v ollama >/dev/null 2>&1 && say "5/5 ollama ✓" || {
    say "5/5 installing ollama…"
    curl -fsSL https://ollama.com/install.sh 2>/dev/null | sh >>"$LOG/ollama.log" 2>&1 \
      && say "    ollama ✓" || warn "    ollama skipped ($LOG/ollama.log)"; }
else
  say "5/5 ollama: skipped"
fi

echo
say "environment ready · katana=$(command -v katana 2>/dev/null || echo MISSING)" \
    "· tesseract=$(command -v tesseract 2>/dev/null || echo MISSING) · logs in $LOG/"
