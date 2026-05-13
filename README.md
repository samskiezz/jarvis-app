# Kimi K2.6 App

This app now uses a generic Kimi K2.6-compatible API backend.

## Environment
Create `.env.local`:

```bash
VITE_KIMI_K26_API_BASE_URL=https://api.moonshot.ai/v1
VITE_KIMI_K26_API_KEY=your_kimi_api_key
```

Optional URL params:
- `api_base_url`
- `api_key`
- `clear_api_key=true`

## Run
```bash
npm install
npm run dev
```

## Validate
```bash
npm run lint
npm run typecheck
npm run build
```
