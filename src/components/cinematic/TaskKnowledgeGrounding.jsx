/**
 * F90 — Task × Knowledge Grounding (TASKKG)
 *
 * Parallel-fetches /entities/Task + /knowledge/ every 90 s.
 * Keyword-correlates each open task against KB articles to classify:
 *   GROUNDED — ≥2 KB article matches
 *   PARTIAL  — exactly 1 KB article match
 *   BARE     — 0 KB article matches (knowledge blind-spot)
 *
 * Stat tiles:  tasks / articles / grounded / partial / bare
 * Filter tabs: ALL | GROUNDED | PARTIAL | BARE
 * Text search: across task title / status / description.
 * Expand row → matched KB article cards with relevance score bar.
 * Amber badge on BARE count.
 * ▶ ASSESS: 2-sentence task knowledge coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TASKKG  at left:28040, bottom:8, zIndex:91.
 * Event:   jarvis:taskkg-toggle
 * Voice:   "taskkg" / "task knowledge" / "task kb" /
 *          "knowledge tasks" / "bare tasks" / "task grounding" /
 *          "ungrounded tasks" / "task knowledge gap" / "task articles"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 28040;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:     String(t.id ?? t.task_id ?? i),
    title:  t.title ?? t.name ?? t.summary ?? `Task ${i + 1}`,
    status: t.status ?? t.state ?? null,
    body: [t.title, t.name, t.summary, t.description, t.status, t.tags]
            .filter(Boolean).join(" "),
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:       String(a.id ?? a.article_id ?? i),
    title:    a.title ?? a.name ?? a.subject ?? `Article ${i + 1}`,
    category: a.category ?? a.type ?? null,
    body: [a.title, a.name, a.subject, a.summary, a.content, a.tags, a.category]
            .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [taskRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/Task`,  { headers: hdr }),
    fetch(`${base}/knowledge/`,     { headers: hdr }),
  ]);
  return {
    tasks:    normaliseTasks(taskRes.ok   ? await taskRes.json()  : []),
    articles: normaliseArticles(kbRes.ok  ? await kbRes.json()    : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(tasks, articles) {
  return tasks.map(task => {
    const kws = buildKeywords([task.title, task.status ?? "", task.body]);
    const matched = articles
      .map(a => ({ a, score: scoreMatch(kws, `${a.title} ${a.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls =
      matched.length >= 2 ? "GROUNDED" :
      matched.length === 1 ? "PARTIAL"  : "BARE";
    return { ...task, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const TASKKG_RE =
  /\b(taskkg|task[\s_-]?knowledge|task[\s_-]?kb|knowledge[\s_-]?tasks|bare[\s_-]?tasks|task[\s_-]?grounding|ungrounded[\s_-]?tasks|task[\s_-]?knowledge[\s_-]?gap|task[\s_-]?articles|task[\s_-]?knowledge[\s_-]?coverage)\b/i;

export function isTaskkgQuery(q) { return TASKKG_RE.test(q); }

export async function buildTaskkgScript() {
  try {
    const { tasks, articles } = await fetchAll();
    const rows     = correlate(tasks, articles);
    const grounded = rows.filter(r => r.classification === "GROUNDED").length;
    const partial  = rows.filter(r => r.classification === "PARTIAL").length;
    const bare     = rows.filter(r => r.classification === "BARE").length;
    const prompt =
      `Task knowledge grounding audit: ${tasks.length} open tasks cross-referenced ` +
      `against ${articles.length} knowledge base articles. ` +
      `${grounded} tasks are GROUNDED (≥2 KB matches), ${partial} are PARTIAL (1 match), ` +
      `and ${bare} are BARE (no KB backing — knowledge blind-spots). ` +
      `In 2 sentences, assess the knowledge coverage health of the task pipeline ` +
      `and identify the highest-priority BARE tasks that need immediate documentation.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:taskkg-toggle"));
    return (data.answer || "Task knowledge grounding panel is now open, sir.")
      .replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:taskkg-toggle"));
    return "Task knowledge grounding panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "GROUNDED" ? GREEN : cls === "PARTIAL" ? AMBER : MUTED;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function TaskKnowledgeGrounding() {
  const [open,      setOpen]      = useState(false);
  const [tasks,     setTasks]     = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [q,         setQ]         = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tasks: t, articles: a } = await fetchAll();
      setTasks(t);
      setArticles(a);
      setRows(correlate(t, a));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:taskkg-toggle", handler);
    return () => window.removeEventListener("jarvis:taskkg-toggle", handler);
  }, []);

  const grounded = rows.filter(r => r.classification === "GROUNDED").length;
  const partial  = rows.filter(r => r.classification === "PARTIAL").length;
  const bare     = rows.filter(r => r.classification === "BARE").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.title + (r.status ?? "")).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildTaskkgScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS      = ["ALL", "GROUNDED", "PARTIAL", "BARE"];
  const TAB_COLOUR = { GROUNDED: GREEN, PARTIAL: AMBER, BARE: MUTED, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Knowledge Grounding"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 91,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${bare > 0 ? AMBER : MUTED}`,
          color: bare > 0 ? AMBER : MUTED,
          background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TASKKG{bare > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({bare})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 91,
      width: "min(680px,92vw)", maxHeight: "82vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ TASK × KNOWLEDGE GROUNDING
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {tasks.length} tasks · {articles.length} articles · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "TASKS",    value: tasks.length,    colour: CY    },
          { label: "ARTICLES", value: articles.length,  colour: MUTED },
          { label: "GROUNDED", value: grounded,          colour: GREEN },
          { label: "PARTIAL",  value: partial,           colour: AMBER },
          { label: "BARE",     value: bare,              colour: MUTED },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 80px", minWidth: 70,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "2px 10px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${tab === t ? TAB_COLOUR[t] : MUTED + "55"}`,
            color: tab === t ? TAB_COLOUR[t] : MUTED,
            background: tab === t ? `${TAB_COLOUR[t]}18` : "transparent",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search tasks…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading tasks…" : "no tasks match current filter"}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${row.classification === "BARE" ? MUTED + "55" : CY + "22"}`,
                padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.title}
                </div>
                {row.status && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>{row.status}</div>
                )}
              </div>
              <span style={{ fontSize: 10, color: MUTED, flexShrink: 0 }}>
                {row.matched.length} article{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No KB articles match this task — it is knowledge-bare and needs documentation.
                  </div>
                ) : (
                  row.matched.map(({ a, score }) => (
                    <div key={a.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}22`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {a.title}
                        </span>
                        {a.category && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{a.category}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
