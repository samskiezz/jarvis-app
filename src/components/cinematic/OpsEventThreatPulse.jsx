/**
 * OpsEventThreatPulse — F110 (OTPULSE).
 *
 * Correlates live ops events against the graph centrality nodes AND active risk
 * signals to surface THREAT_ALIGNED events — those touching both critical
 * infrastructure nodes and known risk domains simultaneously.
 *
 * Data sources:
 *   /v1/ops/events          → raw ops-event stream (last 24 h)
 *   /v1/graph/centrality    → top centrality nodes (critical infrastructure)
 *   /entities/RiskSignal    → active risk signals (known threat domains)
 *
 * Classification per event (via shared keyword tokens):
 *   THREAT_ALIGNED   — ≥1 centrality node match AND ≥1 risk signal match
 *   CENTRALITY_ONLY  — ≥1 node match, no risk match
 *   RISK_ONLY        — ≥1 risk match, no node match
 *   AMBIENT          — no matches (background noise)
 *
 * Visual:
 *   • Stat tiles: EVENTS / NODES / RISKS / THREAT_ALIGNED / AMBIENT
 *   • Filter tabs: ALL / THREAT_ALIGNED / CENTRALITY_ONLY / RISK_ONLY / AMBIENT
 *   • Expandable rows → cyan node bars + red risk-severity bars
 *   • Red pulse on THREAT_ALIGNED count
 *   • ▶ ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ OTPULSE  left:986280  bottom:8  zIndex:133
 * Event:  jarvis:otpulse-toggle
 * Wired:  App.jsx + JarvisBrain.jsx (isOtpulseQuery / buildOtpulseScript)
 *
 * Voice: "otpulse" / "ops threat pulse" / "event threat" / "operational threat" /
 *        "threat pulse" / "event graph" / "event risk" / "threat event graph"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";
const MONO  = "'JetBrains Mono','Courier New',monospace";

const BTN_LEFT   = 986280;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tokens(text) {
  if (!text) return [];
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(t => t.length > 2);
}

function overlap(tokA, tokB) {
  const setB = new Set(tokB);
  return tokA.filter(t => setB.has(t));
}

function score(hits, total) {
  if (!total) return 0;
  return Math.round((hits / total) * 100);
}

async function loadData() {
  const base = apiBase();
  const hdr  = authHdr();

  const [rawEvents, rawCentral, rawRisks] = await Promise.all([
    fetch(`${base}/v1/ops/events`,       { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/graph/centrality`, { headers: hdr }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then(r => r.json()).catch(() => []),
  ]);

  const events   = normalise(rawEvents).slice(0, 200);
  const nodes    = normalise(rawCentral).slice(0, 80);
  const risks    = normalise(rawRisks);

  const nodeToks  = nodes.map(n => ({ id: n.entity_id || n.id || n.name, label: n.name || n.entity_id || String(n.id), score: n.centrality_score || n.score || 0, toks: tokens([n.name, n.entity_type, n.description].join(" ")) }));
  const riskToks  = risks.map(r => ({ id: r.id || r.name, label: r.name || r.title || String(r.id), sev: (r.severity || "").toLowerCase(), toks: tokens([r.name, r.title, r.description, r.category].join(" ")) }));

  const rows = events.map(ev => {
    const evToks = tokens([ev.event_type, ev.source, ev.description, ev.message, ev.category].join(" "));

    const matchedNodes = nodeToks.map(n => {
      const hits = overlap(evToks, n.toks);
      return hits.length ? { ...n, hits: hits.length, pct: score(hits.length, n.toks.length) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 6);

    const matchedRisks = riskToks.map(r => {
      const hits = overlap(evToks, r.toks);
      return hits.length ? { ...r, hits: hits.length, pct: score(hits.length, r.toks.length) } : null;
    }).filter(Boolean).sort((a, b) => b.hits - a.hits).slice(0, 6);

    const hasNode = matchedNodes.length > 0;
    const hasRisk = matchedRisks.length > 0;
    const cls = hasNode && hasRisk ? "THREAT_ALIGNED"
              : hasNode            ? "CENTRALITY_ONLY"
              : hasRisk            ? "RISK_ONLY"
              :                      "AMBIENT";

    return {
      id:           ev.id || ev.event_id || Math.random().toString(36).slice(2),
      label:        ev.event_type || ev.type || "Event",
      source:       ev.source || "—",
      description:  ev.description || ev.message || "",
      ts:           ev.timestamp || ev.created_at || ev.event_time || "",
      cls,
      matchedNodes,
      matchedRisks,
    };
  });

  const counts = {
    events:         rows.length,
    nodes:          nodes.length,
    risks:          risks.length,
    threatAligned:  rows.filter(r => r.cls === "THREAT_ALIGNED").length,
    centralityOnly: rows.filter(r => r.cls === "CENTRALITY_ONLY").length,
    riskOnly:       rows.filter(r => r.cls === "RISK_ONLY").length,
    ambient:        rows.filter(r => r.cls === "AMBIENT").length,
  };

  return { rows, counts };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

export function isOtpulseQuery(q) {
  const s = q.toLowerCase();
  return s.includes("otpulse") || s.includes("ops threat pulse") ||
    s.includes("event threat") || s.includes("operational threat") ||
    s.includes("threat pulse") || s.includes("event graph") ||
    s.includes("event risk") || s.includes("threat event graph");
}

export async function buildOtpulseScript() {
  try {
    const { counts } = await loadData();
    return (
      `Ops event threat pulse: ${counts.events} events analysed. ` +
      `Graph nodes: ${counts.nodes}. Risk signals: ${counts.risks}. ` +
      `Threat-aligned events (hit both node and risk): ${counts.threatAligned}. ` +
      `Centrality-only: ${counts.centralityOnly}. Risk-only: ${counts.riskOnly}. ` +
      `Ambient: ${counts.ambient}. ` +
      (counts.threatAligned > 0 ? `${counts.threatAligned} event(s) are simultaneously touching critical graph nodes and known risk domains — review immediately.` : `No events are currently aligned to both graph centrality nodes and risk signals.`)
    );
  } catch {
    return "Ops event threat pulse data unavailable.";
  }
}

// ── colour helpers ────────────────────────────────────────────────────────────

function clsColor(cls) {
  return cls === "THREAT_ALIGNED"  ? RED
       : cls === "CENTRALITY_ONLY" ? CY
       : cls === "RISK_ONLY"       ? AMBER
       :                             "rgba(255,255,255,0.25)";
}

function sevColor(sev) {
  return sev === "critical" ? RED : sev === "high" ? AMBER : CY;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "THREAT_ALIGNED", "CENTRALITY_ONLY", "RISK_ONLY", "AMBIENT"];

export default function OpsEventThreatPulse() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(new Set());
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await loadData()); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const on = () => setOpen(o => !o);
    window.addEventListener("jarvis:otpulse-toggle", on);
    return () => window.removeEventListener("jarvis:otpulse-toggle", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const rows = data?.rows ?? [];
  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.label.toLowerCase().includes(s) || r.source.toLowerCase().includes(s) || r.description.toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    if (!data) return;
    setAssessing(true);
    try {
      const { counts } = data;
      const prompt =
        `Ops event threat pulse — ${counts.events} events. ` +
        `Threat-aligned: ${counts.threatAligned}. Centrality-only: ${counts.centralityOnly}. ` +
        `Risk-only: ${counts.riskOnly}. Ambient: ${counts.ambient}. ` +
        `Provide a 2-sentence operational threat assessment and immediate priority action.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }

  const TILE_STYLE = {
    background: "rgba(0,0,0,0.55)", border: "1px solid rgba(41,231,255,0.2)",
    borderRadius: 6, padding: "8px 10px", minWidth: 76, textAlign: "center",
  };

  const counts = data?.counts;

  const tiles = counts ? [
    { label: "EVENTS",         value: counts.events,         color: CY,    pulse: false },
    { label: "GRAPH NODES",    value: counts.nodes,          color: CY,    pulse: false },
    { label: "RISK SIGNALS",   value: counts.risks,          color: AMBER, pulse: false },
    { label: "THREAT ALIGNED", value: counts.threatAligned,  color: RED,   pulse: counts.threatAligned > 0 },
    { label: "AMBIENT",        value: counts.ambient,        color: "rgba(255,255,255,0.35)", pulse: false },
  ] : [];

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 133,
          background: open ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "4px 8px", cursor: "pointer", borderRadius: 4,
          boxShadow: `0 0 12px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ OTPULSE
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: "min(820px,95vw)", zIndex: 3000,
          background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "16px 18px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}22`,
          fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>

          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
              ◈ OPS EVENT THREAT PULSE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {tiles.map(t => (
              <div key={t.label} style={TILE_STYLE}>
                <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 2, marginBottom: 3 }}>{t.label}</div>
                <div style={{
                  fontSize: 18, color: t.color, fontWeight: 700,
                  ...(t.pulse ? { animation: "pulse-otpulse 1.4s ease-in-out infinite" } : {}),
                }}>
                  {loading && !data ? "…" : t.value}
                </div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "rgba(0,0,0,0.3)",
                  border: `1px solid ${tab === t ? CY : "rgba(255,255,255,0.1)"}`,
                  color: tab === t ? CY : "#6E8AA0",
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", cursor: "pointer", borderRadius: 3,
                }}>
                {t}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto",
                background: "rgba(0,0,0,0.4)", border: "1px solid rgba(41,231,255,0.2)",
                color: "#DCEBF5", fontFamily: MONO, fontSize: 9,
                padding: "3px 8px", borderRadius: 3, outline: "none",
                width: 170,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
            {loading && !data && (
              <div style={{ color: "#6E8AA0", fontSize: 9, padding: "20px 0", textAlign: "center", letterSpacing: 2 }}>LOADING…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 9, padding: "20px 0", textAlign: "center", letterSpacing: 2 }}>NO EVENTS</div>
            )}
            {filtered.map(row => {
              const isOpen = expanded.has(row.id);
              const cls    = row.cls;
              const cColor = clsColor(cls);
              return (
                <div key={row.id} style={{
                  marginBottom: 6, background: "rgba(0,0,0,0.35)",
                  border: `1px solid ${cColor}33`, borderRadius: 6, overflow: "hidden",
                }}>
                  {/* row header */}
                  <div
                    onClick={() => setExpanded(s => { const n = new Set(s); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 8, color: cColor, letterSpacing: 1, minWidth: 110, fontWeight: 700 }}>{cls}</span>
                    <span style={{ fontSize: 9, color: "#A0BCC8", flex: 1 }}>{row.label}</span>
                    <span style={{ fontSize: 8, color: "#6E8AA0", whiteSpace: "nowrap" }}>{row.source}</span>
                    {(row.matchedNodes.length > 0 || row.matchedRisks.length > 0) && (
                      <span style={{ fontSize: 8, color: "#6E8AA0" }}>
                        {isOpen ? "▲" : "▼"} ({row.matchedNodes.length}N {row.matchedRisks.length}R)
                      </span>
                    )}
                  </div>

                  {/* expand detail */}
                  {isOpen && (
                    <div style={{ padding: "6px 12px 10px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                      {row.description && (
                        <div style={{ fontSize: 8, color: "#6E8AA0", marginBottom: 8, lineHeight: 1.5 }}>{row.description.slice(0, 180)}</div>
                      )}

                      {/* centrality node matches */}
                      {row.matchedNodes.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 7, color: CY, letterSpacing: 2, marginBottom: 5 }}>CENTRALITY NODES</div>
                          {row.matchedNodes.map(n => (
                            <div key={n.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 8 }}>
                                <span style={{ color: "#A0BCC8" }}>{n.label}</span>
                                <span style={{ color: CY }}>{n.pct}%</span>
                              </div>
                              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${n.pct}%`, background: CY, borderRadius: 2, transition: "width 0.4s" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* risk signal matches */}
                      {row.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED, letterSpacing: 2, marginBottom: 5 }}>RISK SIGNALS</div>
                          {row.matchedRisks.map(r => (
                            <div key={r.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2, fontSize: 8 }}>
                                <span style={{ color: "#A0BCC8" }}>{r.label}</span>
                                <span style={{ color: sevColor(r.sev), fontSize: 7, letterSpacing: 1 }}>{r.sev || "??"} — {r.pct}%</span>
                              </div>
                              <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${r.pct}%`, background: sevColor(r.sev), borderRadius: 2, transition: "width 0.4s" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer: coverage bar + assess */}
          {counts && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 8 }}>
                <span style={{ color: "#6E8AA0" }}>THREAT ALIGNMENT COVERAGE</span>
                <span style={{ color: RED }}>
                  {counts.events ? Math.round((counts.threatAligned / counts.events) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 12 }}>
                <div style={{
                  height: "100%",
                  width: counts.events ? `${(counts.threatAligned / counts.events) * 100}%` : "0%",
                  background: RED, borderRadius: 2, transition: "width 0.5s",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={assess} disabled={assessing || !data}
                  style={{
                    background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
                    border: `1px solid ${CY}`, color: CY,
                    fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                    padding: "4px 12px", cursor: assessing || !data ? "default" : "pointer", borderRadius: 3,
                  }}>
                  {assessing ? "ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-otpulse {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.5; transform:scale(1.15); }
        }
      `}</style>
    </>
  );
}
