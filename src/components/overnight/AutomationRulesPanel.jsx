/**
 * AutomationRulesPanel — Feature 36
 * Right-edge slide-in drawer listing automation rules from GET /v1/rules.
 * Tab at 72 % from top on right edge, between DecisionLedgerPanel (65 %) and
 * GraphCentralityDrawer (80 %). Polls every 5 min while open.
 *
 * Mounted in src/Layout.jsx after GraphCentralityDrawer.
 *
 * Endpoint: GET /v1/rules
 * → { items: [{ id, name, expr, target, severity, enabled }], count: number }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const CY = "#29E7FF";
const AMBER = "#F5A623";
const RED = "#FF4D4D";
const GREEN = "#22C55E";

const SEV_COLOR = {
  critical: RED,
  high: RED,
  warning: AMBER,
  info: CY,
  low: `${CY}99`,
};

function sevColor(sev) {
  return SEV_COLOR[(sev || "").toLowerCase()] || CY;
}

export default function AutomationRulesPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    kimiClient
      .request("/v1/rules")
      .then((d) => {
        if (alive) { setData(d); setErr(false); }
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

  const items = data?.items ?? [];
  const enabledCount = items.filter((r) => r.enabled !== false).length;

  return (
    <>
      {/* Fixed toggle tab — right edge, 72 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close automation rules" : "Open automation rules"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "72%",
          transform: open
            ? "translateY(-50%) rotate(180deg)"
            : "translateY(-50%)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${CY}55`,
          borderRight: open ? "none" : `1px solid ${CY}55`,
          color: CY,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: open ? "4px 0 0 4px" : "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "RULES ▶" : "RULES ◀"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8995,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${CY}33`,
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
          <span style={{ fontSize: S.fs.xs, color: CY, letterSpacing: 2, flex: 1 }}>
            AUTOMATION RULES
          </span>
          {data && (
            <span style={{ fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
              {enabledCount}/{items.length} active
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: AMBER, fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : !data ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO RULES CONFIGURED
            </div>
          ) : (
            items.map((rule) => {
              const color = sevColor(rule.severity);
              const active = rule.enabled !== false;
              return (
                <div
                  key={rule.id ?? rule.name}
                  style={{
                    padding: "9px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    opacity: active ? 1 : 0.45,
                  }}
                >
                  {/* Name + status dot */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: active ? GREEN : S.border,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: "#DCEBF5",
                        fontSize: S.fs.xs,
                        letterSpacing: 0.5,
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rule.name || "unnamed"}
                    </span>
                  </div>

                  {/* Severity badge + target */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {rule.severity && (
                      <span
                        style={{
                          fontSize: 9,
                          color: color,
                          border: `1px solid ${color}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        {rule.severity}
                      </span>
                    )}
                    {rule.target && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: S.text,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        → {rule.target}
                      </span>
                    )}
                  </div>

                  {/* Expression snippet */}
                  {rule.expr && (
                    <span
                      style={{
                        fontSize: 9,
                        color: `${CY}77`,
                        letterSpacing: 0.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {String(rule.expr).slice(0, 55)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
