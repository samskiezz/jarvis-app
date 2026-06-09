# Inference Control Plane Final

## Use a control plane, not direct model calls

```text
Task -> Hard Policy Gate -> Resource Gate -> Router -> LiteLLM -> vLLM/Ollama/external -> Validator -> Log/Escalate
```

## Six tiers

- Tier 0: No LLM, CPU/DB/rules/APIs.
- Tier 1: Llama 3B micro.
- Tier 2: Llama 8B base.
- Tier 3: Qwen 32B strong.
- Tier 4: 70B quant cold/on-demand.
- Tier 5: Claude/OpenAI/Kimi/70B full only with critical reason/approval.

## Resource gates

- VRAM > 85%: block Tier 4/5 local heavy.
- VRAM > 92%: pause Tier 3+ background jobs.
- CPU > 90%: reduce concurrency.
- Disk > 85%: pause document ingest and GLB generation.
- Disk > 90%: critical mode, stop non-essential writes.
- DB locks/high write latency: batch writes and slow ingestion.

## Critical correction

Base and strong should not both run by default. The system should choose base OR strong, then escalate only after validation failure.
