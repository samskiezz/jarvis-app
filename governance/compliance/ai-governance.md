# AI Governance

The platform's AI/agent capabilities (the AIP plane, reference
`server/services/jarvis_aip.py` and `jarvis_ai.py`) operate under the same
zero-trust, classification-aware, fully-audited regime as every other plane. A
model is not a privileged actor: every tool call and inference is mediated by the
PDP and recorded.

## Principles

1. **No model above its caller.** A model may only read data at or below the
   caller's clearance; `model-access.policy.json` enforces
   `subject.clearance_rank >= resource.classification_rank`.
2. **Purpose-bound inference.** PBAC purpose is carried into the model call and the
   audit record; a model cannot launder access around purpose.
3. **Tool calls are gated.** Agent tool invocations pass
   [`tool-execution.policy.json`](../../contracts/policy/tool-execution.policy.json);
   high-risk tools require approval like any action.
4. **Evidence by default.** Inference, eval, and version changes emit audit events.

## Model lifecycle controls

| Stage | Control | Artefact |
|-------|---------|----------|
| Register | Model card required (purpose, data, limits, risks) | model card |
| Evaluate | Eval suite + red-team baseline must pass | eval results |
| Promote | Same gates as code (signed, gated rollout) | `control.release` |
| Serve | `model-access` policy enforced per call | PDP decision |
| Monitor | Drift, safety, PII-leak alarms | `observability-plane` |
| Rollback | Pin previous evaluated-safe version | [`model-rollback.yaml`](../../deployment/rollback-policies/model-rollback.yaml) |

`no_unevaluated_model_in_prod` is an invariant; a model with no passing eval cannot
be a serve or rollback target.

## Safety gates

- **Pre-serve:** eval suite, red-team baseline, PII-leak scan.
- **Runtime:** classification-aware retrieval (a model cannot surface a document
  above the caller's clearance), output redaction obligations, rate limits.
- **Drift:** a drift or safety alarm routes inference to the last-good version and
  triggers `model-rollback`; if no safe target exists, the feature flag is disabled.

## Human oversight and accountability

- High-risk or irreversible actions proposed by an agent require human approval
  (action-plane approval quorum), never auto-execution.
- Every agent action is attributable to the human purpose/session that initiated it
  via the audit chain — agents do not have standalone, unattributed authority.

## Data handling

- Training/RAG corpora carry classification; ingestion respects the
  [data classification policy](../security/data-classification-policy.md) and the
  high-water-mark rule for derived artefacts.
- Export of model outputs crosses the `export.policy.json` decision point.

## Layer honesty

The Layer A reference uses lightweight model stubs/clients; production model
serving, eval pipelines, and drift monitoring are Layer B
(`# requires real infra`). The governance contracts above are stable across the
split.
