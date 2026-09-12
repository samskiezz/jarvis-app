/**
 * DatasetReportCoverage — F78 (DRIC)
 *
 * Parallel-fetches /v1/datasets + /v1/reports every 90 s.
 * Keyword-correlates each dataset against the report catalog.
 * Classification: REPORTED (≥1 matching report) vs UNANALYZED (0 reports cover it).
 * Amber badge on unanalyzed count.
 *
 * Voice intents: "dataset report / report dataset / dric / analyzed datasets /
 *                unanalyzed datasets / dataset analysis coverage / which datasets have reports /
 *                dataset coverage / report dataset coverage / data analysis gap"
 * Strip button: ◈ DRIC  left:2160 bottom:18 zIndex:68
 * Custom event: jarvis:dric-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const DRIC_RE =
  /\b(dataset.report|report.dataset|dric|analyzed.dataset|unanalyzed.dataset|dataset.analysis.cover|which.dataset.*report|dataset.cover|report.dataset.cover|data.analysis.gap|data.report.cover|dataset.analyt|dataset.report.gap|report.coverage.dataset)\b/i;

export function isDricQuery(t) { return DRIC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(dataset, report) {
  const a = tokenize([
    dataset.name, dataset.description, dataset.source, dataset.category,
    (dataset.tags || []).join(" "),
  ].join(" "));
  const b = tokenize([
    report.title, report.body, report.type, report.topic,
    (report.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [dr, rr] = await Promise.all([
    fetch(`${base}/v1/datasets`,  { headers: hdrs }),
    fetch(`${base}/v1/reports`,   { headers: hdrs }),
  ]);
  const dd = dr.ok ? await dr.json() : {};
  const rd = rr.ok ? await rr.json() : {};

  const datasets = (Array.isArray(dd) ? dd : dd?.data || dd?.items || dd?.results || dd?.datasets || []).map(d => ({
    id:          d.id || d._id || String(Math.random()),
    name:        d.name || d.title || "Unnamed Dataset",
    description: d.description || d.summary || "",
    source:      d.source || d.origin || "",
    category:    d.category || d.type || "",
    tags:        d.tags || [],
    rows:        d.rows ?? d.row_count ?? d.count ?? null,
  }));

  const reports = (Array.isArray(rd) ? rd : rd?.data || rd?.items || rd?.results || rd?.reports || []).map(r => ({
    id:    r.id || r._id || String(Math.random()),
    title: r.title || r.name || "Untitled Report",
    body:  r.body || r.content || r.summary || "",
    type:  r.type || r.report_type || "",
    topic: r.topic || r.category || "",
    tags:  r.tags || [],
  }));

  return { datasets, reports };
}

export async function buildDricScript() {
  try {
    const { datasets, reports } = await fetchAll();
    if (!datasets.length) return "No datasets found for report coverage analysis, sir.";
    const unanalyzed = datasets.filter(d =>
      !reports.some(r => relevance(d, r) > 0.03)
    );
    const reported = datasets.length - unanalyzed.length;
    return (
      `Dataset × Report Coverage: ${datasets.length} datasets checked against ${reports.length} reports. ` +
      `${reported} REPORTED (covered by at least one report), ${unanalyzed.length} UNANALYZED (no report coverage). ` +
      (unanalyzed.length
        ? `Unanalyzed datasets include: ${unanalyzed.slice(0, 3).map(d => `"${d.name}"`).join(", ")}. ` +
          `Summarise the dataset analysis coverage gap in exactly 2 sentences and recommend priority reporting actions.`
        : "All datasets have matching report coverage. Excellent analytical coverage, sir.")
    );
  } catch {
    return "Unable to retrieve dataset report coverage data at this time, sir.";
  }
}

export default function DatasetReportCoverage() {
  const [open, setOpen]       = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [reports, setReports] = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessed, setAssessed] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { datasets: ds, reports: rs } = await fetchAll();
      setDatasets(ds);
      setReports(rs);
      const cor = ds.map(d => {
        const matched = rs
          .map(r => ({ ...r, score: relevance(d, r) }))
          .filter(r => r.score > 0.03)
          .sort((a, b) => b.score - a.score);
        return { ...d, matched, status: matched.length ? "REPORTED" : "UNANALYZED" };
      });
      setCorrelated(cor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => { if (!o) load(); return !o; });
    };
    window.addEventListener("jarvis:dric-toggle", toggle);
    return () => window.removeEventListener("jarvis:dric-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildDricScript();
      setAssessed(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  const visible = correlated.filter(d => {
    if (filter === "REPORTED"   && d.status !== "REPORTED")   return false;
    if (filter === "UNANALYZED" && d.status !== "UNANALYZED") return false;
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const reported   = correlated.filter(d => d.status === "REPORTED").length;
  const unanalyzed = correlated.filter(d => d.status === "UNANALYZED").length;

  const PANEL = {
    position: "fixed", bottom: 58, left: 2160, zIndex: 69,
    width: 440, maxHeight: "70vh", display: "flex", flexDirection: "column",
    background: "linear-gradient(160deg,#06111B 80%,#0B1D2A)",
    border: `1px solid ${CY}44`, borderRadius: 10,
    boxShadow: `0 0 32px ${CY}22`, fontFamily: "'JetBrains Mono',monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed", left: 2160, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "transparent",
          border: `1px solid ${CY}55`, borderRadius: 5,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1.5, padding: "3px 9px",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ DRIC
        {unanalyzed > 0 && (
          <span style={{
            background: AMB, color: "#000", borderRadius: 3,
            fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{unanalyzed}</span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 10, color: CY, letterSpacing: 2, fontWeight: 700 }}>
              DATASET × REPORT COVERAGE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              fontSize: 12, cursor: "pointer",
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "DATASETS", val: correlated.length, col: CY },
              { label: "REPORTS",  val: reports.length,    col: "#B485FF" },
              { label: "REPORTED", val: reported,           col: GRN },
              { label: "UNANALYZD", val: unanalyzed,        col: AMB },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}0D`, border: `1px solid ${col}33`,
                borderRadius: 6, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 7, color: "#566878", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            flexWrap: "wrap",
          }}>
            {["ALL", "REPORTED", "UNANALYZED"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 3, letterSpacing: 1,
                border: `1px solid ${filter === f ? CY : "#2A3D4F"}`,
                background: filter === f ? `${CY}22` : "transparent",
                color: filter === f ? CY : "#566878", cursor: "pointer", fontFamily: "inherit",
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", fontSize: 8, background: "#0B1D2A",
                border: `1px solid ${CY}33`, borderRadius: 3, color: CY,
                padding: "2px 7px", fontFamily: "inherit", outline: "none", width: 100,
              }}
            />
          </div>

          {/* Dataset rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && !correlated.length && (
              <div style={{ color: AMB, fontSize: 9, textAlign: "center", padding: 20 }}>
                ◌ loading…
              </div>
            )}
            {visible.map(d => {
              const isExp = expanded === d.id;
              const col = d.status === "REPORTED" ? GRN : AMB;
              return (
                <div key={d.id} style={{
                  borderBottom: `1px solid ${CY}11`, padding: "7px 0",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : d.id)}
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                  >
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                      animation: d.status === "UNANALYZED" ? "dricpulse 2s infinite" : "none",
                    }}>{d.status}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{d.name}</span>
                    {d.category && (
                      <span style={{
                        fontSize: 7, color: "#B485FF", border: "1px solid #B485FF44",
                        borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                      }}>{d.category.toUpperCase()}</span>
                    )}
                    {d.rows != null && (
                      <span style={{ color: "#566878", fontSize: 8, flexShrink: 0 }}>
                        {d.rows.toLocaleString()} rows
                      </span>
                    )}
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {d.description && (
                        <div style={{ color: "#8BAABB", fontSize: 8, marginBottom: 6, lineHeight: 1.5 }}>
                          {d.description.slice(0, 160)}{d.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {d.matched.length === 0 ? (
                        <div style={{ color: AMB, fontSize: 8 }}>No matching reports found.</div>
                      ) : (
                        d.matched.slice(0, 5).map(r => (
                          <div key={r.id} style={{
                            background: `${GRN}08`, border: `1px solid ${GRN}22`,
                            borderRadius: 5, padding: "5px 8px", marginBottom: 5,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              {r.type && (
                                <span style={{
                                  fontSize: 7, color: "#B485FF",
                                  border: "1px solid #B485FF44",
                                  borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                                }}>{r.type.toUpperCase()}</span>
                              )}
                              <span style={{
                                flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{r.title}</span>
                              <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                                {(r.score * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                              <div style={{
                                height: 3, borderRadius: 2,
                                width: `${Math.min(100, r.score * 100)}%`,
                                background: GRN, boxShadow: `0 0 6px ${GRN}`,
                              }} />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /v1/datasets + /v1/reports
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${correlated.length} datasets · ${reports.length} reports`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes dricpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
