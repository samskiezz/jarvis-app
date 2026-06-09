# Router Decision Schema

```ts
type RouterDecision = {
  needs_llm: boolean;
  selected_tier: 0 | 1 | 2 | 3 | 4 | 5;
  selected_model: string | null;
  action: 'run_now' | 'queue' | 'pause_worker' | 'downgrade' | 'request_approval' | 'reject';
  confidence: number;
  validation_required: boolean;
  validator_name?: string;
  escalation_allowed: boolean;
  escalation_trigger?: string;
  human_approval_required: boolean;
  blocked_tiers: number[];
  blocked_reason: string;
  resource_risk: 'low' | 'medium' | 'high' | 'critical';
  reason: string;
};
```
