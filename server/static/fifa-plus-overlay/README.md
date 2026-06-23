# JARVIS WC2026 FIFA+ Overlay

A browser extension that draws JARVIS AI predictions on top of the FIFA+ video player while you watch matches.

## What it does

- Adds a draggable overlay panel to any FIFA+ page.
- Loads the latest `wc2026_model_predictions.json` from your JARVIS server.
- Lets you pick a WC2026 fixture and see:
  - predicted probabilities (home / draw / away)
  - top model pick and confidence
  - three-spread value bets
  - model-implied odds
  - vision-tracking possession stats when available

## What it does NOT do

It does **not** download, scrape, record, or otherwise access the FIFA+ video stream. It only renders HTML on top of the page you are already authorized to view.

## Install

1. Open Chrome/Edge and go to `chrome://extensions/`.
2. Enable **Developer mode** (toggle top-right).
3. Click **Load unpacked**.
4. Select this folder (`server/static/fifa-plus-overlay`).
5. Open any match on [FIFA+](https://plus.fifa.com/).
6. The overlay appears in the top-right corner of the page.

## Configure

Click the extension icon in the toolbar to set the JARVIS server base URL. Defaults to:

```
https://app.projectsolar.cloud/jarvis
```

For local development use:

```
http://localhost:8095
```

The overlay tries these prediction JSON paths relative to the base URL:

- `/data/wc2026_model_predictions.json`
- `/predictions/data/wc2026_model_predictions.json`
- `/wc2026_model_predictions.json`

## Files

- `manifest.json` — extension manifest (v3)
- `content.js` — overlay injection and rendering
- `styles.css` — overlay styling
- `popup.html` / `popup.js` — settings popup
- `icon*.png` — extension icons
