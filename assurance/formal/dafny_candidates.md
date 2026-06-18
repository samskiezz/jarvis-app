# Dafny / Verus — Algorithms Worth Porting

Dafny (https://github.com/dafny-lang/dafny) and Verus
(https://github.com/verus-lang/verus) verify functional correctness +
termination + framing.

Candidates in this repo that would benefit:

1. **`assurance.invariants.runner.run_all`** — pure, total, side-effect-free
   except for the report write. Could be re-implemented in Dafny to PROVE
   that overall_ok ⇔ (∀r ∈ results : r.passed).

2. **`scripts/skill_miner.cluster_key`** — pure function; provable
   commutativity + idempotency would make caching safe.

3. **`server/services/cloud_storage.manifest_dedup`** — set-based, perfect
   match for Dafny's set/map theories.

CI does NOT include Dafny/Verus — no port has been authored yet. This file is
a backlog signpost so future contributors know what to consider.
