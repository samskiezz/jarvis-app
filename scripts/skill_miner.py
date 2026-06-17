#!/usr/bin/env python3
"""Skill miner — extract recurring patterns from Claude Code transcripts and
emit them as PERMANENT skills under ~/.claude/skills/<slug>/SKILL.md.

How it works
------------
1. Walks every JSONL transcript under ~/.claude/projects/**.
2. For each session, extracts (first_user_prompt, tool_sequence, final_text).
3. Clusters sessions by a coarse fingerprint:
     fingerprint = (opening_verb, primary_target_kind, top_tools)
   where opening_verb is the first non-stop verb in the prompt (build, fix,
   debug, add, verify, push, audit, …), target kind is "file" / "route" /
   "service" / "pm2" / "ui" / "memory" etc., and top_tools is the multiset
   of tool names truncated to the most frequent 4.
4. Clusters with >= MIN_CLUSTER sessions become a skill candidate.
5. For each candidate, drafts a SKILL.md using the local brain at :8095
   (free Ollama tier) — falls back to a template if the brain is down.
6. Writes ~/.claude/skills/<slug>/SKILL.md with the canonical Claude Code
   skill frontmatter (`name`, `description`, optional `whenToUse`).

Modes
-----
  python3 scripts/skill_miner.py                  # full pass, top 50 by frequency
  python3 scripts/skill_miner.py --top 200        # bigger seed
  python3 scripts/skill_miner.py --dry-run        # show clusters, write nothing
  python3 scripts/skill_miner.py --incremental    # only sessions touched in last 7 days
  python3 scripts/skill_miner.py --since-session ID  # incremental for the SessionEnd hook
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTS_DIR = os.path.expanduser("~/.claude/projects")
SKILLS_DIR = os.path.expanduser("~/.claude/skills")
BRAIN_URL = "http://127.0.0.1:8095/llm/chat"

MIN_CLUSTER = 3            # need at least N sessions in a cluster to mint a skill
TOP_DEFAULT = 50
PROMPT_MAX = 200           # we look at the first N chars of the opening user prompt

STOP_VERBS = {"please", "now", "ok", "let", "i", "you", "we", "the", "a", "an", "and", "if", "but"}

VERB_MAP = {
    "build": "build", "make": "build", "create": "build", "generate": "build", "scaffold": "build",
    "fix": "fix", "debug": "fix", "resolve": "fix", "patch": "fix", "repair": "fix",
    "add": "add", "wire": "add", "register": "add", "install": "add", "include": "add",
    "audit": "audit", "review": "audit", "check": "audit", "verify": "audit", "inspect": "audit",
    "push": "push", "deploy": "push", "ship": "push", "land": "push", "commit": "push",
    "explain": "explain", "describe": "explain", "show": "explain", "what": "explain", "why": "explain",
    "find": "find", "search": "find", "grep": "find", "locate": "find", "where": "find",
    "test": "test", "run": "test", "verify": "test",
    "remove": "remove", "delete": "remove", "clean": "remove", "drop": "remove",
    "refactor": "refactor", "rename": "refactor", "split": "refactor", "extract": "refactor",
    "update": "update", "bump": "update", "upgrade": "update",
    "list": "list", "show": "list", "print": "list",
    "save": "save", "remember": "save", "memorize": "save",
}

TARGET_PATTERNS = [
    ("mini-app",   re.compile(r"\bmini[- ]?app|app dock|carousel\b", re.I)),
    ("route",      re.compile(r"/v1/|fastapi|route|endpoint", re.I)),
    ("service",    re.compile(r"pm2|service|daemon|systemd|ecosystem", re.I)),
    ("pipeline",   re.compile(r"pipeline|self.?improv|auto.?improv|builder|audit_score", re.I)),
    ("ui",         re.compile(r"\bui\b|jarvis_live\.html|css|theme|dock|sheet|overlay", re.I)),
    ("memory",     re.compile(r"\bmemory\b|memor[iy]|recall|forget", re.I)),
    ("infra",      re.compile(r"vast|gpu|ollama|docker|hostinger|wasabi|vps", re.I)),
    ("data",       re.compile(r"server/data|sqlite|database|\.db\b|jsonl", re.I)),
    ("voice",      re.compile(r"voice|tts|xtts|whisper|stt", re.I)),
    ("3d",         re.compile(r"\b3d|three\.?js|glb|gltf|ue5|celestial|render", re.I)),
    ("claude",     re.compile(r"claude[- ]?code|whip|claude_runs|/v1/claude", re.I)),
    ("git",        re.compile(r"\bgit\b|push to main|merge|pr\b", re.I)),
    ("hooks",      re.compile(r"hook|userpromptsubmit|sessionend|stop guard", re.I)),
    ("test",       re.compile(r"pytest|gate|theme.?lock|py_compile", re.I)),
    ("docs",       re.compile(r"readme|md\b|documentation|skill|claude\.md", re.I)),
]


def opening_verb(text: str) -> str:
    words = re.findall(r"[a-zA-Z]+", (text or "").lower())[:8]
    for w in words:
        if w in STOP_VERBS:
            continue
        if w in VERB_MAP:
            return VERB_MAP[w]
    return "other"


def target_kind(text: str) -> str:
    t = text or ""
    for k, p in TARGET_PATTERNS:
        if p.search(t):
            return k
    return "general"


def slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9-]+", "-", (s or "").lower()).strip("-")[:64]
    return s or "skill"


def iter_transcripts(only_since_mtime: float | None = None, only_session: str | None = None):
    if only_session:
        # Restricted search: locate the file named <session_id>.jsonl
        for root, _dirs, files in os.walk(PROJECTS_DIR):
            for fn in files:
                if fn.startswith(only_session) and fn.endswith(".jsonl"):
                    yield os.path.join(root, fn)
        return
    for root, _dirs, files in os.walk(PROJECTS_DIR):
        for fn in files:
            if not fn.endswith(".jsonl"):
                continue
            p = os.path.join(root, fn)
            if only_since_mtime and os.path.getmtime(p) < only_since_mtime:
                continue
            yield p


def parse_session(path: str) -> dict | None:
    """Reduce a JSONL session to (first_user, tool_names, final_text)."""
    first_user = ""
    tools: list[str] = []
    final_text = ""
    try:
        for ln in open(path, encoding="utf-8", errors="replace"):
            try:
                o = json.loads(ln)
            except Exception:
                continue
            t = o.get("type")
            msg = o.get("message") or {}
            if t == "user" and not first_user:
                c = msg.get("content")
                if isinstance(c, str):
                    first_user = c[:PROMPT_MAX * 6]
            elif t == "assistant":
                c = msg.get("content")
                if isinstance(c, list):
                    for b in c:
                        if not isinstance(b, dict):
                            continue
                        if b.get("type") == "tool_use":
                            n = b.get("name")
                            if n:
                                tools.append(str(n))
                        elif b.get("type") == "text":
                            txt = (b.get("text") or "").strip()
                            if txt:
                                final_text = txt
    except Exception:
        return None
    if not first_user:
        return None
    return {
        "path": path,
        "first_user": first_user[:PROMPT_MAX],
        "tools": tools,
        "final_text": final_text[:600],
        "verb": opening_verb(first_user),
        "target": target_kind(first_user + " " + " ".join(tools)),
    }


def fingerprint(sess: dict) -> tuple:
    top_tools = tuple(t for t, _ in Counter(sess["tools"]).most_common(4))
    return (sess["verb"], sess["target"], top_tools)


def cluster(sessions: list[dict]) -> dict:
    """Group sessions by fingerprint. Return {fp: [sess, ...]}."""
    out = defaultdict(list)
    for s in sessions:
        out[fingerprint(s)].append(s)
    return out


def draft_skill_with_brain(verb: str, target: str, tools: tuple, examples: list[dict]) -> dict:
    """Ask the local Ollama brain to draft a skill from cluster examples. Falls back to template."""
    examples_text = "\n".join(f"- prompt: \"{e['first_user'][:160]}\" → tools: {','.join(e['tools'][:6])}"
                              for e in examples[:8])
    prompt = (
        "You are extracting a Claude Code skill from a cluster of past sessions where the agent "
        "did the same kind of work. Output ONLY a JSON object (no markdown fences) with fields:\n"
        '  {"name":"<kebab-case-3-to-5-words>",'
        ' "description":"<one tight sentence (≤140 chars) describing when to invoke this skill>",'
        ' "whenToUse":"<2-3 sentences with concrete triggers — what user phrasings, what files, what intent>",'
        ' "steps":"<numbered list of the canonical recipe, 4-8 steps, plain text>"}\n\n'
        f"Cluster fingerprint: verb={verb}, target={target}, top_tools={','.join(tools) or 'none'}\n"
        f"Sample sessions ({len(examples)} total in this cluster, showing up to 8):\n{examples_text}\n\n"
        "Keep it concrete to THIS pattern; don't invent generic best practices. Return ONLY the JSON object."
    )
    try:
        body = json.dumps({"message": prompt, "tier": "kimi", "max_tokens": 700}).encode()
        req = urllib.request.Request(BRAIN_URL, data=body,
                                     headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = json.loads(resp.read()).get("reply", "")
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            return json.loads(m.group(0))
    except Exception:
        pass
    # Fallback: deterministic template so the seed pass always produces something usable.
    # Disambiguate clusters by appending a short tool-fingerprint hash to the slug.
    tool_sig = "-".join(t[:3].lower() for t in tools[:3]) or "any"
    base = f"{verb}-{target}" if target != "general" else f"{verb}-pattern"
    name = f"{base}-{tool_sig}"
    return {
        "name": slug(name),
        "description": f"Recurring {verb} pattern on {target} surfaces — invoke when the user asks to {verb} something in the {target} area.",
        "whenToUse": (f"Use when the user asks to {verb} a {target}-related item. "
                      f"Triggers: opening verb '{verb}', references to {target} files/services. "
                      "The canonical tool sequence is " + (", ".join(tools) if tools else "context-dependent") + "."),
        "steps": ("1. Locate the relevant files (grep/find).\n"
                  "2. Read the canonical anchor file for this target.\n"
                  "3. Apply the change with the project's existing patterns.\n"
                  "4. Run the gate (theme lock + py_compile + tests).\n"
                  "5. Commit + push to origin/main.\n"
                  "6. Restart pm2 services if backend changed.\n"
                  "7. Verify endpoint/UI returns 200."),
    }


def write_skill(skill: dict, cluster_examples: list[dict]) -> str:
    name = slug(skill.get("name") or "skill")
    description = (skill.get("description") or "").strip()
    when_to_use = (skill.get("whenToUse") or "").strip()
    steps = (skill.get("steps") or "").strip()
    target_dir = os.path.join(SKILLS_DIR, name)
    os.makedirs(target_dir, exist_ok=True)
    body = (
        f"---\n"
        f"name: {name}\n"
        f"description: {description}\n"
        + (f"whenToUse: {when_to_use}\n" if when_to_use else "")
        + "---\n\n"
        f"# {name}\n\n"
        f"{when_to_use or description}\n\n"
        "## Canonical recipe\n\n"
        f"{steps}\n\n"
        "## Source\n\n"
        f"Mined from {len(cluster_examples)} past sessions where the same pattern appeared. "
        "Examples (first user prompt):\n\n"
        + "\n".join(f"- {e['first_user'][:160]}" for e in cluster_examples[:6])
        + "\n"
    )
    path = os.path.join(target_dir, "SKILL.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(body)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=TOP_DEFAULT, help="how many top clusters to emit")
    ap.add_argument("--dry-run", action="store_true", help="cluster + score only; write nothing")
    ap.add_argument("--incremental", action="store_true", help="only sessions touched in the last 7d")
    ap.add_argument("--since-session", default=None, help="just process this one session (SessionEnd hook)")
    ap.add_argument("--min-cluster", type=int, default=MIN_CLUSTER)
    ap.add_argument("--use-brain", action="store_true", default=True, help="ask :8095 brain to draft skill text")
    ap.add_argument("--no-brain", dest="use_brain", action="store_false")
    args = ap.parse_args()

    only_since = None
    if args.incremental:
        only_since = time.time() - 7 * 24 * 3600

    transcripts = list(iter_transcripts(only_since_mtime=only_since, only_session=args.since_session))
    print(f"[skill_miner] scanning {len(transcripts)} transcripts under {PROJECTS_DIR}")

    sessions: list[dict] = []
    for p in transcripts:
        s = parse_session(p)
        if s and s["tools"]:
            sessions.append(s)
    print(f"[skill_miner] {len(sessions)} sessions parsed with at least 1 tool call")

    clusters = cluster(sessions)
    ranked = sorted(clusters.items(), key=lambda kv: len(kv[1]), reverse=True)
    print(f"[skill_miner] {len(ranked)} distinct fingerprints; "
          f"clusters with >= {args.min_cluster} sessions: "
          f"{sum(1 for _, ss in ranked if len(ss) >= args.min_cluster)}")

    emitted = 0
    skipped = 0
    for fp, ss in ranked:
        if len(ss) < args.min_cluster:
            break
        if emitted >= args.top:
            break
        verb, target, tools = fp
        if args.dry_run:
            print(f"  [{len(ss):4d}] verb={verb:10s} target={target:10s} tools={tools}")
            emitted += 1
            continue
        tool_sig = "-".join(t[:3].lower() for t in tools[:3]) or "any"
        base = f"{verb}-{target}" if target != "general" else f"{verb}-pattern"
        deterministic_name = f"{base}-{tool_sig}"
        skill = (draft_skill_with_brain(verb, target, tools, ss) if args.use_brain else
                 {"name": deterministic_name,
                  "description": f"Recurring {verb} pattern on {target} surfaces with tool path {','.join(tools[:4])}.",
                  "whenToUse": (f"Use when the user asks to {verb} a {target}-related item. "
                                "Trigger when the canonical tool sequence applies: " + (",".join(tools) or "context-dependent") + "."),
                  "steps": "1. Locate relevant files.\n2. Read anchor file.\n3. Apply change with existing patterns.\n4. Run gate.\n5. Commit + push.\n6. Restart services if needed.\n7. Verify."})
        try:
            path = write_skill(skill, ss)
            emitted += 1
            print(f"[skill_miner] +{skill.get('name','?')}  ({len(ss)} sessions)  → {path}")
        except Exception as e:
            skipped += 1
            print(f"[skill_miner] skip cluster {fp}: {e}")

    print(f"[skill_miner] done. emitted={emitted} skipped={skipped} target_top={args.top}")


if __name__ == "__main__":
    sys.exit(main() or 0)
