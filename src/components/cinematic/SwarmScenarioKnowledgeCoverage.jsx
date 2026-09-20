/**
 * SwarmScenarioKnowledgeCoverage — F105 (SSKICOV).
 *
 * Parallel-fetches /entities/SwarmJob × /v1/scenario/list × /knowledge/
 * and keyword-correlates each swarm job against scenarios AND KB articles,
 * classifying each job as:
 *
 *   FULLY_COVERED  — matched at least one scenario AND one KB article
 *   SCENARIO_ONLY  — matched a scenario but no KB article
 *   KB_ONLY        — matched a KB article but no scenario
 *   UNSUPPORTED    — no scenario or KB backing (automation blind spot)
 *
 * Red pulse on UNSUPPORTED count (swarm agents with no coverage).
 *
 * Layout:
 *   • 5 stat tiles: SWARM JOBS / SCENARIOS / KB ARTS / FULLY COVERED / UNSUPPORTED
 *   • Coverage % bar
 *   • Filter tabs: ALL / FULLY_COVERED / SCENARIO_ONLY / KB_ONLY / UNSUPPORTED
 *   • Text search on job name / type / status
 *   • Expandable rows → matched scenarios (amber) + KB articles (cyan)
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ SSKICOV at left:982840, bottom:8, zIndex:129
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isSskicovQuery / buildSskicovScript
 *
 * Voice: "sskicov" / "swarm scenario" / "swarm knowledge" /
 *        "swarm coverage" / "unsupported swarm" / "swarm backing" /
 *        "swarm intelligence" / "swarm kb" / "automated coverage"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";

const BTN_LEFT   = 982840;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function jobKeywords(job) {
  return keywords(
    [job.name, job.title, job.type, job.description, job.objective, job.agent_type, job.status].join(" ")
  );
}

function matchPool(job, pool) {
  const jks = jobKeywords(job);
  if (!jks.length) return [];
  return pool.filter(item => {
    const pks = keywords(
      [item.name, item.title, item.description, item.content, item.type,
       item.scenario_id, item.category, item.topic, item.subject].join(" ")
    );
    return jks.some(k => pks.includes(k));
  });
}

function classify(scenHits, kbHits) {
  if (scenHits > 0 && kbHits > 0) return "FULLY_COVERED";
  if (scenHits > 0)               return "SCENARIO_ONLY";
  if (kbHits > 0)                 return "KB_ONLY";
  return "UNSUPPORTED";
}

const CLASS_ORDER = ["FULLY_COVERED", "SCENARIO_ONLY", "KB_ONLY", "UNSUPPORTED"];
const CLASS_LABEL = {
  FULLY_COVERED:  "FULLY COVERED",
  SCENARIO_ONLY:  "SCENARIO ONLY",
  KB_ONLY:        "KB ONLY",
  UNSUPPORTED:    "UNSUPPORTED",
};
const CLASS_COLOR = {
  FULLY_COVERED:  GREEN,
  SCENARIO_ONLY:  AMBER,
  KB_ONLY:        CY,
  UNSUPPORTED:    RED,
};

const PULSE = { animation: "pulse-sskicov 1.4s ease-in-out infinite" };

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawJobs, rawScen, rawKb] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,   { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`,    { headers: hdr }).then(r => r.json()),
    fetch(`${base}/knowledge/`,          { headers: hdr }).then(r => r.json()),
  ]);
  const jobs      = normalise(rawJobs);
  const scenarios = normalise(rawScen);
  const kbArts    = normalise(rawKb);

  const rows = jobs.map(job => {
    const scenMatches = matchPool(job, scenarios);
    const kbMatches   = matchPool(job, kbArts);
    return {
      job,
      scenMatches,
      kbMatches,
      cls: classify(scenMatches.length, kbMatches.length),
    };
  });
  rows.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
  return { rows, totals: { jobs: jobs.length, scenarios: scenarios.length, kb: kbArts.length } };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

const SSKICOV_RE =
  /\b(sskicov|swarm.scenario|swarm.knowledge|swarm.coverage|unsupported.swarm|swarm.backing|swarm.intelligence|swarm.kb|automated.coverage)\b/i;

export function isSskicovQuery(q) {
  return SSKICOV_RE.test(q || "");
}

export async function buildSskicovScript() {
  try {
    const { rows, totals } = await fetchData();
    const unsupported = rows.filter(r => r.cls === "UNSUPPORTED").length;
    const covered     = rows.filter(r => r.cls === "FULLY_COVERED").length;
    const pct = totals.jobs > 0 ? Math.round((covered / totals.jobs) * 100) : 0;
    window.dispatchEvent(new CustomEvent("jarvis:sskicov-toggle"));
    return (
      `Swarm scenario and knowledge coverage analysis is open, sir. ` +
      `Of ${totals.jobs} swarm jobs, ${covered} are fully covered ` +
      `(${pct}%) against ${totals.scenarios} scenarios and ${totals.kb} knowledge articles. ` +
      `${unsupported} swarm agents have no scenario or KB backing and represent automation blind spots.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:sskicov-toggle"));
    return "Swarm scenario and knowledge coverage data is unavailable at present, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SwarmScenarioKnowledgeCoverage() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [totals,   setTotals]   = useState({ jobs: 0, scenarios: 0, kb: 0 });
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchData();
      setRows(data.rows);
      setTotals(data.totals);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sskicov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sskicov-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const unsupported = rows.filter(r => r.cls === "UNSUPPORTED").length;
  const covered     = rows.filter(r => r.cls === "FULLY_COVERED").length;
  const pct = totals.jobs > 0 ? Math.round((covered / totals.jobs) * 100) : 0;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const jobStr = [r.job.name, r.job.title, r.job.type, r.job.status].join(" ").toLowerCase();
      return jobStr.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const snap = rows.slice(0, 8).map(r =>
        `${r.job.name || r.job.title || "job"}: ${CLASS_LABEL[r.cls]} (${r.scenMatches.length} scen, ${r.kbMatches.length} kb)`
      ).join("; ");
      const prompt =
        `Swarm job coverage summary (${totals.jobs} jobs, ${covered} fully covered, ${unsupported} unsupported): ` +
        snap + `. Provide a 2-sentence assessment of automation intelligence coverage and key gaps.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }

  const MONO = "'JetBrains Mono','Courier New',monospace";
  const TILE = {
    background: "rgba(0,0,0,0.55)", border: "1px solid rgba(41,231,255,0.2)",
    borderRadius: 6, padding: "8px 10px", minWidth: 80,
  };

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 129,
          background: open ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "4px 8px", cursor: "pointer", borderRadius: 4,
          boxShadow: `0 0 12px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ SSKICOV
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: "min(820px,94vw)", zIndex: 3000,
          background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "16px 18px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}22`,
          fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
              ◈ SWARM × SCENARIO × KNOWLEDGE COVERAGE
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "SWARM JOBS",    value: totals.jobs,       color: CY   },
              { label: "SCENARIOS",     value: totals.scenarios,  color: AMBER },
              { label: "KB ARTICLES",   value: totals.kb,         color: CY   },
              { label: "FULLY COVERED", value: covered,           color: GREEN },
              {
                label: "UNSUPPORTED",   value: unsupported,       color: RED,
                pulse: unsupported > 0,
              },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 2, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 20, color: t.color, fontWeight: 700, ...(t.pulse ? PULSE : {}) }}>
                  {loading ? "…" : t.value}
                </div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {totals.jobs > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 8, color: "#6E8AA0" }}>
                <span>COVERAGE</span><span style={{ color: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* controls */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)}
                style={{
                  background: filter === cls ? (CLASS_COLOR[cls] || CY) : "rgba(0,0,0,0.4)",
                  border: `1px solid ${CLASS_COLOR[cls] || CY}`,
                  color: filter === cls ? "#04060A" : (CLASS_COLOR[cls] || CY),
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", cursor: "pointer", borderRadius: 3,
                }}>
                {cls === "ALL" ? "ALL" : CLASS_LABEL[cls]}
              </button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}44`,
                color: "#DCEBF5", fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 140,
              }} />
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
                border: `1px solid ${CY}`, color: CY,
                fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                padding: "3px 10px", cursor: assessing ? "default" : "pointer", borderRadius: 3,
              }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((r, i) => {
              const job      = r.job;
              const isExp    = expanded === i;
              const clsColor = CLASS_COLOR[r.cls];
              return (
                <div key={job.id || job.name || i}
                  style={{ border: `1px solid ${clsColor}33`, borderRadius: 6, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                      cursor: "pointer", background: isExp ? `${clsColor}11` : "transparent",
                    }}>
                    <span style={{ fontSize: 7, color: clsColor, border: `1px solid ${clsColor}`, padding: "1px 5px", borderRadius: 3, letterSpacing: 1, whiteSpace: "nowrap" }}>
                      {CLASS_LABEL[r.cls]}
                    </span>
                    <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job.name || job.title || job.id || "Swarm job"}
                    </span>
                    {job.type && (
                      <span style={{ fontSize: 7, color: "#6E8AA0" }}>{job.type}</span>
                    )}
                    <span style={{ fontSize: 8, color: AMBER }}>{r.scenMatches.length} scen</span>
                    <span style={{ fontSize: 8, color: CY }}>{r.kbMatches.length} kb</span>
                    <span style={{ fontSize: 9, color: "#6E8AA0" }}>{isExp ? "▴" : "▾"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "8px 12px", borderTop: `1px solid ${clsColor}22`, background: "rgba(0,0,0,0.3)" }}>
                      {r.scenMatches.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 7, color: AMBER, letterSpacing: 2, marginBottom: 4 }}>MATCHED SCENARIOS</div>
                          {r.scenMatches.slice(0, 5).map((s, si) => (
                            <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || s.title || s.scenario_id || "scenario"}
                              </div>
                              <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: "70%", height: "100%", background: AMBER, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.kbMatches.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CY, letterSpacing: 2, marginBottom: 4 }}>MATCHED KB ARTICLES</div>
                          {r.kbMatches.slice(0, 5).map((k, ki) => (
                            <div key={ki} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {k.title || k.name || k.topic || "article"}
                              </div>
                              <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: "60%", height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.scenMatches.length === 0 && r.kbMatches.length === 0 && (
                        <div style={{ fontSize: 9, color: "#6E8AA0" }}>No matching scenarios or KB articles found for this swarm job.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 10, padding: 20 }}>
                {rows.length === 0 ? "Loading swarm job data…" : "No jobs match the current filter."}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-sskicov {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.55; transform:scale(1.12); }
        }
      `}</style>
    </>
  );
}
