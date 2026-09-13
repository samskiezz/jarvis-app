import { useState, useEffect, useCallback } from "react";

const API = "";

export function isIrscntriQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("irscntri") ||
    t.includes("investment risk scenario") ||
    t.includes("portfolio risk scenario") ||
    t.includes("risk scenario investment") ||
    t.includes("investment triple nexus") ||
    t.includes("portfolio triple") ||
    t.includes("fully covered investment") ||
    t.includes("uncovered portfolio") ||
    t.includes("investment scenario risk") ||
    t.includes("portfolio coverage triple")
  );
}

export async function buildIrscntriScript() {
  try {
    const [iRes, rRes, sRes] = await Promise.all([
      fetch(`${API}/entities/Investment`),
      fetch(`${API}/entities/RiskSignal`),
      fetch(`${API}/v1/scenario/list`),
    ]);
    const investments = iRes.ok ? await iRes.json() : [];
    const risks = rRes.ok ? await rRes.json() : [];
    const scenarios = sRes.ok ? await sRes.json() : [];

    const iList = Array.isArray(investments) ? investments : investments.items ?? investments.data ?? [];
    const rList = Array.isArray(risks) ? risks : risks.items ?? risks.data ?? [];
    const sList = Array.isArray(scenarios) ? scenarios : scenarios.items ?? scenarios.data ?? [];

    let fullyCovered = 0, riskOnly = 0, scenarioOnly = 0, clear = 0;
    iList.forEach((inv) => {
      const name = (inv.name || inv.title || inv.ticker || inv.symbol || inv.id || "").toLowerCase();
      const token = name.split(/[\s_-]/)[0];
      if (token.length < 2) { clear++; return; }
      const hasR = rList.some((r) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(token));
      const hasS = sList.some((s) => (s.name || s.title || s.description || "").toLowerCase().includes(token));
      if (hasR && hasS) fullyCovered++;
      else if (hasR) riskOnly++;
      else if (hasS) scenarioOnly++;
      else clear++;
    });

    const total = iList.length;
    const pct = total ? ((fullyCovered / total) * 100).toFixed(1) : "0.0";
    return `IRSCNTRI Investment × Risk Signal × Scenario Triple Nexus: ${total} investments | ${rList.length} risk signals | ${sList.length} scenarios | ${fullyCovered} fully covered (${pct}%) | ${riskOnly} risk-only | ${scenarioOnly} scenario-only | ${clear} investments with no risk or scenario coverage.`;
  } catch (e) {
    return `IRSCNTRI: fetch error — ${e.message}`;
  }
}

function classify(inv, rList, sList) {
  const name = (inv.name || inv.title || inv.ticker || inv.symbol || inv.id || "").toLowerCase();
  const token = name.split(/[\s_-]/)[0];
  if (token.length < 2) return { type: "CLEAR", rMatches: [], sMatches: [] };
  const rMatches = rList.filter((r) => (r.name || r.title || r.description || r.signal || "").toLowerCase().includes(token));
  const sMatches = sList.filter((s) => (s.name || s.title || s.description || "").toLowerCase().includes(token));
  const hasR = rMatches.length > 0;
  const hasS = sMatches.length > 0;
  if (hasR && hasS) return { type: "FULLY_COVERED", rMatches, sMatches };
  if (hasR) return { type: "RISK_ONLY", rMatches, sMatches };
  if (hasS) return { type: "SCENARIO_ONLY", rMatches, sMatches };
  return { type: "CLEAR", rMatches, sMatches };
}

const TYPE_COLOR = {
  FULLY_COVERED: "#00ff88",
  RISK_ONLY: "#f87171",
  SCENARIO_ONLY: "#a78bfa",
  CLEAR: "#64748b",
};

const SEV_COLOR = { CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#eab308", LOW: "#22c55e" };

export default function InvestmentRiskScenarioTriple() {
  const [open, setOpen] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [risks, setRisks] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [iRes, rRes, sRes] = await Promise.all([
        fetch(`${API}/entities/Investment`),
        fetch(`${API}/entities/RiskSignal`),
        fetch(`${API}/v1/scenario/list`),
      ]);
      const ij = iRes.ok ? await iRes.json() : [];
      const rj = rRes.ok ? await rRes.json() : [];
      const sj = sRes.ok ? await sRes.json() : [];
      setInvestments(Array.isArray(ij) ? ij : ij.items ?? ij.data ?? []);
      setRisks(Array.isArray(rj) ? rj : rj.items ?? rj.data ?? []);
      setScenarios(Array.isArray(sj) ? sj : sj.items ?? sj.data ?? []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:irscntri-toggle", handler);
    return () => window.removeEventListener("jarvis:irscntri-toggle", handler);
  }, []);

  const classified = investments.map((inv) => ({ ...inv, ...classify(inv, risks, scenarios) }));

  const fullyCovered = classified.filter((i) => i.type === "FULLY_COVERED").length;
  const riskOnly = classified.filter((i) => i.type === "RISK_ONLY").length;
  const scenarioOnly = classified.filter((i) => i.type === "SCENARIO_ONLY").length;
  const clear = classified.filter((i) => i.type === "CLEAR").length;
  const pct = investments.length ? ((fullyCovered / investments.length) * 100).toFixed(1) : "0.0";

  const visible = classified.filter((inv) => {
    if (filter !== "ALL" && inv.type !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (inv.name || inv.title || inv.ticker || inv.symbol || inv.id || "").toLowerCase().includes(s);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildIrscntriScript();
      const res = await fetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: `IRSCNTRI portfolio triple nexus assessment: ${brief}. Identify the most exposed uncovered investments and propose 2 risk-mitigation actions.` }),
      });
      const data = res.ok ? await res.json() : {};
      const text = data.response || data.message || brief;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Risk Signal × Scenario Triple Nexus (IRSCNTRI)"
        style={{
          position: "fixed",
          left: 893500,
          bottom: 8,
          zIndex: 253,
          background: "#0f172a",
          border: "1px solid #334155",
          color: "#94a3b8",
          fontSize: 10,
          padding: "3px 7px",
          borderRadius: 4,
          cursor: "pointer",
          letterSpacing: "0.05em",
          fontFamily: "monospace",
        }}
      >
        ◈ IRSCNTRI
        {clear > 0 && (
          <span style={{ marginLeft: 5, background: "#92400e", color: "#fcd34d", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>
            {clear}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 60,
        right: 20,
        width: 540,
        maxHeight: "82vh",
        overflowY: "auto",
        background: "#0a0f1e",
        border: "1px solid #1e3a5f",
        borderRadius: 8,
        zIndex: 2530,
        fontFamily: "monospace",
        color: "#e2e8f0",
        boxShadow: "0 0 40px #1e3a5f55",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e3a5f", background: "#050d1a" }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: "#38bdf8", letterSpacing: "0.08em" }}>◈ IRSCNTRI — Investment × Risk × Scenario</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ background: "none", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer" }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 14, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, padding: "10px 14px" }}>
        {[
          { label: "Investments", val: investments.length, color: "#38bdf8" },
          { label: "Fully Covered", val: fullyCovered, color: "#00ff88" },
          { label: "Risk Only", val: riskOnly, color: "#f87171" },
          { label: "Scenario Only", val: scenarioOnly, color: "#a78bfa" },
          { label: "Coverage %", val: `${pct}%`, color: clear > 0 ? "#f59e0b" : "#00ff88" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* clear badge */}
      {clear > 0 && (
        <div style={{ margin: "0 14px 8px", background: "#1c1400", border: "1px solid #92400e", borderRadius: 4, padding: "5px 10px", fontSize: 11, color: "#fcd34d" }}>
          ⚠ {clear} investments with no risk signal or scenario coverage
        </div>
      )}

      {err && <div style={{ margin: "0 14px 8px", color: "#f87171", fontSize: 11 }}>Error: {err}</div>}
      {loading && <div style={{ margin: "0 14px 8px", color: "#38bdf8", fontSize: 11 }}>Loading…</div>}

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_COVERED", "RISK_ONLY", "SCENARIO_ONLY", "CLEAR"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? "#1e3a5f" : "#0f172a",
              border: `1px solid ${filter === f ? "#38bdf8" : "#334155"}`,
              color: filter === f ? "#7dd3fc" : "#64748b",
              fontSize: 10,
              padding: "3px 9px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ flex: 1, minWidth: 100, background: "#0f172a", border: "1px solid #334155", color: "#e2e8f0", fontSize: 10, padding: "3px 8px", borderRadius: 3, outline: "none" }}
        />
      </div>

      {/* investment list */}
      <div style={{ padding: "0 14px 14px" }}>
        {visible.slice(0, 80).map((inv, i) => {
          const id = inv.id || inv.name || inv.ticker || i;
          const isExp = expanded === id;
          const label = inv.name || inv.ticker || inv.symbol || inv.title || `Investment ${i + 1}`;
          return (
            <div
              key={id}
              onClick={() => setExpanded(isExp ? null : id)}
              style={{ cursor: "pointer", padding: "6px 8px", marginBottom: 4, background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 4 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 11, color: "#e2e8f0" }}>{label}</span>
                  {inv.sector && <span style={{ marginLeft: 6, fontSize: 9, color: "#64748b", background: "#0a0f1e", border: "1px solid #334155", borderRadius: 2, padding: "0 4px" }}>{inv.sector}</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR[inv.type] ?? "#94a3b8", background: "#0a0f1e", padding: "1px 6px", borderRadius: 3, border: `1px solid ${TYPE_COLOR[inv.type] ?? "#334155"}` }}>
                  {inv.type}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {inv.rMatches?.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "#f87171", marginBottom: 3 }}>Risk Signals ({inv.rMatches.length})</div>
                      {inv.rMatches.slice(0, 5).map((r, ri) => (
                        <div key={ri} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0808", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: SEV_COLOR[r.severity] ?? "#94a3b8", border: `1px solid ${SEV_COLOR[r.severity] ?? "#334155"}`, borderRadius: 2, padding: "0 4px" }}>{r.severity || "?"}</span>
                          {r.name || r.title || r.signal || r.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {inv.sMatches?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 3 }}>Scenarios ({inv.sMatches.length})</div>
                      {inv.sMatches.slice(0, 5).map((s, si) => (
                        <div key={si} style={{ fontSize: 10, color: "#94a3b8", padding: "2px 6px", background: "#1a0a28", borderRadius: 3, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 9, color: "#a78bfa", border: "1px solid #6d28d9", borderRadius: 2, padding: "0 4px" }}>{s.kind || s.type || "scn"}</span>
                          {s.name || s.title || s.id}
                        </div>
                      ))}
                    </div>
                  )}
                  {inv.rMatches?.length === 0 && inv.sMatches?.length === 0 && (
                    <div style={{ fontSize: 10, color: "#64748b" }}>No risk signal or scenario cross-references found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", padding: 12 }}>No investments match filter.</div>}
        {visible.length > 80 && <div style={{ fontSize: 10, color: "#64748b", textAlign: "center", padding: 4 }}>Showing 80 of {visible.length} — use search to narrow</div>}
      </div>

      {/* assess */}
      <div style={{ padding: "0 14px 14px" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ width: "100%", background: assessing ? "#0f172a" : "#1e3a5f", border: "1px solid #38bdf8", color: assessing ? "#64748b" : "#7dd3fc", fontSize: 11, padding: "7px 0", borderRadius: 4, cursor: assessing ? "default" : "pointer", letterSpacing: "0.06em" }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS — Portfolio Triple Coverage Brief"}
        </button>
      </div>
    </div>
  );
}
