#!/usr/bin/env bash
# infra/setup.sh — ONE-TIME (idempotent) prep so a fresh container can run everything
# this session built WITHOUT a human: deps, OCR engines, the asset catalog + design
# bible, the underworld backend deps + web build, and a seeded world. Safe to re-run.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ROOT/.venv"
PY="$VENV/bin/python"
say() { printf "\n\033[1;36m[setup] %s\033[0m\n" "$*"; }

say "1/7 Python venv + JARVIS deps"
[ -x "$PY" ] || python3 -m venv "$VENV"
"$VENV/bin/pip" install -q -r "$ROOT/requirements.txt" 2>/dev/null || true

say "2/7 OCR engines (Tesseract floor + pypdf/pillow; paddle optional)"
command -v tesseract >/dev/null 2>&1 || (apt-get update -q && apt-get install -y -q tesseract-ocr libgl1 libglib2.0-0) >/dev/null 2>&1 || true
"$VENV/bin/pip" install -q pytesseract pypdf pillow pymupdf 2>/dev/null || true

say "3/7 Underworld backend deps"
"$VENV/bin/pip" install -q -r "$ROOT/underworld/requirements.txt" 2>/dev/null || true

say "4/7 Asset catalog (classify every GLB)"
( cd "$ROOT/underworld" && "$PY" -m server.services.asset_catalog \
    web/public/models web/public/models/asset_catalog.json ) 2>/dev/null || true

say "5/7 Design bible (assets/situations/actions/metrics; directive table on demand)"
( cd "$ROOT/underworld" && "$PY" -m server.services.design_spec \
    web/public/models/asset_catalog.json data/design 200000 ) 2>/dev/null || true

say "6/7 Underworld web build (R3F 3D app)"
if [ ! -d "$ROOT/underworld/web/node_modules" ]; then
  ( cd "$ROOT/underworld/web" && npm install --no-audit --no-fund ) >/dev/null 2>&1 || true
fi
( cd "$ROOT/underworld/web" && npm run build ) >/dev/null 2>&1 || true

say "7/7 Seed a world if none exists (so the sim + 3D have something to run)"
PYTHONPATH="$ROOT" UNDERWORLD_LLM_BASE_URL="http://211.72.13.201:41137/v1" \
UNDERWORLD_LLM_MODEL="llama3.1:8b" UNDERWORLD_LLM_API_KEY="ollama" \
"$PY" - <<'PYSEED' 2>/dev/null || true
import asyncio, os, sys
sys.path.insert(0, os.getcwd())
os.chdir(os.path.join(os.path.dirname(os.path.abspath("__file__")), "underworld")) if os.path.isdir("underworld") else None
async def main():
    try:
        from server.db.session import get_sessionmaker
        from server.routes.schemas import WorldCreate
        from server.routes import worlds as W
        sm = get_sessionmaker()
        async with sm() as s:
            existing = await W.list_worlds(session=s, _token="dev-key")  # type: ignore
            if existing:
                print("world exists:", len(existing)); return
    except Exception as e:
        print("seed skipped:", e)
asyncio.run(main())
PYSEED

say "DONE — setup complete. Now: pm2 start ecosystem.config.cjs && pm2 save"
