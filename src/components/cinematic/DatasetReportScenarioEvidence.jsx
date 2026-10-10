/**
 * F175 — Dataset × Report × Scenario — Evidence Library Audit (EVLIB)
 *
 * Parallel-fetches /v1/datasets + /v1/reports + /v1/scenario/list every 90 s.
 * Keyword-correlates each dataset against the report archive AND active scenarios:
 *
 *   FULLY_EVIDENCED — cited in ≥1 report AND used in ≥1 scenario
 *   REPORT_CITED    — cited in a report but no scenario coverage
 *   SCENARIO_USED   — referenced in a scenario but no formal report
 *   UNUSED          — neither — a dataset with no documented evidence or operational use
 *
 * Stat tiles: datasets / reports / scenarios / fully evidenced / unused
 * Filter tabs: ALL | FULLY_EVIDENCED | REPORT_CITED | SCENARIO_USED | UNUSED
 * Text search on dataset name / type / description.
 * Expand row → matched reports (amber bars) + matched scenarios (cyan bars).
 * Orange badge + pulse on UNUSED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence library readiness brief + TTS.
 *
 * Toggle:  ◈ EVLIB  at bottom:8 left:969940, zIndex:676.
 * Event:   jarvis:evlib-toggle
 * Voice:   "evlib / evidence library / dataset report scenario / unused dataset /
 *           evidence library audit / dataset evidence / report dataset / scenario dataset /
 *           dataset coverage / evidence audit"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 969_940;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const EVLIB_RE =
  /\b(evlib|evidence\s+library|dataset\s+report\s+scenario|unused\s+dataset|evidence\s+library\s+audit|dataset\s+evidence|report\s+dataset|scenario\s+dataset|dataset\s+coverage|evidence\s+audit)\b/i;

export function isEvlibQuery(q) { return EVLIB_RE.test(q || ""); }

export async function buildEvlibScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dsRes, rptRes, scRes] = await Promise.all([
      fetch(`${base}/v1/datasets`,       { headers: hdr }),
      fetch(`${base}/v1/reports`,        { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
    ]);
    const datasets  = normArr(await dsRes.json(),  ["datasets","data","items","results"]);
    const reports   = normArr(await rptRes.json(),  ["reports","data","items","results"]);
    const scenarios = normArr(await scRes.json(),   ["scenarios","data","items","results"]);

    const rows    = classifyDatasets(datasets, reports, scenarios);
    const unused  = rows.filter((r) => r.cls === "UNUSED").length;
    const fullyEv = rows.filter((r) => r.cls === "FULLY_EVIDENCED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS evidence library audit (EVLIB): ${datasets.length} datasets cross-referenced ` +
          `against ${reports.length} reports and ${scenarios.length} active scenarios — ` +
          `${fullyEv} fully evidenced (report + scenario), ${unused} unused (no report or scenario coverage). ` +
          `Give a 2-sentence evidence library readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Evidence library audit complete.";
  } catch (e) {
    return `Evidence library audit error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(dsToks, candidate) {
  const candToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.type || ""} ${candidate.category || ""} ${candidate.tags || ""}`
  );
  return dsToks.some((t) => candToks.includes(t));
}

function classifyDatasets(datasets, reports, scenarios) {
  return datasets.map((ds) => {
    const dsToks = tokens(
      `${ds.name || ""} ${ds.title || ""} ${ds.description || ""} ` +
      `${ds.type || ""} ${ds.category || ""} ${ds.tags || ""}`
    );
    const matchedReports   = reports.filter((r)   => hasOverlap(dsToks, r));
    const matchedScenarios = scenarios.filter((s) => hasOverlap(dsToks, s));
    const hasReport   = matchedReports.length   > 0;
    const hasScenario = matchedScenarios.length > 0;
    let cls = "UNUSED";
    if (hasReport && hasScenario) cls = "FULLY_EVIDENCED";
    else if (hasReport)           cls = "REPORT_CITED";
    else if (hasScenario)         cls = "SCENARIO_USED";
    return { ds, cls, matchedReports, matchedScenarios };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY  = "#29E7FF";
const GR  = "#2ECC71";
const AM  = "#F39C12";
const OR  = "#E67E22";

const CLS_COLOR = {
  FULLY_EVIDENCED: GR,
  REPORT_CITED:    AM,
  SCENARIO_USED:   CY,
  UNUSED:          OR,
};

const TABS = ["ALL", "FULLY_EVIDENCED", "REPORT_CITED", "SCENARIO_USED", "UNUSED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DatasetReportScenarioEvidence() {
  const [visible,       setVisible]       = useState(false);
  const [rows,          setRows]          = useState([]);
  const [dsCnt,         setDsCnt]         = useState(0);
  const [rptCnt,        setRptCnt]        = useState(0);
  const [scenarioCnt,   setScenarioCnt]   = useState(0);
  const [tab,           setTab]           = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [answer,        setAnswer]        = useState("");
  const [loading,       setLoading]       = useState(false);
  const [assessing,     setAssessing]     = useState(false);
  const timer = useRef(null);

  const unusedCount = rows.filter((r) => r.cls === "UNUSED").length;
  const fullCount   = rows.filter((r) => r.cls === "FULLY_EVIDENCED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dsRes, rptRes, scRes] = await Promise.all([
        fetch(`${base}/v1/datasets`,      { headers: hdr }),
        fetch(`${base}/v1/reports`,       { headers: hdr }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      const datasets  = normArr(await dsRes.json(),  ["datasets","data","items","results"]);
      const reports   = normArr(await rptRes.json(),  ["reports","data","items","results"]);
      const scenarios = normArr(await scRes.json(),   ["scenarios","data","items","results"]);
      setDsCnt(datasets.length);
      setRptCnt(reports.length);
      setScenarioCnt(scenarios.length);
      setRows(classifyDatasets(datasets, reports, scenarios));
    } catch (_) { /* silent — panel stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:evlib-toggle", toggle);
    return () => window.removeEventListener("jarvis:evlib-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildEvlibScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const ds = r.ds;
    return (
      String(ds.name        || "").toLowerCase().includes(q) ||
      String(ds.title       || "").toLowerCase().includes(q) ||
      String(ds.type        || "").toLowerCase().includes(q) ||
      String(ds.description || "").toLowerCase().includes(q)
    );
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const S = {
    overlay: {
      position: "fixed", inset: 0, background: "rgba(0,8,16,.72)",
      zIndex: 9400, display: "flex", alignItems: "center", justifyContent: "center",
    },
    panel: {
      background: "#060e18", border: "1px solid #1a3a50",
      borderRadius: 10, width: "min(900px,95vw)", maxHeight: "88vh",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 60px #E67E2222",
    },
    header: {
      padding: "12px 18px", borderBottom: "1px solid #1a2e3a",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    title: { color: OR, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 3 },
    close: {
      background: "none", border: "none", color: "#3a5a6a",
      fontSize: 14, cursor: "pointer", padding: "0 4px",
    },
    tiles: { display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" },
    tile: (col) => ({
      flex: "1 1 90px", background: `${col}0d`, border: `1px solid ${col}33`,
      borderRadius: 6, padding: "8px 12px", textAlign: "center",
    }),
    tileVal: (col) => ({
      color: col, fontFamily: "'JetBrains Mono',monospace",
      fontSize: 18, fontWeight: 700, lineHeight: 1,
    }),
    tileLabel: { color: "#3a5a6a", fontSize: 8, letterSpacing: 2, marginTop: 4 },
    tabs: {
      display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap",
    },
    tabBtn: (active) => ({
      background: active ? "#0d2030" : "none",
      border: `1px solid ${active ? "#2a6a8a" : "#1a2e3a"}`,
      color: active ? CY : "#3a5a6a",
      borderRadius: 4, padding: "4px 10px", fontSize: 9,
      letterSpacing: 2, cursor: "pointer",
    }),
    search: {
      margin: "0 18px 8px", padding: "6px 10px",
      background: "#0a1520", border: "1px solid #1a2e3a",
      borderRadius: 5, color: "#80b0c8", fontSize: 10,
      outline: "none",
    },
    list: { flex: 1, overflowY: "auto", padding: "0 18px 8px" },
    row: (col) => ({
      border: `1px solid ${col}22`, borderRadius: 6, marginBottom: 6,
      padding: "8px 12px", cursor: "pointer",
      background: `${col}08`, transition: "background .2s",
    }),
    rowHead: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    rowName: {
      color: "#b0d0e8", fontFamily: "'JetBrains Mono',monospace",
      fontSize: 10, letterSpacing: 1,
    },
    clsBadge: (col) => ({
      background: `${col}22`, border: `1px solid ${col}55`,
      color: col, borderRadius: 3, padding: "1px 7px",
      fontSize: 8, letterSpacing: 2,
    }),
    expand: {
      marginTop: 10, display: "flex", gap: 16,
      borderTop: "1px solid #1a2e3a", paddingTop: 10,
    },
    subCol: { flex: 1, minWidth: 200 },
    subTitle: { color: "#4a6a7a", fontSize: 9, letterSpacing: 2, marginBottom: 4 },
    bar: (col) => ({
      height: 14, background: `${col}22`, borderRadius: 3,
      marginBottom: 3, overflow: "hidden", position: "relative",
    }),
    barFill: (col, pct) => ({
      width: `${Math.min(pct, 100)}%`, height: "100%",
      background: `${col}66`, transition: "width .4s",
    }),
    barLabel: {
      position: "absolute", top: 0, left: 4,
      color: "#b0c8d8", fontSize: 9, lineHeight: "14px",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      maxWidth: "90%",
    },
    footer: {
      padding: "10px 18px", borderTop: "1px solid #1a2e3a",
      display: "flex", gap: 10, alignItems: "flex-start",
    },
    assessBtn: (busy) => ({
      background: busy ? "#1a2a3a" : "#0d2030",
      border: "1px solid #2a6a8a", color: busy ? "#4a6a7a" : CY,
      borderRadius: 5, padding: "5px 14px", fontSize: 10,
      letterSpacing: 2, cursor: busy ? "not-allowed" : "pointer",
      whiteSpace: "nowrap",
    }),
    answer: {
      flex: 1, color: "#80b0c8", fontSize: 10, lineHeight: 1.5,
      fontStyle: "italic",
    },
  };

  useEffect(() => {
    if (document.getElementById("evlib-pulse-style")) return;
    const st = document.createElement("style");
    st.id = "evlib-pulse-style";
    st.textContent = `
      @keyframes evlib-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
      .evlib-pulse { animation: evlib-pulse 1.4s ease-in-out infinite; }
    `;
    document.head.appendChild(st);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:evlib-toggle"))}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 676,
          background: "#0a1520", border: "1px solid #1a3a50",
          color: unusedCount > 0 ? OR : "#3a5a6a",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", userSelect: "none",
        }}
        title="Evidence Library Audit (EVLIB)"
      >
        <span
          className={unusedCount > 0 ? "evlib-pulse" : ""}
          style={{ marginRight: unusedCount > 0 ? 4 : 0, color: OR }}
        >
          {unusedCount > 0 ? `${unusedCount}⚠` : ""}
        </span>
        ◈ EVLIB
      </button>

      {/* Panel overlay */}
      {visible && (
        <div style={S.overlay} onClick={(e) => { if (e.target === e.currentTarget) setVisible(false); }}>
          <div style={S.panel}>
            {/* Header */}
            <div style={S.header}>
              <span style={S.title}>◈ EVIDENCE LIBRARY AUDIT — DATASET × REPORT × SCENARIO</span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {loading && <span style={{ color: "#3a5a6a", fontSize: 9, letterSpacing: 2 }}>POLLING…</span>}
                <button style={S.close} onClick={() => setVisible(false)}>✕</button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={S.tiles}>
              <div style={S.tile(OR)}>
                <div style={S.tileVal(OR)}>{dsCnt}</div>
                <div style={S.tileLabel}>DATASETS</div>
              </div>
              <div style={S.tile(AM)}>
                <div style={S.tileVal(AM)}>{rptCnt}</div>
                <div style={S.tileLabel}>REPORTS</div>
              </div>
              <div style={S.tile(CY)}>
                <div style={S.tileVal(CY)}>{scenarioCnt}</div>
                <div style={S.tileLabel}>SCENARIOS</div>
              </div>
              <div style={S.tile(GR)}>
                <div style={S.tileVal(GR)}>{fullCount}</div>
                <div style={S.tileLabel}>FULLY EVIDENCED</div>
              </div>
              <div style={S.tile(OR)} className={unusedCount > 0 ? "evlib-pulse" : ""}>
                <div style={S.tileVal(OR)}>{unusedCount}</div>
                <div style={S.tileLabel}>UNUSED</div>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={S.tabs}>
              {TABS.map((t) => (
                <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
              ))}
            </div>

            {/* Search */}
            <input
              style={S.search}
              placeholder="search dataset name / type / description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* List */}
            <div style={S.list}>
              {filtered.length === 0 && (
                <div style={{ color: "#2a4a5a", fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                  {loading ? "LOADING…" : "NO RESULTS"}
                </div>
              )}
              {filtered.map((r, i) => {
                const col = CLS_COLOR[r.cls];
                const ds  = r.ds;
                const key = ds.id || ds.name || i;
                const open = expanded === key;
                const maxMatch = Math.max(
                  r.matchedReports.length,
                  r.matchedScenarios.length,
                  1
                );
                return (
                  <div key={key} style={S.row(col)} onClick={() => setExpanded(open ? null : key)}>
                    <div style={S.rowHead}>
                      <span style={S.rowName}>
                        {ds.name || ds.title || ds.id || `dataset-${i}`}
                        {ds.type
                          ? <span style={{ color: "#3a6a8a", fontSize: 9, marginLeft: 6 }}>[{ds.type}]</span>
                          : null}
                      </span>
                      <span style={S.clsBadge(col)}>{r.cls}</span>
                    </div>
                    {ds.description && (
                      <div style={{ color: "#3a6a7a", fontSize: 9, marginTop: 3, letterSpacing: 1 }}>
                        {String(ds.description).slice(0, 90)}{String(ds.description).length > 90 ? "…" : ""}
                      </div>
                    )}
                    {open && (
                      <div style={S.expand}>
                        {/* Reports */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>REPORTS ({r.matchedReports.length})</div>
                          {r.matchedReports.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedReports.slice(0, 6).map((rpt, ri) => (
                              <div key={ri} style={S.bar(AM)}>
                                <div style={S.barFill(AM, (r.matchedReports.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{rpt.name || rpt.title || rpt.id || `report-${ri}`}</span>
                              </div>
                            ))
                          }
                        </div>
                        {/* Scenarios */}
                        <div style={S.subCol}>
                          <div style={S.subTitle}>SCENARIOS ({r.matchedScenarios.length})</div>
                          {r.matchedScenarios.length === 0
                            ? <div style={{ color: "#2a4a5a", fontSize: 9 }}>— none —</div>
                            : r.matchedScenarios.slice(0, 6).map((sc, si) => (
                              <div key={si} style={S.bar(CY)}>
                                <div style={S.barFill(CY, (r.matchedScenarios.length / maxMatch) * 100)} />
                                <span style={S.barLabel}>{sc.name || sc.title || sc.id || `scenario-${si}`}</span>
                              </div>
                            ))
                          }
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Footer / Assess */}
            <div style={S.footer}>
              <button style={S.assessBtn(assessing)} onClick={assess} disabled={assessing}>
                {assessing ? "ANALYSING…" : "▶ ASSESS"}
              </button>
              {answer && <div style={S.answer}>{answer}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
