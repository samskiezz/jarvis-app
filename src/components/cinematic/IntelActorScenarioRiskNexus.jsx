/**
 * F169 — IntelProfile × Scenario × RiskSignal Actor Threat Nexus (ATHNEX)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/scenario/list + /entities/RiskSignal and
 * keyword-correlates each threat actor profile against scenario playbooks AND risk signals
 * to classify:
 *
 *   FULLY_TRACKED   — matched both a scenario AND a risk signal
 *   SCENARIO_MAPPED — matched a scenario, no risk signal
 *   RISK_MONITORED  — matched a risk signal, no scenario
 *   UNTRACKED       — no matches (threat blind spot)
 *
 * Stat tiles: PROFILES / SCENARIOS / RISK SIGNALS + all four class counts + TRACKED%.
 * Red badge on untracked count.
 * Filter tabs ALL / FULLY_TRACKED / SCENARIO_MAPPED / RISK_MONITORED / UNTRACKED + text search.
 * Expand profile → matched scenario cards (cyan, type badge) +
 *                  matched risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS THREAT NEXUS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:athnex-toggle event.
 *
 * Voice triggers: "athnex / actor threat nexus / tracked actor / untracked actor /
 *                  threat actor scenario / intel profile risk / actor threat coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_037_000;
const Z_INDEX  = 230;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ATHNEX_RE = /\b(athnex|actor[\s-]threat[\s-]nexus|tracked[\s-]actor|untracked[\s-]actor|threat[\s-]actor[\s-]scenario|intel[\s-]profile[\s-]risk|actor[\s-]threat[\s-]coverage)\b/i;

const RD     = "#EF4444";
const CY     = "#00CFFF";
const OR     = "#F97316";
const AM     = "#F59E0B";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(239,68,68,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_TRACKED:   "#22C55E",
  SCENARIO_MAPPED: CY,
  RISK_MONITORED:  OR,
  UNTRACKED:       RD,
};

const TABS = ["ALL", "FULLY_TRACKED", "SCENARIO_MAPPED", "RISK_MONITORED", "UNTRACKED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function profileText(p) {
  return `${p.name || p.title || ""} ${p.aliases ? (Array.isArray(p.aliases) ? p.aliases.join(" ") : p.aliases) : ""} ${p.org || p.organisation || p.organization || ""} ${p.role || ""} ${p.description || p.summary || ""} ${(p.tags || []).join(" ")}`;
}
function scenarioText(s) {
  return `${s.name || s.title || ""} ${s.description || s.summary || ""} ${s.type || ""} ${(s.tags || []).join(" ")}`;
}
function signalText(sig) {
  return `${sig.title || sig.name || ""} ${sig.description || sig.summary || ""} ${sig.source || ""} ${(sig.tags || []).join(" ")}`;
}
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
function severityColor(sev = "") {
  const s = sev.toLowerCase();
  if (s === "critical") return RD;
  if (s === "high")     return OR;
  if (s === "medium")   return AM;
  return "#6B7280";
}

export function isAthnexQuery(q = "") { return ATHNEX_RE.test(q); }

export async function buildAthnexScript() {
  try {
    const [profRes, scRes, sigRes] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/entities/RiskSignal`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const profData = await profRes.json().catch(() => ({}));
    const scData   = await scRes.json().catch(() => ({}));
    const sigData  = await sigRes.json().catch(() => ({}));

    const profiles  = Array.isArray(profData) ? profData : (profData.data || profData.items || profData.profiles || profData.results || []);
    const scenarios = Array.isArray(scData)   ? scData   : (scData.data   || scData.items   || scData.scenarios  || scData.results || []);
    const signals   = Array.isArray(sigData)  ? sigData  : (sigData.data  || sigData.items  || sigData.signals   || sigData.results || []);

    let ft = 0, sm = 0, rm = 0, un = 0;
    for (const p of profiles) {
      const kws  = keywords(profileText(p));
      const hasS = scenarios.some(s  => score(scenarioText(s),   kws) > 0);
      const hasR = signals.some(sig  => score(signalText(sig),   kws) > 0);
      if (hasS && hasR)  ft++;
      else if (hasS)     sm++;
      else if (hasR)     rm++;
      else               un++;
    }
    const total = profiles.length;
    const pct   = total ? Math.round((ft / total) * 100) : 0;
    return `ATHNEX Actor Threat Nexus online. ${total} intel profiles cross-referenced against ${scenarios.length} scenario playbooks and ${signals.length} risk signals. ${ft} fully tracked (${pct}%), ${sm} scenario-mapped, ${rm} risk-monitored, ${un} untracked. ${un > 0 ? `${un} threat actors have no scenario or risk signal coverage — threat blind spot detected.` : "Full actor threat coverage confirmed."}`;
  } catch {
    return "ATHNEX Actor Threat Nexus online, sir. Cross-referencing intel profiles against scenario playbooks and risk signals to surface untracked threat actors now.";
  }
}

export default function IntelActorScenarioRiskNexus() {
  const [open, setOpen]           = useState(false);
  const [profiles, setProfiles]   = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [signals, setSignals]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessment, setAssess]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [profRes, scRes, sigRes] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/entities/RiskSignal`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const profData = await profRes.json().catch(() => ({}));
      const scData   = await scRes.json().catch(() => ({}));
      const sigData  = await sigRes.json().catch(() => ({}));

      const rawProf = Array.isArray(profData) ? profData : (profData.data || profData.items || profData.profiles || profData.results || []);
      const rawSc   = Array.isArray(scData)   ? scData   : (scData.data   || scData.items   || scData.scenarios  || scData.results || []);
      const rawSig  = Array.isArray(sigData)  ? sigData  : (sigData.data  || sigData.items  || sigData.signals   || sigData.results || []);

      const enriched = rawProf.map(p => {
        const kws = keywords(profileText(p));
        const matchedSc = rawSc
          .map(s => ({ sc: s, rel: score(scenarioText(s), kws) }))
          .filter(x => x.rel > 0)
          .sort((a, b) => b.rel - a.rel)
          .slice(0, 5);
        const matchedSig = rawSig
          .map(sig => ({ sig, rel: score(signalText(sig), kws) }))
          .filter(x => x.rel > 0)
          .sort((a, b) => {
            if (b.rel !== a.rel) return b.rel - a.rel;
            const sa = SEVERITY_ORDER[a.sig.severity?.toLowerCase()] ?? 4;
            const sb = SEVERITY_ORDER[b.sig.severity?.toLowerCase()] ?? 4;
            return sa - sb;
          })
          .slice(0, 5);
        const hasS = matchedSc.length > 0;
        const hasR = matchedSig.length > 0;
        const cls  = hasS && hasR ? "FULLY_TRACKED" : hasS ? "SCENARIO_MAPPED" : hasR ? "RISK_MONITORED" : "UNTRACKED";
        return { ...p, _cls: cls, _scenarios: matchedSc, _signals: matchedSig };
      });

      setProfiles(enriched);
      setScenarios(rawSc);
      setSignals(rawSig);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:athnex-toggle", toggle);
    return () => window.removeEventListener("jarvis:athnex-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    try {
      const ft = profiles.filter(p => p._cls === "FULLY_TRACKED").length;
      const un = profiles.filter(p => p._cls === "UNTRACKED").length;
      const ctx = `${profiles.length} intel profiles cross-referenced against ${scenarios.length} scenario playbooks and ${signals.length} risk signals. Fully tracked: ${ft}. Untracked: ${un}.`;
      const r   = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the actor threat nexus coverage. Context: ${ctx}` }),
      });
      const d   = await r.json().catch(() => ({}));
      const txt = (d.answer || d.response || "").trim();
      setAssess(txt);
      if (txt) {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        }).then(res => res.arrayBuffer()).then(ab => new Audio(URL.createObjectURL(new Blob([ab], { type: "audio/mpeg" }))).play()).catch(() => {});
      }
    } catch {
      setAssess("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const counts = { FULLY_TRACKED: 0, SCENARIO_MAPPED: 0, RISK_MONITORED: 0, UNTRACKED: 0 };
  profiles.forEach(p => { if (counts[p._cls] !== undefined) counts[p._cls]++; });
  const pct = profiles.length ? Math.round((counts.FULLY_TRACKED / profiles.length) * 100) : 0;

  const filtered = profiles.filter(p => {
    const matchTab  = tab === "ALL" || p._cls === tab;
    const matchSrch = !search || profileText(p).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  const toggleExpand = id => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const FT_COLOR = CLASS_COLOR.FULLY_TRACKED;

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
          color: RD, fontFamily: FONT, fontSize: 9, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          boxShadow: "0 0 8px rgba(239,68,68,0.12)",
        }}
      >
        ◈ ATHNEX
        {counts.UNTRACKED > 0 && (
          <span style={{ marginLeft: 5, background: RD, color: "#fff", borderRadius: 3,
            padding: "1px 5px", fontSize: 8 }}>{counts.UNTRACKED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 400, zIndex: Z_INDEX,
      width: 520, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: "#ccc", boxShadow: "0 0 32px rgba(239,68,68,0.12)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ color: RD, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ ATHNEX</span>
          <span style={{ marginLeft: 8, fontSize: 9, color: "#666" }}>
            Intel Profile × Scenario × Risk Signal Nexus
          </span>
        </div>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px",
        borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["PROFILES",       profiles.length,             OR],
          ["SCENARIOS",      scenarios.length,            CY],
          ["RISK SIGNALS",   signals.length,              RD],
          ["FULLY TRACKED",  counts.FULLY_TRACKED,        FT_COLOR],
          ["SCEN. MAPPED",   counts.SCENARIO_MAPPED,      CY],
          ["RISK MONITORED", counts.RISK_MONITORED,       OR],
          ["UNTRACKED",      counts.UNTRACKED,            RD],
          ["TRACKED%",       `${pct}%`, pct >= 60 ? FT_COLOR : pct >= 30 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ flex: "1 1 80px", background: "rgba(0,0,0,0.3)",
            border: `1px solid ${col}22`, borderRadius: 4, padding: "4px 6px", minWidth: 70 }}>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${pct}%`, background: FT_COLOR,
            borderRadius: 2, transition: "width .5s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px",
        borderBottom: `1px solid ${BORDER}`, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLASS_COLOR[t] || RD}22` : "none",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || RD) : "#333"}`,
            color: tab === t ? (CLASS_COLOR[t] || RD) : "#555",
            fontFamily: FONT, fontSize: 8, padding: "2px 8px",
            cursor: "pointer", borderRadius: 2, whiteSpace: "nowrap",
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{ width: "100%", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
            color: "#aaa", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {loading && <div style={{ padding: 12, color: "#555", fontSize: 10 }}>Loading…</div>}
        {error && <div style={{ padding: 12, color: RD, fontSize: 10 }}>Error: {error}</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: 12, color: "#555", fontSize: 10 }}>No intel profiles match.</div>
        )}
        {filtered.map((p, i) => {
          const id    = p.id || p._id || `prof-${i}`;
          const isExp = expanded[id];
          const col   = CLASS_COLOR[p._cls] || RD;
          const name  = p.name || p.title || p.alias || `Actor ${i + 1}`;
          const role  = p.role || p.type || p.category || "";
          return (
            <div key={id} style={{ marginBottom: 4, border: `1px solid ${col}22`,
              borderRadius: 4, background: "rgba(0,0,0,0.2)", overflow: "hidden" }}>
              <div
                onClick={() => toggleExpand(id)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 10px", cursor: "pointer" }}>
                <div>
                  <span style={{ fontSize: 11, color: "#ccc" }}>{name}</span>
                  {role && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{role}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{p._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched scenarios */}
                  {p._scenarios.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>SCENARIOS</div>
                      {p._scenarios.map(({ sc, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{sc.name || sc.title || `Scenario ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: CY, padding: "1px 5px",
                              background: "rgba(0,207,255,0.1)", borderRadius: 2 }}>{sc.type || sc.status || "SCENARIO"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched risk signals */}
                  {p._signals.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS</div>
                      {p._signals.map(({ sig, rel }, j) => {
                        const sev = sig.severity || sig.level || "";
                        return (
                          <div key={j} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                              <span style={{ fontSize: 10, color: "#ccc" }}>{sig.title || sig.name || `Signal ${j + 1}`}</span>
                              <span style={{ fontSize: 9, color: severityColor(sev), padding: "1px 5px",
                                background: `${severityColor(sev)}1A`, borderRadius: 2 }}>
                                {sev ? sev.toUpperCase() : "SIGNAL"}
                              </span>
                            </div>
                            <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                              <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                                background: severityColor(sev), borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {p._scenarios.length === 0 && p._signals.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No scenarios or risk signals matched this actor profile.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${assessing ? "#333" : RD}`,
          color: assessing ? "#555" : RD, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS THREAT NEXUS"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>

      {/* Refresh */}
      <div style={{ padding: "4px 14px", borderTop: `1px solid ${BORDER}`,
        display: "flex", justifyContent: "flex-end" }}>
        <button onClick={load} disabled={loading} style={{
          background: "none", border: "1px solid #333", color: "#555",
          fontFamily: FONT, fontSize: 9, padding: "2px 8px",
          cursor: loading ? "not-allowed" : "pointer", borderRadius: 2,
        }}>{loading ? "…" : "↺ refresh"}</button>
      </div>
    </div>
  );
}
