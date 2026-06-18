"""Discovery pass for the 749-skill audit.

Walks all 7 skill directories, dedups SKILL.md files by content SHA256,
builds the collision graph, tags risk tier, and writes:
- skills-index.json  — canonical entries audited in Turns 2-7
- dup-pointers.json  — non-canonical paths that get pointer-stubs in Turn 8
- histogram.json     — counts by risk tier and source directory

Read-only over the source dirs. Produces files only under audit/discovery/.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # /opt/jarvis-app-1/audit
OUT = ROOT / "discovery"

SOURCE_DIRS = [
    "/opt/jarvis-app-1/.claude/skills",
    "/opt/jarvis-app-1/vendor/ecc/skills",
    "/root/.claude/skills",
    "/root/.claude/plugins",
    "/opt/jarvis-app-1/.agents/skills",
    "/opt/jarvis-app-1/.cursor/skills",
    "/opt/jarvis-app-1/.kiro/skills",
]

CRITICAL_TOKENS = {"publish", "deploy", "send_email", "send_message", "delete", "charge",
                   "rm -rf", "drop table", "truncate", "exec(", "subprocess", "wire", "push --force",
                   "git reset --hard", "production", "credentials", "secret"}
HIGH_TOKENS = {"oauth", "api_key", "token", "webhook", "external", "twilio", "stripe",
               "smtp", "ssh", "ftp", "sftp", "s3 ", "wasabi", "auth", "login"}
MEDIUM_TOKENS = {"write", "edit", "mutate", "save", "update", "migrate", "modify", "create"}


def sha256_of(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Return (frontmatter_dict, body). Tolerant of YAML quirks."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    fm_raw = text[3:end].strip()
    body = text[end + 4:].lstrip("\n")
    fm: dict = {}
    cur_key: str | None = None
    for line in fm_raw.splitlines():
        stripped = line.rstrip()
        if not stripped or stripped.lstrip().startswith("#"):
            continue
        if not stripped.startswith(" ") and ":" in stripped:
            k, _, v = stripped.partition(":")
            cur_key = k.strip()
            v = v.strip().strip("'").strip('"')
            fm[cur_key] = v if v else {}
        elif cur_key and stripped.startswith("  ") and ":" in stripped:
            k, _, v = stripped.strip().partition(":")
            if isinstance(fm.get(cur_key), dict):
                fm[cur_key][k.strip()] = v.strip().strip("'").strip('"')
    return fm, body


def risk_tier(text_lower: str) -> str:
    if any(tok in text_lower for tok in CRITICAL_TOKENS):
        return "critical"
    if any(tok in text_lower for tok in HIGH_TOKENS):
        return "high"
    if any(tok in text_lower for tok in MEDIUM_TOKENS):
        return "medium"
    return "low"


def slug_for(skill_dir: Path, fm: dict) -> str:
    """Use frontmatter name if present, otherwise the directory name."""
    name = fm.get("name") or skill_dir.name
    if isinstance(name, dict):
        name = skill_dir.name
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(name)).strip("-").lower()
    return slug or skill_dir.name.lower()


def lead_verb(desc: str) -> str:
    words = re.findall(r"[a-zA-Z]+", desc.lower())
    return words[0] if words else ""


def trigrams(text: str) -> set[str]:
    t = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    t = re.sub(r"\s+", " ", t).strip()
    return {t[i:i + 3] for i in range(len(t) - 2)}


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / max(1, len(a | b))


def find_skill_files() -> list[Path]:
    paths: list[Path] = []
    for d in SOURCE_DIRS:
        dp = Path(d)
        if not dp.exists():
            continue
        for p in dp.rglob("SKILL.md"):
            if p.is_file():
                paths.append(p)
    return paths


def main() -> None:
    files = find_skill_files()
    print(f"Found {len(files)} SKILL.md files across {len(SOURCE_DIRS)} source dirs")

    raw_entries: list[dict] = []
    sha_to_paths: dict[str, list[str]] = defaultdict(list)
    for p in files:
        try:
            content = p.read_bytes()
        except Exception as e:
            print(f"  skip {p}: {e}")
            continue
        sha = sha256_of(content)
        sha_to_paths[sha].append(str(p))
        text = content.decode("utf-8", errors="replace")
        fm, body = parse_frontmatter(text)
        body_sha = sha256_of(body.encode("utf-8"))
        desc = fm.get("description", "") if not isinstance(fm.get("description"), dict) else ""
        skill_dir = p.parent
        raw_entries.append({
            "path": str(p),
            "sha256": sha,
            "sha256_body": body_sha,
            "slug": slug_for(skill_dir, fm),
            "name": fm.get("name", skill_dir.name) if not isinstance(fm.get("name"), dict) else skill_dir.name,
            "description": desc if isinstance(desc, str) else "",
            "frontmatter": fm,
            "risk_tier": risk_tier(text.lower()),
            "lead_verb": lead_verb(desc if isinstance(desc, str) else ""),
            "trigrams": list(trigrams(desc if isinstance(desc, str) else "")),
            "source_dir": str(skill_dir.parent if skill_dir.parent.name == "skills" else skill_dir),
            "size_bytes": len(content),
        })

    # Canonicalize: one entry per sha256, prefer paths under /opt/jarvis-app-1/.claude/skills
    def priority(path: str) -> int:
        if path.startswith("/opt/jarvis-app-1/.claude/skills"):
            return 0
        if path.startswith("/opt/jarvis-app-1/vendor/ecc/skills"):
            return 1
        if path.startswith("/root/.claude/skills"):
            return 2
        return 9

    canonical: dict[str, dict] = {}
    dup_pointers: list[dict] = []
    by_sha: dict[str, list[dict]] = defaultdict(list)
    for e in raw_entries:
        by_sha[e["sha256"]].append(e)
    for sha, group in by_sha.items():
        group.sort(key=lambda e: priority(e["path"]))
        canon = group[0]
        canon["duplicate_paths"] = [g["path"] for g in group[1:]]
        canon["all_source_dirs"] = sorted({e["source_dir"] for e in group})
        canonical[sha] = canon
        for g in group[1:]:
            dup_pointers.append({
                "dup_path": g["path"],
                "dup_slug": g["slug"],
                "canonical_slug": canon["slug"],
                "canonical_path": canon["path"],
                "sha256": sha,
            })

    # Build collision graph: same slug, Jaccard >= 0.4 on trigrams, same lead verb
    entries = list(canonical.values())
    slug_buckets: dict[str, list[dict]] = defaultdict(list)
    verb_buckets: dict[str, list[dict]] = defaultdict(list)
    for e in entries:
        slug_buckets[e["slug"]].append(e)
        if e["lead_verb"]:
            verb_buckets[e["lead_verb"]].append(e)

    for e in entries:
        peers: dict[str, dict] = {}
        for other in slug_buckets[e["slug"]]:
            if other["path"] == e["path"]:
                continue
            peers[other["path"]] = {"slug": other["slug"], "path": other["path"],
                                     "description": other["description"], "reason": "slug-match"}
        if e["lead_verb"]:
            for other in verb_buckets[e["lead_verb"]]:
                if other["path"] == e["path"] or other["path"] in peers:
                    continue
                j = jaccard(set(e["trigrams"]), set(other["trigrams"]))
                if j >= 0.4:
                    peers[other["path"]] = {"slug": other["slug"], "path": other["path"],
                                             "description": other["description"],
                                             "reason": f"jaccard={j:.2f}"}
        e["competing_peers"] = list(peers.values())
        e["trigrams"] = []  # drop to keep index small

    # Histograms
    tier_hist: dict[str, int] = defaultdict(int)
    dir_hist: dict[str, int] = defaultdict(int)
    for e in entries:
        tier_hist[e["risk_tier"]] += 1
        dir_hist[e["source_dir"]] += 1

    # Write outputs
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "skills-index.json").write_text(json.dumps(entries, indent=2, sort_keys=True))
    (OUT / "dup-pointers.json").write_text(json.dumps(dup_pointers, indent=2, sort_keys=True))
    (OUT / "histogram.json").write_text(json.dumps({
        "raw_skill_md_files": len(files),
        "canonical_entries": len(entries),
        "duplicates_collapsed": len(dup_pointers),
        "risk_tier": dict(tier_hist),
        "source_dir": dict(dir_hist),
    }, indent=2, sort_keys=True))

    print(f"\nCanonical entries: {len(entries)}")
    print(f"Duplicate paths collapsed: {len(dup_pointers)}")
    print(f"Risk tier distribution: {dict(tier_hist)}")
    print(f"\nOutputs written to {OUT}/")


if __name__ == "__main__":
    main()
