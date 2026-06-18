# ecc-top50

Top 50 ECC skills picked from the 474-skill audit for the Jarvis repo (Python/FastAPI + Three.js + multi-LLM agent system).

- Picks + rationale: `/opt/jarvis-app-1/audit/top50.md`
- Methodology: `/opt/jarvis-app-1/audit/top50-rationale.md`
- Plugin manifest: `.claude-plugin/plugin.json`
- Symlinks to source SKILL.md dirs: `skills/<slug>/SKILL.md`

## Manual registration

This plugin is laid out in the `.claude-plugin/` schema used by `~/.claude/plugins/marketplaces/claude-plugins-official/`. To make every skill in `skills/` directly invocable as `/<slug>` in Claude Code:

### Option 1: Local plugin install

If your Claude Code build supports local plugin paths:

```bash
# From any session in this repo, ask Claude Code to load this plugin
/plugin install /opt/jarvis-app-1/.claude/plugins/ecc-top50
```

### Option 2: User-scope symlink

Mirror the plugin into the user-scope plugin path so it loads in every session:

```bash
mkdir -p ~/.claude/plugins/ecc-top50
ln -sf /opt/jarvis-app-1/.claude/plugins/ecc-top50/.claude-plugin ~/.claude/plugins/ecc-top50/.claude-plugin
ln -sf /opt/jarvis-app-1/.claude/plugins/ecc-top50/skills ~/.claude/plugins/ecc-top50/skills
```

### Option 3: Direct skill discovery

The skill dirs are already symlinked here. If your Claude Code uses the `.claude/skills/` discovery path inside the project, the existing project-level `.claude/skills/` directory will continue to work without registering this plugin. This plugin is additive scaffolding — it doesn't move or modify the source skills.

## Hard rules followed

- No SKILL.md was modified, moved, or deleted.
- Nothing was written outside `/opt/jarvis-app-1/audit/` and `/opt/jarvis-app-1/.claude/plugins/ecc-top50/`.
- `~/.claude/skills/` was NOT touched.
- All 50 symlinks point at non-DUP source directories. Some target `vendor/ecc/` paths; that is the canonical upstream snapshot and is safe to symlink.

## Verifying

```bash
ls /opt/jarvis-app-1/.claude/plugins/ecc-top50/skills/ | wc -l   # should print 50
find /opt/jarvis-app-1/.claude/plugins/ecc-top50/skills/ -maxdepth 1 -type l -xtype l   # should be empty (no broken links)
head -5 /opt/jarvis-app-1/.claude/plugins/ecc-top50/skills/blueprint/SKILL.md   # should show the blueprint skill frontmatter
```
