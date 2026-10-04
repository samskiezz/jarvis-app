/**
 * LiveIntelGraphConvergence — F93 (LGICVG)
 *
 * Cross-references live world events from /functions/getLiveIntel
 * (quakes / crypto / FX) against top-centrality graph nodes from
 * /v1/graph/centrality, surfacing which network hubs are ACTIVATED
 * by current real-world signals versus DORMANT (no live signal aligns).
 *
 * Classification:
 *   ACTIVATED — ≥1 live event keyword-matches the node
 *   DORMANT   — 0 live events align
 *
 * Stat tiles: EVENTS | NODES | ACTIVATED | DORMANT
 * Filter tabs: ALL / ACTIVATED / DORMANT
 * Expand row → matched events with relevance score bar + type badge
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat (2-sentence assessment) + TTS
 * ◈ LGICVG button at left:972520, bottom:8, zIndex:117
 * 60-s auto-refresh
 *
 * Exports: isLgicvgQuery, buildLgicvgScript (wired in JarvisBrain.jsx)
 * Event: jarvis:lgicvg-toggle
 *
 * Voice: "lgicvg" / "live intel graph" / "world graph" / "activated nodes" /
 *        "live centrality" / "real world network" / "intel graph convergence" /
 *        "live graph" / "world node" / "network signal"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#FFB347";
const RED    = "#FF3D5A";
const PURPLE = "#B97AFF";

const BTN_LEFT   = 972520;
const REFRESH_MS = 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── keyword extraction from live intel events ────────────────────────────────

function eventKeywords(ev) {
  const words = [];
  if (ev.place)       words.push(...ev.place.toLowerCase().split(/[\s,/()-]+/));
  if (ev.title)       words.push(...ev.title.toLowerCase().split(/[\s,/()-]+/));
  if (ev.symbol)      words.push(ev.symbol.toLowerCase());
  if (ev.currency)    words.push(ev.currency.toLowerCase());
  if (ev.pair)        words.push(...ev.pair.toLowerCase().split(/[/\s]+/));
  if (ev.name)        words.push(...ev.name.toLowerCase().split(/[\s,/()-]+/));
  return words.filter((w) => w.length > 2);
}

// ── keyword extraction from graph centrality nodes ───────────────────────────

function nodeKeywords(node) {
  const words = [];
  if (node.id)    words.push(...String(node.id).toLowerCase().split(/[\s_/.-]+/));
  if (node.label) words.push(...String(node.label).toLowerCase().split(/[\s_/.-]+/));
  if (node.type)  words.push(...String(node.type).toLowerCase().split(/[\s_/.-]+/));
  if (node.name)  words.push(...String(node.name).toLowerCase().split(/[\s_/.-]+/));
  return words.filter((w) => w.length > 2);
}

// ── relevance scoring (0–100) ────────────────────────────────────────────────

function scoreMatch(nodeKws, evKws) {
  if (!nodeKws.length || !evKws.length) return 0;
  const nodeSet = new Set(nodeKws);
  const hits = evKws.filter((w) => nodeSet.has(w)).length;
  return Math.min(100, Math.round((hits / Math.max(nodeKws.length, evKws.length)) * 200));
}

// ── event type label ─────────────────────────────────────────────────────────

function eventType(ev) {
  if (ev.mag !== undefined || ev.magnitude !== undefined) return "SEISMIC";
  if (ev.symbol !== undefined || ev.pair !== undefined)   return "FX";
  if (ev.price !== undefined || ev.change !== undefined)  return "CRYPTO";
  return "INTEL";
}

function typeColor(t) {
  if (t === "SEISMIC") return RED;
  if (t === "FX")      return GREEN;
  if (t === "CRYPTO")  return AMBER;
  return PURPLE;
}

// ── correlation engine ────────────────────────────────────────────────────────

function correlate(events, nodes) {
  return nodes.map((node) => {
    const nkws = nodeKeywords(node);
    const matches = [];
    for (const ev of events) {
      const ekws = eventKeywords(ev);
      const score = scoreMatch(nkws, ekws);
      if (score > 0) {
        matches.push({ ev, score, type: eventType(ev) });
      }
    }
    matches.sort((a, b) => b.score - a.score);
    return {
      node,
      matches,
      status: matches.length > 0 ? "ACTIVATED" : "DORMANT",
    };
  });
}

// ── exported query helpers ────────────────────────────────────────────────────

export function isLgicvgQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("lgicvg") ||
    s.includes("live intel graph") ||
    s.includes("world graph") ||
    s.includes("activated nodes") ||
    s.includes("live centrality") ||
    s.includes("real world network") ||
    s.includes("intel graph convergence") ||
    s.includes("live graph") ||
    s.includes("world node") ||
    s.includes("network signal")
  );
}

export async function buildLgicvgScript() {
  try {
    const [intelRes, centRes] = await Promise.all([
      fetch(`${apiBase()}/functions/getLiveIntel`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/graph/centrality`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const intelData = intelRes.ok ? await intelRes.json() : {};
    const centData  = centRes.ok  ? await centRes.json()  : {};

    const rawEvents = [
      ...(intelData.earthquakes    || intelData.quakes || []),
      ...(intelData.crypto         || []),
      ...(intelData.fx             || intelData.forex  || []),
    ];
    const rawNodes = Array.isArray(centData)
      ? centData
      : (centData.nodes || centData.centrality || centData.results || []);

    const correlated = correlate(rawEvents, rawNodes.slice(0, 30));
    const activated  = correlated.filter((r) => r.status === "ACTIVATED").length;
    const dormant    = correlated.filter((r) => r.status === "DORMANT").length;

    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Live intel graph convergence: ${rawEvents.length} world events cross-referenced against ${rawNodes.length} graph centrality nodes. ${activated} nodes ACTIVATED by live signals, ${dormant} DORMANT. Assess in two sentences — which node types or domains are most activated and what does that imply?`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Convergence assessed.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Unable to assess live intel graph convergence at this time.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LiveIntelGraphConvergence() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [nodes, setNodes]         = useState([]);
  const [correlated, setCorr]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssess]    = useState(false);
  const [assessment, setAsmTxt]   = useState("");
  const timer = useRef(null);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:lgicvg-toggle", handler);
    return () => window.removeEventListener("jarvis:lgicvg-toggle", handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intelRes, centRes] = await Promise.all([
        fetch(`${apiBase()}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/graph/centrality`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      if (!intelRes.ok) throw new Error(`getLiveIntel ${intelRes.status}`);
      if (!centRes.ok)  throw new Error(`graph/centrality ${centRes.status}`);

      const intelData = await intelRes.json();
      const centData  = await centRes.json();

      const rawEvents = [
        ...(intelData.earthquakes    || intelData.quakes || []),
        ...(intelData.crypto         || []),
        ...(intelData.fx             || intelData.forex  || []),
      ];
      const rawNodes = Array.isArray(centData)
        ? centData
        : (centData.nodes || centData.centrality || centData.results || []);

      setEvents(rawEvents);
      setNodes(rawNodes);
      setCorr(correlate(rawEvents, rawNodes.slice(0, 50)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setAsmTxt("");
    const txt = await buildLgicvgScript();
    setAsmTxt(txt);
    setAssess(false);
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch { /* TTS optional */ }
  }, []);

  // derived
  const activated = correlated.filter((r) => r.status === "ACTIVATED").length;
  const dormant   = correlated.filter((r) => r.status === "DORMANT").length;

  const filtered = correlated.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      const n = r.node;
      return (
        String(n.id    || "").toLowerCase().includes(s) ||
        String(n.label || "").toLowerCase().includes(s) ||
        String(n.type  || "").toLowerCase().includes(s) ||
        String(n.name  || "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <>
      {/* toggle button — always visible */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 117,
          background: "transparent", border: `1px solid ${open ? CY : "#333"}`,
          color: open ? CY : "#555", fontFamily: "monospace", fontSize: 9,
          padding: "2px 6px", cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
        }}
        title="Live Intel × Graph Centrality Convergence (LGICVG) — F93"
      >
        ◈ LGICVG
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 580), zIndex: 9117,
          width: 640, maxHeight: "78vh", display: "flex", flexDirection: "column",
          background: "#0d0d0d", border: `1px solid ${CY}44`,
          borderRadius: 6, padding: 16, fontFamily: "monospace",
          boxShadow: `0 0 24px ${CY}22`,
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexShrink: 0 }}>
            <div style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
              ◈ LIVE INTEL × GRAPH CONVERGENCE — LGICVG
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={assess} disabled={assessing} style={btnStyle(GREEN)}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} disabled={loading} style={btnStyle(CY)}>
                {loading ? "…" : "⟳"}
              </button>
              <button onClick={() => setOpen(false)} style={btnStyle(RED)}>✕</button>
            </div>
          </div>

          {error && (
            <div style={{ color: RED, fontSize: 10, marginBottom: 8, flexShrink: 0 }}>⚠ {error}</div>
          )}

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", flexShrink: 0 }}>
            {[
              { label: "EVENTS",    val: events.length,    col: PURPLE },
              { label: "NODES",     val: nodes.length,     col: CY },
              { label: "ACTIVATED", val: activated,         col: GREEN },
              { label: "DORMANT",   val: dormant,           col: "#555" },
            ].map((t) => (
              <div key={t.label} style={{
                background: "#111", border: `1px solid ${t.col}33`, borderRadius: 4,
                padding: "6px 12px", minWidth: 90, textAlign: "center",
              }}>
                <div style={{ fontSize: 18, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter + search */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
            {["ALL", "ACTIVATED", "DORMANT"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : "#333"}`,
                  color: filter === f ? CY : "#666",
                  fontFamily: "monospace", fontSize: 9, padding: "2px 8px",
                  cursor: "pointer", borderRadius: 2,
                }}
              >
                {f}
                {f === "ACTIVATED" && activated > 0 && (
                  <span style={{ color: GREEN, marginLeft: 4, fontWeight: 700 }}>{activated}</span>
                )}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search nodes…"
              style={{
                background: "#111", border: "1px solid #333", color: "#ccc",
                fontFamily: "monospace", fontSize: 9, padding: "2px 8px",
                borderRadius: 2, flex: 1, minWidth: 120, outline: "none",
              }}
            />
          </div>

          {/* node list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#444", fontSize: 10, padding: "12px 0", textAlign: "center" }}>
                No nodes match filter.
              </div>
            )}
            {filtered.map((row, i) => {
              const n = row.node;
              const label = n.label || n.name || n.id || `node-${i}`;
              const type  = n.type || "ENTITY";
              const score = typeof n.centrality_score === "number"
                ? n.centrality_score
                : (typeof n.score === "number" ? n.score : null);
              const isExp = expanded === i;
              const activated_row = row.status === "ACTIVATED";

              return (
                <div
                  key={i}
                  style={{
                    marginBottom: 6,
                    border: `1px solid ${activated_row ? GREEN + "44" : "#222"}`,
                    borderRadius: 4,
                    background: activated_row ? `${GREEN}06` : "#111",
                    animation: activated_row ? "pulse-green 2.4s infinite" : undefined,
                  }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 10px", cursor: "pointer",
                    }}
                  >
                    {/* status chip */}
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 2,
                      border: `1px solid ${activated_row ? GREEN : "#333"}`,
                      color: activated_row ? GREEN : "#444",
                      background: activated_row ? `${GREEN}11` : "transparent",
                      flexShrink: 0,
                    }}>
                      {activated_row ? "● ACTIVATED" : "○ DORMANT"}
                    </span>

                    {/* node label */}
                    <span style={{ color: activated_row ? "#ddd" : "#666", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {label}
                    </span>

                    {/* type badge */}
                    <span style={{ fontSize: 8, color: "#555", flexShrink: 0 }}>{type}</span>

                    {/* centrality score */}
                    {score !== null && (
                      <span style={{ fontSize: 8, color: CY, flexShrink: 0 }}>
                        ⬡{score.toFixed ? score.toFixed(3) : score}
                      </span>
                    )}

                    {/* match count */}
                    {activated_row && (
                      <span style={{ fontSize: 8, color: GREEN, fontWeight: 700, flexShrink: 0 }}>
                        {row.matches.length} evt{row.matches.length !== 1 ? "s" : ""}
                      </span>
                    )}

                    <span style={{ fontSize: 9, color: "#444", flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* expanded: matched events */}
                  {isExp && (
                    <div style={{ padding: "4px 10px 8px", borderTop: "1px solid #1a1a1a" }}>
                      {row.matches.length === 0 ? (
                        <div style={{ color: "#444", fontSize: 9 }}>No live events match this node.</div>
                      ) : (
                        row.matches.slice(0, 8).map((m, j) => {
                          const evLabel = m.ev.place || m.ev.title || m.ev.symbol || m.ev.pair || m.ev.name || "event";
                          const tc = typeColor(m.type);
                          return (
                            <div key={j} style={{ marginBottom: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{
                                  fontSize: 8, padding: "1px 4px", borderRadius: 2,
                                  border: `1px solid ${tc}`, color: tc, flexShrink: 0,
                                }}>
                                  {m.type}
                                </span>
                                <span style={{ fontSize: 9, color: "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {evLabel}
                                </span>
                                <span style={{ fontSize: 8, color: tc, marginLeft: "auto", flexShrink: 0, fontWeight: 700 }}>
                                  {m.score}
                                </span>
                              </div>
                              <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2 }}>
                                <div style={{
                                  height: "100%", width: `${m.score}%`,
                                  background: tc, borderRadius: 2,
                                  transition: "width 0.4s ease",
                                }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ fontSize: 9, color: "#444", marginTop: 8, flexShrink: 0 }}>
            {filtered.length} / {correlated.length} nodes · 60-s auto-refresh · /functions/getLiveIntel × /v1/graph/centrality
          </div>

          {assessment && (
            <div style={{
              background: "#111", border: `1px solid ${GREEN}33`, borderRadius: 4,
              padding: "8px 10px", fontSize: 11, color: "#ccc", marginTop: 6, flexShrink: 0,
            }}>
              {assessment}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 ${GREEN}00; }
          50%       { box-shadow: 0 0 6px 1px ${GREEN}44; }
        }
      `}</style>
    </>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", border: `1px solid ${col}`, color: col,
    fontFamily: "monospace", fontSize: 10, padding: "3px 8px",
    cursor: "pointer", borderRadius: 3,
  };
}
