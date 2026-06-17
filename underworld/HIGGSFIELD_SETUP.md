# Higgsfield Setup Guide for Underworld

This guide explains how to connect Underworld to Higgsfield's platform API v2 for generative image/video media.

## Important security note

Your Higgsfield credentials are secrets. Never paste them into source code, chat messages, or a file that is committed to Git. This project already ignores `.env` files, so local credentials stay on your machine.

## Which API does this use?

Underworld now uses the **Higgsfield platform API v2** (`https://platform.higgsfield.ai`). It authenticates with a `KEY_ID` and `KEY_SECRET` pair sent as:

```
Authorization: Key KEY_ID:KEY_SECRET
```

The older Pixazo gateway (`Ocp-Apim-Subscription-Key`) is still supported as a fallback if you only have a legacy credential.

## Option 1: Interactive setup script (recommended)

Run the helper script. It asks for your KEY_ID and KEY_SECRET using masked prompts, saves them to `.env`, and runs one tiny image test.

```bash
cd /opt/jarvis-app-1/underworld
/opt/jarvis-app-1/.venv/bin/python scripts/setup_higgsfield_and_test.py
```

What happens:
1. You paste your KEY_ID and KEY_SECRET. They will not be shown on screen.
2. The script writes the credentials to `underworld/.env`.
3. The script submits one small image prompt.
4. The script waits 10 seconds and polls once for status.

## Option 2: Manual `.env` setup

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and set:
   ```env
   UNDERWORLD_HIGGSFIELD_ENABLED=true
   UNDERWORLD_HIGGSFIELD_KEY_ID=your-key-id
   UNDERWORLD_HIGGSFIELD_KEY_SECRET=your-key-secret
   UNDERWORLD_HIGGSFIELD_BASE_URL=https://platform.higgsfield.ai
   UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY=100
   ```
3. Restart the Underworld server.

## How to get your KEY_ID and KEY_SECRET

1. Open `https://cloud.higgsfield.ai/api-keys` in a browser and log in.
2. Create a new API key if you don't have one.
3. Copy the **Key ID** and **Key Secret**.

The Key ID looks like a UUID, for example `f9474227-5c51-42ff-bec8-2eb9773d6f26`.
The Key Secret is a long hex string.

## Keeping costs low

The default settings in `.env.example` are conservative:

- `UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY=100` stops generation after ~100 estimated credits per world per day.
- `UNDERWORLD_HIGGSFIELD_MAX_JOBS_PER_WORLD_PER_TICK=1` limits each simulation tick to one media job.
- The pipeline generates only still images unless `director:god_beat` events fire; videos are much more expensive.

## Verify the connection

After setup, you can test from the API:

```bash
# create a world first, then replace WORLD_ID
curl -H "Authorization: Bearer dev-key" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"kind":"image","prompt":"a tiny futuristic avatar village"}' \
  http://localhost:8000/worlds/WORLD_ID/media/trigger
```

Or check budget:

```bash
curl -H "Authorization: Bearer dev-key" \
  http://localhost:8000/worlds/WORLD_ID/media/budget
```

## Troubleshooting

- **503 Service Unavailable**: Higgsfield is disabled or no credentials are set. Check `.env` and restart.
- **401 Unauthorized**: KEY_ID or KEY_SECRET is wrong. Copy them again from `https://cloud.higgsfield.ai/api-keys`.
- **403 Not enough credits**: Your Higgsfield account needs more credits. The test still proves the credentials are correct.
- **429 Too Many Requests**: Daily credit budget is exhausted. Increase `UNDERWORLD_HIGGSFIELD_CREDIT_BUDGET_DAILY` or wait.
- **No output URL after polling**: Higgsfield jobs can take 30-120 seconds. Use the returned `request_id` to poll again later.

## Automatic backup — never lose a creation

Every completed image or video is automatically downloaded to `underworld/data/media_assets/` (override with `UNDERWORLD_MEDIA_LOCAL_DIR`). The local path is stored on the `MediaAsset` row, so even if the Higgsfield CDN link expires, your creations remain on disk.

Export all backed-up media for a world from the **Underworld Live** panel in the Higgsfield mini app, or via the API:

```bash
curl -H "Authorization: Bearer dev-key" \
  -X POST \
  http://localhost:8000/worlds/WORLD_ID/media/export
```

Download the zip:

```bash
curl -H "Authorization: Bearer dev-key" \
  http://localhost:8000/worlds/WORLD_ID/media/export/download \
  -o world_media.zip
```

## Supercomputer research campaigns

The **Supercomputer Research Campaigns** panel turns a research query into a persistent multi-step generation plan:

1. Concept image
2. Detail image
3. Explainer video (using the concept image as input)

Create a campaign from the Underworld Live panel or via API:

```bash
curl -H "Authorization: Bearer dev-key" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"fusion reactor concept"}' \
  http://localhost:8000/worlds/WORLD_ID/media/campaigns
```

The media loop advances campaigns automatically every 30 seconds. You can also advance manually:

```bash
curl -H "Authorization: Bearer dev-key" \
  -X POST \
  http://localhost:8000/worlds/WORLD_ID/media/campaigns/CAMPAIGN_ID/advance
```
