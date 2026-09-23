/**
 * InvestmentRiskScenarioNexus — F50 (overnight 2026-09-13)
 * Sources: /entities/Investment × /entities/RiskSignal × /v1/scenario/list
 * Keyword-correlates each investment against risk signals AND scenarios:
 *   FULLY_EXPOSED   (investment has both matching risk signal + scenario)
 *   RISK_ONLY       (matched a risk signal but no scenario)
 *   SCENARIO_ONLY   (matched a scenario but no risk signal)
 *   UNMONITORED     (no risk signal or scenario matches)
 * Stat tiles: investments / fully exposed / risk only / scenario only / unmonitored.
 * Filter tabs: ALL / FULLY_EXPOSED / RISK_ONLY / SCENARIO_ONLY / UNMONITORED.
 * Text search on investment name/type/symbol.
 * Expand row → matched risk signals (red bars) + matched scenarios (amber bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * ◈ IRSNEX button (left:936400 bottom:8 zIndex:633).
 * Voice triggers: "irsnex" / "investment exposure" / "unmonitored investment" /
 *                 "investment risk scenario" / "risk exposure" / "scenario exposure".
 * Toggle: jarvis:irsnex-toggle event.
 * 90-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IRSNEX_RE =
  /\birsnex\b|investment.exposure|unmonitored.investment|investment.risk.scenario|risk.exposure|scenario.exposure|investment.scenario|investment.risk/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchInvestments() {
  const r = await fetch(`${apiBase()}/entities/Investment`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.investments) ? d.investments
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : [];
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.riskSignals) ? d.riskSignals
    : Array.isArray(d?.risks)       ? d.risks
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.results)     ? d.results
    : [];
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.scenarios) ? d.scenarios
    : Array.isArray(d?.data)      ? d.data
    : Array.isArray(d?.results)   ? d.results
    : [];
}

// ── keyword matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function overlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

function investmentTokens(inv) {
  return tokenize(
    [inv.name, inv.title, inv.symbol, inv.ticker, inv.type, inv.sector,
     inv.industry, inv.category, inv.description, inv.tags?.join?.(" ")].join(" ")
  );
}

function riskTokens(r) {
  return tokenize(
    [r.name, r.title, r.type, r.category, r.source, r.description,
     r.summary, r.tags?.join?.(" "), r.topic, r.signal].join(" ")
  );
}

function scenarioTokens(s) {
  return tokenize(
    [s.name, s.title, s.description, s.type, s.category,
     s.summary, s.tags?.join?.(" "), s.topic, s.objective].join(" ")
  );
}

function classifyInvestment(investment, risks, scenarios) {
  const iToks = investmentTokens(investment);
  const matchedRisks = risks
    .map((r) => ({ item: r, score: overlap(iToks, riskTokens(r)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedScenarios = scenarios
    .map((s) => ({ item: s, score: overlap(iToks, scenarioTokens(s)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasRisk     = matchedRisks.length > 0;
  const hasScenario = matchedScenarios.length > 0;
  const status =
    hasRisk && hasScenario ? "FULLY_EXPOSED"
    : hasRisk              ? "RISK_ONLY"
    : hasScenario          ? "SCENARIO_ONLY"
    :                        "UNMONITORED";

  return { investment, matchedRisks, matchedScenarios, status };
}

// ── exported voice helpers ────────────────────────────────────────────────────

export function isIrsnexQuery(q) {
  return IRSNEX_RE.test(q || "");
}

export async function buildIrsnexScript() {
  try {
    const [investments, risks, scenarios] = await Promise.all([
      fetchInvestments(), fetchRiskSignals(), fetchScenarios(),
    ]);
    const rows        = investments.map((inv) => classifyInvestment(inv, risks, scenarios));
    const unmonitored = rows.filter((r) => r.status === "UNMONITORED").length;
    const fully       = rows.filter((r) => r.status === "FULLY_EXPOSED").length;
    return (
      `Investment risk and scenario exposure nexus: ${rows.length} investments correlated against ` +
      `${risks.length} risk signals and ${scenarios.length} scenarios. ` +
      `${fully} investments are fully exposed with both risk signal and scenario coverage. ` +
      (unmonitored > 0
        ? `${unmonitored} investments are unmonitored — no risk signals or scenarios are aligned to them.`
        : "All investments have at least one risk signal or scenario aligned.")
    );
  } catch {
    return "Unable to fetch investment risk scenario nexus data at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "FULLY_EXPOSED", "RISK_ONLY", "SCENARIO_ONLY", "UNMONITORED"];

const STATUS_COLOR = {
  FULLY_EXPOSED:  RED,
  RISK_ONLY:      AMB,
  SCENARIO_ONLY:  CY,
  UNMONITORED:    PRP,
};

export default function InvestmentRiskScenarioNexus() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [investments, risks, scenarios] = await Promise.all([
        fetchInvestments(), fetchRiskSignals(), fetchScenarios(),
      ]);
      setRows(investments.map((inv) => classifyInvestment(inv, risks, scenarios)));
    } catch {
      /* silent — no fake data */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:irsnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:irsnex-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const unmonitoredCount = rows.filter((r) => r.status === "UNMONITORED").length;
  const fullyCount       = rows.filter((r) => r.status === "FULLY_EXPOSED").length;
  const riskOnly         = rows.filter((r) => r.status === "RISK_ONLY").length;
  const scenarioOnly     = rows.filter((r) => r.status === "SCENARIO_ONLY").length;

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const inv = r.investment;
      return [inv.name, inv.title, inv.symbol, inv.ticker, inv.type, inv.sector]
        .some((f) => (f || "").toLowerCase().includes(q));
    }
    return true;
  });

  async function assess() {
    const script = await buildIrsnexScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const tile = (label, val, col) => (
    <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 6,
      padding: "6px 8px", textAlign: "center", border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const maxScore = (arr) => Math.max(...arr.map((x) => x.score), 1);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:irsnex-toggle"))}
        style={{
          position: "fixed", left: 936400, bottom: 8, zIndex: 633,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${unmonitoredCount > 0 ? PRP : RED}55`,
          color: unmonitoredCount > 0 ? PRP : RED, borderRadius: 6, padding: "3px 9px",
          fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IRSNEX{unmonitoredCount > 0 && (
          <span style={{ marginLeft: 4, background: PRP, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9 }}>
            {unmonitoredCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)",
          zIndex: 10000, width: "min(780px,94vw)",
          background: "rgba(5,10,18,0.95)", border: `1px solid ${RED}44`,
          borderRadius: 14, padding: "18px 20px",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${RED}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "84vh", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 13,
                textShadow: `0 0 12px ${RED}` }}>INVESTMENT RISK SCENARIO NEXUS</span>
              <span style={{ marginLeft: 10, color: "#4A6070", fontSize: 10 }}>
                /entities/Investment × /entities/RiskSignal × /v1/scenario/list
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4A6070",
                cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {tile("INVESTMENTS",    rows.length,      CY)}
            {tile("FULLY EXPOSED",  fullyCount,       RED)}
            {tile("RISK ONLY",      riskOnly,         AMB)}
            {tile("SCENARIO ONLY",  scenarioOnly,     CY)}
            {tile("UNMONITORED",    unmonitoredCount, PRP)}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${STATUS_COLOR[f] || CY}22` : "transparent",
                  border: `1px solid ${filter === f ? (STATUS_COLOR[f] || CY) : "#2A3A4A"}`,
                  color: filter === f ? (STATUS_COLOR[f] || CY) : "#4A6070",
                  borderRadius: 6, padding: "3px 10px", fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                }}>
                {f}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${RED}44`, borderRadius: 6, color: "#DCEBF5",
                padding: "3px 10px", fontSize: 10, width: 160,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                No investments match
              </div>
            )}
            {visible.map((row, i) => {
              const inv   = row.investment;
              const isExp = expanded === i;
              const col   = STATUS_COLOR[row.status] || CY;
              const name  = (inv.name || inv.title || inv.symbol || "Investment").slice(0, 60);
              const type  = (inv.type || inv.sector || inv.category || "").slice(0, 30);
              const sym   = (inv.symbol || inv.ticker || "").slice(0, 10);
              return (
                <div key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 6, padding: "8px 10px",
                    background: isExp ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)",
                    border: `1px solid ${col}33`,
                    borderRadius: 8, cursor: "pointer",
                    borderLeft: row.status === "UNMONITORED" ? `3px solid ${PRP}` : `3px solid ${col}66`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 9, color: "#4A6070", marginTop: 2 }}>
                        {sym  && <span style={{ marginRight: 8, color: AMB }}>{sym}</span>}
                        {type && <span style={{ color: "#6E8AA0" }}>{type}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9, letterSpacing: 1, color: col,
                        border: `1px solid ${col}66`, borderRadius: 4, padding: "2px 6px",
                      }}>{row.status}</span>
                      <span style={{ color: "#4A6070", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Risk signals */}
                      <div>
                        <div style={{ fontSize: 9, color: RED, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED RISK SIGNALS ({row.matchedRisks.length})
                        </div>
                        {row.matchedRisks.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching risk signals</div>
                          : row.matchedRisks.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedRisks)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.name || x.item.title || x.item.signal || "Risk").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: RED, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* Scenarios */}
                      <div>
                        <div style={{ fontSize: 9, color: AMB, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED SCENARIOS ({row.matchedScenarios.length})
                        </div>
                        {row.matchedScenarios.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching scenarios</div>
                          : row.matchedScenarios.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedScenarios)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.name || x.item.title || "Scenario").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: AMB, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            alignItems: "center", borderTop: `1px solid ${RED}22`, paddingTop: 10 }}>
            <span style={{ fontSize: 9, color: "#4A6070" }}>
              {visible.length} / {rows.length} investments • auto-refresh 90 s
            </span>
            <button onClick={assess}
              style={{
                background: `${RED}18`, border: `1px solid ${RED}66`,
                color: RED, borderRadius: 6, padding: "4px 14px",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace",
              }}>
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}
    </>
  );
}
