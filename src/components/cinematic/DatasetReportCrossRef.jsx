/**
 * DatasetReportCrossRef — F70.
 *
 * Parallel-fetches /v1/datasets + /v1/reports.
 * Keyword-correlates dataset names/descriptions against report titles to
 * surface which intelligence reports are sourced from / relate to each dataset.
 * Helps the operator understand data lineage and report coverage at a glance.
 *
 * Stat tiles: datasets / reports / matched / orphaned (datasets with 0 report links)
 * Filter tabs: ALL / MATCHED / ORPHANED
 * Dataset rows expand to show matched report list.
 * Click ▶ ASSESS on any dataset → /v1/jarvis/agent/chat AI 2-sentence
 *   data-lineage assessment + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "dataset report" / "data report" / "data lineage" / "report dataset" /
 *         "report coverage" / "dsrep"
 *   → jarvis:dsrep-toggle + TTS brief via buildDatasetReportScript()
 *
 * Toggle: ◈ DSREP at left:6004, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const BTN_LEFT = 6004;
const REFRESH_MS = 5 * 60 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisation helpers ────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id: d.id || d.dataset_id || d.name || String(Math.random()),
    name: d.name || d.title || d.label || d.id || "Unnamed dataset",
    description: d.description || d.desc || d.summary || "",
    rowCount: d.row_count ?? d.rows ?? d.count ?? null,
    source: d.source || d.origin || "",
    tags: [...(d.tags || []), ...(d.categories || [])].map(String),
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.label || r.id || "Untitled report",
    summary: r.summary || r.description || r.abstract || r.excerpt || "",
    type: r.type || r.report_type || r.category || "",
    date: r.date || r.created_at || r.updated_at || "",
    tags: [...(r.tags || []), ...(r.categories || [])].map(String),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function datasetKeywords(ds) {
  return new Set([
    ...keywords(ds.name),
    ...keywords(ds.description),
    ...keywords(ds.source),
    ...ds.tags.flatMap(keywords),
  ]);
}

function reportKeywords(rpt) {
  return [
    ...keywords(rpt.title),
    ...keywords(rpt.summary),
    ...rpt.tags.flatMap(keywords),
  ];
}

function matchReportsToDataset(ds, reports) {
  const dsKw = datasetKeywords(ds);
  if (dsKw.size === 0) return [];
  return reports.filter((rpt) => {
    const rKw = reportKeywords(rpt);
    return rKw.some((kw) => dsKw.has(kw));
  });
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isDatasetReportQuery(q) {
  return /dataset.report|data.report|data.lineage|report.dataset|report.coverage|dsrep\b|lineage|data.coverage/i.test(
    q || ""
  );
}

export async function buildDatasetReportScript() {
  try {
    const [dr, rr] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const datasets = normaliseDatasets(dr.ok ? await dr.json() : []);
    const reports = normaliseReports(rr.ok ? await rr.json() : []);
    const matched = datasets.filter(
      (ds) => matchReportsToDataset(ds, reports).length > 0
    );
    const orphaned = datasets.length - matched.length;
    window.dispatchEvent(new CustomEvent("jarvis:dsrep-toggle"));
    return `Dataset-Report Cross-Reference open, sir. Catalogued ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} against ${reports.length} report${reports.length !== 1 ? "s" : ""}. ${matched.length} dataset${matched.length !== 1 ? "s have" : " has"} linked intelligence reports; ${orphaned} remain${orphaned !== 1 ? "" : "s"} unlinked. Click any dataset to inspect matched reports or request an AI lineage assessment, sir.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:dsrep-toggle"));
    return "Opening Dataset-Report Cross-Reference, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function DatasetReportCrossRef() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, rr] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawDatasets = normaliseDatasets(dr.ok ? await dr.json() : []);
      const rawReports = normaliseReports(rr.ok ? await rr.json() : []);
      const enriched = rawDatasets.map((ds) => ({
        ...ds,
        matched: matchReportsToDataset(ds, rawReports),
      }));
      setDatasets(enriched);
      setReports(rawReports);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:dsrep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dsrep-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(ds) {
    setAssessing(ds.id);
    try {
      const rptNames = ds.matched.map((r) => r.title).join(", ") || "none";
      const prompt = `Dataset "${ds.name}" has ${ds.matched.length} linked report${ds.matched.length !== 1 ? "s" : ""}: ${rptNames}. Provide a 2-sentence data-lineage assessment explaining how these reports relate to this dataset.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {}
    setAssessing(null);
  }

  const matched = datasets.filter((ds) => ds.matched.length > 0);
  const orphaned = datasets.filter((ds) => ds.matched.length === 0);
  const filtered =
    tab === "MATCHED" ? matched :
    tab === "ORPHANED" ? orphaned :
    datasets;

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Dataset-Report Cross-Reference (F70)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ DSREP
        {orphaned.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7,
          }}>
            {orphaned.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 65,
          width: "min(540px, 94vw)", maxHeight: "80vh",
          background: "rgba(4,10,20,0.94)",
          border: `1px solid ${CY}33`,
          borderTop: `2px solid ${CY}`,
          borderRadius: 10,
          boxShadow: `0 0 40px ${CY}18`,
          backdropFilter: "blur(12px)",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, fontSize: 12 }}>◈</span>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>DATASET–REPORT CROSS-REFERENCE</span>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#556677",
              cursor: "pointer", fontSize: 14, padding: 0,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>
            {[
              { label: "DATASETS", val: datasets.length, color: CY },
              { label: "REPORTS", val: reports.length, color: "#A78BFA" },
              { label: "MATCHED", val: matched.length, color: GREEN },
              { label: "ORPHANED", val: orphaned.length, color: AMBER },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${t.color}22`, borderRadius: 5,
                padding: "5px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: t.color, fontWeight: 700 }}>
                  {loading ? "…" : t.val}
                </div>
                <div style={{ fontSize: 7, color: "#445566", letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px" }}>
            {["ALL", "MATCHED", "ORPHANED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#04060A" : "#445566",
                border: `1px solid ${tab === t ? CY : "#223344"}`,
                borderRadius: 3, padding: "2px 7px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>
                {t}
                {t === "MATCHED" && matched.length > 0 ? ` (${matched.length})` : ""}
                {t === "ORPHANED" && orphaned.length > 0 ? ` (${orphaned.length})` : ""}
              </button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto", background: "transparent",
              color: "#445566", border: "1px solid #223344",
              borderRadius: 3, padding: "2px 6px", fontSize: 8,
              fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
            }}>↻</button>
          </div>

          {/* dataset list */}
          <div style={{ overflowY: "auto", padding: "0 10px 10px" }}>
            {loading && !datasets.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                loading…
              </div>
            )}
            {!loading && !filtered.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                no datasets in this filter
              </div>
            )}
            {filtered.map((ds) => {
              const hasMatches = ds.matched.length > 0;
              const accent = hasMatches ? GREEN : AMBER;
              const isExpanded = expanded === ds.id;
              return (
                <div key={ds.id} style={{
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${accent}22`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 5, padding: "8px 10px",
                  marginBottom: 6,
                }}>
                  {/* dataset header row */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#b0c8d8", fontSize: 11, marginBottom: 2 }}>{ds.name}</div>
                      {ds.description && (
                        <div style={{ color: "#445566", fontSize: 9, lineHeight: 1.4 }}>
                          {ds.description.slice(0, 100)}{ds.description.length > 100 ? "…" : ""}
                        </div>
                      )}
                      {ds.rowCount !== null && (
                        <div style={{ color: "#334455", fontSize: 8, marginTop: 2 }}>
                          {ds.rowCount.toLocaleString()} rows
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontSize: 10, color: accent, letterSpacing: 1, fontWeight: 700,
                      }}>
                        {hasMatches ? `${ds.matched.length} REPORT${ds.matched.length !== 1 ? "S" : ""}` : "ORPHANED"}
                      </div>
                    </div>
                  </div>

                  {/* action row */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {hasMatches && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : ds.id)}
                        style={{
                          background: `${CY}12`, color: CY,
                          border: `1px solid ${CY}33`,
                          borderRadius: 3, padding: "3px 10px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                          letterSpacing: 1, cursor: "pointer",
                        }}
                      >
                        {isExpanded ? "▾ HIDE" : "▸ REPORTS"}
                      </button>
                    )}
                    <button
                      onClick={() => assess(ds)}
                      disabled={assessing === ds.id}
                      style={{
                        background: assessing === ds.id ? "#1a2530" : `${accent}18`,
                        color: assessing === ds.id ? "#445566" : accent,
                        border: `1px solid ${accent}44`,
                        borderRadius: 3, padding: "3px 10px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        letterSpacing: 1, cursor: assessing === ds.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === ds.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* expanded report list */}
                  {isExpanded && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}15` }}>
                      {ds.matched.map((rpt) => (
                        <div key={rpt.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: `1px solid #1e3040`,
                          borderRadius: 4, padding: "6px 8px",
                          marginBottom: 4,
                        }}>
                          <div style={{ color: "#a0b8cc", fontSize: 10, marginBottom: 2 }}>{rpt.title}</div>
                          {rpt.summary && (
                            <div style={{ color: "#445566", fontSize: 8, lineHeight: 1.4 }}>
                              {rpt.summary.slice(0, 120)}{rpt.summary.length > 120 ? "…" : ""}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                            {rpt.type && (
                              <span style={{
                                fontSize: 7, color: "#A78BFA",
                                border: "1px solid #A78BFA33",
                                borderRadius: 2, padding: "1px 5px",
                              }}>{rpt.type}</span>
                            )}
                            {rpt.date && (
                              <span style={{ fontSize: 7, color: "#334455" }}>
                                {String(rpt.date).slice(0, 10)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
