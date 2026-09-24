/**
 * PortfolioThreatExposure — F73 (PTEXP)
 * ◈ PTEXP button (left:985480, bottom:8, zIndex:137)
 * Parallel-fetches /entities/Investment + /entities/RiskSignal + /entities/IntelProfile every 90 s.
 * Keyword-correlates each investment (name/type/sector/description/tags) against active risk
 * signals AND intel profiles:
 *   FULLY_EXPOSED  — ≥1 risk signal match AND ≥1 intel profile match
 *   RISK_EXPOSED   — risk signal match but no intel profile
 *   ACTOR_LINKED   — intel profile match but no risk signal
 *   CLEAR          — no threat signal, no linked actor
 * Amber badge on (FULLY_EXPOSED + RISK_EXPOSED) count.
 * Filter tabs ALL / FULLY_EXPOSED / RISK_EXPOSED / ACTOR_LINKED / CLEAR + text search.
 * Expand investment → matched risk signal cards (red) + matched intel profile cards (orange) with relevance bars.
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence portfolio threat brief + TTS.
 * Voice triggers: "ptexp / portfolio threat / investment threat / investment risk actor /
 *   asset exposure / portfolio exposure / threatened portfolio / exposed investments /
 *   portfolio threat exposure"
 * jarvis:ptexp-toggle event; 90-s auto-refresh.
 */
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const RD = "#EF4444";
const OR = "#F97316";
const GR = "#10B981";
const DIM = "#4A5568";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const PTEXP_RE =
  /\bptexp\b|\bportfolio.threat\b|\binvestment.threat\b|\binvestment.risk.actor\b|\basset.exposure\b|\bportfolio.exposure\b|\bthreatened.portfolio\b|\bexposed.investments?\b|\bportfolio.threat.exposure\b|\bportfolio.under.threat\b|\binvestment.security\b/i;

export function isPtexpQuery(text) {
  return PTEXP_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "this", "that", "from", "will", "can",
  "its", "any", "all", "new", "our", "your", "their", "about",
]);

function investmentTokens(inv) {
  return new Set(
    tokenise(
      `${inv.name || ""} ${inv.type || ""} ${inv.sector || ""} ${inv.description || ""} ${(inv.tags || []).join(" ")}`
    ).filter((t) => !STOP.has(t))
  );
}

function relevance(invTokens, otherText) {
  const otherTokens = tokenise(otherText).filter((t) => !STOP.has(t));
  if (!invTokens.size || !otherTokens.length) return 0;
  const matches = otherTokens.filter((t) => invTokens.has(t)).length;
  return Math.round((matches / Math.max(invTokens.size, 1)) * 100);
}

function riskFields(sig) {
  return `${sig.title || sig.name || ""} ${sig.description || ""} ${sig.category || ""} ${sig.sector || ""} ${(sig.tags || []).join(" ")}`;
}

function profileFields(prof) {
  return `${prof.name || ""} ${(prof.aliases || []).join(" ")} ${prof.org || ""} ${prof.role || ""} ${prof.sector || ""} ${(prof.tags || []).join(" ")} ${prof.description || ""}`;
}

function classify(riskMatches, actorMatches) {
  if (riskMatches.length > 0 && actorMatches.length > 0) return "FULLY_EXPOSED";
  if (riskMatches.length > 0) return "RISK_EXPOSED";
  if (actorMatches.length > 0) return "ACTOR_LINKED";
  return "CLEAR";
}

export async function buildPtexpScript() {
  const base = apiBase();
  const [invRes, riskRes, profRes] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
  ]);
  const invData = await invRes.json();
  const riskData = await riskRes.json();
  const profData = await profRes.json();

  const investments = Array.isArray(invData) ? invData : (invData.items || invData.data || []);
  const riskSignals = Array.isArray(riskData) ? riskData : (riskData.items || riskData.data || []);
  const profiles = Array.isArray(profData) ? profData : (profData.items || profData.data || []);

  let fullyExposed = 0;
  let riskExposed = 0;
  let actorLinked = 0;
  let clear = 0;

  for (const inv of investments) {
    const tokens = investmentTokens(inv);
    const rMatch = riskSignals.filter((s) => relevance(tokens, riskFields(s)) > 0);
    const aMatch = profiles.filter((p) => relevance(tokens, profileFields(p)) > 0);
    const cat = classify(rMatch, aMatch);
    if (cat === "FULLY_EXPOSED") fullyExposed++;
    else if (cat === "RISK_EXPOSED") riskExposed++;
    else if (cat === "ACTOR_LINKED") actorLinked++;
    else clear++;
  }

  const totalThreats = fullyExposed + riskExposed;
  if (investments.length === 0) return "No investment data available at this time, sir.";
  return `Portfolio threat exposure analysis complete, sir. Of ${investments.length} investment${investments.length !== 1 ? "s" : ""} assessed, ${totalThreats} are under active threat exposure — ${fullyExposed} fully exposed to both risk signals and threat actors, ${riskExposed} risk-exposed only, ${actorLinked} actor-linked without confirmed risk signal, and ${clear} clear. I recommend prioritising the ${fullyExposed} fully-exposed asset${fullyExposed !== 1 ? "s" : ""} for immediate risk mitigation review.`;
}

export default function PortfolioThreatExposure() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [investments, setInvestments] = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  const TABS = ["ALL", "FULLY_EXPOSED", "RISK_EXPOSED", "ACTOR_LINKED", "CLEAR"];

  function load() {
    setLoading(true);
    const base = apiBase();
    Promise.all([
      fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then((r) => r.json()),
    ])
      .then(([invData, riskData, profData]) => {
        setInvestments(Array.isArray(invData) ? invData : (invData.items || invData.data || []));
        setRiskSignals(Array.isArray(riskData) ? riskData : (riskData.items || riskData.data || []));
        setProfiles(Array.isArray(profData) ? profData : (profData.items || profData.data || []));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, 90000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ptexp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ptexp-toggle", onToggle);
  }, []);

  const enriched = investments.map((inv) => {
    const tokens = investmentTokens(inv);
    const rMatches = riskSignals
      .map((s) => ({ ...s, rel: relevance(tokens, riskFields(s)) }))
      .filter((s) => s.rel > 0)
      .sort((a, b) => b.rel - a.rel);
    const aMatches = profiles
      .map((p) => ({ ...p, rel: relevance(tokens, profileFields(p)) }))
      .filter((p) => p.rel > 0)
      .sort((a, b) => b.rel - a.rel);
    return { ...inv, rMatches, aMatches, category: classify(rMatches, aMatches) };
  });

  const fullyExposed = enriched.filter((i) => i.category === "FULLY_EXPOSED").length;
  const riskExposed = enriched.filter((i) => i.category === "RISK_EXPOSED").length;
  const actorLinked = enriched.filter((i) => i.category === "ACTOR_LINKED").length;
  const clear = enriched.filter((i) => i.category === "CLEAR").length;
  const threatCount = fullyExposed + riskExposed;

  const filtered = enriched.filter((inv) => {
    const matchTab = tab === "ALL" || inv.category === tab;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (inv.name || "").toLowerCase().includes(q) ||
      (inv.type || "").toLowerCase().includes(q) ||
      (inv.sector || "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `Portfolio threat analysis: ${investments.length} investments, ${threatCount} under threat (${fullyExposed} fully exposed, ${riskExposed} risk-exposed only, ${actorLinked} actor-linked), ${clear} clear. Active risk signals: ${riskSignals.length}. Intel profiles: ${profiles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Portfolio threat exposure summary: ${ctx}. Provide a 2-sentence brief on the most critical portfolio risks and recommended immediate actions.` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text, voice: "onyx" }),
        })
          .then((r2) => r2.blob())
          .then((blob) => new Audio(URL.createObjectURL(blob)).play())
          .catch(() => {});
      }
    } catch {
      setBrief("Unable to reach the reasoning core at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const SEVERITY_COLOR = { CRITICAL: RD, HIGH: OR, MEDIUM: AM, LOW: CY };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Portfolio Threat Exposure (PTEXP)"
        style={{
          position: "fixed", left: 985480, bottom: 8, zIndex: 137,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${AM}`,
          color: AM, borderRadius: 6, padding: "3px 7px", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(4px)", letterSpacing: 1,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      >
        ◈ PTEXP
        {threatCount > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 10, padding: "1px 5px", fontSize: 9 }}>
            {threatCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 2100, width: "min(700px,94vw)",
          maxHeight: "82vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.95)", border: `1px solid ${AM}55`,
          borderRadius: 14, backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${AM}22`, fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${AM}33`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ PORTFOLIO THREAT EXPOSURE</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#6E8AA0" }}>
              {investments.length} investments · {riskSignals.length} signals · {profiles.length} actors
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0, flexWrap: "wrap" }}>
            {[
              { label: "INVESTMENTS", val: investments.length, col: CY },
              { label: "FULLY EXPOSED", val: fullyExposed, col: RD },
              { label: "RISK EXPOSED", val: riskExposed, col: OR },
              { label: "ACTOR LINKED", val: actorLinked, col: AM },
              { label: "CLEAR", val: clear, col: GR },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ flex: "1 1 80px", background: "rgba(0,0,0,0.35)", border: `1px solid ${col}44`, borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 18, color: col, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {investments.length > 0 && (
            <div style={{ padding: "0 16px 8px", flexShrink: 0 }}>
              <div style={{ background: "rgba(0,0,0,0.4)", borderRadius: 4, height: 6, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${(fullyExposed / investments.length) * 100}%`, background: RD }} />
                <div style={{ width: `${(riskExposed / investments.length) * 100}%`, background: OR }} />
                <div style={{ width: `${(actorLinked / investments.length) * 100}%`, background: AM }} />
                <div style={{ width: `${(clear / investments.length) * 100}%`, background: GR }} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 9, color: "#6E8AA0" }}>
                <span style={{ color: RD }}>■ FULLY EXPOSED</span>
                <span style={{ color: OR }}>■ RISK EXPOSED</span>
                <span style={{ color: AM }}>■ ACTOR LINKED</span>
                <span style={{ color: GR }}>■ CLEAR</span>
              </div>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ padding: "4px 16px 8px", flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)", color: tab === t ? "#000" : "#6E8AA0",
                border: `1px solid ${AM}44`, borderRadius: 4, padding: "2px 8px", fontSize: 9,
                cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
                borderRadius: 4, padding: "3px 8px", fontSize: 10, color: "#DCEBF5",
                outline: "none", width: 120,
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 8px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>Loading portfolio data…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>No investments match current filter.</div>
            )}
            {!loading && filtered.map((inv) => {
              const catColor = { FULLY_EXPOSED: RD, RISK_EXPOSED: OR, ACTOR_LINKED: AM, CLEAR: GR }[inv.category];
              const isOpen = expanded === (inv.id || inv.name);
              return (
                <div key={inv.id || inv.name} style={{ marginBottom: 6, border: `1px solid ${catColor}33`, borderRadius: 8, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : (inv.id || inv.name))}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", background: "rgba(0,0,0,0.25)" }}
                  >
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: catColor,
                      border: `1px solid ${catColor}55`, borderRadius: 4, padding: "1px 5px",
                      animation: inv.category === "FULLY_EXPOSED" ? "ptpulse 1.2s ease-in-out infinite" : "none",
                    }}>{inv.category}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{inv.name || "Unnamed Investment"}</span>
                    {inv.type && <span style={{ fontSize: 9, color: "#6E8AA0" }}>{inv.type}</span>}
                    {inv.sector && <span style={{ fontSize: 9, color: CY }}>{inv.sector}</span>}
                    <span style={{ color: AM, fontSize: 10, marginLeft: 4 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "8px 12px", borderTop: `1px solid ${catColor}22`, background: "rgba(0,0,0,0.15)" }}>
                      {inv.rMatches.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: RD, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS ({inv.rMatches.length})</div>
                          {inv.rMatches.slice(0, 4).map((sig, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, color: SEVERITY_COLOR[sig.severity] || RD, border: `1px solid ${SEVERITY_COLOR[sig.severity] || RD}55`, borderRadius: 3, padding: "0 4px" }}>{sig.severity || "RISK"}</span>
                              <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{sig.title || sig.name || "Risk Signal"}</span>
                              <div style={{ width: 60, background: "rgba(0,0,0,0.4)", borderRadius: 3, height: 4 }}>
                                <div style={{ width: `${Math.min(sig.rel, 100)}%`, background: RD, borderRadius: 3, height: 4 }} />
                              </div>
                              <span style={{ fontSize: 9, color: "#6E8AA0", width: 30, textAlign: "right" }}>{sig.rel}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {inv.aMatches.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: OR, letterSpacing: 1, marginBottom: 4 }}>THREAT ACTORS ({inv.aMatches.length})</div>
                          {inv.aMatches.slice(0, 4).map((prof, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, color: OR, border: `1px solid ${OR}55`, borderRadius: 3, padding: "0 4px" }}>{prof.role || "ACTOR"}</span>
                              <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{prof.name || "Intel Profile"}</span>
                              <div style={{ width: 60, background: "rgba(0,0,0,0.4)", borderRadius: 3, height: 4 }}>
                                <div style={{ width: `${Math.min(prof.rel, 100)}%`, background: OR, borderRadius: 3, height: 4 }} />
                              </div>
                              <span style={{ fontSize: 9, color: "#6E8AA0", width: 30, textAlign: "right" }}>{prof.rel}%</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {inv.rMatches.length === 0 && inv.aMatches.length === 0 && (
                        <div style={{ fontSize: 10, color: GR }}>No threat correlations detected. Asset assessed clear.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess + brief */}
          <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${AM}22`, flexShrink: 0 }}>
            <button
              onClick={assess}
              disabled={assessing || investments.length === 0}
              style={{
                background: assessing ? "rgba(0,0,0,0.4)" : AM, color: assessing ? AM : "#000",
                border: `1px solid ${AM}`, borderRadius: 6, padding: "5px 14px",
                cursor: assessing ? "default" : "pointer", fontSize: 10, letterSpacing: 1, fontWeight: 700,
              }}
            >
              {assessing ? "⟳ ASSESSING…" : "▶ ASSESS EXPOSURE"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.6, borderLeft: `2px solid ${AM}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes ptpulse{0%,100%{box-shadow:0 0 0 0 ${RD}66}50%{box-shadow:0 0 8px 3px ${RD}66}}`}</style>
    </>
  );
}
