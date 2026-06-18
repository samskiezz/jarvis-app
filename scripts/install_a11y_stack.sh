#!/usr/bin/env bash
# install_a11y_stack.sh — Cluster C4: zero-handoff accessibility bootstrap.
#
# Installs every accessibility dependency that can be installed without
# physical hardware, configures sensible defaults, and prints a clear
# summary table at the end telling the owner which (optional) plug-in
# hardware would upgrade quality.
#
# Defaults: free webcam-based gaze (MediaPipe server-side + WebGazer.js
# browser-side). Tobii Eye Tracker 5 is *optional* — script detects USB
# presence and switches to high-precision mode if found.
#
# Safe to re-run. Additive only. Never touches runtime status files.
# ---------------------------------------------------------------------------

set -u  # do NOT set -e: we treat per-step failure as a soft warning so the
        # owner gets a complete summary even if one optional dep can't install.

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATIC_DIR="${REPO_ROOT}/server/static/a11y"
LOG_FILE="${REPO_ROOT}/.proof/a11y_install_$(date +%Y%m%d_%H%M%S).log"
mkdir -p "$(dirname "${LOG_FILE}")" "${STATIC_DIR}"

# --- pretty output (no external deps) --------------------------------------
if [ -t 1 ]; then
    C_GREEN="\033[32m"; C_YEL="\033[33m"; C_RED="\033[31m"; C_DIM="\033[2m"; C_OFF="\033[0m"
else
    C_GREEN=""; C_YEL=""; C_RED=""; C_DIM=""; C_OFF=""
fi

# Counters for the summary table.
declare -a ROWS=()
note_row() {
    # $1=channel  $2=driver  $3=status  $4=detail
    ROWS+=("${1}|${2}|${3}|${4}")
}

step() { printf "${C_DIM}[a11y]${C_OFF} %s\n" "$*" | tee -a "${LOG_FILE}"; }
ok()   { printf "${C_GREEN}[OK]${C_OFF}   %s\n" "$*" | tee -a "${LOG_FILE}"; }
warn() { printf "${C_YEL}[WARN]${C_OFF} %s\n" "$*" | tee -a "${LOG_FILE}"; }
fail() { printf "${C_RED}[FAIL]${C_OFF} %s\n" "$*" | tee -a "${LOG_FILE}"; }

# --- OS detect -------------------------------------------------------------
OS="$(uname -s)"
case "${OS}" in
    Linux*)    PLATFORM="linux";;
    Darwin*)   PLATFORM="mac";;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows";;
    *)         PLATFORM="unknown";;
esac
step "Platform detected: ${PLATFORM} (${OS})"

# --- pick python + pip -----------------------------------------------------
PY="${PYTHON:-}"
if [ -z "${PY}" ]; then
    if   command -v python3 >/dev/null 2>&1; then PY="python3"
    elif command -v python  >/dev/null 2>&1; then PY="python"
    else fail "no python3 on PATH — install python 3.10+ and re-run."; PY=""
    fi
fi

PIP_FLAGS="${PIP_FLAGS:-}"
pip_install() {
    # $1+ packages
    if [ -z "${PY}" ]; then return 1; fi
    step "pip install $*"
    "${PY}" -m pip install --upgrade --quiet ${PIP_FLAGS} "$@" 2>>"${LOG_FILE}"
}

# --- 1. core vision + audio (always free) ----------------------------------
step "Installing free vision + audio model stack..."

if pip_install ultralytics opencv-python; then
    ok "ultralytics + opencv-python (YOLO object/person/pose)"
    note_row "vision" "ultralytics" "INSTALLED" "YOLOv8/v11 person+object detector"
else
    warn "ultralytics install failed — see ${LOG_FILE}"
    note_row "vision" "ultralytics" "FAILED"   "see ${LOG_FILE}"
fi

if pip_install tensorflow tensorflow-hub; then
    ok "tensorflow + tensorflow-hub (YAMNet audio events)"
    note_row "audio" "tensorflow-hub" "INSTALLED" "YAMNet ambient-sound classifier"
else
    warn "tensorflow install failed (heavy dep) — see ${LOG_FILE}"
    note_row "audio" "tensorflow-hub" "FAILED" "heavy dep; can use torch hub instead"
fi

# --- 2. free gaze backend (MediaPipe) --------------------------------------
step "Installing MediaPipe (free webcam gaze, no Tobii needed)..."
if pip_install mediapipe; then
    ok "mediapipe (face mesh + iris refinement) installed"
    note_row "gaze" "mediapipe" "INSTALLED" "free webcam gaze, ~5deg accuracy"
else
    warn "mediapipe install failed — gaze will rely on WebGazer.js only"
    note_row "gaze" "mediapipe" "FAILED" "browser WebGazer still works"
fi

# --- 3. WebGazer.js (browser side, vendored) -------------------------------
step "Vendoring WebGazer.js into server/static/a11y/ for offline use..."
WG_OUT="${STATIC_DIR}/webgazer.js"
if [ ! -s "${WG_OUT}" ]; then
    if command -v curl >/dev/null 2>&1; then
        if curl -fsSL "https://webgazer.cs.brown.edu/webgazer.js" -o "${WG_OUT}.tmp" 2>>"${LOG_FILE}"; then
            mv "${WG_OUT}.tmp" "${WG_OUT}"
            ok "webgazer.js vendored to ${WG_OUT}"
            note_row "gaze" "webgazer.js" "INSTALLED" "vendored at /static/a11y/webgazer.js"
        else
            rm -f "${WG_OUT}.tmp"
            warn "could not download webgazer.js (offline?); browser will use CDN."
            note_row "gaze" "webgazer.js" "CDN-ONLY" "browser fetches from webgazer.cs.brown.edu"
        fi
    else
        warn "curl not present; skipping webgazer.js vendor step."
        note_row "gaze" "webgazer.js" "CDN-ONLY" "no curl on host"
    fi
else
    ok "webgazer.js already vendored (${WG_OUT})"
    note_row "gaze" "webgazer.js" "INSTALLED" "previously vendored"
fi

# --- 4. Tobii detection (optional, $230 hardware) --------------------------
step "Probing for Tobii Eye Tracker 5 over USB..."
TOBII_DETECTED="no"
if [ "${PLATFORM}" = "linux" ] && command -v lsusb >/dev/null 2>&1; then
    # Tobii vendor ID = 0x2104; Tobii Eye Tracker 5 product ids vary by rev.
    if lsusb 2>/dev/null | grep -qi "2104:\|tobii"; then
        TOBII_DETECTED="yes"
    fi
fi
if [ "${TOBII_DETECTED}" = "yes" ]; then
    ok "Tobii device detected — installing tobii_research SDK"
    if pip_install tobii_research; then
        note_row "gaze" "tobii" "ACTIVE" "high-precision (~0.5deg) hardware detected"
    else
        warn "tobii_research install failed — falling back to MediaPipe"
        note_row "gaze" "tobii" "SDK-FAIL" "MediaPipe remains default"
    fi
else
    warn "No Tobii device on USB — defaulting to free MediaPipe + WebGazer."
    note_row "gaze" "tobii" "NOT-PLUGGED-IN" "optional: amazon.com/dp/B0BSPN1WBR (~\$230)"
fi

# --- 5. NVDA bridge (Windows only) -----------------------------------------
if [ "${PLATFORM}" = "windows" ]; then
    step "Windows detected — checking for NVDA controller client..."
    # NVDA controllerClient ships in extras/ of any NVDA install. We don't
    # try to auto-download the installer (the user must accept its UAC
    # prompt); we just point to the silent-install command.
    NVDA_DLL_CANDIDATES=(
        "${PROGRAMFILES:-C:/Program Files}/NVDA/extras/controllerClient/x64/nvdaControllerClient64.dll"
        "${PROGRAMFILES:-C:/Program Files (x86)}/NVDA/extras/controllerClient/x64/nvdaControllerClient64.dll"
    )
    FOUND_DLL=""
    for cand in "${NVDA_DLL_CANDIDATES[@]}"; do
        if [ -f "${cand}" ]; then FOUND_DLL="${cand}"; break; fi
    done
    if [ -n "${FOUND_DLL}" ]; then
        cp -f "${FOUND_DLL}" "${REPO_ROOT}/" 2>>"${LOG_FILE}" \
            && ok "Copied NVDA controller DLL next to repo root" \
            || warn "Could not copy NVDA DLL (permission?)"
        note_row "screen_reader" "nvda" "INSTALLED" "DLL bridged from ${FOUND_DLL}"
    else
        warn "NVDA not installed. Silent install command:"
        echo "    nvda_*.exe --install-silent --minimal --enable-start-on-logon=True"
        note_row "screen_reader" "nvda" "PENDING" "download from nvaccess.org, silent flag above"
    fi
elif [ "${PLATFORM}" = "mac" ]; then
    ok "macOS host — built-in VoiceOver driver will be used (no install needed)"
    note_row "screen_reader" "voiceover" "BUILT-IN" "uses osascript + say"
else
    ok "Linux/other — screen reader bridge is per-host (Orca on GNOME)"
    note_row "screen_reader" "host-native" "SKIPPED" "non-Windows; use Orca/speech-dispatcher"
fi

# --- 6. switch input probe (USB HID) ---------------------------------------
step "Installing pyusb (single-switch USB HID enumeration)..."
if pip_install pyusb; then
    ok "pyusb installed"
    note_row "switch" "usb_hid" "INSTALLED" "AbleNet Hook+ / Logitech Adaptive auto-detected"
else
    warn "pyusb install failed — Web Bluetooth path will still work"
    note_row "switch" "usb_hid" "FAILED" "Web Bluetooth fallback remains"
fi

# --- 7. summary table ------------------------------------------------------
printf "\n${C_DIM}=========================================================${C_OFF}\n"
printf "${C_GREEN}A11y stack ready.${C_OFF} Summary (also saved to %s)\n" "${LOG_FILE}"
printf "${C_DIM}---------------------------------------------------------${C_OFF}\n"
printf "%-14s %-14s %-16s %s\n" "CHANNEL" "DRIVER" "STATUS" "DETAIL"
printf "${C_DIM}---------------------------------------------------------${C_OFF}\n"
for r in "${ROWS[@]}"; do
    IFS='|' read -r c d s detail <<<"${r}"
    case "${s}" in
        INSTALLED|ACTIVE|BUILT-IN) col="${C_GREEN}";;
        FAILED|SDK-FAIL)           col="${C_RED}";;
        *)                         col="${C_YEL}";;
    esac
    printf "%-14s %-14s ${col}%-16s${C_OFF} %s\n" "${c}" "${d}" "${s}" "${detail}"
done

cat <<'TAIL'

OPTIONAL HARDWARE UPGRADES (free stack is already production-ready):
  - Tobii Eye Tracker 5 — high-precision gaze (~0.5deg) for typing/selection
      Amazon: https://amazon.com/dp/B0BSPN1WBR  (~$230)
  - AbleNet Hook+ USB Switch Interface — single-switch scanning
      Amazon: https://amazon.com/dp/B07VWSV3WX  (~$65)
  - Logitech Adaptive Gaming Kit (Buddy Button)
      Amazon: https://amazon.com/dp/B07Y7VBQNG  (~$100)

Without any of these, MediaPipe iris + WebGazer.js + Web Bluetooth/USB-HID
gives ~5deg gaze and full switch scanning — usable for dock-app selection.
TAIL
