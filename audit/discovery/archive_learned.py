"""Archive auto-learned `other-*-pattern-*` skills from ~/.claude/skills.

Move (not delete) directories whose names match the auto-learn template patterns
into ~/.claude/skills/archive/. Writes MANIFEST.json + README.md for restorability.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

SKILLS = Path("/root/.claude/skills")
ARCHIVE = SKILLS / "archive"

PREFIXES = ("other-", "find-", "audit-", "build-", "add-route-", "test-3d-")
TOOL_ABBR = {"rea", "bas", "web", "too", "str", "edi", "wri", "age", "ski", "tod"}
NEVER_ARCHIVE = {"architecture-decision-records", "everything-claude-code"}


def is_auto_learn_slug(name: str) -> bool:
    if not name.startswith(PREFIXES):
        return False
    parts = name.split("-")
    if len(parts) < 3:
        return False
    last_two = parts[-2:]
    last_three = parts[-3:]
    if all(len(p) == 3 and p in TOOL_ABBR for p in last_two):
        return True
    if all(len(p) == 3 and p in TOOL_ABBR for p in last_three):
        return True
    return False


def has_real_description(skill_dir: Path) -> bool:
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        return False
    try:
        text = skill_md.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return False
    if not text.startswith("---"):
        return False
    end = text.find("\n---", 3)
    if end == -1:
        return False
    fm = text[3:end]
    desc_match = re.search(r"^description:\s*(.+)$", fm, re.MULTILINE)
    if not desc_match:
        return False
    desc = desc_match.group(1).strip().strip("'").strip('"')
    return len(desc) > 100


def collect_candidates() -> list[Path]:
    candidates = []
    for entry in sorted(SKILLS.iterdir()):
        if not entry.is_dir():
            continue
        if entry.name in NEVER_ARCHIVE:
            continue
        if entry.name == "archive":
            continue
        if not is_auto_learn_slug(entry.name):
            continue
        if has_real_description(entry):
            continue
        candidates.append(entry)
    return candidates


def main(dry_run: bool = False) -> None:
    candidates = collect_candidates()
    print(f"Candidates to archive: {len(candidates)}")
    if not (30 <= len(candidates) <= 200):
        print(f"Sanity check FAILED — count {len(candidates)} outside [30, 200]. Aborting.")
        sys.exit(1)

    if dry_run:
        print("Dry-run mode — would move:")
        for c in candidates[:20]:
            print(f"  {c.name}")
        if len(candidates) > 20:
            print(f"  ... and {len(candidates) - 20} more")
        return

    ARCHIVE.mkdir(parents=True, exist_ok=True)
    entries = []
    moved = 0
    for c in candidates:
        target = ARCHIVE / c.name
        if target.exists():
            print(f"  skip (target exists): {c.name}")
            continue
        try:
            shutil.move(str(c), str(target))
            entries.append({
                "slug": c.name,
                "original_path": str(c),
                "archive_path": str(target),
            })
            moved += 1
        except Exception as e:
            print(f"  fail {c.name}: {e}", file=sys.stderr)

    manifest = {
        "archived_at": "2026-06-18T15:30:00Z",
        "reason": "Auto-learned template skills with 6+ competing peers per audit",
        "audit_source": "/opt/jarvis-app-1/audit/duplicates-and-conflicts.md",
        "total_moved": moved,
        "entries": entries,
    }
    (ARCHIVE / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))

    readme = """# Archived auto-learned skills

These directories were moved here from `~/.claude/skills/` by the
skill-audit pass at `/opt/jarvis-app-1/audit/` on 2026-06-18.

## Why they were archived (not deleted)

The audit identified them as auto-learned template skills with high
peer-collision counts (6+ competing slugs each). Per CLAUDE.md they were
NOT deleted — preserved here in case any turn out to be useful.

## Restore one

```bash
mv ~/.claude/skills/archive/<slug>/ ~/.claude/skills/<slug>/
```

## Restore all

```bash
python3 -c "
import json, shutil
from pathlib import Path
m = json.load(open(Path.home() / '.claude/skills/archive/MANIFEST.json'))
for e in m['entries']:
    shutil.move(e['archive_path'], e['original_path'])
print(f'Restored {len(m[\"entries\"])} entries')
"
```

## Delete the archive (only if confident)

```bash
rm -rf ~/.claude/skills/archive/
```

This is a one-way operation.

## Inventory

See `MANIFEST.json` in this directory for the full list with original paths.
"""
    (ARCHIVE / "README.md").write_text(readme)

    print(f"\nMoved: {moved}")
    print(f"Manifest: {ARCHIVE / 'MANIFEST.json'}")
    print(f"README: {ARCHIVE / 'README.md'}")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    main(dry_run=dry)
