/**
 * F65 – Skill × RiskSignal × Scenario Capability Gap Nexus (SRSCAP)
 * Cross-correlates /v1/aip/skill × /entities/RiskSignal × /v1/scenario/list.
 * Classifies each risk signal:
 *   FULLY_CAPABLE  – matched skill AND scenario (capability exists)
 *   SKILL_ONLY     – matched skill, no scenario
 *   SCENARIO_ONLY  – matched scenario, no skill
 *   CAPABILITY_GAP – no skill or scenario (blind spot — unaddressed risk)
 * CAPABILITY_GAP rows pulse red.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 949300;
const Z          = 648;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

const SRSCAP_RE = /\b(srscap|capability.gap|risk.capability|skill.{0,14}scenario|risk.{0,14}(skill|response.capability)|skill.{0,14}risk|response.capability|unaddressed.risk|skill.coverage.risk|risk.skill.gap|scenario.risk.coverage|capability.coverage|risk.response.gap)\b/i;

export function isSrscapQuery(text) { return SRSCAP_RE.test(text || ""); }

export async function buildSrscapScript() {
  try {
    const base = apiBase();
    const [skillRes, riskRes, scenRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,       { headers: authHdr() }),
      fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
      fetch(`${base}/v1/scenario/list`,   { headers: authHdr() }),
    ]);
    const [skills, risks, scenarios] = await Promise.all([
      skillRes.ok ? skillRes.json()  : [],
      riskRes.ok  ? riskRes.json()   : [],
      scenRes.ok  ? scenRes.json()   : [],
    ]);
    const skArr  = (Array.isArray(skills)    ? skills    : skills?.data    ?? []).slice(0, 200);
    const rskArr = (Array.isArray(risks)     ? risks     : risks?.data     ?? []).slice(0, 200);
    const scnArr = (Array.isArray(scenarios) ? scenarios : scenarios?.data ?? []).slice(0, 200);
    const classified = classifyRisks(rskArr, skArr, scnArr);
    const gaps = classified.filter(r => r.cls === "CAPABILITY_GAP").length;
    const full = classified.filter(r => r.cls === "FULLY_CAPABLE").length;
    return `SRSCAP nexus: ${rskArr.length} risk signals, ${skArr.length} skills, ${scnArr.length} scenarios. ` +
      `Coverage: FULLY_CAPABLE ${full}, SKILL_ONLY ${classified.filter(r => r.cls === "SKILL_ONLY").length}, ` +
      `SCENARIO_ONLY ${classified.filter(r => r.cls === "SCENARIO_ONLY").length}, CAPABILITY_GAP ${gaps}. ` +
      (gaps > 0
        ? `${gaps} risk signal${gaps !== 1 ? "s" : ""} have no matching skill or scenario — capability gaps requiring urgent attention.`
        : "All risk signals have at least one skill or scenario providing coverage.");
  } catch (e) {
    return `SRSCAP nexus unavailable: ${e.message}`;
  }
}

function tok(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}
function overlap(a, b) {
  const setB = new Set(b);
  return a.some(t => setB.has(t));
}

function classifyRisks(risks, skills, scenarios) {
  return risks.map(rsk => {
    const rtoks = tok(
      (rsk.name || rsk.title || "") + " " +
      (rsk.severity || rsk.level || "") + " " +
      (rsk.source || rsk.type || "") + " " +
      (rsk.description || rsk.summary || "") + " " +
      (Array.isArray(rsk.tags) ? rsk.tags.join(" ") : "")
    );
    const matchedSk = skills.filter(sk =>
      overlap(rtoks, tok(
        (sk.name || sk.title || sk.skill_name || "") + " " +
        (sk.category || sk.domain || sk.type || "") + " " +
        (sk.description || sk.summary || "") + " " +
        (Array.isArray(sk.tags) ? sk.tags.join(" ") : "")
      ))
    );
    const matchedScn = scenarios.filter(scn =>
      overlap(rtoks, tok(
        (scn.name || scn.title || "") + " " +
        (scn.type || scn.category || scn.threat || "") + " " +
        (scn.description || scn.summary || "") + " " +
        (Array.isArray(scn.tags) ? scn.tags.join(" ") : "")
      ))
    );
    const hasSk  = matchedSk.length > 0;
    const hasScn = matchedScn.length > 0;
    let cls;
    if (hasSk && hasScn)        cls = "FULLY_CAPABLE";
    else if (hasSk && !hasScn)  cls = "SKILL_ONLY";
    else if (!hasSk && hasScn)  cls = "SCENARIO_ONLY";
    else                        cls = "CAPABILITY_GAP";
    return { rsk, cls, matchedSk, matchedScn };
  });
}

const CLS_COLOR = {
  FULLY_CAPABLE:  GR,
  SKILL_ONLY:     CY,
  SCENARIO_ONLY:  AM,
  CAPABILITY_GAP: RD,
};
const CLS_LABEL = {
  FULLY_CAPABLE:  "FULLY CAPABLE",
  SKILL_ONLY:     "SKILL ONLY",
  SCENARIO_ONLY:  "SCENARIO ONLY",
  CAPABILITY_GAP: "CAPABILITY GAP",
};
const TABS = ["ALL", "FULLY_CAPABLE", "SKILL_ONLY", "SCENARIO_ONLY", "CAPABILITY_GAP"];
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function Bar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#7A95AB", marginBottom: 2, fontFamily: MONO }}>
        <span>{label}</span>
        <span style={{ color }}>{count} ({pct}%)</span>
      </div>
      <div style={{ height: 4, background: "#0d1b26", borderRadius: 2 }}>
        <div style={{ height: 4, borderRadius: 2, width: `${pct}%`, background: color, transition: "width .5s" }} />
      </div>
    </div>
  );
}

function Tile({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 80, padding: "10px 8px", background: "rgba(5,15,25,0.7)", border: `1px solid ${color}33`, borderRadius: 6, textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginTop: 2, fontFamily: SANS }}>{label}</div>
    </div>
  );
}

export default function SkillRiskScenarioCapability() {
  const [open, setOpen]         = useState(false);
  const [data, setData]         = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const timerRef                = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [skillRes, riskRes, scenRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`,       { headers: authHdr() }),
        fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
        fetch(`${base}/v1/scenario/list`,   { headers: authHdr() }),
      ]);
      const [skills, risks, scenarios] = await Promise.all([
        skillRes.ok ? skillRes.json()  : [],
        riskRes.ok  ? riskRes.json()   : [],
        scenRes.ok  ? scenRes.json()   : [],
      ]);
      const skArr  = (Array.isArray(skills)    ? skills    : skills?.data    ?? []).slice(0, 200);
      const rskArr = (Array.isArray(risks)     ? risks     : risks?.data     ?? []).slice(0, 200);
      const scnArr = (Array.isArray(scenarios) ? scenarios : scenarios?.data ?? []).slice(0, 200);
      const classified = classifyRisks(rskArr, skArr, scnArr);
      classified.sort((a, b) => {
        const sa = SEV_ORDER[String(a.rsk.severity || "").toLowerCase()] ?? 9;
        const sb = SEV_ORDER[String(b.rsk.severity || "").toLowerCase()] ?? 9;
        return sa - sb;
      });
      setData({ classified, skArr, rskArr, scnArr });
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:srscap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:srscap-toggle", onToggle);
  }, []);

  async function assess() {
    setAssess(true);
    try {
      const base = apiBase();
      const summary = data ? buildSummary(data) : "SRSCAP data unavailable.";
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: `SRSCAP assessment: ${summary}` }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment complete.";
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ text: answer, voice }),
      });
    } catch {}
    setAssess(false);
  }

  function buildSummary(d) {
    const gaps = d.classified.filter(r => r.cls === "CAPABILITY_GAP").length;
    const full = d.classified.filter(r => r.cls === "FULLY_CAPABLE").length;
    return `SRSCAP: ${d.rskArr.length} risk signals, ${d.skArr.length} skills, ${d.scnArr.length} scenarios. ` +
      `FULLY_CAPABLE ${full}, SKILL_ONLY ${d.classified.filter(r => r.cls === "SKILL_ONLY").length}, ` +
      `SCENARIO_ONLY ${d.classified.filter(r => r.cls === "SCENARIO_ONLY").length}, CAPABILITY_GAP ${gaps}.`;
  }

  const filtered = data ? data.classified.filter(row => {
    if (tab !== "ALL" && row.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = String(row.rsk.name || row.rsk.title || "").toLowerCase();
      const sev  = String(row.rsk.severity || "").toLowerCase();
      if (!name.includes(q) && !sev.includes(q)) return false;
    }
    return true;
  }) : [];

  const gaps  = data ? data.classified.filter(r => r.cls === "CAPABILITY_GAP").length  : 0;
  const full  = data ? data.classified.filter(r => r.cls === "FULLY_CAPABLE").length   : 0;
  const skOnly = data ? data.classified.filter(r => r.cls === "SKILL_ONLY").length      : 0;
  const scOnly = data ? data.classified.filter(r => r.cls === "SCENARIO_ONLY").length   : 0;
  const total  = data ? data.rskArr.length : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Skill × Risk × Scenario Capability Gap Nexus"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: "rgba(5,8,13,0.85)", border: `1px solid ${gaps > 0 ? RD : CY}55`,
          color: gaps > 0 ? RD : CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ SRSCAP{data && gaps > 0 ? ` [${gaps}!]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 16, top: 60, right: 16, bottom: 60, zIndex: Z,
      background: "rgba(4,8,14,0.97)", border: `1px solid ${CY}33`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      backdropFilter: "blur(12px)", boxShadow: `0 0 40px rgba(41,231,255,0.06)`,
      fontFamily: SANS,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${CY}1A` }}>
        <span style={{ color: CY, fontFamily: MONO, fontSize: 11, letterSpacing: 2 }}>◈ SRSCAP</span>
        <span style={{ color: "#4E6070", fontSize: 10, letterSpacing: 1 }}>SKILL × RISK × SCENARIO CAPABILITY GAP NEXUS</span>
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing || !data} style={{
          background: "transparent", border: `1px solid ${GR}55`, color: GR,
          fontFamily: MONO, fontSize: 9, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: "#4E6070", fontSize: 18, cursor: "pointer", lineHeight: 1,
        }}>×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        <Tile label="RISK SIGNALS"  value={total}  color={CY} />
        <Tile label="SKILLS"        value={data ? data.skArr.length : 0}  color={CY} />
        <Tile label="SCENARIOS"     value={data ? data.scnArr.length : 0} color={CY} />
        <Tile label="FULLY CAPABLE" value={full}   color={GR} />
        <Tile label="CAP GAP"       value={gaps}   color={gaps > 0 ? RD : GR} />
      </div>

      {/* Coverage bars */}
      {data && total > 0 && (
        <div style={{ padding: "0 16px 10px" }}>
          <Bar label="FULLY CAPABLE"  count={full}   total={total} color={GR} />
          <Bar label="SKILL ONLY"     count={skOnly}  total={total} color={CY} />
          <Bar label="SCENARIO ONLY"  count={scOnly}  total={total} color={AM} />
          <Bar label="CAPABILITY GAP" count={gaps}    total={total} color={RD} />
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#1e3040"}`,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#4E6070",
            fontFamily: MONO, fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          }}>
            {t === "ALL" ? `ALL (${total})` : `${CLS_LABEL[t] || t} (${data ? data.classified.filter(r => r.cls === t).length : 0})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{
            marginLeft: "auto", background: "rgba(5,15,25,0.7)", border: `1px solid ${CY}22`,
            color: "#DCEBF5", fontFamily: MONO, fontSize: 10, padding: "3px 8px", borderRadius: 4, outline: "none", width: 160,
          }}
        />
      </div>

      {/* Risk signal list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 16px 16px" }}>
        {!data && (
          <div style={{ color: "#4E6070", fontSize: 11, textAlign: "center", marginTop: 40, fontFamily: MONO }}>Loading…</div>
        )}
        {data && filtered.length === 0 && (
          <div style={{ color: "#4E6070", fontSize: 11, textAlign: "center", marginTop: 40, fontFamily: MONO }}>No risk signals match.</div>
        )}
        {filtered.map((row, i) => {
          const { rsk, cls, matchedSk, matchedScn } = row;
          const name = rsk.name || rsk.title || `Risk #${i}`;
          const sev  = String(rsk.severity || "").toUpperCase();
          const isGap = cls === "CAPABILITY_GAP";
          const isExp = expanded === i;
          return (
            <div
              key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                marginBottom: 4, padding: "8px 10px", borderRadius: 6, cursor: "pointer",
                background: isGap && !isExp ? "rgba(255,59,59,0.04)" : "rgba(5,15,25,0.5)",
                border: `1px solid ${isExp ? CLS_COLOR[cls] : (isGap ? `${RD}44` : "#0e2030")}`,
                animation: isGap && !isExp ? "srscap-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: CLS_COLOR[cls], fontFamily: MONO, fontSize: 9, letterSpacing: 1, flexShrink: 0 }}>
                  {CLS_LABEL[cls]}
                </span>
                {sev && (
                  <span style={{
                    fontSize: 8, letterSpacing: 1, padding: "1px 5px", borderRadius: 3, fontFamily: MONO,
                    background: `${sev === "CRITICAL" ? RD : sev === "HIGH" ? AM : CY}22`,
                    color: sev === "CRITICAL" ? RD : sev === "HIGH" ? AM : CY,
                  }}>{sev}</span>
                )}
                <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1 }}>{name}</span>
                <span style={{ color: "#3a5060", fontSize: 9, fontFamily: MONO }}>
                  {matchedSk.length}sk / {matchedScn.length}sc
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8 }}>
                  {rsk.description && (
                    <div style={{ color: "#5E7080", fontSize: 10, marginBottom: 8 }}>{rsk.description}</div>
                  )}
                  {matchedSk.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, fontFamily: MONO, marginBottom: 4 }}>MATCHED SKILLS</div>
                      {matchedSk.slice(0, 5).map((sk, si) => {
                        const skName = sk.name || sk.title || sk.skill_name || `Skill ${si}`;
                        const pct = Math.min(100, 40 + si * 12);
                        return (
                          <div key={si} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7A95AB", marginBottom: 2 }}>
                              <span>{skName}</span>
                            </div>
                            <div style={{ height: 3, background: "#0d1b26", borderRadius: 2 }}>
                              <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: CY }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {matchedScn.length > 0 && (
                    <div>
                      <div style={{ color: AM, fontSize: 9, letterSpacing: 1, fontFamily: MONO, marginBottom: 4 }}>MATCHED SCENARIOS</div>
                      {matchedScn.slice(0, 5).map((scn, si) => {
                        const scnName = scn.name || scn.title || `Scenario ${si}`;
                        const pct = Math.min(100, 45 + si * 10);
                        return (
                          <div key={si} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#7A95AB", marginBottom: 2 }}>
                              <span>{scnName}</span>
                            </div>
                            <div style={{ height: 3, background: "#0d1b26", borderRadius: 2 }}>
                              <div style={{ height: 3, borderRadius: 2, width: `${pct}%`, background: AM }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {matchedSk.length === 0 && matchedScn.length === 0 && (
                    <div style={{ color: RD, fontSize: 10, fontFamily: MONO }}>⚠ No matching skills or scenarios found — capability gap.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes srscap-pulse {
          0%, 100% { border-color: rgba(255,59,59,0.27); }
          50%       { border-color: rgba(255,59,59,0.65); }
        }
      `}</style>
    </div>
  );
}
