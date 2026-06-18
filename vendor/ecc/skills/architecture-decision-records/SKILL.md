---
name: architecture-decision-records
description: Capture architectural decisions made during Claude Code sessions as structured ADRs. Auto-detects decision moments, records context, alternatives considered, and rationale. Maintains an ADR log so future developers understand why the codebase is shaped the way it is.
metadata:
  origin: ECC
---

# Architecture Decision Records

Capture architectural decisions as they happen during coding sessions. Instead of decisions living only in Slack threads, PR comments, or someone's memory, this skill produces structured ADR documents that live alongside the code.

## When to Activate

- User explicitly says "let's record this decision" or "ADR this"
- User chooses between significant alternatives (framework, library, pattern, database, API design)
- User says "we decided to..." or "the reason we're doing X instead of Y is..."
- User asks "why did we choose X?" (read existing ADRs)
- During planning phases when architectural trade-offs are discussed

## ADR Format

Use the lightweight ADR format proposed by Michael Nygard, adapted for AI-assisted development:

```markdown
# ADR-NNNN: [Decision Title]

**Date**: YYYY-MM-DD
**Status**: proposed | accepted | deprecated | superseded by ADR-NNNN
**Deciders**: [who was involved]

## Context

What is the issue that we're seeing that is motivating this decision or change?

[2-5 sentences describing the situation, constraints, and forces at play]

## Decision

What is the change that we're proposing and/or doing?

[1-3 sentences stating the decision clearly]

## Alternatives Considered

### Alternative 1: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

### Alternative 2: [Name]
- **Pros**: [benefits]
- **Cons**: [drawbacks]
- **Why not**: [specific reason this was rejected]

## Consequences

What becomes easier or more difficult to do because of this change?

### Positive
- [benefit 1]
- [benefit 2]

### Negative
- [trade-off 1]
- [trade-off 2]

### Risks
- [risk and mitigation]
```

## Workflow

### Capturing a New ADR

When a decision moment is detected:

1. **Initialize (first time only)** — if `docs/adr/` does not exist, ask the user for confirmation before creating the directory, a `README.md` seeded with the index table header (see ADR Index Format below), and a blank `template.md` for manual use. Do not create files without explicit consent.
2. **Identify the decision** — extract the core architectural choice being made
3. **Gather context** — what problem prompted this? What constraints exist?
4. **Document alternatives** — what other options were considered? Why were they rejected?
5. **State consequences** — what are the trade-offs? What becomes easier/harder?
6. **Assign a number** — scan existing ADRs in `docs/adr/` and increment
7. **Confirm and write** — present the draft ADR to the user for review. Only write to `docs/adr/NNNN-decision-title.md` after explicit approval. If the user declines, discard the draft without writing any files.
8. **Update the index** — append to `docs/adr/README.md`

### Reading Existing ADRs

When a user asks "why did we choose X?":

1. Check if `docs/adr/` exists — if not, respond: "No ADRs found in this project. Would you like to start recording architectural decisions?"
2. If it exists, scan `docs/adr/README.md` index for relevant entries
3. Read matching ADR files and present the Context and Decision sections
4. If no match is found, respond: "No ADR found for that decision. Would you like to record one now?"

### ADR Directory Structure

```
docs/
└── adr/
    ├── README.md              ← index of all ADRs
    ├── 0001-use-nextjs.md
    ├── 0002-postgres-over-mongo.md
    ├── 0003-rest-over-graphql.md
    └── template.md            ← blank template for manual use
```

### ADR Index Format

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [0001](0001-use-nextjs.md) | Use Next.js as frontend framework | accepted | 2026-01-15 |
| [0002](0002-postgres-over-mongo.md) | PostgreSQL over MongoDB for primary datastore | accepted | 2026-01-20 |
| [0003](0003-rest-over-graphql.md) | REST API over GraphQL | accepted | 2026-02-01 |
```

## Safety

Before the "Confirm and write" step in the workflow above, the agent MUST validate the draft ADR content. ADRs are written to `docs/adr/` and committed to version control, so any leaked secret becomes part of git history.

### Secret Scanning (mandatory before write)

Scan the full draft ADR text (Context, Decision, Alternatives Considered, Consequences, and any code snippets) for the following secret patterns:

- **AWS access keys** — `AKIA[0-9A-Z]{16}`, `ASIA[0-9A-Z]{16}`, or any value labelled `AWS_ACCESS_KEY`, `AWS_SECRET_ACCESS_KEY`, `aws_access_key_id`, `aws_secret_access_key`
- **Generic API keys / tokens** — values labelled `api_key`, `apikey`, `API_KEY`, `secret`, `SECRET`, `token`, `auth_token`, `access_token`, `bearer`, or long base64/hex strings adjacent to those labels
- **OAuth secrets** — `client_secret`, `CLIENT_SECRET`, `oauth_secret`, `refresh_token`
- **Database URLs with embedded passwords** — `postgres://user:password@host`, `mysql://user:password@host`, `mongodb://user:password@host`, `redis://:password@host`, or any connection string matching `://[^:]+:[^@]+@`
- **Private key blocks** — `-----BEGIN (RSA |DSA |EC |OPENSSH |PGP )?PRIVATE KEY-----`, `-----BEGIN ENCRYPTED PRIVATE KEY-----`
- **GitHub personal access tokens** — `ghp_[A-Za-z0-9]{36}`, `gho_[A-Za-z0-9]{36}`, `ghs_[A-Za-z0-9]{36}`, `ghu_[A-Za-z0-9]{36}`, `github_pat_[A-Za-z0-9_]{82}`

### Refusal protocol

If any secret pattern matches:

1. **REFUSE to write the ADR file.** Do not create `docs/adr/NNNN-*.md` and do not append to the index.
2. Show the user which pattern matched and the offending line(s).
3. Tell the user to replace the literal value with an environment-variable reference (for example, write `${AWS_ACCESS_KEY}` or `${DATABASE_URL}` instead of the actual key or connection string), and to document the *strategy* for managing the secret rather than the secret itself.
4. Offer to re-scan the revised draft. Only proceed to "Confirm and write" once the scan is clean.

If the user insists on writing a secret literal, refuse anyway and surface the project security rules — ADRs are committed artefacts and leaked secrets cannot be undone from git history without a force-push and rotation.

### Numbering race condition

ADR numbers are assigned by scanning `docs/adr/` for the highest existing number and incrementing. Between scan and write, another agent (or a concurrent session) can claim the same number. To avoid collisions:

1. After the user approves the draft, **re-scan `docs/adr/` immediately before writing** to confirm the chosen number is still available.
2. If a file with that number already exists, recompute the next number and update the draft's filename and `# ADR-NNNN:` header.
3. Retry the re-scan and rename loop until the write target is unique, then write the file.

This re-scan-before-write step keeps numbering monotonic without requiring a separate lockfile.

## Decision Detection Signals

Watch for these patterns in conversation that indicate an architectural decision:

**Explicit signals**
- "Let's go with X"
- "We should use X instead of Y"
- "The trade-off is worth it because..."
- "Record this as an ADR"

**Implicit signals** (suggest recording an ADR — do not auto-create without user confirmation)
- Comparing two frameworks or libraries and reaching a conclusion
- Making a database schema design choice with stated rationale
- Choosing between architectural patterns (monolith vs microservices, REST vs GraphQL)
- Deciding on authentication/authorization strategy
- Selecting deployment infrastructure after evaluating alternatives

## What Makes a Good ADR

### Do
- **Be specific** — "Use Prisma ORM" not "use an ORM"
- **Record the why** — the rationale matters more than the what
- **Include rejected alternatives** — future developers need to know what was considered
- **State consequences honestly** — every decision has trade-offs
- **Keep it short** — an ADR should be readable in 2 minutes
- **Use present tense** — "We use X" not "We will use X"

### Don't
- Record trivial decisions — variable naming or formatting choices don't need ADRs
- Write essays — if the context section exceeds 10 lines, it's too long
- Omit alternatives — "we just picked it" is not a valid rationale
- Backfill without marking it — if recording a past decision, note the original date
- Let ADRs go stale — superseded decisions should reference their replacement

## ADR Lifecycle

```
proposed → accepted → [deprecated | superseded by ADR-NNNN]
```

- **proposed**: decision is under discussion, not yet committed
- **accepted**: decision is in effect and being followed
- **deprecated**: decision is no longer relevant (e.g., feature removed)
- **superseded**: a newer ADR replaces this one (always link the replacement)

## Categories of Decisions Worth Recording

| Category | Examples |
|----------|---------|
| **Technology choices** | Framework, language, database, cloud provider |
| **Architecture patterns** | Monolith vs microservices, event-driven, CQRS |
| **API design** | REST vs GraphQL, versioning strategy, auth mechanism |
| **Data modeling** | Schema design, normalization decisions, caching strategy |
| **Infrastructure** | Deployment model, CI/CD pipeline, monitoring stack |
| **Security** | Auth strategy, encryption approach, secret management |
| **Testing** | Test framework, coverage targets, E2E vs integration balance |
| **Process** | Branching strategy, review process, release cadence |

## Integration with Other Skills

- **Planner agent**: when the planner proposes architecture changes, suggest creating an ADR
- **Code reviewer agent**: flag PRs that introduce architectural changes without a corresponding ADR
