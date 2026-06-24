/**
 * GovernanceDashboard — Feature 67
 * Right-edge slide-in drawer at 9 % from top showing data governance state:
 *   - Registered processing purposes + allowed classification marks
 *   - Retention policies (TTL per object type)
 *   - Subject-rights requests (GDPR access/export/erase)
 *
 * Mounted in src/Layout.jsx after CodePulseDrawer.
 *
 * Endpoints:
 *   GET /v1/governance/purposes  → { items: [{ name, description, allowed_marks }], count }
 *   GET /v1/governance/retention → { items: [{ type_id, ttl_days }], count }
 *   GET /v1/governance/requests  → { items: [{ id, kind, subject_id, status, actor, ts }], count }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000; // 5 min
const DRAWER_W = 340;
const ACCENT = "#3B82F6";
const GREEN = "#22C55E";
const AMBER = "#F5A623";
const RED = "#FF4D4D";
const VIOLET = "#A78BFA";
const DIM = "rgba(59,130,246,0.45)";

const TABS = ["PURPOSES", "RETENTION", "REQUESTS"];

const MARK_COLOR = {
  PUBLIC: "#22C55E",
  INTERNAL: "#60A5FA",
  FINANCIAL: "#FBBF24",
  PII: "#F97316",
  RESTRICTED: "#EF4444",
};

const KIND_COLOR = {
  access: "#60A5FA",
  export: "#A78BFA",
  erase: "#EF4444",
};

const STATUS_COLOR = {
  PENDING: "#F5A623",
  COMPLETED: "#22C55E",
  REJECTED: "#EF4444",
  EXECUTED: "#22C55E",
};

function fmtAge(ts) {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000) - Number(ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function GovernanceDashboard() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("PURPOSES");

  const [purposes, setPurposes] = useState(null);
  const [retention, setRetention] = useState(null);
  const [requests, setRequests] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    Promise.all([
      kimiClient.request("/v1/governance/purposes"),
      kimiClient.request("/v1/governance/retention"),
      kimiClient.request("/v1/governance/requests"),
    ])
      .then(([p, r, q]) => {
        if (!alive) return;
        setPurposes(p);
        setRetention(r);
        setRequests(q);
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

  const purposeItems = purposes?.items ?? [];
  const retentionItems = retention?.items ?? [];
  const requestItems = requests?.items ?? [];
  const pendingCount = requestItems.filter(
    (r) => (r.status ?? "").toUpperCase() === "PENDING"
  ).length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 9 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close governance dashboard" : "Open data governance dashboard"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "9%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
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
        {open ? "GOV ▶" : "GOV ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8993,
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
            GOVERNANCE
          </span>
          {purposes && (
            <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
              {purposeItems.length} purpose{purposeItems.length !== 1 ? "s" : ""}
            </span>
          )}
          {pendingCount > 0 && (
            <span
              style={{
                fontSize: 9,
                color: AMBER,
                border: `1px solid ${AMBER}55`,
                borderRadius: 3,
                padding: "1px 5px",
                letterSpacing: 1,
                flexShrink: 0,
              }}
            >
              {pendingCount} PENDING
            </span>
          )}
        </div>

        {/* Sub-tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: "6px 4px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? `2px solid ${ACCENT}` : "2px solid transparent",
                color: activeTab === tab ? ACCENT : S.text,
                fontFamily: S.mono,
                fontSize: 9,
                letterSpacing: 1.5,
                cursor: "pointer",
                transition: "color 0.15s",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !purposes ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : activeTab === "PURPOSES" ? (
            purposeItems.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO PURPOSES REGISTERED
              </div>
            ) : (
              purposeItems.map((p, idx) => (
                <div
                  key={p.name ?? idx}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${S.border}`,
                  }}
                >
                  <div
                    style={{
                      color: "#DCEBF5",
                      fontSize: S.fs.xs,
                      letterSpacing: 1,
                      marginBottom: p.description ? 4 : 0,
                    }}
                  >
                    {p.name}
                  </div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: 9,
                        color: S.text,
                        letterSpacing: 0.5,
                        marginBottom: 6,
                        lineHeight: 1.4,
                      }}
                    >
                      {p.description.length > 80
                        ? p.description.slice(0, 80) + "…"
                        : p.description}
                    </div>
                  )}
                  {Array.isArray(p.allowed_marks) && p.allowed_marks.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.allowed_marks.map((mark) => (
                        <span
                          key={mark}
                          style={{
                            fontSize: 9,
                            color: MARK_COLOR[mark] ?? "#60A5FA",
                            border: `1px solid ${MARK_COLOR[mark] ?? "#60A5FA"}55`,
                            borderRadius: 3,
                            padding: "1px 5px",
                            letterSpacing: 1,
                          }}
                        >
                          {mark}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )
          ) : activeTab === "RETENTION" ? (
            retentionItems.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO RETENTION POLICIES SET
              </div>
            ) : (
              retentionItems.map((r, idx) => (
                <div
                  key={r.type_id ?? idx}
                  style={{
                    padding: "10px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: r.ttl_days === 0 ? GREEN : ACCENT,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: "#DCEBF5", fontSize: S.fs.xs, letterSpacing: 1, flex: 1 }}>
                    {r.type_id}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: r.ttl_days === 0 ? GREEN : AMBER,
                      border: `1px solid ${r.ttl_days === 0 ? GREEN : AMBER}55`,
                      borderRadius: 3,
                      padding: "1px 5px",
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}
                  >
                    {r.ttl_days === 0 ? "∞ FOREVER" : `${r.ttl_days}d`}
                  </span>
                </div>
              ))
            )
          ) : (
            /* REQUESTS tab */
            requestItems.length === 0 ? (
              <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
                NO SUBJECT REQUESTS
              </div>
            ) : (
              requestItems.map((r, idx) => {
                const kind = (r.kind ?? "").toLowerCase();
                const status = (r.status ?? "PENDING").toUpperCase();
                const kindColor = KIND_COLOR[kind] ?? "#60A5FA";
                const statusColor = STATUS_COLOR[status] ?? AMBER;
                return (
                  <div
                    key={r.id ?? idx}
                    style={{
                      padding: "10px 14px",
                      borderBottom: `1px solid ${S.border}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: kindColor,
                          border: `1px solid ${kindColor}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        {r.kind ?? "?"}
                      </span>
                      <span style={{ color: "#DCEBF5", fontSize: S.fs.xs, letterSpacing: 0.5, flex: 1 }}>
                        {r.subject_id ?? "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          color: statusColor,
                          border: `1px solid ${statusColor}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {r.actor && (
                        <span style={{ fontSize: 9, color: S.text, letterSpacing: 0.5 }}>
                          by <span style={{ color: VIOLET }}>{r.actor}</span>
                        </span>
                      )}
                      {r.ts != null && (
                        <span style={{ fontSize: 9, color: DIM, letterSpacing: 0.5 }}>
                          {fmtAge(r.ts)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: 9,
            color: DIM,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {purposes
            ? `${purposeItems.length} purposes · ${retentionItems.length} policies · ${requestItems.length} requests`
            : "…"}
        </div>
      </div>
    </>
  );
}
