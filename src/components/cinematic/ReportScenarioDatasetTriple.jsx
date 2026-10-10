/**
 * F111 — Report × Scenario × Dataset Triple (RSDTRI)
 *
 * Parallel-fetches /v1/reports + /v1/scenario/list + /v1/datasets every 90 s.
 * Keyword-correlates each report against both the scenario list AND the dataset
 * catalog to surface:
 *
 *   FULL_COVERAGE  — report has both a matching scenario AND a matching dataset
 *   SCENARIO_ONLY  — report matched a scenario but no dataset
 *   DATASET_ONLY   — report matched a dataset but no scenario
 *   DARK           — no scenario or dataset correlation (evidence island)
 *
 * Answers: "which reports are fully grounded in operational plans AND data?"
 *
 * Stat tiles: reports / scenarios / datasets / dark
 * Amber badge on dark count.
 * Filter tabs: ALL | FULL_COVERAGE | SCENARIO_ONLY | DATASET_ONLY | DARK
 * Text search across report title / summary / type.
 * Expand row → matched scenarios + matched datasets with relevance score bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RSDTRI  at left:3780 bottom:18, zIndex:68.
 * Event:   jarvis:rsdtri-toggle
 * Voice:   "report scenario dataset / rsdtri / report triple / report coverage triple /
 *           grounded reports / dark reports / scenario dataset report / report evidence triple"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3780;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const CLASS_COLOR = {
  FULL_COVERAGE: GREEN,
  SCENARIO_ONLY: PURP,
  DATASET_ONLY:  CY,
  DARK:          AMBER,
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))               return raw;
  if (raw && Array.isArray(raw.items))  return raw.items;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")   return Object.values(raw);
  return [];
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:      String(r.id ?? r.report_id ?? i),
    title:   r.title ?? r.name ?? `Report ${i + 1}`,
    summary: r.summary ?? r.description ?? r.body ?? r.content ?? "",
    type:    r.type ?? r.category ?? r.report_type ?? "",
    tags:    Array.isArray(r.tags) ? r.tags : [],
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:     String(s.id ?? s.scenario_id ?? i),
    title:  s.title ?? s.name ?? `Scenario ${i + 1}`,
    desc:   s.description ?? s.summary ?? s.objective ?? "",
    type:   s.type ?? s.category ?? "",
    status: s.status ?? "",
    tags:   Array.isArray(s.tags) ? s.tags : [],
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:       String(d.id ?? d.dataset_id ?? i),
    title:    d.title ?? d.name ?? d.dataset_name ?? `Dataset ${i + 1}`,
    desc:     d.description ?? d.summary ?? "",
    category: d.category ?? d.type ?? "",
    tags:     Array.isArray(d.tags) ? d.tags : [],
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[\s,./\-_:;|]+/)
    .filter(t => t.length > 2);
}

function score(tokens, targetStr) {
  const tgt = tokenise(targetStr);
  let hits = 0;
  tokens.forEach(tok => { if (tgt.includes(tok)) hits++; });
  return tgt.length ? (hits / Math.max(tokens.length, tgt.length)) : 0;
}

function correlateReport(report, scenarios, datasets) {
  const reportTokens = tokenise(
    [report.title, report.summary, report.type, ...report.tags].join(" ")
  );
  const matchedScenarios = scenarios
    .map(s => ({
      ...s,
      rel: score(reportTokens, [s.title, s.desc, s.type, ...s.tags].join(" ")),
    }))
    .filter(s => s.rel > 0.05)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 6);

  const matchedDatasets = datasets
    .map(d => ({
      ...d,
      rel: score(reportTokens, [d.title, d.desc, d.category, ...d.tags].join(" ")),
    }))
    .filter(d => d.rel > 0.05)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 6);

  const hasScenario = matchedScenarios.length > 0;
  const hasDataset  = matchedDatasets.length > 0;
  const classification =
    hasScenario && hasDataset ? "FULL_COVERAGE" :
    hasScenario               ? "SCENARIO_ONLY" :
    hasDataset                ? "DATASET_ONLY"  :
                                "DARK";

  return { ...report, classification, matchedScenarios, matchedDatasets };
}

// ─── intent exports ───────────────────────────────────────────────────────────

const RSDTRI_RE =
  /\b(rsdtri|report\s*(scenario|dataset)\s*(triple|coverage)?|report\s*triple|grounded\s*report|dark\s*report|report\s*evidence\s*triple|scenario\s*dataset\s*report|report\s*coverage\s*triple)\b/i;

export function isRsdtriQuery(q) {
  return RSDTRI_RE.test(q);
}

export async function buildRsdtriScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [rRep, rScn, rDat] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/scenario/list`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/datasets`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const reports   = normaliseReports(rRep);
    const scenarios = normaliseScenarios(rScn);
    const datasets  = normaliseDatasets(rDat);
    const correlated = reports.map(r => correlateReport(r, scenarios, datasets));
    const dark = correlated.filter(r => r.classification === "DARK").length;
    const full = correlated.filter(r => r.classification === "FULL_COVERAGE").length;
    return `RSDTRI: ${reports.length} reports × ${scenarios.length} scenarios × ${datasets.length} datasets. ${full} fully grounded (scenario + dataset matched), ${dark} dark (no operational or data coverage). Top dark report: "${correlated.find(r => r.classification === "DARK")?.title ?? "none"}".`;
  } catch {
    return "RSDTRI: unable to fetch report-scenario-dataset triple coverage data.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportScenarioDatasetTriple() {
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [rows, setRows]     = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessTxt, setAssessTxt] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [rRep, rScn, rDat] = await Promise.all([
        fetch(`${base}/v1/reports`,       { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`,      { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const reps = normaliseReports(rRep);
      const scns = normaliseScenarios(rScn);
      const dats = normaliseDatasets(rDat);
      const correlated = reps.map(r => correlateReport(r, scns, dats));
      setRows(correlated);
      setScenarios(scns);
      setDatasets(dats);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(prev => !prev); };
    window.addEventListener("jarvis:rsdtri-toggle", handler);
    return () => window.removeEventListener("jarvis:rsdtri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setAssessTxt("");
    const script = await buildRsdtriScript();
    setAssessTxt(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  }, []);

  const counts = {
    FULL_COVERAGE: rows.filter(r => r.classification === "FULL_COVERAGE").length,
    SCENARIO_ONLY: rows.filter(r => r.classification === "SCENARIO_ONLY").length,
    DATASET_ONLY:  rows.filter(r => r.classification === "DATASET_ONLY").length,
    DARK:          rows.filter(r => r.classification === "DARK").length,
  };

  const visible = rows
    .filter(r => filter === "ALL" || r.classification === filter)
    .filter(r =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.type.toLowerCase().includes(search.toLowerCase())
    );

  const darkCount = counts.DARK;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${darkCount > 0 ? AMBER : CY}`,
          color: darkCount > 0 ? AMBER : CY, fontFamily: MONO, fontSize: 11,
          padding: "4px 9px", cursor: "pointer", borderRadius: 3, letterSpacing: "0.05em",
        }}
      >
        ◈ RSDTRI{darkCount > 0 ? ` [${darkCount}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 400, top: 60, zIndex: 68,
      width: 480, maxHeight: "80vh", overflow: "hidden",
      background: BG, border: `1px solid ${CY}`, borderRadius: 6,
      fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid rgba(41,231,255,0.2)`,
      }}>
        <span style={{ color: CY, fontSize: 12, letterSpacing: "0.08em" }}>
          ◈ REPORT × SCENARIO × DATASET TRIPLE
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 14 }}>
          ✕
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "8px 12px" }}>
        {[
          ["REPORTS", rows.length, CY],
          ["SCENARIOS", scenarios.length, PURP],
          ["DATASETS", datasets.length, GREEN],
          ["DARK", darkCount, AMBER],
        ].map(([label, val, color]) => (
          <div key={label} style={{
            background: "rgba(41,231,255,0.05)", border: `1px solid rgba(41,231,255,0.15)`,
            borderRadius: 4, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: "0.06em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, padding: "0 12px 8px" }}>
        {Object.entries(counts).map(([cls, cnt]) => (
          <div key={cls} style={{
            background: "rgba(41,231,255,0.04)", border: `1px solid rgba(41,231,255,0.1)`,
            borderRadius: 4, padding: "4px 6px", textAlign: "center",
          }}>
            <div style={{ color: CLASS_COLOR[cls], fontSize: 13, fontWeight: 700 }}>{cnt}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: "0.04em" }}>{cls.replace(/_/g, " ")}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, flexWrap: "wrap" }}>
        {["ALL", "FULL_COVERAGE", "SCENARIO_ONLY", "DATASET_ONLY", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? CY : "rgba(41,231,255,0.08)",
            color: filter === f ? "#000" : CY, border: "none",
            borderRadius: 3, padding: "3px 7px", fontSize: 9, cursor: "pointer",
            letterSpacing: "0.04em",
          }}>
            {f.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search reports…"
          style={{
            marginLeft: "auto", background: "rgba(41,231,255,0.07)", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 3, padding: "3px 8px", fontSize: 10, fontFamily: MONO, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 8px" }}>
        {err && <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>No reports match.</div>
        )}
        {visible.map(r => (
          <div key={r.id} style={{ marginBottom: 4 }}>
            <div
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                background: "rgba(41,231,255,0.04)", border: `1px solid rgba(41,231,255,0.12)`,
                borderRadius: 4, cursor: "pointer",
              }}
            >
              <span style={{
                color: CLASS_COLOR[r.classification], fontSize: 9, minWidth: 90,
                letterSpacing: "0.04em",
              }}>
                {r.classification.replace(/_/g, " ")}
              </span>
              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title}
              </span>
              {r.type && (
                <span style={{ color: MUTED, fontSize: 9, border: `1px solid ${MUTED}44`, borderRadius: 3, padding: "1px 5px" }}>
                  {r.type}
                </span>
              )}
              <span style={{ color: MUTED, fontSize: 10 }}>{expanded === r.id ? "▲" : "▼"}</span>
            </div>

            {expanded === r.id && (
              <div style={{
                padding: "8px 10px", background: "rgba(41,231,255,0.03)",
                border: `1px solid rgba(41,231,255,0.1)`, borderTop: "none",
                borderRadius: "0 0 4px 4px",
              }}>
                {r.summary && (
                  <div style={{ color: MUTED, fontSize: 9, marginBottom: 8 }}>
                    {r.summary.slice(0, 200)}{r.summary.length > 200 ? "…" : ""}
                  </div>
                )}

                {/* matched scenarios */}
                <div style={{ color: PURP, fontSize: 9, marginBottom: 4, letterSpacing: "0.06em" }}>
                  SCENARIOS ({r.matchedScenarios.length})
                </div>
                {r.matchedScenarios.length === 0
                  ? <div style={{ color: MUTED, fontSize: 9, marginBottom: 8 }}>No scenario match.</div>
                  : r.matchedScenarios.map(s => (
                    <div key={s.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: PURP }}>{s.title}</span>
                        <span style={{ color: MUTED }}>{(s.rel * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(167,139,250,0.15)", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, s.rel * 100)}%`, background: PURP, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))
                }

                {/* matched datasets */}
                <div style={{ color: CY, fontSize: 9, marginBottom: 4, marginTop: 8, letterSpacing: "0.06em" }}>
                  DATASETS ({r.matchedDatasets.length})
                </div>
                {r.matchedDatasets.length === 0
                  ? <div style={{ color: MUTED, fontSize: 9 }}>No dataset match.</div>
                  : r.matchedDatasets.map(d => (
                    <div key={d.id} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: CY }}>{d.title}</span>
                        <span style={{ color: MUTED }}>{(d.rel * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(41,231,255,0.15)", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, d.rel * 100)}%`, background: CY, borderRadius: 2 }} />
                      </div>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "6px 12px 10px", borderTop: `1px solid rgba(41,231,255,0.15)` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(41,231,255,0.1)" : CY,
          color: assessing ? CY : "#000", border: "none", borderRadius: 3,
          padding: "5px 12px", fontSize: 10, cursor: assessing ? "default" : "pointer",
          fontFamily: MONO, letterSpacing: "0.05em",
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        {assessTxt && (
          <div style={{ color: GREEN, fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{assessTxt}</div>
        )}
      </div>
    </div>
  );
}
