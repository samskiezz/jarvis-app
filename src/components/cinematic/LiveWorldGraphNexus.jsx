/**
 * LiveWorldGraphNexus — F615
 * "JARVIS, live world graph / lwgrph / world graph / world signaled nodes / graph world event / live world nodes"
 * Cross-references /functions/getLiveIntel + /v1/graph/centrality.
 * Finds WORLD-SIGNALED top graph nodes (≥1 live event keyword-matches) vs DARK (no live world backing).
 * Coverage % tile; ALL/WORLD-SIGNALED/DARK filter tabs + search; click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence graph-intelligence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 94_200;
const Z_INDEX  = 168;

const LWGRPH_RE =
  /\blwgrph\b|\blive.?world.?graph\b|\bworld.?graph\b|\bworld.?signal\w*.?node\b|\bgraph.?world.?event\b|\blive.?world.?node\b|\breal.?world.?graph\b|\bglobal.?graph\b|\bworld.?node\b|\bgraph.?live.?intel\b/i;

export function isLwgrphQuery(text) {
  return LWGRPH_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}. ${q.type || ""}`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_pct ?? c.change ?? c.pct_change ?? null;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: `${sym} ${chg !== null ? (chg >= 0 ? `+${chg.toFixed(2)}%` : `${chg.toFixed(2)}%`) : ""}`.trim(),
      description: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD.${chg !== null ? ` Change: ${chg.toFixed(2)}%` : ""}`,
      tags: `crypto ${sym} ${sym.toLowerCase()} digital asset market currency finance`.trim(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.currencies) ? data.currencies : [];
  fx.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? null;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: `${pair} ${rate !== null ? `@ ${rate}` : ""}`.trim(),
      description: `FX pair ${pair}. Rate: ${rate ?? "?"}.`,
      tags: `currency forex fx ${pair} ${pair.toLowerCase()} monetary exchange finance`.trim(),
    });
  });

  return all;
}

function normaliseNodes(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.centrality)       ? raw.centrality
    : [];
  return arr.map((n, i) => ({
    id:          n.id          || n.node_id   || String(i),
    label:       n.label       || n.name      || n.entity || `Node ${i + 1}`,
    score:       n.score       ?? n.centrality_score ?? n.weight ?? 0,
    kind:        (n.kind       || n.type      || n.entity_type || "NODE").toString().toUpperCase(),
    description: (n.description || n.summary  || "").toString().slice(0, 300),
    tags:        Array.isArray(n.tags) ? n.tags.join(" ") : (n.tags || ""),
  }));
}

function crossRef(nodes, events) {
  return nodes.map((node) => {
    const haystack = `${node.label} ${node.description} ${node.tags} ${node.kind}`;
    const matches = events
      .map((ev) => ({
        ev,
        hits: overlap(haystack, `${ev.name} ${ev.description} ${ev.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...node,
      signaled: matches.length > 0,
      matches: matches.map(({ ev, hits }) => ({ ...ev, hits })),
    };
  });
}

// ─── buildLwgrphScript (for JarvisBrain) ─────────────────────────────────────

export async function buildLwgrphScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [liveRes, nodeRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`,  { headers: hdr }),
      fetch(`${base}/v1/graph/centrality`,     { headers: hdr }),
    ]);
    const liveData = liveRes.ok ? await liveRes.json() : {};
    const nodeData = nodeRes.ok ? await nodeRes.json() : {};

    const events  = normaliseLiveEvents(liveData);
    const nodes   = normaliseNodes(nodeData);
    const crossed = crossRef(nodes, events);

    const total    = crossed.length;
    const signaled = crossed.filter((n) => n.signaled).length;
    const dark     = total - signaled;
    const coverage = total > 0 ? Math.round((signaled / total) * 100) : 0;
    const topSignaled = crossed
      .filter((n) => n.signaled)
      .slice(0, 2)
      .map((n) => n.label)
      .join(", ");

    const brief =
      `${coverage}% of ${total} top graph nodes have live world signal correlation. ` +
      `${signaled} WORLD-SIGNALED, ${dark} DARK.` +
      (topSignaled ? ` Top signaled nodes: ${topSignaled}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Live World × Graph Node Nexus: ${brief} Provide a 2-sentence graph-intelligence assessment of which key network nodes are currently activated by live world events.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Live World × Graph Node Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: GRN, FX: CY };

export default function LiveWorldGraphNexus() {
  const [open, setOpen]         = useState(false);
  const [nodes, setNodes]       = useState([]);
  const [events, setEvents]     = useState([]);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [liveRes, nodeRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/v1/graph/centrality`,    { headers: hdr }),
      ]);
      const liveData = liveRes.ok ? await liveRes.json() : {};
      const nodeData = nodeRes.ok ? await nodeRes.json() : {};
      const ev = normaliseLiveEvents(liveData);
      const nd = normaliseNodes(nodeData);
      setEvents(ev);
      setNodes(nd);
      setCrossed(crossRef(nd, ev));
    } catch (_) {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => !o); load(); };
    window.addEventListener("jarvis:lwgrph-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lwgrph-toggle", onToggle);
  }, [load]);

  const assess = useCallback(async () => {
    setAssess(true);
    try {
      const result = await buildLwgrphScript();
      setBrief(result);
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.slice(0, 400) }),
      });
    } catch (_) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssess(false);
    }
  }, []);

  const signaled = crossed.filter((n) => n.signaled).length;
  const dark     = crossed.length - signaled;
  const coverage = crossed.length > 0 ? Math.round((signaled / crossed.length) * 100) : 0;

  const visible = crossed.filter((n) => {
    if (tab === "WORLD-SIGNALED" && !n.signaled) return false;
    if (tab === "DARK"           &&  n.signaled) return false;
    if (query) {
      const q = query.toLowerCase();
      return n.label.toLowerCase().includes(q) || n.kind.toLowerCase().includes(q);
    }
    return true;
  });

  const panelStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 50,
    width: 340,
    maxHeight: 520,
    background: "rgba(0,8,20,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 6,
    zIndex: Z_INDEX,
    display: "flex",
    flexDirection: "column",
    fontFamily: "monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Dock button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: signaled > 0 ? "rgba(41,231,255,0.12)" : "rgba(0,8,20,0.85)",
          border: `1px solid ${signaled > 0 ? CY : DIM}55`,
          borderRadius: 4,
          color: signaled > 0 ? CY : DIM,
          fontSize: 9,
          padding: "3px 6px",
          cursor: "pointer",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ LWGRPH{signaled > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMB,
            color: "#000",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: 8,
          }}>{signaled}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: "8px 10px 6px",
            borderBottom: `1px solid ${CY}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>
              ◈ LIVE WORLD × GRAPH NODE
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}44`,
                borderRadius: 3,
                color: CY,
                fontSize: 9,
                padding: "2px 6px",
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 12, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex",
            gap: 6,
            padding: "6px 10px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              { label: "NODES",    val: crossed.length, col: CY },
              { label: "SIGNALED", val: signaled,        col: AMB },
              { label: "DARK",     val: dark,            col: DIM },
              { label: "COVERAGE", val: `${coverage}%`,  col: GRN },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1,
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${col}33`,
                borderRadius: 3,
                padding: "4px 3px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 12, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* AI brief */}
          {brief && (
            <div style={{
              padding: "4px 10px 2px",
              fontSize: 9,
              color: DIM,
              borderBottom: `1px solid ${CY}11`,
              maxHeight: 60,
              overflowY: "auto",
            }}>
              {brief}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "4px 10px" }}>
            {["ALL", "WORLD-SIGNALED", "DARK"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 3,
                  color: tab === t ? CY : DIM,
                  fontSize: 8,
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search nodes…"
            style={{
              margin: "0 10px 4px",
              padding: "3px 6px",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 3,
              color: CY,
              fontSize: 9,
              outline: "none",
              fontFamily: "monospace",
            }}
          />

          {/* Node rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 8px" }}>
            {loading ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No nodes match.</div>
            ) : (
              visible.map((node) => (
                <div key={node.id}>
                  <div
                    onClick={() => setExpanded(expanded === node.id ? null : node.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 6px",
                      marginBottom: 3,
                      cursor: "pointer",
                      borderRadius: 3,
                      background: "rgba(41,231,255,0.04)",
                      border: `1px solid ${node.signaled ? AMB + "44" : DIM + "22"}`,
                    }}
                  >
                    <span style={{
                      fontSize: 8,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: "rgba(41,231,255,0.1)",
                      color: CY,
                      minWidth: 44,
                      textAlign: "center",
                    }}>
                      {node.kind.slice(0, 8)}
                    </span>
                    <span style={{
                      flex: 1,
                      fontSize: 10,
                      color: node.signaled ? AMB : DIM,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {node.label}
                    </span>
                    <span style={{ fontSize: 8, color: DIM }}>
                      {typeof node.score === "number" ? node.score.toFixed(3) : ""}
                    </span>
                    {node.signaled ? (
                      <span style={{ fontSize: 8, color: AMB }}>⬡ {node.matches.length} evt</span>
                    ) : (
                      <span style={{ fontSize: 8, color: DIM }}>DARK</span>
                    )}
                  </div>

                  {/* Expanded matched events */}
                  {expanded === node.id && node.signaled && (
                    <div style={{ marginLeft: 12, marginBottom: 6 }}>
                      {node.description && (
                        <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                          {node.description.slice(0, 120)}
                        </div>
                      )}
                      {node.matches.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            padding: "3px 6px",
                            marginBottom: 2,
                            borderRadius: 2,
                            background: `rgba(255,165,0,0.05)`,
                            border: `1px solid ${AMB}33`,
                            fontSize: 9,
                          }}
                        >
                          <span style={{ color: KIND_COLOR[ev.kind] || CY, fontSize: 8 }}>
                            [{ev.kind}]
                          </span>
                          <span style={{ color: CY, marginLeft: 4 }}>{ev.name}</span>
                          <span style={{ color: DIM, marginLeft: 6 }}>hits:{ev.hits}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {expanded === node.id && !node.signaled && (
                    <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: DIM }}>
                      No live world events correlate with this graph node.
                      {node.description && (
                        <div style={{ marginTop: 2 }}>{node.description.slice(0, 120)}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
