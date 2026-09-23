/**
 * F113 — Scenario × RiskSignal × Investigation Triple (SRIT)
 *
 * Parallel-fetches /v1/scenario/list + /entities/RiskSignal + /v1/investigations,
 * then keyword-correlates each scenario (name/description/type/tags) against:
 *   • active risk signals  (title/description/severity/category/tags)
 *   • open investigations  (title/description/annotations/seeds)
 *
 * Classification:
 *   FULL_COVERAGE  — matched ≥1 risk signal AND ≥1 investigation
 *   RISK_ONLY      — matched risk signal(s), zero investigations
 *   CASE_ONLY      — matched investigation(s), zero risk signals
 *   DARK           — no match in either source
 *
 * Red badge on DARK count.
 * Stat tiles: scenarios / risk signals / investigations / dark
 * Filter tabs: ALL | FULL_COVERAGE | RISK_ONLY | CASE_ONLY | DARK + text search
 * Expand scenario → matched risk signals list + matched investigations list with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence triple-coverage brief + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SRIT  at left:3840 bottom:18 zIndex:68
 * Event:   jarvis:srit-toggle
 * Voice:   "scenario risk investigation / srit / dark scenarios / scenario triple /
 *           scenario coverage triple / risk investigation scenario / unlinked scenarios /
 *           scenario intelligence triple"
 * Refresh: 90 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 3840;
const POLL_MS  = 90_000;
const RED      = "#F87171";
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const CYAN     = "#67E8F9";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const PURPLE   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const SRIT_RE =
  /\b(scenario\s+risk\s+invest\w*|risk\s+invest\w*\s+scenario|srit|dark\s+scenario[s]?|scenario\s+triple|scenario\s+coverage\s+triple|risk\s+investigation\s+scenario|unlinked\s+scenario[s]?|scenario\s+intelligence\s+triple|scenario\s+risk\s+case)\b/i;

export function isSritQuery(q) { return SRIT_RE.test(q); }

export async function buildSritScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scRes, rsRes, invRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
      fetch(`${base}/v1/investigations`,   { headers: hdr }),
    ]);
    const scenarios     = scRes.ok  ? await scRes.json()  : [];
    const riskSignals   = rsRes.ok  ? await rsRes.json()  : [];
    const investigations = invRes.ok ? await invRes.json() : [];

    const scList  = Array.isArray(scenarios)     ? scenarios     : (scenarios.scenarios      || scenarios.items      || []);
    const rsList  = Array.isArray(riskSignals)   ? riskSignals   : (riskSignals.risk_signals || riskSignals.items    || []);
    const invList = Array.isArray(investigations)? investigations: (investigations.investigations || investigations.items || []);

    const dark = scList.filter(sc => {
      const tokens = `${sc.name||""} ${sc.description||""} ${(sc.tags||[]).join(" ")}`.toLowerCase().split(/\s+/);
      const hasRisk = rsList.some(r =>
        tokens.some(t => t.length > 3 && `${r.title||""} ${r.description||""} ${r.category||""} ${(r.tags||[]).join(" ")}`.toLowerCase().includes(t))
      );
      const hasInv = invList.some(i =>
        tokens.some(t => t.length > 3 && `${i.title||""} ${i.description||""}`.toLowerCase().includes(t))
      );
      return !hasRisk && !hasInv;
    }).length;

    const total = scList.length;
    return `Scenario-risk-investigation triple analysis: ${total} scenarios evaluated across ${rsList.length} risk signals and ${invList.length} investigations. ${dark} scenario${dark !== 1 ? "s" : ""} are DARK — no matching risk signal or investigation case found — representing your highest planning blind spots requiring immediate coverage.`;
  } catch {
    return "Unable to fetch scenario-risk-investigation triple data.";
  }
}

// ── keyword helpers ───────────────────────────────────────────────────────────

function tokens(text) {
  return String(text || "").toLowerCase().split(/\s+/).filter(t => t.length > 3);
}

function scoreAgainst(scTokens, target) {
  const haystack = `${target.title||target.name||""} ${target.description||""} ${target.category||target.type||""} ${(target.tags||[]).join(" ")}`.toLowerCase();
  const hits = scTokens.filter(t => haystack.includes(t));
  return hits.length;
}

function classify(sc, rsList, invList) {
  const toks = tokens(`${sc.name||""} ${sc.description||""} ${(sc.tags||[]).join(" ")}`);
  const matchedRs  = rsList.filter(r  => scoreAgainst(toks, r)  > 0);
  const matchedInv = invList.filter(i => scoreAgainst(toks, i)  > 0);
  const hasRisk = matchedRs.length  > 0;
  const hasInv  = matchedInv.length > 0;
  const label = hasRisk && hasInv ? "FULL_COVERAGE"
              : hasRisk           ? "RISK_ONLY"
              : hasInv            ? "CASE_ONLY"
              :                     "DARK";
  return { label, matchedRs, matchedInv };
}

// ── component ────────────────────────────────────────────────────────────────

export default function ScenarioRiskInvestigationTriple() {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [data,    setData]    = useState(null);
  const [tab,     setTab]     = useState("ALL");
  const [search,  setSearch]  = useState("");
  const [expanded,setExpanded]= useState({});
  const [assessing,setAssessing]=useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [scRes, rsRes, invRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`,    { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
        fetch(`${base}/v1/investigations`,   { headers: hdr }),
      ]);
      const sc  = scRes.ok  ? await scRes.json()  : [];
      const rs  = rsRes.ok  ? await rsRes.json()  : [];
      const inv = invRes.ok ? await invRes.json() : [];

      const scList  = Array.isArray(sc)  ? sc  : (sc.scenarios      || sc.items      || []);
      const rsList  = Array.isArray(rs)  ? rs  : (rs.risk_signals   || rs.items      || []);
      const invList = Array.isArray(inv) ? inv : (inv.investigations || inv.items     || []);

      const rows = scList.map(sc => ({ ...sc, ...classify(sc, rsList, invList) }));
      setData({ rows, rsList, invList });
    } catch (e) {
      setData({ rows: [], rsList: [], invList: [], error: String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = e => {
      setOpen(v => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:srit-toggle", handler);
    return () => window.removeEventListener("jarvis:srit-toggle", handler);
  }, [load]);

  const rows = data?.rows || [];
  const dark = rows.filter(r => r.label === "DARK").length;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.label !== tab) return false;
    if (!search) return true;
    return `${r.name||""} ${r.description||""}`.toLowerCase().includes(search.toLowerCase());
  });

  const assess = async () => {
    setAssessing(true);
    try {
      const script = await buildSritScript();
      const base = apiBase();
      const hdr  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: `Give a 2-sentence assessment: ${script}` }),
      });
      const j = await r.json();
      const text = j.response || j.reply || j.message || script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch { /* silent */ }
    setAssessing(false);
  };

  const labelColor = l =>
    l === "FULL_COVERAGE" ? GREEN : l === "RISK_ONLY" ? AMBER : l === "CASE_ONLY" ? BLUE : RED;

  const counts = {
    FULL_COVERAGE: rows.filter(r => r.label === "FULL_COVERAGE").length,
    RISK_ONLY:     rows.filter(r => r.label === "RISK_ONLY").length,
    CASE_ONLY:     rows.filter(r => r.label === "CASE_ONLY").length,
    DARK:          dark,
  };

  const TABS = ["ALL", "FULL_COVERAGE", "RISK_ONLY", "CASE_ONLY", "DARK"];

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scenario × Risk × Investigation Triple (SRIT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(5,8,13,0.80)", border: `1px solid ${RED}55`,
          color: RED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          padding: "4px 9px", borderRadius: 6, cursor: "pointer",
          boxShadow: dark > 0 ? `0 0 14px ${RED}44` : "none",
          backdropFilter: "blur(6px)", letterSpacing: 1,
          animation: dark > 0 ? "sritpulse 2s ease-in-out infinite" : "none",
        }}>
        ◈ SRIT
        {dark > 0 && (
          <span style={{ marginLeft: 6, background: RED, color: "#0a0d14", borderRadius: 4,
            padding: "1px 5px", fontSize: 10, fontWeight: 700 }}>{dark}</span>
        )}
        <style>{`@keyframes sritpulse{0%,100%{box-shadow:0 0 14px ${RED}44}50%{box-shadow:0 0 22px ${RED}88}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 380, bottom: 60, zIndex: 68,
      width: 480, maxHeight: "76vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,18,0.94)", border: `1px solid ${RED}44`,
      borderRadius: 12, overflow: "hidden", backdropFilter: "blur(12px)",
      boxShadow: `0 0 40px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 12,
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${RED}33`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ SCENARIO × RISK × INVESTIGATION TRIPLE</span>
        <button onClick={assess} disabled={assessing} style={{
          marginLeft: "auto", background: "transparent", border: `1px solid ${CYAN}55`,
          color: CYAN, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontSize: 10 }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: SLATE, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px", flexShrink: 0 }}>
        {[
          ["SCENARIOS",  rows.length,              CYAN],
          ["FULL COV",   counts.FULL_COVERAGE,     GREEN],
          ["RISK ONLY",  counts.RISK_ONLY,         AMBER],
          ["DARK",       counts.DARK,              RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 7,
            padding: "8px 6px", textAlign: "center", border: `1px solid ${col}33` }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{val}</div>
            <div style={{ color: SLATE, fontSize: 9, letterSpacing: 1, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexShrink: 0, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? RED + "33" : "transparent",
            border: `1px solid ${tab === t ? RED : SLATE + "44"}`,
            color: tab === t ? RED : SLATE, borderRadius: 5, padding: "2px 8px",
            cursor: "pointer", fontSize: 10, letterSpacing: 0.5,
          }}>{t}{t !== "ALL" ? ` (${counts[t] ?? ""})` : ""}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: `1px solid ${SLATE}44`,
            color: "#DCEBF5", borderRadius: 5, padding: "2px 8px", fontSize: 10, width: 100 }} />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 14px" }}>
        {loading && !data && (
          <div style={{ color: SLATE, textAlign: "center", padding: 20 }}>loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ color: SLATE, textAlign: "center", padding: 20 }}>no scenarios match</div>
        )}
        {filtered.map((row, i) => {
          const exp = expanded[i];
          return (
            <div key={i} style={{ marginBottom: 6, background: "rgba(255,255,255,0.03)",
              border: `1px solid ${labelColor(row.label)}33`, borderRadius: 8 }}>
              <div onClick={() => setExpanded(p => ({ ...p, [i]: !exp }))}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", cursor: "pointer" }}>
                <span style={{ color: labelColor(row.label), fontSize: 9, fontWeight: 700,
                  border: `1px solid ${labelColor(row.label)}55`, borderRadius: 4,
                  padding: "1px 5px", letterSpacing: 0.5, flexShrink: 0 }}>
                  {row.label}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.name || row.id || "—"}
                </span>
                <span style={{ color: SLATE, fontSize: 10 }}>
                  ±{row.matchedRs.length}R {row.matchedInv.length}I
                </span>
                <span style={{ color: SLATE, fontSize: 11 }}>{exp ? "▲" : "▼"}</span>
              </div>

              {exp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${SLATE}22` }}>
                  {/* risk signals */}
                  <div style={{ color: AMBER, fontSize: 10, letterSpacing: 1, margin: "6px 0 4px" }}>
                    RISK SIGNALS ({row.matchedRs.length})
                  </div>
                  {row.matchedRs.length === 0
                    ? <div style={{ color: SLATE, fontSize: 10, marginBottom: 4 }}>none</div>
                    : row.matchedRs.slice(0, 5).map((r, j) => {
                        const toks = tokens(`${row.name||""} ${row.description||""}`);
                        const score = scoreAgainst(toks, r);
                        const pct = Math.min(100, score * 20);
                        const sev = (r.severity || "").toUpperCase();
                        const sevCol = sev === "CRITICAL" ? RED : sev === "HIGH" ? AMBER : sev === "MEDIUM" ? BLUE : SLATE;
                        return (
                          <div key={j} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: sevCol, fontSize: 9, border: `1px solid ${sevCol}55`,
                                borderRadius: 3, padding: "0 4px", flexShrink: 0 }}>{sev || "—"}</span>
                              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.title || r.name || r.id}
                              </span>
                              <span style={{ color: SLATE, fontSize: 10 }}>{score}pt</span>
                            </div>
                            <div style={{ height: 3, background: SLATE + "33", borderRadius: 2, marginTop: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: AMBER, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}

                  {/* investigations */}
                  <div style={{ color: PURPLE, fontSize: 10, letterSpacing: 1, margin: "8px 0 4px" }}>
                    INVESTIGATIONS ({row.matchedInv.length})
                  </div>
                  {row.matchedInv.length === 0
                    ? <div style={{ color: SLATE, fontSize: 10 }}>none</div>
                    : row.matchedInv.slice(0, 5).map((inv, j) => {
                        const toks = tokens(`${row.name||""} ${row.description||""}`);
                        const score = scoreAgainst(toks, inv);
                        const pct = Math.min(100, score * 20);
                        return (
                          <div key={j} style={{ marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ flex: 1, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {inv.title || inv.name || inv.id}
                              </span>
                              <span style={{ color: SLATE, fontSize: 10 }}>{score}pt</span>
                            </div>
                            <div style={{ height: 3, background: SLATE + "33", borderRadius: 2, marginTop: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: PURPLE, borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
