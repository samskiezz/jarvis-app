# CI/CD

Palantir platform pillar **P16 #115**. This document describes what runs in CI,
how to (optionally) turn on production deploys, and how to roll back.

> **Honest status: deploy is INERT by default.** The CI pipeline is real and
> runs on every push/PR. The deploy pipeline ships disabled — it is a no-op
> until you set the repo secret `DEPLOY_ENABLED=true` *and* add the
> target-specific secrets below. With no secrets, `deploy.yml` runs the gate
> job, prints "deploy disabled", and exits green without touching production.

## Continuous Integration — `.github/workflows/ci.yml`

Triggers: push and pull_request to `main` and `claude/help-needed-V3BvZ`.

Two jobs, both verified to run against this repo:

### `backend` (Python 3.11)
- `python3 -m pip install -r server/requirements.txt`
- Tests, with the heavy ML suites deselected to keep CI fast:
  ```
  python3 -m pytest server/tests -q \
    --deselect server/tests/test_forecaster_ml.py \
    --deselect server/tests/test_oracle_model.py \
    --deselect server/tests/test_train_sp500.py
  ```
  Locally this is **275 passed, 16 deselected**. To run the full suite
  (including ML training/oracle tests) drop the `--deselect` flags; expect it to
  be substantially slower.

### `frontend` (Node 20)
- `npm ci`
- `npm run lint`  (eslint, exits 0 clean)
- `npm run build` (vite build, exits 0)

Script names are taken verbatim from `package.json`.

## Deploy — `.github/workflows/deploy.yml`

Triggers: manual `workflow_dispatch` and push to `main`.

Structure:
- A `gate` job reads the `DEPLOY_ENABLED` secret and exposes a boolean output.
- `deploy-backend` and `deploy-frontend` jobs are guarded by
  `if: ${{ needs.gate.outputs.enabled == 'true' }}` and use
  `environment: production`. Each real action additionally re-checks for its
  own required secret, so a partial configuration never half-deploys.

The actual deploy commands (Fly.io and a generic Docker registry push) are
present as **commented placeholders** — uncomment the option you want.

### How to enable deploy

1. Set the master switch:
   - `DEPLOY_ENABLED = true`  (repository secret)

2. Add the secrets for your chosen target:

   **Option A — Fly.io (`flyctl deploy`)**
   - `FLY_API_TOKEN` — from `flyctl auth token`
   - Provide a `fly.toml` for the backend (the root `Dockerfile` is used).
   - Uncomment the Fly block in `deploy-backend`.

   **Option B — Generic Docker registry push**
   - `REGISTRY` — e.g. `ghcr.io/<owner>`
   - `REGISTRY_USERNAME`
   - `REGISTRY_PASSWORD`
   - Uncomment the registry blocks in `deploy-backend` / `deploy-frontend`.
   - Optional frontend build arg: `VITE_API_BASE_URL`.

3. (Recommended) In repo Settings → Environments → `production`, add required
   reviewers / branch protection so production deploys need approval.

### Frontend note
The SPA already ships `netlify.toml` and `vercel.json`, so the usual path is the
native Netlify/Vercel Git integration (no secrets in this repo needed). The
`deploy-frontend` job + `Dockerfile.web` are only for a self-managed
container/static host.

## Container images

- `Dockerfile` — APEX backend. `python:3.11-slim`, installs
  `server/requirements.txt`, copies `server/`, runs
  `uvicorn server.main:app` on `$PORT` (default 8000).
- `Dockerfile.web` — frontend. Multi-stage: `npm ci` + `vite build`, then nginx
  serving `dist/` with SPA fallback to `index.html`.

Pre-existing Dockerfiles left untouched: `underworld/Dockerfile`,
`underworld/fly.toml`, `deploy/gpu/Dockerfile`, `forge/Dockerfile`. These
cover the other backends and are out of scope for the APEX backend image.

## Rollback

- **Fly.io:** `flyctl releases` to list, then
  `flyctl deploy --image <previous-image>` or `flyctl releases rollback <vN>`.
- **Docker registry:** images are tagged `:latest`; pin/redeploy a previous
  immutable tag (use commit-SHA tags in production for clean rollbacks).
- **Netlify/Vercel:** use the dashboard's "Rollback to this deploy" on the
  previous successful deploy.
- **Always:** reverting the offending commit on `main` re-triggers `deploy.yml`
  and (once enabled) redeploys the prior good state.
