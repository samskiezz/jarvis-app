/**
 * F187 — Dataset × Scenario × Knowledge — Operational Readiness (DSKOR)
 *
 * Parallel-fetches /v1/datasets + /v1/scenario/list + /knowledge/ every 90 s.
 * Keyword-correlates each dataset against active scenarios AND knowledge articles:
 *
 *   FULLY_OPERATIONAL — matched ≥1 scenario AND ≥1 KB article
 *   SCENARIO_BACKED   — scenario coverage, no KB article indexed
 *   KB_BACKED         — KB article coverage, no scenario linkage
 *   UNINDEXED         — no scenario and no KB article coverage
 *
 * Stat tiles: datasets / scenarios / KB articles / operational / unindexed
 * Filter tabs: ALL | FULLY_OPERATIONAL | SCENARIO_BACKED | KB_BACKED | UNINDEXED
 * Text search on dataset name / type / description.
 * Expand row → matched scenarios (amber bars) + matched KB articles (cyan bars).
 * Orange badge + pulse on UNINDEXED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ DSKOR  at bottom:8 left:980260, zIndex:688.
 * Event:   jarvis:dskor-toggle
 * Voice:   "dskor / dataset readiness / operational readiness index /
 *           dataset scenario knowledge / dataset backing / dskor readiness"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 980_260;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const GREEN    = "#7FEFB4";
const ORANGE   = "#FF6B20";
const MONO     = "'JetBrains Mono',monospace";

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

const DSKOR_RE =
  /\b(dskor|dataset\s+readiness|operational\s+readiness\s+index|dataset\s+scenario\s+knowledge|dataset\s+backing|dskor\s+readiness)\b/i;

export function isDskorQuery(q) {
  return DSKOR_RE.test(q || "");
}

export async function buildDskorScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [dsr, scr, kbr] = await Promise.allSettled([
      fetch(`${base}/v1/datasets`,        { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/scenario/list`,   { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/knowledge/`,         { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const datasets   = toArr(dsr.value);
    const scenarios  = toArr(scr.value);
    const articles   = toArr(kbr.value);
    let unindexed = 0;
    datasets.forEach(ds => {
      const kws = keywords(ds);
      const hasScenario = scenarios.some(s => matchKws(kws, s));
      const hasKb       = articles.some(a => matchKws(kws, a));
      if (!hasScenario && !hasKb) unindexed++;
    });
    return `Operational Readiness: ${datasets.length} datasets assessed against ${scenarios.length} active scenarios and ${articles.length} knowledge articles. ${unindexed} datasets are UNINDEXED — no scenario linkage and no KB article coverage, representing operational blind spots requiring immediate documentation.`;
  } catch {
    return "DSKOR assessment unavailable.";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.items))     return v.items;
  if (Array.isArray(v.results))   return v.results;
  if (Array.isArray(v.data))      return v.data;
  if (Array.isArray(v.datasets))  return v.datasets;
  if (Array.isArray(v.scenarios)) return v.scenarios;
  if (Array.isArray(v.articles))  return v.articles;
  return [];
}

function txt(obj) {
  return [
    obj?.id, obj?.name, obj?.title, obj?.label,
    obj?.description, obj?.summary, obj?.type,
    obj?.category, obj?.entity_type, obj?.dataset_type,
    obj?.topic, obj?.subject,
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywords(ds) {
  return txt(ds).split(/\W+/).filter(w => w.length > 3);
}

function matchKws(kws, item) {
  if (!kws.length) return false;
  const haystack = txt(item);
  return kws.some(k => haystack.includes(k));
}

function classify(ds, scenarios, articles) {
  const kws        = keywords(ds);
  const hasScenario = scenarios.some(s => matchKws(kws, s));
  const hasKb       = articles.some(a => matchKws(kws, a));
  if (hasScenario && hasKb) return "FULLY_OPERATIONAL";
  if (hasScenario)          return "SCENARIO_BACKED";
  if (hasKb)                return "KB_BACKED";
  return "UNINDEXED";
}

const CLASS_COLORS = {
  FULLY_OPERATIONAL: CY,
  SCENARIO_BACKED:   AMBER,
  KB_BACKED:         GREEN,
  UNINDEXED:         ORANGE,
};

const CLASS_ORDER = ["FULLY_OPERATIONAL", "SCENARIO_BACKED", "KB_BACKED", "UNINDEXED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DatasetScenarioKnowledge() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [kbCount, setKbCount]         = useState(0);
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [dsr, scr, kbr] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`,      { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/knowledge/`,       { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const datasets  = toArr(dsr.value);
      const scenarios = toArr(scr.value);
      const articles  = toArr(kbr.value);
      setScenarioCount(scenarios.length);
      setKbCount(articles.length);
      setRows(datasets.map(ds => ({
        ds,
        cls: classify(ds, scenarios, articles),
        matchedScenarios: scenarios.filter(s => matchKws(keywords(ds), s)).slice(0, 5),
        matchedArticles:  articles.filter(a => matchKws(keywords(ds), a)).slice(0, 5),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isDskorQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:dskor-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:dskor-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildDskorScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(ans || script);
      window.dispatchEvent(new CustomEvent("jarvis:tts", { detail: { text: ans || script } }));
    } catch {
      const fallback = await buildDskorScript();
      setAssessment(fallback);
    }
    setAssessing(false);
  }

  const unindexedCount = rows.filter(r => r.cls === "UNINDEXED").length;

  const displayRows = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = txt(r.ds);
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const stats = CLASS_ORDER.reduce((acc, cls) => {
    acc[cls] = rows.filter(r => r.cls === cls).length;
    return acc;
  }, {});

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Dataset × Scenario × Knowledge — Operational Readiness (DSKOR)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 688,
          background: open ? ORANGE + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${unindexedCount > 0 ? ORANGE : "#334F62"}88`,
          borderRadius: 8, padding: "3px 8px", cursor: "pointer",
          color: open ? "#fff" : unindexedCount > 0 ? ORANGE : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          boxShadow: unindexedCount > 0 ? `0 0 10px ${ORANGE}44` : "none",
          animation: unindexedCount > 0 ? "dskor-pulse 2s infinite" : "none",
        }}
      >
        ◈ DSKOR{unindexedCount > 0 ? ` ${unindexedCount}!` : ""}
      </button>
      <style>{`
        @keyframes dskor-pulse {
          0%,100% { box-shadow: 0 0 10px ${ORANGE}44; }
          50%      { box-shadow: 0 0 20px ${ORANGE}88; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", left: Math.max(8, BTN_LEFT - 340), bottom: 36, zIndex: 688,
          width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${ORANGE}22`,
          fontFamily: MONO,
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>◈ DSKOR</span>
            <span style={{ color: "#334F62", fontSize: 9 }}>operational readiness</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#334F62",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 10px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              ["DATASETS",    rows.length,           CY],
              ["SCENARIOS",   scenarioCount,         AMBER],
              ["KB ARTICLES", kbCount,               GREEN],
              ["OPERATIONAL", stats.FULLY_OPERATIONAL, CY],
              ["UNINDEXED",   unindexedCount,        ORANGE],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "3px 7px", textAlign: "center", minWidth: 54,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#334F62", fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "4px 8px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)} style={{
                background: filter === cls ? `${CLASS_COLORS[cls] || CY}22` : "transparent",
                border: `1px solid ${filter === cls ? (CLASS_COLORS[cls] || CY) : "#1A2A38"}`,
                borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                color: filter === cls ? (CLASS_COLORS[cls] || CY) : "#334F62",
                fontSize: 8, letterSpacing: 0.5,
              }}>{cls === "ALL" ? `ALL (${rows.length})` : `${cls} (${stats[cls] || 0})`}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                padding: "4px 8px", color: CY, fontSize: 10,
                fontFamily: MONO, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "16px", color: "#334F62", fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "loading…" : "no matches"}
              </div>
            ) : displayRows.map((row, i) => {
              const { ds, cls, matchedScenarios, matchedArticles } = row;
              const col   = CLASS_COLORS[cls];
              const label = ds?.name || ds?.title || ds?.label || ds?.id || `Dataset ${i + 1}`;
              const type  = ds?.type || ds?.dataset_type || ds?.category || "";
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0A`, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.04)" : "transparent",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0,
                      boxShadow: cls === "UNINDEXED" ? `0 0 6px ${ORANGE}` : "none",
                    }} />
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</span>
                    {type && (
                      <span style={{ color: "#334F62", fontSize: 8, flexShrink: 0 }}>
                        {String(type).slice(0, 8).toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: col, fontSize: 8, flexShrink: 0 }}>{cls}</span>
                    <span style={{ color: "#334F62", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "4px 12px 8px" }}>
                      {ds?.description && (
                        <div style={{ color: "#5A7A90", fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                          {ds.description.slice(0, 120)}
                        </div>
                      )}
                      {/* Scenarios */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: AMBER, fontSize: 8, marginBottom: 3 }}>
                          SCENARIOS ({matchedScenarios.length})
                        </div>
                        {matchedScenarios.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedScenarios.map((s, si) => (
                            <div key={si} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: AMBER,
                                  width: `${Math.min(100, 40 + si * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(s?.name || s?.title || s?.id || "Scenario").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      {/* KB articles */}
                      <div>
                        <div style={{ color: GREEN, fontSize: 8, marginBottom: 3 }}>
                          KB ARTICLES ({matchedArticles.length})
                        </div>
                        {matchedArticles.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedArticles.map((a, ai) => (
                            <div key={ai} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: GREEN,
                                  width: `${Math.min(100, 40 + ai * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(a?.name || a?.title || a?.id || "Article").slice(0, 50)}
                              </div>
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

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} datasets · {scenarioCount} scenarios · {kbCount} KB articles
          </div>
        </div>
      )}
    </>
  );
}
