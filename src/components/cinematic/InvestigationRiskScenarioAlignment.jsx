/**
 * F179 — Investigation × RiskSignal × Scenario — Active Threat Case Alignment (ATCA)
 *
 * Parallel-fetches /v1/investigations + /entities/RiskSignal + /v1/scenario/list every 90 s.
 * Keyword-correlates each open investigation against active risk signals AND running scenarios:
 *
 *   FULLY_TRACKED  — matched ≥1 risk signal AND ≥1 scenario
 *   RISK_ONLY      — risk signal matched, no scenario
 *   SCENARIO_ONLY  — scenario matched, no risk signal
 *   DARK           — neither — an investigation running with no threat or scenario alignment
 *
 * Stat tiles: investigations / risks / scenarios / fully tracked / dark
 * Filter tabs: ALL | FULLY_TRACKED | RISK_ONLY | SCENARIO_ONLY | DARK
 * Text search on investigation title / status.
 * Expand row → matched risks (red bars) + matched scenarios (amber bars).
 * Red badge + pulse on DARK count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence case alignment brief + TTS.
 *
 * Toggle:  ◈ ATCA  at bottom:8 left:973380, zIndex:680.
 * Event:   jarvis:atca-toggle
 * Voice:   "atca / active case alignment / investigation threats / case risk alignment /
 *           open case alignment / investigation scenario / threat case / dark investigation"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 973_380;
const POLL_MS  = 90_000;

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

const ATCA_RE =
  /\b(atca|active\s+case\s+alignment|investigation\s+threats?|case\s+risk\s+alignment|open\s+case\s+alignment|investigation\s+scenario|threat\s+case|dark\s+investigation)\b/i;

export function isAtcaQuery(q) { return ATCA_RE.test(q || ""); }

export async function buildAtcaScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [iRes, rRes, sRes] = await Promise.all([
      fetch(`${base}/v1/investigations`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
    ]);
    const investigations = normArr(await iRes.json(), ["investigations", "cases", "data", "items", "results"]);
    const risks          = normArr(await rRes.json(), ["riskSignals", "signals", "risks", "data", "items", "results"]);
    const scenarios      = normArr(await sRes.json(), ["scenarios", "data", "items", "results"]);

    const rows = classifyInvestigations(investigations, risks, scenarios);
    const dark = rows.filter((r) => r.cls === "DARK").length;
    const full = rows.filter((r) => r.cls === "FULLY_TRACKED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS active threat case alignment audit (ATCA): ${investigations.length} open investigations ` +
          `cross-referenced against ${risks.length} risk signals and ${scenarios.length} scenarios — ` +
          `${full} fully tracked (risk + scenario alignment), ${dark} dark investigations (no alignment). ` +
          `Give a 2-sentence operational case intelligence brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Active threat case alignment audit complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:atca-toggle"));
    return "Active threat case alignment analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(aKws, other) {
  const otherKws = new Set(kw(other));
  return aKws.filter((w) => otherKws.has(w)).length;
}

function classifyInvestigations(investigations, risks, scenarios) {
  return investigations.map((inv) => {
    const invKws = kw(inv);
    const matchedRisks = risks
      .map((r) => ({ ...r, score: score(invKws, r) }))
      .filter((r) => r.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedScenarios = scenarios
      .map((s) => ({ ...s, score: score(invKws, s) }))
      .filter((s) => s.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasRisk     = matchedRisks.length > 0;
    const hasScenario = matchedScenarios.length > 0;
    const cls =
      hasRisk && hasScenario ? "FULLY_TRACKED" :
      hasRisk                ? "RISK_ONLY" :
      hasScenario            ? "SCENARIO_ONLY" :
                               "DARK";

    return {
      id:     inv.id || inv._id || inv.case_id || String(Math.random()),
      title:  inv.title || inv.name || inv.summary || inv.description || "Unnamed Investigation",
      status: inv.status || inv.state || "",
      cls,
      matchedRisks,
      matchedScenarios,
      extra: inv,
    };
  });
}

// ── Style constants ───────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_TRACKED:  "#22D3EE",
  RISK_ONLY:      "#EF4444",
  SCENARIO_ONLY:  "#F59E0B",
  DARK:           "#6B7280",
};
const CLS_LABEL = {
  FULLY_TRACKED:  "FULLY TRACKED",
  RISK_ONLY:      "RISK ONLY",
  SCENARIO_ONLY:  "SCENARIO ONLY",
  DARK:           "DARK",
};

const TABS = ["ALL", "FULLY_TRACKED", "RISK_ONLY", "SCENARIO_ONLY", "DARK"];
const CY = "#22D3EE";
const RD = "#EF4444";
const AM = "#F59E0B";

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestigationRiskScenarioAlignment() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [riskCount, setRiskCount]   = useState(0);
  const [scenCount, setScenCount]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [iRes, rRes, sRes] = await Promise.all([
        fetch(`${base}/v1/investigations`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,     { headers: hdr }),
      ]);
      const investigations = normArr(await iRes.json(), ["investigations", "cases", "data", "items", "results"]);
      const risks          = normArr(await rRes.json(), ["riskSignals", "signals", "risks", "data", "items", "results"]);
      const scenarios      = normArr(await sRes.json(), ["scenarios", "data", "items", "results"]);
      setRiskCount(risks.length);
      setScenCount(scenarios.length);
      setRows(classifyInvestigations(investigations, risks, scenarios));
    } catch {
      /* backend may be down — keep stale rows */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:atca-toggle", toggle);
    return () => window.removeEventListener("jarvis:atca-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const darkCount     = rows.filter((r) => r.cls === "DARK").length;
  const fullCount     = rows.filter((r) => r.cls === "FULLY_TRACKED").length;
  const riskOnly      = rows.filter((r) => r.cls === "RISK_ONLY").length;
  const scenarioOnly  = rows.filter((r) => r.cls === "SCENARIO_ONLY").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.title + r.status).toLowerCase().includes(s);
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS ATCA investigation alignment audit: ${rows.length} investigations — ` +
            `${fullCount} fully tracked (risk + scenario), ${riskOnly} risk-only, ` +
            `${scenarioOnly} scenario-only, ${darkCount} dark (no alignment). ` +
            `Give a 2-sentence case intelligence brief — formal British butler tone.`,
        }),
      });
      const d   = await r.json();
      const txt = (d.answer || "Active threat case alignment assessment complete, sir.").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable at this time, sir.");
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 680,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: CY, letterSpacing: 2,
          boxShadow: darkCount > 0 ? `0 0 12px ${RD}88` : "none",
          animation: darkCount > 0 ? "atcaPulse 1.8s ease-in-out infinite" : "none",
        }}
      >
        ◈ ATCA
        {darkCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 9, padding: "1px 5px", fontSize: 9,
          }}>
            {darkCount}
          </span>
        )}
        <style>{`@keyframes atcaPulse{0%,100%{box-shadow:0 0 8px ${RD}55}50%{box-shadow:0 0 18px ${RD}}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 440, zIndex: 680,
      width: "min(500px,92vw)", maxHeight: "82vh", overflowY: "auto",
      background: "rgba(6,11,18,0.94)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 3, fontSize: 12 }}>◈ ATCA</span>
        <span style={{ color: "#6E8AA0", fontSize: 10 }}>ACTIVE THREAT CASE ALIGNMENT</span>
        <span style={{ marginLeft: "auto", cursor: "pointer", color: "#6E8AA0" }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[
          ["CASES",     rows.length,   CY],
          ["RISKS",     riskCount,     RD],
          ["SCENARIOS", scenCount,     AM],
          ["FULL",      fullCount,     CY],
          ["RISK ONLY", riskOnly,      RD],
          ["SCEN ONLY", scenarioOnly,  AM],
          ["DARK",      darkCount,     "#6B7280"],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(34,211,238,0.06)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 56,
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#1E3A4A"}`,
            borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#6E8AA0", letterSpacing: 1,
          }}>
            {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
          </button>
        ))}
      </div>
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="search investigations…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 8,
          background: "rgba(34,211,238,0.05)", border: `1px solid ${CY}33`,
          borderRadius: 5, padding: "4px 8px", color: "#DCEBF5", fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />

      {loading && <div style={{ color: "#6E8AA0", marginBottom: 8 }}>Loading investigations…</div>}

      {/* Investigation rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((row) => (
          <div key={row.id}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                background: "rgba(34,211,238,0.04)", border: `1px solid ${CLS_COLOR[row.cls]}33`,
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: CLS_COLOR[row.cls], flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.title}
              </span>
              {row.status && (
                <span style={{ fontSize: 9, color: "#6E8AA0", background: "rgba(0,0,0,0.3)",
                  padding: "1px 4px", borderRadius: 3 }}>
                  {row.status}
                </span>
              )}
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], letterSpacing: 1 }}>
                {CLS_LABEL[row.cls]}
              </span>
              <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                margin: "2px 0 2px 16px", padding: "8px 10px",
                background: "rgba(34,211,238,0.03)", border: `1px solid ${CY}22`,
                borderRadius: 6, display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                {/* Risk Signals */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: RD, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    RISK SIGNALS ({row.matchedRisks.length})
                  </div>
                  {row.matchedRisks.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedRisks.map((r, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {r.title || r.name || r.signal || `Risk ${i + 1}`}
                          </span>
                          <span style={{ color: RD }}>{r.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${RD}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, r.score * 20)}%`,
                            background: RD, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
                {/* Scenarios */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    SCENARIOS ({row.matchedScenarios.length})
                  </div>
                  {row.matchedScenarios.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedScenarios.map((s, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {s.name || s.title || s.scenario_id || `Scenario ${i + 1}`}
                          </span>
                          <span style={{ color: AM }}>{s.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${AM}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, s.score * 20)}%`,
                            background: AM, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", textAlign: "center", padding: "12px 0" }}>
            No investigations match current filter.
          </div>
        )}
      </div>

      {/* Assess button + result */}
      <div style={{ marginTop: 10 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(34,211,238,0.1)" : `${CY}18`,
          border: `1px solid ${CY}55`, borderRadius: 5, padding: "4px 12px",
          cursor: assessing ? "default" : "pointer", color: CY, fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
        }}>
          {assessing ? "⟳ assessing…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{
            marginTop: 8, padding: "7px 10px", background: "rgba(34,211,238,0.05)",
            border: `1px solid ${CY}33`, borderRadius: 6, fontSize: 11,
            color: "#DCEBF5", lineHeight: 1.5,
          }}>
            {assessment}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, color: "#334F62", fontSize: 9 }}>
        auto-refresh {POLL_MS / 1000}s · {rows.length} investigations · {riskCount} risks · {scenCount} scenarios
      </div>
    </div>
  );
}
