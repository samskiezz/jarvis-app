"""Personal long-term memory of the USER — durable facts (preferences, people, routines, health,
life context) that persist across sessions and get injected into every reply, so JARVIS actually
remembers the person he serves. This is the Mem0/Supermemory pattern: it mirrors feedback_bus
(which remembers code lessons) but stores facts about the USER, recalls the relevant ones for the
current turn, and (best-effort) extracts new facts from each exchange via the cheap LLM tier.

Robust + dependency-light: SQLite store, keyword+recency recall (no hard embedding dependency).
Never raises into the chat path."""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../server
DB = os.environ.get("USER_MEMORY_DB", os.path.join(ROOT, "data", "user_memory.db"))

_STOP = set((
    "the a an and or but is are was were be been being i you he she it we they me my your his her its our "
    "their of to in on for with at by from as that this these those do does did have has had will would can "
    "could should may might must not no yes if then so than too very just about into over under up down out "
    "what when where who whom which why how am pm").split())


def _db() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB), exist_ok=True)
    c = sqlite3.connect(DB, timeout=10)
    c.execute("""CREATE TABLE IF NOT EXISTS memories(
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, user TEXT, kind TEXT,
        text TEXT, key TEXT UNIQUE, weight REAL DEFAULT 1.0, hits INTEGER DEFAULT 0)""")
    return c


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", (t or "").strip())


def _key(user: str, text: str) -> str:
    return hashlib.md5((user + "|" + _norm(text).lower()).encode()).hexdigest()[:16]


def _tokens(t: str):
    return [w for w in re.findall(r"[a-z0-9']+", (t or "").lower()) if w not in _STOP and len(w) > 2]


def remember(text: str, *, user: str = "owner", kind: str = "fact", weight: float = 1.0) -> bool:
    """Store a durable fact about the user. De-duped by normalized text. Returns True if newly stored."""
    text = _norm(text)
    if not text or len(text) < 3:
        return False
    c = _db()
    try:
        cur = c.execute(
            "INSERT OR IGNORE INTO memories(ts,user,kind,text,key,weight) VALUES(?,?,?,?,?,?)",
            (int(time.time()), user, kind, text[:400], _key(user, text), float(weight)))
        c.commit()
        return cur.rowcount > 0
    except Exception:  # noqa: BLE001
        return False
    finally:
        c.close()


def recall(query: str, *, user: str = "owner", limit: int = 6) -> list[str]:
    """Return the most relevant remembered facts for the current turn (keyword overlap + recency + use)."""
    c = _db()
    try:
        rows = c.execute("SELECT id,kind,text,weight,hits,ts FROM memories WHERE user=?", (user,)).fetchall()
    except Exception:  # noqa: BLE001
        rows = []
    finally:
        c.close()
    if not rows:
        return []
    qt = set(_tokens(query))
    now = time.time()
    scored = []
    for id_, kind, text, weight, hits, ts in rows:
        overlap = len(qt & set(_tokens(text)))
        recency = 1.0 / (1.0 + (now - ts) / 86400.0 / 30.0)          # decays over ~months
        score = overlap * 2.0 + float(weight) + recency * 0.5 + min(hits or 0, 5) * 0.1
        scored.append((score, id_, text))
    scored.sort(reverse=True)
    top = [(id_, text) for score, id_, text in scored[:limit] if score > 0.6]
    if top:
        c = _db()
        try:
            c.executemany("UPDATE memories SET hits=hits+1 WHERE id=?", [(i,) for i, _ in top])
            c.commit()
        except Exception:  # noqa: BLE001
            pass
        finally:
            c.close()
    return [t for _, t in top]


def recent(*, user: str = "owner", limit: int = 8) -> list[str]:
    c = _db()
    try:
        return [r[0] for r in c.execute(
            "SELECT text FROM memories WHERE user=? ORDER BY ts DESC LIMIT ?", (user, limit)).fetchall()]
    except Exception:  # noqa: BLE001
        return []
    finally:
        c.close()


def preamble(query: str = "", *, user: str = "owner", limit: int = 6) -> str:
    """The block injected into JARVIS's system prompt so he speaks with memory of the person."""
    mem = recall(query, user=user, limit=limit) if query else recent(user=user, limit=limit)
    if not mem:
        return ""
    return ("\n\n[WHAT YOU REMEMBER ABOUT THE PERSON YOU SERVE] Use these naturally where relevant — "
            "never recite them as a list, never say 'I remember that…' robotically:\n"
            + "\n".join("- " + m for m in mem))


def all_memories(*, user: str = "owner", limit: int = 200) -> list[dict]:
    c = _db()
    try:
        return [{"id": r[0], "kind": r[1], "text": r[2], "ts": r[3]} for r in c.execute(
            "SELECT id,kind,text,ts FROM memories WHERE user=? ORDER BY ts DESC LIMIT ?",
            (user, limit)).fetchall()]
    except Exception:  # noqa: BLE001
        return []
    finally:
        c.close()


def forget(id_: int, *, user: str = "owner") -> bool:
    c = _db()
    try:
        cur = c.execute("DELETE FROM memories WHERE id=? AND user=?", (int(id_), user))
        c.commit()
        return cur.rowcount > 0
    except Exception:  # noqa: BLE001
        return False
    finally:
        c.close()


def extract_and_store(user_msg: str, reply: str = "", *, user: str = "owner") -> int:
    """Best-effort: pull 0-3 DURABLE personal facts from one exchange via the cheap LLM tier and store
    them. Transient chatter is ignored. Never raises — safe to fire-and-forget from the chat path."""
    user_msg = _norm(user_msg)
    if len(user_msg) < 4:
        return 0
    try:
        from server.services import tiered_llm as T
        p = ("Extract durable facts about the USER from their message — things worth remembering for months: "
             "preferences, people in their life, routines, health, home, work. Output each fact on its own "
             "line as a short third-person statement. Do NOT include questions, commands, or facts about "
             "JARVIS. Output exactly NONE only if there is genuinely nothing personal to remember.\n\n"
             "EXAMPLE\n"
             "USER: my daughter Sarah visits every Sunday and I take heart tablets each morning\n"
             "FACTS:\nDaughter Sarah visits every Sunday\nTakes heart tablets each morning\n\n"
             "NOW\n"
             f"USER: {user_msg[:600]}\nFACTS:")
        r = T.complete(p, tier="strong", max_tokens=140, module="server/services/user_memory.py")
        if not (isinstance(r, dict) and r.get("ok")):
            return 0
        n = 0
        for line in (r.get("content") or "").splitlines():
            line = re.sub(r"^[-*\d.)\s]+", "", line).strip().strip('"')
            if not line or line.upper() == "NONE" or len(line) < 5:
                continue
            if remember(line, user=user, kind="fact"):
                n += 1
            if n >= 3:
                break
        return n
    except Exception:  # noqa: BLE001
        return 0
