import { useState, useCallback } from "react";

const C = {
  bg: "rgba(10,14,26,0.97)",
  border: "rgba(56,189,248,0.35)",
  accent: "#38BDF8",
  dim: "rgba(255,255,255,0.45)",
  row: "rgba(56,189,248,0.07)",
};

function fmtTs(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function fmtAge(ms) {
  if (!ms) return "";
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function GraphTimeScrubber() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [frame, setFrame] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/v1/graph-time/playback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frames: 12 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlayback(data);
      setFrame(data.snapshots?.length ? data.snapshots.length - 1 : 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !playback && !loading) load();
  };

  const snap = playback?.snapshots?.[frame] ?? null;
  const total = playback?.snapshots?.length ?? 0;

  return (
    <>
      {/* Tab button */}
      <div
        onClick={toggle}
        style={{
          position: "fixed",
          left: open ? 340 : 0,
          top: "6%",
          zIndex: 210,
          cursor: "pointer",
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderLeft: open ? `1px solid ${C.border}` : "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 8px 6px 10px",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          fontSize: 10,
          fontFamily: "monospace",
          color: C.accent,
          letterSpacing: "0.08em",
          userSelect: "none",
          transition: "left 0.25s ease",
        }}
      >
        ⏱ TIME
      </div>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -340,
          top: "3%",
          width: 340,
          maxHeight: "66vh",
          zIndex: 209,
          background: C.bg,
          border: `1px solid ${C.border}`,
          borderLeft: "none",
          borderRadius: "0 12px 12px 0",
          display: "flex",
          flexDirection: "column",
          transition: "left 0.25s ease",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: C.accent, fontSize: 12, fontFamily: "monospace", fontWeight: 700 }}>
            ⏱ GRAPH TIME SCRUBBER
          </span>
          {playback && (
            <span style={{ marginLeft: "auto", color: C.dim, fontSize: 10, fontFamily: "monospace" }}>
              {total} frames
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              color: C.accent,
              fontSize: 9,
              fontFamily: "monospace",
              padding: "2px 6px",
              borderRadius: 4,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "LOADING…" : "↺ RELOAD"}
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {error && (
            <div style={{ padding: "10px 14px", color: "#F87171", fontSize: 11, fontFamily: "monospace" }}>
              ⚠ {error}
            </div>
          )}

          {loading && !playback && (
            <div style={{ padding: "14px", color: C.dim, fontSize: 11, fontFamily: "monospace", textAlign: "center" }}>
              LOADING GRAPH HISTORY…
            </div>
          )}

          {playback && !error && (
            <>
              {/* Window info */}
              <div
                style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${C.border}`,
                  fontSize: 10,
                  fontFamily: "monospace",
                  color: C.dim,
                  display: "flex",
                  gap: 12,
                }}
              >
                <span>FROM {fmtTs(playback.t0)}</span>
                <span>TO {fmtTs(playback.t1)}</span>
              </div>

              {/* Scrubber */}
              <div style={{ padding: "12px 14px 8px", borderBottom: `1px solid ${C.border}` }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 6,
                    fontSize: 10,
                    fontFamily: "monospace",
                    color: C.accent,
                  }}
                >
                  <span>FRAME {frame + 1} / {total}</span>
                  <span style={{ color: C.dim }}>{fmtTs(snap?.ts)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={total - 1}
                  value={frame}
                  onChange={(e) => setFrame(Number(e.target.value))}
                  style={{ width: "100%", accentColor: C.accent, cursor: "pointer" }}
                />
                {/* Age label */}
                {snap?.ts && (
                  <div style={{ fontSize: 9, fontFamily: "monospace", color: C.dim, marginTop: 2, textAlign: "right" }}>
                    {fmtAge(snap.ts)}
                  </div>
                )}
              </div>

              {/* Stats row */}
              {snap && (
                <div
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${C.border}`,
                    display: "flex",
                    gap: 20,
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                >
                  <div>
                    <span style={{ color: C.dim }}>NODES </span>
                    <span style={{ color: C.accent, fontWeight: 700 }}>{snap.n_nodes}</span>
                  </div>
                  <div>
                    <span style={{ color: C.dim }}>EDGES </span>
                    <span style={{ color: "#A5F3FC", fontWeight: 700 }}>{snap.n_edges}</span>
                  </div>
                </div>
              )}

              {/* Note */}
              {playback.note && (
                <div
                  style={{
                    padding: "6px 14px",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: "#FBBF24",
                  }}
                >
                  ⚠ {playback.note}
                </div>
              )}

              {/* Node list */}
              {snap && snap.nodes.length === 0 ? (
                <div
                  style={{
                    padding: "14px",
                    color: C.dim,
                    fontSize: 11,
                    fontFamily: "monospace",
                    textAlign: "center",
                  }}
                >
                  NO NODES AT THIS POINT IN TIME
                </div>
              ) : (
                snap &&
                snap.nodes.slice(0, 20).map((node, i) => {
                  const label = node.label || node.name || node.id || "—";
                  const type = node.type || node.kind || "";
                  return (
                    <div
                      key={node.id ?? i}
                      style={{
                        padding: "5px 14px",
                        borderBottom: `1px solid rgba(56,189,248,0.08)`,
                        background: i % 2 === 0 ? "transparent" : C.row,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: "monospace",
                          color: C.dim,
                          minWidth: 18,
                          textAlign: "right",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "monospace",
                          color: "#E0F2FE",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={label}
                      >
                        {label}
                      </span>
                      {type && (
                        <span
                          style={{
                            fontSize: 9,
                            fontFamily: "monospace",
                            color: C.accent,
                            border: `1px solid ${C.border}`,
                            borderRadius: 3,
                            padding: "1px 4px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {type}
                        </span>
                      )}
                    </div>
                  );
                })
              )}

              {snap && snap.nodes.length > 20 && (
                <div
                  style={{
                    padding: "6px 14px",
                    fontSize: 9,
                    fontFamily: "monospace",
                    color: C.dim,
                    textAlign: "center",
                  }}
                >
                  + {snap.nodes.length - 20} more nodes at this frame
                </div>
              )}
            </>
          )}

          {!loading && !playback && !error && (
            <div
              style={{
                padding: "14px",
                color: C.dim,
                fontSize: 11,
                fontFamily: "monospace",
                textAlign: "center",
              }}
            >
              OPEN DRAWER TO LOAD GRAPH HISTORY
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${C.border}`,
            fontSize: 9,
            fontFamily: "monospace",
            color: C.dim,
          }}
        >
          POST /v1/graph-time/playback · 12 frames · knowledge graph growth over time
        </div>
      </div>
    </>
  );
}
