/**
 * F96 — Contact × Graph Centrality × IntelProfile Influence Exposure Index (CGINFEX)
 * Parallel-fetches /entities/Contact + /v1/graph/centrality + /entities/IntelProfile.
 * Keyword-correlates each contact against high-centrality graph nodes AND known threat actor
 * profiles to classify:
 *   FULLY_EXPOSED (centrality match + actor match) | GRAPH_LINKED (centrality only)
 *   ACTOR_LINKED (intel profile only)             | CLEAR (neither)
 * Red pulse badge on fully-exposed count. Stat tiles: CONTACTS/NODES/PROFILES/classifications.
 * Filter tabs ALL/FULLY_EXPOSED/GRAPH_LINKED/ACTOR_LINKED/CLEAR + text search.
 * Expand contact → matched graph node cards (cyan) + intel actor cards (orange) with relevance bars.
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "cginfex/contact graph/contact centrality/contact influence/graph exposure/actor exposure/influence exposure index".
 * Event: jarvis:cginfex-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 996_680;
const Z_INDEX  = 158;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CGINFEX_RE = /\b(cginfex|contact\s+graph|contact\s+centrality|contact\s+influence|graph\s+exposure|actor\s+exposure|influence\s+exposure\s+index|network\s+exposure\s+contact|contact\s+network\s+exposure)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const OR = "#F97316";
const GR = "#22C55E";
const RD = "#EF4444";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXPOSED: RD,
  GRAPH_LINKED:  CY,
  ACTOR_LINKED:  OR,
  CLEAR:         GR,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isCginfexQuery(text) {
  return CGINFEX_RE.test(text || "");
}

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

function scoreContactVsNode(contact, node) {
  const cStr = [contact.name, contact.role, contact.org, contact.email, (contact.tags || []).join(" ")].join(" ");
  const nStr = [node.entity_id, node.name, node.label, node.type].join(" ");
  return overlap(cStr, nStr);
}

function scoreContactVsActor(contact, actor) {
  const cStr = [contact.name, contact.role, contact.org, contact.email, (contact.tags || []).join(" ")].join(" ");
  const aStr = [actor.name, actor.org, actor.role, (actor.aliases || []).join(" "), (actor.tags || []).join(" ")].join(" ");
  return overlap(cStr, aStr);
}

async function fetchAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();
  const [rContacts, rGraph, rActors] = await Promise.all([
    fetch(`${base}/entities/Contact`,       { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/v1/graph/centrality`,    { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/IntelProfile`,  { headers: h }).then(r => r.json()).catch(() => ({})),
  ]);
  const contacts = norm(rContacts, ["items", "data", "results", "contacts"]);
  const nodes    = norm(rGraph,    ["items", "data", "results", "nodes", "centrality", "top_nodes"]);
  const actors   = norm(rActors,   ["items", "data", "results", "intel_profiles", "profiles"]);

  const THRESH = 0.06;
  const rows = contacts.map(contact => {
    const matchedNodes = nodes
      .map(n => ({ ...n, _rel: scoreContactVsNode(contact, n) }))
      .filter(n => n._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const matchedActors = actors
      .map(a => ({ ...a, _rel: scoreContactVsActor(contact, a) }))
      .filter(a => a._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const hasNode  = matchedNodes.length > 0;
    const hasActor = matchedActors.length > 0;
    const cls = hasNode && hasActor ? "FULLY_EXPOSED"
              : hasNode             ? "GRAPH_LINKED"
              : hasActor            ? "ACTOR_LINKED"
              :                       "CLEAR";
    return { ...contact, _class: cls, _nodes: matchedNodes, _actors: matchedActors };
  });
  return { rows, nodes, actors };
}

export async function buildCginfexScript() {
  const { rows, nodes, actors } = await fetchAll();
  const total   = rows.length;
  const exposed = rows.filter(r => r._class === "FULLY_EXPOSED").length;
  const graph   = rows.filter(r => r._class === "GRAPH_LINKED").length;
  const actor   = rows.filter(r => r._class === "ACTOR_LINKED").length;
  const clear   = rows.filter(r => r._class === "CLEAR").length;
  const pct = total ? Math.round((clear / total) * 100) : 0;
  return `Contact influence exposure index CGINFEX report, sir. Of ${total} contacts cross-referenced against ${nodes.length} high-centrality graph nodes and ${actors.length} known threat actor profiles: ${exposed} contacts are fully exposed — they appear in both the influence network and as known threat actors. ${graph} are graph-linked but not yet profiled, and ${actor} are actor-linked without graph centrality. Only ${clear} contacts (${pct}%) are clear of both exposure vectors. Recommend immediate threat assessment for fully-exposed contacts and prioritising intel profiling for graph-linked individuals.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ContactGraphInfluenceExposure() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { rows: r } = await fetchAll();
      setRows(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:cginfex-toggle", h);
    return () => window.removeEventListener("jarvis:cginfex-toggle", h);
  }, []);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.role, r.org, r.email].join(" ").toLowerCase().includes(s);
    }
    return true;
  });

  const total   = rows.length;
  const exposed = rows.filter(r => r._class === "FULLY_EXPOSED").length;
  const graph   = rows.filter(r => r._class === "GRAPH_LINKED").length;
  const actor   = rows.filter(r => r._class === "ACTOR_LINKED").length;
  const clear   = rows.filter(r => r._class === "CLEAR").length;
  const pct = total ? Math.round((clear / total) * 100) : 0;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildCginfexScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => null);
      const text = res?.response || res?.message || res?.content || script;
      setBrief(text);
      try {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setBrief("Influence exposure assessment unavailable: " + String(e));
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "FULLY_EXPOSED", "GRAPH_LINKED", "ACTOR_LINKED", "CLEAR"];
  const TAB_LABELS = { ALL: "ALL", FULLY_EXPOSED: "FULLY EXPOSED", GRAPH_LINKED: "GRAPH LINKED", ACTOR_LINKED: "ACTOR LINKED", CLEAR: "CLEAR" };

  const tile = (label, val, color) => (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 12px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Graph Centrality × IntelProfile Influence Exposure Index (CGINFEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,11,22,0.88)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "4px 10px", fontSize: 10, fontFamily: FONT,
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: open ? `0 0 14px ${CY}66` : "none",
        }}
      >
        ◈ CGINFEX
        {exposed > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700,
            animation: "cginfexPulse 1.8s ease-in-out infinite",
          }}>{exposed}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(840px,95vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
          display: "flex", flexDirection: "column", fontFamily: FONT,
          boxShadow: `0 0 60px ${CY}22`,
        }}>
          {/* header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ CGINFEX</span>
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>Contact × Graph Centrality × IntelProfile Influence Exposure Index</span>
              <button onClick={() => setOpen(false)} style={{
                marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 16,
              }}>✕</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {tile("TOTAL", total, CY)}
              {tile("FULLY EXP.", exposed, RD)}
              {tile("GRAPH LINK.", graph, CY)}
              {tile("ACTOR LINK.", actor, OR)}
              {tile("CLEAR", clear, GR)}
            </div>

            {/* coverage bar (% clear) */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: "#6E8AA0", minWidth: 80 }}>CLEAR RATE</span>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${GR},${CY})`, borderRadius: 3, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 11, color: GR, minWidth: 36 }}>{pct}%</span>
            </div>

            {/* filter tabs */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: FONT,
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.04)",
                  color: tab === t ? "#04060A" : "#8FA8C0",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.1)"}`,
                }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="search contacts…"
                style={{
                  marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                  color: "#DCEBF5", fontFamily: FONT, outline: "none", width: 140,
                }}
              />
            </div>
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>loading contact influence exposure data…</div>}
            {err     && <div style={{ color: RD, fontSize: 11, padding: 12 }}>{err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>no contacts match this filter</div>
            )}
            {filtered.map((contact, i) => {
              const cc = CLASS_COLOR[contact._class] || CY;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  marginBottom: 6, border: `1px solid ${cc}22`, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  animation: contact._class === "FULLY_EXPOSED" ? "cginfexPulse 1.8s ease-in-out infinite" : "none",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                      boxShadow: `0 0 6px ${cc}` }} />
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{contact.name || contact.id || `Contact #${i+1}`}</span>
                    {contact.role && <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{String(contact.role).toUpperCase()}</span>}
                    {contact.org  && <span style={{ fontSize: 9, color: AM }}>{contact.org}</span>}
                    <span style={{ fontSize: 9, color: cc, letterSpacing: 1, padding: "2px 6px",
                      border: `1px solid ${cc}44`, borderRadius: 4 }}>{contact._class.replace(/_/g, " ")}</span>
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {contact.email && (
                        <div style={{ fontSize: 10, color: "#8FA8C0", marginBottom: 8 }}>{contact.email}</div>
                      )}
                      {/* matched graph nodes */}
                      {contact._nodes.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED GRAPH CENTRALITY NODES</div>
                          {contact._nodes.map((n, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(0,207,255,0.07)", border: `1px solid ${CY}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {n.type && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: CY,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(n.type).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{n.name || n.label || n.entity_id || "Node"}</span>
                                {n.centrality_score != null && (
                                  <span style={{ fontSize: 9, color: CY, marginLeft: "auto" }}>
                                    {typeof n.centrality_score === "number" ? n.centrality_score.toFixed(3) : n.centrality_score}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(n._rel * 100))}%`, height: "100%",
                                    background: CY, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: CY }}>{Math.round(n._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* matched intel actor profiles */}
                      {contact._actors.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED INTEL ACTOR PROFILES</div>
                          {contact._actors.map((a, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(249,115,22,0.07)", border: `1px solid ${OR}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                {a.role && (
                                  <span style={{ fontSize: 9, color: "#04060A", background: OR,
                                    padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                    {String(a.role).toUpperCase()}
                                  </span>
                                )}
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{a.name || "Actor"}</span>
                                {a.org && <span style={{ fontSize: 9, color: "#8FA8C0" }}>{a.org}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(a._rel * 100))}%`, height: "100%",
                                    background: OR, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: OR }}>{Math.round(a._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {contact._nodes.length === 0 && contact._actors.length === 0 && (
                        <div style={{ fontSize: 10, color: GR, fontStyle: "italic" }}>
                          No centrality node or intel actor correlations — contact is clear.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <button onClick={assess} disabled={assessing || loading} style={{
              background: assessing ? "rgba(0,207,255,0.1)" : CY, color: assessing ? CY : "#04060A",
              border: `1px solid ${CY}`, borderRadius: 6, padding: "6px 14px", fontSize: 11,
              cursor: assessing ? "not-allowed" : "pointer", fontFamily: FONT, letterSpacing: 1,
            }}>
              {assessing ? "assessing…" : "▶ ASSESS EXPOSURE"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "rgba(0,207,255,0.06)", borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${CY}22`,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes cginfexPulse {
          0%,100% { box-shadow: 0 0 0 0 ${RD}00; }
          50%      { box-shadow: 0 0 0 4px ${RD}44; }
        }
      `}</style>
    </>
  );
}
