# State-of-the-Art Multi-LLM Ensemble Patterns — Design Brief (June 2026)

Scope: Read-only research. Target stack = Jarvis 5-tier brain (micro / base / strong / kimi / claude) + Vast 120B remote + Ollama local + OpenClaw bridge + Anthropic + OpenAI. Owner goal: "335% better output" via ensembling. This brief picks patterns that are *measured*, *plausible* for this stack, and *cost-survivable*.

Skeptic note up front: the "335%" target is a marketing-shaped number. No single peer-reviewed paper delivers that on real open-ended tasks. The measured gains below stack additively on narrow benchmarks (math, code, factuality) but on open-ended generation the realistic ceiling for a well-composed ensemble vs. the best single model is ~10–40 % on win-rate metrics like AlpacaEval — still huge, but be honest about it.

---

## A. Top 10 Patterns, Ranked by Measured Quality Gain

Ranking weights: (1) measured benchmark lift, (2) reproducibility outside the original paper, (3) fit to a heterogeneous proprietary+OSS stack.

### 1. Self-Consistency (CoT Majority Vote) — Wang et al., ICLR 2023, still SOTA-baseline in 2026
- Measured: +17.9 % on GSM8K, +12.2 % AQuA, +6.4 % StrategyQA, +3.9 % ARC-c with one model, multiple samples, majority-vote answer.
- URL: https://arxiv.org/pdf/2203.11171
- Verdict: cheapest, most robust quality lever in the field. Works on every tier. Marketing-claim risk: low — heavily replicated.

### 2. Mixture-of-Agents (MoA) — Together AI, ICLR 2025 Spotlight
- Measured: 65.1 % win-rate on AlpacaEval 2.0 with only open-source LLMs, beating GPT-4 Omni (57.5 %). Layer-1 → Layer-3 lifted MATH from 0.428 → 0.552.
- URL: https://arxiv.org/pdf/2406.04692 and https://www.together.ai/blog/moaa
- Verdict: the strongest measured "ensemble-of-OSS-beats-the-best-closed" result. Token cost scales ~N×L (proposers × layers).
- Marketing-claim risk: medium — the 65 % win-rate is real but uses GPT-4 as judge (mild self-favouring bias).

### 3. Best-of-N + Process Reward Model verifier — DeepMind / Snell et al., ICLR 2025
- Measured: optimal test-time compute can match a model ~14× larger in pretraining FLOPs on MATH; PRM-guided best-of-N substantially beats majority-vote at fixed budget.
- URL: https://proceedings.iclr.cc/paper_files/paper/2025/file/1b623663fd9b874366f3ce019fdfdd44-Paper-Conference.pdf and https://venturebeat.com/ai/deepmind-and-uc-berkeley-shows-how-to-make-the-most-of-llm-inference-time-compute
- Verdict: needs a verifier (PRM or strong judge). Gains plateau between N=4 and N=16; beyond that, diminishing returns.

### 4. Tree-of-Thoughts (ToT) — Yao et al., 2023
- Measured: GPT-4 CoT 4 % → ToT 74 % on Game-of-24; 100 % on 3×3 Sudoku.
- URL: https://arxiv.org/pdf/2305.10601 (paper canonical) — survey at https://arxiv.org/pdf/2410.17820 documents replication and limits.
- Verdict: huge on search-shaped tasks, modest elsewhere. Latency 10–100× CoT. The 2024 follow-up paper notes ToT mainly helps when generation > discrimination is the bottleneck.

### 5. Multi-Agent Debate — Du et al., ICML 2024
- Measured: improves factuality and arithmetic accuracy across MMLU/GSM8K subsets; reduces hallucinations because agents prune each other's uncertain claims.
- URL: https://openreview.net/pdf?id=zj7YuTE4t8 and https://github.com/composable-models/llm_multiagent_debate
- Verdict: works best when debaters are *different* models (heterogeneous > homogeneous). Cost = rounds × agents. Skeptic note: a 2025 controlled study (https://arxiv.org/pdf/2511.07784) shows debate gains shrink when the underlying models are strong reasoners.

### 6. Self-Refine (Generator → Critic → Refiner, same model) — Madan et al., 2023
- Measured: ~20 % avg improvement across 7 tasks with GPT-3.5/4 acting as all three roles.
- URL: https://arxiv.org/pdf/2303.17651 — code https://github.com/madaan/self-refine
- Verdict: cheapest "verification-loop" pattern (3× tokens, 1 model). On strong reasoners (Claude Opus, Sonnet 4.5+), the lift gets smaller because the model's first draft is already close to final.

### 7. LLM-Blender (PairRanker + GenFuser) — Jiang et al., ACL 2023; still cited in 2025 surveys
- Measured: outperforms best single open-source LLM on MixInstruct by ranking + fusing N candidates; PairRanker correlates with GPT-4 ranking better than any single OSS model.
- URL: https://arxiv.org/pdf/2306.02561 and https://github.com/yuchenlin/LLM-Blender
- Verdict: strong when candidates are diverse (different families). 2025 survey: https://arxiv.org/pdf/2502.18036

### 8. FrugalGPT / RouteLLM Cascading — Chen 2023; Ong et al. ICLR 2025
- Measured: RouteLLM keeps 95 % of GPT-4 quality at 80–85 % cost reduction (MT-Bench); FrugalGPT 50–98 % cost cuts vs. GPT-4.
- URL: https://arxiv.org/pdf/2305.05176 and https://www.lmsys.org/blog/2024-07-01-routellm/
- Verdict: not a quality booster per se — it's the cost-side of the budget that lets the *other* patterns run. Use as the front door.

### 9. DSPy Compile / Optimised Pipelines — Khattab et al., ICLR 2024
- Measured: 25–65 % task lift over hand-written prompts; teaches a 770 M model to match GPT-3.5 on several tasks via bootstrapped few-shot + ensemble teleprompter.
- URL: https://arxiv.org/pdf/2310.03714 — 2025 tutorial https://www.pondhouse-data.com/blog/dspy-build-better-ai-systems-with-automated-prompt-optimization
- Verdict: the *engineering substrate* for everything above. Use DSPy `Ensemble` teleprompter + `BootstrapFewShot` to compile prompts per Jarvis task.

### 10. Constitutional-AI Critique/Revise + LLM-as-Judge — Anthropic 2023, refreshed Jan 2026
- Measured: improves harmlessness with minimal helpfulness loss; judge-model accuracy now > 81 % on RewardBench (https://arxiv.org/pdf/2410.12784).
- URL: https://www.anthropic.com/news/claudes-constitution (2023) + Jan 2026 refresh at https://bisi.org.uk/reports/claudes-new-constitution-ai-alignment-ethics-and-the-future-of-model-governance
- Verdict: Claude in particular self-critiques well; use it as the judge in any Best-of-N or MoA pipeline.

Honourable mentions (used inside the composite below but not standalone):
- ReAct + Reflexion hybrid (https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/)
- Semantic caching (https://dev.to/sreeni5018/semantic-caching-in-rag-systems-ai-agents-2gal)

---

## B. Pattern → Jarvis Tier Mapping

| Pattern | micro (smol) | base (Ollama) | strong (Llama-3 70B-class) | kimi (Moonshot) | claude (Anthropic) | Vast 120B (burst) |
|---|---|---|---|---|---|---|
| Self-Consistency | sampler | sampler | sampler | sampler | aggregator (judge) | sampler (burst) |
| MoA Layer-1 proposers | — | proposer | proposer | proposer | aggregator (final layer) | proposer (burst) |
| Best-of-N + PRM | candidate gen | candidate gen | candidate gen | candidate gen | verifier / judge | candidate gen |
| Tree-of-Thoughts | — | leaf generator | leaf generator | leaf generator | thought scorer + controller | leaf generator |
| Multi-Agent Debate | — | debater A | debater B | debater C | moderator + final synthesis | debater D (heavy topics) |
| Self-Refine (3-pass) | refiner (cheap) | generator | generator | critic | critic / final refiner | generator (burst) |
| LLM-Blender | — | candidate | candidate | candidate | PairRanker + GenFuser host | candidate |
| Cascading router | first hop | second hop | third hop | fourth | escalation | escalation |
| DSPy compile substrate | runs everywhere | runs everywhere | runs everywhere | runs everywhere | runs everywhere | runs everywhere |
| Constitutional / judge | — | — | — | secondary judge | primary judge | — |

Notes:
- micro = sanity / formatting / cache-hit-or-pass guardrail.
- claude is the cheapest "good judge" you have because of the 200 k context + the constitutional-AI training; do NOT waste it as a candidate generator unless the task needs it.
- Vast 120B is a burst lane — assume cold-start, treat like a "scale-up" candidate, never a critical-path dependency.

---

## C. Recommended Composite Architecture for Jarvis

Name: **Cascade → Diverge → Verify → Fuse → Remember** (5 stages, 3 patterns combined: Cascading router + MoA-style diverge + Best-of-N with PRM/judge + LLM-Blender-style fusion + semantic-cache memory).

```
                ┌── semantic cache hit? ── yes ──> return cached + log ──┐
                │                                                        │
request ───────▶│ stage 0: router (RouteLLM-style classifier)            │
                │   classify: trivial | reasoning | creative | tool      │
                └──┬──────────────────────────────────────────────────┐  │
                   │                                                  │  │
       trivial ────▶ micro (single shot) ──────────────────────────┐  │  │
                                                                   │  │  │
       reasoning / creative ──┐                                     │  │  │
                              ▼                                     │  │  │
        stage 1: diverge (MoA layer 1, N=3 heterogeneous)            │  │  │
          base draft + strong draft + kimi draft                     │  │  │
                              │                                     │  │  │
                              ▼                                     │  │  │
        stage 2: verify  (Best-of-N + PRM/judge)                     │  │  │
          claude scores each draft on rubric  →  scores S1,S2,S3     │  │  │
          if max(S) < threshold → escalate to Vast 120B as 4th draft │  │  │
                              │                                     │  │  │
                              ▼                                     │  │  │
        stage 3: fuse    (MoA layer 2 / LLM-Blender GenFuser)        │  │  │
          claude reads top-2 drafts + their critiques                │  │  │
          returns synthesized answer (NOT a vote)                    │  │  │
                              │                                     │  │  │
                              ▼                                     │  │  │
        stage 4: self-refine (optional, hard tasks only)             │  │  │
          claude critiques own synthesis vs. rubric, revises once    │  │  │
                              │                                     │  │  │
                              ▼                                     │  │  │
        stage 5: remember (write-through)                            │  │  │
          - write (query_embed, final_answer, rubric_score) to cache │  │  │
          - if score is top-decile, append to few-shot exemplar bank │  │  │
          - if it failed, write the failure trace for next-time hint │  │  │
                              │                                     │  │  │
                              ▼                                     ▼  ▼  ▼
                          response ─────────────────────────────────────────
```

Data-flow sketch in one paragraph: every request first hits a cheap classifier that picks a route (trivial → micro single-shot; otherwise → ensemble). For ensemble queries, three heterogeneous mid-tier models (base, strong, kimi) draft in parallel — that diversity is what makes MoA work. Claude acts as a verifier, scoring each draft against a task rubric; if no draft clears the bar, Vast-120B is woken up as a 4th candidate. Claude then **synthesizes** (not votes) the top drafts into a final answer (GenFuser-style). On hard tasks (math/code/long-form), Claude self-refines once. Finally the answer + its score + its embedding are written to a semantic cache and (if top-decile) added to the few-shot exemplar bank that the router will pull on the next similar query — that's the self-distillation loop. micro is reused at the edges for quick guardrail checks (format validation, JSON repair) so we never pay a big-model token on trivial cleanup.

Why these three patterns and not the others: (a) RouteLLM/FrugalGPT is the *only* way the cost math survives once you turn on MoA + Best-of-N; (b) MoA + judge gives the best measured win-rate lift in 2025; (c) memory-as-distillation (semantic cache + few-shot bank) is the compounding lever — every win makes the next query cheaper. Tree-of-Thoughts and Multi-Agent Debate are *not* core — they're invoked only when the router classifies a query as "search-shaped" (ToT) or "controversial-factual" (debate).

---

## D. Expected Quality Lift — Honest Numbers

| Pattern | Lift range | Status |
|---|---|---|
| Self-Consistency (n=10) | +10–20 % on reasoning tasks | **Measured** (Wang 2023, replicated) |
| MoA 3-layer | +5–15 % AlpacaEval win-rate over best single open model | **Measured** (Together AI, ICLR 2025); judge bias caveat |
| Best-of-N + PRM | up to ~14× pretrain-FLOP-equivalent on MATH | **Measured** (Snell et al., ICLR 2025); diminishing past N=16 |
| Tree-of-Thoughts | +30–70 % on search-shaped tasks, ~0 elsewhere | **Measured** (Game-of-24); narrow domain |
| Multi-Agent Debate | +5–15 % factuality; shrinks on strong models | **Measured** (Du 2023); 2025 study shows shrinkage |
| Self-Refine | +5–20 %, weaker on already-strong models | **Measured** (Madaan 2023) |
| LLM-Blender | beats best candidate by 5–10 % win-rate | **Measured** (Jiang 2023) |
| RouteLLM cascade | 80–85 % cost ↓ at 95 % of GPT-4 quality | **Measured** (ICLR 2025) |
| DSPy compile | +25–65 % over hand-prompts | **Measured** (Khattab 2024) |
| Semantic caching | ~30 % latency cut on warm queries | **Measured** (industry blogs, not peer-reviewed) |

Composite expected lift (stacked, with realistic decay): on hard reasoning tasks +30–50 % over best single tier; on open-ended generation +10–25 % win-rate over best single model; on trivial queries ~0 % (router skips ensemble). The "335 %" number is achievable only on narrow benchmarks where ToT-style patterns dominate (Game-of-24 went 4 → 74 % = 1750 %). On open-ended chat — be skeptical of any vendor claiming above 50 %.

---

## E. Risks

### Cost blow-up (token multiplier)
- Self-Consistency: ×N (N=10 typical → 10×).
- MoA 3-layer × 3 proposers: ~10×.
- Best-of-N + judge: ×(N+1).
- Self-Refine: ×3.
- Worst case (everything on, sequential): ~100× tokens vs. single Sonnet call. Router + cache must keep ensemble-on rate < 30 % of requests or the budget explodes.

### Latency hit (round-trip multiplier)
- MoA in parallel ≈ slowest proposer + judge + fuser ≈ 2× single-call.
- Best-of-N parallel ≈ slowest sampler + verifier.
- Self-Refine adds 2 sequential round-trips.
- Vast 120B cold-start = 30–120 s (per memory: GPU-instance-lifecycle).
- Realistic latency for ensemble path: 4–8 s on hot path, 30+ s if Vast cold.

### Complexity & failure modes
- **Verifier stall** (per https://datasciencedojo.com/blog/agentic-loops-explained-from-react-to-loop-engineering-2026-guide/): cap per-tool calls, not just global.
- **Judge bias**: Claude judging Claude inflates scores ~5 %; rotate judges or use position-swap (JudgeBench technique).
- **Cache poisoning**: if a low-quality answer gets stored as "good", future queries inherit it. Mitigation: only cache when rubric score > τ AND user did not thumbs-down.
- **Diversity collapse** in MoA: if base/strong/kimi all default to similar reasoning, the layer-2 aggregator has nothing to fuse. Inject temperature/persona diversity.
- **Vast burst dependency** (per memory: GPU-instance-lifecycle): never put Vast on the critical path; treat as enrichment only.
- **Debate amplifies confident wrong answers** when all debaters share a training-set bias (https://arxiv.org/pdf/2401.05998 shows debate doesn't always help under adversarial conditions).
- **Constitutional-AI drift**: Anthropic's Jan 2026 constitution is a moving target (https://bisi.org.uk/reports/claudes-new-constitution-ai-alignment-ethics-and-the-future-of-model-governance); pin judge prompts and evaluate quarterly.

### Operational
- Owner runs disposable Vast boxes — composite must degrade gracefully when Vast is down (fall back to Anthropic + Ollama only).
- DSPy compiles need a frozen eval set per task; without one, the "+25–65 %" claim doesn't apply.
- Memory bank growth is unbounded; add LRU + score-decay or it becomes a context-poisoning vector at scale.

---

## Bottom line for Jarvis

Build the composite as five real stages, but ship them one at a time and measure each: (1) RouteLLM-style router first (immediate cost win), (2) MoA-3 with claude as final aggregator (biggest measured quality win), (3) PRM/judge-guided Best-of-N as the verifier (catches MoA's failure mode), (4) semantic cache + few-shot bank for the compounding memory effect, (5) ToT + Debate only as routed special-cases. Do not enable Self-Refine on every query — it's the cheapest ×3 you can lose. Treat "335 %" as the marketing target and "+30–50 % on hard reasoning, +10–25 % on open chat" as the engineering target.
