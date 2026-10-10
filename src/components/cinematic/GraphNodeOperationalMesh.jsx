/**
 * F103 — Graph Node × Task × Investigation
 *         Operational Mesh (GNTIOP)
 *
 * Parallel-fetches /v1/graph/centrality + /entities/Task + /v1/investigations.
 * Keyword-correlates each high-centrality graph node against active tasks AND
 * open investigations to classify:
 *   FULLY_ACTIVE       (task + investigation match)
 *   TASK_DRIVEN        (task only)
 *   INVESTIGATION_LINKED (investigation only)
 *   DORMANT            (no operational match)
 *
 * Red pulse badge on FULLY_ACTIVE count (highest-priority attention items).
 * Stat tiles NODES / TASKS / INVESTIGATIONS + all four class counts.
 * Filter tabs ALL/FULLY_ACTIVE/TASK_DRIVEN/INVESTIGATION_LINKED/DORMANT + text search.
 * Expand node → matched task cards (teal) + investigation cards (blue)
 *   with relevance bars.
 * ▶ ASSESS MESH → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "gntiop/graph node task/graph node investigation/
 *   operational mesh/node operational/graph operational mesh/
 *   graph task investigation/graph active nodes".
 * Event: jarvis:gntiop-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_000_600;
const Z_INDEX  = 165;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const GNTIOP_RE = /\b(gntiop|graph[\s-]node[\s-]task|graph[\s-]node[\s-]investigation|operational[\s-]mesh|node[\s-]operational|graph[\s-]operational[\s-]mesh|graph[\s-]task[\s-]investigation|graph[\s-]active[\s-]nodes|node[\s-]mesh)\b/i;

const CY    = "#00CFFF";
const TL    = "#14B8A6";
const BL    = "#3B82F6";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const GR    = "#22C55E";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ACTIVE:          RD,
  TASK_DRIVEN:           TL,
  INVESTIGATION_LINKED:  BL,
  DORMANT:               AM,
};

const TABS = ["ALL","FULLY_ACTIVE","TASK_DRIVEN","INVESTIGATION_LINKED","DORMANT"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isGntiopQuery(text) {
  return GNTIOP_RE.test(text || "");
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

function nodeStr(n) {
  return [n.id, n.name, n.label, n.type, n.description,
    (n.tags || []).join(" ")].join(" ");
}

function taskStr(t) {
  return [t.id, t.name, t.title, t.description, t.type,
    t.assignee, t.tags && t.tags.join ? t.tags.join(" ") : String(t.tags || "")].join(" ");
}

function invStr(i) {
  return [i.id, i.name, i.title, i.description, i.status,
    i.type, (i.tags || []).join(" ")].join(" ");
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [centralityRaw, taskRaw, invRaw] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/Task`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/investigations`, { headers }).then(r => r.json()),
  ]);

  const nodes = norm(centralityRaw, ["nodes","items","data","results","centrality","entities"]);
  const tasks = norm(taskRaw,       ["tasks","items","data","results"]);
  const invs  = norm(invRaw,        ["investigations","items","data","results","cases"]);
  return { nodes, tasks, invs };
}

function classify(nodes, tasks, invs) {
  return nodes.map(n => {
    const ns = nodeStr(n);
    const taskMatches = tasks.map(t => ({ ...t, rel: overlap(ns, taskStr(t)) }))
      .filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0, 5);
    const invMatches  = invs.map(i => ({ ...i, rel: overlap(ns, invStr(i)) }))
      .filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0, 5);
    const hasTask = taskMatches.length > 0;
    const hasInv  = invMatches.length  > 0;
    let cls;
    if (hasTask && hasInv) cls = "FULLY_ACTIVE";
    else if (hasTask)      cls = "TASK_DRIVEN";
    else if (hasInv)       cls = "INVESTIGATION_LINKED";
    else                   cls = "DORMANT";
    return { ...n, cls, taskMatches, invMatches };
  });
}

export async function buildGntiopScript() {
  const { nodes, tasks, invs } = await fetchAll();
  const classified   = classify(nodes, tasks, invs);
  const total        = classified.length;
  const fullyActive  = classified.filter(c => c.cls === "FULLY_ACTIVE").length;
  const taskDriven   = classified.filter(c => c.cls === "TASK_DRIVEN").length;
  const invLinked    = classified.filter(c => c.cls === "INVESTIGATION_LINKED").length;
  const dormant      = classified.filter(c => c.cls === "DORMANT").length;
  const pct          = total ? Math.round(((fullyActive + taskDriven + invLinked) / total) * 100) : 0;

  if (!total) return "No graph centrality nodes available at this time, sir.";

  return `Graph Node Operational Mesh GNTIOP online, sir. Analysed ${total} high-centrality graph node${total === 1 ? "" : "s"} ` +
    `against ${tasks.length} active task${tasks.length === 1 ? "" : "s"} and ${invs.length} open investigation${invs.length === 1 ? "" : "s"}. ` +
    `${fullyActive} node${fullyActive === 1 ? "" : "s"} are fully active — linked to both tasks and investigations, requiring immediate operational attention. ` +
    `${taskDriven} task-driven, ${invLinked} investigation-linked, ${dormant} dormant with no current operational linkage. ` +
    `Operational mesh coverage at ${pct} percent. Recommend reviewing dormant high-centrality nodes for unrecognised operational relevance, sir.`;
}

// ── styles ────────────────────────────────────────────────────────────────────

const s = {
  wrap: {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    fontFamily: FONT,
  },
  btn: (open) => ({
    background: open ? CY : "rgba(0,207,255,0.10)",
    color: open ? "#04060A" : CY,
    border: `1px solid ${CY}66`,
    borderRadius: 4, padding: "3px 9px", fontSize: 10,
    cursor: "pointer", letterSpacing: 1,
    boxShadow: open ? `0 0 14px ${CY}` : "none",
  }),
  badge: (color) => ({
    background: color, color: "#fff", fontSize: 9,
    borderRadius: 8, padding: "1px 5px", marginLeft: 4,
    animation: "gntiop-pulse 1.4s ease-in-out infinite",
  }),
  panel: {
    position: "fixed", bottom: 42, left: Math.min(BTN_LEFT, window.innerWidth ? window.innerWidth - 580 : BTN_LEFT),
    zIndex: Z_INDEX + 1, width: 560, maxHeight: "76vh",
    background: BG, border: `1px solid ${BORDER}`,
    borderRadius: 10, padding: "14px 16px",
    backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
    boxShadow: `0 0 40px ${CY}18`,
  },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  title:  { color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 },
  pill:   (color) => ({
    background: `${color}22`, color, border: `1px solid ${color}44`,
    borderRadius: 4, padding: "2px 7px", fontSize: 10,
  }),
  tabs:   { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 },
  tab:    (active) => ({
    background: active ? CY : "rgba(0,207,255,0.08)", color: active ? "#04060A" : CY,
    border: `1px solid ${CY}33`, borderRadius: 3, padding: "2px 7px",
    fontSize: 9, cursor: "pointer",
  }),
  search: {
    background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
    borderRadius: 4, color: CY, fontSize: 11, padding: "4px 8px",
    outline: "none", width: "100%", marginBottom: 8, fontFamily: FONT,
  },
  stats:  { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  stat:   (color) => ({
    flex: "1 1 80px", background: `${color}11`, border: `1px solid ${color}33`,
    borderRadius: 5, padding: "5px 8px", textAlign: "center",
  }),
  statVal: (color) => ({ color, fontSize: 16, fontWeight: 700 }),
  statLbl: { color: "#8aafc0", fontSize: 8, letterSpacing: 1, marginTop: 1 },
  coverBar: { height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", marginBottom: 10 },
  coverFill: (pct, color) => ({
    height: "100%", width: `${Math.min(100, pct)}%`, borderRadius: 2, background: color,
    transition: "width 0.6s ease",
  }),
  list:   { overflowY: "auto", flex: 1, paddingRight: 2 },
  card:   (cls) => ({
    background: `${CLASS_COLOR[cls] || CY}09`,
    border: `1px solid ${CLASS_COLOR[cls] || CY}33`,
    borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer",
  }),
  row:    { display: "flex", alignItems: "center", gap: 6 },
  clsBadge: (cls) => ({
    background: `${CLASS_COLOR[cls]}22`, color: CLASS_COLOR[cls],
    border: `1px solid ${CLASS_COLOR[cls]}44`,
    borderRadius: 3, padding: "1px 5px", fontSize: 8, letterSpacing: 1,
  }),
  name:   { color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  score:  { color: "#8aafc0", fontSize: 9 },
  subSection: { marginTop: 6, padding: "4px 6px", background: "rgba(255,255,255,0.03)", borderRadius: 4 },
  subTitle: (color) => ({ color, fontSize: 9, letterSpacing: 1, marginBottom: 3 }),
  matchCard: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 },
  bar:    (rel, color) => ({
    height: 3, borderRadius: 2,
    background: `linear-gradient(to right, ${color}, ${color}44)`,
    width: `${Math.min(100, Math.round(rel * 100))}%`,
    marginTop: 2,
  }),
  footer: { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}22`, display: "flex", alignItems: "flex-start", gap: 10 },
  assessBtn: {
    background: `${CY}22`, color: CY, border: `1px solid ${CY}66`,
    borderRadius: 4, padding: "4px 10px", fontSize: 10, cursor: "pointer",
    letterSpacing: 1, whiteSpace: "nowrap",
  },
  briefText: { color: "#8aafc0", fontSize: 10, lineHeight: 1.5 },
};

// ── component ─────────────────────────────────────────────────────────────────

export default function GraphNodeOperationalMesh() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState({});
  const [brief,      setBrief]      = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { nodes, tasks, invs } = await fetchAll();
      setData({ classified: classify(nodes, tasks, invs), tasks, invs });
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:gntiop-toggle", toggle);
    return () => window.removeEventListener("jarvis:gntiop-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    try {
      const script = await buildGntiopScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Graph Node Operational Mesh assessment: ${script}` }),
      });
      const d = await r.json();
      const ans = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(ans);
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: ans, voice: "ash" }),
        });
      } catch { /* TTS optional */ }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [data]);

  if (!data && !open) {
    const dormantCount = 0;
    return (
      <div style={s.wrap}>
        <button style={s.btn(false)} onClick={() => setOpen(true)}>
          ◈ GNTIOP
          {dormantCount > 0 && <span style={s.badge(AM)}>{dormantCount}</span>}
        </button>
        <style>{`@keyframes gntiop-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      </div>
    );
  }

  const classified = data?.classified || [];
  const total      = classified.length;
  const fullyActive = classified.filter(c => c.cls === "FULLY_ACTIVE").length;
  const taskDriven  = classified.filter(c => c.cls === "TASK_DRIVEN").length;
  const invLinked   = classified.filter(c => c.cls === "INVESTIGATION_LINKED").length;
  const dormant     = classified.filter(c => c.cls === "DORMANT").length;
  const meshPct     = total ? Math.round(((fullyActive + taskDriven + invLinked) / total) * 100) : 0;

  const visible = classified.filter(n => {
    if (tab !== "ALL" && n.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (n.id || "").toLowerCase().includes(q) ||
             (n.name || "").toLowerCase().includes(q) ||
             (n.label || "").toLowerCase().includes(q) ||
             (n.type || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={s.wrap}>
      <button style={s.btn(open)} onClick={() => setOpen(v => !v)}>
        ◈ GNTIOP
        {fullyActive > 0 && <span style={s.badge(RD)}>{fullyActive}</span>}
        {!fullyActive && dormant > 0 && <span style={s.badge(AM)}>{dormant}</span>}
      </button>

      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <span style={s.title}>GRAPH NODE OPERATIONAL MESH</span>
            <span style={s.pill(CY)}>{total} NODES</span>
            <span style={s.pill(TL)}>{data?.tasks?.length || 0} TASKS</span>
            <span style={s.pill(BL)}>{data?.invs?.length || 0} INV</span>
            <button onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none",
                color: "#666", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={s.stats}>
            <div style={s.stat(RD)}>
              <div style={s.statVal(RD)}>{fullyActive}</div>
              <div style={s.statLbl}>FULLY ACTIVE</div>
            </div>
            <div style={s.stat(TL)}>
              <div style={s.statVal(TL)}>{taskDriven}</div>
              <div style={s.statLbl}>TASK DRIVEN</div>
            </div>
            <div style={s.stat(BL)}>
              <div style={s.statVal(BL)}>{invLinked}</div>
              <div style={s.statLbl}>INV LINKED</div>
            </div>
            <div style={s.stat(AM)}>
              <div style={s.statVal(AM)}>{dormant}</div>
              <div style={s.statLbl}>DORMANT</div>
            </div>
            <div style={s.stat(GR)}>
              <div style={s.statVal(GR)}>{meshPct}%</div>
              <div style={s.statLbl}>MESH COVER</div>
            </div>
          </div>

          {/* Coverage bar */}
          <div style={s.coverBar}>
            <div style={s.coverFill(meshPct, GR)} />
          </div>

          {/* Filter tabs */}
          <div style={s.tabs}>
            {TABS.map(t => (
              <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            style={s.search}
            placeholder="Search nodes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Node list */}
          <div style={s.list}>
            {loading && <div style={{ color: "#8aafc0", fontSize: 11, padding: 8 }}>Loading…</div>}
            {error   && <div style={{ color: RD, fontSize: 11, padding: 8 }}>{error}</div>}
            {visible.map((n, i) => {
              const nodeId = n.id || n.name || i;
              const exp    = expanded[nodeId];
              return (
                <div key={nodeId} style={s.card(n.cls)}
                  onClick={() => setExpanded(prev => ({ ...prev, [nodeId]: !prev[nodeId] }))}>
                  <div style={s.row}>
                    <span style={s.clsBadge(n.cls)}>{n.cls.replace(/_/g," ")}</span>
                    <span style={s.name}>{n.name || n.label || n.id || "Unnamed Node"}</span>
                    {n.score !== undefined && (
                      <span style={s.score}>⬡ {typeof n.score === "number" ? n.score.toFixed(3) : n.score}</span>
                    )}
                    {n.type && (
                      <span style={{ color: "#8aafc0", fontSize: 9, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                        {n.type}
                      </span>
                    )}
                  </div>

                  {exp && (
                    <div style={{ marginTop: 6 }}>
                      {/* Matched tasks */}
                      {n.taskMatches.length > 0 && (
                        <div style={s.subSection}>
                          <div style={s.subTitle(TL)}>◈ TASKS ({n.taskMatches.length})</div>
                          {n.taskMatches.map((t, ti) => (
                            <div key={ti} style={{ marginBottom: 5 }}>
                              <div style={s.matchCard}>
                                {t.status && (
                                  <span style={{ color: "#aaa", fontSize: 9, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                                    {t.status}
                                  </span>
                                )}
                                <span style={{ color: TL, fontSize: 10, flex: 1 }}>{t.name || t.title || "Unnamed Task"}</span>
                                <span style={{ color: TL, fontSize: 9 }}>{Math.round(t.rel * 100)}%</span>
                              </div>
                              <div style={s.bar(t.rel, TL)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched investigations */}
                      {n.invMatches.length > 0 && (
                        <div style={{ ...s.subSection, marginTop: 5 }}>
                          <div style={s.subTitle(BL)}>◎ INVESTIGATIONS ({n.invMatches.length})</div>
                          {n.invMatches.map((inv, ii) => (
                            <div key={ii} style={{ marginBottom: 5 }}>
                              <div style={s.matchCard}>
                                {inv.status && (
                                  <span style={{ color: "#aaa", fontSize: 9, background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 3 }}>
                                    {inv.status}
                                  </span>
                                )}
                                <span style={{ color: BL, fontSize: 10, flex: 1 }}>{inv.name || inv.title || "Unnamed Investigation"}</span>
                                <span style={{ color: BL, fontSize: 9 }}>{Math.round(inv.rel * 100)}%</span>
                              </div>
                              <div style={s.bar(inv.rel, BL)} />
                            </div>
                          ))}
                        </div>
                      )}

                      {n.taskMatches.length === 0 && n.invMatches.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "4px 0" }}>
                          No matching tasks or investigations found for this node.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {visible.length === 0 && !loading && (
              <div style={{ color: "#666", fontSize: 11, padding: 16 }}>No nodes match current filter.</div>
            )}
          </div>

          {/* Footer */}
          <div style={s.footer}>
            <button style={s.assessBtn} onClick={assess} disabled={assessing}>
              {assessing ? "ASSESSING…" : "▶ ASSESS MESH"}
            </button>
            {brief && <span style={s.briefText}>{brief}</span>}
          </div>
        </div>
      )}
      <style>{`@keyframes gntiop-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  );
}
