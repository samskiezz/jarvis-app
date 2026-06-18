# Turn 1 — Discovery summary

## Numbers

| Metric | Count |
|---|---|
| Raw SKILL.md files found | **1,020** |
| Canonical entries (SHA256 dedup) | **474** |
| Duplicate paths collapsed | 546 |
| Audit cost reduction vs. raw | 54% |
| Audit cost reduction vs. 749 estimate | 37% |

The 749-skill estimate from initial exploration over-counted because many `~/.claude/skills/` entries are byte-identical copies of `/opt/jarvis-app-1/.claude/skills/` and `vendor/ecc/skills/`. After SHA256 dedup the real universe is **474 distinct skills**.

## Risk-tier histogram

| Tier | Count | % | Heuristic |
|---|---|---|---|
| critical | 282 | 60% | Contains publish/deploy/send/delete/charge/exec/secret/credentials/wire/rm/drop/truncate |
| high | 70 | 15% | OAuth/api_key/token/webhook/external service/auth |
| medium | 59 | 12% | Write/edit/mutate/migrate/modify |
| low | 63 | 13% | Reference docs only |

**Important caveat:** the `critical` heuristic is intentionally over-broad — it flags any skill whose content mentions a destructive verb even in a docs context. The per-skill audit in Turns 2–7 downgrades these where appropriate. Expect the true `critical` count after audit to be much lower (~10–15%).

## Source distribution

| Source dir | Canonical contribution |
|---|---|
| `/opt/jarvis-app-1/.claude/skills` | 271 |
| `~/.claude/skills` | 89 |
| `/opt/jarvis-app-1/.kiro/skills` | 43 |
| `/opt/jarvis-app-1/.agents/skills` | 33 |
| `/opt/jarvis-app-1/.cursor/skills` | 10 |
| `/root/.claude/plugins/marketplaces/**` | 28 |
| `/opt/jarvis-app-1/vendor/ecc/skills` | 0 (all byte-identical to project copies) |

The vendored ECC skills are exact dups of the project-scope ones — they'll get pointer-stubs in Turn 8 rather than independent audits.

## Collision graph

| Peer count | Skills |
|---|---|
| 0 peers (truly unique) | 223 |
| 1–5 peers (small clusters) | 169 |
| 6+ peers (large clusters) | 82 |
| Max peers | 85 |

The 82 highly-clustered skills are mostly auto-learned skills from past sessions sharing template + tool-path suffix (`other-pattern-rea-bas-str`, `build-service-web-rea-bas`, etc.). They are legitimate skills but the high peer count means each per-skill audit will list a long competing-peer list.

## Output files

- `audit/discovery/skills-index.json` — 474 canonical entries (sha256, slug, name, description, frontmatter, risk_tier, duplicate_paths, all_source_dirs, competing_peers, size_bytes)
- `audit/discovery/dup-pointers.json` — 546 duplicate paths → canonical mapping (consumed by Turn 8 to write pointer-stub `.md` files)
- `audit/discovery/histogram.json` — machine-readable counts

## Next: audit chains

Per the plan, the user reviews this summary before Turns 2–7 launch.

**Proposed slicing:** 4 chains × ~120 skills (covers all 474), `haiku-4-5` per-skill subagent, concurrency 16, scoped tool permissions (`Read`, `Glob`, `Grep`, restricted `Bash`, `Write` scoped to `audit/results/**`).

**Estimated cost:** $80–$150 (lower than original $120–$220 estimate because 474 < 749).
**Estimated wall-clock:** 3–5 hours with synthesis between chains.

**Ready to launch Chain 1 (skills 1–120) on user OK.**
