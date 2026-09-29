/**
 * F185 — Scenario × IntelProfile × Risk Signal Threat Scenario Readiness Map (TSRMAP)
 *
 * Parallel-fetches /v1/scenario/list + /entities/IntelProfile + /entities/RiskSignal
 * and keyword-correlates each scenario against threat actor profiles AND risk signals
 * to classify:
 *
 *   FULLY_ARMED  — matched intel profile + risk signal (scenario is fully threat-contextualised)
 *   ACTOR_MAPPED — intel profile match, no risk signal
 *   RISK_LINKED  — risk signal match, no intel profile
 *   UNREADY      — no matches (scenario readiness gap)
 *
 * Stat tiles: SCENARIOS / INTEL PROFILES / RISK SIGNALS + four class counts + ARMED%.
 * Amber badge on unready count.
 * Filter tabs ALL / FULLY_ARMED / ACTOR_MAPPED / RISK_LINKED / UNREADY + text search.
 * Expand scenario → matched intel profile cards (orange, role badge) + risk signal cards (red, severity badge).
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tsrmap-toggle event.
 *
 * Voice triggers:
 *   "tsrmap / threat scenario / scenario readiness / unready scenario /
 *    scenario intel / scenario risk / actor scenario / threat scenario readiness"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_045_960;
const Z_INDEX  = 246;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TSRMAP_RE = /\b(tsrmap|threat[\s-]scenario[\s-]readiness|scenario[\s-]readiness|unready[\s-]scenario|scenario[\s-]intel|scenario[\s-]risk|actor[\s-]scenario|threat[\s-]scenario)\b/i;

export function isTsrmapQuery(q = "") { return TSRMAP_RE.test(q); }

export async function buildTsrmapScript() {
  const base = apiBase();
  const [scRes, ipRes, rsRes] = await Promise.allSettled([
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const scenarios = (scRes.status === "fulfilled" ? (scRes.value?.items || scRes.value || []) : []);
  const profiles  = (ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value || []) : []);
  const signals   = (rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value || []) : []);
  const unready = scenarios.filter(s => {
    const kws = keywords(scenText(s));
    const ipMatch = profiles.some(p => score(ipText(p), kws) > 0);
    const rsMatch = signals.some(r  => score(rsText(r), kws) > 0);
    return !ipMatch && !rsMatch;
  }).length;
  const total  = scenarios.length;
  const armed  = total - unready;
  const pct    = total ? Math.round((armed / total) * 100) : 0;
  return `TSRMAP Threat Scenario Readiness Map online, sir. I have correlated ${total} scenarios against ${profiles.length} intel actor profiles and ${signals.length} risk signals. ${armed} scenario${armed === 1 ? " is" : "s are"} threat-contextualised — ${pct}% readiness coverage. ${unready} scenario${unready === 1 ? " remains" : "s remain"} unready with no actor profile and no linked risk signal. Recommend prioritising those for immediate threat context assignment.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR };

const CLASS_COLOR = {
  FULLY_ARMED:  GR,
  ACTOR_MAPPED: OR,
  RISK_LINKED:  RD,
  UNREADY:      AM,
};

const TABS = ["ALL", "FULLY_ARMED", "ACTOR_MAPPED", "RISK_LINKED", "UNREADY"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scenText(s) {
  return [s.name, s.title, s.description, s.type, s.category, s.tags].filter(Boolean).join(" ");
}
function ipText(p) {
  return [p.name, p.aliases, p.org, p.role, p.description, p.tags].filter(Boolean).join(" ");
}
function rsText(r) {
  return [r.title, r.name, r.description, r.category, r.source, r.tags].filter(Boolean).join(" ");
}

function classify(scenario, profiles, signals) {
  const kws = keywords(scenText(scenario));
  const matchedIp = profiles
    .map(p => ({ ...p, _score: score(ipText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedRs = signals
    .map(r => ({ ...r, _score: score(rsText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasIp = matchedIp.length > 0;
  const hasRs = matchedRs.length > 0;
  let cls;
  if (hasIp && hasRs) cls = "FULLY_ARMED";
  else if (hasIp)     cls = "ACTOR_MAPPED";
  else if (hasRs)     cls = "RISK_LINKED";
  else                cls = "UNREADY";
  return { ...scenario, _cls: cls, _ip: matchedIp, _rs: matchedRs };
}

export default function ThreatScenarioReadinessMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [signals, setSignals]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [scRes, ipRes, rsRes] = await Promise.allSettled([
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const scens = scRes.status === "fulfilled" ? (scRes.value?.items || scRes.value || []) : [];
      const profs = ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value || []) : [];
      const sigs  = rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value || []) : [];
      setScenarios(scens);
      setProfiles(profs);
      setSignals(sigs);
      setClassified(scens.map(s => classify(s, profs, sigs)));
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
    window.addEventListener("jarvis:tsrmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tsrmap-toggle", onToggle);
  }, []);

  const fullyArmed  = classified.filter(s => s._cls === "FULLY_ARMED").length;
  const actorMapped = classified.filter(s => s._cls === "ACTOR_MAPPED").length;
  const riskLinked  = classified.filter(s => s._cls === "RISK_LINKED").length;
  const unready     = classified.filter(s => s._cls === "UNREADY").length;
  const total       = classified.length;
  const armedPct    = total ? Math.round(((fullyArmed + actorMapped + riskLinked) / total) * 100) : 0;

  const visible = classified
    .filter(s => tab === "ALL" || s._cls === tab)
    .filter(s => !search || scenText(s).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Scenarios:${total} IntelProfiles:${profiles.length} RiskSignals:${signals.length} FullyArmed:${fullyArmed} ActorMapped:${actorMapped} RiskLinked:${riskLinked} Unready:${unready} ReadinessPct:${armedPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the threat scenario readiness coverage: ${ctx}` }),
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
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Scenario × IntelProfile × RiskSignal — Threat Scenario Readiness Map (TSRMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? OR : "rgba(5,8,13,0.85)",
          border: `1px solid ${OR}`,
          color: open ? "#000" : OR,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: unready > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TSRMAP
        {unready > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{unready}</span>
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
              <span style={{ color: OR, fontWeight: 700, letterSpacing: 2 }}>TSRMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Scenario × IntelProfile × RiskSignal — Threat Scenario Readiness</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "SCENARIOS",     val: scenarios.length,  clr: OR },
              { label: "INTEL PROFILES",val: profiles.length,   clr: OR },
              { label: "RISK SIGNALS",  val: signals.length,    clr: RD },
              { label: "FULLY ARMED",   val: fullyArmed,        clr: GR },
              { label: "ACTOR MAPPED",  val: actorMapped,       clr: OR },
              { label: "RISK LINKED",   val: riskLinked,        clr: RD },
              { label: "UNREADY",       val: unready,           clr: AM },
              { label: "ARMED%",        val: `${armedPct}%`,    clr: armedPct >= 70 ? GR : armedPct >= 40 ? AM : RD },
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

          {/* Readiness coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${armedPct}%`, background: armedPct >= 70 ? GR : armedPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? OR : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? OR : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
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
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No scenarios match current filter.</div>
            )}
            {visible.map((s, i) => {
              const clr = CLASS_COLOR[s._cls] || AM;
              const isExp = expanded === i;
              return (
                <div key={s.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 110 }}>{s._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{s.name || s.title || "Unknown Scenario"}</span>
                    {s.type && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 4px" }}>{s.type}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {s._ip.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INTEL PROFILES ({s._ip.length})</div>
                          {s._ip.map((p, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(249,115,22,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{p.name || "Profile"}</span>
                                {p.role && <span style={{ color: OR, fontSize: 8, border: `1px solid ${OR}33`, borderRadius: 2, padding: "0 3px" }}>{p.role}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (p._score / 5) * 100)}%`, background: OR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {s._rs.length > 0 && (
                        <div>
                          <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS ({s._rs.length})</div>
                          {s._rs.map((r, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(239,68,68,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{r.title || r.name || "Signal"}</span>
                                {r.severity && <span style={{ color: SEV_COLOR[r.severity] || AM, fontSize: 8, border: `1px solid ${(SEV_COLOR[r.severity] || AM)}33`, borderRadius: 2, padding: "0 3px" }}>{r.severity}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {s._ip.length === 0 && s._rs.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No intel profiles or risk signals correlated — scenario readiness gap.</div>
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
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS READINESS"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /v1/scenario/list · /entities/IntelProfile · /entities/RiskSignal
            </span>
          </div>
        </div>
      )}
    </>
  );
}
