/**
 * F106 — Task × Graph Centrality × Knowledge
 *         Operational Intelligence Pulse (TGKPULSE)
 *
 * Parallel-fetches /entities/Task + /v1/graph/centrality + /knowledge/.
 * Keyword-correlates each task against high-centrality graph nodes AND
 * KB articles to classify:
 *   FULLY_INFORMED  (graph node + KB article match)
 *   GRAPH_LINKED    (centrality node only)
 *   KB_BACKED       (KB article only)
 *   UNINFORMED      (no intelligence grounding — coverage gap)
 *
 * Amber badge on UNINFORMED count.
 * Stat tiles TASKS / NODES / ARTICLES + all four class counts + INTEL%.
 * Filter tabs ALL/FULLY_INFORMED/GRAPH_LINKED/KB_BACKED/UNINFORMED + search.
 * Expand task → matched graph node cards (cyan) + KB article cards (green)
 *   with relevance bars.
 * ▶ ASSESS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "tgkpulse/task graph knowledge/task intelligence pulse/
 *   uninformed tasks/task knowledge graph/operational intelligence pulse".
 * Event: jarvis:tgkpulse-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_002_280;
const Z_INDEX  = 168;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const TGKPULSE_RE = /\b(tgkpulse|task[\s-]graph[\s-]knowledge|task[\s-]intelligence[\s-]pulse|uninformed[\s-]tasks|task[\s-]knowledge[\s-]graph|operational[\s-]intelligence[\s-]pulse|tgk[\s-]pulse)\b/i;

const CY    = "#00CFFF";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_INFORMED: GR,
  GRAPH_LINKED:   CY,
  KB_BACKED:      "#A78BFA",
  UNINFORMED:     AM,
};

const TABS = ["ALL","FULLY_INFORMED","GRAPH_LINKED","KB_BACKED","UNINFORMED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isTgkpulseQuery(text) {
  return TGKPULSE_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function taskKey(t) {
  return [t.name, t.title, t.description, t.type, t.id].filter(Boolean).join(" ");
}

function nodeKey(n) {
  return [n.node, n.id, n.label, n.name, n.entity_type, n.type].filter(Boolean).join(" ");
}

function articleKey(a) {
  return [a.title, a.content, a.summary, a.tags, a.category, a.id].filter(Boolean).join(" ");
}

async function fetchAll() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [taskRes, nodeRes, kbRes] = await Promise.all([
    fetch(`${base}/entities/Task`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/graph/centrality`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/knowledge/`, { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const tasks    = norm(taskRes, ["tasks","data","items","results"]);
  const nodes    = norm(nodeRes, ["nodes","data","items","results"]);
  const articles = norm(kbRes,  ["articles","data","items","results","knowledge"]);
  return { tasks, nodes, articles };
}

function classify(tasks, nodes, articles) {
  return tasks.map(t => {
    const tk = taskKey(t);
    const matchedNodes    = nodes.filter(n => overlap(tk, nodeKey(n)) > 0.08);
    const matchedArticles = articles.filter(a => overlap(tk, articleKey(a)) > 0.08);
    const hasNode = matchedNodes.length > 0;
    const hasKB   = matchedArticles.length > 0;
    const cls =
      hasNode && hasKB ? "FULLY_INFORMED" :
      hasNode           ? "GRAPH_LINKED"   :
      hasKB             ? "KB_BACKED"      :
                          "UNINFORMED";
    return {
      ...t,
      _class:   cls,
      _nodes:   matchedNodes.map(n => ({ ...n, _rel: overlap(tk, nodeKey(n)) })),
      _articles: matchedArticles.map(a => ({ ...a, _rel: overlap(tk, articleKey(a)) })),
    };
  });
}

export async function buildTgkpulseScript() {
  const base = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { tasks, nodes, articles } = await fetchAll();
  const classified = classify(tasks, nodes, articles);
  const total      = classified.length;
  const fullyInf   = classified.filter(t => t._class === "FULLY_INFORMED").length;
  const graphLink  = classified.filter(t => t._class === "GRAPH_LINKED").length;
  const kbBacked   = classified.filter(t => t._class === "KB_BACKED").length;
  const uninformed = classified.filter(t => t._class === "UNINFORMED").length;
  const pct        = total > 0 ? Math.round((fullyInf + graphLink + kbBacked) / total * 100) : 0;

  const context = `Tasks: ${total}. Graph nodes: ${nodes.length}. KB articles: ${articles.length}. Fully informed: ${fullyInf}. Graph-linked: ${graphLink}. KB-backed: ${kbBacked}. Uninformed: ${uninformed}. Intelligence coverage: ${pct}%.`;
  const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `You are JARVIS. Given this task intelligence pulse summary: ${context} — write exactly 2 sentences assessing operational intelligence coverage and the risk posed by uninformed tasks.` }),
  });
  const j = await res.json();
  return j?.response || j?.message || j?.text || `Task intelligence pulse: ${uninformed} of ${total} tasks lack any graph or knowledge grounding — ${pct}% coverage achieved.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TaskGraphKnowledgePulse() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [rows,      setRows]      = useState([]);
  const [nodeCnt,   setNodeCnt]   = useState(0);
  const [artCnt,    setArtCnt]    = useState(0);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tasks, nodes, articles } = await fetchAll();
      setNodeCnt(nodes.length);
      setArtCnt(articles.length);
      setRows(classify(tasks, nodes, articles));
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); if (!rows.length) load(); };
    window.addEventListener("jarvis:tgkpulse-toggle", toggle);
    return () => window.removeEventListener("jarvis:tgkpulse-toggle", toggle);
  }, [load, rows.length]);

  const total       = rows.length;
  const fullyInf    = rows.filter(r => r._class === "FULLY_INFORMED").length;
  const graphLinked = rows.filter(r => r._class === "GRAPH_LINKED").length;
  const kbBacked    = rows.filter(r => r._class === "KB_BACKED").length;
  const uninformed  = rows.filter(r => r._class === "UNINFORMED").length;
  const intelPct    = total > 0 ? Math.round((fullyInf + graphLinked + kbBacked) / total * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildTgkpulseScript();
      setBrief(script);
      const base = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const aud  = new Audio(url);
        aud.play();
      });
    } catch {}
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: uninformed > 0 ? "rgba(245,158,11,0.18)" : "rgba(0,207,255,0.12)",
    border: `1px solid ${uninformed > 0 ? AM : CY}55`,
    color: uninformed > 0 ? AM : CY,
    borderRadius: 6, padding: "3px 9px", fontSize: 10, fontFamily: FONT,
    cursor: "pointer", letterSpacing: 1, userSelect: "none",
    boxShadow: open ? `0 0 10px ${AM}55` : "none",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(v => !v); if (!rows.length) load(); }}>
        ◈ TGKPULSE
        {uninformed > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{uninformed}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 200, zIndex: Z_INDEX + 1,
          width: 560, maxHeight: "78vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, fontFamily: FONT, color: "#C8DFF0",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>◈ TGKPULSE</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", flex: 1 }}>Task × Graph × Knowledge Intelligence Pulse</span>
            <button onClick={assess} disabled={assessing} style={{
              background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}44`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
            }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE"}
            </button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
            {[
              ["TASKS",         total,       CY],
              ["GRAPH NODES",   nodeCnt,     CY],
              ["KB ARTICLES",   artCnt,      GR],
              ["FULLY INFORMED",fullyInf,    GR],
              ["GRAPH LINKED",  graphLinked, CY],
              ["KB BACKED",     kbBacked,    "#A78BFA"],
              ["UNINFORMED",    uninformed,  AM],
              ["INTEL %",       `${intelPct}%`, intelPct > 60 ? GR : AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "4px 8px", minWidth: 70, textAlign: "center",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1, letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ padding: "0 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${intelPct}%`, background: intelPct > 60 ? GR : AM, borderRadius: 2, transition: "width 0.6s" }} />
            </div>
            <span style={{ fontSize: 9, color: "#6E8AA0" }}>intelligence coverage</span>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setExpanded(null); }} style={{
                background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "rgba(0,0,0,0.3)",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(255,255,255,0.08)"}`,
                color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
                borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", letterSpacing: 0.5,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
                color: "#C8DFF0", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontFamily: FONT, width: 140,
              }}
            />
          </div>

          {/* brief */}
          {brief && (
            <div style={{ margin: "0 14px 8px", padding: "8px 10px", background: "rgba(0,207,255,0.06)", borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: "#C8DFF0" }}>
              {brief}
            </div>
          )}

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>No tasks match the current filter.</div>
            )}
            {visible.map((task, i) => {
              const col   = CLASS_COLOR[task._class] || AM;
              const isExp = expanded === i;
              return (
                <div key={task.id || i} style={{
                  marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 8,
                  background: task._class === "UNINFORMED" ? "rgba(245,158,11,0.05)" : "rgba(0,0,0,0.25)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 100 }}>{task._class}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{task.name || task.title || task.id || "Unknown Task"}</span>
                    <span style={{ fontSize: 10, color: CY, marginLeft: "auto" }}>
                      {task._nodes.length}N · {task._articles.length}KB
                    </span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 10px" }}>
                      {/* graph nodes */}
                      {task._nodes.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: CY, marginBottom: 4, letterSpacing: 1 }}>GRAPH NODES</div>
                          {task._nodes.map((n, ni) => (
                            <div key={ni} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(0,207,255,0.06)", border: `1px solid ${CY}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{n.node || n.label || n.id || "Node"}</span>
                                {n.entity_type && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{n.entity_type}</span>}
                                {n.score != null && <span style={{ fontSize: 10, color: CY, marginLeft: "auto" }}>score: {typeof n.score === "number" ? n.score.toFixed(3) : n.score}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(0,207,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(n._rel * 100 * 4))}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {/* kb articles */}
                      {task._articles.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: GR, marginBottom: 4, marginTop: 6, letterSpacing: 1 }}>KB ARTICLES</div>
                          {task._articles.map((a, ai) => (
                            <div key={ai} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(34,197,94,0.06)", border: `1px solid ${GR}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{a.title || a.id || "Article"}</span>
                                {a.category && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{a.category}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(34,197,94,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(a._rel * 100 * 4))}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {task._nodes.length === 0 && task._articles.length === 0 && (
                        <div style={{ color: AM, fontSize: 11, padding: "4px 0" }}>
                          ⚠ No graph node or KB article matches found for this task.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes tgkpulse-pulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.6; transform:scale(1.15); }
        }
      `}</style>
    </>
  );
}
