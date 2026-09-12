import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#FFB300";
const RD = "#FF4444";
const GR = "#44FF88";
const LM = "#CCFF44";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

const IRSECOV_RE =
  /\b(irsecov|investment[._-]?risk[._-]?scenario|invest[._-]?risk[._-]?scen|hedged[._-]?investment|exposed[._-]?investment|portfolio[._-]?risk[._-]?scenario|investment[._-]?hedge|investment[._-]?scenario|investment[._-]?mitigation|risk[._-]?backed[._-]?investment|scenario[._-]?backed[._-]?invest|invest[._-]?scenario[._-]?risk|investment[._-]?risk[._-]?triple|portfolio[._-]?hedge[._-]?coverage|unhedged[._-]?invest)\b/i;

export function isIrsecovQuery(t) {
  return IRSECOV_RE.test(t || "");
}

function tok(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((w) => w.length > 2);
}

function overlap(a, b) {
  const sa = new Set(tok(a));
  const sb = new Set(tok(b));
  let hits = 0;
  for (const w of sa) if (sb.has(w)) hits++;
  return sa.size ? hits / sa.size : 0;
}

function investHaystack(inv) {
  return [
    inv.name, inv.title, inv.symbol, inv.ticker, inv.sector, inv.type,
    inv.description, inv.notes, inv.category,
    ...(inv.tags || []),
  ].join(" ");
}

function riskNeedle(r) {
  return [r.name, r.title, r.type, r.category, r.description, r.severity, ...(r.tags || [])].join(" ");
}

function scenNeedle(s) {
  return [s.name, s.title, s.type, s.category, s.description, ...(s.tags || [])].join(" ");
}

function normaliseInvestments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["investments", "items", "results", "data", "records", "portfolio"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseRisks(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["risks", "signals", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseScenarios(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["scenarios", "items", "results", "data", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function bestScore(inv, items, needleFn) {
  const hay = investHaystack(inv);
  let best = 0;
  for (const it of items) {
    const s = overlap(hay, needleFn(it));
    if (s > best) best = s;
  }
  return best;
}

export async function buildIrsecovScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [ir, rr, sr] = await Promise.allSettled([
      fetch(`${base}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
    ]);
    const investments = normaliseInvestments(ir.status === "fulfilled" ? ir.value : []).slice(0, 100);
    const risks = normaliseRisks(rr.status === "fulfilled" ? rr.value : []).slice(0, 200);
    const scenarios = normaliseScenarios(sr.status === "fulfilled" ? sr.value : []).slice(0, 200);

    let fullyHedged = 0, atRisk = 0, scenBacked = 0, exposed = 0;
    for (const inv of investments) {
      const hasRisk = bestScore(inv, risks, riskNeedle) > 0.15;
      const hasScen = bestScore(inv, scenarios, scenNeedle) > 0.15;
      if (hasRisk && hasScen) fullyHedged++;
      else if (hasRisk) atRisk++;
      else if (hasScen) scenBacked++;
      else exposed++;
    }
    const total = investments.length;
    return (
      `Investment risk-scenario coverage: ${total} positions assessed — ` +
      `${fullyHedged} FULLY HEDGED (risk signal + scenario plan), ` +
      `${atRisk} AT RISK (risk signal, no scenario), ` +
      `${scenBacked} SCENARIO-BACKED (scenario plan, no active signal), ${exposed} EXPOSED (no risk or scenario coverage). ` +
      `${exposed > 0 ? `${exposed} investment${exposed > 1 ? "s" : ""} lack both risk signal alignment and scenario mitigation — recommend priority review.` : "All investments have risk or scenario coverage."}`
    );
  } catch {
    return "Investment risk-scenario coverage assessment unavailable.";
  }
}

const ScoreBar = ({ sc, color }) => (
  <div style={{ background: "#111", borderRadius: 2, height: 3, width: "100%", overflow: "hidden" }}>
    <div style={{ width: `${Math.round(sc * 100)}%`, background: color, height: "100%", transition: "width .3s" }} />
  </div>
);

const chip = (label, color = CY) => (
  <span
    style={{
      display: "inline-block",
      padding: "1px 6px",
      border: `1px solid ${color}`,
      borderRadius: 3,
      color,
      fontSize: 9,
      letterSpacing: 1,
      marginRight: 4,
    }}
  >
    {label}
  </span>
);

const TABS = ["ALL", "FULLY HEDGED", "AT RISK", "SCENARIO-BACKED", "EXPOSED"];

export default function InvestmentRiskScenarioCoverage() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [risks, setRisks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const [err, setErr] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [ir, rr, sr] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }).then((r) => r.json()),
      ]);
      setInvestments(normaliseInvestments(ir.status === "fulfilled" ? ir.value : []).slice(0, 100));
      setRisks(normaliseRisks(rr.status === "fulfilled" ? rr.value : []).slice(0, 200));
      setScenarios(normaliseScenarios(sr.status === "fulfilled" ? sr.value : []).slice(0, 200));
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() {
      setOpen((o) => {
        if (!o) load();
        return !o;
      });
    }
    window.addEventListener("jarvis:irsecov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:irsecov-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, 90_000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  function classify(inv) {
    const hasRisk = bestScore(inv, risks, riskNeedle) > 0.15;
    const hasScen = bestScore(inv, scenarios, scenNeedle) > 0.15;
    if (hasRisk && hasScen) return "FULLY HEDGED";
    if (hasRisk) return "AT RISK";
    if (hasScen) return "SCENARIO-BACKED";
    return "EXPOSED";
  }

  function matchedRisks(inv) {
    const hay = investHaystack(inv);
    return risks
      .map((r) => ({ r, sc: overlap(hay, riskNeedle(r)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  function matchedScenarios(inv) {
    const hay = investHaystack(inv);
    return scenarios
      .map((s) => ({ s, sc: overlap(hay, scenNeedle(s)) }))
      .filter((x) => x.sc > 0.05)
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 6);
  }

  const enriched = investments.map((inv) => ({ ...inv, _class: classify(inv) }));

  const fullyHedgedCount = enriched.filter((i) => i._class === "FULLY HEDGED").length;
  const atRiskCount = enriched.filter((i) => i._class === "AT RISK").length;
  const scenBackedCount = enriched.filter((i) => i._class === "SCENARIO-BACKED").length;
  const exposedCount = enriched.filter((i) => i._class === "EXPOSED").length;

  const filtered = enriched.filter((inv) => {
    if (tab !== "ALL" && inv._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (inv.name || "").toLowerCase().includes(q) ||
        (inv.title || "").toLowerCase().includes(q) ||
        (inv.symbol || "").toLowerCase().includes(q) ||
        (inv.ticker || "").toLowerCase().includes(q) ||
        (inv.sector || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessText("");
    try {
      const script = await buildIrsecovScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const answer = (d.answer || script).replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(answer);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      setAssessText(await buildIrsecovScript());
    } finally {
      setAssessing(false);
    }
  }

  function classColor(cl) {
    if (cl === "FULLY HEDGED") return GR;
    if (cl === "AT RISK") return RD;
    if (cl === "SCENARIO-BACKED") return LM;
    return AM;
  }

  const mono = { fontFamily: "'JetBrains Mono',monospace" };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Investment × RiskSignal × Scenario Triple Coverage (IRSECOV)"
        style={{
          position: "fixed",
          left: 745120,
          bottom: 8,
          zIndex: 359,
          background: "rgba(0,0,0,0.85)",
          border: `1px solid ${AM}`,
          borderRadius: 4,
          color: AM,
          fontSize: 9,
          padding: "3px 7px",
          cursor: "pointer",
          letterSpacing: 1,
          ...mono,
        }}
      >
        ◈ IRSECOV
        {exposedCount > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: RD,
              color: "#000",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 8,
            }}
          >
            {exposedCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        top: 16,
        width: 720,
        maxHeight: 640,
        background: "rgba(0,0,0,0.96)",
        border: `1px solid ${AM}`,
        borderRadius: 6,
        zIndex: 9600,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        ...mono,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: `1px solid ${AM}22`,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: AM, fontSize: 10, letterSpacing: 2, flex: 1 }}>
          ◈ INVESTMENT × RISK SIGNAL × SCENARIO — TRIPLE COVERAGE
        </span>
        {loading && <span style={{ color: AM, fontSize: 9 }}>LOADING…</span>}
        <button
          onClick={load}
          style={{ background: "none", border: `1px solid ${AM}44`, color: AM, fontSize: 9, padding: "2px 6px", cursor: "pointer", borderRadius: 3 }}
        >
          ↺
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${AM}22` }}>
        {[
          ["INVESTMENTS", investments.length, CY],
          ["RISK SIGNALS", risks.length, RD],
          ["SCENARIOS", scenarios.length, LM],
          ["FULLY HEDGED", fullyHedgedCount, GR],
          ["EXPOSED", exposedCount, AM],
        ].map(([label, val, color]) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: "#0a0a0a",
              border: `1px solid ${color}44`,
              borderRadius: 4,
              padding: "4px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ color, fontSize: 14 }}>{val}</div>
            <div style={{ color: "#666", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {investments.length > 0 && (
        <div style={{ padding: "4px 12px", borderBottom: `1px solid ${AM}22`, display: "flex", gap: 2, height: 6 }}>
          {[
            [fullyHedgedCount, GR],
            [scenBackedCount, LM],
            [atRiskCount, RD],
            [exposedCount, AM],
          ].map(([cnt, color], i) => (
            <div
              key={i}
              style={{
                width: `${(cnt / investments.length) * 100}%`,
                background: color,
                height: "100%",
                transition: "width .3s",
                borderRadius: 1,
              }}
            />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${AM}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${AM}22` : "none",
              border: `1px solid ${tab === t ? AM : "#333"}`,
              color: tab === t ? AM : "#666",
              fontSize: 8,
              padding: "2px 6px",
              cursor: "pointer",
              borderRadius: 3,
              letterSpacing: 1,
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="SEARCH INVESTMENTS…"
          style={{
            marginLeft: "auto",
            background: "#111",
            border: `1px solid ${AM}44`,
            color: AM,
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 3,
            outline: "none",
            width: 160,
          }}
        />
      </div>

      {/* Investment list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RD, fontSize: 9, padding: 8 }}>{err}</div>}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 9, padding: 12, textAlign: "center" }}>NO INVESTMENTS MATCH</div>
        )}
        {filtered.map((inv, i) => {
          const cls = inv._class;
          const color = classColor(cls);
          const isExp = expanded === i;
          const mRisks = isExp ? matchedRisks(inv) : [];
          const mScens = isExp ? matchedScenarios(inv) : [];
          return (
            <div
              key={i}
              style={{ borderBottom: `1px solid ${AM}11`, padding: "5px 0" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <span style={{ color: "#444", fontSize: 9, width: 24, flexShrink: 0 }}>
                  {isExp ? "▼" : "▶"}
                </span>
                <span style={{ color: "#ccc", fontSize: 10, flex: 1 }}>
                  {inv.name || inv.title || inv.symbol || inv.ticker || `Investment ${i + 1}`}
                </span>
                {inv.symbol && (
                  <span style={{ color: CY, fontSize: 9 }}>{inv.symbol}</span>
                )}
                {chip(cls, color)}
                {inv.sector && (
                  <span style={{ color: "#555", fontSize: 9 }}>{inv.sector}</span>
                )}
              </div>
              {isExp && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, paddingLeft: 30 }}>
                  {/* Matched risk signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: RD, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      RISK SIGNALS
                    </div>
                    {mRisks.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no risk signals matched</div>
                    ) : (
                      mRisks.map(({ r, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {r.name || r.title || r.id || `Signal ${j + 1}`}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                            {r.severity && chip(r.severity.toUpperCase(), r.severity === "CRITICAL" ? RD : AM)}
                            {r.category && chip(r.category.toUpperCase(), CY)}
                          </div>
                          <ScoreBar sc={sc} color={RD} />
                        </div>
                      ))
                    )}
                  </div>
                  {/* Matched scenarios */}
                  <div style={{ flex: 1 }}>
                    <div style={{ color: LM, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      SCENARIOS
                    </div>
                    {mScens.length === 0 ? (
                      <div style={{ color: "#444", fontSize: 9 }}>no scenarios matched</div>
                    ) : (
                      mScens.map(({ s, sc }, j) => (
                        <div key={j} style={{ marginBottom: 6 }}>
                          <div style={{ color: "#ccc", fontSize: 9, marginBottom: 2 }}>
                            {s.name || s.title || s.id || `Scenario ${j + 1}`}
                          </div>
                          <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                            {s.type && chip(s.type.toUpperCase(), LM)}
                            {s.category && chip(s.category.toUpperCase(), AM)}
                          </div>
                          <ScoreBar sc={sc} color={LM} />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${AM}22` }}>
        {assessText && (
          <div style={{ color: "#aaa", fontSize: 9, marginBottom: 6, lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || loading}
          style={{
            background: `${AM}22`,
            border: `1px solid ${AM}`,
            color: AM,
            fontSize: 9,
            padding: "4px 12px",
            cursor: assessing ? "wait" : "pointer",
            borderRadius: 3,
            letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS INVESTMENT RISK + SCENARIO COVERAGE"}
        </button>
      </div>
    </div>
  );
}
