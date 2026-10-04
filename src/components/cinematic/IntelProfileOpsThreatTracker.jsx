/**
 * IntelProfileOpsThreatTracker — F245.
 *
 * Parallel-fetches /entities/IntelProfile × /v1/ops/events × /v1/scenario/list
 * and keyword-correlates each threat actor profile against live ops events AND
 * response scenarios to classify:
 *
 *   FULLY_TRACKED  — actor has ≥1 matching ops event AND ≥1 matching scenario
 *   EVENT_ONLY     — ops event exists but no response scenario
 *   SCENARIO_ONLY  — scenario exists but no confirming ops event
 *   DARK           — neither ops evidence nor response scenario (untracked actor)
 *
 * Stat tiles: INTEL PROFILES / OPS EVENTS / SCENARIOS / DARK
 * Red badge: DARK count on toggle button; DARK rows pulse red.
 * Filter tabs: ALL | FULLY_TRACKED | EVENT_ONLY | SCENARIO_ONLY | DARK + text search.
 * Expand profile → matched ops event cards (orange) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat tracking brief + TTS.
 *
 * Toggle:  ◈ IPOESTR at left:1093920, bottom:8, zIndex:669.
 * Event:   jarvis:ipoestr-toggle
 * Voice:   "ipoestr" / "intel profile ops" / "actor tracking" / "dark actor" /
 *          "threat actor ops" / "untracked actor" / "actor ops event" /
 *          "threat tracking map" / "actor response coverage"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const OR  = "#FF8A00";
const AM  = "#FFB300";
const GN  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1093920;
const Z_IDX      = 669;

const IPOESTR_RE =
  /\b(ipoestr|intel[._\-\s]profile[._\-\s]ops|actor[._\-\s]tracking|dark[._\-\s]actor|threat[._\-\s]actor[._\-\s]ops|untracked[._\-\s]actor|actor[._\-\s]ops[._\-\s]event|threat[._\-\s]tracking[._\-\s]map|actor[._\-\s]response[._\-\s]coverage)\b/i;

export function isIpoestRQuery(t) {
  return IPOESTR_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normProfiles(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.profiles || raw.intel_profiles || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:    v.id || String(i),
    name:  v.name || v.title || v.alias || `Actor ${i + 1}`,
    desc:  v.description || v.detail || v.summary || "",
    org:   v.organisation || v.org || v.affiliation || "",
    role:  v.role || v.type || v.category || "",
    tags:  (v.tags || []).join(" "),
    aliases: (v.aliases || []).join(" "),
  }));
}

function normEvents(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.events || raw.ops_events || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((e, i) => ({
    id:   e.id || String(i),
    name: e.name || e.title || e.event || `Event ${i + 1}`,
    desc: e.description || e.detail || e.summary || "",
    type: e.type || e.category || e.event_type || "",
  }));
}

function normScenarios(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.scenarios || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:   s.id || String(i),
    name: s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    desc: s.description || s.summary || s.detail || "",
    type: s.type || s.category || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(profile, other) {
  const pWords = new Set(tokens(`${profile.name} ${profile.desc} ${profile.org} ${profile.role} ${profile.tags} ${profile.aliases}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""}`);
  const hits = oWords.filter(w => pWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(profiles, events, scenarios) {
  return profiles.map(prof => {
    const matchedEvents = events
      .map(e => ({ ...e, score: relevanceScore(prof, e) }))
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: relevanceScore(prof, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    let coverage;
    if (matchedEvents.length > 0 && matchedScenarios.length > 0) {
      coverage = "FULLY_TRACKED";
    } else if (matchedEvents.length > 0) {
      coverage = "EVENT_ONLY";
    } else if (matchedScenarios.length > 0) {
      coverage = "SCENARIO_ONLY";
    } else {
      coverage = "DARK";
    }

    return { ...prof, coverage, matchedEvents, matchedScenarios };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildIpoestRScript() {
  const base = apiBase();
  const [pRaw, eRaw, scRaw] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const profiles  = normProfiles(pRaw);
  const events    = normEvents(eRaw);
  const scenarios = normScenarios(scRaw);
  const rows      = classify(profiles, events, scenarios);
  const dark      = rows.filter(r => r.coverage === "DARK").length;
  const tracked   = rows.filter(r => r.coverage === "FULLY_TRACKED").length;
  return `Intel Profile Ops Threat Tracker online, sir. Of ${profiles.length} tracked threat actors cross-referenced against ${events.length} live ops events and ${scenarios.length} response scenarios, ${tracked} actors have both confirmed operational activity and a response scenario — but ${dark} actors have neither, representing critical dark spots in threat actor coverage.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function coverageColor(c) {
  if (c === "FULLY_TRACKED")  return GN;
  if (c === "EVENT_ONLY")     return OR;
  if (c === "SCENARIO_ONLY")  return CY;
  return RD;
}

function RelevanceBar({ score }) {
  const pct = Math.round(Math.min(score * 5, 1) * 100);
  return (
    <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: `${CY}99`, transition: "width 0.4s" }} />
    </div>
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelProfileOpsThreatTracker() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const base = apiBase();
      const [pRaw, eRaw, scRaw] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const profiles  = normProfiles(pRaw);
      const evts      = normEvents(eRaw);
      const scens     = normScenarios(scRaw);
      setEvents(evts);
      setScenarios(scens);
      setRows(classify(profiles, evts, scens));
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipoestr-toggle", toggle);
    return () => window.removeEventListener("jarvis:ipoestr-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const base = apiBase();
      const dark      = rows.filter(r => r.coverage === "DARK").length;
      const tracked   = rows.filter(r => r.coverage === "FULLY_TRACKED").length;
      const context   = `Intel Profiles: ${rows.length}, Ops Events: ${events.length}, Scenarios: ${scenarios.length}, Fully Tracked: ${tracked}, Dark Actors: ${dark}`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess threat actor ops tracking coverage. ${context}. Provide a 2-sentence actionable brief on actor tracking gaps and recommended priorities.` }),
      });
      const d = await r.json();
      const script = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `Of ${rows.length} tracked actors, ${dark} remain dark with no operational evidence or response scenario.`;
      const voice = typeof getActiveVoice === "function" ? getActiveVoice() : "alloy";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      }).then(async res => {
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }
      }).catch(() => {});
    } catch {
      /* silent */
    } finally {
      setAssessing(false);
    }
  }, [rows, events, scenarios]);

  const dark      = rows.filter(r => r.coverage === "DARK").length;
  const tracked   = rows.filter(r => r.coverage === "FULLY_TRACKED").length;
  const eventOnly = rows.filter(r => r.coverage === "EVENT_ONLY").length;
  const scenOnly  = rows.filter(r => r.coverage === "SCENARIO_ONLY").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.coverage !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.org.toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "FULLY_TRACKED", "EVENT_ONLY", "SCENARIO_ONLY", "DARK"];

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: open ? `${RD}22` : "rgba(6,10,18,0.82)",
          border: `1px solid ${open ? RD : RD + "66"}`,
          color: open ? RD : `${RD}AA`,
          fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "5px 10px",
          cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap",
        }}
      >
        ◈ IPOESTR{dark > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: "50%", fontSize: 8, padding: "1px 4px",
            animation: "ipoestr-badge-pulse 1.4s ease-in-out infinite",
          }}>{dark}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 60, top: 60, zIndex: Z_IDX + 1,
          width: "min(780px, 90vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${RD}44`,
          borderRadius: 10, display: "flex", flexDirection: "column",
          fontFamily: MN, color: "#D0E6F4", overflow: "hidden",
          boxShadow: `0 0 60px ${RD}22`,
        }}>

          {/* header */}
          <div style={{ padding: "12px 16px", borderBottom: `1px solid rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: RD, fontSize: 11, letterSpacing: 2 }}>◈ INTEL PROFILE OPS THREAT TRACKER</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: `${RD}88` }}>
              {loading ? "loading…" : `${rows.length} profiles · ${events.length} events · ${scenarios.length} scenarios`}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 10, padding: "10px 16px", borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
            {[
              { label: "INTEL PROFILES", val: rows.length, color: CY },
              { label: "OPS EVENTS",     val: events.length, color: OR },
              { label: "SCENARIOS",      val: scenarios.length, color: CY },
              { label: "FULLY TRACKED",  val: tracked,       color: GN },
              { label: "EVENT ONLY",     val: eventOnly,     color: OR },
              { label: "SCENARIO ONLY",  val: scenOnly,      color: CY },
              { label: "DARK",           val: dark,          color: RD },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                flex: 1, background: DIM, border: `1px solid ${color}33`,
                borderRadius: 4, padding: "6px 10px", textAlign: "center",
              }}>
                <div style={{ fontSize: 15, color, fontWeight: 700 }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: `1px solid rgba(255,255,255,0.04)`, flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? `${coverageColor(t === "ALL" ? "FULLY_TRACKED" : t)}22` : "none",
                border: `1px solid ${filter === t ? coverageColor(t === "ALL" ? "FULLY_TRACKED" : t) : "rgba(255,255,255,0.1)"}`,
                color: filter === t ? coverageColor(t === "ALL" ? "FULLY_TRACKED" : t) : "#6E8AA0",
                fontFamily: MN, fontSize: 8, letterSpacing: 1, padding: "3px 8px",
                cursor: "pointer", borderRadius: 2,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search actors…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 3,
                color: "#D0E6F4", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                outline: "none", width: 160,
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 16px" }}>
            {error && <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>⚠ {error}</div>}
            {loading && !rows.length && <div style={{ color: "#6E8AA0", fontSize: 10 }}>loading threat actors…</div>}
            {!loading && !visible.length && <div style={{ color: "#6E8AA0", fontSize: 10 }}>no results</div>}

            {visible.map(row => {
              const col = coverageColor(row.coverage);
              const isDark = row.coverage === "DARK";
              const isExp  = expanded === row.id;
              return (
                <div key={row.id} style={{
                  marginBottom: 6, borderRadius: 4,
                  border: `1px solid ${col}${isDark ? "55" : "33"}`,
                  background: isDark ? `${RD}0A` : DIM,
                  animation: isDark ? "ipoestr-dark-pulse 2s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : row.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px" }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, color: col,
                      border: `1px solid ${col}55`, borderRadius: 2, padding: "1px 5px",
                      background: `${col}11`, whiteSpace: "nowrap",
                    }}>{row.coverage}</span>
                    <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </span>
                    {row.org && (
                      <span style={{ fontSize: 8, color: "#6E8AA0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
                        {row.org}
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: `${col}88` }}>
                      {row.matchedEvents.length}E · {row.matchedScenarios.length}S
                    </span>
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ borderTop: `1px solid rgba(255,255,255,0.05)`, padding: "8px 10px" }}>
                      {row.desc && (
                        <div style={{ fontSize: 9, color: "#7A9AB0", marginBottom: 8, lineHeight: 1.5 }}>{row.desc}</div>
                      )}

                      {/* ops event matches */}
                      {row.matchedEvents.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 8, color: OR, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({row.matchedEvents.length})</div>
                          {row.matchedEvents.slice(0, 4).map(e => (
                            <div key={e.id} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 9, color: OR }}>{e.name}</span>
                                {e.type && (
                                  <span style={{ fontSize: 7, color: "#6E8AA0", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "1px 4px" }}>{e.type}</span>
                                )}
                              </div>
                              <RelevanceBar score={e.score} />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* scenario matches */}
                      {row.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 8, color: CY, letterSpacing: 1, marginBottom: 4 }}>RESPONSE SCENARIOS ({row.matchedScenarios.length})</div>
                          {row.matchedScenarios.slice(0, 4).map(s => (
                            <div key={s.id} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 9, color: CY }}>{s.name}</span>
                                {s.type && (
                                  <span style={{ fontSize: 7, color: "#6E8AA0", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, padding: "1px 4px" }}>{s.type}</span>
                                )}
                              </div>
                              <RelevanceBar score={s.score} />
                            </div>
                          ))}
                        </div>
                      )}

                      {row.coverage === "DARK" && (
                        <div style={{ fontSize: 9, color: `${RD}99`, marginTop: 4 }}>
                          ⚠ No operational evidence or response scenario — actor requires immediate coverage assessment.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assess */}
          <div style={{ padding: "10px 16px", borderTop: `1px solid rgba(255,255,255,0.06)` }}>
            <button onClick={assess} disabled={assessing || loading}
              style={{
                background: assessing ? `${RD}22` : "none",
                border: `1px solid ${RD}66`, color: RD,
                fontFamily: MN, fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                cursor: assessing ? "default" : "pointer", borderRadius: 3,
              }}>
              {assessing ? "◍ assessing…" : "▶ ASSESS THREAT TRACKING"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ipoestr-dark-pulse {
          0%, 100% { border-color: rgba(255,61,61,0.21); }
          50%       { border-color: rgba(255,61,61,0.55); }
        }
        @keyframes ipoestr-badge-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
      `}</style>
    </>
  );
}
