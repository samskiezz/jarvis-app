/**
 * CommonOperatingPicture — F77
 * Left-edge slide-in at 67 % vertical.
 *
 * Polls GET /v1/cop/snapshot every 60 s → fused geo+graph+temporal+metrics.
 * Fetches GET /v1/cop/layers once on open → layer visibility list.
 *
 * Four tabs: GEO | GRAPH | TEMPORAL | METRICS
 * Accent: #06B6D4 (cyan-teal).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 60_000;
const DRAWER_W = 330;
const ACCENT   = "#06B6D4";
const TABS     = ["GEO", "GRAPH", "TEMPORAL", "METRICS"];

function rel(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (isNaN(s)) return "—";
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function str(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

function Badge({ label, color }) {
  const c = color || "#6B7280";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 8,
      color: c, border: `1px solid ${c}55`, borderRadius: 3,
      padding: "1px 4px", letterSpacing: 0.8, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function LayerChip({ layer }) {
  const c = layer.visible ? ACCENT : "#374151";
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 8,
      color: c, border: `1px solid ${c}66`, borderRadius: 3,
      padding: "1px 5px", letterSpacing: 0.8,
    }}>
      {layer.name || layer.id}
    </span>
  );
}

function GeoPane({ geo }) {
  const objs = Array.isArray(geo?.objects) ? geo.objects.slice(0, 20) : [];
  if (objs.length === 0) {
    return (
      <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
        NO GEO OBJECTS
      </div>
    );
  }
  return (
    <div>
      {objs.map((o, i) => (
        <div key={i} style={{
          padding: "6px 14px", borderBottom: `1px solid ${ACCENT}0F`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#E2E8F0", flex: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {o.name || o.label || o.id || `obj-${i}`}
            </span>
            {o.type && <Badge label={o.type} color="#34D399" />}
          </div>
          {(o.lat != null || o.lon != null) && (
            <div style={{ fontSize: 8, color: "#6B7280", marginTop: 2 }}>
              {o.lat?.toFixed(4)}, {o.lon?.toFixed(4)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function GraphPane({ graph }) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes.slice(0, 20) : [];
  if (nodes.length === 0) {
    return (
      <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
        NO GRAPH NODES
      </div>
    );
  }
  return (
    <div>
      {nodes.map((n, i) => (
        <div key={n.id || i} style={{
          padding: "6px 14px", borderBottom: `1px solid ${ACCENT}0F`,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 10, color: "#E2E8F0", flex: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {n.label || n.name || n.id}
          </span>
          {n.type && <Badge label={n.type} color="#A78BFA" />}
        </div>
      ))}
    </div>
  );
}

function TemporalPane({ temporal }) {
  const events = Array.isArray(temporal?.events) ? temporal.events.slice(0, 20) : [];
  if (events.length === 0) {
    return (
      <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
        NO TEMPORAL EVENTS
      </div>
    );
  }
  return (
    <div>
      {events.map((e, i) => (
        <div key={i} style={{
          padding: "6px 14px", borderBottom: `1px solid ${ACCENT}0F`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#E2E8F0", flex: 1,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.title || e.action || e.type || `event-${i}`}
            </span>
            <span style={{ fontSize: 8, color: "#4B5563", flexShrink: 0 }}>
              {rel(e.ts || e.created_at || e.timestamp)}
            </span>
          </div>
          {e.body && (
            <div style={{ fontSize: 8, color: "#6B7280", marginTop: 2,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {String(e.body).slice(0, 80)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MetricsPane({ metrics }) {
  const cards = Array.isArray(metrics?.cards) ? metrics.cards : [];
  if (cards.length === 0) {
    return (
      <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
        NO METRIC CARDS
      </div>
    );
  }
  return (
    <div>
      {cards.map((c, i) => (
        <div key={i} style={{
          padding: "6px 14px", borderBottom: `1px solid ${ACCENT}0F`,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 10, color: "#CBD5E1", flex: 1 }}>
            {c.name}
          </span>
          <span style={{ fontSize: 11, color: ACCENT, fontFamily: S.mono, letterSpacing: 1 }}>
            {str(c.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function CommonOperatingPicture() {
  const [open,   setOpen]   = useState(false);
  const [snap,   setSnap]   = useState(null);
  const [layers, setLayers] = useState([]);
  const [err,    setErr]    = useState(false);
  const [tab,    setTab]    = useState("GEO");
  const [tick,   bump]      = useReducer((n) => n + 1, 0);
  const timer = useRef(null);

  // Snapshot — 60 s poll while open
  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/cop/snapshot")
      .then((d) => { if (alive) { setSnap(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });
    timer.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [open, tick]);

  // Layers — fetch once when opening
  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/cop/layers")
      .then((d) => { if (alive) setLayers(Array.isArray(d?.layers) ? d.layers : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open]);

  const geo      = snap?.geo      || {};
  const graph    = snap?.graph    || {};
  const temporal = snap?.temporal || {};
  const metrics  = snap?.metrics  || {};

  const totals = {
    GEO:      geo.count      ?? 0,
    GRAPH:    graph.count    ?? 0,
    TEMPORAL: temporal.count ?? 0,
    METRICS:  metrics.count  ?? 0,
  };
  const total = Object.values(totals).reduce((a, b) => a + b, 0);

  return (
    <>
      {/* Tab button — left edge at 67 % */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Common Operating Picture — GET /v1/cop/snapshot + /v1/cop/layers"
        style={{
          position: "fixed", left: open ? DRAWER_W : 0, top: "67%",
          zIndex: 120, cursor: "pointer",
          background: open ? ACCENT : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : ACCENT,
          border: `1px solid ${ACCENT}77`,
          borderLeft: open ? "none" : `1px solid ${ACCENT}77`,
          borderRadius: "0 6px 6px 0",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${ACCENT}33`,
          transition: "left 0.25s ease",
        }}
      >
        COP {total > 0 ? `(${total})` : "◈"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", left: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.93)", borderRight: `1px solid ${ACCENT}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "left 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${ACCENT}33` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ color: ACCENT, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              COMMON OPS PICTURE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {snap === null ? "…" : err ? "ERR" : `Σ ${total}`}
            </span>
          </div>

          {/* Geo layer visibility chips */}
          {layers.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {layers.slice(0, 8).map((l, i) => <LayerChip key={l.id || i} layer={l} />)}
            </div>
          )}

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "3px 0",
                  background: tab === t ? `${ACCENT}22` : "transparent",
                  border: `1px solid ${tab === t ? ACCENT : ACCENT + "33"}`,
                  borderRadius: 4, cursor: "pointer",
                  color: tab === t ? ACCENT : "#6B7280",
                  fontSize: 8, fontFamily: S.mono, letterSpacing: 1,
                }}
              >
                {t} {totals[t] > 0 ? `(${totals[t]})` : ""}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!snap && !err && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              LOADING SNAPSHOT…
            </div>
          )}
          {err && (
            <div style={{ padding: "14px", color: "#EF4444", fontSize: 10, textAlign: "center" }}>
              SNAPSHOT UNAVAILABLE
            </div>
          )}
          {snap && !err && tab === "GEO"      && <GeoPane      geo={geo}           />}
          {snap && !err && tab === "GRAPH"    && <GraphPane    graph={graph}        />}
          {snap && !err && tab === "TEMPORAL" && <TemporalPane temporal={temporal}  />}
          {snap && !err && tab === "METRICS"  && <MetricsPane  metrics={metrics}    />}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${ACCENT}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          /v1/cop/snapshot · 60 s · /v1/cop/layers
        </div>
      </div>
    </>
  );
}
