import { useEffect, useReducer, useState } from "react";
import { SHELL as S } from "@/domain/colors";

const POLL_MS = 120_000;
const DRAWER_W = 300;
const ACCENT = "#F59E0B";

function Pill({ label, color, bg }) {
  return (
    <span
      style={{
        background: bg || `${color}22`,
        color: color,
        borderRadius: 3,
        fontSize: 8,
        fontWeight: 700,
        padding: "1px 5px",
        letterSpacing: 1,
        fontFamily: "monospace",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export default function ResearchStatusDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/v1/jarvis/research/status")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (alive) { setData(d); setErr(false); } })
      .catch(() => { if (alive) setErr(true); });
    const t = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(t); };
  }, [open, tick]);

  const ap = data?.autopilot || {};
  const conn = data?.connection || {};
  const backendLabel = data?.backend
    ? data.backend.toUpperCase().replace(/-/g, " ")
    : "OFFLINE";
  const backendColor = data?.available ? "#4ADE80" : "#F87171";

  return (
    <>
      {/* slide-in panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          width: DRAWER_W,
          height: "100vh",
          background: S.bg || "rgba(10,14,26,0.97)",
          borderLeft: `1px solid ${S.border || "rgba(255,255,255,0.08)"}`,
          backdropFilter: S.blur || "blur(14px)",
          zIndex: 8992,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.28s cubic-bezier(.4,0,.2,1)",
          fontFamily: "monospace",
        }}
      >
        {/* header */}
        <div
          style={{
            padding: "10px 12px 8px",
            borderBottom: `1px solid ${S.border || "rgba(255,255,255,0.07)"}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>
            LLM RESEARCH
          </span>
          {data && (
            <Pill
              label={backendLabel}
              color={backendColor}
            />
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err && (
            <div style={{ color: "#F87171", fontSize: 11, padding: "12px 14px" }}>
              /v1/jarvis/research/status unreachable
            </div>
          )}

          {!err && !data && (
            <div style={{ color: S.text || "rgba(255,255,255,0.3)", fontSize: 11, padding: "12px 14px" }}>
              {open ? "loading…" : ""}
            </div>
          )}

          {data && (
            <>
              {/* backend availability */}
              <Section label="BACKEND">
                <Row label="status">
                  <Pill label={data.available ? "AVAILABLE" : "OFFLINE"} color={backendColor} />
                </Row>
                <Row label="engine">
                  <span style={{ color: data.backend ? "#CBD5E1" : "#475569", fontSize: 10 }}>
                    {data.backend || "none"}
                  </span>
                </Row>
              </Section>

              {/* connection */}
              <Section label="CONNECTION">
                <Row label="host">
                  <span
                    style={{
                      color: "#CBD5E1",
                      fontSize: 9,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                      display: "inline-block",
                    }}
                    title={conn.ollama_host || ""}
                  >
                    {conn.ollama_host || "—"}
                  </span>
                </Row>
                <Row label="source">
                  <Pill
                    label={(conn.source || "default").toUpperCase()}
                    color={conn.source === "setup" ? "#4ADE80" : conn.source === "env" ? ACCENT : "#94A3B8"}
                  />
                </Row>
                <Row label="model">
                  <span style={{ color: "#CBD5E1", fontSize: 9 }}>
                    {conn.model || "auto-detect"}
                  </span>
                </Row>
              </Section>

              {/* autopilot */}
              <Section label="AUTOPILOT">
                <Row label="running">
                  <Pill
                    label={ap.running ? "RUNNING" : "STOPPED"}
                    color={ap.running ? "#4ADE80" : "#94A3B8"}
                  />
                </Row>
                <Row label="enabled">
                  <Pill
                    label={ap.enabled_env ? "ENV ON" : "ENV OFF"}
                    color={ap.enabled_env ? ACCENT : "#64748B"}
                  />
                </Row>
                {ap.backend && (
                  <Row label="backend">
                    <span style={{ color: "#CBD5E1", fontSize: 9 }}>{ap.backend}</span>
                  </Row>
                )}
                {ap.cycle !== undefined && (
                  <Row label="cycles">
                    <span style={{ color: ACCENT, fontSize: 10, fontWeight: 700 }}>{ap.cycle}</span>
                  </Row>
                )}
                {ap.phase && (
                  <Row label="phase">
                    <span style={{ color: "#CBD5E1", fontSize: 9 }}>{ap.phase}</span>
                  </Row>
                )}
                {ap.error && (
                  <Row label="error">
                    <span style={{ color: "#F87171", fontSize: 9 }}>{String(ap.error).slice(0, 60)}</span>
                  </Row>
                )}
              </Section>

              {/* hint */}
              {!data.available && data.hint && (
                <div
                  style={{
                    margin: "8px 12px",
                    padding: "6px 8px",
                    background: "rgba(245,158,11,0.08)",
                    border: `1px solid ${ACCENT}33`,
                    borderRadius: 4,
                    color: "#94A3B8",
                    fontSize: 9,
                    lineHeight: 1.5,
                  }}
                >
                  {data.hint}
                </div>
              )}
            </>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${S.border || "rgba(255,255,255,0.07)"}`,
            fontSize: 9,
            color: S.text || "rgba(255,255,255,0.3)",
            display: "flex",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT }}>●</span>
          RESEARCH MONITOR · 2 MIN POLL
        </div>
      </div>

      {/* tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "19%",
          zIndex: 8995,
          writingMode: "vertical-rl",
          background: "rgba(10,14,26,0.92)",
          border: `1px solid ${ACCENT}`,
          borderRight: "none",
          borderRadius: "4px 0 0 4px",
          color: ACCENT,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.5,
          padding: "8px 4px",
          cursor: "pointer",
          userSelect: "none",
          transition: "right 0.28s cubic-bezier(.4,0,.2,1)",
        }}
      >
        RESEARCH {open ? "▶" : "◀"}
      </div>
    </>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          fontSize: 8,
          color: "#475569",
          letterSpacing: 2,
          padding: "4px 12px 2px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {label}
      </div>
      <div style={{ padding: "2px 0" }}>{children}</div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 12px",
        gap: 8,
      }}
    >
      <span style={{ color: "#475569", fontSize: 9, flexShrink: 0 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
