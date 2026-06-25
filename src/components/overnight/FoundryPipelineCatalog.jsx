/**
 * FoundryPipelineCatalog — left-edge slide-in at 10% vertical.
 * Lists JARVIS data-pipeline templates via GET /v1/foundry/pipelines every 5 min.
 * Additive-only; mounts via Layout.jsx.
 */
import { useState, useEffect, useCallback } from "react";

const ACCENT = "#E879F9";
const POLL_MS = 5 * 60 * 1000;

function relAge(ts) {
  if (!ts) return "—";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtSize(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export default function FoundryPipelineCatalog() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/v1/foundry/pipelines");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  return (
    <>
      {/* Tab button */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Foundry Pipeline Catalog"
        style={{
          position: "fixed",
          top: "10%",
          left: open ? 320 : 0,
          zIndex: 120,
          background: open ? ACCENT : "rgba(5,10,18,0.88)",
          border: `1px solid ${ACCENT}55`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "6px 8px",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          color: open ? "#0a0014" : ACCENT,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transition: "left 0.25s, background 0.2s",
          userSelect: "none",
        }}
      >
        FOUNDRY ▶
      </div>

      {/* Slide-in panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: open ? 0 : -320,
          bottom: 0,
          width: 320,
          zIndex: 119,
          background: "rgba(5,8,16,0.97)",
          border: `1px solid ${ACCENT}33`,
          borderLeft: "none",
          boxShadow: open ? `4px 0 32px ${ACCENT}18` : "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: `1px solid ${ACCENT}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: `linear-gradient(90deg, ${ACCENT}11, transparent)`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: ACCENT, fontSize: 11, letterSpacing: 2, flex: 1 }}>
            FOUNDRY PIPELINES
            {items.length > 0 && (
              <span style={{ opacity: 0.7, marginLeft: 6 }}>— {items.length}</span>
            )}
          </span>
          {loading && (
            <span style={{ color: ACCENT, opacity: 0.5, fontSize: 9 }}>LOADING</span>
          )}
          <span
            onClick={() => setOpen(false)}
            style={{
              color: "#4E6070",
              fontSize: 14,
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            ×
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {err && (
            <div
              style={{
                padding: "12px 16px",
                color: "#EF4444",
                fontSize: 10,
                letterSpacing: 1,
              }}
            >
              ERROR: {err}
            </div>
          )}
          {!err && items.length === 0 && !loading && (
            <div
              style={{
                padding: "24px 16px",
                color: "#4E6070",
                fontSize: 10,
                textAlign: "center",
                letterSpacing: 1,
              }}
            >
              NO PIPELINES FOUND
            </div>
          )}
          {items.map((p) => (
            <div key={p.file}>
              <div
                onClick={() =>
                  setExpanded((e) => (e === p.file ? null : p.file))
                }
                style={{
                  padding: "9px 16px",
                  cursor: "pointer",
                  borderBottom: `1px solid ${ACCENT}0F`,
                  background:
                    expanded === p.file ? `${ACCENT}0A` : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      color: ACCENT,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 1,
                      flexShrink: 0,
                      border: `1px solid ${ACCENT}44`,
                      borderRadius: 3,
                      padding: "1px 4px",
                    }}
                  >
                    YAML
                  </span>
                  <span
                    style={{
                      color: "#DCE8F0",
                      fontSize: 11,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.name}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      color: "#4E6070",
                      fontSize: 9,
                      letterSpacing: 0.5,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.file}
                  </span>
                  <span
                    style={{
                      color: "#4E6070",
                      fontSize: 9,
                      letterSpacing: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {fmtSize(p.size)} · {relAge(p.mtime)}
                  </span>
                </div>
              </div>

              {/* Expanded YAML preview */}
              {expanded === p.file && p.preview && (
                <div
                  style={{
                    background: "rgba(0,0,0,0.45)",
                    padding: "10px 16px",
                    borderBottom: `1px solid ${ACCENT}22`,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      color: `${ACCENT}CC`,
                      fontSize: 9,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      lineHeight: 1.6,
                    }}
                  >
                    {p.preview}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 16px",
            borderTop: `1px solid ${ACCENT}1A`,
            color: "#2E4050",
            fontSize: 9,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          GET /v1/foundry/pipelines · 5-min poll
        </div>
      </div>
    </>
  );
}
