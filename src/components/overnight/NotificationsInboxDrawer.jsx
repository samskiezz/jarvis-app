import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 180_000; // 3 min
const DRAWER_W = 370;
const ACCENT = "#C084FC"; // purple-400

function relAge(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const PRIORITY_COLOR = {
  critical: "#F87171",
  high: "#FB923C",
  medium: "#FCD34D",
  low: "#94A3B8",
};

function priColor(p) {
  return PRIORITY_COLOR[(p ?? "low").toLowerCase()] ?? "#94A3B8";
}

const KIND_COLOR = {
  alert: "#F87171",
  warning: "#FCD34D",
  info: "#38BDF8",
  success: "#4ADE80",
  task: "#A78BFA",
  update: "#34D399",
};

function kindColor(k) {
  return KIND_COLOR[(k ?? "info").toLowerCase()] ?? "#64748B";
}

export default function NotificationsInboxDrawer() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const [acking, setAcking] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/jarvis/notifications?user_id=anonymous&acked=false&limit=50")
      .then((res) => {
        if (!alive) return;
        setNotifs(res?.notifications ?? []);
        setErr(false);
      })
      .catch(() => {
        if (alive) setErr(true);
      });
    timerRef.current = setTimeout(() => {
      if (alive) bump();
    }, POLL_MS);
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [open, tick]);

  async function ack(notifId) {
    setAcking(notifId);
    try {
      await kimiClient.request("/v1/jarvis/notifications/ack", {
        method: "POST",
        body: JSON.stringify({ notification_id: notifId }),
      });
      setNotifs((prev) => (prev ?? []).filter((n) => n.id !== notifId));
    } catch (_) {
      // ignore ack errors silently
    } finally {
      setAcking(null);
    }
  }

  const unackedCount = (notifs ?? []).length;
  const pulsing = unackedCount > 0;

  return (
    <>
      {/* Tab — left edge at 79% */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "79%",
          transform: "translateY(-50%)",
          zIndex: 1500,
          background: pulsing
            ? `linear-gradient(135deg, ${ACCENT}, #A21CAF)`
            : ACCENT,
          color: "#0F172A",
          border: "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.05em",
          cursor: "pointer",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s ease, background 0.3s ease",
          boxShadow: pulsing
            ? `2px 0 18px ${ACCENT}88`
            : `2px 0 12px ${ACCENT}44`,
          animation: pulsing ? "notifPulse 2.5s ease-in-out infinite" : "none",
        }}
        aria-label={open ? "Close Notifications drawer" : "Open Notifications drawer"}
      >
        {open
          ? "NOTIF ◀"
          : unackedCount > 0
          ? `NOTIF ${unackedCount} ▶`
          : "NOTIF ▶"}
      </button>

      <style>{`
        @keyframes notifPulse {
          0%, 100% { box-shadow: 2px 0 12px ${ACCENT}44; }
          50% { box-shadow: 2px 0 28px ${ACCENT}cc; }
        }
      `}</style>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          background: S?.bg ?? "#0B1120",
          borderRight: `1px solid ${ACCENT}44`,
          boxShadow: open ? `4px 0 32px ${ACCENT}22` : "none",
          transition: "left 0.25s ease",
          zIndex: 1499,
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${ACCENT}33`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                color: ACCENT,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
              }}
            >
              ◈ NOTIFICATIONS
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {notifs != null && (
                <span
                  style={{
                    background: unackedCount > 0 ? `${ACCENT}33` : "#1E293B",
                    color: unackedCount > 0 ? ACCENT : "#64748B",
                    fontSize: 10,
                    fontWeight: 700,
                    borderRadius: 10,
                    padding: "1px 7px",
                    border: `1px solid ${unackedCount > 0 ? ACCENT + "66" : "#334155"}`,
                  }}
                >
                  {unackedCount} UNREAD
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  bump();
                }}
                style={{
                  background: "none",
                  border: `1px solid ${ACCENT}44`,
                  color: ACCENT,
                  fontSize: 9,
                  borderRadius: 3,
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
              >
                ↺
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ color: "#F87171", fontSize: 11, padding: "12px 14px" }}>
              ⚠ /v1/jarvis/notifications unreachable
            </div>
          ) : notifs == null ? (
            <div style={{ color: "#475569", fontSize: 11, padding: "12px 14px" }}>
              Loading…
            </div>
          ) : notifs.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 11, padding: "16px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>◈</div>
              NO PENDING NOTIFICATIONS
            </div>
          ) : (
            notifs.map((n) => {
              const id = n.id ?? n.notification_id ?? Math.random();
              const kind = n.kind ?? n.type ?? "info";
              const priority = n.priority ?? n.level ?? "low";
              const message = n.message ?? n.text ?? n.body ?? "(no message)";
              const ts = n.created_at ?? n.ts ?? n.timestamp ?? null;
              const isAcking = acking === id;

              return (
                <div
                  key={id}
                  style={{
                    padding: "8px 12px",
                    borderBottom: `1px solid #1E293B`,
                    borderLeft: `3px solid ${priColor(priority)}`,
                    opacity: isAcking ? 0.5 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {/* Row header: kind + priority + age */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: kindColor(kind),
                        border: `1px solid ${kindColor(kind)}66`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        flexShrink: 0,
                      }}
                    >
                      {kind.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: priColor(priority),
                        border: `1px solid ${priColor(priority)}55`,
                        borderRadius: 3,
                        padding: "1px 4px",
                        flexShrink: 0,
                      }}
                    >
                      {priority.toUpperCase()}
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "#475569", fontSize: 9 }}>
                      {relAge(ts)}
                    </span>
                  </div>

                  {/* Message text */}
                  <div
                    style={{
                      color: "#CBD5E1",
                      fontSize: 11,
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                      marginBottom: 6,
                    }}
                  >
                    {message}
                  </div>

                  {/* ACK button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={() => ack(id)}
                      disabled={isAcking}
                      style={{
                        background: "none",
                        border: `1px solid ${ACCENT}55`,
                        color: ACCENT,
                        fontSize: 9,
                        borderRadius: 3,
                        padding: "2px 8px",
                        cursor: isAcking ? "not-allowed" : "pointer",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {isAcking ? "…" : "✓ ACK"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "5px 14px",
            borderTop: `1px solid ${ACCENT}22`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: "#334155", fontSize: 9 }}>
            GET /v1/jarvis/notifications · 3 min poll
          </span>
        </div>
      </div>
    </>
  );
}
