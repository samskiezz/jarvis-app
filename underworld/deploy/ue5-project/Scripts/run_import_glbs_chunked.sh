#!/usr/bin/env bash
# run_import_glbs_chunked.sh — memory-safe driver for import_glbs.py
# Re-launches the UE5 Editor for each chunk so RAM is fully reclaimed between chunks.
# Run as root; the script drops to ueuser for the Editor.
#
# This driver:
#   1. Computes the genuinely missing manifest entries using filesystem checks.
#   2. Pre-merges multi-part glTF files with trimesh so the Editor sees only
#      single-mesh sources and never hits the build_from_static_mesh_descriptions
#      multi-LOD crash.
#   3. Imports the missing entries in small chunks, skipping problematic URLs
#      after repeated failures.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
export PROJECT_DIR
UE_EDITOR="/opt/UnrealEngine/Engine/Binaries/Linux/UnrealEditor-Cmd"
UPROJECT="${PROJECT_DIR}/Underworld.uproject"
IMPORT_SCRIPT="${SCRIPT_DIR}/import_glbs.py"
PREMERGE_SCRIPT="${SCRIPT_DIR}/premerge_missing_glbs.py"
MANIFEST="${PROJECT_DIR}/Content/UnderworldAssets/manifest.json"
GLB_ROOT="/opt/jarvis-app-1/underworld/web/public/models"
CATALOG="${GLB_ROOT}/asset_catalog.json"
VENV_PYTHON="/opt/jarvis-app-1/.venv/bin/python3"
MERGED_ROOT="/tmp/uw_merged_glbs"

CHUNK_SIZE="${UW_CHUNK_SIZE:-5}"

if [[ ! -f "$UE_EDITOR" ]]; then
    echo "ERROR: UE5 editor not found at $UE_EDITOR" >&2
    exit 1
fi
if [[ ! -f "$UPROJECT" ]]; then
    echo "ERROR: project not found at $UPROJECT" >&2
    exit 1
fi
if [[ ! -f "$MANIFEST" ]]; then
    echo "ERROR: manifest not found at $MANIFEST" >&2
    exit 1
fi
if [[ ! -f "$VENV_PYTHON" ]]; then
    echo "ERROR: venv python not found at $VENV_PYTHON" >&2
    exit 1
fi

# Compute total manifest size, the number of filesystem-missing assets, the
# number of *eligible* missing assets (after skipping character/creature/hero),
# and the static skip URL set.
compute_stats() {
    python3 - <<'PY'
import json, os, sys

proj = os.environ['PROJECT_DIR']
with open(os.path.join(proj, 'Content', 'UnderworldAssets', 'manifest.json')) as f:
    man = json.load(f)
items = list(man['by_url'].items())
total = len(items)

cat_path = os.path.abspath(os.path.join(proj, '..', '..', 'web', 'public', 'models', 'asset_catalog.json'))
allow_urls = {
    "/models/RobotExpressive.glb",
    "/models/hero/underworld_hero.glb",
    "/models/generated/tripo/horse_omnibus.glb",
    "/models/generated/tripo/industrial_robot_arm.glb",
    "/models/generated/tripo/predator_wolf.glb",
}
skip_urls = {"/models/hero/underworld_hero.glb"}
if os.path.exists(cat_path):
    try:
        with open(cat_path, 'r', encoding='utf-8') as f:
            cat = json.load(f)
        assets = cat.get('assets', {})
        if isinstance(assets, dict):
            assets = assets.values()
        for a in assets:
            if isinstance(a, dict) and a.get('category') in ('character', 'creature'):
                skip_urls.add(a.get('url'))
    except Exception:
        pass
skip_urls -= allow_urls

cat_map = {}
if os.path.exists(cat_path):
    try:
        with open(cat_path, 'r', encoding='utf-8') as f:
            cat = json.load(f)
        assets = cat.get('assets', {})
        if isinstance(assets, dict):
            iterator = assets.items()
        else:
            iterator = ((a.get('url'), a) for a in assets)
        for url, a in iterator:
            if url:
                cat_map[__import__('os').path.basename(url).lower()] = (
                    a.get('category') if isinstance(a, dict) else 'prop',
                    bool(a.get('skinned')) if isinstance(a, dict) else False,
                )
    except Exception:
        pass

missing = []
eligible_missing = []
first_missing_url = ''
first_eligible_url = ''
for idx, (url, gpath) in enumerate(items):
    rel = gpath[len('/Game/'):] + '.uasset'
    full = os.path.join(proj, 'Content', rel)
    if not os.path.exists(full):
        missing.append((idx, url, gpath))
        if not first_missing_url:
            first_missing_url = url
        if url not in skip_urls or url in allow_urls:
            cat, skinned = cat_map.get(__import__('os').path.basename(url).lower(), ('prop', False))
            if (not skinned and cat not in ('character', 'creature')) or url in allow_urls:
                eligible_missing.append((idx, url, gpath))
                if not first_eligible_url:
                    first_eligible_url = url

print(total, len(missing), len(eligible_missing), json.dumps(sorted(skip_urls), separators=(',',':')), first_eligible_url)
PY
}

read -r TOTAL MISSING ELIGIBLE_MISSING SKIP_URLS FIRST_MISSING_URL <<<"$(compute_stats)"
export UW_SKIP_URLS="$SKIP_URLS"
echo "[uw-chunk-driver] total=${TOTAL} remaining=${MISSING} eligible_remaining=${ELIGIBLE_MISSING} chunk_size=${CHUNK_SIZE} first_missing=${FIRST_MISSING_URL} skip_urls=$(echo "$SKIP_URLS" | python3 -c 'import json,sys;print(len(json.load(sys.stdin)))')"

if [[ "$ELIGIBLE_MISSING" -eq 0 ]]; then
    echo "[uw-chunk-driver] nothing left to import (skipped-only remain: ${MISSING})"
    exit 0
fi

# Pre-merge all missing sources so the Editor never has to merge multi-part GLBs.
echo "[uw-chunk-driver] pre-merging missing sources into ${MERGED_ROOT} ..."
rm -rf "$MERGED_ROOT"
mkdir -p "$MERGED_ROOT"
"$VENV_PYTHON" "$PREMERGE_SCRIPT" \
    --manifest "$MANIFEST" \
    --glb-root "$GLB_ROOT" \
    --catalog "$CATALOG" \
    --output "$MERGED_ROOT" \
    --skip-urls "$SKIP_URLS"

# Ensure ueuser can read the merged files.
chmod -R a+r "$MERGED_ROOT"

MAX_RETRIES=2
consecutive_failures=0

while [[ "$ELIGIBLE_MISSING" -gt 0 ]]; do
    echo "[uw-chunk-driver] ===== chunk missing-offset=0 size=${CHUNK_SIZE} (eligible_remaining=${ELIGIBLE_MISSING}) ====="
    rc=0
    su - ueuser -c "
        cd '${PROJECT_DIR}' && \
        UW_GLB_ROOT='${MERGED_ROOT}' \
        UW_CATALOG='${CATALOG}' \
        UW_CHUNK_SIZE=${CHUNK_SIZE} \
        UW_CHUNK_OFFSET=0 \
        UW_SKIP_URLS='${SKIP_URLS}' \
        '${UE_EDITOR}' '${UPROJECT}' -run=pythonscript -script='${IMPORT_SCRIPT}' -unattended -nullrhi -stdout
    " || rc=$?

    if [[ $rc -eq 137 ]]; then
        echo "[uw-chunk-driver] WARNING: chunk was OOM-killed (exit 137). Re-run with a smaller UW_CHUNK_SIZE." >&2
        exit $rc
    fi

    prev_eligible=$ELIGIBLE_MISSING
    read -r TOTAL MISSING ELIGIBLE_MISSING SKIP_URLS FIRST_MISSING_URL <<<"$(compute_stats)"

    if [[ $rc -ne 0 ]]; then
        if [[ "$ELIGIBLE_MISSING" -eq "$prev_eligible" ]]; then
            consecutive_failures=$((consecutive_failures + 1))
            if [[ $consecutive_failures -ge $MAX_RETRIES && -n "$FIRST_MISSING_URL" ]]; then
                echo "[uw-chunk-driver] WARNING: ${FIRST_MISSING_URL} failed ${consecutive_failures} times (exit ${rc}); skipping it." >&2
                SKIP_URLS="$(python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1])+[sys.argv[2]]))" "$SKIP_URLS" "$FIRST_MISSING_URL")"
                export UW_SKIP_URLS="$SKIP_URLS"
                consecutive_failures=0
            else
                echo "[uw-chunk-driver] WARNING: chunk finished with exit ${rc}; retrying (failure ${consecutive_failures}/${MAX_RETRIES})." >&2
            fi
        else
            consecutive_failures=0
        fi
    else
        consecutive_failures=0
    fi
done

echo "[uw-chunk-driver] all chunks complete (filesystem remaining=${MISSING}, skipped-only)"
