/**
 * F70 – Investment × RiskSignal × Scenario Portfolio Risk Map (INVRSM)
 * Cross-correlates /entities/Investment × /entities/RiskSignal × /v1/scenario/list.
 * Classifies each investment:
 *   HEDGED          – matched risk signal AND covering scenario
 *   RISK_FLAGGED    – matched risk signal, no covering scenario
 *   SCENARIO_PLANNED – matched scenario, no risk signal
 *   UNHEDGED        – no match in either (blind spot)
 * UNHEDGED rows pulse amber.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 952740;
const Z          = 652;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const PU   = "#a855f7";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const INVRSM_RE = /\b(invrsm|invest(ment)?.{0,14}(risk|scenario|hedge|unhedged|exposure|map|portfolio)|portfolio.{0,14}(risk|scenario|map)|risk.{0,14}invest(ment)?|unhedged.{0,14}invest(ment)?|investment.{0,14}coverage|portfolio.{0,14}coverage|risk.{0,14}portfolio)\b/i;

export function isInvrsmQuery(text) { return INVRSM_RE.test(text || ""); }

export async function buildInvrsmScript() {
  try {
    const base = apiBase();
    const [invRes, rskRes, scnRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,  { headers: authHdr() }),
      fetch(`${base}/entities/RiskSignal`,  { headers: authHdr() }),
      fetch(`${base}/v1/scenario/list`,     { headers: authHdr() }),
    ]);
    const [investments, risks, scenarios] = await Promise.all([
      invRes.ok ? invRes.json() : [],
      rskRes.ok ? rskRes.json() : [],
      scnRes.ok ? scnRes.json() : [],
    ]);
    const invArr = (Array.isArray(investments) ? investments : investments?.data ?? []).slice(0, 100);
    const rskArr = (Array.isArray(risks)       ? risks       : risks?.data       ?? []).slice(0, 200);
    const scnArr = (Array.isArray(scenarios)   ? scenarios   : scenarios?.data   ?? scenarios?.scenarios ?? []).slice(0, 200);
    const classified = classifyInvestments(invArr, rskArr, scnArr);
    const unhedged  = classified.filter(r => r.cls === "UNHEDGED").length;
    const hedged    = classified.filter(r => r.cls === "HEDGED").length;
    const riskOnly  = classified.filter(r => r.cls === "RISK_FLAGGED").length;
    const scnOnly   = classified.filter(r => r.cls === "SCENARIO_PLANNED").length;
    return `INVRSM portfolio risk map: ${invArr.length} investments, ${rskArr.length} risk signals, ${scnArr.length} scenarios. ` +
      `Coverage: HEDGED ${hedged}, RISK_FLAGGED ${riskOnly}, SCENARIO_PLANNED ${scnOnly}, UNHEDGED ${unhedged}. ` +
      (unhedged > 0
        ? `${unhedged} investment${unhedged !== 1 ? "s" : ""} have no risk signal or scenario coverage — portfolio blind spots requiring attention.`
        : "All investments have at least one risk signal or scenario anchor.");
  } catch (e) {
    return `INVRSM portfolio risk map unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyInvestments(investments, risks, scenarios) {
  return investments.map(inv => {
    const itoks = tok(
      (inv.name || inv.title || "") + " " +
      (inv.ticker || inv.symbol || "") + " " +
      (inv.sector || inv.industry || inv.type || "") + " " +
      (inv.description || inv.notes || "") + " " +
      (Array.isArray(inv.tags) ? inv.tags.join(" ") : "")
    );
    const matchedRisks = risks.filter(r =>
      overlap(itoks, tok(
        (r.name || r.title || "") + " " +
        (r.severity || "") + " " +
        (r.source || "") + " " +
        (r.description || r.summary || "") + " " +
        (Array.isArray(r.tags) ? r.tags.join(" ") : "")
      ))
    );
    const matchedScenarios = scenarios.filter(s =>
      overlap(itoks, tok(
        (s.name || s.title || s.id || "") + " " +
        (s.type || s.category || "") + " " +
        (s.description || s.summary || "") + " " +
        (Array.isArray(s.tags) ? s.tags.join(" ") : "")
      ))
    );
    const hasRisk = matchedRisks.length > 0;
    const hasScn  = matchedScenarios.length > 0;
    let cls;
    if (hasRisk && hasScn)       cls = "HEDGED";
    else if (hasRisk && !hasScn) cls = "RISK_FLAGGED";
    else if (!hasRisk && hasScn) cls = "SCENARIO_PLANNED";
    else                         cls = "UNHEDGED";
    return { inv, cls, matchedRisks, matchedScenarios };
  });
}

const CLS_COLOR = {
  HEDGED:            GR,
  RISK_FLAGGED:      RD,
  SCENARIO_PLANNED:  AM,
  UNHEDGED:          PU,
};
const CLS_LABEL = {
  HEDGED:            "HEDGED",
  RISK_FLAGGED:      "RISK FLAGGED",
  SCENARIO_PLANNED:  "SCENARIO PLANNED",
  UNHEDGED:          "UNHEDGED",
};
const TABS = ["ALL", "HEDGED", "RISK_FLAGGED", "SCENARIO_PLANNED", "UNHEDGED"];

export default function InvestmentRiskScenarioMap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [rskCount, setRskCount]   = useState(0);
  const [scnCount, setScnCount]   = useState(0);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [invRes, rskRes, scnRes] = await Promise.all([
        fetch(`${base}/entities/Investment`,  { headers: authHdr() }),
        fetch(`${base}/entities/RiskSignal`,  { headers: authHdr() }),
        fetch(`${base}/v1/scenario/list`,     { headers: authHdr() }),
      ]);
      const [investments, risks, scenarios] = await Promise.all([
        invRes.ok ? invRes.json() : [],
        rskRes.ok ? rskRes.json() : [],
        scnRes.ok ? scnRes.json() : [],
      ]);
      const invArr = (Array.isArray(investments) ? investments : investments?.data ?? []).slice(0, 100);
      const rskArr = (Array.isArray(risks)       ? risks       : risks?.data       ?? []).slice(0, 200);
      const scnArr = (Array.isArray(scenarios)   ? scenarios   : scenarios?.data   ?? scenarios?.scenarios ?? []).slice(0, 200);
      setRskCount(rskArr.length);
      setScnCount(scnArr.length);
      setRows(classifyInvestments(invArr, rskArr, scnArr));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); timerRef.current = setInterval(load, REFRESH_MS); }
    else { clearInterval(timerRef.current); }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:invrsm-toggle", handler);
    return () => window.removeEventListener("jarvis:invrsm-toggle", handler);
  }, []);

  const unhedged = rows.filter(r => r.cls === "UNHEDGED").length;
  const hedged   = rows.filter(r => r.cls === "HEDGED").length;
  const visible  = rows
    .filter(r => tab === "ALL" || r.cls === tab)
    .filter(r => {
      if (!search) return true;
      const name = r.inv.name || r.inv.title || r.inv.ticker || "";
      return name.toLowerCase().includes(search.toLowerCase());
    });

  async function assess() {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildInvrsmScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d     = await r.json();
      const reply = (d.answer || d.response || script).slice(0, 500);
      const voice = (typeof getActiveVoice === "function" ? getActiveVoice() : null) || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, voice }),
      });
    } catch (_) {}
    setAssessing(false);
  }

  const btnPulse = unhedged > 0;

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z,
          background: open ? `rgba(41,231,255,0.18)` : `rgba(5,12,20,0.82)`,
          border: `1px solid ${open ? CY : DIM}`,
          borderRadius: 6,
          color: open ? CY : DIM,
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.5,
          padding: "4px 9px",
          cursor: "pointer",
          whiteSpace: "nowrap",
          animation: btnPulse && !open ? "invrsm-pulse 2.4s ease-in-out infinite" : "none",
        }}
        title="Investment × RiskSignal × Scenario Portfolio Risk Map"
      >
        ◈ INVRSM
      </button>

      <style>{`
        @keyframes invrsm-pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(245,166,35,0); border-color: #3a5060; }
          50%      { box-shadow: 0 0 0 5px rgba(245,166,35,0.28); border-color: ${AM}; }
        }
      `}</style>

      {open && (
        <div
          style={{
            position: "fixed", right: 16, top: 64, zIndex: Z + 100,
            width: "min(660px, 96vw)",
            maxHeight: "82vh",
            display: "flex", flexDirection: "column",
            background: "rgba(5,12,20,0.95)",
            backdropFilter: "blur(16px)",
            border: `1px solid rgba(41,231,255,0.18)`,
            borderTop: `2px solid ${CY}`,
            borderRadius: 10,
            boxShadow: `0 0 60px rgba(41,231,255,0.10), 0 20px 48px rgba(0,0,0,0.75)`,
            fontFamily: SANS,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid rgba(41,231,255,0.09)`,
          }}>
            <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 1.5 }}>◈ INVRSM</span>
            <span style={{ color: "#5a7a8a", fontFamily: MONO, fontSize: 10, flex: 1, letterSpacing: 1 }}>
              INVESTMENT × RISK × SCENARIO PORTFOLIO MAP
            </span>
            {loading && <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>SYNC…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px 0" }}>
            {[
              { label: "INVESTMENTS",      val: rows.length, color: CY },
              { label: "RISK SIGNALS",     val: rskCount,    color: RD },
              { label: "SCENARIOS",        val: scnCount,    color: AM },
              { label: "HEDGED",           val: hedged,      color: GR },
              { label: "UNHEDGED",         val: unhedged,    color: PU },
            ].map(t => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid rgba(41,231,255,0.08)`, borderRadius: 6,
                padding: "7px 6px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontFamily: MONO, fontSize: 15, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: DIM, fontFamily: MONO, fontSize: 8, letterSpacing: 1.2, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "10px 14px 0", flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `rgba(41,231,255,0.12)` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}`,
                  borderRadius: 5, color: tab === t ? CY : DIM,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1.2,
                  padding: "3px 8px", cursor: "pointer",
                }}
              >
                {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${DIM}`,
                borderRadius: 5, color: "#a0c0cc",
                fontFamily: MONO, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 150,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 11, textAlign: "center", padding: "24px 0" }}>
                {loading ? "Loading portfolio map…" : "No investments match filter."}
              </div>
            )}
            {visible.map((r, i) => {
              const name  = r.inv.name || r.inv.title || r.inv.ticker || `Investment ${i + 1}`;
              const color = CLS_COLOR[r.cls];
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 10px", marginBottom: 3, borderRadius: 6,
                      background: isExp ? "rgba(41,231,255,0.05)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${isExp ? `rgba(41,231,255,0.18)` : "rgba(41,231,255,0.05)"}`,
                      cursor: "pointer",
                      borderLeft: `3px solid ${r.cls === "UNHEDGED" ? PU : color}`,
                      animation: r.cls === "UNHEDGED" ? "invrsm-pulse 2.4s ease-in-out infinite" : "none",
                    }}
                  >
                    <span style={{ color, fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 120 }}>
                      {CLS_LABEL[r.cls]}
                    </span>
                    <span style={{ flex: 1, color: "#b0ccd5", fontSize: 12, fontFamily: SANS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flexShrink: 0 }}>
                      {r.matchedRisks.length}rsk / {r.matchedScenarios.length}scn
                    </span>
                    <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      marginBottom: 6, padding: "8px 10px",
                      background: "rgba(41,231,255,0.02)",
                      border: "1px solid rgba(41,231,255,0.08)",
                      borderRadius: 6, borderLeft: `3px solid ${CY}44`,
                    }}>
                      {/* Risk Signals */}
                      {r.matchedRisks.length > 0 ? (
                        <>
                          <div style={{ color: RD, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginBottom: 5 }}>
                            RISK SIGNALS ({r.matchedRisks.length})
                          </div>
                          {r.matchedRisks.slice(0, 5).map((rsk, ri) => {
                            const rname = rsk.name || rsk.title || `Signal ${ri + 1}`;
                            const sev   = rsk.severity || "";
                            const w     = Math.round(50 + Math.random() * 45);
                            return (
                              <div key={ri} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: RD, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {rname}{sev ? ` · ${sev}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedRisks.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedRisks.length - 5} more signals</div>
                          )}
                        </>
                      ) : (
                        <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>No risk signal matches.</div>
                      )}

                      {/* Scenarios */}
                      {r.matchedScenarios.length > 0 && (
                        <>
                          <div style={{ color: AM, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, marginTop: 8, marginBottom: 5 }}>
                            SCENARIOS ({r.matchedScenarios.length})
                          </div>
                          {r.matchedScenarios.slice(0, 5).map((scn, si) => {
                            const sname = scn.name || scn.title || scn.id || `Scenario ${si + 1}`;
                            const stype = scn.type || scn.category || "";
                            const w     = Math.round(50 + Math.random() * 45);
                            return (
                              <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <div style={{ height: 4, width: `${w}%`, maxWidth: 180, background: AM, borderRadius: 2, opacity: 0.7 }} />
                                <span style={{ color: "#8aabb5", fontFamily: MONO, fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {sname}{stype ? ` · ${stype}` : ""}
                                </span>
                              </div>
                            );
                          })}
                          {r.matchedScenarios.length > 5 && (
                            <div style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>+{r.matchedScenarios.length - 5} more scenarios</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer: ASSESS */}
          <div style={{
            padding: "8px 14px",
            borderTop: `1px solid rgba(41,231,255,0.09)`,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.06)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${assessing ? DIM : CY}`,
                borderRadius: 5, color: assessing ? DIM : CY,
                fontFamily: MONO, fontSize: 10, letterSpacing: 1.5,
                padding: "5px 14px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9, flex: 1 }}>
              {rows.length} investments · {unhedged} unhedged
            </span>
            <span style={{ color: DIM, fontFamily: MONO, fontSize: 9 }}>
              auto-refresh 90s
            </span>
          </div>
        </div>
      )}

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(41,231,255,0.2); border-radius: 2px; }
      `}</style>
    </>
  );
}
