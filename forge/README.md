# APEX Forge — Autonomous App Evolution Agent

A modular agent that scans this codebase, researches improvements with free APIs,
asks a **local open-source model** (Ollama — no cloud credits) to improve files,
and lands changes through a **reviewable, test-gated pipeline**. Built to run on
your own K3s cluster.

## How it maps to the design brief

| Requested capability | How Forge does it |
|---|---|
| Runs in K3s on your machines | `forge/deploy/forge-k3s.yaml` (StatefulSet) |
| Ollama + open-source models, free/local | `OLLAMA_URL` + `FORGE_MODEL` (default `deepseek-coder:6.7b`) |
| Scans codebase | `iter_source_files()` with include/exclude + size caps |
| Researches improvements | DuckDuckGo + arXiv + GitHub trending (best-effort, never fatal) |
| Writes pull requests automatically | branch + `gh pr create` (opt-in `FORGE_OPEN_PR`) |
| Restarts every hour with fresh context | exits cleanly at `FORGE_MAX_RUNTIME_S`; K8s restarts it; init-container re-clones |
| No self-replication, forks for parallelism | never spawns itself; scale via K8s replicas + **disjoint sharding** |

## What's different from a naive rewrite-loop (and why it matters)

A loop that overwrites source files in place with a 7B model and `git push`es every
change will **corrupt your codebase** (truncated files, broken builds, racing
replicas). Forge keeps the autonomy but adds hard guarantees:

- **Never touches `main`.** Applies only on a `forge/*` branch; refuses protected
  branches. Changes reach `main` via PR, under your review.
- **Test-gated.** After applying a batch it runs `FORGE_LINT_CMD` then
  `FORGE_TEST_CMD`; if either fails, the **entire batch is reverted**.
- **Output validation.** Rejects empty output, model refusals, markdown leakage,
  suspicious truncation (<50% of the original) or bloat, and brace imbalance —
  *before* writing to disk.
- **Backups** to `.forge/backups/`, never alongside source.
- **Concurrency-safe.** File lock + ordinal-based sharding so parallel replicas
  work on disjoint files.
- **Dry-run by default.** Applying, pushing, and PRs are explicit opt-ins.

## WhatsApp approval (the point: automated, but you tap APPROVE)

`FORGE_APPROVAL=whatsapp` keeps the loop fully automated **without** blind
pushes. Each cycle the agent:

1. generates an improvement, puts it on its **own `forge/*` branch**, runs the
   test/lint gates, commits, and (optionally) pushes that branch;
2. records a PENDING change and **messages your WhatsApp** with the diff:
   `🔥 APEX Forge change a1b2c3d4 … Reply: APPROVE a1b2c3d4 or REJECT a1b2c3d4`;
3. moves on — it never merges to `main` itself.

You reply **`APPROVE a1b2c3d4`** (or just `APPROVE`/`👍` if one is pending) from
your phone. The inbound **webhook** (`forge.webhook`) then merges that branch
into `main` and pushes it. `REJECT` discards the branch. So `main` only ever
gets code you green-lit from your phone.

```
   agent ──propose branch──▶ git          agent ──"APPROVE a1b2"?──▶ 📱 WhatsApp
        └──notify──▶ 📱                         📱 ──reply──▶ webhook ──merge+push──▶ main
```

### Configure the channel

Pick a provider via `FORGE_WHATSAPP_PROVIDER` (`twilio` or `meta`); with neither
set it logs to the console so you can dry-run the whole flow.

| Provider | Env |
|---|---|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `FORGE_WHATSAPP_TO` |
| Meta Cloud API | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `FORGE_WHATSAPP_TO`, `WHATSAPP_VERIFY_TOKEN` |

Run the webhook (point your Twilio/Meta inbound URL at it):

```bash
uvicorn forge.webhook:app --host 0.0.0.0 --port 8088
# GET  /forge/whatsapp/webhook  → Meta verification handshake
# POST /forge/whatsapp/webhook  → inbound replies (Twilio form or Meta JSON)
# GET  /forge/approvals         → audit the queue
```

Enable on the agent:

```bash
APP_ROOT="$(pwd)" FORGE_APPLY=1 FORGE_PUSH=1 \
FORGE_APPROVAL=whatsapp FORGE_WHATSAPP_PROVIDER=twilio \
FORGE_WHATSAPP_TO="+61400000000" FORGE_BASE_BRANCH=main \
FORGE_TEST_CMD="npm run test --silent && python -m pytest server/tests -q" \
python3 -m forge.forge_agent
```

## Run it locally

```bash
# 1) Local model (free, no credits)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull deepseek-coder:6.7b      # or codellama:7b
ollama serve &

# 2) Dry-run report — scans + proposes, writes NOTHING
APP_ROOT="$(pwd)" python3 -m forge.forge_agent

# 3) Apply for real — on a forge/* branch, test-gated, with a PR
APP_ROOT="$(pwd)" \
FORGE_APPLY=1 FORGE_PUSH=1 FORGE_OPEN_PR=1 \
FORGE_TEST_CMD="npm run test --silent && python -m pytest server/tests -q" \
FORGE_LINT_CMD="npm run lint --silent" \
FORGE_MAX_CYCLES=1 \
python3 -m forge.forge_agent
```

## Key environment variables

| Var | Default | Meaning |
|---|---|---|
| `APP_ROOT` | `.` | Repo to evolve |
| `OLLAMA_URL` / `FORGE_MODEL` | `localhost:11434` / `deepseek-coder:6.7b` | Local model |
| `FORGE_APPLY` | `0` | `1` = write changes (on a `forge/*` branch) |
| `FORGE_PUSH` / `FORGE_OPEN_PR` | `0` / `0` | push branch / open a PR via `gh` |
| `FORGE_TEST_CMD` / `FORGE_LINT_CMD` | empty | gates run before keeping a batch |
| `FORGE_INTERVAL_S` | `1800` | seconds between cycles |
| `FORGE_MAX_RUNTIME_S` | `3600` | exit (and let K8s restart) for fresh context |
| `FORGE_MAX_FILES` | `8` | files improved per cycle |
| `FORGE_SHARD_INDEX` / `FORGE_SHARD_COUNT` | `0` / `1` | disjoint work split across replicas |
| `FORGE_RESEARCH` | `1` | enable DuckDuckGo/arXiv/GitHub research |

## Deploy on K3s

```bash
kubectl create namespace forge
# (deploy Ollama in-cluster as service "ollama" on :11434, or point OLLAMA_URL at a host)
docker build -t forge-agent:latest -f forge/Dockerfile .
k3s ctr images import <(docker save forge-agent:latest)
kubectl apply -f forge/deploy/forge-k3s.yaml
kubectl scale statefulset/forge-agent -n forge --replicas=3   # + set FORGE_SHARD_COUNT=3
```

Start in dry-run (`FORGE_APPLY=0`), watch the logged cycle reports, and only then
flip `FORGE_APPLY=1` once you trust the proposed diffs.
