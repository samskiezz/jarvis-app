/**
 * IntelProfileScenarioCoverage — F130.
 *
 * Parallel-fetches /entities/IntelProfile + /v1/scenario/list and
 * keyword-correlates each threat actor (name / description / org /
 * type / aliases) against every scenario (name / objective / type)
 * to surface:
 *
 *   SCENARIO-COVERED — threat actor matched to at least one scenario
 *   UNPLANNED        — no scenario addresses this threat (planning gap)
 *
 * Stat tiles: profiles / scenarios / covered / unplanned.
 * Filter tabs: ALL | COVERED | UNPLANNED + text search.
 * Expand profile → matched scenarios with type badge + relevance score.
 * Unplanned count badge on toggle button (amber).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-coverage brief
 *   + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ IPSCEN at left:40760, bottom:8, zIndex:84.
 * Event:   jarvis:ipscen-toggle
 * Voice:   "intel scenario" / "threat scenario" / "scenario coverage" /
 *          "unplanned threats" / "ipscen"
 * Refresh: 90s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY      = "#29E7FF";
const GREEN   = "#00c878";
const AMBER   = "#F5A623";
const RED     = "#FF4A6E";
const CYAN2   = "#6EE7FF";
const BTN_LEFT = 40760;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.profiles)             ? raw.profiles
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:           p.id            || String(i),
    name:         p.name          || p.title  || p.label || `Profile ${i + 1}`,
    description:  p.description   || p.summary || p.bio  || "",
    org:          p.organization  || p.org     || p.company || "",
    type:         p.type          || p.category || p.profile_type || "",
    aliases:      Array.isArray(p.aliases)  ? p.aliases.join(" ")
                : typeof p.aliases === "string" ? p.aliases : "",
    threat_level: p.threat_level  || p.severity || p.risk_level || "",
    tags:         Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || ""),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.scenarios)            ? raw.scenarios
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    name:        s.name        || s.title || s.label || `Scenario ${i + 1}`,
    objective:   s.objective   || s.description || s.goal || "",
    type:        s.type        || s.category || s.scenario_type || "",
    status:      s.status      || "",
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/.()[\]{}'"]+/)
    .filter((t) => t.length > 2);
}

function relevance(profile, scenario) {
  const profileWords = new Set([
    ...tokenize(profile.name),
    ...tokenize(profile.description),
    ...tokenize(profile.org),
    ...tokenize(profile.type),
    ...tokenize(profile.aliases),
    ...tokenize(profile.tags),
  ]);
  const scenarioTokens = [
    ...tokenize(scenario.name),
    ...tokenize(scenario.objective),
    ...tokenize(scenario.type),
  ];
  if (!profileWords.size || !scenarioTokens.length) return 0;
  const hits = scenarioTokens.filter((t) => profileWords.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(profileWords.size, scenarioTokens.length)) * 100 * 5));
}

function buildCoverage(profiles, scenarios) {
  const covered = new Set();
  const pairs   = [];
  for (const profile of profiles) {
    for (const scenario of scenarios) {
      const score = relevance(profile, scenario);
      if (score >= 8) {
        covered.add(profile.id);
        pairs.push({ profileId: profile.id, scenario, score });
      }
    }
  }
  return { covered, pairs };
}

// ─── threat level colour ──────────────────────────────────────────────────────

function threatColor(level) {
  const l = String(level || "").toLowerCase();
  if (l.includes("critical") || l.includes("high"))    return RED;
  if (l.includes("medium")   || l.includes("moderate")) return AMBER;
  if (l.includes("low"))                                 return GREEN;
  return CYAN2;
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isIpscenQuery(q) {
  return /intel\s*scenario|threat\s*scenario|scenario\s*coverage|unplanned\s*threat|ipscen\b|profile\s*scenario|which\s*threats\s*have\s*scenario/i.test(q || "");
}

export async function buildIpscenScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [pr, sr] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers }),
      fetch(`${base}/v1/scenario/list`,      { headers }),
    ]);
    const [praw, sraw] = await Promise.all([pr.json(), sr.json()]);
    const profiles   = normaliseProfiles(praw);
    const scenarios  = normaliseScenarios(sraw);
    const { covered } = buildCoverage(profiles, scenarios);
    const unplanned  = profiles.length - covered.size;
    const pct        = profiles.length
      ? Math.round((covered.size / profiles.length) * 100)
      : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Intel Profile × Scenario Coverage: ${profiles.length} threat profiles, ${scenarios.length} scenarios. ${covered.size} profiles are SCENARIO-COVERED (${pct}%), ${unplanned} are UNPLANNED (no scenario addresses them). Write a 2-sentence threat-planning coverage brief highlighting the most critical planning gap.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `${pct}% of threat profiles have scenario coverage. ${unplanned} profiles are unplanned — representing active blind-spots in operational scenario planning.`;
  } catch (_) {
    return "Intel profile scenario coverage data unavailable.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function IntelProfileScenarioCoverage() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [covered,   setCovered]   = useState(new Set());
  const [pairs,     setPairs]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [pr, sr] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers }),
        fetch(`${base}/v1/scenario/list`,      { headers }),
      ]);
      const [praw, sraw] = await Promise.all([pr.json(), sr.json()]);
      const profs = normaliseProfiles(praw);
      const scens = normaliseScenarios(sraw);
      const cov   = buildCoverage(profs, scens);
      setProfiles(profs);
      setScenarios(scens);
      setCovered(cov.covered);
      setPairs(cov.pairs);
    } catch (_) {
      // network failure — keep last state
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((p) => !p);
    window.addEventListener("jarvis:ipscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    const text = await buildIpscenScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  };

  const unplanned    = profiles.length - covered.size;
  const pctCovered   = profiles.length
    ? Math.round((covered.size / profiles.length) * 100)
    : 0;

  const visible = profiles.filter((prof) => {
    const matchesFilter =
      filter === "ALL"      ? true
      : filter === "COVERED"  ? covered.has(prof.id)
      : !covered.has(prof.id);
    const q = search.toLowerCase();
    const matchesSearch = !q || [prof.name, prof.description, prof.org, prof.type, prof.aliases, prof.tags]
      .some((f) => f.toLowerCase().includes(q));
    return matchesFilter && matchesSearch;
  });

  const TABS = ["ALL", "COVERED", "UNPLANNED"];
  const TAB_LABELS = {
    ALL:      `ALL (${profiles.length})`,
    COVERED:  `COVERED (${covered.size})`,
    UNPLANNED:`UNPLANNED (${unplanned})`,
  };

  // ── panel ─────────────────────────────────────────────────────────────────

  const panelStyle = {
    position:      "fixed",
    bottom:        50,
    left:          BTN_LEFT,
    width:         440,
    maxHeight:     560,
    background:    "rgba(4,12,20,0.97)",
    border:        "1px solid #1A3A4A",
    borderRadius:  10,
    zIndex:        1200,
    display:       "flex",
    flexDirection: "column",
    fontFamily:    "monospace",
    color:         CY,
    boxShadow:     "0 0 24px rgba(41,231,255,0.10)",
    overflow:      "hidden",
  };

  const TILE = (label, value, color) => (
    <div key={label} style={{ flex: 1, textAlign: "center", padding: "6px 4px", background: "rgba(41,231,255,0.04)", borderRadius: 6 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || CY }}>{value ?? "—"}</div>
      <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((p) => !p)}
        style={{
          position:     "fixed",
          bottom:       8,
          left:         BTN_LEFT,
          zIndex:       84,
          background:   open ? "rgba(41,231,255,0.18)" : "rgba(4,12,20,0.82)",
          border:       `1px solid ${open ? CY : "#1A3A4A"}`,
          borderRadius: 5,
          color:        open ? CY : "#4E7A8A",
          fontSize:     10,
          padding:      "3px 8px",
          cursor:       "pointer",
          letterSpacing: 1,
          whiteSpace:   "nowrap",
        }}
      >
        ◈ IPSCEN{unplanned > 0 && (
          <span style={{
            marginLeft:   5,
            background:   AMBER,
            color:        "#000",
            borderRadius: 3,
            padding:      "0 4px",
            fontSize:     9,
            fontWeight:   700,
          }}>
            {unplanned}
          </span>
        )}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1A2A3A", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                ◈ INTEL PROFILE × SCENARIO COVERAGE
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={assess}
                  disabled={assessing || !profiles.length}
                  style={{
                    background:   "rgba(245,166,35,0.12)",
                    border:       "1px solid #F5A623",
                    borderRadius: 4,
                    color:        AMBER,
                    fontSize:     9,
                    padding:      "2px 8px",
                    cursor:       "pointer",
                  }}
                >
                  {assessing ? "…" : "▶ ASSESS"}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  style={{ background: "none", border: "none", color: "#4E6A7A", fontSize: 14, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {TILE("PROFILES",  profiles.length,  CY)}
              {TILE("SCENARIOS", scenarios.length, CYAN2)}
              {TILE(`COVERED ${pctCovered}%`, covered.size, GREEN)}
              {TILE("UNPLANNED", unplanned, unplanned > 0 ? AMBER : GREEN)}
            </div>

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background:   filter === t
                      ? (t === "COVERED"   ? "rgba(0,200,120,0.15)"
                        : t === "UNPLANNED" ? "rgba(245,166,35,0.15)"
                        : "rgba(41,231,255,0.12)")
                      : "transparent",
                    border:       `1px solid ${filter === t
                      ? (t === "COVERED"   ? GREEN
                        : t === "UNPLANNED" ? AMBER
                        : CY)
                      : "#1A3A4A"}`,
                    borderRadius: 4,
                    color:        filter === t
                      ? (t === "COVERED"   ? GREEN
                        : t === "UNPLANNED" ? AMBER
                        : CY)
                      : "#4E6A7A",
                    fontSize:     9,
                    padding:      "2px 7px",
                    cursor:       "pointer",
                    whiteSpace:   "nowrap",
                  }}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search…"
                style={{
                  flex:         1,
                  background:   "rgba(41,231,255,0.04)",
                  border:       "1px solid #1A3A4A",
                  borderRadius: 4,
                  color:        CY,
                  fontSize:     9,
                  padding:      "2px 6px",
                  outline:      "none",
                  minWidth:     0,
                }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px" }}>
            {loading && !profiles.length ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ textAlign: "center", color: "#4E6A7A", fontSize: 10, padding: 20 }}>
                No profiles match current filter.
              </div>
            ) : (
              visible.map((prof) => {
                const isCovered   = covered.has(prof.id);
                const profPairs   = pairs
                  .filter((p) => p.profileId === prof.id)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5);
                const isExpanded  = expanded === prof.id;
                const tColor      = threatColor(prof.threat_level);

                return (
                  <div
                    key={prof.id}
                    style={{
                      marginBottom:  6,
                      background:    "rgba(41,231,255,0.03)",
                      border:        `1px solid ${isCovered ? "rgba(0,200,120,0.22)" : "rgba(245,166,35,0.18)"}`,
                      borderRadius:  6,
                      overflow:      "hidden",
                    }}
                  >
                    {/* Row header */}
                    <div
                      onClick={() => setExpanded(isExpanded ? null : prof.id)}
                      style={{
                        display:    "flex",
                        alignItems: "center",
                        gap:        8,
                        padding:    "7px 10px",
                        cursor:     "pointer",
                      }}
                    >
                      {/* Status dot */}
                      <div style={{
                        width:        7,
                        height:       7,
                        borderRadius: "50%",
                        background:   isCovered ? GREEN : AMBER,
                        flexShrink:   0,
                      }} />

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize:     11,
                          fontWeight:   600,
                          color:        isCovered ? "#E0E8FF" : "#C0A060",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}>
                          {prof.name}
                        </div>
                        <div style={{ fontSize: 9, color: "#4E6A7A", marginTop: 1 }}>
                          {[prof.type, prof.org].filter(Boolean).join(" · ")}
                          {prof.threat_level && (
                            <span style={{ marginLeft: 4, color: tColor, fontWeight: 700 }}>
                              ▲ {prof.threat_level.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Badge */}
                      <span style={{
                        fontSize:     9,
                        fontWeight:   700,
                        color:        isCovered ? GREEN : AMBER,
                        background:   isCovered ? "rgba(0,200,120,0.10)" : "rgba(245,166,35,0.10)",
                        border:       `1px solid ${isCovered ? "rgba(0,200,120,0.30)" : "rgba(245,166,35,0.28)"}`,
                        borderRadius: 3,
                        padding:      "1px 5px",
                        flexShrink:   0,
                      }}>
                        {isCovered ? `COVERED ×${profPairs.length}` : "UNPLANNED"}
                      </span>

                      {/* Chevron */}
                      <span style={{ fontSize: 9, color: "#4E6A7A" }}>
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Expanded matched scenarios */}
                    {isExpanded && (
                      <div style={{ padding: "0 10px 10px", borderTop: "1px solid #1A2A3A" }}>
                        {profPairs.length > 0 ? (
                          profPairs.map(({ scenario, score }) => (
                            <div
                              key={scenario.id}
                              style={{
                                marginTop:    8,
                                background:   "rgba(0,200,120,0.04)",
                                borderRadius: 5,
                                padding:      "6px 8px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {scenario.type && (
                                  <span style={{
                                    fontSize:     8,
                                    background:   "rgba(41,231,255,0.10)",
                                    border:       "1px solid #1A4A5A",
                                    borderRadius: 3,
                                    padding:      "1px 4px",
                                    color:        CY,
                                    textTransform: "uppercase",
                                    flexShrink:   0,
                                  }}>
                                    {scenario.type}
                                  </span>
                                )}
                                {scenario.status && (
                                  <span style={{
                                    fontSize:     8,
                                    background:   "rgba(110,231,255,0.08)",
                                    border:       "1px solid #2A4A5A",
                                    borderRadius: 3,
                                    padding:      "1px 4px",
                                    color:        CYAN2,
                                    textTransform: "uppercase",
                                    flexShrink:   0,
                                  }}>
                                    {scenario.status}
                                  </span>
                                )}
                                <span style={{
                                  fontSize:     10,
                                  color:        "#C0D8E8",
                                  overflow:     "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace:   "nowrap",
                                  flex:         1,
                                }}>
                                  {scenario.name}
                                </span>
                              </div>

                              {scenario.objective && (
                                <div style={{
                                  fontSize:  9,
                                  color:     "#4E8A9A",
                                  marginTop: 3,
                                  overflow:  "hidden",
                                  display:   "-webkit-box",
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: "vertical",
                                }}>
                                  {scenario.objective}
                                </div>
                              )}

                              {/* Relevance bar */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                                <div style={{ flex: 1, height: 3, background: "rgba(0,200,120,0.12)", borderRadius: 2, overflow: "hidden" }}>
                                  <div style={{ width: `${score}%`, height: "100%", background: GREEN, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: GREEN, minWidth: 52, textAlign: "right" }}>
                                  match {score}%
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ marginTop: 10, fontSize: 10, color: AMBER }}>
                            ⚠ No scenario covers this threat profile — planning gap identified.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding:        "6px 14px",
            borderTop:      "1px solid #1A2A3A",
            fontSize:       9,
            color:          "#4E6A7A",
            flexShrink:     0,
            display:        "flex",
            justifyContent: "space-between",
          }}>
            <span>/entities/IntelProfile · /v1/scenario/list · /v1/jarvis/agent/chat</span>
            <span>{POLL_MS / 1000}s auto-refresh</span>
          </div>
        </div>
      )}
    </>
  );
}
