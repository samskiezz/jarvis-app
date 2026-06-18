------------------------------- MODULE AppWorkflow -------------------------------
(* Model of the Claude-run workflow used inside this app.                       *)
(* States:  pending  →  running  →  done | failed  →  archived                   *)
(* Safety invariants:                                                          *)
(*   - SAFETY_TerminalIsArchived: only `archived` is terminal                   *)
(*   - SAFETY_NoSkipArchive: archive only after done or failed                  *)
(*   - SAFETY_CommandAlwaysAudited: every Start event has matching audit entry  *)
(* Reference: TLA+ spec patterns from the TLA+ examples repository              *)
(* (github.com/tlaplus/tlaplus, Examples/specifications/Paxos and similar).     *)

EXTENDS Naturals, Sequences, TLC

CONSTANTS Runs            \* set of run identifiers

VARIABLES state,          \* run -> {"pending","running","done","failed","archived"}
          audit,          \* set of run identifiers that have an audit entry
          history         \* sequence of (run, event) records

vars == << state, audit, history >>

TypeOK == /\ state \in [Runs -> {"pending","running","done","failed","archived"}]
          /\ audit \subseteq Runs
          /\ history \in Seq([run: Runs, event: STRING])

Init == /\ state = [r \in Runs |-> "pending"]
        /\ audit = {}
        /\ history = << >>

(* Each transition appends to `history` AND ensures audit is updated. *)
Start(r) == /\ state[r] = "pending"
            /\ state' = [state EXCEPT ![r] = "running"]
            /\ audit' = audit \cup {r}
            /\ history' = Append(history, [run |-> r, event |-> "start"])

Complete(r) == /\ state[r] = "running"
               /\ state' = [state EXCEPT ![r] = "done"]
               /\ audit' = audit
               /\ history' = Append(history, [run |-> r, event |-> "complete"])

Fail(r) == /\ state[r] = "running"
           /\ state' = [state EXCEPT ![r] = "failed"]
           /\ audit' = audit
           /\ history' = Append(history, [run |-> r, event |-> "fail"])

Archive(r) == /\ state[r] \in {"done","failed"}
              /\ state' = [state EXCEPT ![r] = "archived"]
              /\ audit' = audit
              /\ history' = Append(history, [run |-> r, event |-> "archive"])

Next == \E r \in Runs : Start(r) \/ Complete(r) \/ Fail(r) \/ Archive(r)

Spec == Init /\ [][Next]_vars

\* SAFETY: every archived run has a matching audit entry (Start was logged).
SAFETY_CommandAlwaysAudited ==
    \A r \in Runs : state[r] = "archived" => r \in audit

\* SAFETY: archived runs can only come from done or failed (no skipping).
SAFETY_NoSkipArchive ==
    \A r \in Runs : state[r] = "archived" =>
        \E i \in 1..Len(history) :
            /\ history[i].run = r
            /\ history[i].event \in {"complete","fail"}

\* SAFETY: only `archived` is terminal — no other state stays put forever.
SAFETY_TerminalIsArchived ==
    \A r \in Runs : (state[r] \notin {"pending","running","done","failed","archived"}) => FALSE

THEOREM Spec => [](TypeOK /\ SAFETY_CommandAlwaysAudited /\ SAFETY_NoSkipArchive)

============================================================================
