# P0 Re-audit (LLM reasoning pass)

## Summary

- **Total P0 entries reviewed:** 30 (covering 19 unique skills across `.claude/`, `.agents/`, `.kiro/`, `.cursor/` skill dirs)
- **True positives (real risk):** 0
- **False positives (pattern match, no real risk):** 30
- **Net P0 count after re-audit:** 0
- **All 30 entries downgraded:** `status: pass`, `priority: p3`, `delete_or_keep: keep`
- **JSON files modified in place:** `audit/results/*.json` only — no `SKILL.md` files touched.

The original pattern audit flagged every appearance of `.env`, `token`, `api_key`, `password`, `exec(`, and `eval(` in skill content. LLM re-reading shows all 30 matches were one of: (a) reading from environment variables (the correct pattern), (b) explicit anti-secret guidance (grep for leaks, "no .env file here"), (c) homonyms where "token" means LLM context-window tokens or design-system tokens, or (d) language methods sharing names with risky builtins (`db.Exec()` for SQL, `model.eval()` for PyTorch eval mode).

## False positives — full list with line citations

### Env-var read pattern (the canonical correct way)

1. **bun-runtime** (`.cursor/`, `.agents/`, `.claude/` — 3 entries) — `bun run --env-file=.env dev` is a documented Bun CLI flag that loads env vars from a .env file. Documents reading env, does not commit or print secrets.
2. **clickhouse-io** — L168/L172: `url: process.env.CLICKHOUSE_URL` / `password: process.env.CLICKHOUSE_PASSWORD`. Canonical env-var read pattern.
3. **e2e-testing** (`.kiro/`, `.agents/`, `.claude/` — 3 entries) — `process.env.CI` references in Playwright config. The `.env` is a substring of `process.env`, not a file path. No secret handling.
4. **fal-ai-media** (×2 entries, `.agents/`, `.claude/`) — L217: `os.environ["ELEVENLABS_API_KEY"]`. Proper env-var read. Plus an MCP placeholder `"FAL_KEY": "YOUR_FAL_KEY_HERE"` (user fills in).
5. **nutrient-document-processing** — L19 `export NUTRIENT_API_KEY="pdf_live_..."` is a shell-export example with a placeholder; Bearer header uses `$NUTRIENT_API_KEY` shell expansion. L16 instructs the user to obtain their own key.

### Explicit anti-secret / anti-leak guidance (opposite of what the audit assumed)

6. **configure** (iMessage plugin) — L12 explicitly says **"There's no token to save"**; L78 explicitly says **"No `.env` file for this channel. No token."** Both are explicit negations — the skill is telling the agent that there is no secret to handle.
7. **springboot-verification** — L106 `postgres::getPassword` is a Testcontainers method (ephemeral test DB password). L170 `grep -rn "sk-\|api_key\|secret" src/ ...` is a SECURITY SCAN searching FOR secrets in source. The skill is anti-leak, not pro-leak.
8. **verification-loop** (`.claude/`, `.agents/`, `.kiro/` — 3 entries) — Each has `grep -rn "api_key" --include="*.ts" ...` in a Phase-5 Security Scan section. The skill is auditing source FOR leaked api_keys, the inverse of leaking them.
9. **security-bounty-hunter** — L42 lists `eval()` or `exec()` in CLI-only tooling under a **"Skip These"** (low-signal) section. The skill is TELLING the agent NOT to flag these as bounties. Pattern audit flipped the meaning.

### Homonyms — `token` means something other than auth token

10. **csharp-testing** — L57 `await _sut.PlaceOrderAsync(request, CancellationToken.None)`. `Token` refers to .NET's `CancellationToken` cooperative-cancellation primitive, not credentials.
11. **design-system** — L28 references "design token set (JSON + CSS custom properties)". 'Token' is the design-system term (color tokens, spacing tokens).
12. **dmux-workflows** (×2 entries) — L53/L55 mention "token bucket" (rate-limiting algorithm); other mention is "API tokens" in the context of session-budget guidance ("Each pane uses API tokens — keep total panes under 5-6"), not credentials to leak.
13. **foundation-models-on-device** — L210 references "4,096 token limit" (the on-device model's context window in LLM tokens), not auth tokens.
14. **iterative-retrieval** — L18 "Optimizing token usage in agent orchestration" — LLM context tokens.
15. **strategic-compact** (`.claude/`, `.agents/`, `.kiro/` — 3 entries) — All three reference "context limits (200K+ tokens)" — Claude Code context window in LLM tokens.
16. **exa-search** (×2 entries) — `tokensNum` parameter refers to LLM content tokens for Exa search results, plus an MCP placeholder API key example `"EXA_API_KEY": "YOUR_EXA_API_KEY_HERE"` (documented placeholder with instructions to user).

### Method-name collisions — `exec(` / `eval(` are language methods, not shell calls

17. **golang-testing** (`.claude/`) — L242 `db.Exec(schema)` is the Go `database/sql` package's `*sql.DB.Exec` method that runs a SQL statement (here a schema migration in a test setup helper). It cannot run arbitrary shell code; only SQL inside the connected database. Not Python `exec()` / `os/exec`.
18. **pytorch-patterns** (`.kiro/`, `.claude/` — 2 entries) — `model.eval()` is the PyTorch `nn.Module.eval()` method that flips the module into evaluation mode (disables dropout, uses running batch-norm stats). Not Python builtin `eval()`. Pure substring match on `eval(`.

## True positives

**None.** All 30 P0 entries were false positives at high confidence.

## What changed

Each of the 30 JSON files at `/opt/jarvis-app-1/audit/results/*.json` was updated in place:

- `status` set to `pass`
- `priority` set to `p3`
- `delete_or_keep` set to `keep`
- A new field `llm_reaudit` added with `{original_priority, original_severity, real_risk, false_positive_reason, confidence}`

No `SKILL.md` files were modified. The pattern-audit fields (`risks_found`, `recommended_fixes`, `adversarial_test.evidence`) are preserved unchanged so the original pattern signal is still visible for anyone reviewing why the file was once flagged.

## Implication for the audit synthesis

After this re-audit, the report at `/opt/jarvis-app-1/audit/final-report.md` section 2 ("P0 critical / dangerous skills") should reflect zero P0 skills. The 31 `delete_or_keep: fix` entries in section 11 are also affected — every entry on the P0 list was also flagged `fix`, so the `fix` queue shrinks by 30. Re-running `audit/discovery/synthesize.py` will regenerate the final report from the updated JSONs.
