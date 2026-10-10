/**
 * F49 — Scenario × Intel Profile Coverage (SCIP)
 *
 * Parallel-fetches /v1/scenario/list + /entities/IntelProfile, then
 * keyword-correlates each scenario against tracked intel profiles to surface:
 *   THREATENED  — ≥1 intel profile has keyword overlap with this scenario
 *   CLEAR       — no tracked threat actor aligns with this scenario domain
 *
 * Stat tiles: scenarios / profiles / threatened / clear
 * Filter tabs: ALL | THREATENED | CLEAR
 * Text search across scenario names / descriptions.
 * Expand any scenario → matched intel profiles with category badge + relevance score.
 * Red badge on threatened count.
 * ▶ ASSESS: 2-sentence scenario threat landscape brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SCIP  at bottom:8 left:71320, zIndex:137.
 * Event:   jarvis:scip-toggle
 * Voice:   "scenario intel / scenario threat / scenario profile / scip /
 *           threat scenario / intel scenario coverage / scenario intel profile /
 *           which scenarios are threatened / scenario threat actor coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 71320;
const POLL_MS  = 90_000;
const RED      = "#F87171";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SCIP_RE =
  /\b(scenario\s+intel|intel\s+scenario[s]?|scenario\s+threat[s]?|threat\s+scenario[s]?|scenario\s+profile[s]?|profile\s+scenario[s]?|scip|scenario\s+intel\s+profile[s]?|which\s+scenario[s]?\s+(are|have|show|linked|tied|match)\s+(threat|intel|profile|risk|actor)|scenario\s+threat\s+actor[s]?|scenario\s+coverage|scenario\s+actor|actor\s+scenario|adversary\s+scenario[s]?)\b/i;

export function isSCIPQuery(q) { return SCIP_RE.test(q); }

export async function buildSCIPScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [scRes, ipRes] = await Promise.all([
      fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
    ]);
    const scenarios = normaliseScenarios(await scRes.json());
    const profiles  = normaliseProfiles(await ipRes.json());

    const threatened = scenarios.filter((s) => profiles.some((p) => relevance(s, p) > 0)).length;
    const clear      = scenarios.length - threatened;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS scenario × intel profile threat landscape analysis: ${scenarios.length} scenarios on record, ` +
          `${profiles.length} tracked intel profiles. ${threatened} scenarios show keyword alignment with ` +
          `at least one tracked threat actor profile; ${clear} scenarios have no detected adversarial alignment. ` +
          `Provide a 2-sentence scenario threat landscape brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Scenario intel profile coverage analysis complete, sir.").trim();
  } catch {
    return "Scenario intel profile coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)             ? raw
    : Array.isArray(raw?.scenarios)          ? raw.scenarios
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.items)              ? raw.items
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || s.scenario_id || String(i),
    name:        s.name        || s.title       || s.label   || `Scenario ${i + 1}`,
    type:        s.type        || s.category    || s.kind    || "",
    status:      s.status      || s.state       || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    description: (s.description || s.summary || s.details || s.objective || "").toString().slice(0, 300),
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                   ? raw
    : Array.isArray(raw?.intel_profiles)           ? raw.intel_profiles
    : Array.isArray(raw?.profiles)                 ? raw.profiles
    : Array.isArray(raw?.data)                     ? raw.data
    : Array.isArray(raw?.results)                  ? raw.results
    : Array.isArray(raw?.items)                    ? raw.items
    : [];
  return arr.map((p, i) => ({
    id:          p.id          || p.profile_id  || String(i),
    name:        p.name        || p.title       || p.label   || `Profile ${i + 1}`,
    category:    p.category    || p.type        || p.kind    || "",
    aliases:     Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
    tags:        Array.isArray(p.tags) ? p.tags.join(" ") : (p.tags || ""),
    description: (p.description || p.summary || p.details || p.notes || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, profile) {
  const sw = keywords(`${scenario.name} ${scenario.type} ${scenario.description} ${scenario.tags}`);
  const pw = keywords(`${profile.name} ${profile.category} ${profile.description} ${profile.aliases} ${profile.tags}`);
  return sw.filter((w) => pw.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(scenarios, profiles) {
  return scenarios.map((sc) => {
    const matched = profiles
      .map((p) => ({ ...p, score: relevance(sc, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sc, profiles: matched, threatened: matched.length > 0 };
  });
}

function categoryColor(cat) {
  const lc = String(cat || "").toLowerCase();
  if (lc.includes("state") || lc.includes("nation"))  return "#F87171";
  if (lc.includes("criminal") || lc.includes("crime")) return "#FB923C";
  if (lc.includes("terror"))                           return "#EF4444";
  if (lc.includes("cyber"))                            return "#60A5FA";
  return "#A78BFA";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "THREATENED", "CLEAR"];

export default function ScenarioIntelProfileCoverage() {
  const [open,      setOpen]      = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [scRes, ipRes] = await Promise.all([
        fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      ]);
      setScenarios(normaliseScenarios(await scRes.json()));
      setProfiles(normaliseProfiles(await ipRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:scip-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scip-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildSCIPScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(scenarios, profiles);
  const threatened = linked.filter((s) => s.threatened).length;
  const clear      = linked.length - threatened;

  const displayed = linked.filter((s) => {
    if (filter === "THREATENED" && !s.threatened) return false;
    if (filter === "CLEAR" && s.threatened)        return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.type.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scenario × Intel Profile Coverage (SCIP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 137,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${RED}55`,
          color: RED, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {threatened > 0
          ? <><span style={{ background: RED, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{threatened}</span>◈ SCIP</>
          : "◈ SCIP"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 137,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${RED}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${RED}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}33` }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ SCIP</span>
        <span style={{ color: "#6E8AA0", fontSize: 9, flex: 1 }}>SCENARIO × INTEL PROFILE COVERAGE</span>
        {lastFetch && <span style={{ color: "#6E8AA0", fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: RED, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${RED}22` }}>
        {[
          { label: "SCENARIOS",  value: linked.length,   col: "#60A5FA" },
          { label: "PROFILES",   value: profiles.length, col: "#A78BFA" },
          { label: "THREATENED", value: threatened,       col: RED },
          { label: "CLEAR",      value: clear,            col: "#4ADE80" },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${RED}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${RED}22` : "none",
            border: `1px solid ${filter === t ? RED : "#6E8AA0"}`,
            color: filter === t ? RED : "#6E8AA0",
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${RED}`,
          color: RED, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* scenario list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 20 }}>
            No scenarios match the current filter.
          </div>
        )}
        {displayed.map((sc) => {
          const isExp  = expanded === sc.id;
          const status = sc.threatened ? "THREATENED" : "CLEAR";
          const col    = sc.threatened ? RED : "#4ADE80";
          return (
            <div key={sc.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : sc.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${RED}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${sc.threatened ? RED + "44" : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{sc.name}</span>
                {sc.type && <span style={{ fontSize: 8, color: "#6E8AA0" }}>{sc.type}</span>}
                {sc.threatened && (
                  <span style={{ fontSize: 8, color: RED }}>{sc.profiles.length} profile{sc.profiles.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${RED}22` }}>
                  {sc.description && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 6 }}>
                      {sc.description.slice(0, 120) || "No description."}
                    </div>
                  )}
                  {sc.profiles.length === 0 ? (
                    <div style={{ fontSize: 9, color: "#4ADE80" }}>No tracked intel profiles align with this scenario.</div>
                  ) : (
                    sc.profiles.map((prof) => (
                      <div key={prof.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${categoryColor(prof.category)}22`, color: categoryColor(prof.category),
                          letterSpacing: 1,
                        }}>
                          {String(prof.category || "ACTOR").toUpperCase().slice(0, 10)}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{prof.name}</span>
                        <span style={{ fontSize: 8, color: RED }}>rel:{prof.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
