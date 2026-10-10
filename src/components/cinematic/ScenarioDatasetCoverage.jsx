/**
 * F78 — Scenario × Dataset Coverage (SCDSET)
 *
 * Parallel-fetches /v1/scenario/list + /v1/datasets every 90 s.
 * Keyword-correlates each scenario against the dataset catalog to classify:
 *   DATA_BACKED  — ≥2 datasets match the scenario's domain
 *   PARTIAL      — exactly 1 dataset matches
 *   DATA_DARK    — no dataset backs this scenario
 *
 * Stat tiles:  scenarios / datasets / backed / dark
 * Filter tabs: ALL | DATA_BACKED | PARTIAL | DATA_DARK
 * Text search: across scenario name / description.
 * Expand row → matched dataset cards with row counts + relevance score bar.
 * Amber badge on DATA_DARK count.
 * ▶ ASSESS: 2-sentence scenario data-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCDSET  at left:21880 bottom:8, zIndex:80.
 * Event:   jarvis:scdset-toggle
 * Voice:   "scenario dataset" / "scenario data" / "scdset"
 *          / "scenario data coverage" / "backed scenarios"
 *          / "data dark scenarios" / "which scenarios have data"
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

const BTN_LEFT   = 21880;
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
    name:        s.name ?? s.title ?? s.label ?? `Scenario ${i + 1}`,
    description: [s.description, s.objective, s.type, s.category, s.tags, s.context]
                   .filter(Boolean).join(" "),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:    String(d.id ?? d.dataset_id ?? i),
    name:  d.name ?? d.dataset_name ?? d.title ?? `Dataset ${i + 1}`,
    rows:  d.row_count ?? d.rows ?? d.count ?? null,
    body:  [d.description, d.category, d.type, d.tags, d.domain, d.source]
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
  const [sRes, dRes] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    fetch(`${base}/v1/datasets`,      { headers: hdr }),
  ]);
  return {
    scenarios: normaliseScenarios(sRes.ok ? await sRes.json() : []),
    datasets:  normaliseDatasets(dRes.ok  ? await dRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function classify(matchCount) {
  if (matchCount >= 2) return "DATA_BACKED";
  if (matchCount === 1) return "PARTIAL";
  return "DATA_DARK";
}

function correlate(scenarios, datasets) {
  return scenarios.map(sc => {
    const kws = buildKeywords([sc.name, sc.description]);
    const matched = datasets
      .map(ds => ({ ds, score: scoreMatch(kws, `${ds.name} ${ds.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, matched, classification: classify(matched.length) };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const SCDSET_RE =
  /\b(scdset|scenario[\s_-]?data(set[s]?)?|data[\s_-]?scenario[s]?|backed[\s_-]?scenario[s]?|dark[\s_-]?scenario[s]?|data[\s_-]?dark[\s_-]?scenario[s]?|which[\s_-]?scenario[s]?[\s_-]?have[\s_-]?data|scenario[\s_-]?data[\s_-]?coverage|scenario[\s_-]?dataset[\s_-]?coverage|unsupported[\s_-]?scenario[s]?|scenario[\s_-]?backing)\b/i;

export function isScdsetQuery(q) { return SCDSET_RE.test(q); }

export async function buildScdsetScript() {
  try {
    const { scenarios, datasets } = await fetchAll();
    const rows   = correlate(scenarios, datasets);
    const backed = rows.filter(r => r.classification === "DATA_BACKED").length;
    const partial = rows.filter(r => r.classification === "PARTIAL").length;
    const dark   = rows.filter(r => r.classification === "DATA_DARK").length;
    const prompt =
      `Scenario dataset coverage analysis: ${scenarios.length} scenarios cross-referenced against ` +
      `${datasets.length} datasets in the catalog. ` +
      `${backed} scenarios are fully data-backed (2+ datasets), ` +
      `${partial} have partial coverage (1 dataset), and ` +
      `${dark} are data-dark with no backing dataset at all. ` +
      `Provide a 2-sentence operational assessment and flag the most critical data-dark scenarios.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:scdset-toggle"));
    return (
      data.response ?? data.reply ?? data.message ??
      `${backed} scenarios data-backed, ${partial} partial, ${dark} data-dark across ${datasets.length} datasets.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:scdset-toggle"));
    return "Scenario dataset coverage panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "DATA_BACKED", "PARTIAL", "DATA_DARK"];

const FILTER_COLOR = {
  DATA_BACKED: GREEN,
  PARTIAL:     AMBER,
  DATA_DARK:   RED,
};

export default function ScenarioDatasetCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [dsCount,   setDsCount]   = useState(0);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { scenarios, datasets } = await fetchAll();
      setRows(correlate(scenarios, datasets));
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
    window.addEventListener("jarvis:scdset-toggle", handler);
    return () => window.removeEventListener("jarvis:scdset-toggle", handler);
  }, []);

  const handleAssess = useCallback(async (sc) => {
    const key = sc.id;
    if (assessing === key) return;
    setAssessing(key);
    try {
      const prompt =
        `Scenario "${sc.name}": ${sc.description.slice(0, 200)}. ` +
        `Coverage status: ${sc.classification}. ` +
        `Matched datasets: ${sc.matched.map(m => m.ds.name).join(", ") || "none"}. ` +
        `In 2 sentences, assess the data-coverage risk and recommend the most urgent datasets to source.`;
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

  const backed  = rows.filter(r => r.classification === "DATA_BACKED").length;
  const partial = rows.filter(r => r.classification === "PARTIAL").length;
  const dark    = rows.filter(r => r.classification === "DATA_DARK").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.description.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Scenario × Dataset Coverage (SCDSET)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 80,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ SCDSET
        {dark > 0 && (
          <span style={{
            background: AMBER, color: "#0B1420", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700, lineHeight: "14px",
          }}>
            {dark}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 200, zIndex: 80,
      width: 420, maxHeight: "70vh",
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
          ◈ SCENARIO × DATASET COVERAGE
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
          { label: "SCENARIOS", val: rows.length, color: CY },
          { label: "DATASETS",  val: dsCount,     color: CY },
          { label: "BACKED",    val: backed,       color: GREEN },
          { label: "DARK",      val: dark,         color: dark > 0 ? AMBER : MUTED },
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
          placeholder="search scenarios…"
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
        {filtered.map(sc => {
          const isExp     = expanded === sc.id;
          const cls       = sc.classification;
          const clsColor  = FILTER_COLOR[cls] ?? MUTED;
          return (
            <div
              key={sc.id}
              onClick={() => setExpanded(isExp ? null : sc.id)}
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
                  boxShadow: cls === "DATA_DARK" ? `0 0 6px ${clsColor}` : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{sc.name}</span>
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: clsColor,
                  border: `1px solid ${clsColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {cls}
                </span>
                {sc.matched.length > 0 && (
                  <span style={{ color: MUTED, fontSize: 9 }}>
                    {sc.matched.length} ds
                  </span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {sc.matched.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED DATASETS
                      </div>
                      {sc.matched.map(({ ds, score }) => (
                        <div key={ds.id} style={{
                          marginBottom: 4, padding: "4px 8px",
                          background: "rgba(12,22,36,0.8)", borderRadius: 4,
                          border: `1px solid ${CY}22`,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", marginBottom: 3,
                          }}>
                            <span style={{ color: "#B0D0E0", fontSize: 10 }}>{ds.name}</span>
                            {ds.rows != null && (
                              <span style={{ color: MUTED, fontSize: 9 }}>
                                {ds.rows.toLocaleString()} rows
                              </span>
                            )}
                          </div>
                          {/* relevance bar */}
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
                      No datasets matched — scenario is data-dark.
                    </div>
                  )}

                  {/* ASSESS button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(sc); }}
                    disabled={assessing === sc.id}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${CY}18`, border: `1px solid ${CY}44`,
                      color: CY, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === sc.id ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === sc.id ? "ASSESSING…" : "▶ ASSESS COVERAGE"}
                  </button>

                  {assessText[sc.id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${CY}0A`, border: `1px solid ${CY}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[sc.id]}
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
          {filtered.length}/{rows.length} SCENARIOS · AUTO-REFRESH 90s
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
