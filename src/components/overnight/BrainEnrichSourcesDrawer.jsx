import { useEffect, useReducer, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 300_000;
const DRAWER_W = 320;
const ACCENT = "#0EA5E9";

const KIND_COLOR = {
  encyclopedia: "#22D3EE",
  "knowledge-base": "#60A5FA",
  lexical: "#A78BFA",
  geographic: "#4ADE80",
  economic: "#FBBF24",
  bibliographic: "#FB923C",
  research: "#38BDF8",
  biomedical: "#F472B6",
};

function kindColor(k) {
  return KIND_COLOR[k] || "#94A3B8";
}

export default function BrainEnrichSourcesDrawer() {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [probe, setProbe] = useState(null);
  const [probing, setProbing] = useState(false);
  const [err, setErr] = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/brain/sources")
      .then((d) => {
        if (alive) { setCatalog(d); setErr(false); }
      })
      .catch(() => { if (alive) setErr(true); });
    const timer = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, tick]);

  function runProbe() {
    if (probing) return;
    setProbing(true);
    kimiClient
      .request("/v1/brain/sources/probe")
      .then((d) => { setProbe(d); })
      .catch(() => { setProbe(null); })
      .finally(() => setProbing(false));
  }

  const sources = catalog?.sources || [];
  const onlineMap = probe?.sources || {};

  return (
    <>
      {/* slide-in panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -DRAWER_W,
          top: 0,
          width: DRAWER_W,
          height: "100vh",
          background: S.bg || "rgba(10,14,26,0.97)",
          borderRight: `1px solid ${S.border || "rgba(255,255,255,0.08)"}`,
          backdropFilter: S.blur || "blur(14px)",
          zIndex: 8997,
          display: "flex",
          flexDirection: "column",
          transition: "left 0.28s cubic-bezier(.4,0,.2,1)",
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
          <span style={{ color: ACCENT, fontSize: S.fs?.xs || 11, fontWeight: 700, letterSpacing: 1.5 }}>
            ENRICHMENT SOURCES
          </span>
          {catalog && (
            <span
              style={{
                marginLeft: "auto",
                background: ACCENT,
                color: "#000",
                borderRadius: 4,
                fontSize: S.fs?.xxs || 9,
                fontWeight: 700,
                padding: "1px 6px",
              }}
            >
              {catalog.count}
            </span>
          )}
          {probe && (
            <span
              style={{
                background: probe.online === probe.total ? "#4ADE80" : "#FBBF24",
                color: "#000",
                borderRadius: 4,
                fontSize: S.fs?.xxs || 9,
                fontWeight: 700,
                padding: "1px 6px",
              }}
            >
              {probe.online}/{probe.total} ONLINE
            </span>
          )}
        </div>

        {/* probe button */}
        <div style={{ padding: "6px 12px", borderBottom: `1px solid ${S.border || "rgba(255,255,255,0.05)"}` }}>
          <button
            onClick={runProbe}
            disabled={probing}
            style={{
              background: probing ? "rgba(14,165,233,0.15)" : "rgba(14,165,233,0.22)",
              color: ACCENT,
              border: `1px solid ${ACCENT}`,
              borderRadius: 4,
              fontSize: S.fs?.xxs || 9,
              fontWeight: 700,
              padding: "3px 10px",
              cursor: probing ? "not-allowed" : "pointer",
              letterSpacing: 1,
            }}
          >
            {probing ? "PROBING…" : "PROBE LIVE"}
          </button>
        </div>

        {/* source list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
          {err && (
            <div style={{ color: "#F87171", fontSize: S.fs?.xs || 11, padding: "12px 14px" }}>
              /v1/brain/sources unreachable
            </div>
          )}
          {!err && sources.length === 0 && (
            <div style={{ color: S.text || "rgba(255,255,255,0.3)", fontSize: S.fs?.xs || 11, padding: "12px 14px" }}>
              loading…
            </div>
          )}
          {sources.map((src) => {
            const status = onlineMap[src.name];
            const hasProbe = probe !== null;
            return (
              <div
                key={src.name}
                style={{
                  padding: "6px 12px",
                  borderBottom: `1px solid ${S.border || "rgba(255,255,255,0.04)"}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {hasProbe && (
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: status ? "#4ADE80" : "#F87171",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span style={{ color: S.textHi || "#fff", fontSize: S.fs?.xs || 11, fontWeight: 600 }}>
                    {src.name}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      background: kindColor(src.kind),
                      color: "#000",
                      borderRadius: 3,
                      fontSize: S.fs?.xxs || 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {src.kind}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: S.text || "rgba(255,255,255,0.4)", fontSize: S.fs?.xxs || 9 }}>
                    {src.license}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "rgba(255,255,255,0.25)",
                      fontSize: S.fs?.xxs || 9,
                    }}
                  >
                    P{src.priority}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${S.border || "rgba(255,255,255,0.07)"}`,
            fontSize: S.fs?.xxs || 9,
            color: S.text || "rgba(255,255,255,0.3)",
            display: "flex",
            gap: 8,
          }}
        >
          <span style={{ color: ACCENT }}>●</span>
          LIVE · 5 MIN POLL
        </div>
      </div>

      {/* tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed",
          left: open ? DRAWER_W : 0,
          top: "3%",
          zIndex: 9000,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          background: "rgba(10,14,26,0.92)",
          border: `1px solid ${ACCENT}`,
          borderLeft: "none",
          borderRadius: "0 4px 4px 0",
          color: ACCENT,
          fontSize: S.fs?.xxs || 9,
          fontWeight: 700,
          letterSpacing: 1.5,
          padding: "8px 4px",
          cursor: "pointer",
          userSelect: "none",
          transition: "left 0.28s cubic-bezier(.4,0,.2,1)",
        }}
      >
        SRCS {open ? "▶" : "◀"}
      </div>
    </>
  );
}
