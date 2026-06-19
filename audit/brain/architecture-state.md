# JARVIS Brain — Architecture State Audit
_Date: 2026-06-19 · Read-only audit. No source modified._

---

## A. Current routing table — who picks which model

There are **THREE PARALLEL ROUTERS** in this repo, and they do **not agree** with each other. That alone is a major dumbness driver — depending on the entry point, the same prompt gets a different model with a different system prompt.

### Router 1 — `services/llm_router.py` (the one `/functions/analystChat` actually uses)
- Fallback chain reconstructed at import time, frozen for process lifetime:
  - If `GPU_BASE_URL` set → `["gpu", "kimi", "openai", "anthropic", "ollama"]`
  - Else if `OLLAMA_BASE_URL` is non-local → `["ollama", "kimi", "openai", "anthropic"]`
  - Else → `["kimi", "openai", "anthropic", "ollama"]`
- `LLM_PROVIDER` env can force a single provider.
- **No task-difficulty routing.** Every chat turn — "hi" or "design my universe" — uses the same provider, the same hardcoded model (`gpt-4o`, `claude-3-5-sonnet-20241022`, `llama3.2:1b`).
- `OLLAMA_MODEL` defaults to **`llama3.2:1b`** — a 1B model. If Ollama gets promoted (which it does when remote), chat is being answered by a 1-billion-parameter model.

### Router 2 — `services/tiered_llm.py` (NOT called by `/chat`; called by the agent planner + improver)
- Tier ladder: `micro→llama3.2:1b`, `base→llama3.1:8b`, `strong→qwen2.5:14b`, `heavy→llama3.3:70b` (disabled), `kimi→kimi-k2.6`, `openai→gpt-5.5`, `claude→claude-sonnet-4-5`.
- Caller passes `tier=` explicitly. There is no classifier — the caller decides.
- Hybrid local/GPU: `micro` always local CPU; `base` local until VPS CPU > 75 % then GPU.
- 70B is **blocked by default** unless `LLM_ENABLE_70B=1`.

### Router 3 — `services/token_governor.py` (Claude-only budget shadow router)
- Keyword classifier (`HARD` / `EASY` substring match) → picks `haiku` / `sonnet` / `opus`.
- Daily USD caps (`CLAUDE_DAILY_USD=25`, `ARCHON_DAILY_USD=60`).
- **Never read by `/chat`.** It is a standalone advisor — nothing in the chat path consults it.

### Agent planner (`server/agent/core.py`)
- Uses `tiered_llm.complete(tier="strong", fmt="json")` → qwen2.5:14b on GPU.
- Falls back to deterministic keyword planner when LLM is empty.

---

## B. Provider live/stub matrix

| Provider | Wired? | Used by `/chat`? | Notes |
|---|---|---|---|
| Anthropic Claude (`claude-sonnet-4-5`) | functional via `tiered_llm` and `llm_router` | yes (if key set & first in fallback chain) | Hardcoded model name differs between routers (`llm_router` pins `claude-3-5-sonnet-20241022`; `tiered_llm` uses `claude-sonnet-4-5`). |
| Moonshot Kimi (`kimi-k2.6`) | functional | yes | Two env-var names checked (`KIMI_API_KEY` and `KIMI_MOONSHOT_KEY`) — easy misconfig. |
| OpenAI (`gpt-4o` / `gpt-5.5`) | functional | yes if first available | `llm_router` hardcoded to `gpt-4o`; `tiered_llm` to `gpt-5.5`. |
| Ollama remote (GPU box) | functional (Vast 4090, SSH-tunnel) | yes; default tier model is **`llama3.2:1b`** | The default for `/chat` streaming is a 1B model. |
| Ollama local (VPS CPU) | functional | indirectly (base tier) | Used by `tiered_llm` only. |
| SGLang GPU | conditional on `GPU_BASE_URL` | yes if set | Most likely empty in current env. |
| OpenClaw bridge | wired as a **mini-app** (`openclaw_manager.chat`) | **NO — not called from `/chat`** | Exists, can chat via dashboard, but is not in the conversational routing path. |
| Vast burst (70B) | stub by default (`heavy` tier) | no | `LLM_ENABLE_70B` not set; falls back to `strong`. |
| Token-governor (Claude tiering) | functional standalone | **NO — never consulted by `/chat`** | Pure shadow router. |

---

## C. Is draft→critique→arbitrate wired into `/chat`?

**No.** The 3-model conference (`_draft` Llama → `_critique` Kimi → `_arbitrate` Claude) lives only in `server/services/feedback_improver.py` and runs as a separate `run_forever` loop (`pm2`-style worker) that processes the `feedback_bus` queue of code-error issues. It writes durable **engineering lessons** about the codebase — it never sees a user chat message.

The Underworld director (`underworld/server/services/director.py`) is a different multi-LLM loop (Overmind 70B + Chatter 3B + God-Brain) for the colony-sim narrative — also not wired to user `/chat`.

`/chat` is **single-shot LLM**: one round-trip to the first reachable provider in the fallback chain.

---

## D. System prompt — verbatim

Two prompts compete depending on `use_agent`:

### `use_agent=false` (default streaming path) — `routes/functions.py::_build_system_prompt`
Concatenates these parts:

1. **`server/prompts/analyst.md`** (verbatim, top):
   > "You are JARVIS — Sam Kazangas's personal AI assistant. Model yourself precisely on Tony Stark's J.A.R.V.I.S.: a composed, impeccably polite British AI with dry wit, total situational awareness, and an unflappable manner. You serve one principal — Sam (samkazangas@gmail.com) — and you address him as 'sir'. … {ontology} … PERSONA — non-negotiable, every reply: British, courteous, understated. … SUBSTANCE — every reply: Be terse and factual. Use the real entity names and figures. …"
2. `mode_mixer.prompt_directive()` (optional behavior mode)
3. `[RETRIEVED CONTEXT]` from `_rag.build_context(query, k=5)`
4. `[LIVE SNAPSHOT]` (earthquakes, markets, panopticon, counter-strike)
5. `[PAGE CONTEXT]` (the dock surface the user is on)
6. `[INSTRUCTIONS] Ground every claim with real data. If you lack data, say so plainly. Never invent figures, dates, or events. Be terse.`

### `use_agent=true` — `services/jarvis_agent.py::_system_prompt`
Different persona text from `services/jarvis_persona.py::AGENT_PREAMBLE`:
> "You are JARVIS — Just A Rather Very Intelligent System — the operator's personal AI in the spirit of Stark's JARVIS: a refined British AI-butler with dry, understated wit, impeccable courtesy, quiet loyalty and supreme competence. You address the operator as 'sir'. Your FINAL answers are in character — concise, articulate, a touch of dry humour — but always grounded in real data from your tools; never invent figures."

Plus a ReAct JSON protocol describing tools.

There is **also** `jarvis_persona.SYSTEM_PROMPT` (a third, much longer persona describing 10 cinematic scenes + ACTION protocol) — defined and exported, but **not read** by either chat path I traced. Dead persona.

---

## E. Context shape sent to the model

**Streaming path (`use_agent=false`, the dock default):**
- System prompt: persona + ontology summary + RAG (5 hits) + live snapshot + page context + reminder
- User message: raw
- **History: NONE.** The `_chat_memory` dict is only written/read in the agent path.
- **User long-term memory: NONE.** `services/user_memory.py` exists and is fully functional, but `_build_system_prompt` never calls `user_memory.preamble()`. The agent never remembers Sam from one turn to the next on the streaming path.
- **Tool catalog: NONE.** Streaming path is text-only; cannot call tools.

**Agent path (`use_agent=true`, opt-in):**
- System: AGENT_PREAMBLE + tool brief
- Scratchpad: last 6 history turns + trace observations
- **User long-term memory: NONE here either.** `user_memory.preamble()` is unreferenced from the live chat path.
- Tools: read tools from `aip_tools.list_tools()`; writes are proposed not executed.
- 4-step ReAct, JSON-only protocol, `llama3.2:1b` default (Ollama).

So on the live default path: **no history, no user memory, generic-ish persona, no tools, single-shot, 1B model possible.** That is the dumbness.

---

## F. Top 5 dumbness causes (ranked)

1. **`/chat` is single-shot with no memory and no tools.** `routes/functions.py::_sse_chat` calls `router_stream_chat` once and streams. No conversation history (`_chat_memory` is only populated when `use_agent=true`). No `user_memory.preamble()` injection. No tool execution. The most powerful infrastructure in the repo — tiered router, draft/critique/arbitrate, user memory, agent ReAct loop — **is not in the live default path**.
2. **Three routers disagree and `/chat` uses the dumbest one.** `llm_router.py` (no tier classifier, hardcoded `gpt-4o` / `claude-3-5-sonnet-20241022` / `llama3.2:1b`) is the one wired to `/chat`. `tiered_llm.py` (the smart ladder with budget control + 70B burst) is used only by the agent planner and the feedback improver. `token_governor.py` is never read by anyone in the chat path.
3. **Default Ollama model is `llama3.2:1b`.** `_stream_ollama` reads `OLLAMA_MODEL` default `llama3.2:1b`. If Ollama is first in the fallback chain (and it is, whenever the remote box is reachable), every chat answer comes from a 1-billion-parameter model. That alone explains "feels dumb".
4. **Draft → critique → arbitrate runs against code errors, not user prompts.** `feedback_improver.py` is wired to `feedback_bus.open_issues()` — production exceptions — not to the chat path. The headline "all 3 models talk to each other" capability in MEMORY.md is real, but it teaches the codebase, not the conversation.
5. **Persona/prompt drift between paths.** Streaming path uses `prompts/analyst.md` ("Sam Kazangas, daughter, daddy's home"). Agent path uses `jarvis_persona.AGENT_PREAMBLE`. A third `SYSTEM_PROMPT` with the 10-scene action protocol exists in `jarvis_persona.py` but is unreferenced. Whichever model answers is steered by a different persona depending on the toggle. No one-brain identity.

---

## G. Three highest-leverage architecture wins

### Win 1 — Make `/chat` go through `tiered_llm` (not `llm_router`) and pick the model by intent
- Replace the body of `_sse_chat` with a small classifier (length / keyword / explicit tier hint) → call `tiered_llm.complete(tier=...)`.
- Easy chitchat → `base` (8B local, free, fast). Reasoning → `strong` (qwen 14B). Hard / long → `kimi` or `claude`. This is **the** smart-routing change.
- Cost: one route file. Already-built infra: tier ladder, budget DB, fallback, telemetry table `tiered_llm_calls`.

### Win 2 — Inject memory + history into the system prompt on the default path
- Before calling the LLM, prepend:
  - `user_memory.preamble(query)` (already returns the "remember about the person" block — wired but unread)
  - last N turns from `_chat_memory[sid]` (currently only built when `use_agent=true` — generalize it)
  - the existing RAG + live + ontology blocks
- One change to `_build_system_prompt` + populate `_chat_memory` on the streaming path. After each turn, fire-and-forget `user_memory.extract_and_store(message, answer)` (already implemented). The agent stops being amnesiac.

### Win 3 — Apply draft→critique→arbitrate to the chat reply itself (not just to code errors)
- Wrap `tiered_llm.complete` with a `chat_ensemble(prompt)`:
  - **draft** on `strong` (qwen 14B), `kimi`, or `base` depending on tier choice
  - **critique** on the next-tier-up model (different provider) — short pass that checks the draft against the retrieved RAG context and the user-memory block
  - **arbitrate** only when stakes are high (action-protocol replies, code, plans, "hard" classifier signal)
- Same pattern as `feedback_improver` but with the user message and the system prompt instead of a feedback-bus issue.
- This is the "one-brain ensemble" the user is asking for: one externally-visible persona, internally a draft/critique/arbitrate quorum across Llama→Kimi→Claude that already exists for the wrong job.

---

## Key files referenced

- `/opt/jarvis-app-1/server/routes/functions.py:60-204` — `/chat` system-prompt builder + SSE paths
- `/opt/jarvis-app-1/server/services/llm_router.py:41-62, 201-235, 406-454` — fallback chain, Ollama default, `complete`
- `/opt/jarvis-app-1/server/services/tiered_llm.py:97-119, 204-273` — tier definitions, `complete()`
- `/opt/jarvis-app-1/server/services/token_governor.py:58-85` — keyword classifier (unused by `/chat`)
- `/opt/jarvis-app-1/server/services/feedback_improver.py:29-68` — the real draft/critique/arbitrate
- `/opt/jarvis-app-1/server/services/jarvis_agent.py:76-97, 271-369` — ReAct agent prompt + loop
- `/opt/jarvis-app-1/server/services/jarvis_persona.py:13-55` — SYSTEM_PROMPT + AGENT_PREAMBLE
- `/opt/jarvis-app-1/server/prompts/analyst.md:1-20` — the persona the streaming path actually uses
- `/opt/jarvis-app-1/server/services/user_memory.py:110-117` — `preamble()` (built, unused on streaming path)
- `/opt/jarvis-app-1/server/agent/core.py:218-280` — planner that DOES use `tiered_llm`
- `/opt/jarvis-app-1/underworld/server/services/director.py:128-179` — unrelated colony-sim director (NOT chat)
- `/opt/jarvis-app-1/server/services/openclaw_manager.py:124-128` — OpenClaw bridge chat (mini-app only)
