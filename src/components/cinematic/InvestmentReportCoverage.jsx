/**
 * F81 — Investment × Report Coverage (IREP)
 *
 * Parallel-fetches /entities/Investment + /v1/reports every 90 s.
 * Keyword-correlates each portfolio position against the reports catalogue:
 *   COVERED — ≥1 report keyword-matches this position (intelligence-backed)
 *   DARK    — no report covers this position (intelligence gap)
 *
 * Stat tiles:  positions / reports / covered / dark
 * Filter tabs: ALL | COVERED | DARK
 * Text search: across investment name / ticker / type / sector.
 * Expand row → matched report cards with type badge + relevance score bar.
 * Amber badge on DARK count.
 * ▶ ASSESS: 2-sentence investment intelligence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IREP  at left:23560 bottom:8, zIndex:83.
 * Event:   jarvis:irep-toggle
 * Voice:   "investment report" / "irep" / "portfolio coverage"
 *          / "portfolio reports" / "investment documentation"
 *          / "covered investments" / "dark investments"
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

const BTN_LEFT   = 23560;
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

function normaliseInvestments(raw) {
  return normaliseArray(raw).map((inv, i) => ({
    id:     String(inv.id ?? inv.investment_id ?? i),
    name:   inv.name ?? inv.title ?? inv.asset_name ?? `Position ${i + 1}`,
    ticker: inv.ticker ?? inv.symbol ?? null,
    type:   inv.type ?? inv.asset_type ?? inv.category ?? null,
    sector: inv.sector ?? inv.industry ?? null,
    body:   [inv.name, inv.title, inv.description, inv.ticker,
             inv.type, inv.sector, inv.industry, inv.tags]
              .filter(Boolean).join(" "),
  }));
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
  const [invRes, rptRes] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers: hdr }),
    fetch(`${base}/v1/reports`,          { headers: hdr }),
  ]);
  return {
    investments: normaliseInvestments(invRes.ok ? await invRes.json() : []),
    reports:     normaliseReports(rptRes.ok     ? await rptRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(investments, reports) {
  return investments.map(inv => {
    const kws = buildKeywords([inv.name, inv.ticker ?? "", inv.body]);
    const matched = reports
      .map(r => ({ r, score: scoreMatch(kws, `${r.title} ${r.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...inv,
      matched,
      classification: matched.length >= 1 ? "COVERED" : "DARK",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const IREP_RE =
  /\b(irep|investment[\s_-]?report[s]?|portfolio[\s_-]?report[s]?|portfolio[\s_-]?coverage|investment[\s_-]?documentation|covered[\s_-]?investment[s]?|dark[\s_-]?investment[s]?|report[\s_-]?coverage[\s_-]?investment[s]?|investment[\s_-]?intelligence[\s_-]?report[s]?)\b/i;

export function isIrepQuery(q) { return IREP_RE.test(q); }

export async function buildIrepScript() {
  try {
    const { investments, reports } = await fetchAll();
    const rows    = correlate(investments, reports);
    const covered = rows.filter(r => r.classification === "COVERED").length;
    const dark    = rows.filter(r => r.classification === "DARK").length;
    const prompt =
      `Investment report coverage: ${investments.length} portfolio positions cross-referenced ` +
      `against ${reports.length} intelligence reports. ` +
      `${covered} positions are covered by at least one report, ` +
      `while ${dark} positions have no intelligence report backing — these are blind spots in portfolio surveillance. ` +
      `In 2 sentences, assess the intelligence coverage quality and flag the most critical ` +
      `uncovered positions requiring immediate reporting.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:irep-toggle"));
    return (
      data.response ?? data.reply ?? data.message ??
      `${covered} positions covered, ${dark} dark across ${reports.length} reports.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:irep-toggle"));
    return "Investment report coverage panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "COVERED", "DARK"];

const FILTER_COLOR = {
  COVERED: GREEN,
  DARK:    AMBER,
};

export default function InvestmentReportCoverage() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [rptCount,   setRptCount]   = useState(0);
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
      const { investments, reports } = await fetchAll();
      setRows(correlate(investments, reports));
      setRptCount(reports.length);
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
    window.addEventListener("jarvis:irep-toggle", handler);
    return () => window.removeEventListener("jarvis:irep-toggle", handler);
  }, []);

  const handleAssess = useCallback(async (inv) => {
    const key = inv.id;
    if (assessing === key) return;
    setAssessing(key);
    try {
      const matchedTitles = inv.matched.map(m => m.r.title).join(", ") || "none";
      const prompt =
        `Portfolio position "${inv.name}"` +
        (inv.ticker ? ` (${inv.ticker})` : "") +
        `: type ${inv.type ?? "unknown"}, sector ${inv.sector ?? "unknown"}. ` +
        `Intelligence coverage: ${inv.classification}. ` +
        `Matching reports: ${matchedTitles}. ` +
        `In 2 sentences, assess the intelligence coverage for this position and recommend ` +
        `what type of report would most improve surveillance of this holding.`;
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

  const covered = rows.filter(r => r.classification === "COVERED").length;
  const dark    = rows.filter(r => r.classification === "DARK").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.body.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Report Coverage (IREP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 83,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ IREP
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
      position: "fixed", bottom: 40, left: BTN_LEFT - 200, zIndex: 83,
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
          ◈ INVESTMENT × REPORT COVERAGE
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
          { label: "POSITIONS", val: rows.length,  color: CY },
          { label: "REPORTS",   val: rptCount,     color: CY },
          { label: "COVERED",   val: covered,       color: GREEN },
          { label: "DARK",      val: dark,           color: dark > 0 ? AMBER : MUTED },
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
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
              background: filter === f ? (FILTER_COLOR[f] ?? CY) + "22" : "transparent",
              border: `1px solid ${filter === f ? (FILTER_COLOR[f] ?? CY) : CY + "33"}`,
              color: filter === f ? (FILTER_COLOR[f] ?? CY) : MUTED,
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(10,20,35,0.7)",
            border: `1px solid ${CY}33`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9, padding: "2px 7px",
            outline: "none", width: 100,
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading && (
          <div style={{ color: MUTED, fontSize: 10, padding: 12, textAlign: "center" }}>
            loading…
          </div>
        )}
        {error && (
          <div style={{ color: "#FF3B6B", fontSize: 10, padding: 12 }}>
            {error}
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 10, padding: 12, textAlign: "center" }}>
            no positions match
          </div>
        )}
        {filtered.map(inv => {
          const isExp = expanded === inv.id;
          const clrDot = FILTER_COLOR[inv.classification] ?? MUTED;
          return (
            <div
              key={inv.id}
              style={{
                borderBottom: `1px solid ${CY}11`,
                padding: "7px 14px",
              }}
            >
              {/* row header */}
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  cursor: "pointer",
                }}
                onClick={() => setExpanded(isExp ? null : inv.id)}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: clrDot, flexShrink: 0,
                  boxShadow: inv.classification === "DARK"
                    ? `0 0 5px ${AMBER}` : "none",
                }} />
                <span style={{
                  flex: 1, color: "#DCEBF5", fontSize: 11,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {inv.name}
                  {inv.ticker && (
                    <span style={{ color: CY, fontSize: 9, marginLeft: 5 }}>
                      [{inv.ticker}]
                    </span>
                  )}
                </span>
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: clrDot,
                }}>
                  {inv.classification}
                </span>
                <span style={{ color: MUTED, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {/* expanded */}
              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {inv.type && (
                    <div style={{ color: MUTED, fontSize: 9, marginBottom: 5 }}>
                      {inv.type}{inv.sector ? ` · ${inv.sector}` : ""}
                    </div>
                  )}

                  {/* matched reports */}
                  {inv.matched.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9, marginBottom: 6 }}>
                      no intelligence reports found for this position
                    </div>
                  ) : (
                    inv.matched.slice(0, 5).map(({ r, score }) => {
                      const maxScore = inv.matched[0]?.score || 1;
                      const pct = Math.round((score / maxScore) * 100);
                      return (
                        <div key={r.id} style={{
                          background: "rgba(10,20,35,0.6)", borderRadius: 4,
                          padding: "5px 8px", marginBottom: 4,
                          border: `1px solid ${CY}22`,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", marginBottom: 3,
                          }}>
                            <span style={{
                              color: "#DCEBF5", fontSize: 10,
                              flex: 1, whiteSpace: "nowrap",
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {r.title}
                            </span>
                            {r.type && (
                              <span style={{
                                marginLeft: 6, fontSize: 7, letterSpacing: 1,
                                color: CY, border: `1px solid ${CY}44`,
                                borderRadius: 3, padding: "1px 4px",
                                flexShrink: 0,
                              }}>
                                {r.type}
                              </span>
                            )}
                          </div>
                          {/* relevance bar */}
                          <div style={{
                            height: 2, background: `${CY}22`, borderRadius: 1,
                          }}>
                            <div style={{
                              height: "100%", width: `${pct}%`,
                              background: CY, borderRadius: 1,
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* assess button */}
                  <button
                    onClick={() => handleAssess(inv)}
                    disabled={assessing === inv.id}
                    style={{
                      marginTop: 4, fontFamily: MONO, fontSize: 8,
                      letterSpacing: 1, padding: "3px 10px",
                      background: assessing === inv.id ? `${CY}11` : `${CY}22`,
                      border: `1px solid ${CY}55`, color: CY,
                      borderRadius: 3, cursor: "pointer",
                    }}
                  >
                    {assessing === inv.id ? "assessing…" : "▶ ASSESS"}
                  </button>

                  {assessText[inv.id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${CY}09`, borderRadius: 4,
                      border: `1px solid ${CY}22`,
                      color: "#DCEBF5", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[inv.id]}
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
        padding: "4px 14px", borderTop: `1px solid ${CY}18`,
        color: MUTED, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>AUTO-REFRESH 90 S</span>
        <span>{loading ? "REFRESHING…" : `${filtered.length} / ${rows.length} SHOWN`}</span>
      </div>
    </div>
  );
}
