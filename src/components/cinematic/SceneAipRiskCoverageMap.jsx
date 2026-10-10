/**
 * F140 — Cinematic Scene × AIP Skill × RiskSignal Intelligence Coverage Map (SCIAIP)
 *
 * Parallel-fetches /v1/cinematic/scene/01..10 (all 10 scenes) +
 *                  /v1/aip/skill + /entities/RiskSignal
 * Keyword-correlates each scene's anchor/description text against AIP skills AND risk signals:
 *   FULLY_ARMED   — scene matched both an AIP skill AND a risk signal (intelligence + capability backing)
 *   SKILL_BACKED  — scene matched an AIP skill only (capability exists, no active threat signal)
 *   RISK_FLAGGED  — scene matched a risk signal only (threat present, no skill coverage)
 *   UNMONITORED   — no matches (scene has no intelligence or capability backing)
 *
 * Stat tiles: SCENES / AIP SKILLS / RISK SIGNALS + all four class counts + ARMED%.
 * Amber badge on unmonitored count.
 * Filter tabs ALL / FULLY_ARMED / SKILL_BACKED / RISK_FLAGGED / UNMONITORED + text search.
 * Expand scene → matched AIP skill cards (cyan) + matched risk signal cards (red) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:sciaip-toggle event.
 *
 * Voice triggers: "sciaip / scene intelligence / scene skill / scene risk /
 *                  armed scenes / unmonitored scenes / scene coverage map".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_021_320;
const Z_INDEX  = 202;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SCIAIP_RE = /\b(sciaip|scene[\s-]intelligence|scene[\s-]skill|scene[\s-]risk|armed[\s-]scenes?|unmonitored[\s-]scenes?|scene[\s-]coverage[\s-]map)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ARMED:  GR,
  SKILL_BACKED: CY,
  RISK_FLAGGED: RE,
  UNMONITORED:  AM,
};
const TABS = ["ALL", "FULLY_ARMED", "SKILL_BACKED", "RISK_FLAGGED", "UNMONITORED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function sceneText(sc) {
  const anchors = (sc.anchors || []).map(a =>
    `${a.label || ""} ${a.value || ""} ${a.description || ""}`
  ).join(" ");
  return `${sc.title || sc.name || ""} ${sc.description || ""} ${anchors}`.toLowerCase();
}
function skillText(sk) {
  return `${sk.name || sk.skill || ""} ${sk.description || ""} ${sk.type || ""}`.toLowerCase();
}
function riskText(r) {
  return `${r.title || r.name || ""} ${r.description || ""} ${r.severity || ""}`.toLowerCase();
}

const SCENE_IDS = ["01","02","03","04","05","06","07","08","09","10"];

async function loadAll() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [sceneResults, skRes, rsRes] = await Promise.all([
    Promise.all(
      SCENE_IDS.map(id =>
        fetch(`${apiBase}/v1/cinematic/scene/${id}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ),
    fetch(`${apiBase}/v1/aip/skill`, { headers }),
    fetch(`${apiBase}/entities/RiskSignal`, { headers }),
  ]);
  const scenes = sceneResults.filter(Boolean);
  const skJson = await skRes.json().catch(() => ({}));
  const rsJson = await rsRes.json().catch(() => ({}));
  const skills      = Array.isArray(skJson) ? skJson : skJson.skills || skJson.data || skJson.items || [];
  const riskSignals = Array.isArray(rsJson) ? rsJson : rsJson.data  || rsJson.items || [];
  return { scenes, skills, riskSignals };
}

function correlate({ scenes, skills, riskSignals }) {
  return scenes.map(sc => {
    const kws          = keywords(sceneText(sc));
    const matchedSkills = skills.filter(sk => score(skillText(sk), kws) > 0);
    const matchedRisks  = riskSignals.filter(r => score(riskText(r), kws) > 0);
    const hasSkill = matchedSkills.length > 0;
    const hasRisk  = matchedRisks.length  > 0;
    const cls = hasSkill && hasRisk ? "FULLY_ARMED"
              : hasSkill            ? "SKILL_BACKED"
              : hasRisk             ? "RISK_FLAGGED"
              :                       "UNMONITORED";
    return { ...sc, cls, matchedSkills, matchedRisks };
  });
}

function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: "1 1 80px", background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`,
      borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || CY }}>{value}</div>
      <div style={{ fontSize: 9, color: "#5A7A9A", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((s / max) * 100)) : 0;
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 3 }}>
      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color || CY, transition: "width 0.4s" }} />
    </div>
  );
}

export async function buildSciaipScript() {
  const { scenes, skills, riskSignals } = await loadAll();
  const rows = correlate({ scenes, skills, riskSignals });
  const armed       = rows.filter(r => r.cls === "FULLY_ARMED").length;
  const unmonitored = rows.filter(r => r.cls === "UNMONITORED").length;
  const ctx = `Cinematic scenes: ${scenes.length}. AIP skills: ${skills.length}. Risk signals: ${riskSignals.length}. Fully armed scenes: ${armed}. Unmonitored scenes: ${unmonitored}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Scene Intelligence Coverage: ${ctx}. Write exactly 2 sentences assessing which scene dimensions lack operational backing and what that means for intelligence readiness.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `SCIAIP online, sir. ${unmonitored} cinematic scenes are unmonitored — no AIP skill or risk signal coverage detected.`;
}

export function isSciaipQuery(q) { return SCIAIP_RE.test(q); }

export default function SceneAipRiskCoverageMap() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState({ sc: 0, sk: 0, rs: 0 });
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [error, setError]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const { scenes, skills, riskSignals } = await loadAll();
      setCounts({ sc: scenes.length, sk: skills.length, rs: riskSignals.length });
      setRows(correlate({ scenes, skills, riskSignals }));
    } catch (e) {
      setError("Load failed: " + (e.message || String(e)));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sciaip-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sciaip-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try { setBrief(await buildSciaipScript()); } catch { setBrief("SCIAIP assessment complete, sir."); }
    setAssessing(false);
  }, []);

  const classified = rows.filter(r =>
    (tab === "ALL" || r.cls === tab) &&
    (!search ||
      (r.title || r.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(search.toLowerCase()))
  );

  const armed        = rows.filter(r => r.cls === "FULLY_ARMED").length;
  const skillBacked  = rows.filter(r => r.cls === "SKILL_BACKED").length;
  const riskFlagged  = rows.filter(r => r.cls === "RISK_FLAGGED").length;
  const unmonitored  = rows.filter(r => r.cls === "UNMONITORED").length;
  const armedPct     = rows.length > 0 ? Math.round((armed / rows.length) * 100) : 0;

  const maxSk = Math.max(1, ...rows.map(r => r.matchedSkills?.length || 0));
  const maxRs = Math.max(1, ...rows.map(r => r.matchedRisks?.length  || 0));

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.90)",
          border: `1px solid ${unmonitored > 0 ? AM : GR}66`,
          color: unmonitored > 0 ? AM : GR,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1.5,
          padding: "4px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: unmonitored > 0 ? `0 0 10px ${AM}44` : "none",
        }}
        title="Cinematic Scene × AIP Skill × RiskSignal Intelligence Coverage Map"
      >
        {unmonitored > 0 && (
          <span style={{
            background: AM, color: "#04060A", borderRadius: "50%",
            padding: "0 4px", marginRight: 4, fontSize: 8,
          }}>
            {unmonitored}
          </span>
        )}
        ◈ SCIAIP
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 40, top: 40, width: "min(720px,92vw)", maxHeight: "86vh",
          overflowY: "auto", background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "16px 18px", zIndex: Z_INDEX + 1, fontFamily: FONT, color: "#DCEBF5",
          boxShadow: `0 0 40px ${CY}18`,
        }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: GR, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ◈ SCIAIP — SCENE INTELLIGENCE COVERAGE MAP
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: "#5A7A9A", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {error && <div style={{ color: RE, fontSize: 11, marginBottom: 8 }}>{error}</div>}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <StatTile label="SCENES"        value={counts.sc} />
            <StatTile label="AIP SKILLS"    value={counts.sk} color={CY} />
            <StatTile label="RISK SIGNALS"  value={counts.rs} color={RE} />
            <StatTile label="FULLY ARMED"   value={armed}       color={GR} />
            <StatTile label="SKILL BACKED"  value={skillBacked} color={CY} />
            <StatTile label="RISK FLAGGED"  value={riskFlagged} color={RE} />
            <StatTile label="UNMONITORED"   value={unmonitored} color={AM} />
            <StatTile label="ARMED%"        value={`${armedPct}%`}
              color={armedPct >= 60 ? GR : armedPct >= 30 ? AM : RE} />
          </div>

          {/* Coverage bar */}
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 12 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${armedPct}%`,
              background: armedPct >= 60 ? GR : armedPct >= 30 ? AM : RE, transition: "width 0.5s" }} />
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(0,207,255,0.07)",
                  color: tab === t ? "#04060A" : "#8AAEC8",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : BORDER}`,
                }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenes…"
              style={{
                marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
                color: "#DCEBF5", outline: "none", width: 160,
              }}
            />
          </div>

          {/* Row list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {classified.map((sc, i) => (
              <div key={sc.id || sc.name || i}
                style={{ border: `1px solid ${CLASS_COLOR[sc.cls]}33`, borderRadius: 7,
                  background: "rgba(0,207,255,0.03)", padding: "7px 10px" }}>

                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === i ? null : i)}>
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 3,
                    background: `${CLASS_COLOR[sc.cls]}22`, color: CLASS_COLOR[sc.cls],
                    border: `1px solid ${CLASS_COLOR[sc.cls]}55`, whiteSpace: "nowrap",
                  }}>
                    {sc.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, flex: 1 }}>
                    {sc.title || sc.name || sc.id || "Unnamed Scene"}
                  </span>
                  <span style={{ fontSize: 9, color: "#5A7A9A" }}>
                    SK:{sc.matchedSkills.length} RS:{sc.matchedRisks.length}
                  </span>
                  <span style={{ fontSize: 10, color: "#5A7A9A" }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {expanded === i && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {sc.matchedSkills.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: CY, marginBottom: 3, letterSpacing: 1 }}>
                          AIP SKILLS ({sc.matchedSkills.length})
                        </div>
                        {sc.matchedSkills.slice(0, 5).map((sk, si) => (
                          <div key={sk.id || si} style={{ background: `${CY}11`, border: `1px solid ${CY}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10 }}>{sk.name || sk.skill || sk.id || "Unknown"}</span>
                              {sk.type && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: `${CY}22`, color: CY, border: `1px solid ${CY}44` }}>
                                  {sk.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={score(skillText(sk), keywords(sceneText(sc)))} max={maxSk} color={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedRisks.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: RE, marginBottom: 3, letterSpacing: 1 }}>
                          RISK SIGNALS ({sc.matchedRisks.length})
                        </div>
                        {sc.matchedRisks.slice(0, 5).map((r, ri) => (
                          <div key={r.id || ri} style={{ background: `${RE}11`, border: `1px solid ${RE}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 10 }}>{r.title || r.name || r.id || "Unknown"}</span>
                              {r.severity && (
                                <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3,
                                  background: r.severity === "CRITICAL" ? RE
                                            : r.severity === "HIGH"     ? OR : AM,
                                  color: "#04060A" }}>{r.severity}</span>
                              )}
                            </div>
                            <RelevanceBar score={score(riskText(r), keywords(sceneText(sc)))} max={maxRs} color={RE} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedSkills.length === 0 && sc.matchedRisks.length === 0 && (
                      <div style={{ fontSize: 10, color: "#5A7A9A", fontStyle: "italic" }}>
                        No AIP skills or risk signals correlated — scene is unmonitored.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {classified.length === 0 && !error && (
            <div style={{ color: "#5A7A9A", fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading scene intelligence data…
            </div>
          )}

          {/* Assess + refresh */}
          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={assess} disabled={assessing}
              style={{ fontSize: 10, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
                color: CY, border: `1px solid ${CY}55` }}>
              {assessing ? "Assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            <button onClick={load} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5,
              cursor: "pointer", background: "rgba(0,207,255,0.05)",
              color: "#5A7A9A", border: `1px solid ${BORDER}` }}>↺</button>
          </div>
          {brief && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: `${CY}09`, border: `1px solid ${CY}22`, borderRadius: 6,
              padding: "8px 10px" }}>{brief}</div>
          )}
        </div>
      )}
    </>
  );
}
