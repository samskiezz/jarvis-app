/**
 * F88 — Scenario × Report Intelligence Coverage (SCREP)
 *
 * Parallel-fetches /v1/scenario/list + /v1/reports every 90 s.
 * Keyword-correlates each scenario against intelligence reports:
 *   REPORTED — ≥1 report backs this scenario (documented)
 *   DARK     — 0 reports match (intelligence gap)
 *
 * Stat tiles:  scenarios / reports / reported / dark
 * Filter tabs: ALL | REPORTED | DARK
 * Text search: across scenario name / description.
 * Expand row → matched report cards with type badge + relevance score.
 * Amber badge on DARK count.
 * ▶ ASSESS: 2-sentence scenario intelligence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCREP  at left:26920, bottom:8, zIndex:89.
 * Event:   jarvis:screp-toggle
 * Voice:   "screp" / "scenario report" / "scenario intelligence" /
 *          "dark scenarios" / "reported scenarios" /
 *          "scenario documentation" / "report scenario" /
 *          "scenario intel coverage" / "intelligence scenario"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 26920;
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

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:          String(s.id ?? s.scenario_id ?? i),
    name:        s.name ?? s.title ?? s.scenario_name ?? `Scenario ${i + 1}`,
    description: s.description ?? s.summary ?? s.objective ?? "",
    category:    s.category ?? s.type ?? null,
    body:        [s.name, s.title, s.description, s.summary, s.objective,
                  s.category, s.type, s.tags, s.threat]
                   .filter(Boolean).join(" "),
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:    String(r.id ?? r.report_id ?? i),
    name:  r.name ?? r.title ?? r.report_name ?? `Report ${i + 1}`,
    type:  r.type ?? r.report_type ?? r.category ?? null,
    year:  r.year ?? r.date ?? null,
    body:  [r.name, r.title, r.description, r.summary,
            r.type, r.category, r.tags, r.topic]
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
  const [scenRes, repRes] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    fetch(`${base}/v1/reports`,       { headers: hdr }),
  ]);
  return {
    scenarios: normaliseScenarios(scenRes.ok ? await scenRes.json() : []),
    reports:   normaliseReports(repRes.ok   ? await repRes.json()   : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(scenarios, reports) {
  return scenarios.map(sc => {
    const kws = buildKeywords([sc.name, sc.description, sc.body]);
    const matched = reports
      .map(r => ({ r, score: scoreMatch(kws, `${r.name} ${r.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 1 ? "REPORTED" : "DARK";
    return { ...sc, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const SCREP_RE =
  /\b(screp|scenario[\s_-]?report[s]?|report[\s_-]?scenario[s]?|scenario[\s_-]?intel(ligence)?|intel(ligence)?[\s_-]?scenario[s]?|dark[\s_-]?scenario[s]?|reported[\s_-]?scenario[s]?|scenario[\s_-]?documentation|scenario[\s_-]?intel[\s_-]?coverage|intelligence[\s_-]?scenario[s]?|scenario[\s_-]?report[\s_-]?coverage)\b/i;

export function isScrepQuery(q) { return SCREP_RE.test(q); }

export async function buildScrepScript() {
  try {
    const { scenarios, reports } = await fetchAll();
    const rows     = correlate(scenarios, reports);
    const reported = rows.filter(r => r.classification === "REPORTED").length;
    const dark     = rows.filter(r => r.classification === "DARK").length;
    const prompt =
      `Scenario intelligence report coverage: ${scenarios.length} scenarios cross-referenced ` +
      `against ${reports.length} intelligence reports. ` +
      `${reported} scenarios are REPORTED — at least one intelligence report backs them — while ` +
      `${dark} are DARK, with no report coverage (intelligence gap). ` +
      `In 2 sentences, assess the overall scenario intelligence coverage and flag the highest-priority ` +
      `dark scenarios that most urgently need intelligence reporting.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:screp-toggle"));
    return (data.answer || "Scenario intelligence coverage panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:screp-toggle"));
    return "Scenario intelligence coverage panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "REPORTED" ? GREEN : AMBER;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ScenarioReportIntelligence() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [reports,   setReports]   = useState([]);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [q,         setQ]         = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { scenarios: sc, reports: rp } = await fetchAll();
      setScenarios(sc);
      setReports(rp);
      setRows(correlate(sc, rp));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:screp-toggle", handler);
    return () => window.removeEventListener("jarvis:screp-toggle", handler);
  }, []);

  const reported = rows.filter(r => r.classification === "REPORTED").length;
  const dark     = rows.filter(r => r.classification === "DARK").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.name + (r.description ?? "")).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildScrepScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "REPORTED", "DARK"];
  const TAB_COLOUR = { REPORTED: GREEN, DARK: AMBER, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Report Intelligence Coverage"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 89,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${AMBER}`, color: AMBER, background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SCREP{dark > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({dark})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 89,
      width: "min(680px,92vw)", maxHeight: "82vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ SCENARIO × REPORT INTELLIGENCE COVERAGE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {scenarios.length} scenarios · {reports.length} reports · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "SCENARIOS", value: scenarios.length, colour: CY    },
          { label: "REPORTS",   value: reports.length,   colour: MUTED },
          { label: "REPORTED",  value: reported,          colour: GREEN },
          { label: "DARK",      value: dark,              colour: AMBER },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 100px", minWidth: 90,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "2px 10px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${tab === t ? TAB_COLOUR[t] : MUTED + "55"}`,
            color: tab === t ? TAB_COLOUR[t] : MUTED,
            background: tab === t ? `${TAB_COLOUR[t]}18` : "transparent",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search scenarios…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading scenarios…" : "no scenarios match current filter"}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${CY}22`, padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.name}
                </div>
                {row.description && (
                  <div style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                    {row.description.slice(0, 80)}{row.description.length > 80 ? "…" : ""}
                  </div>
                )}
              </div>
              {row.category && (
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  border: `1px solid ${CY}44`, color: CY,
                }}>{row.category}</span>
              )}
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} report{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No intelligence reports match this scenario — consider commissioning a report.
                  </div>
                ) : (
                  row.matched.map(({ r, score }) => (
                    <div key={r.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {r.name}
                        </span>
                        {r.type && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{r.type}</span>
                        )}
                        {r.year && (
                          <span style={{ fontSize: 10, color: MUTED }}>{r.year}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
