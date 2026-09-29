/**
 * F171 — Task × Knowledge × Graph Community Task Guidance Map (TKGM)
 *
 * Parallel-fetches /entities/Task + /knowledge/ + /v1/graph/communities
 * and keyword-correlates each task (name/description/priority/tags) against
 * KB articles AND graph community clusters to classify:
 *
 *   FULLY_GUIDED   — matched both KB articles and community (maximum guidance)
 *   KB_ONLY        — matched KB articles only
 *   COMMUNITY_ONLY — matched community clusters only
 *   UNGUIDED       — no matches (knowledge gap, no community context)
 *
 * Stat tiles: TASKS / KB ARTICLES / COMMUNITIES + four class counts + GUIDED%.
 * Amber badge on unguided count.
 * Filter tabs ALL / FULLY_GUIDED / KB_ONLY / COMMUNITY_ONLY / UNGUIDED + text search.
 * Expand task → matched KB article cards (green) + matched community cards (purple)
 *              with relevance bars.
 * ▶ ASSESS GUIDANCE → /v1/jarvis/agent/chat 2-sentence task guidance brief + TTS.
 * 90-s auto-refresh. jarvis:tkgm-toggle event.
 *
 * Voice triggers: "tkgm / task knowledge / guided task / unguided task /
 *                  task guidance map / task knowledge community / task guidance gap"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_038_120;
const Z_INDEX  = 232;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TKGM_RE = /\b(tkgm|task[\s-]knowledge(?:[\s-]community)?|guided[\s-]tasks?|unguided[\s-]tasks?|task[\s-]guidance(?:[\s-](?:map|gap))?|task[\s-]knowledge[\s-]community)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const PU     = "#A855F7";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_GUIDED:   GR,
  KB_ONLY:        CY,
  COMMUNITY_ONLY: PU,
  UNGUIDED:       AM,
};

const TABS = ["ALL", "FULLY_GUIDED", "KB_ONLY", "COMMUNITY_ONLY", "UNGUIDED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return `${t.name || t.title || ""} ${t.description || t.summary || ""} ${t.priority || ""} ${t.status || ""} ${(t.tags || []).join(" ")}`;
}
function kbText(k) {
  return `${k.title || k.name || ""} ${k.content || k.description || k.summary || ""} ${k.category || k.type || ""} ${(k.tags || []).join(" ")}`;
}
function communityText(c) {
  return `${c.name || c.label || c.id || ""} ${c.description || c.summary || ""} ${(c.members || []).join(" ")} ${(c.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [taskRes, kbRes, commRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Task`,        { headers }),
    fetch(`${apiBase}/knowledge/`,            { headers }),
    fetch(`${apiBase}/v1/graph/communities`,  { headers }),
  ]);
  const tasks       = taskRes.status === "fulfilled" && taskRes.value.ok
    ? normaliseArray(await taskRes.value.json(), ["tasks", "items"]) : [];
  const articles    = kbRes.status   === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),  ["articles", "knowledge", "items"]) : [];
  const communities = commRes.status === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "items"]) : [];
  return { tasks, articles, communities };
}

function correlate(tasks, articles, communities) {
  return tasks.map(t => {
    const kws = keywords(taskText(t));
    const matchedKB = articles
      .map(a => ({ art: a, rel: score(kbText(a), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedComms = communities
      .map(c => ({ comm: c, rel: score(communityText(c), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const hasKB   = matchedKB.length > 0;
    const hasComm = matchedComms.length > 0;
    const cls = hasKB && hasComm ? "FULLY_GUIDED"
              : hasKB            ? "KB_ONLY"
              : hasComm          ? "COMMUNITY_ONLY"
              :                    "UNGUIDED";
    return { ...t, _cls: cls, _kb: matchedKB, _comms: matchedComms };
  });
}

export function isTkgmQuery(q = "") { return TKGM_RE.test(q); }

export async function buildTkgmScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [taskRes, kbRes, commRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Task`,        { headers }),
    fetch(`${apiBase}/knowledge/`,            { headers }),
    fetch(`${apiBase}/v1/graph/communities`,  { headers }),
  ]);
  const tasks       = taskRes.status === "fulfilled" && taskRes.value.ok
    ? normaliseArray(await taskRes.value.json(), ["tasks", "items"]) : [];
  const articles    = kbRes.status   === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(),  ["articles", "knowledge", "items"]) : [];
  const communities = commRes.status === "fulfilled" && commRes.value.ok
    ? normaliseArray(await commRes.value.json(), ["communities", "clusters", "items"]) : [];
  const rows     = correlate(tasks, articles, communities);
  const fully    = rows.filter(r => r._cls === "FULLY_GUIDED").length;
  const unguided = rows.filter(r => r._cls === "UNGUIDED").length;
  const pct      = rows.length ? Math.round((rows.length - unguided) / rows.length * 100) : 0;
  return `TKGM Task Guidance Map online, sir. Across ${rows.length} tasks cross-referenced against ${articles.length} knowledge articles and ${communities.length} graph communities, ${fully} tasks are fully guided. ${unguided} remain unguided — ${pct}% overall task guidance coverage. Opening the panel for full visibility now.`;
}

export default function TaskKnowledgeCommunityMap() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ tasks: 0, articles: 0, communities: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { tasks, articles, communities } = await loadAll();
      setTotals({ tasks: tasks.length, articles: articles.length, communities: communities.length });
      setRows(correlate(tasks, articles, communities));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:tkgm-toggle", toggle);
    return () => window.removeEventListener("jarvis:tkgm-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildTkgmScript();
      const res  = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this task knowledge guidance coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess task guidance coverage at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_GUIDED:   rows.filter(r => r._cls === "FULLY_GUIDED").length,
    KB_ONLY:        rows.filter(r => r._cls === "KB_ONLY").length,
    COMMUNITY_ONLY: rows.filter(r => r._cls === "COMMUNITY_ONLY").length,
    UNGUIDED:       rows.filter(r => r._cls === "UNGUIDED").length,
  };
  const guidedPct = rows.length ? Math.round((rows.length - counts.UNGUIDED) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return taskText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(0,207,255,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ TKGM{counts.UNGUIDED > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.UNGUIDED}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 640, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(0,207,255,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ TKGM — TASK GUIDANCE MAP</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["TASKS",         totals.tasks,         CY],
          ["KB ARTICLES",   totals.articles,       GR],
          ["COMMUNITIES",   totals.communities,    PU],
          ["FULLY GUIDED",  counts.FULLY_GUIDED,   GR],
          ["KB ONLY",       counts.KB_ONLY,        CY],
          ["COMM ONLY",     counts.COMMUNITY_ONLY, PU],
          ["UNGUIDED",      counts.UNGUIDED,       AM],
          [`GUIDED ${guidedPct}%`, guidedPct,      guidedPct >= 80 ? GR : guidedPct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 72,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${guidedPct}%`,
            background: guidedPct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No tasks match.</div>
        )}
        {visible.map((t, i) => {
          const id    = t.id || t._id || i;
          const name  = t.name || t.title || `Task ${i + 1}`;
          const prio  = t.priority || t.urgency || "";
          const isExp = expanded === id;
          const col   = CLASS_COLOR[t._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{name}</span>
                  {prio && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{prio}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{t._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched KB articles */}
                  {t._kb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES</div>
                      {t._kb.map(({ art: a, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{a.title || a.name || `Article ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: GR, padding: "1px 5px",
                              background: "rgba(34,197,94,0.1)", borderRadius: 2 }}>{a.category || a.type || "KB"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched communities */}
                  {t._comms.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>GRAPH COMMUNITIES</div>
                      {t._comms.map(({ comm: c, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{c.name || c.label || c.id || `Community ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: PU, padding: "1px 5px",
                              background: "rgba(168,85,247,0.12)", borderRadius: 2 }}>CLUSTER</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {t._kb.length === 0 && t._comms.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No KB articles or communities matched this task.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(0,207,255,0.08)",
          border: `1px solid ${assessing ? "#333" : CY}`,
          color: assessing ? "#555" : CY, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS TASK GUIDANCE COVERAGE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(0,207,255,0.05)",
            border: "1px solid rgba(0,207,255,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
