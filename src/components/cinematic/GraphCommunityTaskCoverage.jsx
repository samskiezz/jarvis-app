/**
 * F180 — Graph Community × Task Coverage (GCTASK)
 *
 * Parallel-fetches /v1/graph/communities + /entities/Task, then
 * keyword-correlates each network cluster (label + member metadata) against
 * the active task backlog to surface:
 *
 *   COVERED — at least one task provides operational coverage for this community
 *   GAP     — no tasks targeting this community (planning blind spot)
 *
 * Stat tiles: communities / tasks / covered / gaps
 * Filter tabs: ALL | COVERED | GAP + text search
 * Expand any community → matched tasks with status chip + relevance score.
 * Red badge on gap count.
 * ▶ ASSESS: 2-sentence community-task brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCTASK  at bottom:8 left:62360, zIndex:121.
 * Event:   jarvis:gctask-toggle
 * Voice:   "community task / graph community task / gctask /
 *           task community / which communities have tasks /
 *           untasked communities / community coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT  = 62360;
const POLL_MS   = 90_000;
const VIOLET    = "#8B5CF6";
const RED       = "#FF3D5A";
const GREEN     = "#34D399";
const SLATE     = "#6E8AA0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCTASK_RE =
  /\b(community\s+task[s]?|task[s]?\s+community|gctask|graph\s+community\s+task[s]?|task[s]?\s+for\s+communit|which\s+communit\w*\s+(have|has|lack[s]?|need[s]?)\s+task[s]?|untasked\s+communit\w*|communit\w*\s+coverage|communit\w*\s+without\s+task[s]?)\b/i;

export function isGctaskQuery(q) { return GCTASK_RE.test(q); }

export async function buildGctaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, taskRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/entities/Task`,        { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const tasks       = normaliseTasks(await taskRes.json());

    const covered = communities.filter(
      (c) => tasks.some((t) => relevance(c, t) > 0)
    ).length;
    const gaps = communities.length - covered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS graph-community task coverage: ${communities.length} network communities, ` +
          `${tasks.length} tasks in the backlog. ${covered} communities have at least one ` +
          `supporting task; ${gaps} communities have no task coverage whatsoever. ` +
          `Provide a 2-sentence community-task alignment brief — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community task coverage analysis complete, sir.").trim();
  } catch {
    return "Community task coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.communities)           ? raw.communities
    : Array.isArray(raw?.clusters)              ? raw.clusters
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.tasks)        ? raw.tasks
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.results)      ? raw.results
    : Array.isArray(raw?.items)        ? raw.items
    : [];
  return arr.map((t, i) => ({
    id:     t.id     || t.task_id     || String(i),
    title:  t.title  || t.name        || t.label     || `Task ${i + 1}`,
    status: t.status || t.state       || "pending",
    tags:   Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
    notes:  (t.notes || t.description || t.details || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(community, task) {
  const cw = keywords(`${community.label} ${community.members} ${community.summary}`);
  const tw = keywords(`${task.title} ${task.notes} ${task.tags}`);
  return cw.filter((w) => tw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(communities, tasks) {
  return communities.map((c) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(c, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...c, tasks: matched, covered: matched.length > 0 };
  });
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("done") || lc.includes("complet"))  return GREEN;
  if (lc.includes("progress") || lc.includes("active")) return "#60A5FA";
  if (lc.includes("block") || lc.includes("fail"))      return RED;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "GAP"];

export default function GraphCommunityTaskCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [tasks,       setTasks]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, taskRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/entities/Task`,        { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setTasks(normaliseTasks(await taskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gctask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gctask-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGctaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked  = buildLinked(communities, tasks);
  const covered = linked.filter((c) => c.covered).length;
  const gaps    = linked.length - covered;

  const displayed = linked.filter((c) => {
    if (filter === "COVERED" && !c.covered) return false;
    if (filter === "GAP"     && c.covered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Task Coverage (GCTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 121,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${VIOLET}55`,
          color: VIOLET, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {gaps > 0
          ? <><span style={{ background: RED, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{gaps}</span>◈ GCTASK</>
          : "◈ GCTASK"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 121,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${VIOLET}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${VIOLET}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${VIOLET}33` }}>
        <span style={{ color: VIOLET, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCTASK</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × TASK COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: VIOLET, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${VIOLET}22` }}>
        {[
          { label: "COMMUNITIES", value: linked.length, col: "#60A5FA" },
          { label: "TASKS",       value: tasks.length,  col: "#A78BFA" },
          { label: "COVERED",     value: covered,       col: GREEN     },
          { label: "GAPS",        value: gaps,          col: RED       },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${VIOLET}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${VIOLET}22` : "none",
            border: `1px solid ${filter === t ? VIOLET : SLATE}`,
            color: filter === t ? VIOLET : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${VIOLET}`,
          color: VIOLET, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp  = expanded === c.id;
          const col    = c.covered ? GREEN : RED;
          const label  = c.covered ? "COVERED" : "GAP";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${VIOLET}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.covered ? "#34D39944" : "#FF3D5A44"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {label}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>}
                {c.covered && (
                  <span style={{ fontSize: 8, color: GREEN }}>{c.tasks.length} task{c.tasks.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${VIOLET}22` }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.tasks.length === 0 ? (
                    <div style={{ fontSize: 9, color: RED }}>No supporting tasks found in the backlog for this community.</div>
                  ) : (
                    c.tasks.map((t) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${statusColor(t.status)}22`, color: statusColor(t.status),
                          letterSpacing: 1,
                        }}>
                          {String(t.status || "PENDING").toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{t.title}</span>
                        <span style={{ fontSize: 8, color: VIOLET }}>rel:{t.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
