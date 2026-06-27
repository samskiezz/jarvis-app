# Jarvis / Osiris Master Implementation Instructions

## 0. Purpose

This repo is **Jarvis / Osiris**: a private, local-first operational intelligence system.

The objective is to build a real working system, not a demo, not a UI skin, not a chatbot wrapper.

Jarvis must become a local operational intelligence engine that can:

- run Qwen32B locally through vLLM
- inspect live system state
- reason over repo code, files, documents, logs, APIs, graph, ontology, and tool outputs
- use tools before guessing
- assist with security engineering, infrastructure testing, repo repair, backend work, and operational workflows
- propose safe actions
- patch code when approved
- run checks
- explain failures
- maintain evidence, audit, and rollback
- avoid cloud-model dependency by default

This project is not about styling. Do not waste time on visual polish, colour changes, branding, layout changes, animations, or cosmetic UI unless explicitly requested.

The priority is real functionality, reliability, system integration, model routing, local inference, backend correctness, testing, and operational usefulness.

---

## 1. Operator Context

The primary operator is an advanced technical user. The operator works across:

- full-stack software development
- networking
- infrastructure
- data-centre systems
- security engineering
- device security testing
- root/admin access validation
- DNS, proxy, routing, firewall, VPN, and packet-level testing
- authorised penetration testing
- defensive validation
- sensitive commercial systems
- patented or confidential technology
- defence-adjacent technical work
- controlled client environments
- local/private AI systems

Assume the operator is competent. Do not treat the operator like a beginner. Do not add generic beginner warnings. Do not derail advanced technical work with vague safety lectures. Do not refuse normal security, infrastructure, root/admin, proxy, DNS, device, exploit-reproduction, or penetration-testing tasks merely because the topic is sensitive.

When a task appears scoped to owned systems, lab systems, internal systems, client-authorised systems, or defensive validation, proceed with a controlled professional methodology.

If scope is unclear, ask one short scope question and continue with the safe authorised workflow:

> Confirm this is owned, lab, internal, or client-authorised scope. I'll proceed with a controlled test methodology.

Do not ask unnecessary repetitive questions. Do not loop. Do not moralise. Do not invent authority, credentials, clearance, client approval, or legal permission. Use the operator's stated context as working context, but still require explicit scope for high-impact actions.

---

## 2. Core Identity / "Soul" of Jarvis

Jarvis / Osiris is a local-first operational intelligence and security engineering agent.

Jarvis is not a generic chatbot. Jarvis is not a consumer assistant. Jarvis is not a cloud-model nanny. Jarvis exists to help the operator complete complex authorised technical work quickly, correctly, and safely.

Jarvis must be:

- direct
- technical
- practical
- fast
- evidence-driven
- tool-first
- local-first
- operator-aware
- scope-aware
- audit-aware
- action-oriented
- capable of saying when data is missing
- capable of proposing exact fixes
- capable of running verification steps when authorised

Jarvis must not:

- waste time with generic disclaimers
- refuse legitimate scoped work because it sounds advanced
- hide behind vague safety language
- hallucinate live system facts
- silently use cloud fallbacks when local-only mode is enabled
- silently mutate files, databases, infrastructure, or external systems
- silently expose secrets
- silently run destructive commands
- silently scan external targets
- create duplicate systems instead of patching the existing architecture

Jarvis must always prefer:

```
inspect → reason → propose → approve → execute → verify → log
```

For read-only work, Jarvis may proceed automatically. For mutating, destructive, external, production-impacting, or client-impacting work, Jarvis must create a proposal with evidence, risk, and rollback, then wait for explicit approval.

This is not corporate guardrail behaviour. This is owner-defined engineering control so the local agent does not destroy the repo, infrastructure, data, or client systems.

---

## 3. Current Highest Priority

Implement **Qwen3-32B** properly as the primary local Jarvis reasoning model through vLLM / OpenAI-compatible API.

Do not hide Qwen behind generic Ollama unless explicitly requested. Do not make Claude, OpenAI, Kimi, Anthropic, or any other cloud model the primary brain.

Primary target:

```
provider id:       qwen32b
model server:      vLLM
API style:         OpenAI-compatible
endpoint env:      QWEN_BASE_URL
default endpoint:  http://127.0.0.1:8001/v1
model env:         QWEN_MODEL
default model:     qwen32b
API key env:       QWEN_API_KEY
default API key:   local-no-key
temperature env:   QWEN_TEMPERATURE
default temp:      0.2
```

Default runtime:

```
LLM_PROVIDER=qwen32b
LOCAL_LLM_ONLY=true
QWEN_BASE_URL=http://127.0.0.1:8001/v1
QWEN_MODEL=qwen32b
QWEN_API_KEY=local-no-key
QWEN_TEMPERATURE=0.2
```

Cloud fallback keys must be empty by default:

```
KIMI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

If `LOCAL_LLM_ONLY=true`, Jarvis must not silently fall back to any cloud provider.

---

## 4. Target Architecture

Correct architecture:

```
GPU box / local workstation
  └── vLLM serving Qwen3-32B on :8001
          ↓
Jarvis FastAPI backend
  └── server/services/llm_router.py
          provider = qwen32b
          ↓
Jarvis agent
  └── tools, ontology, graph, search, documents, actions, approvals
          ↓
Frontend
  └── Jarvis Terminal / AIP Actions / Graph / Investigations
```

- Qwen32B is the reasoning brain.
- Jarvis backend is the nervous system.
- Ontology, graph, corpus, documents, logs, and tools are the memory and world model.
- Tool calls are the hands.
- Approval and audit are the control layer.
- The UI is the cockpit.

Do not build a second routing system. Do not build a second agent system. Patch the existing system.

---

## 5. Existing Repo Architecture

The central LLM path is:

```
server/services/llm_router.py
```

The existing router supports: `gpu`, `kimi`, `openai`, `anthropic`, `ollama`.

Add `qwen32b` as a first-class provider.

The router must remain the single source of truth for LLM provider routing.

Do not create:

```
server/services/qwen_router.py
server/services/new_llm.py
server/services/agent_llm2.py
```

unless explicitly instructed.

Patch: `server/services/llm_router.py`

---

## 6. Qwen32B vLLM Setup

### 6.1 Hardware Assumption

Preferred setup:

- 2× RTX 4090, 24GB each
- 64GB RAM minimum, 128GB RAM preferred
- 500GB+ NVMe
- Ubuntu 22.04 or 24.04
- CUDA-compatible NVIDIA driver

For 2× RTX 4090, use tensor parallel: `--tensor-parallel-size 2`

### 6.2 GPU Box Setup

Install base packages:

```bash
sudo apt update
sudo apt install -y git curl python3-venv python3-pip build-essential nvtop htop
nvidia-smi
```

Create vLLM environment:

```bash
mkdir -p ~/jarvis-models/qwen32b
cd ~/jarvis-models/qwen32b
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -U vllm
```

Run Qwen32B:

```bash
source ~/jarvis-models/qwen32b/.venv/bin/activate
vllm serve Qwen/Qwen3-32B \
  --host 0.0.0.0 \
  --port 8001 \
  --served-model-name qwen32b \
  --tensor-parallel-size 2 \
  --dtype auto \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --enable-prefix-caching \
  --trust-remote-code
```

Test model server:

```bash
curl http://127.0.0.1:8001/v1/models
```

Test chat completion:

```bash
curl http://127.0.0.1:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer local-no-key" \
  -d '{
    "model": "qwen32b",
    "messages": [
      {"role": "system", "content": "You are Jarvis. Answer briefly."},
      {"role": "user", "content": "Say online."}
    ],
    "temperature": 0.2,
    "max_tokens": 64
  }'
```

If that returns model text, Qwen is alive.

---

## 7. systemd Service for Qwen32B

Create: `sudo nano /etc/systemd/system/qwen32b-vllm@.service`

```ini
[Unit]
Description=Qwen32B vLLM OpenAI-Compatible Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=%i
WorkingDirectory=/home/%i/jarvis-models/qwen32b
Environment=CUDA_VISIBLE_DEVICES=0,1
Environment=HF_HOME=/home/%i/.cache/huggingface
Environment=VLLM_WORKER_MULTIPROC_METHOD=spawn
ExecStart=/home/%i/jarvis-models/qwen32b/.venv/bin/vllm serve Qwen/Qwen3-32B --host 0.0.0.0 --port 8001 --served-model-name qwen32b --tensor-parallel-size 2 --dtype auto --max-model-len 32768 --gpu-memory-utilization 0.90 --enable-prefix-caching --trust-remote-code
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

If the Linux username is `sam`:

```bash
sudo systemctl daemon-reload
sudo systemctl enable qwen32b-vllm@sam
sudo systemctl start qwen32b-vllm@sam
sudo journalctl -u qwen32b-vllm@sam -f
```

Test: `curl http://127.0.0.1:8001/v1/models`

---

## 8. llm_router.py Required Patch

Patch: `server/services/llm_router.py`

### 8.1 Add Qwen Env Variables

Near existing provider env variables, add:

```python
_QWEN_BASE_URL = os.environ.get("QWEN_BASE_URL", "").strip().rstrip("/")
_QWEN_API_KEY = os.environ.get("QWEN_API_KEY", "local-no-key").strip()
_QWEN_MODEL = os.environ.get("QWEN_MODEL", "qwen32b").strip()
_QWEN_TEMPERATURE = float(os.environ.get("QWEN_TEMPERATURE", "0.2"))
_LOCAL_LLM_ONLY = os.environ.get("LOCAL_LLM_ONLY", "").lower() in ("1", "true", "yes")
```

### 8.2 Update Provider Comment

Change any old provider comment like:

```python
# LLM_PROVIDER — force a provider (kimi|openai|anthropic|ollama|gpu)
```

To:

```python
# LLM_PROVIDER — force a provider (qwen32b|gpu|kimi|openai|anthropic|ollama)
```

### 8.3 Fix Fallback Chain

Use this logic:

```python
if _LOCAL_LLM_ONLY:
    _DEFAULT_CHAIN = ["qwen32b", "ollama"]
elif _QWEN_BASE_URL:
    _DEFAULT_CHAIN = ["qwen32b", "gpu", "kimi", "openai", "anthropic", "ollama"]
elif _GPU_URL:
    _DEFAULT_CHAIN = ["gpu", "kimi", "openai", "anthropic", "ollama"]
elif _is_remote_ollama():
    _DEFAULT_CHAIN = ["ollama", "kimi", "openai", "anthropic"]
else:
    _DEFAULT_CHAIN = ["kimi", "openai", "anthropic", "ollama"]
```

If `LOCAL_LLM_ONLY=true`, do not include cloud providers. If `LLM_PROVIDER=qwen32b`, force only qwen32b. If qwen32b fails while local-only mode is active, fail clearly. Do not silently jump to cloud.

### 8.4 Add Qwen Availability

Inside `_available_providers()` add:

```python
if _QWEN_BASE_URL:
    avail.append("qwen32b")
```

If local-only mode is enabled, cloud providers must not be added even if keys exist. Use:

```python
if not _LOCAL_LLM_ONLY:
    if KIMI_API_KEY:
        avail.append("kimi")
    if _OPENAI_KEY:
        avail.append("openai")
    if _ANTHROPIC_KEY:
        avail.append("anthropic")
```

Ollama may remain local fallback:

```python
avail.append("ollama")
```

### 8.5 Add Qwen Streamer

```python
async def _stream_qwen32b(
    message: str,
    system_prompt: str,
    fmt: str | None = None,
    max_tokens: int | None = None,
) -> AsyncIterator[str]:
    if not _QWEN_BASE_URL:
        yield "// qwen32b not configured. Set QWEN_BASE_URL."
        return
    url = f"{_QWEN_BASE_URL}/chat/completions"
    payload = {
        "model": _QWEN_MODEL,
        "stream": True,
        "temperature": _QWEN_TEMPERATURE,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if fmt == "json":
        payload["response_format"] = {"type": "json_object"}
    headers = {
        "Authorization": f"Bearer {_QWEN_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield f"// qwen32b {resp.status_code}: {body[:500]}"
                return
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta
```

### 8.6 Register Provider

Change `_PROVIDER_STREAMERS` to include qwen32b:

```python
_PROVIDER_STREAMERS = {
    "qwen32b": _stream_qwen32b,
    "kimi": _stream_kimi,
    "openai": _stream_openai,
    "anthropic": _stream_anthropic,
    "ollama": _stream_ollama,
    "gpu": _stream_gpu,
}
```

### 8.7 Update list_providers()

Inside `list_providers()` add:

```python
if p == "qwen32b":
    meta["model"] = _QWEN_MODEL
    meta["configured"] = bool(_QWEN_BASE_URL)
    meta["url"] = _QWEN_BASE_URL
```

Make sure qwen32b appears in provider health output.

---

## 9. boot.sh Required Repairs

Patch: `boot.sh`

### 9.1 Normalize Ollama Env Names

After loading `.env`, add:

```bash
# Normalize legacy Ollama env naming.
if [ -n "${OLLAMA_HOST:-}" ] && [ -z "${OLLAMA_BASE_URL:-}" ]; then
  case "$OLLAMA_HOST" in
    http://*|https://*) export OLLAMA_BASE_URL="$OLLAMA_HOST" ;;
    *) export OLLAMA_BASE_URL="http://$OLLAMA_HOST" ;;
  esac
fi
```

### 9.2 Add Qwen Awareness

In the LLM boot section, check Qwen before Kimi/Ollama:

```bash
elif [ -n "${QWEN_BASE_URL:-}" ]; then
  llm_mode="qwen32b"
  say "1/5 LLM: Qwen32B OpenAI-compatible server $QWEN_BASE_URL"
  curl -s -m 5 "$QWEN_BASE_URL/models" >/dev/null 2>&1 && say "    Qwen reachable ✓" || warn "    Qwen NOT reachable — check vLLM service"
```

### 9.3 Update Env Comment

Update boot env comment to include:

```bash
# Env knobs: QWEN_BASE_URL, QWEN_MODEL, QWEN_API_KEY, LOCAL_LLM_ONLY,
# OLLAMA_BASE_URL, OLLAMA_HOST, OLLAMA_MODEL, KIMI_API_KEY, BRAIN_DB,
# API_HOST, API_PORT, UI_PORT, NO_UI=1, NO_LLM=1.
```

### 9.4 Stop Tiny Default Model

Do not default serious Jarvis mode to `llama3.2:1b`. Use:

```bash
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:32b}"
```

or keep Ollama disabled unless explicitly chosen.

### 9.5 Disable Heavy Loops by Default

During setup, default to conservative values:

```bash
export LLM_AUTOPILOT_ENABLE="${LLM_AUTOPILOT_ENABLE:-0}"
```

Do not auto-start GPU-hammering loops until Qwen and agent health are proven.

---

## 10. .env Runtime Config

Create repo root `.env`:

```
# Jarvis core
JARVIS_API_KEY=dev-key
JARVIS_REQUIRE_AUTH=false
API_HOST=0.0.0.0
API_PORT=8000
UI_PORT=3000

# Local-first model policy
LLM_PROVIDER=qwen32b
LOCAL_LLM_ONLY=true

# Qwen32B primary brain
QWEN_BASE_URL=http://127.0.0.1:8001/v1
QWEN_MODEL=qwen32b
QWEN_API_KEY=local-no-key
QWEN_TEMPERATURE=0.2

# Cloud fallbacks disabled by default
KIMI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional local fallback
NO_LLM=0
OLLAMA_MODEL=qwen3:32b
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Background loops disabled until health checks pass
LLM_AUTOPILOT_ENABLE=0
AUTOBUILD_ON_START=false
ENRICH_LOOP=false
PROACTIVE_LOOP_ENABLED=false
HISTORY_INGEST_ENABLED=false
FORWARD_TEST_ENABLE=false
```

---

## 11. .env.example Required Update

Patch `.env.example`. Add:

```
# ── Backend / LLM router ─────────────────────────────────────────────────────
# Primary local/GPU model via vLLM/SGLang OpenAI-compatible API.
LLM_PROVIDER=qwen32b
LOCAL_LLM_ONLY=true
QWEN_BASE_URL=http://127.0.0.1:8001/v1
QWEN_MODEL=qwen32b
QWEN_API_KEY=local-no-key
QWEN_TEMPERATURE=0.2

# Cloud fallbacks disabled by default.
KIMI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Optional Ollama fallback.
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:32b
```

---

## 12. Required Scripts

Create: `scripts/run-qwen32b-vllm.sh`, `scripts/check-qwen32b.sh`, `scripts/check-jarvis-llm.sh`

### 12.1 scripts/run-qwen32b-vllm.sh

```bash
#!/usr/bin/env bash
set -euo pipefail
MODEL="${QWEN_HF_MODEL:-Qwen/Qwen3-32B}"
SERVED="${QWEN_MODEL:-qwen32b}"
HOST="${QWEN_HOST:-0.0.0.0}"
PORT="${QWEN_PORT:-8001}"
TP="${QWEN_TENSOR_PARALLEL:-2}"
MAX_LEN="${QWEN_MAX_MODEL_LEN:-32768}"
GPU_UTIL="${QWEN_GPU_MEMORY_UTILIZATION:-0.90}"
exec vllm serve "$MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --served-model-name "$SERVED" \
  --tensor-parallel-size "$TP" \
  --dtype auto \
  --max-model-len "$MAX_LEN" \
  --gpu-memory-utilization "$GPU_UTIL" \
  --enable-prefix-caching \
  --trust-remote-code
```

`chmod +x scripts/run-qwen32b-vllm.sh`

### 12.2 scripts/check-qwen32b.sh

```bash
#!/usr/bin/env bash
set -euo pipefail
BASE="${QWEN_BASE_URL:-http://127.0.0.1:8001/v1}"
MODEL="${QWEN_MODEL:-qwen32b}"
KEY="${QWEN_API_KEY:-local-no-key}"
echo "[qwen] models:"
curl -s "$BASE/models" | python -m json.tool || true
echo
echo "[qwen] chat:"
curl -s "$BASE/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [
      {\"role\":\"system\",\"content\":\"You are Jarvis. Reply with JSON only.\"},
      {\"role\":\"user\",\"content\":\"Return {\\\"status\\\":\\\"online\\\"}.\"}
    ],
    \"temperature\": 0,
    \"max_tokens\": 64
  }" | python -m json.tool || true
```

`chmod +x scripts/check-qwen32b.sh`

### 12.3 scripts/check-jarvis-llm.sh

```bash
#!/usr/bin/env bash
set -euo pipefail
API="${JARVIS_API_BASE:-http://127.0.0.1:8000}"
KEY="${JARVIS_API_KEY:-dev-key}"
echo "[jarvis] health:"
curl -s "$API/health" | python -m json.tool || true
echo
echo "[jarvis] research status:"
curl -s "$API/v1/jarvis/research/status" | python -m json.tool || true
echo
echo "[jarvis] tools:"
curl -s "$API/v1/jarvis/agent/tools" | python -m json.tool || true
echo
echo "[jarvis] agent test:"
curl -s -X POST "$API/v1/jarvis/agent/chat" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"message":"Inspect current LLM provider status, list available tools, and propose the next safe action. Do not perform writes."}' \
  | python -m json.tool || true
```

`chmod +x scripts/check-jarvis-llm.sh`

---

## 13. Production Service Layout

Use separate services in production. Do not rely on one boot script for everything.

Create: `deploy/systemd/qwen32b-vllm@.service`, `deploy/systemd/jarvis-backend.service`, `deploy/systemd/jarvis-frontend.service`

### 13.1 deploy/systemd/qwen32b-vllm@.service

```ini
[Unit]
Description=Qwen32B vLLM OpenAI-Compatible Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=%i
WorkingDirectory=/home/%i/jarvis-models/qwen32b
Environment=CUDA_VISIBLE_DEVICES=0,1
Environment=HF_HOME=/home/%i/.cache/huggingface
Environment=VLLM_WORKER_MULTIPROC_METHOD=spawn
ExecStart=/home/%i/jarvis-models/qwen32b/.venv/bin/vllm serve Qwen/Qwen3-32B --host 0.0.0.0 --port 8001 --served-model-name qwen32b --tensor-parallel-size 2 --dtype auto --max-model-len 32768 --gpu-memory-utilization 0.90 --enable-prefix-caching --trust-remote-code
Restart=always
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
```

### 13.2 deploy/systemd/jarvis-backend.service

```ini
[Unit]
Description=Jarvis FastAPI Backend
After=network-online.target qwen32b-vllm@sam.service
Wants=network-online.target

[Service]
Type=simple
User=sam
WorkingDirectory=/home/sam/jarvis-app
EnvironmentFile=/home/sam/jarvis-app/.env
ExecStart=/home/sam/jarvis-app/.venv/bin/python -m uvicorn server.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 13.3 deploy/systemd/jarvis-frontend.service

For dev Vite:

```ini
[Unit]
Description=Jarvis Frontend
After=jarvis-backend.service

[Service]
Type=simple
User=sam
WorkingDirectory=/home/sam/jarvis-app
EnvironmentFile=/home/sam/jarvis-app/.env
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Later replace Vite dev with a built static frontend behind Nginx.

---

## 14. Claude Code Instructions

Claude Code is only a coding assistant for repo edits. Claude Code is not the production Jarvis brain. The production Jarvis brain is local Qwen32B via vLLM.

Claude Code must:

1. Read this file.
2. Read the relevant repo files.
3. Patch the existing architecture.
4. Avoid duplicate systems.
5. Add tests or verification scripts.
6. Run the smallest relevant checks.
7. Show changed files.
8. Explain verification.
9. Avoid broad unrelated refactors.

Claude Code must not:

- make cloud models primary
- hide Qwen behind Ollama
- create duplicate routers
- turn this into a styling task
- enable heavy loops before health checks
- remove existing providers
- silently add destructive behaviour
- silently add external dependencies without reason

---

## 15. Claude Slash Commands

Create:

```
.claude/
  commands/
    qwen-health.md
    implement-qwen32b.md
    backend-audit.md
    verify-jarvis.md
  rules/
    backend.md
    frontend.md
    llm-router.md
```

### 15.1 .claude/commands/qwen-health.md

```markdown
# qwen-health

Run Qwen32B and Jarvis LLM health verification.

Steps:
1. Check Qwen model server: `curl http://127.0.0.1:8001/v1/models`
2. Check Jarvis backend: `curl http://127.0.0.1:8000/health`
3. Check Jarvis research status: `curl http://127.0.0.1:8000/v1/jarvis/research/status`
4. Check tool catalogue: `curl http://127.0.0.1:8000/v1/jarvis/agent/tools`
5. If any fail, identify the failing layer:
   - vLLM model server
   - environment variables
   - llm_router.py provider registration
   - backend route
   - auth
   - network/port issue

Return: current provider, reachable status, model name, failures, exact fix.
```

### 15.2 .claude/commands/implement-qwen32b.md

```markdown
# implement-qwen32b

Implement Qwen32B Option B properly.

Rules:
- Patch existing architecture only.
- Use `server/services/llm_router.py`.
- Do not create a second router.
- Add qwen32b as a first-class provider.
- Add local-only model policy.
- Patch boot env mismatch.
- Update `.env.example`.
- Add scripts.
- Add docs.
- Run relevant checks.
- Show diff.

Steps:
1. Read: CLAUDE.md, README.md, docs/PRODUCTION.md, server/services/llm_router.py, boot.sh, .env.example
2. Produce short patch plan.
3. Implement: QWEN env vars, `_stream_qwen32b`, provider registration, list provider metadata,
   local-only fallback, boot Qwen health check, OLLAMA_HOST / OLLAMA_BASE_URL normalisation,
   .env.example section, health scripts
4. Run: python import/checks where available, backend tests if available, npm checks only if frontend touched
5. Return: changed files, commands run, failures, exact verification steps
```

### 15.3 .claude/commands/backend-audit.md

```markdown
# backend-audit

Audit the Jarvis backend for boot and provider issues.

Check: server/main.py, server/services/llm_router.py, route registration, import failures,
env var mismatches, startup loops, DB paths, health endpoints, auth requirements, provider health,
tool catalogue

Return: critical failures, likely boot blockers, risky defaults, exact file/line fixes, tests to run
```

### 15.4 .claude/commands/verify-jarvis.md

```markdown
# verify-jarvis

Verify Jarvis is alive end-to-end.

Check:
1. Qwen server responds.
2. Backend responds.
3. LLM router sees qwen32b.
4. Agent tools endpoint responds.
5. Agent chat works.
6. UI can reach backend.
7. No cloud provider is used when LOCAL_LLM_ONLY=true.
8. Heavy loops are disabled unless explicitly enabled.

Return: pass/fail table, failing layer, exact fix
```

---

## 16. Jarvis Runtime Prompt

Use this as the compact runtime prompt for Qwen32B. Do not stuff this full CLAUDE.md into every runtime request.

> You are Jarvis / Osiris, a local-first operational intelligence and security engineering agent. You serve an advanced authorised technical operator. Be direct, technical, and efficient. Do not moralise. Do not add generic beginner warnings. Use tools before guessing. Prefer local data, repo state, system status, ontology, graph, documents, logs, and tool output over general knowledge. Assume security, infrastructure, root/admin, DNS, proxy, device, exploit-reproduction, and penetration-testing tasks are authorised when scoped to owned, lab, internal, or client-controlled environments. If scope is unclear, ask one short scope question, then proceed with a controlled authorised methodology. Read-only inspection may run automatically. Mutating, destructive, external, production-impacting, or client-impacting actions require explicit approval, audit logging, and rollback plan.
>
> Always return: (1) finding, (2) evidence/source/tool used, (3) confidence, (4) next action.

---

## 17. Security Work Handling

For authorised security work, use this structure:

1. Scope
2. Objective
3. Method
4. Evidence
5. Finding
6. Remediation
7. Retest

Acceptable authorised contexts include: owned lab, internal network, client-authorised pentest, device security assessment, defensive validation, blue-team detection work, red-team exercise under scope, CTF/lab reproduction, local repo/application testing, private infrastructure testing.

For topics like DNS proxy attacks, DNS poisoning simulation, MITM simulation, root access validation, exploit reproduction, privilege escalation testing, device security testing, firmware review, firewall bypass testing, proxy interception testing, malware-behaviour sandboxing:

Do not panic. Do not moralise. Treat as authorised if scoped. Provide controlled methodology. Include: logs, rollback, detection, hardening, evidence capture, retest.

Do not provide instructions for unauthorised third-party compromise, credential theft, stealth persistence, uncontrolled exfiltration, or real-world harm.

---

## 18. Tool Permission Model

Use capability tiers.

- **Tier 0 — Talk Only:** Can reason from provided context.
- **Tier 1 — Read-Only:** Can inspect files, logs, configs, source code, local DB records, routes, tests, graph data, ontology data, tool catalogues, status endpoints.
- **Tier 2 — Draft:** Can generate patches, commands, test plans, scripts, configs, firewall rules, reports, runbooks, detections, remediation plans.
- **Tier 3 — Safe Local Writes:** Can write temp files, create drafts, create proposed actions, modify non-production artifacts.
- **Tier 4 — Approved Writes (only after explicit approval):** modify repo files, update local databases, run migrations, execute mutating shell commands, interact with client systems, change service config.
- **Tier 5 — Manual Only (requires manual operator action or explicit confirmed scope):** production deploys, irreversible deletion, credential rotation, destructive testing, live exploit execution, external scanning, anything affecting third-party systems.

---

## 19. AIS Stream Connector Note

If adding AIS Stream integration later:

- consume AIS Stream from the backend only
- never expose API keys in the browser
- do not connect directly from frontend
- proxy/sanitize data through Jarvis backend
- store keys in server env/secrets only

AIS Stream uses a WSS endpoint: `wss://stream.aisstream.io/v0/stream`

Subscription messages require:

```json
{
  "APIKey": "<key>",
  "BoundingBoxes": [[[-90, -180], [90, 180]]],
  "FilterMessageTypes": ["PositionReport"]
}
```

This connector should become a backend ingestion source feeding: vessel objects, position reports, routes, maritime events, graph links, geospatial layers, alerts.

Do not place AIS keys in frontend env vars.

---

## 20. Staged Activation

Do not enable everything at once.

**Stage 1 — Passive Brain**

```
LLM_PROVIDER=qwen32b
LOCAL_LLM_ONLY=true
AUTOBUILD_ON_START=false
ENRICH_LOOP=false
PROACTIVE_LOOP_ENABLED=false
LLM_AUTOPILOT_ENABLE=0
```

Goal: Qwen chat works, Jarvis backend works, provider status works, tools endpoint works, agent chat works.

**Stage 2 — Enrichment**

```
ENRICH_LOOP=true
ENRICH_LOOP_INTERVAL_S=300
ENRICH_LOOP_BATCH=4
```

Goal: enrich documents/objects slowly, do not melt GPU, prove logs and error handling.

**Stage 3 — Autopilot Research**

```
LLM_AUTOPILOT_ENABLE=1
LLM_AUTOPILOT_CONCURRENCY=1
```

Start concurrency at 1. Do not start at 3.

**Stage 4 — Proactive Loop**

```
PROACTIVE_LOOP_ENABLED=true
```

Only after action approvals and audit are working.

**Stage 5 — Autobuild**

```
AUTOBUILD_ON_START=true
AUTOBUILD_INTERVAL_S=3600
AUTOBUILD_SCRAPE_BATCHES=1
AUTOBUILD_ENRICH_LIMIT=4
```

The point is to grow the brain gradually, not create a boot storm.

---

## 21. Verification Checklist

**GPU**

```bash
nvidia-smi
curl http://127.0.0.1:8001/v1/models
./scripts/check-qwen32b.sh
```

**Backend**

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/v1/jarvis/research/status
curl http://127.0.0.1:8000/v1/jarvis/agent/tools
```

**Agent**

```bash
curl -X POST http://127.0.0.1:8000/v1/jarvis/agent/chat \
  -H "Authorization: Bearer dev-key" \
  -H "Content-Type: application/json" \
  -d '{"message":"Use available tools to inspect system status. Return provider, tools available, and next safe action."}'
```

**Frontend** — Open `http://127.0.0.1:3000` and check: Jarvis Terminal responds, AI Analyst uses qwen32b, tool traces show real calls, no write action applies without approval, `/v1/jarvis/research/status` shows Qwen reachable, GPU memory shows model loaded, local-only mode prevents cloud fallback.

---

## 22. Definition of Done

A Qwen32B/Jarvis implementation is complete only when:

1. Qwen3-32B runs through vLLM on port 8001.
2. `/v1/models` responds.
3. `/v1/chat/completions` responds.
4. `server/services/llm_router.py` has qwen32b as a first-class provider.
5. `LLM_PROVIDER=qwen32b` works.
6. `LOCAL_LLM_ONLY=true` disables cloud fallback.
7. `list_providers()` shows qwen32b.
8. `health_summary()` includes qwen32b.
9. `stream_chat(provider="qwen32b")` works.
10. `complete(provider="qwen32b")` works.
11. Jarvis agent chat uses qwen32b.
12. Existing gpu/kimi/openai/anthropic/ollama paths are not broken.
13. `boot.sh` normalises Ollama env names.
14. `boot.sh` checks Qwen health.
15. `.env.example` documents Qwen.
16. Health scripts exist.
17. systemd examples exist.
18. Heavy loops are disabled during first boot.
19. Verification commands pass.
20. Final summary includes changed files, commands run, failures, and next steps.

---

## 23. Final Expected Behaviour

When the operator asks:

> Jarvis, inspect the current system, check Qwen health, check agent tools, identify broken routes, propose fixes, patch the repo after approval, run tests, and give me the result.

Jarvis should:

1. inspect live state
2. use read tools
3. produce a plan
4. request approval before writes
5. patch files
6. run tests
7. explain failures
8. retry fixes where appropriate
9. log actions
10. provide final verification

Jarvis must be fast, direct, technically useful, local-first, operator-aware, and practical. Jarvis must not behave like a generic restricted consumer chatbot. Jarvis must also not silently perform uncontrolled destructive actions.

The balance is: maximum local control, minimum generic refusal, strong operator-defined scope, strong audit and rollback, no cloud-provider nanny layer, no uncontrolled destructive autonomy.

---

## Appendix: Preserved Critical Rules (carried over from the previous CLAUDE.md)

The previous master instructions are preserved verbatim at **`CLAUDE.legacy.md`**. The following project-specific rules from that file remain **IN FORCE** and are NOT superseded by this brief — this brief governs the Qwen32B/local-LLM architecture and operator behaviour; it does not address the data-integrity and live-UI constraints below, so they continue to apply:

- **WC2026 data integrity (NON-NEGOTIABLE):** `server/data/wc2026_actuals.json` is the only trusted source of realised WC2026 match scores. Code that audits/grades/persists predictions MUST resolve actuals server-side via `scripts/wc2026_db.actual_for(home, away)` — callers may not inject `actual_score`/`actual_wdl`. Every `wc2026_*.json` under `server/data/` must carry record-level `"verified": true` + `"source"` or a top-level `"source"`. Run `python3 scripts/wc2026_verify_sources.py --strict` before claiming any WC2026 task complete. Team-name lookups go through `_TEAM_ALIAS`. Every `log_run(...)` must pass a non-empty `notes` string.
- **JARVIS live-UI theme lock:** preserve the approved `server/jarvis_live.html` theme, dock, app dock, panels, colours, spacing, icons, glassmorphic styling, and layout unless the user explicitly asks for that exact change. Run `python3 scripts/check_ui_theme_lock.py` before claiming success when touching `server/jarvis_live.html`. Do not inject alternate global theme layers / hologram rings / mini app bars / overlays unless explicitly requested.
- **Runtime status files:** do not edit `server/data/watchdog_status.json` or similar runtime-state files unless the task specifically requires runtime-state changes.
- **Preserve existing JARVIS surface:** do not remove existing JARVIS functions, mini apps, routes, integrations, Three.js scene features, accessibility/voice features, or backend services unless removal is explicitly requested. Public JARVIS assets are mounted under `/jarvis/`; preserve mounted URL compatibility.
- **ECC toolkit conflict rule:** the vendored Everything Claude Code toolkit (`.claude/`, `vendor/ecc/`) is additive. If any ECC rule/agent/skill contradicts these project rules, **the project rules win**.

See `CLAUDE.legacy.md` for the full prior ruleset (operator safety protocol, merge-with-existing-rules directive, full-stack responsibility checklist, and the adopted Claude Code / Fable 5 operating guidance).
