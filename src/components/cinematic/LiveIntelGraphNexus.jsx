/**
 * F128 — Live Intel × Graph Centrality Nexus (LIGNC)
 *
 * Parallel-fetches /functions/getLiveIntel and /v1/graph/centrality every 60 s.
 * Keyword-correlates each top-centrality graph node (id, label, type) against
 * live world events (seismic/crypto/FX) to classify:
 *
 *  ACTIVE  — node keywords match at least one live world event
 *  DORMANT — no live event overlap found
 *
 * Stat tiles: nodes / live events / active / dormant
 * Amber badge on active count.
 * Filter tabs: ALL / ACTIVE / DORMANT + text search.
 * Expand node row → matched events with SEISMIC/CRYPTO/FX type badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LIGNC  at left:4380 bottom:18, zIndex:68.
 * Event:   jarvis:lignc-toggle
 * Voice:   "live intel graph / graph live intel / lignc / active nodes / live world graph /
 *           which nodes are live / live centrality / world events graph / live node exposure /
 *           graph world events / central node events"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4380;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const EVENT_TYPE_COLORS = { SEISMIC: RED, CRYPTO: PURP, FX: AMBER };

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseLiveEvents(raw) {
  const events = [];
  if (!raw || typeof raw !== "object") return events;

  const quakes = raw.earthquakes ?? raw.seismic ?? raw.quakes ?? [];
  normaliseArray(quakes).forEach((q, i) => {
    events.push({
      id:    `seismic-${i}`,
      type:  "SEISMIC",
      label: q.place ?? q.location ?? q.region ?? `M${q.magnitude ?? "?"} quake`,
      mag:   q.magnitude ?? q.mag ?? null,
      extra: q.place ?? q.region ?? "",
    });
  });

  const crypto = raw.crypto ?? raw.cryptocurrency ?? raw.coins ?? [];
  normaliseArray(crypto).forEach((c, i) => {
    events.push({
      id:    `crypto-${i}`,
      type:  "CRYPTO",
      label: c.symbol ?? c.name ?? c.coin ?? `Coin ${i + 1}`,
      extra: `${c.change_pct != null ? (c.change_pct >= 0 ? "+" : "") + c.change_pct.toFixed(2) + "%" : ""}`,
    });
  });

  const fx = raw.fx ?? raw.forex ?? raw.currencies ?? [];
  normaliseArray(fx).forEach((f, i) => {
    events.push({
      id:    `fx-${i}`,
      type:  "FX",
      label: f.pair ?? f.symbol ?? f.currency ?? `Pair ${i + 1}`,
      extra: `${f.change_pct != null ? (f.change_pct >= 0 ? "+" : "") + f.change_pct.toFixed(2) + "%" : ""}`,
    });
  });

  return events;
}

function normaliseNodes(raw) {
  return normaliseArray(raw).map((n, i) => ({
    id:         String(n.id ?? n.node_id ?? i),
    label:      n.label ?? n.name ?? n.id ?? `Node ${i + 1}`,
    type:       n.type ?? n.node_type ?? "entity",
    centrality: Number(n.centrality ?? n.score ?? n.degree ?? n.pagerank ?? 0),
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(node, events) {
  const nodeTokens = new Set([
    ...tokenise(node.id),
    ...tokenise(node.label),
    ...tokenise(node.type),
  ]);
  const matches = [];
  for (const ev of events) {
    const evTokens = tokenise(`${ev.label} ${ev.extra} ${ev.type}`);
    const hits = evTokens.filter(t => nodeTokens.has(t)).length;
    if (hits > 0) matches.push({ ...ev, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [liRes, cRes] = await Promise.all([
    fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
    fetch(`${base}/v1/graph/centrality`,   { headers: hdr }),
  ]);
  const liveEvents = normaliseLiveEvents(await liRes.json());
  const nodes      = normaliseNodes(await cRes.json());
  const enriched   = nodes.map(n => {
    const matches = correlate(n, liveEvents);
    return { ...n, matches, classification: matches.length > 0 ? "ACTIVE" : "DORMANT" };
  });
  return { nodes: enriched, events: liveEvents };
}

// ─── exported intent helpers (JarvisBrain) ────────────────────────────────────

export function isLigncQuery(q) {
  return /live.?intel.?graph|graph.?live.?intel|lignc|active.?node|live.?world.?graph|which.?node.*live|live.?centralit|world.?event.*graph|live.?node.?exposure|graph.?world.?event|central.?node.?event/i.test(q);
}

export async function buildLigncScript() {
  try {
    const { nodes, events } = await fetchAll();
    const active   = nodes.filter(n => n.classification === "ACTIVE");
    const topNode  = active[0];
    const prompt   = `JARVIS live intel × graph centrality nexus: ${nodes.length} top-centrality graph nodes cross-referenced against ${events.length} live world events (seismic/crypto/FX). ${active.length} nodes classified ACTIVE — their identifiers or types match live world event keywords.${topNode ? ` Top-matched node: "${topNode.label}" (type: ${topNode.type}, centrality: ${topNode.centrality.toFixed(4)}) correlated with ${topNode.matches.length} live event(s) including "${topNode.matches[0]?.label}" (${topNode.matches[0]?.type}).` : ""} Summarise the live-world exposure of the graph in exactly 2 sentences and recommend the highest-priority monitoring action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${active.length}/${nodes.length} central graph nodes have live world event exposure across ${events.length} tracked events.`;
  } catch {
    return "Live intel graph nexus data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "lignc-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Node Row ─────────────────────────────────────────────────────────────────

function NodeRow({ node }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...node.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${node.classification === "ACTIVE" ? AMBER : MUTED}22`,
      background: node.classification === "ACTIVE"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: node.classification === "ACTIVE" ? AMBER : GREEN,
          border: `1px solid ${node.classification === "ACTIVE" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 46, textAlign: "center",
        }}>
          {node.classification === "ACTIVE" ? "ACTIVE" : "DORMNT"}
        </span>

        <span style={{
          fontSize: 7, color: MUTED,
          border: `1px solid ${MUTED}44`,
          padding: "1px 4px", borderRadius: 2, flexShrink: 0,
          width: 36, textAlign: "center", textTransform: "uppercase",
        }}>
          {node.type.slice(0, 5)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {node.label}
          </div>
          <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
            centrality: {node.centrality.toFixed(4)}
          </div>
        </div>

        {node.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {node.matches.length} event{node.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {node.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No correlated live events found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED LIVE EVENTS (max 6)
              </div>
              {node.matches.slice(0, 6).map((ev, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 7, fontWeight: 700,
                      color: EVENT_TYPE_COLORS[ev.type] ?? MUTED,
                      border: `1px solid ${EVENT_TYPE_COLORS[ev.type] ?? MUTED}66`,
                      padding: "1px 4px", borderRadius: 2, flexShrink: 0,
                    }}>
                      {ev.type}
                    </span>
                    <span style={{ fontSize: 8, color: CY, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.label}
                    </span>
                    {ev.extra && (
                      <span style={{ fontSize: 7, color: AMBER, flexShrink: 0 }}>{ev.extra}</span>
                    )}
                    <span style={{ fontSize: 7, color: MUTED, flexShrink: 0 }}>score: {ev.score}</span>
                  </div>
                  <div style={{ height: 3, background: `${MUTED}22`, borderRadius: 2 }}>
                    <div style={{
                      height: 3, borderRadius: 2,
                      width: `${Math.round((ev.score / maxScore) * 100)}%`,
                      background: EVENT_TYPE_COLORS[ev.type] ?? AMBER,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveIntelGraphNexus() {
  const [open,     setOpen]     = useState(false);
  const [nodes,    setNodes]    = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [assessing, setAssessing] = useState(false);

  const timerRef  = useRef(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await fetchAll();
      if (!mountedRef.current) return;
      setNodes(data.nodes);
      setEvents(data.events);
    } catch (e) {
      if (mountedRef.current) setErr(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:lignc-toggle", handler);
    return () => window.removeEventListener("jarvis:lignc-toggle", handler);
  }, []);

  const active  = nodes.filter(n => n.classification === "ACTIVE");
  const dormant = nodes.filter(n => n.classification === "DORMANT");

  const displayed = nodes
    .filter(n => filter === "ALL" || n.classification === filter)
    .filter(n => !search || n.label.toLowerCase().includes(search.toLowerCase()) || n.type.toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    setAssessing(true);
    const script = await buildLigncScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <>
        <style>{`@keyframes lignc-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Live Intel × Graph Centrality Nexus (LIGNC)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.9)", border: `1px solid ${active.length > 0 ? AMBER : CY}66`,
            color: active.length > 0 ? AMBER : CY, borderRadius: 4, cursor: "pointer",
            fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: 1,
            padding: "4px 8px", display: "flex", alignItems: "center", gap: 5,
          }}
        >
          ◈ LIGNC
          {active.length > 0 && (
            <span style={{
              background: AMBER, color: "#000", borderRadius: 3,
              fontSize: 7, fontWeight: 900, padding: "1px 4px",
            }}>
              {active.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes lignc-pulse { 0%,100%{opacity:.6} 50%{opacity:1} }`}</style>
      <div style={{
        position: "fixed", left: BTN_LEFT - 360, bottom: 50, zIndex: 200,
        width: 380, maxHeight: 520, display: "flex", flexDirection: "column",
        background: BG, border: `1px solid ${CY}33`, borderRadius: 6,
        fontFamily: MONO, color: CY, boxShadow: `0 0 32px ${CY}18`,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
          background: "rgba(41,231,255,0.04)",
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 2, color: CY }}>
            ◈ LIVE INTEL × GRAPH CENTRALITY NEXUS
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={assess}
              disabled={assessing || nodes.length === 0}
              style={{
                background: "none", border: `1px solid ${CY}44`, color: CY,
                borderRadius: 3, fontSize: 7, cursor: "pointer", padding: "2px 7px",
                opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stat Tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${CY}11` }}>
          <StatTile label="NODES"       value={nodes.length}   accent={CY} />
          <StatTile label="LIVE EVENTS" value={events.length}  accent={MUTED} />
          <StatTile label="ACTIVE"      value={active.length}  accent={AMBER} pulse={active.length > 0} />
          <StatTile label="DORMANT"     value={dormant.length} accent={GREEN} />
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${CY}11` }}>
          {["ALL", "ACTIVE", "DORMANT"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? `${CY}18` : "none",
                border: `1px solid ${filter === f ? CY : MUTED}44`,
                color: filter === f ? CY : MUTED,
                borderRadius: 3, fontSize: 7, cursor: "pointer", padding: "2px 8px",
              }}
            >
              {f}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.04)",
              border: `1px solid ${CY}22`, borderRadius: 3,
              color: CY, fontSize: 7, padding: "2px 6px",
              outline: "none", fontFamily: MONO,
            }}
          />
        </div>

        {/* Node List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {loading && nodes.length === 0 && (
            <div style={{ fontSize: 8, color: MUTED, textAlign: "center", padding: 16 }}>
              loading live intel + graph centrality…
            </div>
          )}
          {err && (
            <div style={{ fontSize: 8, color: RED, padding: 8 }}>
              error: {err}
            </div>
          )}
          {!loading && !err && displayed.length === 0 && (
            <div style={{ fontSize: 8, color: MUTED, textAlign: "center", padding: 16 }}>
              no nodes match current filter
            </div>
          )}
          {displayed.map(n => <NodeRow key={n.id} node={n} />)}
        </div>

        {/* Footer */}
        <div style={{
          padding: "5px 12px", borderTop: `1px solid ${CY}11`,
          fontSize: 7, color: MUTED, display: "flex", justifyContent: "space-between",
        }}>
          <span>auto-refresh 60 s · {active.length} active / {nodes.length} total nodes</span>
          {loading && <span style={{ color: CY }}>refreshing…</span>}
        </div>
      </div>
    </>
  );
}
