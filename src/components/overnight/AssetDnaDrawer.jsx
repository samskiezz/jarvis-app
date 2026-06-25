/**
 * Asset DNA Browser (F89) — right-edge slide-in at 53 % vertical.
 * Polls GET /v1/asset/list?limit=200 every 5 min.
 * Shows each tracked repo asset with risk badge, health dot, kind badge, age.
 * High-risk count badge pulses on the tab. Client-side filter.
 */
import { useState, useEffect, useRef } from "react";

const POLL_MS = 5 * 60 * 1000;
const ACCENT = "#EF4444"; // red when HIGH-risk assets exist
const ACCENT_IDLE = "#94A3B8"; // slate when all clear

const RISK_COLOR = { high: "#EF4444", medium: "#F59E0B", low: "#22D3EE" };
const HEALTH_COLOR = { ok: "#22C55E", warn: "#F59E0B", stale: "#EF4444" };

const KIND_COLOR = {
  jsx: "#38BDF8", tsx: "#38BDF8",
  ts: "#3B82F6", js: "#EAB308",
  py: "#84CC16", md: "#A78BFA",
  json: "#F97316", yaml: "#10B981", yml: "#10B981",
  css: "#EC4899", html: "#FB923C",
};
const kindColor = (k) => KIND_COLOR[k?.toLowerCase()] || "#6B7280";

function relAge(days) {
  if (days == null || days >= 9999) return "—";
  if (days < 1) return "today";
  if (days < 7) return `${Math.floor(days)}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function AssetDnaDrawer() {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("");
  const timerRef = useRef(null);

  const load = () => {
    setLoading(true);
    fetch("/v1/asset/list?limit=200")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => {
        const items = Array.isArray(d) ? d : d.items || [];
        setAssets(items);
        setErr(null);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const q = filter.trim().toLowerCase();
  const visible = assets.filter((a) =>
    !q ||
    (a.name || "").toLowerCase().includes(q) ||
    (a.path || "").toLowerCase().includes(q) ||
    (a.kind || "").toLowerCase().includes(q) ||
    (a.risk || "").toLowerCase().includes(q)
  );

  const highCount = assets.filter((a) => a.risk === "high").length;
  const accent = highCount > 0 ? ACCENT : ACCENT_IDLE;

  const outer = {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    zIndex: 240,
    pointerEvents: "none",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-end",
  };

  const tabStyle = {
    position: "fixed",
    right: open ? 360 : 0,
    top: "53%",
    transform: "translateY(-50%) rotate(180deg)",
    writingMode: "vertical-rl",
    background: `${accent}22`,
    border: `1px solid ${accent}66`,
    borderRight: "none",
    color: accent,
    fontFamily: "monospace",
    fontSize: 11,
    letterSpacing: 2,
    padding: "10px 5px",
    cursor: "pointer",
    userSelect: "none",
    zIndex: 241,
    borderRadius: "4px 0 0 4px",
    transition: "right 0.25s ease",
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    top: 0,
    right: open ? 0 : -361,
    width: 360,
    height: "100vh",
    background: "rgba(10,10,20,0.97)",
    borderLeft: `1px solid ${accent}44`,
    backdropFilter: "blur(16px)",
    display: "flex",
    flexDirection: "column",
    transition: "right 0.25s ease",
    zIndex: 240,
    pointerEvents: open ? "all" : "none",
    fontFamily: "monospace",
  };

  const headerStyle = {
    padding: "12px 14px 8px",
    borderBottom: `1px solid ${accent}33`,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const rowStyle = (risk) => ({
    padding: "7px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    flexDirection: "column",
    gap: 3,
    background: risk === "high" ? "rgba(239,68,68,0.05)" : "transparent",
  });

  const badge = (label, color) => (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 1,
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        padding: "1px 4px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );

  const dot = (color) => (
    <span
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );

  return (
    <>
      {/* Tab */}
      <div style={tabStyle} onClick={() => setOpen((o) => !o)}>
        {highCount > 0 && (
          <span
            style={{
              background: ACCENT,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "pulse 1.5s infinite",
              writingMode: "horizontal-tb",
            }}
          >
            {highCount}
          </span>
        )}
        DNA ▶
      </div>

      {/* Panel */}
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: accent, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
              ASSET DNA
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: "#6B7280", fontSize: 10 }}>loading…</span>
              )}
              <span style={{ color: "#6B7280", fontSize: 10 }}>
                {assets.length} assets
              </span>
              {highCount > 0 &&
                badge(`${highCount} HIGH`, RISK_COLOR.high)}
              <span
                style={{
                  color: "#6B7280",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                }}
                onClick={() => setOpen(false)}
              >
                ×
              </span>
            </div>
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by name / path / kind / risk…"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: `1px solid ${accent}33`,
              borderRadius: 4,
              color: "#e5e7eb",
              fontFamily: "monospace",
              fontSize: 11,
              padding: "4px 8px",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {err && (
            <div
              style={{
                color: "#EF4444",
                padding: "16px 14px",
                fontSize: 11,
              }}
            >
              ⚠ {err}
            </div>
          )}
          {!err && !loading && visible.length === 0 && (
            <div
              style={{
                color: "#6B7280",
                padding: "20px 14px",
                fontSize: 11,
                textAlign: "center",
              }}
            >
              {q ? "NO ASSETS MATCH FILTER" : "NO ASSETS FOUND"}
            </div>
          )}
          {visible.map((a) => (
            <div key={a.id} style={rowStyle(a.risk)}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  flexWrap: "wrap",
                }}
              >
                {dot(HEALTH_COLOR[a.health] || "#6B7280")}
                <span
                  style={{
                    color: "#e5e7eb",
                    fontSize: 11,
                    fontWeight: 600,
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={a.path}
                >
                  {a.name}
                </span>
                {badge(
                  (a.risk || "low").toUpperCase(),
                  RISK_COLOR[a.risk] || RISK_COLOR.low
                )}
                {a.kind && a.kind !== "file" && a.kind !== "feature" &&
                  badge(a.kind.toUpperCase(), kindColor(a.kind))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  paddingLeft: 12,
                }}
              >
                <span
                  style={{
                    color: "#6B7280",
                    fontSize: 10,
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={a.path}
                >
                  {a.path}
                </span>
                <span style={{ color: "#4B5563", fontSize: 10, marginLeft: "auto", whiteSpace: "nowrap" }}>
                  {relAge(a.meta?.age_days)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${accent}22`,
            color: "#4B5563",
            fontSize: 9,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>GET /v1/asset/list · 5 min poll</span>
          <span>{visible.length}/{assets.length} shown</span>
        </div>
      </div>
    </>
  );
}
