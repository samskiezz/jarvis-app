/**
 * F83 — IntelProfile × SwarmJob × Scenario Actor Deployment Status (IASAD)
 * Endpoints: /entities/IntelProfile × /entities/SwarmJob × /v1/scenario/list
 * Classification: FULLY_COUNTERED  (swarm + scenario both match actor)
 *                 SWARM_TARGETED   (swarm match only)
 *                 SCENARIO_PLANNED (scenario match only)
 *                 UNMITIGATED      (no active countermeasure coverage)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 989_960;
const POLL_MS  = 90_000;
const Z_INDEX  = 146;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const IASAD_RE =
  /\b(iasad|intel\s*actor\s*(deploy|deployment|status|counter)|threat\s*actor\s*(swarm|scenario|deploy|counter|coverage)|actor\s*(deploy|counter|unmitigated|countermeasure)|unmitigated\s*actor|countermeasure\s*(coverage|status|map)|swarm\s*(actor|intel\s*profile)|scenario\s*counter\s*actor)\b/i;

export function isIasadQuery(t) {
  return IASAD_RE.test(t || "");
}

function normaliseProfile(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.profile_id || raw._id || String(Math.random()),
    name: raw.name || raw.actor_name || raw.alias || raw.display_name || "Unknown Actor",
    aliases: Array.isArray(raw.aliases) ? raw.aliases : [],
    org: raw.org || raw.organisation || raw.organization || raw.affiliated_org || "",
    role: raw.role || raw.threat_type || raw.category || "",
    description: raw.description || raw.summary || raw.notes || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseSwarmJob(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.job_id || raw._id || String(Math.random()),
    name: raw.name || raw.job_name || raw.title || "Untitled Job",
    description: raw.description || raw.summary || raw.objective || "",
    type: raw.type || raw.job_type || "",
    status: raw.status || raw.state || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.scenario_name || "Untitled Scenario",
    description: raw.description || raw.summary || raw.details || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function scoreMatch(actorTokens, item) {
  const itemTokens = tokenize(
    `${item.name || item.title || ""} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.type || item.status || ""}`
  );
  if (!actorTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return actorTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const RE = "#ff4444";
const GR = "#4ade80";
const AM = "#ffc107";
const OR = "#fb923c";

const CLASS_META = {
  FULLY_COUNTERED:  { label: "FULLY COUNTERED",  color: GR,    desc: "Actor targeted by both swarm operations and scenario playbooks" },
  SWARM_TARGETED:   { label: "SWARM TARGETED",   color: CY,    desc: "Swarm operation active against this actor, no scenario backing" },
  SCENARIO_PLANNED: { label: "SCENARIO PLANNED", color: OR,    desc: "Scenario playbook exists for this actor, no active swarm" },
  UNMITIGATED:      { label: "UNMITIGATED",       color: RE,    desc: "No active swarm or scenario countermeasure — threat gap" },
};

const TABS = ["ALL", "FULLY_COUNTERED", "SWARM_TARGETED", "SCENARIO_PLANNED", "UNMITIGATED"];

export async function buildIasadScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [ipRes, swRes, scRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/SwarmJob`,     { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`,      { headers }).then((r) => r.json()),
  ]);

  const profiles  = ipRes.status === "fulfilled" ? ipRes.value : [];
  const swarmJobs = swRes.status === "fulfilled" ? swRes.value : [];
  const scenarios = scRes.status === "fulfilled" ? scRes.value : [];

  const ipArr = (Array.isArray(profiles)  ? profiles  : profiles?.items  || profiles?.data  || []).map(normaliseProfile).filter(Boolean);
  const swArr = (Array.isArray(swarmJobs) ? swarmJobs : swarmJobs?.items || swarmJobs?.data || []).map(normaliseSwarmJob).filter(Boolean);
  const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

  const counts = { FULLY_COUNTERED: 0, SWARM_TARGETED: 0, SCENARIO_PLANNED: 0, UNMITIGATED: 0 };
  for (const ip of ipArr) {
    const tok = tokenize(`${ip.name} ${ip.aliases.join(" ")} ${ip.org} ${ip.role} ${ip.description} ${ip.tags.join(" ")}`);
    const hasSw = swArr.some((j) => scoreMatch(tok, j) > 0);
    const hasSc = scArr.some((s) => scoreMatch(tok, s) > 0);
    if (hasSw && hasSc)  counts.FULLY_COUNTERED++;
    else if (hasSw)      counts.SWARM_TARGETED++;
    else if (hasSc)      counts.SCENARIO_PLANNED++;
    else                 counts.UNMITIGATED++;
  }

  const coveredPct = ipArr.length
    ? Math.round(((counts.FULLY_COUNTERED + counts.SWARM_TARGETED + counts.SCENARIO_PLANNED) / ipArr.length) * 100)
    : 0;

  return `Intel Actor Deployment Matrix online, sir. ${ipArr.length} threat actor profiles cross-referenced against ${swArr.length} swarm operations and ${scArr.length} scenario playbooks — ${counts.FULLY_COUNTERED} actors are fully countered with both swarm and scenario coverage, ${counts.SWARM_TARGETED} have active swarm targeting only, ${counts.SCENARIO_PLANNED} are scenario-planned but without active swarm deployment, and ${counts.UNMITIGATED} actors have no active countermeasure coverage whatsoever. Overall actor countermeasure coverage stands at ${coveredPct}%.`.trim();
}

export default function IntelActorDeploymentMatrix() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [ipRes, swRes, scRes] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`, { headers }).then((r) => r.json()),
        fetch(`${base}/entities/SwarmJob`,     { headers }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`,      { headers }).then((r) => r.json()),
      ]);

      const profiles  = ipRes.status === "fulfilled" ? ipRes.value : [];
      const swarmJobs = swRes.status === "fulfilled" ? swRes.value : [];
      const scenarios = scRes.status === "fulfilled" ? scRes.value : [];

      const ipArr = (Array.isArray(profiles)  ? profiles  : profiles?.items  || profiles?.data  || []).map(normaliseProfile).filter(Boolean);
      const swArr = (Array.isArray(swarmJobs) ? swarmJobs : swarmJobs?.items || swarmJobs?.data || []).map(normaliseSwarmJob).filter(Boolean);
      const scArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

      const mapped = ipArr.map((ip) => {
        const tok = tokenize(`${ip.name} ${ip.aliases.join(" ")} ${ip.org} ${ip.role} ${ip.description} ${ip.tags.join(" ")}`);
        const matchedSwarm = swArr
          .map((j) => ({ ...j, score: scoreMatch(tok, j) }))
          .filter((j) => j.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedScenarios = scArr
          .map((s) => ({ ...s, score: scoreMatch(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        const hasSw = matchedSwarm.length > 0;
        const hasSc = matchedScenarios.length > 0;
        const cls =
          hasSw && hasSc ? "FULLY_COUNTERED"  :
          hasSw           ? "SWARM_TARGETED"   :
          hasSc           ? "SCENARIO_PLANNED" :
                            "UNMITIGATED";
        return { ip, matchedSwarm, matchedScenarios, cls };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iasad-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iasad-toggle", onToggle);
  }, []);

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildIasadScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Based on this actor deployment status: ${script}. In 2 sentences, identify the most critical countermeasure gap and recommend immediate action.` }),
      });
      const d = await r.json();
      setBrief(d.answer || script);
    } catch {
      setBrief("Unable to reach reasoning core. Please check system connectivity.");
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    const unmitigated = rows.filter((r) => r.cls === "UNMITIGATED").length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Actor Deployment Matrix (IASAD)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${RE}55`,
          color: RE, borderRadius: 6, padding: "3px 8px", fontSize: 10,
          letterSpacing: 2, cursor: "pointer", fontFamily: "monospace",
          boxShadow: unmitigated > 0 ? `0 0 14px ${RE}55` : "none",
        }}
      >
        ◈ IASAD
        {unmitigated > 0 && (
          <span style={{
            marginLeft: 5, background: RE, color: "#000", borderRadius: "50%",
            padding: "1px 5px", fontSize: 9, fontWeight: 700,
            animation: "iasad-pulse 1.4s ease-in-out infinite",
          }}>
            {unmitigated}
          </span>
        )}
        <style>{`@keyframes iasad-pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </button>
    );
  }

  const counts = { FULLY_COUNTERED: 0, SWARM_TARGETED: 0, SCENARIO_PLANNED: 0, UNMITIGATED: 0 };
  rows.forEach((r) => counts[r.cls]++);

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.ip.name.toLowerCase().includes(q) ||
        r.ip.org.toLowerCase().includes(q) ||
        r.ip.role.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const coveredPct = rows.length
    ? Math.round(((counts.FULLY_COUNTERED + counts.SWARM_TARGETED + counts.SCENARIO_PLANNED) / rows.length) * 100)
    : 0;

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: Z_INDEX + 10, width: "min(780px,94vw)", maxHeight: "82vh",
      background: "rgba(6,10,16,0.97)", border: `1px solid ${RE}55`,
      borderRadius: 14, display: "flex", flexDirection: "column",
      boxShadow: `0 0 60px ${RE}22`, fontFamily: "'JetBrains Mono',monospace",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${RE}33`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{ color: RE, fontSize: 13, letterSpacing: 3, fontWeight: 700 }}>◈ IASAD</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Intel Actor Deployment Matrix — IntelProfile × SwarmJob × Scenario
        </span>
        <button onClick={load} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }} title="Refresh">↻</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${RE}22`, flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "ACTORS",      value: rows.length,                 color: "#DCEBF5" },
          { label: "SWARM JOBS",  value: "—",                         color: CY },
          { label: "SCENARIOS",   value: "—",                         color: OR },
          { label: "FULLY CTR",   value: counts.FULLY_COUNTERED,      color: GR },
          { label: "SWARM ONLY",  value: counts.SWARM_TARGETED,       color: CY },
          { label: "SCEN ONLY",   value: counts.SCENARIO_PLANNED,     color: OR },
          { label: "UNMITIGATED", value: counts.UNMITIGATED,          color: RE },
        ].map((s) => (
          <div key={s.label} style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 8,
            padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}

        {/* Coverage bar */}
        <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0" }}>
            <span>COUNTERMEASURE COVERAGE</span>
            <span style={{ color: coveredPct >= 70 ? GR : coveredPct >= 40 ? AM : RE }}>{coveredPct}%</span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${coveredPct}%`, height: "100%", background: coveredPct >= 70 ? GR : coveredPct >= 40 ? AM : RE, transition: "width 0.6s" }} />
          </div>
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${RE}22`, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? RE : "rgba(255,255,255,0.04)",
            border: `1px solid ${RE}44`, color: tab === t ? "#000" : "#DCEBF5",
            borderRadius: 5, padding: "3px 9px", fontSize: 9, letterSpacing: 1,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            {t.replace(/_/g, " ")}
            {t !== "ALL" && <span style={{ marginLeft: 4, opacity: 0.7 }}>{counts[t] ?? 0}</span>}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actors…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${RE}33`, borderRadius: 5, padding: "3px 8px",
            color: "#DCEBF5", fontSize: 10, fontFamily: "inherit", width: 160,
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 16px" }}>
        {loading && <div style={{ color: "#6E8AA0", fontSize: 12, padding: 16 }}>Fetching actor deployment data…</div>}
        {error   && <div style={{ color: RE, fontSize: 11, padding: 8 }}>⚠ {error}</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: "#6E8AA0", fontSize: 12, padding: 16 }}>No actors match current filter.</div>
        )}
        {filtered.map(({ ip, matchedSwarm, matchedScenarios, cls }) => {
          const meta = CLASS_META[cls];
          const isExp = expanded === ip.id;
          return (
            <div key={ip.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : ip.id)}
                style={{
                  background: "rgba(255,255,255,0.03)", border: `1px solid ${meta.color}33`,
                  borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  borderLeft: cls === "UNMITIGATED" ? `3px solid ${RE}` : `3px solid ${meta.color}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ip.name}
                  </div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 2 }}>
                    {[ip.role, ip.org].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{
                  fontSize: 9, letterSpacing: 1, color: meta.color,
                  background: `${meta.color}18`, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap",
                  animation: cls === "UNMITIGATED" ? "iasad-pulse 1.4s ease-in-out infinite" : "none",
                }}>
                  {meta.label}
                </span>
                <span style={{ color: "#6E8AA0", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{
                  background: "rgba(0,0,0,0.25)", borderRadius: "0 0 8px 8px",
                  border: `1px solid ${meta.color}22`, borderTop: "none",
                  padding: "10px 12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                }}>
                  {/* Swarm matches */}
                  <div>
                    <div style={{ fontSize: 10, color: CY, letterSpacing: 1, marginBottom: 6 }}>
                      ◈ SWARM OPERATIONS ({matchedSwarm.length})
                    </div>
                    {matchedSwarm.length === 0
                      ? <div style={{ fontSize: 10, color: "#6E8AA0" }}>No swarm operations targeting this actor.</div>
                      : matchedSwarm.slice(0, 4).map((j) => (
                          <div key={j.id} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 10, color: "#DCEBF5" }}>{j.name}</div>
                            <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 3 }}>
                              {[j.type, j.status].filter(Boolean).join(" · ")}
                            </div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, j.score * 20)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))
                    }
                  </div>

                  {/* Scenario matches */}
                  <div>
                    <div style={{ fontSize: 10, color: OR, letterSpacing: 1, marginBottom: 6 }}>
                      ◈ SCENARIO PLAYBOOKS ({matchedScenarios.length})
                    </div>
                    {matchedScenarios.length === 0
                      ? <div style={{ fontSize: 10, color: "#6E8AA0" }}>No scenario playbooks for this actor.</div>
                      : matchedScenarios.slice(0, 4).map((s) => (
                          <div key={s.id} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 10, color: "#DCEBF5" }}>{s.name}</div>
                            <div style={{ fontSize: 9, color: "#6E8AA0", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {s.description?.slice(0, 60) || ""}
                            </div>
                            <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, s.score * 20)}%`, height: "100%", background: OR, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess footer */}
      <div style={{ padding: "10px 16px", borderTop: `1px solid ${RE}22`, flexShrink: 0 }}>
        {brief && (
          <div style={{
            fontSize: 11, color: "#DCEBF5", background: "rgba(255,255,255,0.04)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 8,
            border: `1px solid ${RE}33`, lineHeight: 1.6,
          }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: assessing ? "rgba(255,255,255,0.04)" : RE,
            border: `1px solid ${RE}`, color: assessing ? "#6E8AA0" : "#000",
            borderRadius: 6, padding: "5px 14px", fontSize: 10, letterSpacing: 1,
            cursor: assessing ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS DEPLOYMENT"}
        </button>
        <span style={{ marginLeft: 12, fontSize: 9, color: "#6E8AA0" }}>
          Auto-refresh every 90 s · {rows.length} actors loaded
        </span>
      </div>
    </div>
  );
}
