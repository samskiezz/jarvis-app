# SQLite Tuning Audit — Top 6 DBs

Date: 2026-06-19 — read-only audit, nothing changed on disk.
Note: no live writers at time of audit (`lsof` clean across all 6 DBs).

---

## A. Per-DB current pragma state

All six DBs are uniformly configured at SQLite defaults — no per-DB tuning has been applied.

| DB             | size   | journal_mode | cache_size | synchronous | mmap_size | page_size | temp_store | auto_vacuum |
|----------------|--------|--------------|------------|-------------|-----------|-----------|------------|-------------|
| vectors.db     | 893 MB | wal          | -2000 (2MB)| 2 (FULL)    | 0         | 4096      | 0 (default)| 0 (NONE)    |
| brain.db       | 882 MB | wal          | -2000      | 2 (FULL)    | 0         | 4096      | 0          | 0           |
| revdb.db       | 269 MB | wal          | -2000      | 2 (FULL)    | 0         | 4096      | 0          | 0           |
| documents.db   | 202 MB | wal          | -2000      | 2 (FULL)    | 0         | 4096      | 0          | 0           |
| ontology.db    | 157 MB | wal          | -2000      | 2 (FULL)    | 0         | 4096      | 0          | 0           |
| audit.db       | 77 MB  | wal          | -2000      | 2 (FULL)    | 0         | 4096      | 0          | 0           |

Key observations:
- WAL is already on everywhere (good).
- `cache_size = -2000` = **2 MB page cache** on databases up to 893 MB — every nontrivial query falls out of cache immediately.
- `mmap_size = 0` — no memory-mapped reads. On a box with plenty of RAM this is the single biggest read-side win available.
- `synchronous = FULL (2)` — fsyncs on every commit. NORMAL (1) is the standard recommendation with WAL and is safe (only risk is loss of the last in-flight transaction on power loss, not corruption).
- `page_size = 4096` — fine, leave alone (changing requires VACUUM, out of scope).

---

## B. Recommended pragma changes (apply at connection open; not persisted on disk)

These are runtime `PRAGMA` statements meant to be applied by the application when it opens each connection. `cache_size`, `mmap_size`, `synchronous`, `temp_store`, and `wal_autocheckpoint` are all session-scoped (not stored in the DB file), so they are non-destructive and revert on the next reopen.

| PRAGMA                                | Recommended      | Why / expected gain |
|---------------------------------------|------------------|---------------------|
| `cache_size = -262144` (256 MB)       | brain, vectors   | 265K ont_objects + 570K ont_links currently flush each query. A 256 MB cache holds the hot ontology working set in RAM. **2–10x** on repeated dashboard `/feed`, `/runners`, `/registry`. |
| `cache_size = -131072` (128 MB)       | revdb, documents, ontology | 200–280K row tables; 128 MB holds hot index + table pages for full-table scans. **2–5x** typical. |
| `cache_size = -32768` (32 MB)         | audit            | 274K narrow rows. 32 MB easily covers the index + recent tail. **2–4x** for `ORDER BY ts DESC LIMIT`. |
| `mmap_size = 268435456` (256 MB)      | all six          | Memory-maps the first 256 MB of the DB file → reads go through page cache without `read()` syscall. Huge for vectors.db `vec BLOB` reads and brain.db ontology scans. **1.5–3x** on read-heavy paths, more on cold cache. |
| `synchronous = NORMAL` (1)            | all six          | Safe with WAL. Removes fsync on every COMMIT. **3–10x** on small-batch write workloads (audit_log, jos_audit, revdb_changes ingest). |
| `temp_store = MEMORY` (2)             | all six          | Keeps temp B-trees (large ORDER BY, GROUP BY) in RAM instead of /tmp disk. **1.5–4x** on `GROUP BY type ORDER BY 2 DESC` style queries. |
| `wal_autocheckpoint = 1000`           | brain, vectors   | Default 1000 is fine; verify nothing has pushed it higher. WAL files are currently 0 bytes — checkpointing is healthy. |
| `busy_timeout = 5000`                 | all six          | 5 s connection-level wait so concurrent readers don't `SQLITE_BUSY` during writer fsync. Safety, not speed. |

Expected aggregate effect with `cache_size + mmap_size + synchronous=NORMAL + temp_store=MEMORY` applied at every connection open: **brain.db / vectors.db dashboard endpoints drop from ~hundreds of ms to tens of ms** on warm cache; cold scans drop ~2x from mmap alone.

Suggested implementation point: a single helper `_open(db_path)` in `server/dashboard.py` (and wherever `sqlite3.connect(...)` is called for these six files) that runs the pragma block once per connection.

---

## C. Missing indexes (DO NOT auto-apply — present for owner decision)

Confirmed against real query patterns in `server/dashboard.py`.

### brain.db (HIGH leverage — 265K + 570K + 94K row tables)

```sql
-- ont_object: many "WHERE type='X' AND created_ts > ?" and "WHERE type='X' ORDER BY created_ts DESC LIMIT N"
-- dashboard.py:429, 447, 998, 1037, 1050. Currently covered by idx_ont_object_type only.
CREATE INDEX IF NOT EXISTS idx_ont_object_type_created  ON ont_object(type, created_ts DESC);
CREATE INDEX IF NOT EXISTS idx_ont_object_type_updated  ON ont_object(type, updated_ts DESC);

-- ont_link: type filter scan in dashboard.py:536 ("WHERE type=? LIMIT ?") and 1078/1081.
-- ont_link has from_id and to_id indexes but no type index.
CREATE INDEX IF NOT EXISTS idx_ont_link_type           ON ont_link(type);

-- jos_audit: 94K rows, ZERO indexes. Even though jos_audit isn't on the hot path,
-- any actor/action/time query does a full scan today.
CREATE INDEX IF NOT EXISTS idx_jos_audit_ts            ON jos_audit(ts DESC);
CREATE INDEX IF NOT EXISTS idx_jos_audit_actor_ts      ON jos_audit(actor, ts DESC);

-- note: frontmatter_json LIKE '%"batch_loader"%' at dashboard.py:1109, 4174.
-- LIKE %...% can't use a normal index. Two options:
--   (a) extract the loader marker into its own column (best), or
--   (b) build a partial-match expression index:
CREATE INDEX IF NOT EXISTS idx_note_batchloader
       ON note(kind) WHERE frontmatter_json LIKE '%"batch_loader"%';
-- Option (b) shrinks scan to matching rows but doesn't help the initial WHERE evaluation.
-- True fix: add a column like loader_tag TEXT and index it.
```

### ontology.db (174K objects, 228K links — well indexed)

```sql
-- object: only idx_object_type. Add composite for ORDER-BY-time queries if added later.
-- No urgent gaps; existing ix_link_a / ix_link_b cover the relationship lookups.
-- Leave alone unless dashboard adds new query shapes.
```

### audit.db (274K rows, ts indexed)

```sql
-- audit_log is queried by ts (covered) but actor/action filters scan the full 274K rows.
CREATE INDEX IF NOT EXISTS idx_audit_actor_ts          ON audit_log(actor, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_ts         ON audit_log(action, ts DESC);
```

### revdb.db (272K commits, 272K changes — well indexed)

```sql
-- All hot columns (timestamp, parent_id, commit_id, object_type+object_id) are indexed.
-- No gaps identified.
```

### vectors.db (200K rows)

```sql
-- Has ix_doc_kind. Only other realistic filter is meta_json LIKE/ts range.
-- If meta_json lookups become hot, add an expression index for the specific JSON key.
-- No urgent gap.
```

### documents.db (3.8K rows + FTS5)

```sql
-- Already has FTS5 + host/subject indexes. Healthy.
```

---

## D. Top 5 highest-leverage tuning patches (ranked)

1. **Bump `cache_size` to 256 MB on brain.db + vectors.db at connection open.**
   Currently 2 MB cache on 880 MB files. Dashboard `_feed()` and `_runners()` scan ont_object (265K) and ont_link (570K) repeatedly and lose the page cache between calls. Expected: **2–10x on repeated reads**, biggest single win, zero risk (session-scoped pragma).

2. **`mmap_size = 256 MB` on all 6 DBs at connection open.**
   Removes `read()` syscalls for the first 256 MB of every file — hits cold-cache reads of vectors.db `vec BLOB` and brain.db ontology heavy. Expected: **1.5–3x cold reads, ~2x warm scans**, near-zero risk.

3. **`synchronous = NORMAL` on all 6 DBs.**
   Already on WAL, so NORMAL is the standard recommendation. Eliminates per-commit fsync. Expected: **3–10x on small-batch writes** (audit_log, jos_audit, revdb_changes). Only risk is losing the last in-flight transaction on power loss (no corruption).

4. **Add `idx_ont_object_type_created` + `idx_ont_object_type_updated` on brain.db.**
   Confirmed pattern: `WHERE type=? AND created_ts>?`, `WHERE type=? ORDER BY created_ts DESC LIMIT N` across 265K rows. Currently uses `idx_ont_object_type` then filters/sorts in memory. Expected: **5–50x on dashboard `/runners`, /feed top-N queries**. Index build cost: a few seconds. Requires owner OK to apply.

5. **Add `idx_ont_link_type` on brain.db + `idx_audit_actor_ts` / `idx_audit_action_ts` on audit.db.**
   ont_link.type is filtered in `dashboard.py:536` over 570K rows with no type index → full scan. audit_log actor/action filters over 274K rows full-scan today. Expected: **10–50x on those specific endpoints**.

---

## Implementation note

The pragma changes (1–3) are the safest and biggest single uplift — they are session-scoped, applied via a wrapper around `sqlite3.connect()`, and can be reverted by removing the wrapper. They do **not** modify any DB file on disk.

The index additions (4–5) write to the DB file and should be applied with owner approval during a quiet window. None of the proposed indexes are dropped or rebuilt — all are new `CREATE INDEX IF NOT EXISTS` additions.

No `VACUUM`, no `PRAGMA page_size` change, no destructive operations recommended.
