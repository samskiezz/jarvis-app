# ML Training & Data Bootstrap (Cluster C8 — Gap #3)

This document covers the **one-time training-data bootstrap pipeline** that gives
the motor-intent predictor (and any future small-sample classifier in Jarvis) a
believable starting corpus to learn from.

## What ships

| File | Purpose |
|------|---------|
| `scripts/bootstrap_action_history.py` | Seed `server/data/action_history.jsonl` with real-harvested + synthetic dock-app actions. Additive, never destructive on default. |
| `scripts/train_motor_predictor.py`    | Evaluate + train + smoke-predict via `server.services.motor_predictor`. |
| `server/services/motor_predictor.py`  | (Already in repo, cluster C5.) sklearn LogisticRegression + HashingVectorizer + StratifiedKFold. |
| `server/data/action_history.jsonl`    | Append-only event log written by the bootstrap script. |
| `server/data/motor_model.joblib`      | Persisted sklearn pipeline (only written if the model crosses the validation bar). |
| `server/data/motor_model.json`        | Eval meta + gating flag. |

## One-shot quickstart

```bash
# 1. Seed action history with ~100 rows (real + synthetic).
python3 scripts/bootstrap_action_history.py --target 100

# 2. Train the predictor on the bootstrap corpus.
python3 scripts/train_motor_predictor.py
```

The first call is **idempotent and additive** — it only appends what's needed to
reach `--target`. Re-running never deletes prior history unless you pass the
opt-in `--reset` flag.

## Pipeline shape (research-anchored)

The pipeline follows the 2026 synthetic-data norm: anchor synthetic samples
against observable structure, then augment.

1. **Real-event harvest** — `bootstrap_action_history.py` scans
   `server/data/{vast_events,agent_audit,auto_improve.log}.jsonl` for anything
   resembling a dock-app activation. Real signal beats synthetic every time.
2. **Valid-id grounding** — Reads `server/jarvis_live.html` to extract the
   actual list of dock app ids. Synthesized events never use ids the UI
   doesn't ship.
3. **Markov-style habit chains** — Seven canonical habit chains
   (morning-ritual, care-window, agent-planning, builder, knowledge,
   system-health, evening-wind-down) are sampled with realistic hour-of-day
   windows. This gives the predictor honest `(hour, dow)` signal to learn
   from instead of uniform noise.
4. **Append to `action_history.jsonl`** — Never overwrites unless `--reset`
   is explicitly passed.

The classifier itself (in `motor_predictor.py`) uses the 2026-baseline approach
for small-sample structured prediction:

- `HashingVectorizer(n_features=512, ngram_range=(1,2))` over the last-N
  action-id sequence — new dock ids added later never break the model.
- `LogisticRegression(class_weight='balanced')` for the head. The few-shot
  literature (analyticsvidhya, mobidev 2025–2026) calls this the right
  baseline before reaching for embeddings/SetFit/etc.
- `StratifiedKFold` with rare-class collapse for honest accuracy reporting.
- Top-1 accuracy gate at `MOTOR_TARGET_ACC=0.40` — a 12x random uplift over
  ~30 dock apps. Below the gate the model still ranks candidates but the
  UI flag `gate_ready=False` tells the front-end to pre-highlight only,
  never auto-select.

## Plugging in real data (zero-friction handoff)

Nothing else is needed — this gap is fully software:

1. Every dock-app open posts to `POST /v1/motor/record` (already wired in
   `server/jarvis_live.html`). Real user events stream into the same
   `action_history.jsonl` the bootstrap script seeds.
2. A nightly cron / pm2 cycle can call `python3 scripts/train_motor_predictor.py`
   to refresh the model.
3. As real events accumulate, the synthetic floor naturally washes out — the
   classifier increasingly fits the owner's actual habits.

## CLI reference

```bash
# Bootstrap (defaults: append, target=100, seed=1337):
python3 scripts/bootstrap_action_history.py
python3 scripts/bootstrap_action_history.py --target 200
python3 scripts/bootstrap_action_history.py --dry-run
python3 scripts/bootstrap_action_history.py --reset     # destructive (opt-in only)

# Train:
python3 scripts/train_motor_predictor.py
python3 scripts/train_motor_predictor.py --eval-only
python3 scripts/train_motor_predictor.py --predict app-library app-worklist
python3 scripts/train_motor_predictor.py --top-k 5
```

## Re-using this for other classifiers

The same bootstrap pattern (real-harvest -> valid-id grounding ->
Markov-chain synthetic -> append-only jsonl) is the recommended
shape for any future Jarvis small-sample classifier (mode predictor,
ritual reranker, friction-zone tagger, etc.). Copy
`bootstrap_action_history.py`, replace `HABIT_CHAINS` + the source jsonl
list with your domain's analogue, and you're done.

## Sources (research basis)

- Synthetic data for AI training (2026 outlook):
  https://www.aicerts.ai/blog/why-synthetic-data-is-the-smartest-move-for-ai-training-in-2026-and-how-to-stay-ahead/
- Synthetic data decision guide (2026):
  https://www.digitalapplied.com/blog/synthetic-data-generation-llm-training-decision-guide-2026
- User simulation for synthetic-data generation:
  https://arxiv.org/pdf/2306.08550
- Clickstream mining baselines (Markov + cSPADE):
  https://roundtable.datascience.salon/clickstream-data-mining-with-markov-chain-and-cspade
- Few-shot learning intro (sklearn-friendly baselines):
  https://www.analyticsvidhya.com/blog/2021/05/an-introduction-to-few-shot-learning/
