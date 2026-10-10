/**
 * F190 — Investment × Scenario × RiskSignal Portfolio Risk Strategy Map (PRSMAP)
 *
 * Parallel-fetches /entities/Investment + /v1/scenario/list + /entities/RiskSignal
 * and keyword-correlates each investment against scenario playbooks AND risk signals to classify:
 *
 *   FULLY_HEDGED       — matched scenario + risk signal (portfolio fully defended)
 *   SCENARIO_PROTECTED — scenario match only, no risk signal
 *   RISK_MONITORED     — risk signal match only, no scenario
 *   EXPOSED            — no matches (portfolio blind spot)
 *
 * Stat tiles: INVESTMENTS / SCENARIOS / RISK SIGNALS + four class counts + HEDGED%.
 * Red badge on EXPOSED count.
 * Filter tabs ALL / FULLY_HEDGED / SCENARIO_PROTECTED / RISK_MONITORED / EXPOSED + text search.
 * Expand investment → matched scenario cards (cyan) + risk signal cards (red) with relevance bars.
 * ▶ ASSESS PORTFOLIO RISK → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:prsmap-toggle event.
 *
 * Voice triggers:
 *   "prsmap / investment risk / portfolio risk / risk strategy /
 *    exposed investment / portfolio hedge / scenario protected"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_048_760;
const Z_INDEX  = 251;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const PRSMAP_RE = /\b(prsmap|investment[\s-]risk|portfolio[\s-]risk|risk[\s-]strategy|exposed[\s-]investment|portfolio[\s-]hedge|scenario[\s-]protected)\b/i;

export function isPrsmapQuery(q = "") { return PRSMAP_RE.test(q); }

export async function buildPrsmapScript() {
  const base = apiBase();
  const [invRes, scenRes, riskRes] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const investments = (invRes.status  === "fulfilled" ? (invRes.value?.items  || invRes.value  || []) : []);
  const scenarios   = (scenRes.status === "fulfilled" ? (scenRes.value?.items || scenRes.value || []) : []);
  const risks       = (riskRes.status === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : []);
  const exposed = investments.filter(inv => {
    const kws = keywords(invText(inv));
    const hasSc = scenarios.some(s => scoreText(scenText(s), kws) > 0);
    const hasRk = risks.some(r => scoreText(riskText(r), kws) > 0);
    return !hasSc && !hasRk;
  }).length;
  const total  = investments.length;
  const hedged = total - exposed;
  const pct    = total ? Math.round((hedged / total) * 100) : 0;
  return `PRSMAP Portfolio Risk Strategy online, sir. I am correlating ${total} investments against ${scenarios.length} scenario playbooks and ${risks.length} risk signals. ${hedged} positions have defensive coverage — ${pct}% of the portfolio is hedged or monitored. ${exposed} investment${exposed === 1 ? "" : "s"} remain fully exposed with no matching scenario or risk signal. Recommend assigning playbooks and risk monitoring to those exposed positions immediately.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_HEDGED:       GR,
  SCENARIO_PROTECTED: CY,
  RISK_MONITORED:     AM,
  EXPOSED:            RD,
};

const SEV_COLOR = {
  critical: RD,
  high:     AM,
  medium:   PU,
  low:      GR,
};

const TABS = ["ALL", "FULLY_HEDGED", "SCENARIO_PROTECTED", "RISK_MONITORED", "EXPOSED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function invText(i) {
  return [i.name, i.title, i.description, i.type, i.sector, i.ticker, i.tags, i.asset_class].filter(Boolean).join(" ");
}
function scenText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.category, s.trigger].filter(Boolean).join(" ");
}
function riskText(r) {
  return [r.name, r.title, r.description, r.type, r.sector, r.tags, r.source, r.category].filter(Boolean).join(" ");
}

function classify(inv, scenarios, risks) {
  const kws = keywords(invText(inv));
  const matchedSc = scenarios
    .map(s => ({ ...s, _score: scoreText(scenText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedRk = risks
    .map(r => ({ ...r, _score: scoreText(riskText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasSc = matchedSc.length > 0;
  const hasRk = matchedRk.length > 0;
  let cls;
  if (hasSc && hasRk) cls = "FULLY_HEDGED";
  else if (hasSc)     cls = "SCENARIO_PROTECTED";
  else if (hasRk)     cls = "RISK_MONITORED";
  else                cls = "EXPOSED";
  return { ...inv, _cls: cls, _sc: matchedSc, _rk: matchedRk };
}

export default function InvestmentScenarioRiskMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [investments, setInvestments] = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [risks, setRisks]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [invRes, scenRes, riskRes] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const inv  = invRes.status  === "fulfilled" ? (invRes.value?.items  || invRes.value  || []) : [];
      const sc   = scenRes.status === "fulfilled" ? (scenRes.value?.items || scenRes.value || []) : [];
      const rk   = riskRes.status === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : [];
      setInvestments(inv);
      setScenarios(sc);
      setRisks(rk);
      setClassified(inv.map(i => classify(i, sc, rk)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:prsmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:prsmap-toggle", onToggle);
  }, []);

  const fullyHedged    = classified.filter(c => c._cls === "FULLY_HEDGED").length;
  const scenProtected  = classified.filter(c => c._cls === "SCENARIO_PROTECTED").length;
  const riskMonitored  = classified.filter(c => c._cls === "RISK_MONITORED").length;
  const exposed        = classified.filter(c => c._cls === "EXPOSED").length;
  const total          = classified.length;
  const hedgedPct      = total ? Math.round(((fullyHedged + scenProtected + riskMonitored) / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || invText(c).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Investments:${total} Scenarios:${scenarios.length} RiskSignals:${risks.length} FullyHedged:${fullyHedged} ScenarioProtected:${scenProtected} RiskMonitored:${riskMonitored} Exposed:${exposed} Hedged:${hedgedPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the portfolio risk strategy coverage and exposed investment gaps: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Investment × Scenario × RiskSignal Portfolio Risk Strategy Map (PRSMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? RD : "rgba(5,8,13,0.85)",
          border: `1px solid ${RD}`,
          color: open ? "#fff" : RD,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: exposed > 0 ? `0 0 8px ${RD}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ PRSMAP
        {exposed > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#fff",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{exposed}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 820, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: RD, fontWeight: 700, letterSpacing: 2 }}>PRSMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Investment × Scenario × RiskSignal — Portfolio Risk Strategy</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "INVESTMENTS",        val: investments.length, clr: CY },
              { label: "SCENARIOS",          val: scenarios.length,   clr: PU },
              { label: "RISK SIGNALS",       val: risks.length,       clr: RD },
              { label: "FULLY HEDGED",       val: fullyHedged,        clr: GR },
              { label: "SCEN PROTECTED",     val: scenProtected,      clr: CY },
              { label: "RISK MONITORED",     val: riskMonitored,      clr: AM },
              { label: "EXPOSED",            val: exposed,            clr: RD },
              { label: "HEDGED%",            val: `${hedgedPct}%`,    clr: hedgedPct >= 70 ? GR : hedgedPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${hedgedPct}%`, background: hedgedPct >= 70 ? GR : hedgedPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? RD : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? RD : "#334155"}`,
                color: tab === t ? "#fff" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No investments match current filter.</div>
            )}
            {visible.map((inv, i) => {
              const clr   = CLASS_COLOR[inv._cls] || RD;
              const isExp = expanded === i;
              return (
                <div key={inv.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 140 }}>{inv._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{inv.name || inv.title || "Unknown Investment"}</span>
                    {inv.type && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 4px" }}>{inv.type}</span>}
                    {inv.sector && <span style={{ color: "#94A3B8", fontSize: 8 }}>{inv.sector}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {inv._sc.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS ({inv._sc.length})</div>
                          {inv._sc.map((s, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(167,139,250,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.name || s.title || "Scenario"}</span>
                                {s.type && <span style={{ color: PU, fontSize: 8, border: `1px solid ${PU}33`, borderRadius: 2, padding: "0 3px" }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (s._score / 5) * 100)}%`, background: PU, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {inv._rk.length > 0 && (
                        <div>
                          <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS ({inv._rk.length})</div>
                          {inv._rk.map((r, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(239,68,68,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{r.name || r.title || "Risk Signal"}</span>
                                {r.severity && <span style={{ color: SEV_COLOR[(r.severity || "").toLowerCase()] || AM, fontSize: 8, border: `1px solid ${SEV_COLOR[(r.severity || "").toLowerCase()] || AM}33`, borderRadius: 2, padding: "0 3px" }}>{r.severity}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {inv._sc.length === 0 && inv._rk.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No scenario or risk signal coverage — investment fully exposed.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : RD, color: assessing ? "#6B7280" : "#fff",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS PORTFOLIO RISK"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/Investment · /v1/scenario/list · /entities/RiskSignal
            </span>
          </div>
        </div>
      )}
    </>
  );
}
