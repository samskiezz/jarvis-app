/**
 * F91 — Investment × Swarm × Scenario Coverage (ISSMAP)
 * Endpoints: /entities/Investment × /entities/SwarmJob × /v1/scenario/list
 * Classification:
 *   FULLY_DEPLOYED  — investment matched a swarm job AND a scenario
 *   SWARM_ACTIVE    — investment matched a swarm job only
 *   SCENARIO_PLANNED — investment matched a scenario only
 *   UNPROTECTED     — no swarm or scenario covers this investment
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 993_880;
const POLL_MS  = 90_000;

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

const ISSMAP_RE =
  /\b(issmap|investment\s*swarm|investment\s*scenario|portfolio\s*deployment|asset\s*protection|unprotected\s*invest(ment)?s?|swarm\s*invest(ment)?s?|scenario\s*invest(ment)?s?|portfolio\s*coverage\s*map)\b/i;

export function isIssmapQuery(t) {
  return ISSMAP_RE.test(t || "");
}

function normaliseInvestment(raw) {
  if (!raw) return null;
  return {
    id:          raw.id           || raw.investment_id || raw._id   || String(Math.random()),
    name:        raw.name         || raw.title         || raw.label  || "Unnamed Investment",
    description: raw.description  || raw.summary       || raw.about  || "",
    type:        raw.type         || raw.category       || raw.kind   || "",
    sector:      raw.sector       || raw.industry       || "",
    tags:        Array.isArray(raw.tags)   ? raw.tags   : [],
    value:       raw.value        || raw.amount         || null,
  };
}

function normaliseSwarmJob(raw) {
  if (!raw) return null;
  return {
    id:          raw.id     || raw.job_id   || raw._id || String(Math.random()),
    name:        raw.name   || raw.title    || raw.label  || "Untitled Job",
    description: raw.description || raw.details || raw.summary || "",
    type:        raw.type   || raw.job_type || "",
    status:      raw.status || raw.state   || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id:          raw.id       || raw.scenario_id || raw._id || String(Math.random()),
    name:        raw.name     || raw.title       || raw.label  || "Untitled Scenario",
    description: raw.description || raw.summary  || raw.details || "",
    type:        raw.type     || raw.category    || "",
    tags:        Array.isArray(raw.tags) ? raw.tags : [],
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

function scoreMatch(invTokens, item) {
  const itemTokens = tokenize(
    `${item.name} ${item.description || ""} ${(item.tags || []).join(" ")} ${item.type || ""} ${item.status || ""}`
  );
  if (!invTokens.length || !itemTokens.length) return 0;
  const set = new Set(itemTokens);
  return invTokens.filter((t) => set.has(t)).length;
}

const CY = "#00e5ff";
const GR = "#4ade80";
const AM = "#ffc107";
const RD = "#f87171";

const CLASS_META = {
  FULLY_DEPLOYED:   { label: "FULLY DEPLOYED",   color: GR,  desc: "Matched a swarm job AND a scenario" },
  SWARM_ACTIVE:     { label: "SWARM ACTIVE",      color: CY,  desc: "Matched a swarm job only" },
  SCENARIO_PLANNED: { label: "SCENARIO PLANNED",  color: "#a78bfa", desc: "Matched a scenario only" },
  UNPROTECTED:      { label: "UNPROTECTED",       color: RD,  desc: "No swarm or scenario covers this investment" },
};

const TABS = ["ALL", "FULLY_DEPLOYED", "SWARM_ACTIVE", "SCENARIO_PLANNED", "UNPROTECTED"];

export async function buildIssmapScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [invRes, swRes, scRes] = await Promise.allSettled([
    fetch(`${base}/entities/Investment`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/SwarmJob`,   { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`,    { headers }).then((r) => r.json()),
  ]);

  const investments = invRes.status === "fulfilled" ? invRes.value : [];
  const swarmJobs   = swRes.status  === "fulfilled" ? swRes.value  : [];
  const scenarios   = scRes.status  === "fulfilled" ? scRes.value  : [];

  const invArr = (Array.isArray(investments) ? investments : investments?.items || investments?.data || []).map(normaliseInvestment).filter(Boolean);
  const swArr  = (Array.isArray(swarmJobs)   ? swarmJobs   : swarmJobs?.items  || swarmJobs?.data  || []).map(normaliseSwarmJob).filter(Boolean);
  const scArr  = (Array.isArray(scenarios)   ? scenarios   : scenarios?.items  || scenarios?.data  || []).map(normaliseScenario).filter(Boolean);

  const counts = { FULLY_DEPLOYED: 0, SWARM_ACTIVE: 0, SCENARIO_PLANNED: 0, UNPROTECTED: 0 };
  for (const inv of invArr) {
    const tok      = tokenize(`${inv.name} ${inv.description} ${inv.type} ${inv.sector} ${inv.tags.join(" ")}`);
    const hasSwarm = swArr.some((s) => scoreMatch(tok, s) > 0);
    const hasScene = scArr.some((s) => scoreMatch(tok, s) > 0);
    if (hasSwarm && hasScene)    counts.FULLY_DEPLOYED++;
    else if (hasSwarm)           counts.SWARM_ACTIVE++;
    else if (hasScene)           counts.SCENARIO_PLANNED++;
    else                         counts.UNPROTECTED++;
  }

  const total        = invArr.length;
  const deployedPct  = total > 0 ? Math.round(((counts.FULLY_DEPLOYED + counts.SWARM_ACTIVE + counts.SCENARIO_PLANNED) / total) * 100) : 0;

  return `Investment swarm and scenario coverage map, sir. ${total} investments analysed. ${counts.FULLY_DEPLOYED} fully deployed with both swarm and scenario cover. ${counts.SWARM_ACTIVE} swarm-active only. ${counts.SCENARIO_PLANNED} scenario-planned only. ${counts.UNPROTECTED} unprotected investments with no swarm job or scenario coverage. Overall portfolio deployment stands at ${deployedPct} percent. ${counts.UNPROTECTED > 0 ? `Recommend immediate review of the ${counts.UNPROTECTED} unprotected investment${counts.UNPROTECTED !== 1 ? "s" : ""}. No active swarm operations or contingency scenarios exist to protect these assets.` : "All investments have operational or contingency cover. Portfolio deployment is strong."}`;
}

export default function InvestmentSwarmScenarioCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [rows, setRows]         = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [lastPoll, setLastPoll] = useState(null);
  const timerRef                = useRef(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [invRes, swRes, scRes] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers }).then((r) => r.json()),
        fetch(`${base}/entities/SwarmJob`,   { headers }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`,    { headers }).then((r) => r.json()),
      ]);

      const investments = invRes.status === "fulfilled" ? invRes.value : [];
      const swarmJobs   = swRes.status  === "fulfilled" ? swRes.value  : [];
      const scenarios   = scRes.status  === "fulfilled" ? scRes.value  : [];

      const invArr = (Array.isArray(investments) ? investments : investments?.items || investments?.data || []).map(normaliseInvestment).filter(Boolean);
      const swArr  = (Array.isArray(swarmJobs)   ? swarmJobs   : swarmJobs?.items  || swarmJobs?.data  || []).map(normaliseSwarmJob).filter(Boolean);
      const scArr  = (Array.isArray(scenarios)   ? scenarios   : scenarios?.items  || scenarios?.data  || []).map(normaliseScenario).filter(Boolean);

      const classified = invArr.map((inv) => {
        const tok = tokenize(`${inv.name} ${inv.description} ${inv.type} ${inv.sector} ${inv.tags.join(" ")}`);

        const matchedSwarm = swArr
          .map((s) => ({ ...s, score: scoreMatch(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);

        const matchedScenarios = scArr
          .map((s) => ({ ...s, score: scoreMatch(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);

        const hasSwarm = matchedSwarm.length > 0;
        const hasScene = matchedScenarios.length > 0;
        let cls;
        if (hasSwarm && hasScene)  cls = "FULLY_DEPLOYED";
        else if (hasSwarm)         cls = "SWARM_ACTIVE";
        else if (hasScene)         cls = "SCENARIO_PLANNED";
        else                       cls = "UNPROTECTED";

        return { ...inv, cls, matchedSwarm, matchedScenarios };
      });

      setRows(classified);
      setLastPoll(new Date());
    } catch (e) {
      setError(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    function onToggle() { setOpen((v) => { if (!v) fetchData(); return !v; }); }
    window.addEventListener("jarvis:issmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:issmap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const counts = { FULLY_DEPLOYED: 0, SWARM_ACTIVE: 0, SCENARIO_PLANNED: 0, UNPROTECTED: 0 };
  rows.forEach((r) => counts[r.cls]++);

  const visible = rows.filter((r) => {
    const matchTab    = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const total       = rows.length;
  const deployedPct = total > 0 ? Math.round(((counts.FULLY_DEPLOYED + counts.SWARM_ACTIVE + counts.SCENARIO_PLANNED) / total) * 100) : 0;

  const btnStyle = {
    position:     "fixed",
    bottom:       8,
    left:         BTN_LEFT,
    zIndex:       153,
    background:   "rgba(0,20,40,0.85)",
    border:       `1px solid ${counts.UNPROTECTED > 0 ? RD : "#1E3A5F"}`,
    color:        counts.UNPROTECTED > 0 ? RD : "#7BB8D4",
    padding:      "3px 9px",
    fontSize:     10,
    cursor:       "pointer",
    borderRadius: 4,
    fontFamily:   "monospace",
    letterSpacing: 1,
    transition:   "all 0.2s",
    animation:    counts.UNPROTECTED > 0 ? "issmap-pulse 2s ease-in-out infinite" : "none",
  };

  return (
    <>
      <style>{`
        @keyframes issmap-pulse {
          0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,0);}
          50%{box-shadow:0 0 8px 3px rgba(248,113,113,0.5);}
        }
      `}</style>

      <button style={btnStyle} onClick={() => { setOpen((v) => { if (!v) fetchData(); return !v; }); }}>
        ◈ ISSMAP{counts.UNPROTECTED > 0 && (
          <span style={{
            marginLeft:   5,
            background:   RD,
            color:        "#000",
            borderRadius: 3,
            padding:      "0 4px",
            fontSize:     9,
            fontWeight:   700,
          }}>{counts.UNPROTECTED}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:      "fixed",
          bottom:        40,
          left:          "50%",
          transform:     "translateX(-50%)",
          width:         760,
          maxHeight:     540,
          background:    "rgba(4,12,24,0.97)",
          border:        "1px solid #1E3A5F",
          borderRadius:  8,
          zIndex:        10000,
          display:       "flex",
          flexDirection: "column",
          fontFamily:    "monospace",
          boxShadow:     "0 0 40px rgba(0,229,255,0.08)",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #1E3A5F", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ◈ INVESTMENT × SWARM × SCENARIO — COVERAGE MAP
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", fontSize: 14, cursor: "pointer" }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #0d2035" }}>
            {[
              { label: "TOTAL",          value: total,                       color: "#7BB8D4" },
              { label: "FULLY DEPLOYED", value: counts.FULLY_DEPLOYED,       color: GR },
              { label: "SWARM ACTIVE",   value: counts.SWARM_ACTIVE,         color: CY },
              { label: "SCEN. PLANNED",  value: counts.SCENARIO_PLANNED,     color: "#a78bfa" },
              { label: "UNPROTECTED",    value: counts.UNPROTECTED,          color: RD },
              { label: "COVERAGE",       value: `${deployedPct}%`,           color: deployedPct >= 70 ? GR : deployedPct >= 40 ? AM : RD },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: "#061728", borderRadius: 4, padding: "6px 0", textAlign: "center", border: "1px solid #1E3A5F" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 14px 6px", borderBottom: "1px solid #0d2035" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0", marginBottom: 3 }}>
              <span>PORTFOLIO DEPLOYMENT COVERAGE</span>
              <span>{deployedPct}%</span>
            </div>
            <div style={{ background: "#111827", borderRadius: 4, height: 5 }}>
              <div style={{
                width:       `${deployedPct}%`,
                height:      "100%",
                background:  deployedPct >= 70 ? GR : deployedPct >= 40 ? AM : RD,
                borderRadius: 4,
                transition:  "width 0.6s",
              }} />
            </div>
          </div>

          {/* Search + tabs */}
          <div style={{ padding: "6px 14px", borderBottom: "1px solid #0d2035", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investments…"
              style={{ flex: 1, background: "#061728", border: "1px solid #1E3A5F", borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 11, outline: "none", fontFamily: "monospace" }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background:   tab === t ? "#0d2035" : "transparent",
                  border:       `1px solid ${tab === t ? CY : "#1E3A5F"}`,
                  color:        tab === t ? CY : "#6E8AA0",
                  borderRadius: 3,
                  padding:      "2px 7px",
                  fontSize:     9,
                  cursor:       "pointer",
                  fontFamily:   "monospace",
                }}>
                  {t === "ALL"              ? `ALL(${total})`
                    : t === "FULLY_DEPLOYED"  ? `FD(${counts.FULLY_DEPLOYED})`
                    : t === "SWARM_ACTIVE"    ? `SW(${counts.SWARM_ACTIVE})`
                    : t === "SCENARIO_PLANNED"? `SC(${counts.SCENARIO_PLANNED})`
                    :                           `UN(${counts.UNPROTECTED})`}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 20, textAlign: "center" }}>Fetching investments, swarm jobs, scenarios…</div>}
            {error   && <div style={{ color: RD, fontSize: 11, padding: 20, textAlign: "center" }}>Error: {error}</div>}

            {!loading && visible.map((row) => {
              const meta = CLASS_META[row.cls];
              const isExp = expanded === row.id;
              return (
                <div
                  key={row.id}
                  style={{
                    borderBottom: "1px solid #0d2035",
                    padding:      "7px 0",
                    cursor:       "pointer",
                    background:   isExp ? "rgba(0,30,55,0.6)" : "transparent",
                    borderRadius: isExp ? 4 : 0,
                  }}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize:     9,
                      padding:      "1px 6px",
                      borderRadius: 3,
                      background:   `${meta.color}22`,
                      color:        meta.color,
                      fontWeight:   700,
                      whiteSpace:   "nowrap",
                      minWidth:     90,
                      textAlign:    "center",
                    }}>{meta.label}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.name}
                    </span>
                    {row.type && (
                      <span style={{ fontSize: 9, color: "#6E8AA0", padding: "1px 5px", border: "1px solid #1E3A5F", borderRadius: 3 }}>{row.type}</span>
                    )}
                    {row.sector && (
                      <span style={{ fontSize: 9, color: "#a78bfa", padding: "1px 5px", border: "1px solid #1E3A5F", borderRadius: 3 }}>{row.sector}</span>
                    )}
                    <span style={{ fontSize: 9, color: "#6E8AA0", marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {row.description && (
                    <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2, marginLeft: 98, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.description}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 8, marginLeft: 8, padding: "8px", background: "#06182a", borderRadius: 4 }}>
                      {/* Matched swarm jobs */}
                      <div style={{ fontSize: 10, color: CY, marginBottom: 4, fontWeight: 700 }}>
                        SWARM JOBS ({row.matchedSwarm.length})
                      </div>
                      {row.matchedSwarm.length > 0 ? (
                        <div style={{ marginBottom: 8 }}>
                          {row.matchedSwarm.slice(0, 3).map((s) => (
                            <div key={s.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{s.name}</span>
                                {s.status && (
                                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${CY}22`, color: CY }}>{s.status}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{ width: `${Math.min(100, s.score * 14)}%`, height: "100%", background: CY, borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0", marginBottom: 8 }}>No swarm jobs matched for this investment.</div>
                      )}

                      {/* Matched scenarios */}
                      <div style={{ fontSize: 10, color: "#a78bfa", marginBottom: 4, fontWeight: 700 }}>
                        SCENARIOS ({row.matchedScenarios.length})
                      </div>
                      {row.matchedScenarios.length > 0 ? (
                        <div>
                          {row.matchedScenarios.slice(0, 3).map((s) => (
                            <div key={s.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{s.name}</span>
                                {s.type && (
                                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#a78bfa22", color: "#a78bfa" }}>{s.type}</span>
                                )}
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{ width: `${Math.min(100, s.score * 14)}%`, height: "100%", background: "#a78bfa", borderRadius: 3 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: "#6E8AA0" }}>No scenarios matched for this investment.</div>
                      )}

                      {row.cls === "UNPROTECTED" && (
                        <div style={{ fontSize: 11, color: RD, marginTop: 6 }}>
                          ⚠ UNPROTECTED — no active swarm operations or scenario playbooks cover this investment.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No investments match current filter.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "5px 14px", borderTop: "1px solid #0d2035", display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6E8AA0" }}>
            <span>AUTO-REFRESH {POLL_MS / 1000}s · {total} INVESTMENTS · {lastPoll ? lastPoll.toLocaleTimeString() : "—"}</span>
            <span>{visible.length} SHOWN</span>
          </div>
        </div>
      )}
    </>
  );
}
