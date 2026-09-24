/**
 * TaskSwarmDatasetTriple — F72 (TSDTRI)
 * ◈ TSDTRI button (left:984920, bottom:8, zIndex:136)
 * Parallel-fetches /entities/Task + /entities/SwarmJob + /v1/datasets every 90 s.
 * Keyword-correlates each task (name/description/tags) against swarm jobs AND datasets:
 *   FULLY_RESOURCED — ≥1 swarm job match AND ≥1 dataset match
 *   SWARM_ONLY      — swarm match but no dataset
 *   DATA_ONLY       — dataset match but no swarm
 *   BARE            — no swarm job, no dataset (coverage gap)
 * Amber badge on BARE count.
 * Filter tabs ALL / FULLY_RESOURCED / SWARM_ONLY / DATA_ONLY / BARE + text search.
 * Expand task → matched swarm job cards (cyan) + matched dataset cards (green) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice triggers: "tsdtri / task resources / task triple / fully resourced tasks /
 *   bare tasks / task dataset swarm / task coverage triple / automation resource gap /
 *   task resource gap"
 * jarvis:tsdtri-toggle event; 90-s auto-refresh.
 */
import { useEffect, useState, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GR = "#10B981";
const RD = "#EF4444";
const PU = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TSDTRI_RE =
  /\btsdtri\b|\btask.resources?\b|\btask.triple\b|\bfully.resourced.tasks?\b|\bbare.tasks?\b|\btask.dataset.swarm\b|\btask.coverage.triple\b|\bautomation.resource.gap\b|\btask.resource.gap\b|\bswarm.dataset.task\b|\btask.automation.data\b/i;

export function isTsdtriQuery(text) {
  return TSDTRI_RE.test(text || "");
}

function tokenise(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

const STOP = new Set([
  "the", "and", "for", "are", "was", "were", "has", "have", "had",
  "not", "but", "with", "this", "that", "from", "will", "can",
  "its", "any", "all", "new", "our", "your", "their", "about",
]);

function relevance(task, other, otherFields) {
  const taskTokens = new Set(
    tokenise(
      `${task.name || ""} ${task.description || ""} ${(task.tags || []).join(" ")} ${task.type || ""} ${task.status || ""}`
    ).filter((t) => !STOP.has(t))
  );
  const otherTokens = tokenise(otherFields).filter((t) => !STOP.has(t));
  if (!taskTokens.size || !otherTokens.length) return 0;
  const matches = otherTokens.filter((t) => taskTokens.has(t)).length;
  return Math.round((matches / Math.max(taskTokens.size, 1)) * 100);
}

function swarmFields(job) {
  return `${job.name || ""} ${job.description || ""} ${job.type || ""} ${job.status || ""} ${(job.tags || []).join(" ")}`;
}

function datasetFields(ds) {
  return `${ds.name || ""} ${ds.description || ""} ${ds.type || ""} ${(ds.tags || []).join(" ")} ${ds.source || ""}`;
}

export async function buildTsdtriScript() {
  const base = apiBase();
  const [tRes, sRes, dRes] = await Promise.all([
    fetch(`${base}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    fetch(`${base}/v1/datasets`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
  ]);
  const tData = await tRes.json();
  const sData = await sRes.json();
  const dData = await dRes.json();
  const tasks = Array.isArray(tData) ? tData : (tData.items || tData.data || []);
  const jobs = Array.isArray(sData) ? sData : (sData.items || sData.data || []);
  const datasets = Array.isArray(dData) ? dData : (dData.items || dData.data || dData.datasets || []);

  const classified = tasks.map((t) => {
    const hasSwarm = jobs.some((j) => relevance(t, j, swarmFields(j)) > 0);
    const hasData = datasets.some((d) => relevance(t, d, datasetFields(d)) > 0);
    if (hasSwarm && hasData) return "FULLY_RESOURCED";
    if (hasSwarm) return "SWARM_ONLY";
    if (hasData) return "DATA_ONLY";
    return "BARE";
  });

  const fully = classified.filter((c) => c === "FULLY_RESOURCED").length;
  const bare = classified.filter((c) => c === "BARE").length;
  return `Task Resource Triple loaded, sir. Of ${tasks.length} tasks, ${fully} are fully resourced with both swarm automation and data coverage, while ${bare} are bare — carrying no swarm job or dataset backing, representing the highest operational risk for resourcing gaps.`;
}

export default function TaskSwarmDatasetTriple() {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const [tRes, sRes, dRes] = await Promise.all([
        fetch(`${base}/entities/Task`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/SwarmJob`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/datasets`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const tData = await tRes.json();
      const sData = await sRes.json();
      const dData = await dRes.json();
      setTasks(Array.isArray(tData) ? tData : (tData.items || tData.data || []));
      setJobs(Array.isArray(sData) ? sData : (sData.items || sData.data || []));
      setDatasets(Array.isArray(dData) ? dData : (dData.items || dData.data || dData.datasets || []));
    } catch {
      // retain prior state
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tsdtri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tsdtri-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, 90000);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const enriched = tasks.map((t) => {
    const matchedJobs = jobs
      .map((j) => ({ ...j, score: relevance(t, j, swarmFields(j)) }))
      .filter((j) => j.score > 0)
      .sort((a, b) => b.score - a.score);
    const matchedDatasets = datasets
      .map((d) => ({ ...d, score: relevance(t, d, datasetFields(d)) }))
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score);
    let status;
    if (matchedJobs.length > 0 && matchedDatasets.length > 0) status = "FULLY_RESOURCED";
    else if (matchedJobs.length > 0) status = "SWARM_ONLY";
    else if (matchedDatasets.length > 0) status = "DATA_ONLY";
    else status = "BARE";
    return { ...t, matchedJobs, matchedDatasets, status };
  });

  const counts = {
    FULLY_RESOURCED: enriched.filter((t) => t.status === "FULLY_RESOURCED").length,
    SWARM_ONLY: enriched.filter((t) => t.status === "SWARM_ONLY").length,
    DATA_ONLY: enriched.filter((t) => t.status === "DATA_ONLY").length,
    BARE: enriched.filter((t) => t.status === "BARE").length,
  };

  const visible = enriched
    .filter((t) => filter === "ALL" || t.status === filter)
    .filter((t) =>
      !search ||
      (t.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.status || "").toLowerCase().includes(search.toLowerCase())
    );

  async function assess() {
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Tasks: ${tasks.length}. SwarmJobs: ${jobs.length}. Datasets: ${datasets.length}. Fully Resourced: ${counts.FULLY_RESOURCED}. Swarm Only: ${counts.SWARM_ONLY}. Data Only: ${counts.DATA_ONLY}. Bare (no coverage): ${counts.BARE}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess task resource coverage. ${ctx} Which bare tasks represent the highest priority for swarm automation or dataset assignment?` }),
      });
      const d = await r.json();
      const text = (d.answer || "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  function statusColor(status) {
    if (status === "FULLY_RESOURCED") return GR;
    if (status === "SWARM_ONLY") return CY;
    if (status === "DATA_ONLY") return PU;
    return AM;
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × SwarmJob × Dataset Triple Coverage (TSDTRI)"
        style={{
          position: "fixed", left: 984920, bottom: 8, zIndex: 136,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${AM}`,
          color: AM, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          letterSpacing: 1,
        }}
      >
        ◈ TSDTRI{counts.BARE > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#000", borderRadius: 3, padding: "1px 4px", fontSize: 9 }}>
            {counts.BARE}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.82)", zIndex: 136, display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono',monospace",
    }}>
      <div style={{
        background: "rgba(8,14,22,0.97)", border: `1px solid ${AM}44`,
        borderRadius: 14, padding: "20px 24px", width: "min(860px,94vw)",
        maxHeight: "88vh", overflowY: "auto", boxShadow: `0 0 60px ${AM}22`,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <span style={{ color: AM, fontWeight: 700, letterSpacing: 3, fontSize: 13 }}>◈ TSDTRI</span>
            <span style={{ color: "#607080", fontSize: 10, marginLeft: 10 }}>Task × SwarmJob × Dataset Triple Coverage</span>
          </div>
          <button onClick={() => setOpen(false)} style={{ color: "#607080", background: "none", border: "none", cursor: "pointer", fontSize: 18 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {[
            { label: "TASKS", val: tasks.length, c: CY },
            { label: "SWARM JOBS", val: jobs.length, c: CY },
            { label: "DATASETS", val: datasets.length, c: CY },
            { label: "FULLY RES.", val: counts.FULLY_RESOURCED, c: GR },
            { label: "SWARM ONLY", val: counts.SWARM_ONLY, c: CY },
            { label: "DATA ONLY", val: counts.DATA_ONLY, c: PU },
            { label: "BARE", val: counts.BARE, c: AM },
          ].map(({ label, val, c }) => (
            <div key={label} style={{
              flex: "1 1 90px", background: "rgba(255,255,255,0.03)", border: `1px solid ${c}33`,
              borderRadius: 8, padding: "6px 10px", textAlign: "center",
            }}>
              <div style={{ color: c, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#607080", fontSize: 8, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Coverage bar */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#607080", marginBottom: 4 }}>
              <span>FULL RESOURCE COVERAGE</span>
              <span>{Math.round((counts.FULLY_RESOURCED / tasks.length) * 100)}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
              <div style={{
                height: "100%", borderRadius: 2,
                width: `${Math.round((counts.FULLY_RESOURCED / tasks.length) * 100)}%`,
                background: counts.FULLY_RESOURCED / tasks.length > 0.7 ? GR : counts.FULLY_RESOURCED / tasks.length > 0.4 ? AM : RD,
              }} />
            </div>
          </div>
        )}

        {/* Filter + Search */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL", "FULLY_RESOURCED", "SWARM_ONLY", "DATA_ONLY", "BARE"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? AM : "rgba(255,255,255,0.04)",
              color: filter === f ? "#000" : "#607080",
              border: `1px solid ${filter === f ? AM : "rgba(255,255,255,0.1)"}`,
              borderRadius: 4, padding: "3px 8px", fontSize: 9, cursor: "pointer", letterSpacing: 1,
            }}>{f}</button>
          ))}
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="search tasks…"
            style={{
              flex: 1, minWidth: 140, background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
              color: "#DCEBF5", padding: "3px 8px", fontSize: 10,
            }}
          />
          <button onClick={() => { if (!assessing) assess(); }} disabled={assessing} style={{
            background: assessing ? "rgba(255,255,255,0.04)" : AM, color: assessing ? "#607080" : "#000",
            border: `1px solid ${AM}`, borderRadius: 4, padding: "3px 12px", fontSize: 10,
            cursor: assessing ? "default" : "pointer", letterSpacing: 1,
          }}>
            {assessing ? "…" : "▶ ASSESS COVERAGE"}
          </button>
        </div>

        {brief && (
          <div style={{
            background: "rgba(247,179,11,0.07)", border: `1px solid ${AM}44`,
            borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: "#DCEBF5", fontSize: 11,
          }}>{brief}</div>
        )}

        {loading && <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>loading…</div>}

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((t) => {
            const key = t.id || t.name;
            const isExp = expanded === key;
            const sc = statusColor(t.status);
            return (
              <div key={key} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${sc}33`,
                borderRadius: 8, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : key)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: "2px 6px", borderRadius: 3,
                    background: `${sc}22`, color: sc, border: `1px solid ${sc}44`,
                    whiteSpace: "nowrap",
                  }}>{t.status}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.name || "Unnamed Task"}
                    </div>
                    <div style={{ color: "#607080", fontSize: 10 }}>
                      {t.type || "task"}{t.description ? ` · ${String(t.description).slice(0, 55)}…` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#607080", whiteSpace: "nowrap" }}>
                    <span style={{ color: CY }}>⚡ {t.matchedJobs.length}</span>
                    <span style={{ color: PU }}>◼ {t.matchedDatasets.length}</span>
                  </div>
                  <span style={{ color: "#607080", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 14px 12px" }}>
                    {/* Swarm Jobs */}
                    <div style={{ color: CY, fontSize: 10, letterSpacing: 1, marginBottom: 6, marginTop: 4 }}>
                      ⚡ SWARM JOBS ({t.matchedJobs.length})
                    </div>
                    {t.matchedJobs.length === 0 ? (
                      <div style={{ color: AM, fontSize: 11, marginBottom: 10 }}>⚠ No swarm jobs matched — automation gap.</div>
                    ) : (
                      t.matchedJobs.map((j) => (
                        <div key={j.id || j.name} style={{
                          background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
                          borderRadius: 6, padding: "7px 12px", marginBottom: 5,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 3,
                              background: `${CY}22`, color: CY, border: `1px solid ${CY}44`,
                            }}>{j.type || "JOB"}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {j.name || "Unnamed Job"}
                            </span>
                            <span style={{ color: "#607080", fontSize: 9 }}>score {j.score}</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(j.score, 100)}%`, background: CY }} />
                          </div>
                        </div>
                      ))
                    )}

                    {/* Datasets */}
                    <div style={{ color: PU, fontSize: 10, letterSpacing: 1, marginBottom: 6, marginTop: 8 }}>
                      ◼ DATASETS ({t.matchedDatasets.length})
                    </div>
                    {t.matchedDatasets.length === 0 ? (
                      <div style={{ color: AM, fontSize: 11 }}>⚠ No datasets matched — data coverage gap.</div>
                    ) : (
                      t.matchedDatasets.map((d) => (
                        <div key={d.id || d.name} style={{
                          background: "rgba(167,139,250,0.04)", border: `1px solid ${PU}22`,
                          borderRadius: 6, padding: "7px 12px", marginBottom: 5,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 3,
                              background: `${PU}22`, color: PU, border: `1px solid ${PU}44`,
                            }}>{d.type || "DATASET"}</span>
                            <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {d.name || "Unnamed Dataset"}
                            </span>
                            <span style={{ color: "#607080", fontSize: 9 }}>score {d.score}</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                            <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(d.score, 100)}%`, background: PU }} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!loading && visible.length === 0 && (
          <div style={{ color: "#607080", fontSize: 11, textAlign: "center", padding: 20 }}>
            No tasks match the current filter.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 9, color: "#607080", textAlign: "right" }}>
          auto-refresh 90s · {tasks.length} tasks · {jobs.length} swarm jobs · {datasets.length} datasets
        </div>
      </div>
    </div>
  );
}
