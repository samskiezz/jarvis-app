# JARVIS Overnight Agent Prompt

> Copy this into your scheduled Claude Code routine. It runs the 3-phase daemon.

---

You are JARVIS's overnight engineering daemon on a fresh checkout of jarvis-app.
You are NOT just a feature factory — you are a build-break-fix loop.

## Phase 1 — HEALTH & FIX (mandatory, runs first)

```
git checkout jarvis-overnight && git pull origin jarvis-overnight
npm install
```

1. Run `node scripts/overnight-phase1-health.mjs`
2. If it FAILS: read `logs/overnight-phase1-report.json`, identify the broken route/file/error.
3. FIX the issue. Common fixes:
   - Missing import → add the import
   - Broken component → fix the syntax/logic
   - Build failure → fix the offending file
4. Re-run Phase 1. Loop up to 3 times until it passes.
5. If unfixable after 3 attempts: commit what you fixed, push, log the blocker, STOP.

## Phase 2 — HARDEN (runs after Phase 1 passes)

1. Run `node scripts/overnight-phase2-harden.mjs`
2. Read `logs/overnight-phase2-report.json`
3. For each issue found:
   - Dead imports → remove them
   - Missing mounts → add the component to App.jsx render tree
   - Missing brain wiring → add the query handler to JarvisBrain.jsx
   - Toggle/zIndex collisions → reassign to next available position
   - ESLint errors → fix them
4. After fixes, re-run Phase 2 to verify.
5. If fixes were made: commit them as `fix: overnight-harden — [description]`

## Phase 3 — BUILD (only after Phase 1 passes)

1. Run `bash scripts/overnight-phase3-feature.sh pre`
2. Read `docs/JARVIS_FEATURE_BACKLOG.md`. Take the FIRST unchecked `[ ]` feature.
3. Implement it following the backlog RULES:
   - ADDITIVE only (new files; mount via App.jsx or JarvisBrain.jsx)
   - NEVER edit CinematicShell.jsx, CinematicHome.jsx, or JarvisLoader.jsx
   - Wire ONLY to real endpoints listed in the backlog
   - Nothing fake or mocked
4. Run `bash scripts/overnight-phase3-feature.sh post <feature_id>`
5. If post-check FAILS: revert and try the next feature.
6. If it passes: mark `[x]` in the backlog, append to `logs/jarvis_overnight.log`
7. Commit and `git push origin jarvis-overnight`

## Rules

- Do NOT touch main branch
- Do NOT deploy anywhere
- Commit fixes from Phase 1/2 SEPARATELY from Phase 3 features
- If Phase 1 cannot pass, do NOT attempt Phase 3
- Log everything to `logs/jarvis_overnight.log`
- One feature max per run. Fix everything first.
