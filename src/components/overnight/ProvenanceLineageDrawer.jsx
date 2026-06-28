/**
 * F170 — Provenance Lineage Drawer
 *
 * Right-edge slide-in at 4.5% vertical.
 * Polls GET /v1/jarvis/lineage?limit=50 every 5 min while open.
 * Each row shows: target object chip, action badge, source chip, actor, relative age.
 * Accent: emerald (#10B981).
 */

import { useEffect, useRef, useState, useCallback } from "react";

const POLL_MS = 5 * 60 * 1000;
const ENDPOINT = "/v1/jarvis/lineage?limit=50";

const C = {
  bg: "#0a0f1e",
  panel: "#0d1424",
  border: "#1e3a5f",
  accent: "#10B981",
  dim: "#4b6a8a",
  text: "#c8d6e8",
  muted: "#6b8caf",
};

function relAge(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "string" ? Date.parse(ts) : ts * 1000;
  if (!epoch || isNaN(epoch)) return "—";
  const diff = Math.floor((Date.now() - epoch) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(s, n = 22) {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const ACTION_COLORS = {
  create: "#22D3EE",
  update: "#A78BFA",
  delete: "#F87171",
  enrich: "#34D399",
  merge: "#FCD34D",
  infer: "#60A5FA",
};

function actionColor(action) {
  if (!action) return C.dim;
  const k = action.toLowerCase();
  for (const [key, col] of Object.entries(ACTION_COLORS)) {
    if (k.includes(key)) return col;
  }
  return "#94A3B8";
}

export default function ProvenanceLineageDrawer() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = data.lineage ?? data.items ?? data.results ?? data ?? [];
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  const tabStyle = {
    position: "fixed",
    right: open ? 340 : 0,
    top: "4.5%",
    transform: "translateY(-50%)",
    zIndex: 3800,
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    background: C.panel,
    border: `1px solid ${C.accent}`,
    borderRight: open ? "none" : `1px solid ${C.accent}`,
    color: C.accent,
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1,
    padding: "10px 5px",
    cursor: "pointer",
    borderRadius: open ? "6px 0 0 6px" : 6,
    transition: "right 0.3s ease",
    userSelect: "none",
    boxShadow: open ? "none" : `0 0 8px ${C.accent}44`,
  };

  const panelStyle = {
    position: "fixed",
    right: open ? 0 : -340,
    top: 0,
    height: "100vh",
    width: 340,
    background: C.bg,
    borderLeft: `1px solid ${C.border}`,
    zIndex: 3799,
    display: "flex",
    flexDirection: "column",
    transition: "right 0.3s ease",
    fontFamily: "monospace",
    overflow: "hidden",
  };

  return (
    <>
      <div style={tabStyle} onClick={() => setOpen((v) => !v)}>
        {open ? "▶" : "◀"} LINEAGE
      </div>

      <div style={panelStyle}>
        {/* header */}
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span style={{ color: C.accent, fontSize: 11, letterSpacing: 1 }}>
            ◈ PROVENANCE LINEAGE
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {loading && <span style={{ color: C.dim, fontSize: 9 }}>FETCHING…</span>}
            <span style={{
              background: `${C.accent}22`,
              border: `1px solid ${C.accent}55`,
              color: C.accent,
              fontSize: 9,
              padding: "2px 6px",
              borderRadius: 3,
            }}>{rows.length}</span>
            <button
              onClick={fetch_}
              style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 12, padding: 0 }}
              title="Refresh"
            >↻</button>
          </div>
        </div>

        {/* body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
          {error && (
            <div style={{ padding: "10px 14px", color: "#F87171", fontSize: 10 }}>
              ✗ {error}
            </div>
          )}

          {!error && !loading && rows.length === 0 && (
            <div style={{ padding: "20px 14px", color: C.dim, fontSize: 10, textAlign: "center" }}>
              NO LINEAGE RECORDS
            </div>
          )}

          {rows.map((row, i) => {
            const action = row.action ?? row.op ?? row.operation ?? "—";
            const target = row.target ?? row.object_id ?? row.target_id ?? "—";
            const source = row.source ?? row.source_id ?? row.origin ?? "—";
            const actor = row.actor ?? row.user ?? row.author ?? "—";
            const ts = row.ts ?? row.timestamp ?? row.created_at ?? row.created_ts ?? null;
            const acol = actionColor(action);

            return (
              <div key={row.id ?? i} style={{
                padding: "7px 12px",
                borderBottom: `1px solid ${C.border}22`,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}>
                {/* top row: target + action badge */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    background: "#0d2a40",
                    border: `1px solid ${C.accent}44`,
                    color: C.accent,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    maxWidth: 160,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }} title={target}>{truncate(target, 26)}</span>

                  <span style={{
                    background: `${acol}22`,
                    border: `1px solid ${acol}66`,
                    color: acol,
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 3,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}>{truncate(action, 16)}</span>
                </div>

                {/* bottom row: source + actor + age */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 9 }}>
                  {source !== "—" && (
                    <span style={{ color: C.dim }} title={source}>
                      ← {truncate(source, 20)}
                    </span>
                  )}
                  <span style={{ color: C.dim }}>{truncate(actor, 14)}</span>
                  <span style={{ marginLeft: "auto", color: "#4b6a8a" }}>{relAge(ts)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid ${C.border}`,
          color: C.dim,
          fontSize: 9,
          flexShrink: 0,
        }}>
          GET /v1/jarvis/lineage · 5-min poll
        </div>
      </div>
    </>
  );
}
