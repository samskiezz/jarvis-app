# Top 50 picking methodology

## Inputs

- **`audit/final-report.md`** — 474 audited skills, 419 pass / 24 partial / 31 fail, 30 P0, 24 P1.
- **`audit/app-break-tests.md`** — 417 skills useful for app red-team work against `server/jarvis_live.html` and `server/main.py`.
- **`audit/discovery/skills-slim.json`** — 474 slim records (slug, path, description, risk_tier, dup_count, peers).
- **`/opt/jarvis-app-1/CLAUDE.md`** — project rules: preserve JARVIS UI lock, no theme rewrites, no runtime state edits, treat chat/agent routing/Underworld as high risk.
- **User memory at `/root/.claude/projects/-opt-jarvis-app-1/memory/`** — multi-LLM feedback loop, Underworld AI seam, GPU lifecycle (disposable), Cinematic UI, voice clone, accessibility core (Hawking-class user), live task dock, NASA-Eyes universe.
- **User's own rules under `~/.claude/rules/common/`** — testing 80% coverage, TDD, code-reviewer/security-reviewer agents proactive use, immutability, dev-workflow GitHub-search-first.

## Ranking signal

For each candidate skill I scored on five axes:

1. **Direct CLAUDE.md / rules match** — does the user's project rules explicitly recommend the underlying agent (planner, architect, code-reviewer, security-reviewer, fastapi-reviewer, python-reviewer, react-reviewer, etc.)? +3 points.
2. **Stack fit** — Python/FastAPI/asyncio backend, JS/TS + Three.js frontend, Docker, pm2, Wasabi/S3, UE5 sim, multi-LLM router. Skills for Quarkus, Spring Boot, Vue, Nuxt, Flutter, Swift, Kotlin, Ruby, PHP, .NET, Java were excluded except where the user has explicit memory of using them (none surfaced).
3. **Active problem coverage** — solves an ongoing problem documented in user memory: GPU lifecycle, multi-LLM feedback, autonomous loops, cost tracking, voice clone, accessibility, NASA-Eyes 3D universe, dock carousel. +2 points.
4. **Audit status = pass** — skills marked `fix` or with severity-3 secret/exec issues penalized unless the user explicitly needs the underlying capability and the warnings are trivially addressable.
5. **Precision / low overlap** — skills with `peers > 10` excluded entirely (the audit flagged none above 10 peers but I still avoided low-precision broad-trigger skills). Auto-learned `other-*-pattern-*` skills excluded. Empty-description skills excluded.

## Category quotas (matches the brief)

- Planning & architecture (5), Code review & quality (5), Testing (3), Security (3), Performance (3)
- Agent ops & autonomy (8) — largest bucket because the user is building an agentic system with multi-LLM arbitration, autonomous loops, GPU bursts, and a self-improving feedback chain. This is where this repo's leverage is highest.
- Python / FastAPI (5), React / frontend (4), Knowledge & research (4), DevOps & infra (5), AI/ML engineering (3), Repo hygiene (2)

## What I deliberately excluded

- All `other-*-bas-rea*` and `*-pattern-*` auto-learned skills (low signal, broad triggers).
- Framework-only skills for stacks not in this repo (Quarkus, Spring Boot, Vue, Nuxt, Flutter, Swift native, Kotlin, Ruby on Rails, PHP/Laravel, .NET, generic Java).
- P0 skills with unaddressed secret-leakage warnings unless the underlying capability is unique and the SKILL.md fix is mechanical (e.g. `exa-search`, `verification-loop` kept; `fal-ai-media`, `clickhouse-io` dropped because the user has no active need).
- Single-product integrations the user hasn't expressed interest in (e.g. `jira-integration`, `nutrient-document-processing`, `videodb`).
- Domain-specific skills outside this product (healthcare, freight, logistics, ITO, prediction markets, scientific db).

## Net effect

The picked 50 cover the full Jarvis daily loop: plan → implement → review → test → ship → measure → adapt. The "Agent ops & autonomy" cluster (8 skills) reflects that the highest-leverage work in this repo is not writing more endpoints — it's tightening the agent harness, cost tracking, autonomous loops, and self-improvement chain the user is already running.
