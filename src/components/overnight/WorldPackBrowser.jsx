import { useState, useEffect, useRef, useCallback } from "react";

const ACC = "#10B981"; // emerald
const PANEL_W = 320;

const NEURON_COLORS = {
  ingestion: "#22D3EE",
  analysis: "#A78BFA",
  synthesis: "#F59E0B",
  monitoring: "#22C55E",
  prediction: "#F97316",
  storage: "#64748B",
};

function fmtCount(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return String(n);
}

export default function WorldPackBrowser() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("");
  const hasFetched = useRef(false);

  const load = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    setErr(null);
    Promise.all([
      fetch("/v1/jarvis/world/summary").then((r) => r.json()),
      fetch("/v1/jarvis/world/subjects?limit=100").then((r) => r.json()),
    ])
      .then(([sum, subs]) => {
        setSummary(sum);
        setSubjects(subs.subjects || []);
      })
      .catch((e) => {
        setErr(e.message);
        hasFetched.current = false;
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const filtered = filter.trim()
    ? subjects.filter(
        (s) =>
          (s.domain_subject || "").toLowerCase().includes(filter.toLowerCase()) ||
          (s.master_topic || "").toLowerCase().includes(filter.toLowerCase())
      )
    : subjects;

  const available = summary?.available ?? null;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? PANEL_W : 0, top: "3%",
          zIndex: 220, cursor: "pointer",
          background: open ? ACC : "rgba(15,23,42,0.85)",
          border: `1px solid ${open ? ACC : "rgba(16,185,129,0.3)"}`,
          borderRight: open ? "none" : undefined,
          borderRadius: "6px 0 0 6px",
          padding: "10px 5px", writingMode: "vertical-rl",
          fontFamily: "monospace", fontSize: 9, letterSpacing: 2,
          color: open ? "#0F172A" : ACC, fontWeight: 700,
          userSelect: "none", transition: "right 0.28s",
        }}
      >
        WORLD {open ? "▶" : "◀"}
      </div>

      {/* Panel */}
      <div style={{
        position: "fixed", right: open ? 0 : -PANEL_W, top: "0%",
        width: PANEL_W, maxHeight: "90vh", zIndex: 219,
        background: "rgba(8,12,24,0.97)",
        border: `1px solid rgba(16,185,129,0.25)`,
        borderRight: "none", borderRadius: "8px 0 0 8px",
        display: "flex", flexDirection: "column",
        transition: "right 0.28s ease",
        backdropFilter: "blur(12px)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid rgba(16,185,129,0.2)`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: ACC, letterSpacing: 2, fontWeight: 700 }}>
              ◈ WORLD PACK
            </span>
            {available !== null && (
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 3, marginLeft: 8,
                background: available ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                color: available ? ACC : "#EF4444",
                fontFamily: "monospace", letterSpacing: 1,
              }}>
                {available ? "LOADED" : "UNAVAILABLE"}
              </span>
            )}
          </div>
          <button
            onClick={() => { hasFetched.current = false; load(); }}
            style={{
              background: "none", border: `1px solid rgba(16,185,129,0.3)`,
              color: ACC, borderRadius: 4, padding: "2px 8px",
              fontFamily: "monospace", fontSize: 9, cursor: "pointer",
            }}
          >
            ↻
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "10px 14px", overflowY: "auto", flex: 1 }}>
          {err && (
            <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "monospace", marginBottom: 8 }}>
              ERROR: {err}
            </div>
          )}

          {loading && !summary && (
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>Loading…</div>
          )}

          {summary && (
            <>
              {/* Summary tiles */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                {[
                  { label: "FAMILIES", value: fmtCount(summary.families) },
                  { label: "SUBJECTS", value: fmtCount(summary.subjects) },
                  { label: "ENDPOINTS", value: fmtCount(summary.endpoints) },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    flex: 1, textAlign: "center", padding: "6px 0",
                    background: "rgba(16,185,129,0.08)", borderRadius: 4,
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}>
                    <div style={{ fontSize: 14, color: ACC, fontFamily: "monospace", fontWeight: 700 }}>{value}</div>
                    <div style={{ fontSize: 8, color: "#64748B", letterSpacing: 1, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Filter */}
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter subjects…"
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: 4, padding: "4px 8px",
                  color: "#CBD5E1", fontFamily: "monospace", fontSize: 10,
                  outline: "none", marginBottom: 8,
                }}
              />

              <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1, marginBottom: 4 }}>
                {filtered.length}/{subjects.length} SUBJECTS
              </div>

              {/* Subjects list */}
              {filtered.map((s, i) => {
                const nc = NEURON_COLORS[s.neuron_type] || "#64748B";
                return (
                  <div key={s.subject_id || i} style={{
                    padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "flex-start", gap: 6,
                  }}>
                    <span style={{
                      fontSize: 8, padding: "1px 4px", borderRadius: 3, flexShrink: 0, marginTop: 2,
                      background: `${nc}22`, color: nc,
                      fontFamily: "monospace", letterSpacing: 1,
                    }}>
                      {(s.neuron_type || "gen").toUpperCase().slice(0, 5)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 10, color: "#CBD5E1",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {s.domain_subject || s.subject_id}
                      </div>
                      <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace" }}>
                        {s.master_topic || "—"}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div style={{
                  fontSize: 10, color: "#475569", fontFamily: "monospace",
                  textAlign: "center", paddingTop: 16,
                }}>
                  No subjects match
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
