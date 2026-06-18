# Top 50 ECC skills — picked for this Jarvis repo

Picked from 474-skill audit (`/opt/jarvis-app-1/audit/results/`). Each entry: skill slug, source `SKILL.md` path, one-line rationale for THIS user.

See [`top50-rationale.md`](top50-rationale.md) for picking methodology.

## Planning & architecture (5)

- **`/blueprint`** — `/opt/jarvis-app-1/.claude/skills/blueprint/SKILL.md`
  - Multi-session multi-PR construction plans with dependency graph and adversarial review — matches the Jarvis "Stage 1–N spec" workflow used throughout the user memory.
- **`/plan-orchestrate`** — `/opt/jarvis-app-1/.claude/skills/plan-orchestrate/SKILL.md`
  - Decompose objectives, identify dependencies and risks, generate phase breakdown — matches the planner agent the user is told to use proactively.
- **`/architecture-decision-records`** — `/opt/jarvis-app-1/.claude/skills/architecture-decision-records/SKILL.md`
  - Capture ADRs so future devs understand why Jarvis is shaped the way it is — high signal for a long-lived multi-module repo.
- **`/hexagonal-architecture`** — `/opt/jarvis-app-1/.claude/skills/hexagonal-architecture/SKILL.md`
  - Ports/adapters guidance — useful for the storage router + multi-LLM seam in this repo.
- **`/intent-driven-development`** — `/opt/jarvis-app-1/.claude/skills/intent-driven-development/SKILL.md`
  - Translate user intent into specs first, code second — matches the "Stage 1 plan → build" rhythm in user memory.

## Code review & quality (5)

- **`/code-tour`** — `/opt/jarvis-app-1/.claude/skills/code-tour/SKILL.md`
  - Walks a change end-to-end before approving — pairs with /code-review for higher-signal PR reads.
- **`/plankton-code-quality`** — `/opt/jarvis-app-1/.claude/skills/plankton-code-quality/SKILL.md`
  - Cross-cutting quality scan tuned to spotting brittle patterns before they ship.
- **`/inherit-legacy-style`** — `/opt/jarvis-app-1/.claude/skills/inherit-legacy-style/SKILL.md`
  - Forces new code to match existing repo style — critical for a 200+ file FastAPI codebase.
- **`/production-audit`** — `/opt/jarvis-app-1/.claude/skills/production-audit/SKILL.md`
  - Pre-ship checklist (logging, errors, secrets, ops). Matches the user's rule "never claim done without validation".
- **`/coding-standards`** — `/opt/jarvis-app-1/.claude/skills/coding-standards/SKILL.md`
  - Codifies the immutability + small-files + named-constants rules already in common/coding-style.md.

## Testing (3)

- **`/tdd-workflow`** — `/opt/jarvis-app-1/.claude/skills/tdd-workflow/SKILL.md`
  - RED→GREEN→REFACTOR discipline matching the user's 80% coverage rule and tdd-guide agent.
- **`/eval-harness`** — `/opt/jarvis-app-1/.claude/skills/eval-harness/SKILL.md`
  - Eval-based testing for LLM-shaped code — Jarvis chat router, OpenClaw arbitration, voice clone all need this.
- **`/verification-loop`** — `/opt/jarvis-app-1/.claude/skills/verification-loop/SKILL.md`
  - Verify-after-change loop matching the project rule "before marking done, verify it actually works".

## Security (3)

- **`/security-review`** — `/opt/jarvis-app-1/.claude/skills/security-review/SKILL.md`
  - OWASP-style review for changes touching auth, payments, customer data — matches security-reviewer agent the user is told to use.
- **`/security-scan`** — `/opt/jarvis-app-1/.claude/skills/security-scan/SKILL.md`
  - Pattern-based secret/SSRF/injection scan over a diff — matches the pre-commit security checklist.
- **`/safety-guard`** — `/opt/jarvis-app-1/.claude/skills/safety-guard/SKILL.md`
  - Pre-write hook gates on dangerous patterns — backstops the "no rm -rf" rules the user already wrote.

## Performance (3)

- **`/benchmark`** — `/opt/jarvis-app-1/.claude/skills/benchmark/SKILL.md`
  - Baseline measurement before/after PRs — essential for the GPU/LLM throughput work the user does.
- **`/benchmark-optimization-loop`** — `/opt/jarvis-app-1/.claude/skills/benchmark-optimization-loop/SKILL.md`
  - Recursive optimization loop with measured tests — matches the "render scale: 513 meshes → instancing" memory.
- **`/latency-critical-systems`** — `/opt/jarvis-app-1/.claude/skills/latency-critical-systems/SKILL.md`
  - Latency disciplines for voice/streaming paths in Jarvis.

## Agent ops & autonomy (8)

- **`/agent-architecture-audit`** — `/opt/jarvis-app-1/.claude/skills/agent-architecture-audit/SKILL.md`
  - 12-layer agent stack diagnostic — directly relevant to the Underworld AI + multi-LLM + OpenClaw arbitration seams in user memory.
- **`/agent-harness-construction`** — `/opt/jarvis-app-1/.claude/skills/agent-harness-construction/SKILL.md`
  - Design agent action spaces, tool definitions, observation formatting — applies to Jarvis chat router design.
- **`/agent-self-evaluation`** — `/opt/jarvis-app-1/.claude/skills/agent-self-evaluation/SKILL.md`
  - 5-axis scorecard after non-trivial tasks — matches the agent-evaluator subagent already available.
- **`/agent-introspection-debugging`** — `/opt/jarvis-app-1/.claude/skills/agent-introspection-debugging/SKILL.md`
  - Self-debugging workflow for agent failures (capture, diagnosis, contained recovery) — matches Jarvis' self-improvement loop.
- **`/autonomous-loops`** — `/opt/jarvis-app-1/.claude/skills/autonomous-loops/SKILL.md`
  - Sequential pipelines → RFC-driven multi-agent DAG — matches the "self-wire authorization" memory entry.
- **`/autonomous-agent-harness`** — `/opt/jarvis-app-1/.claude/skills/autonomous-agent-harness/SKILL.md`
  - Persistent memory + scheduled ops + computer use — matches the cron+watchdog stack already wired in Jarvis.
- **`/cost-tracking`** — `/opt/jarvis-app-1/.claude/skills/cost-tracking/SKILL.md`
  - Track per-task LLM spend — required given the Claude/Kimi/Llama/Vast 120B burst stack.
- **`/cost-aware-llm-pipeline`** — `/opt/jarvis-app-1/.claude/skills/cost-aware-llm-pipeline/SKILL.md`
  - Route easy calls to Haiku/Ollama, hard calls to Claude/Opus — matches the multi-LLM-feedback memory.

## Python / FastAPI (5)

- **`/python-patterns`** — `/opt/jarvis-app-1/.claude/skills/python-patterns/SKILL.md`
  - Idiomatic Python — most of the Jarvis backend is Python/FastAPI.
- **`/python-testing`** — `/opt/jarvis-app-1/.claude/skills/python-testing/SKILL.md`
  - pytest/coverage tooling for the FastAPI backend.
- **`/fastapi-patterns`** — `/opt/jarvis-app-1/.claude/skills/fastapi-patterns/SKILL.md`
  - Async correctness, dependency injection, Pydantic schemas — directly maps to server/main.py.
- **`/pytorch-patterns`** — `/opt/jarvis-app-1/.claude/skills/pytorch-patterns/SKILL.md`
  - GPU embedding + Ollama runners use torch — matches the Vast GPU box memory.
- **`/mcp-server-patterns`** — `/opt/jarvis-app-1/.claude/skills/mcp-server-patterns/SKILL.md`
  - MCP server design for chrome-devtools and the storage-router seam.

## React / frontend (4)

- **`/react-patterns`** — `/opt/jarvis-app-1/.claude/skills/react-patterns/SKILL.md`
  - Hook correctness + component boundaries for the glassmorphic dashboard mini-apps.
- **`/react-performance`** — `/opt/jarvis-app-1/.claude/skills/react-performance/SKILL.md`
  - Render perf — directly applies to the dock/carousel/3D NASA-Eyes universe shell.
- **`/frontend-patterns`** — `/opt/jarvis-app-1/.claude/skills/frontend-patterns/SKILL.md`
  - Cross-cutting frontend conventions (compound components, URL-as-state, SWR).
- **`/accessibility`** — `/opt/jarvis-app-1/.claude/skills/accessibility/SKILL.md`
  - WCAG 2.2 AA + ARIA + native traits — matches the Accessibility Core (Hawking-class user) pack shipped per memory.

## Knowledge & research (4)

- **`/deep-research`** — `/opt/jarvis-app-1/.claude/skills/deep-research/SKILL.md`
  - Multi-source firecrawl+exa research with cited reports — matches the .proof_jarvis_research.md workflow.
- **`/exa-search`** — `/opt/jarvis-app-1/.claude/skills/exa-search/SKILL.md`
  - Fast web research after GitHub + Context7 — matches the development-workflow.md research order.
- **`/codebase-onboarding`** — `/opt/jarvis-app-1/.claude/skills/codebase-onboarding/SKILL.md`
  - Map an unfamiliar codebase fast — useful for new contributors and re-onboarding the agent.
- **`/knowledge-ops`** — `/opt/jarvis-app-1/.claude/skills/knowledge-ops/SKILL.md`
  - Knowledge base curation — matches the storage-retrieval-architecture memory entry.

## DevOps & infra (5)

- **`/docker-patterns`** — `/opt/jarvis-app-1/.claude/skills/docker-patterns/SKILL.md`
  - Docker patterns — Jarvis uses docker for embeddings + brain + storage.
- **`/deployment-patterns`** — `/opt/jarvis-app-1/.claude/skills/deployment-patterns/SKILL.md`
  - Safe deploy patterns — matches the "GPU instance lifecycle (DISPOSABLE)" memory.
- **`/github-ops`** — `/opt/jarvis-app-1/.claude/skills/github-ops/SKILL.md`
  - gh CLI patterns for PRs, issues, releases — matches the existing PR workflow.
- **`/git-workflow`** — `/opt/jarvis-app-1/.claude/skills/git-workflow/SKILL.md`
  - Commit/PR conventions matching common/git-workflow.md.
- **`/terminal-ops`** — `/opt/jarvis-app-1/.claude/skills/terminal-ops/SKILL.md`
  - Shell ops with explicit safety rails — required given the "no rm -rf" + watchdog rules.

## AI/ML engineering (3)

- **`/mle-workflow`** — `/opt/jarvis-app-1/.claude/skills/mle-workflow/SKILL.md`
  - Data contracts, feature pipelines, training reproducibility — applies to the embedding + viability model paths.
- **`/prompt-optimizer`** — `/opt/jarvis-app-1/.claude/skills/prompt-optimizer/SKILL.md`
  - Iterative prompt improvement — directly used in the OpenClaw arbitration + Claude draft/critique loop.
- **`/regex-vs-llm-structured-text`** — `/opt/jarvis-app-1/.claude/skills/regex-vs-llm-structured-text/SKILL.md`
  - Decide regex vs LLM for structured text — matches the storage-router routing decisions.

## Repo hygiene (2)

- **`/config-gc`** — `/opt/jarvis-app-1/.claude/skills/config-gc/SKILL.md`
  - Garbage collect dead config/feature flags — matches "refactor-cleaner" agent the user calls out.
- **`/repo-scan`** — `/opt/jarvis-app-1/.claude/skills/repo-scan/SKILL.md`
  - Whole-repo health scan — quick "what is broken" sweep before a session.
