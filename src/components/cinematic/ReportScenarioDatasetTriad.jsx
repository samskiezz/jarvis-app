/**
 * F92 — Report × Scenario × Dataset Coverage Triad (RSDAT)
 * Parallel-fetches /v1/reports + /v1/scenario/list + /v1/datasets.
 * Keyword-correlates each report against scenarios AND datasets to classify:
 *   FULLY_GROUNDED (both match) | SCENARIO_BACKED (scenario only)
 *   DATASET_LINKED (dataset only) | UNANCHORED (neither)
 * Stat tiles + coverage bar. Amber badge on unanchored count.
 * Filter tabs ALL/FULLY_GROUNDED/SCENARIO_BACKED/DATASET_LINKED/UNANCHORED + text search.
 * Expand report → matched scenario cards (cyan) + dataset cards (purple) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "rsdat/report scenario dataset/unanchored reports/report coverage triad".
 * Event: jarvis:rsdat-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 994_440;
const Z_INDEX  = 154;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const RSDAT_RE = /\b(rsdat|report\s+scenario\s+dataset|report\s+coverage\s+triad|unanchored\s+reports?|report\s+dataset\s+scenario|scenario\s+dataset\s+report\s+coverage|report\s+grounding|report\s+triad)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const GR = "#22C55E";
const RD = "#EF4444";
const PU = "#A855F7";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_GROUNDED:  GR,
  SCENARIO_BACKED: CY,
  DATASET_LINKED:  PU,
  UNANCHORED:      AM,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isRsdatQuery(text) {
  return RSDAT_RE.test(text || "");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const setA = new Set(kwTokens(aStr));
  return kwTokens(bStr).some(w => setA.has(w));
}

function matchScore(reportStr, targetStr) {
  const ra = kwTokens(reportStr);
  const ta = new Set(kwTokens(targetStr));
  const hits = ra.filter(w => ta.has(w)).length;
  return Math.min(100, Math.round((hits / Math.max(1, ra.length)) * 200));
}

function classify(report, scenarios, datasets) {
  const rStr = [report.title, report.description, (report.tags || []).join(" "), report.type, report.author].filter(Boolean).join(" ");
  const matchedScenarios = scenarios.filter(s =>
    overlap(rStr, [s.name, s.title, s.description, s.objective].filter(Boolean).join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlap(rStr, [d.name, d.title, d.description, d.type].filter(Boolean).join(" "))
  );
  const hasSc = matchedScenarios.length > 0;
  const hasDa = matchedDatasets.length > 0;
  const cls = hasSc && hasDa ? "FULLY_GROUNDED" : hasSc ? "SCENARIO_BACKED" : hasDa ? "DATASET_LINKED" : "UNANCHORED";
  return { ...report, _cls: cls, _scenarios: matchedScenarios, _datasets: matchedDatasets, _rStr: rStr };
}

export async function buildRsdatScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [rr, sr, dr] = await Promise.all([
      fetch(`${base}/v1/reports`,       { headers: h }).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()),
      fetch(`${base}/v1/datasets`,      { headers: h }).then(r => r.json()),
    ]);
    const reports   = norm(rr, ["reports","items","data","results"]);
    const scenarios = norm(sr, ["scenarios","items","data","results"]);
    const datasets  = norm(dr, ["datasets","items","data","results"]);
    const rows      = reports.map(r => classify(r, scenarios, datasets));
    const fully     = rows.filter(r => r._cls === "FULLY_GROUNDED").length;
    const unanchored = rows.filter(r => r._cls === "UNANCHORED").length;
    const pct       = rows.length ? Math.round((fully / rows.length) * 100) : 0;
    return `Report Scenario Dataset Coverage Triad: ${reports.length} intelligence reports cross-referenced against ${scenarios.length} scenarios and ${datasets.length} datasets. ${fully} reports are fully grounded with both scenario and data backing, ${pct}% coverage. ${unanchored} reports are currently unanchored — no scenario context or dataset linkage found.`;
  } catch {
    return "Report scenario dataset triad online. Cross-referencing intelligence reports against scenario playbooks and data sources to classify coverage. Review the RSDAT panel for the full breakdown, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, background: "rgba(0,207,255,0.05)", border: `1px solid ${color || BORDER}`, borderRadius: 4, padding: "8px 10px" }}>
      <div style={{ color: color || CY, fontSize: 18, fontWeight: 700, fontFamily: FONT }}>{value}</div>
      <div style={{ color: "#88A4B8", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score, color }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
      <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  );
}

export default function ReportScenarioDatasetTriad() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [rr, sr, dr] = await Promise.all([
        fetch(`${base}/v1/reports`,       { headers: h }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()),
        fetch(`${base}/v1/datasets`,      { headers: h }).then(r => r.json()),
      ]);
      const reports   = norm(rr, ["reports","items","data","results"]);
      const scenarios = norm(sr, ["scenarios","items","data","results"]);
      const datasets  = norm(dr, ["datasets","items","data","results"]);
      setRows(reports.map(r => classify(r, scenarios, datasets)));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:rsdat-toggle", handler);
    return () => window.removeEventListener("jarvis:rsdat-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildRsdatScript();
      setBrief(script);
      const base = apiBase();
      const h = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: `In 2 sentences max, summarise the report-scenario-dataset coverage triad: ${script}` }),
      }).then(r => r.json());
      const aiText = rr.response || rr.message || rr.content || script;
      setBrief(aiText);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: h,
        body: JSON.stringify({ text: aiText }),
      });
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const counts = {
    FULLY_GROUNDED:  rows.filter(r => r._cls === "FULLY_GROUNDED").length,
    SCENARIO_BACKED: rows.filter(r => r._cls === "SCENARIO_BACKED").length,
    DATASET_LINKED:  rows.filter(r => r._cls === "DATASET_LINKED").length,
    UNANCHORED:      rows.filter(r => r._cls === "UNANCHORED").length,
  };
  const covPct = rows.length ? Math.round((counts.FULLY_GROUNDED / rows.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_GROUNDED", "SCENARIO_BACKED", "DATASET_LINKED", "UNANCHORED"];
  const visible = rows.filter(r =>
    (tab === "ALL" || r._cls === tab) &&
    (!search || (r.title || r.name || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(0,207,255,0.08)",
          border: `1px solid ${CY}`, color: open ? "#04060A" : CY,
          fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
        }}
        title="Report × Scenario × Dataset Coverage Triad"
      >
        ◈ RSDAT
        {counts.UNANCHORED > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000", borderRadius: "50%",
            fontSize: 9, padding: "0 4px", fontWeight: 700,
          }}>{counts.UNANCHORED}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, right: 8, zIndex: Z_INDEX + 1,
          width: "min(660px,96vw)", maxHeight: "72vh",
          background: BG, border: `1px solid ${CY}33`, borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: FONT, boxShadow: `0 0 40px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ RSDAT</span>
            <span style={{ color: "#88A4B8", fontSize: 10 }}>Report × Scenario × Dataset Coverage Triad</span>
            <button onClick={fetchData} disabled={loading} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}55`, color: CY, cursor: "pointer", fontSize: 10, padding: "2px 7px", borderRadius: 3, fontFamily: FONT }}>
              {loading ? "..." : "↻"}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#88A4B8", cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "10px 14px", display: "flex", gap: 8, borderBottom: `1px solid ${BORDER}` }}>
            <Tile label="REPORTS"        value={rows.length}              color={CY} />
            <Tile label="FULLY GROUNDED" value={counts.FULLY_GROUNDED}   color={GR} />
            <Tile label="SCENARIO ONLY"  value={counts.SCENARIO_BACKED}  color={CY} />
            <Tile label="DATASET ONLY"   value={counts.DATASET_LINKED}   color={PU} />
            <Tile label="UNANCHORED"     value={counts.UNANCHORED}       color={AM} />
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#88A4B8", fontSize: 9, letterSpacing: 1 }}>FULL COVERAGE</span>
              <span style={{ color: GR, fontSize: 10, fontWeight: 700 }}>{covPct}%</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${covPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
            </div>
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? (CLASS_COLOR[t] || CY) : "none",
                border: `1px solid ${CLASS_COLOR[t] || CY}`,
                color: tab === t ? "#04060A" : (CLASS_COLOR[t] || CY),
                fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "2px 7px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: "auto", background: "rgba(0,207,255,0.05)",
                border: `1px solid ${BORDER}`, color: "#C8D8E8",
                fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 3,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {err && <div style={{ color: RD, fontSize: 11, padding: 8 }}>Error: {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#88A4B8", fontSize: 11, padding: 8 }}>No reports match the current filter.</div>
            )}
            {visible.map((r, i) => {
              const rid = r.id || r._id || r.title || i;
              const isExp = expanded === rid;
              const color = CLASS_COLOR[r._cls] || CY;
              return (
                <div key={rid} style={{ marginBottom: 6, border: `1px solid ${color}33`, borderRadius: 5, background: "rgba(0,207,255,0.03)" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : rid)}
                    style={{ padding: "7px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ fontSize: 9, fontWeight: 700, color, border: `1px solid ${color}`, padding: "1px 5px", borderRadius: 2, minWidth: 90, textAlign: "center" }}>
                      {r._cls.replace(/_/g, " ")}
                    </span>
                    <span style={{ color: "#C8D8E8", fontSize: 11, flex: 1 }}>{r.title || r.name || `Report ${i + 1}`}</span>
                    {r.type && <span style={{ color: "#88A4B8", fontSize: 9 }}>{r.type}</span>}
                    <span style={{ color: "#88A4B8", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "6px 10px 10px", borderTop: `1px solid ${BORDER}` }}>
                      {r._scenarios.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MATCHED SCENARIOS ({r._scenarios.length})</div>
                          {r._scenarios.slice(0, 4).map((s, j) => {
                            const sc = matchScore(r._rStr, [s.name, s.title, s.description].filter(Boolean).join(" "));
                            return (
                              <div key={j} style={{ marginBottom: 4, padding: "4px 7px", background: `${CY}0a`, border: `1px solid ${CY}33`, borderRadius: 3 }}>
                                <span style={{ color: CY, fontSize: 10 }}>{s.name || s.title || `Scenario ${j + 1}`}</span>
                                <RelevanceBar score={sc} color={CY} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {r._datasets.length > 0 && (
                        <div>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>MATCHED DATASETS ({r._datasets.length})</div>
                          {r._datasets.slice(0, 4).map((d, j) => {
                            const sc = matchScore(r._rStr, [d.name, d.title, d.description].filter(Boolean).join(" "));
                            return (
                              <div key={j} style={{ marginBottom: 4, padding: "4px 7px", background: `${PU}0a`, border: `1px solid ${PU}33`, borderRadius: 3 }}>
                                <span style={{ color: PU, fontSize: 10 }}>{d.name || d.title || `Dataset ${j + 1}`}</span>
                                {d.row_count != null && <span style={{ color: "#88A4B8", fontSize: 9, marginLeft: 8 }}>{d.row_count.toLocaleString()} rows</span>}
                                <RelevanceBar score={sc} color={PU} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {r._scenarios.length === 0 && r._datasets.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "4px 0" }}>No matching scenarios or datasets found for this report.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess + brief */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: "none", border: `1px solid ${GR}`,
                color: GR, fontFamily: FONT, fontSize: 10,
                padding: "4px 12px", borderRadius: 3, cursor: "pointer",
                letterSpacing: 1, opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "… ASSESSING" : "▶ ASSESS COVERAGE"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#C8D8E8", fontSize: 11, lineHeight: 1.5, background: "rgba(0,207,255,0.04)", padding: "6px 8px", borderRadius: 4 }}>
                {brief}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "4px 14px 6px", borderTop: `1px solid ${BORDER}`, color: "#4A6070", fontSize: 9 }}>
            RSDAT · /v1/reports × /v1/scenario/list × /v1/datasets · auto-refresh 90s
          </div>
        </div>
      )}
    </>
  );
}
