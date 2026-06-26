import { useState, useEffect, useRef } from "react";

const POLL_MS = 30_000;
const ACC = "#F43F5E";

const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
const SEV_COLOR = {
  critical: "#F43F5E",
  high: "#F97316",
  medium: "#EAB308",
  low: "#94A3B8",
};

function getSev(s) {
  return (s.severity || s.level || s.risk_level || "low").toLowerCase();
}

function getTitle(s) {
  return s.title || s.name || s.signal_name || s.label || "(unnamed signal)";
}

function rel(ts) {
  if (!ts) return "";
  const epoch = typeof ts === "string" ? Date.parse(ts) / 1000 : ts;
  const d = Date.now() / 1000 - epoch;
  if (d < 60) return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

export default function RiskSignalDrawer() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  const fetchSignals = async () => {
    try {
      const r = await fetch("/entities/RiskSignal");
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const raw = Array.isArray(d)
        ? d
        : Array.isArray(d?.items)
        ? d.items
        : Array.isArray(d?.data)
        ? d.data
        : Array.isArray(d?.results)
        ? d.results
        : [];
      const sorted = [...raw].sort(
        (a, b) => (SEV_ORDER[getSev(b)] || 0) - (SEV_ORDER[getSev(a)] || 0)
      );
      setSignals(sorted);
      setErr(null);
    } catch {
      setErr("FETCH ERROR");
    }
  };

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchSignals();
    timerRef.current = setInterval(fetchSignals, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const criticalCount = signals.filter((s) => getSev(s) === "critical").length;

  return (
    <>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          right: open ? 280 : 0,
          top: "26%",
          zIndex: 200,
          background: "#0a0c10",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          color: ACC,
          padding: "6px 4px",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "monospace",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          userSelect: "none",
          letterSpacing: 1,
          transition: "right 0.2s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {criticalCount > 0 && (
          <span
            style={{
              background: ACC,
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 8,
              fontWeight: 700,
              animation: "riskPulse 1.4s infinite",
              writingMode: "horizontal-tb",
              transform: "rotate(90deg)",
              flexShrink: 0,
            }}
          >
            {criticalCount}
          </span>
        )}
        ◈ RISK
      </div>

      {open && (
        <div
          style={{
            position: "fixed",
            right: 0,
            top: 0,
            bottom: 0,
            width: 280,
            zIndex: 199,
            background: "rgba(8,10,14,0.97)",
            border: `1px solid ${ACC}`,
            borderRight: "none",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            fontSize: 11,
            overflowY: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: `1px solid ${ACC}`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div>
              <span style={{ color: ACC, fontWeight: 700, letterSpacing: 1 }}>
                ◈ RISK SIGNALS
              </span>
              {criticalCount > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: ACC,
                    color: "#fff",
                    borderRadius: 3,
                    padding: "1px 5px",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    animation: "riskPulse 1.4s infinite",
                  }}
                >
                  {criticalCount} CRITICAL
                </span>
              )}
              {!err && criticalCount === 0 && (
                <span style={{ color: "#666", marginLeft: 8 }}>
                  {signals.length} signal{signals.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <span
              onClick={() => setOpen(false)}
              style={{ cursor: "pointer", color: "#555", fontSize: 13 }}
            >
              ✕
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {err && (
              <div style={{ color: "#ef4444", padding: "14px 12px" }}>
                {err}
              </div>
            )}
            {!err && signals.length === 0 && (
              <div
                style={{
                  color: "#555",
                  padding: "28px 12px",
                  textAlign: "center",
                  letterSpacing: 1,
                }}
              >
                NO RISK SIGNALS
              </div>
            )}
            {signals.map((s, i) => {
              const sev = getSev(s);
              const sevColor = SEV_COLOR[sev] || "#94A3B8";
              const isCrit = sev === "critical";
              const desc =
                s.description || s.details || s.message || s.body || "";
              const ts =
                s.updated_at ||
                s.created_at ||
                s.timestamp ||
                s.ts ||
                null;
              return (
                <div
                  key={s.id || i}
                  style={{
                    padding: "7px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    borderLeft: isCrit ? `2px solid ${ACC}` : "2px solid transparent",
                    background: isCrit
                      ? "rgba(244,63,94,0.04)"
                      : "transparent",
                    animation: isCrit ? "riskPulse 2s infinite" : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        background: `${sevColor}22`,
                        color: sevColor,
                        border: `1px solid ${sevColor}44`,
                        borderRadius: 3,
                        padding: "1px 5px",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        flexShrink: 0,
                        textTransform: "uppercase",
                      }}
                    >
                      {sev}
                    </span>
                    <span
                      style={{
                        color: "#e2e8f0",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        flex: 1,
                      }}
                    >
                      {getTitle(s)}
                    </span>
                    {ts && (
                      <span
                        style={{ color: "#555", fontSize: 9, flexShrink: 0 }}
                      >
                        {rel(ts)}
                      </span>
                    )}
                  </div>
                  {desc && (
                    <div
                      style={{
                        color: "#6b7280",
                        fontSize: 10,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {desc.length > 60 ? desc.slice(0, 57) + "…" : desc}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            style={{
              padding: "6px 12px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              color: "#444",
              fontSize: 9,
              flexShrink: 0,
            }}
          >
            polls every 30 s · /entities/RiskSignal
          </div>
        </div>
      )}

      <style>{`
        @keyframes riskPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
