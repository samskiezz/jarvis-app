import { useState, useEffect, useCallback } from "react";

const ACCENT = "#4ADE80";
const ACCENT_BAD = "#F87171";
const POLL_MS = 60_000;

const COMP_LABELS = {
  history_lake: "History Lake",
  ontology: "Ontology Store",
  science_bridge: "Science Bridge",
  gpu_configured: "GPU (legacy)",
};

function relAge(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.floor((Date.now() / 1000) - ts));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function DeepHealthInspector() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const fetch_ = useCallback(() => {
    setLoading(true);
    fetch("/v1/health/deep")
      .then((r) => r.json())
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(e.message || "fetch error"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    const id = setInterval(fetch_, POLL_MS);
    return () => clearInterval(id);
  }, [open, fetch_]);

  const accent = !data ? ACCENT : data.ok ? ACCENT : ACCENT_BAD;

  const tab = {
    position: "fixed",
    left: open ? 340 : 0,
    top: "47%",
    transform: "translateY(-50%)",
    zIndex: 180,
    background: "#0f172a",
    border: `1px solid ${accent}`,
    borderLeft: open ? "none" : `1px solid ${accent}`,
    color: accent,
    fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    fontSize: 11,
    letterSpacing: 1,
    padding: "10px 6px",
    cursor: "pointer",
    writingMode: "vertical-rl",
    textOrientation: "mixed",
    userSelect: "none",
    transition: "left 0.2s",
    borderRadius: open ? "0 4px 4px 0" : "4px",
  };

  const panel = {
    position: "fixed",
    left: 0,
    top: "47%",
    transform: "translateY(-50%)",
    width: 340,
    maxHeight: "60vh",
    overflowY: "auto",
    background: "#0b1120",
    border: `1px solid ${accent}`,
    borderRight: "none",
    zIndex: 179,
    fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    fontSize: 11,
    color: "#94a3b8",
    display: open ? "flex" : "none",
    flexDirection: "column",
  };

  const badge = (ok, trueLabel = "PASS", falseLabel = "FAIL") => (
    <span style={{
      background: ok ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
      color: ok ? ACCENT : ACCENT_BAD,
      border: `1px solid ${ok ? ACCENT : ACCENT_BAD}`,
      borderRadius: 3,
      fontSize: 10,
      padding: "1px 5px",
      letterSpacing: 1,
      flexShrink: 0,
    }}>{ok ? trueLabel : falseLabel}</span>
  );

  const components = data?.components || {};
  const gpuCompute = components.gpu_compute || {};
  const simpleKeys = ["history_lake", "ontology", "science_bridge", "gpu_configured"];

  return (
    <>
      <button style={tab} onClick={() => setOpen((v) => !v)} title="Deep Component Health">
        {open ? "◀" : "◉"} DEEP
      </button>

      <div style={panel}>
        {/* header */}
        <div style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid rgba(148,163,184,0.12)`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
          position: "sticky",
          top: 0,
          background: "#0b1120",
          zIndex: 1,
        }}>
          <span style={{ color: "#e2e8f0", letterSpacing: 1, fontWeight: 700 }}>DEEP HEALTH</span>
          {loading && <span style={{ opacity: 0.5, fontSize: 10 }}>updating…</span>}
          <div style={{ flex: 1 }} />
          {data && badge(data.ok, "ALL HEALTHY", "DEGRADED")}
        </div>

        {/* error */}
        {err && !data && (
          <div style={{ padding: "10px 12px", color: ACCENT_BAD, fontSize: 10 }}>
            ⚠ {err}
          </div>
        )}

        {/* no data yet */}
        {!data && !err && !loading && (
          <div style={{ padding: "10px 12px", opacity: 0.4 }}>Fetching…</div>
        )}

        {/* simple boolean components */}
        {data && (
          <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
            {simpleKeys.map((key) => {
              const val = components[key];
              const isBool = typeof val === "boolean";
              return (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: (isBool ? val : false) ? ACCENT : ACCENT_BAD,
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, color: "#cbd5e1", letterSpacing: 0.5 }}>
                    {COMP_LABELS[key] || key}
                  </span>
                  {isBool && badge(val)}
                </div>
              );
            })}

            {/* gpu_compute detail */}
            <div style={{
              borderTop: `1px solid rgba(148,163,184,0.1)`,
              marginTop: 4,
              paddingTop: 8,
            }}>
              <div style={{ color: "#64748b", fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>
                GPU COMPUTE TIER
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: gpuCompute.configured ? ACCENT : "#475569",
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, color: "#cbd5e1" }}>Configured</span>
                  {badge(!!gpuCompute.configured, "YES", "NO")}
                </div>
                {gpuCompute.status && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: gpuCompute.status.ok ? ACCENT : ACCENT_BAD,
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: "#cbd5e1" }}>Status</span>
                    {badge(!!gpuCompute.status.ok, "OK", "DOWN")}
                  </div>
                )}
                {gpuCompute.status?.reason && (
                  <div style={{ fontSize: 10, color: "#64748b", paddingLeft: 16 }}>
                    {gpuCompute.status.reason}
                  </div>
                )}
                {gpuCompute.status?.url && (
                  <div style={{ fontSize: 10, color: "#475569", paddingLeft: 16,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {gpuCompute.status.url}
                  </div>
                )}
                {gpuCompute.status?.checked_at > 0 && (
                  <div style={{ fontSize: 10, color: "#475569", paddingLeft: 16 }}>
                    checked {relAge(gpuCompute.status.checked_at)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid rgba(148,163,184,0.08)`,
          fontSize: 10,
          color: "#475569",
          flexShrink: 0,
        }}>
          GET /v1/health/deep · {POLL_MS / 1000}s poll
        </div>
      </div>
    </>
  );
}
