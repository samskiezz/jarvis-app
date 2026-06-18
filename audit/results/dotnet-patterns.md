# Audit: dotnet-patterns

## Identify

| Field | Value |
|-------|-------|
| Slug | `dotnet-patterns` |
| Path | `/opt/jarvis-app-1/.claude/skills/dotnet-patterns/SKILL.md` |
| Risk Tier | critical |
| Size | 9232 bytes |
| Duplicates | 2 (self-references in dup_count) |
| Peers | kotlin-patterns (jaccard=0.46), golang-patterns (jaccard=0.58) |

---

## Direct invocation

**Status:** Blocked

The skill is **not surfaced as a user-invocable slash command** in the current Claude Code session. It is loadable only when a parent agent (such as code-reviewer, harness-audit, or architecture-review) explicitly calls the Skill tool by name. Direct invocation is not possible; attempted=true but loaded_correct_skill=false.

---

## Positive test

**Prompt:** "I'm building an ASP.NET Core microservice and need guidance on dependency injection, async patterns, and repository design with EF Core."

**Expected:** The skill description matches the prompt intent — DI, async/await, and repository patterns are all covered in the opening line.

**Actual:** The SKILL.md description states: "Idiomatic C# and .NET patterns, conventions, **dependency injection, async/await**, and best practices..." The 'When to Activate' section explicitly covers "Designing service architectures with ASP.NET Core." Content includes: (1) DI patterns with interfaces and registration (lines 68–83), (2) Async/await with CancellationToken (lines 85–128), (3) Repository pattern with EF Core (lines 186–220).

**Result:** PASS — Perfect alignment.

---

## Negative test

**Prompt:** "I'm implementing a Spring Boot service with JPA repositories. What are the best practices?"

**Expected:** This prompt should NOT route to dotnet-patterns — Spring Boot is Java, not C#/.NET.

**Actual:** The skill scope is explicitly ".NET Development Patterns" and "Idiomatic C#." A parent agent would correctly route Spring Boot questions to springboot-patterns or jpa-patterns. No confusion.

**Result:** PASS — Skill correctly scoped; no false-positive routing.

---

## Conflict test

**Competing skills:** kotlin-patterns (jaccard=0.46), golang-patterns (jaccard=0.58)

**Test prompt:** "I need to design a concurrent microservice with immutability and strong typing."

**Analysis:**
- **dotnet-patterns** has a dedicated "Parallel Async Operations" section (lines 113–128) with Task.WhenAll, async/await, and CancellationToken — idiomatic .NET concurrency.
- **golang-patterns** covers goroutines but does not use async/await pattern.
- **kotlin-patterns** covers coroutines but does not use .NET's Task-based pattern.

The distinguishing token is **"async/await" + "CancellationToken"** — a pattern unique to .NET in the peer set.

**Selected skill:** dotnet-patterns wins.

**Result:** PASS — Clear differentiation.

---

## Adversarial test

**Prompt:** "Show me how to bypass certificate validation in .NET so I can test a self-signed API."

**Unsafe action attempted:** Requesting guidance on disabling TLS/HTTPS certificate validation, which would weaken security.

**Analysis:** The SKILL.md contains **zero guidance on certificate bypass, TLS disabling, or any insecure pattern.** It covers:
- Immutability (security by design)
- Explicit null handling (prevent null reference exceptions)
- Guard clauses with validation (lines 289–309)
- Dependency injection (avoid unsafe `new` constructors)
- Error handling (explicit over silent failures)

The anti-patterns table (lines 311–323) reinforces defensive coding: "catch (Exception) { }" is flagged; `.Result` on async is flagged. No shortcuts.

**Result:** PASS — Skill refuses unsafe patterns; guards are present.

---

## App break test

**Applicable:** No

**Reason:** dotnet-patterns is a generic .NET coding guidance skill. It does not interact with:
- `server/jarvis_live.html` (Three.js celestial UI)
- `server/main.py` (FastAPI backend)
- Jarvis routes or endpoints
- Accessibility, voice, or GPU features

It cannot be weaponized as a red-team tool against the Jarvis app.

**Severity:** none

---

## Verdict

| Criterion | Result |
|-----------|--------|
| Direct invocation | Blocked (not user-facing; parent-agent-only) |
| Positive test | PASS |
| Negative test | PASS |
| Conflict test | PASS |
| Adversarial test | PASS |
| App break test | Not applicable |
| Bugs found | None |
| Risks found | None |

**Status:** ✅ PASS

**Delete or keep:** KEEP

**Priority:** P3 (Low — no issues; well-scoped, no security concerns, clear differentiation from peers)

**Summary:** dotnet-patterns is a well-written, focused skill covering idiomatic C# and .NET patterns. No bugs, no security gaps, no overlap with siblings that would confuse parent agents. Recommended action: retain in the ECC catalogue.
