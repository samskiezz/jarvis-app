/**
 * GraphCentralityOpsEvents — F103 (GCOE)
 *
 * Parallel-fetches /v1/graph/centrality + /v1/ops/events every 60 s.
 * Keyword-correlates each top-centrality graph node against live ops events.
 * Classification: MONITORED (≥1 correlated event) vs UNMONITORED (0).
 * Red badge on unmonitored count.
 *
 * Voice intents: "graph ops / ops graph / gcoe / monitored nodes /
 *                unmonitored nodes / graph operational / central nodes ops /
 *                which nodes have ops / node ops events / graph ops events"
 * Strip button: ◈ GCOE  left:3420 bottom:18 zIndex:68
 * Custom event: jarvis:gcoe-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const PRP = "#B485FF";
const POLL = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isGcoeQuery(q) {
  const t = (q || "").toLowerCase();
  return (
    t.includes("gcoe") ||
    t.includes("graph ops") ||
    t.includes("ops graph") ||
    t.includes("monitored nodes") ||
    t.includes("unmonitored nodes") ||
    t.includes("graph operational") ||
    t.includes("central nodes ops") ||
    t.includes("which nodes have ops") ||
    t.includes("node ops events") ||
    t.includes("graph ops events")
  );
}

function normArr(d) {
  return Array.isArray(d)
    ? d
    : (d?.data || d?.items || d?.results || d?.nodes || d?.events || []);
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function scoreMatch(nodeText, evtText) {
  const a = new Set(tokenize(nodeText));
  const b = tokenize(evtText);
  const hits = b.filter(w => a.has(w)).length;
  return hits / Math.max(b.length, 1);
}

export async function buildGcoeScript() {
  try {
    const base = apiBase();
    const [nr, er] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/ops/events`,       { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const nodes  = normArr(nr).slice(0, 40);
    const events = normArr(er);
    let monitored = 0, unmonitored = 0;
    for (const node of nodes) {
      const nText = [node.id, node.label, node.type, node.name].join(" ");
      const found = events.some(ev => {
        const eText = [ev.type, ev.resource, ev.description, ev.service, ev.message].join(" ");
        return scoreMatch(nText, eText) > 0;
      });
      if (found) monitored++; else unmonitored++;
    }
    return (
      `Graph Centrality × Ops Events: ${nodes.length} high-centrality nodes correlated against ` +
      `${events.length} live ops events. ${monitored} MONITORED (operational event matched), ` +
      `${unmonitored} UNMONITORED (no ops events correlated).`
    );
  } catch (e) {
    return `GCOE check failed: ${e.message}`;
  }
}

// ─── assess helper ────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const monitored   = correlated.filter(n => n.monitored).length;
  const unmonitored = correlated.filter(n => !n.monitored).length;
  const topUnmon = correlated
    .filter(n => !n.monitored)
    .slice(0, 2)
    .map(n => n.label || n.id)
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on Graph Centrality × Ops Events coverage: ` +
    `${monitored} high-centrality graph nodes have at least one correlated operational event (MONITORED) ` +
    `and ${unmonitored} are UNMONITORED` +
    (topUnmon ? ` — most exposed dark nodes: ${topUnmon}` : "") +
    `. Conclude with the priority recommendation for reducing unmonitored node exposure.`;
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j    = await r.json();
    const text = j.response || j.reply || j.message || j.answer || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function GraphCentralityOpsEvents() {
  const [open,       setOpen]       = useState(false);
  const [nodes,      setNodes]      = useState([]);
  const [events,     setEvents]     = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState({});
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [assessed,   setAssessed]   = useState("");
  const [assessing,  setAssessing]  = useState(false);

  const timerRef = useRef(null);
  const speakRef = useRef(null);

  function speak(text) {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 300) }),
    })
      .then(r => r.arrayBuffer())
      .then(buf => {
        const ctx = new AudioContext();
        ctx.decodeAudioData(buf, decoded => {
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination);
          src.start();
        });
      })
      .catch(() => {});
  }
  speakRef.current = speak;

  function sevColor(s) {
    const st = (s || "").toLowerCase();
    if (st === "critical") return RED;
    if (st === "warning")  return AMB;
    if (st === "info")     return CY;
    return "#566878";
  }

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [nr, er] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdrs }),
        fetch(`${base}/v1/ops/events`,       { headers: hdrs }),
      ]);
      const nd = nr.ok ? await nr.json() : {};
      const ed = er.ok ? await er.json() : {};

      const rawNodes = normArr(nd).slice(0, 40).map(n => ({
        id:         n.id || n.node_id || String(Math.random()),
        label:      n.label || n.name || n.id || "Unknown",
        type:       n.type || n.entity_type || "",
        centrality: Number(n.centrality || n.score || 0),
      }));

      const rawEvents = normArr(ed).map(e => ({
        id:          e.id || e.event_id || String(Math.random()),
        type:        e.type || e.event_type || "",
        resource:    e.resource || e.target || "",
        description: e.description || e.message || "",
        service:     e.service || "",
        severity:    e.severity || e.level || "info",
        ts:          e.timestamp || e.created_at || e.ts || "",
      }));

      const result = rawNodes.map(node => {
        const nText = [node.id, node.label, node.type].join(" ");
        const matches = rawEvents
          .map(ev => {
            const eText = [ev.type, ev.resource, ev.description, ev.service].join(" ");
            const sc    = scoreMatch(nText, eText);
            return sc > 0 ? { ...ev, score: sc } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);
        return { ...node, monitored: matches.length > 0, matches };
      });

      setNodes(rawNodes);
      setEvents(rawEvents);
      setCorrelated(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:gcoe-toggle", handler);
    return () => window.removeEventListener("jarvis:gcoe-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  function toggle(id) {
    setExpanded(v => ({ ...v, [id]: !v[id] }));
  }

  const unmonitoredCount = correlated.filter(n => !n.monitored).length;

  const visible = correlated
    .filter(n => {
      if (tab === "MONITORED")   return n.monitored;
      if (tab === "UNMONITORED") return !n.monitored;
      return true;
    })
    .filter(n => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        n.label.toLowerCase().includes(s) ||
        n.type.toLowerCase().includes(s) ||
        n.id.toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssessing(true);
    await runAssess(correlated, setAssessed, speakRef.current);
    setAssessing(false);
  }

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: 3420, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "rgba(8,12,22,0.85)",
          border: `1px solid ${open ? CY : "#2a3a4a"}`,
          color: open ? CY : "#566878",
          borderRadius: 6, padding: "3px 9px",
          fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer", letterSpacing: 1,
          transition: "all 0.2s",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ GCOE
        {unmonitoredCount > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: 8,
            padding: "0 5px", fontSize: 8, fontWeight: 700, minWidth: 14,
            textAlign: "center",
          }}>{unmonitoredCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 3420, bottom: 50, zIndex: 69,
          width: 520, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.94)", border: `1px solid ${CY}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${CY}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{
              color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11,
              textShadow: `0 0 10px ${CY}`,
            }}>◈ GRAPH CENTRALITY × OPS EVENTS</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: AMB, fontSize: 9, animation: "gcoepulse 1s infinite" }}>
                  syncing…
                </span>
              )}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
                color: CY, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}22` }}>
            {[
              ["NODES",       nodes.length,                                CY],
              ["OPS EVENTS",  events.length,                               PRP],
              ["MONITORED",   correlated.filter(n => n.monitored).length,  GRN],
              ["UNMONITORED", unmonitoredCount,                            RED],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, padding: "7px 4px", textAlign: "center",
                borderRight: `1px solid ${CY}18`,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{
            padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "MONITORED", "UNMONITORED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 4,
                border: `1px solid ${tab === t ? CY : "#2a3a4a"}`,
                background: tab === t ? `${CY}22` : "transparent",
                color: tab === t ? CY : "#566878",
                cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              type="text" placeholder="search nodes…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 80, background: `${CY}0A`, border: `1px solid ${CY}33`,
                borderRadius: 4, color: "#DCEBF5", fontSize: 9,
                padding: "3px 7px", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {err && <div style={{ color: RED, fontSize: 11, padding: 8 }}>⚠ {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 10 }}>No results.</div>
            )}

            {visible.map(node => {
              const col   = node.monitored ? GRN : RED;
              const isExp = expanded[node.id];
              return (
                <div key={node.id} style={{
                  marginBottom: 10,
                  background: `${col}08`,
                  border: `1px solid ${col}33`,
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div
                    onClick={() => toggle(node.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{node.monitored ? "MONITORED" : "UNMONITORED"}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{node.label}</span>
                    {node.type && (
                      <span style={{
                        fontSize: 8, color: PRP, border: "1px solid #B485FF44",
                        borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                      }}>{node.type.toUpperCase()}</span>
                    )}
                    <span style={{ color: CY, fontSize: 9, flexShrink: 0 }}>
                      {node.centrality.toFixed(3)}
                    </span>
                    <span style={{ color: col, fontSize: 10, flexShrink: 0 }}>
                      {node.matches.length} evt{node.matches.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {node.matches.length === 0 ? (
                        <div style={{ color: "#566878", fontSize: 10, fontStyle: "italic" }}>
                          No correlated ops events — this node has no operational visibility.
                        </div>
                      ) : node.matches.map(ev => (
                        <div key={ev.id} style={{
                          marginTop: 6, padding: "7px 10px",
                          background: `${CY}0A`, border: `1px solid ${CY}22`,
                          borderRadius: 6,
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
                          }}>
                            <span style={{
                              fontSize: 8, color: sevColor(ev.severity),
                              border: `1px solid ${sevColor(ev.severity)}44`,
                              borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                            }}>{(ev.severity || "INFO").toUpperCase()}</span>
                            {ev.type && (
                              <span style={{
                                fontSize: 8, color: PRP, border: "1px solid #B485FF44",
                                borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                              }}>{ev.type.toUpperCase()}</span>
                            )}
                            <span style={{
                              flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{ev.resource || ev.description || ev.id}</span>
                            <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                              {(ev.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          {ev.description && (
                            <div style={{ color: "#8BAABF", fontSize: 9, marginBottom: 4 }}>
                              {ev.description.slice(0, 140)}
                            </div>
                          )}
                          <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                            <div style={{
                              height: 3, borderRadius: 2,
                              width: `${Math.min(100, ev.score * 100)}%`,
                              background: GRN, boxShadow: `0 0 6px ${GRN}`,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /v1/graph/centrality + /v1/ops/events
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${nodes.length} nodes · ${events.length} events`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes gcoepulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
