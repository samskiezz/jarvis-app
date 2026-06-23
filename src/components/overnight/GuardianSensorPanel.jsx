/**
 * GuardianSensorPanel — right-edge slide-in drawer listing home-security sensor
 * incidents from GET /v1/guardian/incidents and summary from GET /v1/guardian/status.
 * Polling every 30 s while open. ACK via POST /v1/guardian/ack.
 *
 * Tab sits at 67 % from top (right edge, between MessagesInboxDrawer 57 %
 * and AutomationRulesPanel 72 %).
 * Mounted in src/Layout.jsx after IntelProfileDirectory.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 30_000;
const DRAWER_W = 320;
const ACCENT   = "#22C55E"; // green — guardian/security
const GREY     = "#4e6070";

const SEV_COLORS = {
  critical: "#EF4444",
  high:     "#F97316",
  med:      "#FBBF24",
  low:      "#22D3EE",
};

const KIND_COLORS = {
  motion: "#F97316",
  door:   "#38BDF8",
  window: "#38BDF8",
  leak:   "#60A5FA",
  smoke:  "#A78BFA",
  co:     "#EF4444",
  fall:   "#F43F5E",
};

function sevColor(s) { return SEV_COLORS[(s || "").toLowerCase()] ?? GREY; }
function kindColor(k) { return KIND_COLORS[(k || "").toLowerCase()] ?? GREY; }

function relTime(ts) {
  if (!ts || ts === 0) return "—";
  const epochMs = ts < 1e12 ? ts * 1000 : ts;
  const diff = Math.floor((Date.now() - epochMs) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function GuardianSensorPanel() {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState(null);
  const [status,  setStatus]  = useState(null);
  const [err,     setErr]     = useState(false);
  const [acking,  setAcking]  = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/guardian/incidents?limit=50"),
      kimiClient.request("/v1/guardian/status"),
    ])
      .then(([inc, stat]) => {
        if (!alive) return;
        setItems(inc?.items ?? []);
        setStatus(stat ?? null);
        setErr(false);
      })
      .catch(() => { if (alive) setErr(true); });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  async function handleAck(id) {
    if (id <= 0) return;
    setAcking(id);
    try {
      await kimiClient.request("/v1/guardian/ack", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      setItems((prev) =>
        prev ? prev.map((e) => (e.id === id ? { ...e, ack: true } : e)) : prev
      );
    } finally {
      setAcking(null);
    }
  }

  const displayItems = items ?? [];
  const unack = status?.unack ?? displayItems.filter((e) => !e.ack).length;
  const highOpen = status?.high_open ?? 0;

  return (
    <>
      {/* Fixed toggle tab — right edge, 67 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close Guardian sensor panel" : "Open Guardian sensor incidents"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "67%",
          transform: "translateY(-50%)",
          zIndex: 9001,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${ACCENT}55`,
          borderRight: open ? "none" : `1px solid ${ACCENT}55`,
          color: ACCENT,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {unack > 0 && (
          <span
            style={{
              display: "block",
              marginBottom: 4,
              background: highOpen > 0 ? "#EF4444" : ACCENT,
              color: "#000",
              fontSize: 9,
              fontFamily: S.mono,
              borderRadius: 3,
              padding: "1px 3px",
              letterSpacing: 0,
              writingMode: "horizontal-tb",
              textAlign: "center",
            }}
          >
            {unack}
          </span>
        )}
        {open ? "▶ SENSORS" : "◀ SENSORS"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8991,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${ACCENT}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: ACCENT, letterSpacing: 2, flex: 1 }}>
            GUARDIAN
          </span>
          {status && (
            <span style={{ fontSize: S.fs.xxs, color: GREY, letterSpacing: 1 }}>
              {unack} UNACK
              {highOpen > 0 && (
                <span style={{ color: "#EF4444", marginLeft: 6 }}>{highOpen} HIGH</span>
              )}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#EF4444", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : items === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : displayItems.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO INCIDENTS
            </div>
          ) : (
            displayItems.map((ev, idx) => (
              <div
                key={ev.id ?? idx}
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${S.border}`,
                  borderLeft: `3px solid ${ev.ack ? GREY : sevColor(ev.severity)}`,
                  opacity: ev.ack ? 0.5 : 1,
                }}
              >
                {/* kind + severity + value */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: kindColor(ev.kind),
                      border: `1px solid ${kindColor(ev.kind)}55`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}
                  >
                    {(ev.kind ?? "").toUpperCase()}
                  </span>
                  <span
                    style={{
                      fontSize: S.fs.xxs,
                      color: sevColor(ev.severity),
                      border: `1px solid ${sevColor(ev.severity)}44`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}
                  >
                    {(ev.severity ?? "").toUpperCase()}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: S.fs.xxs,
                      color: S.textHi,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {(ev.value ?? "").toUpperCase()}
                  </span>
                </div>

                {/* sensor_id + age + ack button */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginTop: 4,
                    fontSize: S.fs.xxs,
                    color: GREY,
                    letterSpacing: 0.5,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {ev.sensor_id ?? "—"}
                  </span>
                  <span style={{ flexShrink: 0 }}>{relTime(ev.ts)}</span>
                  {!ev.ack && ev.id > 0 && (
                    <button
                      onClick={() => handleAck(ev.id)}
                      disabled={acking === ev.id}
                      style={{
                        flexShrink: 0,
                        background: "transparent",
                        border: `1px solid ${ACCENT}55`,
                        borderRadius: 3,
                        color: ACCENT,
                        fontFamily: S.mono,
                        fontSize: 9,
                        letterSpacing: 1,
                        padding: "1px 5px",
                        cursor: "pointer",
                        opacity: acking === ev.id ? 0.4 : 1,
                      }}
                    >
                      ACK
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {items !== null
            ? `${displayItems.length} EVENT${displayItems.length !== 1 ? "S" : ""} · 30 S POLL`
            : err ? "ERR" : "…"}
        </div>
      </div>
    </>
  );
}
