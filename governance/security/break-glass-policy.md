# Break-Glass Policy

Break-glass is the **only** path to elevated access on this deny-by-default
platform. It is an explicit, time-boxed, fully-audited emergency grant. It never
bypasses the audit chain and never silently lowers classification.

## When break-glass applies

- A SEV1 incident requires access the requester's standing attributes deny.
- An emergency security patch must waive a waivable rollout gate
  (see [`deployment/rollout-policies/emergency-patch.yaml`](../../deployment/rollout-policies/emergency-patch.yaml)).
- Production / `restricted` recovery when normal approval quorum is unreachable.

## What it can and cannot do

| Allowed (with grant) | Never allowed |
|----------------------|---------------|
| Temporary clearance/role elevation | Disabling the audit hash chain |
| Waiving `vulnerability_gate` / `promotion_gate` | Waiving `signature_gate` |
| Bypassing standing approval quorum | Classification downgrade without authority |
| Reading a compartment for incident response | Egress from a `SECRET`/air-gapped enclave |

## Grant procedure

1. **Request** with a mandatory free-text justification, incident ID, and scope
   (resources, decision points, duration).
2. **Two-person rule** — a second approver (security-officer role) must
   countersign for any grant touching `SECRET`+ data or production control.
3. **Issue** a scoped, time-boxed grant (default TTL 1h, max 4h). The grant is an
   attribute overlay consumed by the PDP (`jarvis_policy`), not a code path that
   skips it.
4. **Alert** — issuance raises a high-severity audit event and pages security.

## Time-boxing and revocation

- Grants auto-expire at TTL; expiry is enforced by the PDP, not by the holder.
- Any approver may revoke early. Revocation is audited.
- A grant cannot be silently renewed; renewal is a fresh request with fresh
  justification and countersignature.

## Audit and review

- Every break-glass issuance, use, and expiry is hash-chained via the
  [audit envelope](../../contracts/json-schema/audit-envelope.schema.json) and
  exported to SIEM.
- Each grant requires a **post-incident review within 72h** (tie-in:
  `emergency-patch` `post_conditions.require_followup_change_review`).
- Repeated break-glass for the same gap is a signal to fix the standing policy via
  an ADR — break-glass is an exception mechanism, not a workflow.
