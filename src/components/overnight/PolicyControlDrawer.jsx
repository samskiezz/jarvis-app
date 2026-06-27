import { useState, useEffect, useCallback } from "react";

const ACCENT = "#DC2626";
const POLL_MS = 5 * 60 * 1000;

const LEVEL_META = {
  UNCLASSIFIED: { color: "#22C55E", rank: 0, desc: "Open access" },
  OFFICIAL:     { color: "#EAB308", rank: 1, desc: "Standard sensitivity" },
  SECRET:       { color: "#F97316", rank: 2, desc: "Restricted distribution" },
  TOPSECRET:    { color: "#EF4444", rank: 3, desc: "Highest clearance required" },
};

function rel(ts) {
  if (!ts) return "—";
  const s = Math.floor((Date.now() - ts * 1000) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function PolicyControlDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/v1/jarvis/policy/summary");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setData(j);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
      setFetched(true);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, POLL_MS);
    return () => clearInterval(id);
  }, [fetch_]);

  const levels = data?.levels ?? ["UNCLASSIFIED", "OFFICIAL", "SECRET", "TOPSECRET"];
  const subjects = data?.subjects ?? 0;
  const labels = data?.labels ?? 0;

  const tabStyle = {
    position: "fixed",
    left: open ? 340 : 0,
    top: "64%",
    transform: "translateY(-50%)",
    zIndex: 310,
    background: "#0a0a0f",
    border: `1px solid ${ACCENT}`,
    borderLeft: open ? "none" : `1px solid ${ACCENT}`,
    color: ACCENT,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "6px 4px",
    cursor: "pointer",
    writingMode: "vertical-rl",
    letterSpacing: 1,
    userSelect: "none",
    transition: "left 0.3s",
  };

  const drawerStyle = {
    position: "fixed",
    left: open ? 0 : -340,
    top: 0,
    bottom: 0,
    width: 340,
    zIndex: 309,
    background: "#0a0a0f",
    borderRight: `1px solid ${ACCENT}33`,
    display: "flex",
    flexDirection: "column",
    transition: "left 0.3s",
    fontFamily: "monospace",
  };

  const hdr = {
    padding: "10px 12px 8px",
    borderBottom: `1px solid ${ACCENT}33`,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  };

  const badge = (val, color, title) => (
    <span title={title} style={{
      background: `${color}22`,
      border: `1px solid ${color}55`,
      color,
      fontSize: 9,
      padding: "1px 5px",
      borderRadius: 2,
      fontFamily: "monospace",
    }}>{val}</span>
  );

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={tabStyle}>
        POLICY {open ? "▶" : "◀"}
      </button>

      <div style={drawerStyle}>
        {/* header */}
        <div style={hdr}>
          <span style={{ color: ACCENT, fontSize: 11, fontWeight: 700, flex: 1 }}>
            POLICY CONTROL
          </span>
          {fetched && !err && (
            <>
              {badge(`${subjects} SUBJ`, "#94A3B8", "Registered subjects")}
              {badge(`${labels} LABELS`, "#94A3B8", "Classification labels")}
            </>
          )}
          {loading && <span style={{ color: "#555", fontSize: 9 }}>…</span>}
        </div>

        {/* body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {err ? (
            <div style={{ padding: "12px", color: "#EF4444", fontSize: 10 }}>
              ERR: {err}
            </div>
          ) : (
            <>
              {/* level hierarchy */}
              <div style={{ padding: "4px 12px 8px" }}>
                <div style={{ color: "#555", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                  CLEARANCE HIERARCHY (lowest → highest)
                </div>
                {[...levels].reverse().map((lvl, i) => {
                  const meta = LEVEL_META[lvl] ?? { color: "#64748B", rank: i, desc: "" };
                  return (
                    <div key={lvl} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 0",
                      borderBottom: "1px solid #1a1a2a",
                    }}>
                      <span style={{
                        color: "#444",
                        fontSize: 9,
                        width: 16,
                        textAlign: "right",
                        flexShrink: 0,
                      }}>
                        {levels.length - i}
                      </span>
                      <span style={{
                        background: `${meta.color}22`,
                        border: `1px solid ${meta.color}66`,
                        color: meta.color,
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 2,
                        fontWeight: 700,
                        minWidth: 90,
                        textAlign: "center",
                        flexShrink: 0,
                      }}>
                        {lvl}
                      </span>
                      <span style={{ color: "#666", fontSize: 9, lineHeight: 1.3 }}>
                        {meta.desc}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* counts */}
              {fetched && !err && (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  padding: "8px 12px",
                  borderTop: "1px solid #1a1a2a",
                }}>
                  {[
                    { label: "SUBJECTS", value: subjects, color: "#94A3B8" },
                    { label: "LABELS",   value: labels,   color: "#94A3B8" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{
                      background: "#0d0d1a",
                      border: "1px solid #1a1a2a",
                      borderRadius: 3,
                      padding: "6px 8px",
                    }}>
                      <div style={{ color: "#555", fontSize: 8, letterSpacing: 1 }}>{label}</div>
                      <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* pdp note */}
              <div style={{
                margin: "8px 12px 0",
                padding: "6px 8px",
                background: `${ACCENT}11`,
                border: `1px solid ${ACCENT}33`,
                borderRadius: 3,
                color: "#666",
                fontSize: 9,
                lineHeight: 1.5,
              }}>
                ⚠ ABAC/PBAC Policy Decision Point active. Access decisions enforce clearance
                level ≥ resource level AND compartment membership. Values never exposed via this
                surface.
              </div>
            </>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid ${ACCENT}22`,
          color: "#333",
          fontSize: 8,
          flexShrink: 0,
        }}>
          /v1/jarvis/policy/summary · 5 min poll
        </div>
      </div>
    </>
  );
}
