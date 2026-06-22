/**
 * MessagesInboxDrawer — slide-in right-edge drawer listing recent JARVIS
 * messages from GET /v1/messages/recent, polling every 2 min while open.
 *
 * Tab sits at 57 % from top (right edge, between ContactsDirectoryDrawer 50 %
 * and DecisionLedgerPanel 65 %).
 * Mounted in src/Layout.jsx after ContactsDirectoryDrawer.
 *
 * Endpoint: GET /v1/messages/recent?limit=30
 * → { ok: bool, items: [{ id, ts, direction, channel, peer, text, status }],
 *     count, schema_version, source }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 120_000;
const DRAWER_W = 340;
const SKY  = "#0EA5E9";
const TEAL = "#22D3EE";
const VIO  = "#a855f7";
const GREY = "#4e6070";

const DIR_META = {
  in:  { label: "IN",  color: TEAL },
  out: { label: "OUT", color: VIO  },
};

const CHAN_COLORS = {
  sms:     "#22D3EE",
  signal:  "#29E7FF",
  matrix:  "#64748b",
  email:   "#818cf8",
  push:    "#f59e0b",
  default: GREY,
};

function dirMeta(d = "") {
  return DIR_META[d.toLowerCase()] ?? { label: d.toUpperCase() || "?", color: GREY };
}

function chanColor(ch = "") {
  return CHAN_COLORS[ch.toLowerCase()] ?? CHAN_COLORS.default;
}

function relTime(ts) {
  if (!ts) return "—";
  const ms   = typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts;
  const diff = Math.floor((Date.now() - Number(ms)) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function MessagesInboxDrawer() {
  const [open,  setOpen]    = useState(false);
  const [msgs,  setMsgs]    = useState(null);
  const [err,   setErr]     = useState(false);
  const [tick,  bump]       = useReducer((n) => n + 1, 0);
  const timerRef            = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/messages/recent?limit=30")
      .then((raw) => {
        if (!alive) return;
        const items = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.items)
          ? raw.items
          : [];
        setMsgs(items);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items = msgs ?? [];

  return (
    <>
      {/* Fixed toggle tab — right edge, 57 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close messages" : "Open messages inbox"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "57%",
          transform: "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${SKY}55`,
          borderRight: open ? "none" : `1px solid ${SKY}55`,
          color: SKY,
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
        {open ? "MESSAGES ▶" : "◀ MESSAGES"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8992,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${SKY}33`,
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
          <span style={{ fontSize: S.fs.xs, color: SKY, letterSpacing: 2, flex: 1 }}>
            MESSAGES
          </span>
          {msgs !== null && (
            <span style={{ fontSize: S.fs.xxs, color: GREY, letterSpacing: 1 }}>
              {items.length}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : msgs === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO MESSAGES
            </div>
          ) : (
            items.map((msg, idx) => {
              const dm  = dirMeta(msg.direction);
              const cc  = chanColor(msg.channel);
              const age = relTime(msg.ts);
              const excerpt = String(msg.text ?? "").slice(0, 90);

              return (
                <div
                  key={msg.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${dm.color}`,
                  }}
                >
                  {/* peer + direction badge + channel badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: S.fs.xs,
                        color: S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {msg.peer || "—"}
                    </span>
                    <span
                      style={{
                        fontSize: S.fs.xxs,
                        color: dm.color,
                        border: `1px solid ${dm.color}55`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        letterSpacing: 1,
                        flexShrink: 0,
                      }}
                    >
                      {dm.label}
                    </span>
                    {msg.channel && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: cc,
                          border: `1px solid ${cc}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                        }}
                      >
                        {msg.channel.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* text excerpt + age */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "flex-end",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      marginTop: 4,
                      letterSpacing: 0.4,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {excerpt || "—"}
                    </span>
                    <span style={{ flexShrink: 0 }}>{age}</span>
                  </div>
                </div>
              );
            })
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
          {msgs !== null
            ? `${items.length} MSG${items.length !== 1 ? "S" : ""} · 2 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
