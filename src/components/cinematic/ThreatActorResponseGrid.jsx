/**
 * F205 — IntelProfile × Ops Event × Scenario Threat Actor Response Grid (TARG)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/ops/events + /v1/scenario/list
 * and keyword-correlates each threat actor profile against ops events AND scenario
 * playbooks to classify:
 *
 *   FULLY_ENGAGED   — matched ops event + scenario (both)
 *   OPS_ACTIVE      — matched ops event only
 *   SCENARIO_PLANNED — matched scenario only
 *   UNENGAGED       — no matches (threat response gap)
 *
 * Stat tiles: INTEL PROFILES / OPS EVENTS / SCENARIOS + four class counts + ENGAGED%.
 * Red badge on UNENGAGED count.
 * Filter tabs ALL / FULLY_ENGAGED / OPS_ACTIVE / SCENARIO_PLANNED / UNENGAGED + text search.
 * Expand profile → matched ops event cards (blue) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS RESPONSE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:targ-toggle event.
 *
 * Voice triggers:
 *   "targ / threat actor response / actor engagement / unengaged actors /
 *    actor ops / threat response grid / actor scenario"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_057_160;
const Z_INDEX  = 266;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TARG_RE = /\b(targ|threat[\s-]actor[\s-]response|actor[\s-]engagement|unengaged[\s-]actors?|actor[\s-]ops|threat[\s-]response[\s-]grid|actor[\s-]scenario)\b/i;

export function isTargQuery(q = "") { return TARG_RE.test(q); }

function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(target = "", kws = []) {
  const t = target.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, (p.tags || []).join(" ")].filter(Boolean).join(" ");
}

function opsText(e) {
  return [e.title, e.name, e.description, e.type, e.category, e.summary, (e.tags || []).join(" ")].filter(Boolean).join(" ");
}

function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.category, (s.tags || []).join(" ")].filter(Boolean).join(" ");
}

export async function buildTargScript() {
  const base = apiBase();
  const [profRes, opsRes, scnRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const profiles  = (profRes.status === "fulfilled" ? (profRes.value?.items    || profRes.value?.profiles  || profRes.value  || []) : []);
  const ops       = (opsRes.status  === "fulfilled" ? (opsRes.value?.items     || opsRes.value?.events     || opsRes.value   || []) : []);
  const scenarios = (scnRes.status  === "fulfilled" ? (scnRes.value?.items     || scnRes.value?.scenarios  || scnRes.value   || []) : []);

  let unengaged = 0, fullyEngaged = 0;
  profiles.forEach(p => {
    const kws  = keywords(profileText(p));
    const hasO = ops.some(e => scoreText(opsText(e), kws) > 0);
    const hasS = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    if (!hasO && !hasS) unengaged++;
    if (hasO && hasS)   fullyEngaged++;
  });
  const total  = profiles.length;
  const covPct = total ? Math.round(((total - unengaged) / total) * 100) : 0;
  return `TARG Threat Actor Response Grid online, sir. I am cross-referencing ${total} threat actor profiles against ${ops.length} operational events and ${scenarios.length} scenario playbooks. ${fullyEngaged} actor${fullyEngaged === 1 ? "" : "s"} are fully engaged — matched in both active operations and scenario planning. ${unengaged} actor${unengaged === 1 ? "" : "s"} are unengaged with no operational or scenario linkage, representing a critical threat response gap. Overall actor engagement stands at ${covPct}%. Recommend immediate scenario assignment and operational tracking for all unengaged threat actors.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const TE     = "#14B8A6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ENGAGED:    CY,
  OPS_ACTIVE:       BL,
  SCENARIO_PLANNED: TE,
  UNENGAGED:        RD,
};

const TABS = ["ALL", "FULLY_ENGAGED", "OPS_ACTIVE", "SCENARIO_PLANNED", "UNENGAGED"];

function classify(p, ops, scenarios) {
  const kws  = keywords(profileText(p));
  const hasO = ops.some(e => scoreText(opsText(e), kws) > 0);
  const hasS = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
  if (hasO && hasS) return "FULLY_ENGAGED";
  if (hasO)         return "OPS_ACTIVE";
  if (hasS)         return "SCENARIO_PLANNED";
  return "UNENGAGED";
}

function getMatches(p, list, textFn) {
  const kws = keywords(profileText(p));
  return list
    .map(item => ({ item, score: scoreText(textFn(item), kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

export default function ThreatActorResponseGrid() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [ops,       setOps]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [profR, opsR, scnR] = await Promise.allSettled([
      fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      fetch(`${base}/v1/ops/events`).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    ]);
    setProfiles(profR.status  === "fulfilled" ? (profR.value?.items    || profR.value?.profiles  || profR.value  || []) : []);
    setOps(opsR.status        === "fulfilled" ? (opsR.value?.items     || opsR.value?.events     || opsR.value   || []) : []);
    setScenarios(scnR.status  === "fulfilled" ? (scnR.value?.items     || scnR.value?.scenarios  || scnR.value   || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:targ-toggle", handler);
    return () => window.removeEventListener("jarvis:targ-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = profiles.map(p => ({ p, cls: classify(p, ops, scenarios) }));
  const counts = { FULLY_ENGAGED: 0, OPS_ACTIVE: 0, SCENARIO_PLANNED: 0, UNENGAGED: 0 };
  classified.forEach(({ cls }) => counts[cls]++);
  const covPct = profiles.length ? Math.round(((profiles.length - counts.UNENGAGED) / profiles.length) * 100) : 0;

  const filtered = classified.filter(({ p, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return profileText(p).toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx  = `${profiles.length} intel profiles, ${ops.length} ops events, ${scenarios.length} scenarios. FULLY_ENGAGED:${counts.FULLY_ENGAGED} OPS_ACTIVE:${counts.OPS_ACTIVE} SCENARIO_PLANNED:${counts.SCENARIO_PLANNED} UNENGAGED:${counts.UNENGAGED} Engagement:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TARG threat actor response grid assessment. Data: ${ctx}. Provide a 2-sentence brief identifying which unengaged threat actors represent the highest operational risk and the immediate recommended action to close those response gaps.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(239,68,68,0.13)", border: `1px solid ${RD}`,
          color: RD, fontFamily: FONT, fontSize: 9, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ◈ TARG
        {counts.UNENGAGED > 0 && (
          <span style={{ marginLeft: 4, background: RD, color: "#fff", borderRadius: "50%", padding: "0 4px", fontSize: 8 }}>
            {counts.UNENGAGED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: "50%", transform: "translateX(-50%)",
      width: 680, maxHeight: "82vh", overflowY: "auto", zIndex: Z_INDEX + 1,
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: 16, fontFamily: FONT, color: "#ccc", fontSize: 11,
      boxShadow: "0 0 40px rgba(0,0,0,0.8)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ color: RD, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ TARG — THREAT ACTOR RESPONSE GRID</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["INTEL PROFILES", profiles.length, CY],
          ["OPS EVENTS",     ops.length,       BL],
          ["SCENARIOS",      scenarios.length,  TE],
          ["FULLY ENGAGED",  counts.FULLY_ENGAGED,    CY],
          ["OPS ACTIVE",     counts.OPS_ACTIVE,        BL],
          ["SCEN PLANNED",   counts.SCENARIO_PLANNED,  TE],
          ["UNENGAGED",      counts.UNENGAGED,          RD],
          ["ENGAGED %",      `${covPct}%`,               covPct >= 70 ? "#22C55E" : covPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 16, color: col, fontWeight: 700 }}>{loading ? "…" : val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#555", marginBottom: 3 }}>ACTOR ENGAGEMENT COVERAGE</div>
        <div style={{ background: "rgba(239,68,68,0.15)", borderRadius: 4, height: 6 }}>
          <div style={{ width: `${covPct}%`, background: covPct >= 70 ? "#22C55E" : covPct >= 40 ? AM : RD, height: "100%", borderRadius: 4, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `rgba(239,68,68,0.18)` : "transparent",
            border: `1px solid ${tab === t ? RD : "#333"}`,
            color: tab === t ? RD : "#666", fontFamily: FONT, fontSize: 9,
            padding: "2px 8px", cursor: "pointer", borderRadius: 3, letterSpacing: 0.5,
          }}>
            {t.replace(/_/g, " ")}
            {t !== "ALL" && <span style={{ marginLeft: 3, color: CLASS_COLOR[t] }}>{counts[t] ?? ""}</span>}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search actors…"
          style={{ background: "rgba(0,0,0,0.4)", border: `1px solid #333`, color: "#ccc", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3, width: 140 }}
        />
      </div>

      {/* List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {filtered.map(({ p, cls }) => {
          const isExp = expanded === (p.id || p.name);
          const opsMatches = getMatches(p, ops, opsText);
          const scnMatches = getMatches(p, scenarios, scenarioText);
          const maxScore   = Math.max(...opsMatches.map(m => m.score), ...scnMatches.map(m => m.score), 1);
          return (
            <div key={p.id || p.name} style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${isExp ? CLASS_COLOR[cls] : "#222"}`, borderRadius: 5, padding: "6px 10px" }}>
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(isExp ? null : (p.id || p.name))}
              >
                <span style={{ fontSize: 8, color: CLASS_COLOR[cls], background: `rgba(0,0,0,0.4)`, border: `1px solid ${CLASS_COLOR[cls]}`, padding: "1px 5px", borderRadius: 3, minWidth: 100, textAlign: "center", letterSpacing: 0.5 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 10, color: "#ddd", flex: 1, fontWeight: isExp ? 600 : 400 }}>
                  {p.name || p.id || "(unknown actor)"}
                </span>
                {p.role && (
                  <span style={{ fontSize: 9, color: AM, background: "rgba(245,158,11,0.1)", padding: "1px 5px", borderRadius: 3 }}>
                    {p.role.toString().slice(0, 14)}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "#444" }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Ops Events */}
                  {opsMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: BL, marginBottom: 4, letterSpacing: 1 }}>MATCHED OPS EVENTS ({opsMatches.length})</div>
                      {opsMatches.map(({ item, score }) => (
                        <div key={item.id || item.title} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: BL, background: "rgba(59,130,246,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                            {(item.type || "OPS").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.title || item.name || "(untitled)"}</span>
                          <div style={{ width: 60, background: "rgba(59,130,246,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: BL, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Scenarios */}
                  {scnMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: TE, marginBottom: 4, letterSpacing: 1 }}>MATCHED SCENARIOS ({scnMatches.length})</div>
                      {scnMatches.map(({ item, score }) => (
                        <div key={item.id || item.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: TE, background: "rgba(20,184,166,0.12)", padding: "1px 5px", borderRadius: 3, minWidth: 60, textAlign: "center" }}>
                            {(item.type || "SCENARIO").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ fontSize: 10, color: "#ccc", flex: 1 }}>{item.name || item.title || "(unnamed)"}</span>
                          <div style={{ width: 60, background: "rgba(20,184,166,0.15)", borderRadius: 2, height: 4 }}>
                            <div style={{ width: `${Math.round((score / maxScore) * 100)}%`, background: TE, height: "100%", borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {opsMatches.length === 0 && scnMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: "#555", fontStyle: "italic" }}>No matches found in ops events or scenarios.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#555", fontSize: 11, padding: 12 }}>No actors match the current filter.</div>
        )}
      </div>

      {/* Assess button */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          onClick={assess} disabled={assessing}
          style={{
            background: "rgba(0,207,255,0.12)", border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 10, padding: "5px 14px",
            cursor: assessing ? "default" : "pointer", borderRadius: 4, letterSpacing: 1,
          }}
        >
          {assessing ? "ASSESSING..." : "▶ ASSESS RESPONSE"}
        </button>
        <span style={{ fontSize: 9, color: "#555" }}>auto-refresh 90s · {profiles.length} actors</span>
      </div>
      {brief && (
        <div style={{ marginTop: 10, background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "8px 12px", fontSize: 11, color: "#ccc", lineHeight: 1.5 }}>
          {brief}
        </div>
      )}
    </div>
  );
}
