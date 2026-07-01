/**
 * F55 — Scenario × Risk Exposure Matrix
 *
 * Parallel-fetches /v1/scenario/list + /entities/RiskSignal and
 * keyword-correlates each scenario's name/objective against every risk
 * signal's title/category.  Surfaces which scenarios carry risk exposure
 * and which risks are not covered by any active scenario.
 *
 * Tabs:
 *   SCENARIOS — each scenario with its matched risk count + severity badge.
 *   RISKS     — each risk signal with the scenarios it touches.
 *
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence exposure brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCRISK  at bottom:8 left:11580, zIndex 69.
 * Voice:   "scenario risk / risk exposure / scenario exposure / scrisk"
 * Event:   jarvis:scrisk-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 11580;
const POLL_MS  = 120_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SCRISK_RE =
  /\b(scenario[\s-]+risk|risk[\s-]+exposure|scenario[\s-]+exposure|scrisk|scenario[\s-]+threat[\s-]+map|risk[\s-]+scenario[\s-]+matrix)\b/i;

export function isScenarioRiskQuery(q) { return SCRISK_RE.test(q); }

export async function buildScenarioRiskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scenRes, riskRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const scenarios = normaliseScenarios(await scenRes.json());
    const risks     = normaliseRisks(await riskRes.json());

    const exposed = scenarios.filter(
      (sc) => risks.some((r) => relevance(sc, r) > 0)
    ).length;
    const uncovered = risks.filter(
      (r) => !scenarios.some((sc) => relevance(sc, r) > 0)
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS scenario-risk exposure analysis: ${scenarios.length} scenarios on file, ` +
          `${risks.length} active risk signals, ${exposed} scenarios carry identifiable risk exposure, ` +
          `${uncovered} risk signals have no corresponding scenario coverage. ` +
          `Deliver a 2-sentence scenario-risk intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Scenario-risk exposure analysis complete, sir.").trim();
  } catch {
    return "Scenario-risk matrix is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.scenarios)          ? raw.scenarios
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.slice(0, 80).map((s, i) => ({
    id:        s.id        || String(i),
    name:      s.name      || s.title      || s.label      || `Scenario ${i + 1}`,
    objective: s.objective || s.description || s.summary   || "",
    status:    (s.status   || s.state      || "").toLowerCase(),
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.risk_signals)       ? raw.risk_signals
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : [];
  return arr.slice(0, 80).map((r, i) => ({
    id:       r.id       || String(i),
    title:    r.title    || r.name      || r.signal_name || `Risk ${i + 1}`,
    category: (r.category || r.type     || r.tags        || "").toString(),
    severity: (r.severity || r.level    || "").toLowerCase(),
  }));
}

function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]{}]+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, risk) {
  const sw = tokenise(`${scenario.name} ${scenario.objective}`);
  const rw = tokenise(`${risk.title} ${risk.category}`);
  return sw.filter((w) => rw.some((s) => s.includes(w) || w.includes(s))).length;
}

// ── severity colour ───────────────────────────────────────────────────────────

function sevColor(sev) {
  if (sev === "critical") return "#EF4444";
  if (sev === "high")     return "#F97316";
  if (sev === "medium")   return "#F59E0B";
  return C.blue;
}

function statusColor(st) {
  if (st === "running"  || st === "active")    return C.neon;
  if (st === "pending"  || st === "queued")    return C.gold;
  if (st === "failed"   || st === "error")     return C.red;
  if (st === "completed"|| st === "done")      return C.blue;
  return S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["SCENARIOS", "RISKS"];

export default function ScenarioRiskMatrix() {
  const [open,       setOpen]       = useState(false);
  const [scenarios,  setScenarios]  = useState([]);
  const [risks,      setRisks]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("SCENARIOS");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [scenRes, riskRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      ]);
      setScenarios(normaliseScenarios(await scenRes.json()));
      setRisks(normaliseRisks(await riskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:scrisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scrisk-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isScenarioRiskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  // Build correlation maps
  const scenarioRows = scenarios.map((sc) => {
    const matched = risks
      .map((r) => ({ ...r, score: relevance(sc, r) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, risks: matched, exposed: matched.length > 0 };
  });

  const riskRows = risks.map((r) => {
    const matched = scenarios
      .map((sc) => ({ ...sc, score: relevance(sc, r) }))
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...r, scenarios: matched, covered: matched.length > 0 };
  });

  const exposedCount  = scenarioRows.filter((s) => s.exposed).length;
  const uncoveredCount = riskRows.filter((r) => !r.covered).length;

  async function assess() {
    setAssessing(true);
    const text = await buildScenarioRiskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const panelLeft = Math.max(8, BTN_LEFT - 320);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scenario × Risk Exposure Matrix (◈ SCRISK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SCRISK{exposedCount > 0 && (
          <span style={{
            marginLeft: 4, background: "#F97316", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{exposedCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: panelLeft,
          width: 380,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SCENARIO × RISK
            </span>
            <button
              onClick={assess}
              disabled={assessing || scenarios.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || scenarios.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "SCEN",     val: scenarios.length,  color: C.blue  },
              { label: "RISKS",    val: risks.length,       color: C.gold  },
              { label: "EXPOSED",  val: exposedCount,       color: "#F97316" },
              { label: "NO COVER", val: uncoveredCount,     color: C.red   },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => { setTab(t); setExpanded(null); }} style={{
                flex: 1, background: tab === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${tab === t ? C.neon : S.border}`,
                color: tab === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && scenarios.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : tab === "SCENARIOS" ? (
              scenarioRows.length === 0 ? (
                <div style={{ color: S.text, padding: "12px 0" }}>No scenarios found.</div>
              ) : scenarioRows.map((sc) => (
                <div key={sc.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === sc.id ? null : sc.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${sc.exposed ? "#F97316" : C.neon}`,
                    }}
                  >
                    <span style={{ color: sc.exposed ? "#F97316" : C.neon, fontSize: 10, width: 10 }}>
                      {sc.exposed ? "⚠" : "●"}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px",
                    }}>
                      {sc.name}
                    </span>
                    {sc.status && (
                      <span style={{
                        fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                        color: statusColor(sc.status),
                        border: `1px solid ${statusColor(sc.status)}44`,
                        whiteSpace: "nowrap",
                      }}>
                        {sc.status}
                      </span>
                    )}
                    <span style={{
                      color: sc.exposed ? "#F97316" : S.text,
                      fontSize: "9px", minWidth: 38, textAlign: "right",
                    }}>
                      {sc.exposed ? `${sc.risks.length} RSK` : "clean"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>{expanded === sc.id ? "▴" : "▾"}</span>
                  </div>

                  {expanded === sc.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {sc.exposed ? sc.risks.map((r) => (
                        <div key={r.id} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{
                            color: S.textHi, fontSize: "9px", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {r.title}
                          </span>
                          <span style={{
                            fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap",
                            color: r.severity ? sevColor(r.severity) : S.text,
                          }}>
                            {r.severity ? `${r.severity} ` : ""}rel:{r.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                          No risk signals correlate with this scenario.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              riskRows.length === 0 ? (
                <div style={{ color: S.text, padding: "12px 0" }}>No risk signals found.</div>
              ) : riskRows.map((r) => (
                <div key={r.id} style={{ marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                      background: "rgba(0,0,0,0.25)",
                      borderLeft: `3px solid ${r.covered ? C.blue : C.red}`,
                    }}
                  >
                    <span style={{ color: r.covered ? C.blue : C.red, fontSize: 10, width: 10 }}>
                      {r.covered ? "◉" : "○"}
                    </span>
                    <span style={{
                      flex: 1, color: S.textHi, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px",
                    }}>
                      {r.title}
                    </span>
                    {r.severity && (
                      <span style={{
                        fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                        color: sevColor(r.severity),
                        border: `1px solid ${sevColor(r.severity)}44`,
                        whiteSpace: "nowrap",
                      }}>
                        {r.severity}
                      </span>
                    )}
                    <span style={{
                      color: r.covered ? C.blue : C.red,
                      fontSize: "9px", minWidth: 46, textAlign: "right",
                    }}>
                      {r.covered ? `${r.scenarios.length} SCEN` : "NO COVER"}
                    </span>
                    <span style={{ color: S.text, fontSize: 9 }}>{expanded === r.id ? "▴" : "▾"}</span>
                  </div>

                  {expanded === r.id && (
                    <div style={{
                      margin: "2px 0 2px 18px",
                      background: "rgba(0,0,0,0.18)", borderRadius: 4,
                      padding: "5px 8px",
                    }}>
                      {r.covered ? r.scenarios.map((sc) => (
                        <div key={sc.id} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                        }}>
                          <span style={{
                            color: S.textHi, fontSize: "9px", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {sc.name}
                          </span>
                          <span style={{
                            fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap",
                            color: statusColor(sc.status),
                          }}>
                            {sc.status || "—"} rel:{sc.score}
                          </span>
                        </div>
                      )) : (
                        <div style={{ color: C.red, fontSize: "9px", padding: "2px 0" }}>
                          No scenario covers this risk signal.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/scenario/list · /entities/RiskSignal · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
