/**
 * F80 — Report × Dataset Lineage (RDLIN)
 *
 * Parallel-fetches /v1/reports + /v1/datasets every 90 s.
 * Keyword-correlates each report against the dataset catalogue to classify:
 *   SOURCED   — ≥1 dataset keyword-matches this report (data-backed)
 *   UNSOURCED — no dataset backs this report (data lineage gap)
 *
 * Stat tiles:  reports / datasets / sourced / unsourced
 * Filter tabs: ALL | SOURCED | UNSOURCED
 * Text search: across report title / topic / type.
 * Expand row → matched dataset cards with row counts + relevance score bar.
 * Amber badge on UNSOURCED count.
 * ▶ ASSESS: 2-sentence data-lineage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RDLIN  at left:23000 bottom:8, zIndex:82.
 * Event:   jarvis:rdlin-toggle
 * Voice:   "report dataset" / "rdlin" / "sourced reports"
 *          / "unsourced reports" / "report data coverage"
 *          / "dataset backed reports" / "report lineage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 23000;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:    String(r.id ?? r.report_id ?? i),
    title: r.title ?? r.name ?? r.report_name ?? `Report ${i + 1}`,
    type:  r.type ?? r.category ?? r.topic ?? null,
    body:  [r.title, r.name, r.description, r.summary, r.type, r.category, r.topic, r.tags]
             .filter(Boolean).join(" "),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:    String(d.id ?? d.dataset_id ?? i),
    name:  d.name ?? d.title ?? d.dataset_name ?? `Dataset ${i + 1}`,
    rows:  d.row_count ?? d.rows ?? d.count ?? null,
    body:  [d.name, d.title, d.description, d.type, d.category, d.tags, d.source]
             .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [rRes, dRes] = await Promise.all([
    fetch(`${base}/v1/reports`,   { headers: hdr }),
    fetch(`${base}/v1/datasets`,  { headers: hdr }),
  ]);
  return {
    reports:  normaliseReports(rRes.ok  ? await rRes.json() : []),
    datasets: normaliseDatasets(dRes.ok ? await dRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(reports, datasets) {
  return reports.map(report => {
    const kws = buildKeywords([report.title, report.body]);
    const matched = datasets
      .map(d => ({ d, score: scoreMatch(kws, `${d.name} ${d.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...report,
      matched,
      classification: matched.length >= 1 ? "SOURCED" : "UNSOURCED",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const RDLIN_RE =
  /\b(rdlin|report[\s_-]?dataset[s]?|dataset[\s_-]?report[s]?|sourced[\s_-]?report[s]?|unsourced[\s_-]?report[s]?|report[\s_-]?data[\s_-]?coverage|dataset[\s_-]?backed[\s_-]?report[s]?|report[\s_-]?lineage|data[\s_-]?lineage|report[\s_-]?provenance)\b/i;

export function isRdlinQuery(q) { return RDLIN_RE.test(q); }

export async function buildRdlinScript() {
  try {
    const { reports, datasets } = await fetchAll();
    const rows     = correlate(reports, datasets);
    const sourced  = rows.filter(r => r.classification === "SOURCED").length;
    const unsourced = rows.filter(r => r.classification === "UNSOURCED").length;
    const prompt =
      `Report data lineage analysis: ${reports.length} reports cross-referenced against ` +
      `${datasets.length} datasets. ` +
      `${sourced} reports are backed by traceable dataset sources, ` +
      `while ${unsourced} have no dataset lineage — these represent documentation without data provenance. ` +
      `Provide a 2-sentence data governance assessment and flag the most critical reports ` +
      `requiring dataset backing.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:rdlin-toggle"));
    return (
      data.response ?? data.reply ?? data.message ??
      `${sourced} reports sourced, ${unsourced} unsourced across ${datasets.length} datasets.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rdlin-toggle"));
    return "Report dataset lineage panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "SOURCED", "UNSOURCED"];

const FILTER_COLOR = {
  SOURCED:   GREEN,
  UNSOURCED: AMBER,
};

export default function ReportDatasetLineage() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [dsCount,    setDsCount]    = useState(0);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [assessing,  setAssessing]  = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { reports, datasets } = await fetchAll();
      setRows(correlate(reports, datasets));
      setDsCount(datasets.length);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:rdlin-toggle", handler);
    return () => window.removeEventListener("jarvis:rdlin-toggle", handler);
  }, []);

  const handleAssess = useCallback(async (report) => {
    const key = report.id;
    if (assessing === key) return;
    setAssessing(key);
    try {
      const matchedNames = report.matched.map(m => m.d.name).join(", ") || "none";
      const prompt =
        `Report "${report.title}": type ${report.type ?? "unknown"}. ` +
        `Data lineage: ${report.classification}. ` +
        `Matching datasets: ${matchedNames}. ` +
        `In 2 sentences, assess the data provenance quality of this report and recommend ` +
        `which datasets should be explicitly linked to strengthen its lineage.`;
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response ?? data.reply ?? data.message ?? "No assessment available.";
      setAssessText(prev => ({ ...prev, [key]: text }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, [assessing]);

  const sourced   = rows.filter(r => r.classification === "SOURCED").length;
  const unsourced = rows.filter(r => r.classification === "UNSOURCED").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.title.toLowerCase().includes(s) && !r.body.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Dataset Lineage (RDLIN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 82,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ RDLIN
        {unsourced > 0 && (
          <span style={{
            background: AMBER, color: "#0B1420", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700, lineHeight: "14px",
          }}>
            {unsourced}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 200, zIndex: 82,
      width: 430, maxHeight: "70vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 8, display: "flex", flexDirection: "column",
      fontFamily: MONO, overflow: "hidden",
      boxShadow: `0 0 24px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ REPORT × DATASET LINEAGE
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: MUTED,
            cursor: "pointer", fontSize: 12, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
      }}>
        {[
          { label: "REPORTS",   val: rows.length,  color: CY },
          { label: "DATASETS",  val: dsCount,      color: CY },
          { label: "SOURCED",   val: sourced,       color: GREEN },
          { label: "UNSOURCED", val: unsourced,     color: unsourced > 0 ? AMBER : MUTED },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "rgba(10,20,35,0.7)", borderRadius: 5,
            padding: "5px 0", textAlign: "center",
            border: `1px solid ${color}22`,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 7, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 14px",
        borderBottom: `1px solid ${CY}18`,
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              background: filter === f ? `${CY}20` : "none",
              border: `1px solid ${filter === f ? CY : CY + "33"}`,
              color: filter === f ? CY : MUTED,
              borderRadius: 3, padding: "2px 7px", cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${CY}18` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{
            width: "100%", boxSizing: "border-box",
            fontFamily: MONO, fontSize: 9, background: "rgba(10,20,35,0.6)",
            border: `1px solid ${CY}33`, borderRadius: 4,
            color: CY, padding: "3px 8px", outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {loading && rows.length === 0 && (
          <div style={{ color: MUTED, fontSize: 9, padding: "12px 0", textAlign: "center", letterSpacing: 1 }}>
            LOADING…
          </div>
        )}
        {error && (
          <div style={{ color: RED, fontSize: 9, padding: "6px 0" }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 9, padding: "12px 0", textAlign: "center", letterSpacing: 1 }}>
            NO RESULTS
          </div>
        )}
        {filtered.map(report => {
          const isExp    = expanded === report.id;
          const cls      = report.classification;
          const clsColor = FILTER_COLOR[cls] ?? MUTED;
          return (
            <div
              key={report.id}
              onClick={() => setExpanded(isExp ? null : report.id)}
              style={{
                marginBottom: 4, padding: "7px 10px",
                background: "rgba(10,18,30,0.7)", borderRadius: 5,
                border: `1px solid ${clsColor}33`,
                cursor: "pointer", transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: clsColor, flexShrink: 0,
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{report.title}</span>
                {report.type && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8, color: AMBER,
                    border: `1px solid ${AMBER}55`, borderRadius: 3,
                    padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                  }}>
                    {String(report.type).toUpperCase()}
                  </span>
                )}
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: clsColor,
                  border: `1px solid ${clsColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {cls}
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {report.matched.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        BACKED BY DATASETS
                      </div>
                      {report.matched.map(({ d, score }) => (
                        <div key={d.id} style={{
                          marginBottom: 4, padding: "4px 8px",
                          background: "rgba(12,22,36,0.8)", borderRadius: 4,
                          border: `1px solid ${CY}22`,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", marginBottom: 3,
                          }}>
                            <span style={{ color: "#B0D0E0", fontSize: 10 }}>{d.name}</span>
                            {d.rows != null && (
                              <span style={{ color: GREEN, fontSize: 8, letterSpacing: 1 }}>
                                {Number(d.rows).toLocaleString()} rows
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{
                              flex: 1, height: 3, background: `${CY}18`, borderRadius: 2,
                            }}>
                              <div style={{
                                width: `${Math.min(100, score * 10)}%`,
                                height: "100%", background: CY, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9 }}>score {score}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No datasets matched — this report has no data lineage.
                    </div>
                  )}

                  {/* ASSESS button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(report); }}
                    disabled={assessing === report.id}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${CY}18`, border: `1px solid ${CY}44`,
                      color: CY, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === report.id ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === report.id ? "ASSESSING…" : "▶ ASSESS LINEAGE"}
                  </button>

                  {assessText[report.id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${CY}0A`, border: `1px solid ${CY}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[report.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{rows.length} REPORTS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={load}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
