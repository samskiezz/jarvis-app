/**
 * AlertInbox — F280
 * ◈ ALRTINB button: left 204600, bottom 8, zIndex 376
 * Toggle: window.dispatchEvent(new Event("jarvis:alrtinb-toggle"))
 * Voice triggers: "alert inbox", "alrtinb", "show alerts", "alert center", "alert panel"
 * Data: GET /v1/alerts (poll 15s) | ACK: POST /v1/alerts/{id}/ack
 * ASSESS: reads count of unacknowledged criticals + TTS via /v1/voice/tts
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const AM = "#F5A623";
const GN = "#4ADE80";
const RD = "#F87171";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 204600;
const POLL_MS = 15000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "http://localhost:8000"
  );
}

const ALRTINB_RE =
  /\b(alert\s+inbox|alrtinb\b|show\s+alerts?|alert\s+cent(?:er|re)|alert\s+panel|inbox\s+alerts?|notification\s+inbox)\b/i;

export function isAlrtinbQuery(q) {
  return ALRTINB_RE.test(q || "");
}

const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const SEV_COLORS = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN };

function ageLabel(ts) {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function speak(text) {
  try {
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

export default function AlertInbox() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [acking, setAcking] = useState(new Set());
  const [ackedIds, setAckedIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState("CRITICAL");
  const [detail, setDetail] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase()}/v1/alerts`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data.alerts)
        ? data.alerts
        : [];
      setAlerts(list);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchAlerts();
    timerRef.current = setInterval(fetchAlerts, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchAlerts]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:alrtinb-toggle", onToggle);
    return () => window.removeEventListener("jarvis:alrtinb-toggle", onToggle);
  }, []);

  async function ackAlert(e, id) {
    e.stopPropagation();
    if (acking.has(id) || ackedIds.has(id)) return;
    setAcking((prev) => new Set([...prev, id]));
    try {
      await fetch(`${apiBase()}/v1/alerts/${id}/ack`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      setAckedIds((prev) => new Set([...prev, id]));
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
        setAckedIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        if (detail?.id === id) setDetail(null);
      }, 600);
    } catch {
      setAcking((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }

  async function runAssess() {
    setAssessing(true);
    const criticals = alerts.filter(
      (a) => (a.severity || "").toUpperCase() === "CRITICAL"
    );
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          message: `Assess alert inbox: ${criticals.length} unacknowledged CRITICAL alert${
            criticals.length !== 1 ? "s" : ""
          }. Total active: ${alerts.length}. ${
            criticals.length > 0
              ? `Top critical: ${criticals[0]?.title || "unknown"}.`
              : "No critical alerts active."
          } Provide a one-sentence operational status.`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const reply =
          data?.response ||
          data?.message ||
          `${criticals.length} critical alert${
            criticals.length !== 1 ? "s" : ""
          } require attention.`;
        await speak(reply);
      }
    } catch {}
    setAssessing(false);
  }

  const visible = alerts.filter((a) => !ackedIds.has(a.id));
  const bySev = SEV_ORDER.reduce((acc, sev) => {
    acc[sev] = visible.filter(
      (a) => (a.severity || "").toUpperCase() === sev
    );
    return acc;
  }, {});
  const criticalCount = bySev["CRITICAL"].length;
  const totalUnread = visible.length;
  const tabAlerts = bySev[activeTab] || [];

  const badgePulse = criticalCount > 0;

  return (
    <>
      {/* ◈ ALRTINB button */}
      <div
        onClick={() => setOpen((v) => !v)}
        title="Alert Inbox"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 376,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: open
              ? "rgba(248,113,113,0.18)"
              : "rgba(10,18,28,0.80)",
            border: `1px solid ${open ? RD : BORD}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          {/* bell icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
              stroke={open ? RD : CY}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M13.73 21a2 2 0 0 1-3.46 0"
              stroke={open ? RD : CY}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {totalUnread > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                background: badgePulse ? RD : AM,
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 3px",
                animation: badgePulse ? "alrtPulse 1.4s infinite" : "none",
              }}
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 8,
            color: open ? RD : CY,
            letterSpacing: "0.08em",
            fontFamily: "monospace",
          }}
        >
          ALRTINB
        </span>
      </div>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 60,
            width: 480,
            maxHeight: "70vh",
            background: SURF,
            border: `1px solid ${BORD}`,
            borderRadius: 12,
            zIndex: 377,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 4px 40px rgba(0,0,0,0.6)",
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${BORD}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, fontSize: 13, fontWeight: 700 }}>
                ALERT INBOX
              </span>
              {totalUnread > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    color: criticalCount > 0 ? RD : AM,
                    border: `1px solid ${criticalCount > 0 ? RD : AM}`,
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}
                >
                  {totalUnread} ACTIVE
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={runAssess}
                disabled={assessing}
                style={{
                  fontSize: 9,
                  color: assessing ? "#666" : AM,
                  background: "none",
                  border: `1px solid ${assessing ? "#444" : AM}`,
                  borderRadius: 4,
                  padding: "2px 8px",
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "ASSESSING…" : "ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 11,
                  color: "#666",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 4px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Severity tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${BORD}`,
              flexShrink: 0,
            }}
          >
            {SEV_ORDER.map((sev) => {
              const cnt = bySev[sev].length;
              const col = SEV_COLORS[sev];
              const isActive = activeTab === sev;
              return (
                <button
                  key={sev}
                  onClick={() => setActiveTab(sev)}
                  style={{
                    flex: 1,
                    padding: "6px 4px",
                    background: isActive ? `${col}18` : "none",
                    border: "none",
                    borderBottom: isActive ? `2px solid ${col}` : "2px solid transparent",
                    color: isActive ? col : "#555",
                    fontSize: 9,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.05em",
                  }}
                >
                  {sev}
                  {cnt > 0 && (
                    <span
                      style={{
                        marginLeft: 4,
                        background: col,
                        color: "#000",
                        borderRadius: 8,
                        padding: "0 4px",
                        fontSize: 8,
                        fontWeight: 700,
                      }}
                    >
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Alert list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {tabAlerts.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 16px",
                  gap: 8,
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={GN} strokeWidth="1.5" />
                  <path
                    d="M9 12l2 2 4-4"
                    stroke={GN}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={{ color: GN, fontSize: 11 }}>
                  No {activeTab.toLowerCase()} alerts
                </span>
              </div>
            ) : (
              tabAlerts.map((alert) => {
                const isAcking = acking.has(alert.id);
                const isAcked = ackedIds.has(alert.id);
                const col = SEV_COLORS[activeTab] || CY;
                return (
                  <div
                    key={alert.id}
                    onClick={() =>
                      setDetail(detail?.id === alert.id ? null : alert)
                    }
                    style={{
                      padding: "9px 14px",
                      borderBottom: `1px solid ${BORD}`,
                      cursor: "pointer",
                      opacity: isAcked ? 0 : 1,
                      transition: "opacity 0.5s",
                      background:
                        detail?.id === alert.id
                          ? "rgba(41,231,255,0.04)"
                          : "transparent",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 3,
                          borderRadius: 2,
                          background: col,
                          alignSelf: "stretch",
                          flexShrink: 0,
                          minHeight: 20,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              color: "#e8f4f8",
                              fontSize: 11,
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {alert.title || alert.name || `Alert ${alert.id}`}
                          </span>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{ fontSize: 9, color: "#555" }}
                            >
                              {ageLabel(alert.created_at || alert.timestamp)}
                            </span>
                            <button
                              onClick={(e) => ackAlert(e, alert.id)}
                              disabled={isAcking || isAcked}
                              style={{
                                fontSize: 8,
                                color: isAcked ? GN : CY,
                                background: "none",
                                border: `1px solid ${isAcked ? GN : CY}`,
                                borderRadius: 3,
                                padding: "1px 6px",
                                cursor:
                                  isAcking || isAcked
                                    ? "not-allowed"
                                    : "pointer",
                                fontFamily: "inherit",
                                opacity: isAcking ? 0.5 : 1,
                              }}
                            >
                              {isAcked ? "ACK'd" : isAcking ? "…" : "ACK"}
                            </button>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 3,
                            alignItems: "center",
                          }}
                        >
                          {alert.source && (
                            <span
                              style={{ fontSize: 9, color: "#557" }}
                            >
                              {alert.source}
                            </span>
                          )}
                        </div>

                        {/* Detail drawer */}
                        {detail?.id === alert.id && (
                          <div
                            style={{
                              marginTop: 8,
                              paddingTop: 8,
                              borderTop: `1px solid ${BORD}`,
                            }}
                          >
                            {alert.description && (
                              <p
                                style={{
                                  fontSize: 10,
                                  color: "#aaa",
                                  margin: "0 0 6px",
                                  lineHeight: 1.5,
                                }}
                              >
                                {alert.description}
                              </p>
                            )}
                            {alert.entities && alert.entities.length > 0 && (
                              <div>
                                <span
                                  style={{
                                    fontSize: 8,
                                    color: CY,
                                    letterSpacing: "0.08em",
                                  }}
                                >
                                  LINKED ENTITIES
                                </span>
                                <div
                                  style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 4,
                                    marginTop: 3,
                                  }}
                                >
                                  {alert.entities.map((ent, i) => (
                                    <span
                                      key={i}
                                      style={{
                                        fontSize: 9,
                                        color: AM,
                                        border: `1px solid ${AM}44`,
                                        borderRadius: 3,
                                        padding: "1px 5px",
                                      }}
                                    >
                                      {typeof ent === "string"
                                        ? ent
                                        : ent.name || ent.id}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {!alert.description && (!alert.entities || !alert.entities.length) && (
                              <span style={{ fontSize: 9, color: "#444" }}>
                                No additional details
                              </span>
                            )}
                          </div>
                        )}
                      </div>
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
              borderTop: `1px solid ${BORD}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "#444" }}>
              POLL 15s
            </span>
            <button
              onClick={fetchAlerts}
              style={{
                fontSize: 9,
                color: CY,
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes alrtPulse {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.6; transform:scale(1.2); }
        }
      `}</style>
    </>
  );
}
