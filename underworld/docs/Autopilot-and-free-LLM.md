# Autopilot + free Llama

The Underworld runs itself. You should never need to click "Advance".

## It runs automatically
- The backend has a **background scheduler** (`scheduler_enabled=True`) that advances
  every world with `auto_advance=True` on its own cadence (default **3 s/tick**).
- **New worlds default to auto-advance.** On startup the scheduler also flips *every*
  existing world on (`scheduler_autostart_all=True`), so nothing stays paused.
- In the UI, opening a never-run world auto-starts it; the header shows a live
  "● live" state. Manual Advance / Pause remain as optional overrides.

If a deploy ever feels static, it's because the API process that serves requests
isn't the one running the scheduler (e.g. multiple workers / serverless). Run the
app as a single process (the provided `uvicorn`/Docker entrypoint) and the
scheduler ticks in the background.

## Minions always act — with or without an LLM
Every tick, each minion decides via a fast, **free** path: the heuristic drives +
its own per-minion **neural policy** (#101) + tree-of-thought planning (#126) +
causal beliefs (#23). No API key is required for the world to live and evolve.

An LLM only adds richer *thoughts/decisions* for a small rotating cohort each tick.

## Turn on a FREE Llama (optional, recommended)
Set these env vars to point the agent at any OpenAI-compatible endpoint. When
`UNDERWORLD_LLM_API_KEY` is set it overrides the Kimi defaults.

**Groq (free, fast):**
```
UNDERWORLD_LLM_BASE_URL=https://api.groq.com/openai/v1
UNDERWORLD_LLM_API_KEY=gsk_your_free_groq_key
UNDERWORLD_LLM_MODEL=llama-3.1-8b-instant
```
**OpenRouter (free tier):**
```
UNDERWORLD_LLM_BASE_URL=https://openrouter.ai/api/v1
UNDERWORLD_LLM_API_KEY=sk-or-your_key
UNDERWORLD_LLM_MODEL=meta-llama/llama-3.1-8b-instruct:free
```
**Ollama (local Llama):**
```
UNDERWORLD_LLM_BASE_URL=http://localhost:11434/v1
UNDERWORLD_LLM_API_KEY=ollama
UNDERWORLD_LLM_MODEL=llama3.1
```

### Efficiency
Only `UNDERWORLD_LLM_MAX_MINIONS_PER_TICK` minions (default **6**) consult the LLM
each tick; everyone else uses the free heuristic+neural path. This keeps a free
Llama tier snappy and inside its rate limits while the world still feels alive.
Raise it for richer worlds, lower it (or unset the key) for maximum speed.
