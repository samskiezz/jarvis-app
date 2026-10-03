/**
 * InvestigationResourcingNexus — F45 (overnight 2026-09-13)
 * Sources: /v1/investigations + /entities/SwarmJob + /entities/Task
 * Keyword-correlates each investigation against active swarm jobs AND tasks:
 *   FULLY_RESOURCED  (investigation has both a matching swarm job + task)
 *   SWARM_ONLY       (investigation matched a swarm job but no task)
 *   TASK_ONLY        (investigation matched a task but no swarm job)
 *   UNSUPPORTED      (no swarm job or task matches)
 * Stat tiles: investigations / swarm jobs / tasks / unsupported count.
 * Filter tabs: ALL / FULLY_RESOURCED / SWARM_ONLY / TASK_ONLY / UNSUPPORTED.
 * Text search on investigation title.
 * Expand row → matched swarm jobs + matched tasks with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence resourcing brief + TTS.
 * ◈ SJTINEX button (left:932100 bottom:8 zIndex:628).
 * Voice triggers: "investigation resourcing" / "sjtinex" / "unsupported investigation" /
 *                 "swarm investigation" / "active investigation resourcing" /
 *                 "investigation swarm job" / "task investigation coverage".
 * Toggle: jarvis:sjtinex-toggle event.
 * 90-s auto-refresh.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA040";
const RED = "#FF4D6D";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SJTINEX_RE =
  /\binvestigation.resourc|sjtinex\b|unsupported.invest|swarm.invest|active.invest.*resourc|invest.*swarm.job|task.invest.*cover|investigation.task.cover/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.results)        ? d.results
    : [];
}

async function fetchSwarmJobs() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.jobs)    ? d.jobs
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchTasks() {
  const r = await fetch(`${apiBase()}/entities/Task`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.tasks)   ? d.tasks
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.results) ? d.results
    : [];
}

// ── keyword matching ──────────────────────────────────────────────────────────

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(toksA, toksB) {
  if (!toksA.length || !toksB.length) return 0;
  const setB = new Set(toksB);
  const hits = toksA.filter((t) => setB.has(t)).length;
  return hits / Math.max(toksA.length, toksB.length);
}

function buildNexus(investigations, swarmJobs, tasks) {
  const swarmItems = swarmJobs.map((j) => ({
    title: j.name ?? j.job_name ?? j.description ?? j.id ?? "",
    tokens: tokenize(
      [j.name, j.job_name, j.description, j.objective, j.tags, j.status]
        .filter(Boolean).join(" ")
    ),
    status: j.status ?? j.state ?? "",
  }));
  const taskItems = tasks.map((t) => ({
    title: t.title ?? t.name ?? t.description ?? t.id ?? "",
    tokens: tokenize(
      [t.title, t.name, t.description, t.tags, t.category, t.status]
        .filter(Boolean).join(" ")
    ),
    status: t.status ?? t.state ?? "",
  }));

  return investigations.map((inv) => {
    const title = inv.title ?? inv.name ?? inv.investigation_name ?? inv.id ?? "";
    const itoks = tokenize(
      [inv.title, inv.name, inv.description, inv.tags, inv.category, inv.subject]
        .filter(Boolean).join(" ")
    );

    const matchedSwarm = swarmItems
      .map((sj) => ({ ...sj, score: overlap(itoks, sj.tokens) }))
      .filter((m) => m.score >= 0.07)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const matchedTask = taskItems
      .map((tk) => ({ ...tk, score: overlap(itoks, tk.tokens) }))
      .filter((m) => m.score >= 0.07)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasSwarm = matchedSwarm.length > 0;
    const hasTask  = matchedTask.length > 0;
    const status =
      hasSwarm && hasTask ? "FULLY_RESOURCED"
      : hasSwarm           ? "SWARM_ONLY"
      : hasTask            ? "TASK_ONLY"
      :                      "UNSUPPORTED";

    return {
      title,
      status,
      matchedSwarm,
      matchedTask,
      priority: inv.priority ?? inv.severity ?? inv.risk_level ?? null,
    };
  });
}

// ── exported intents ──────────────────────────────────────────────────────────

export function isSjtinexQuery(text) {
  return SJTINEX_RE.test(text || "");
}

export async function buildSjtinexScript() {
  let investigations = [], swarmJobs = [], tasks = [];
  try {
    [investigations, swarmJobs, tasks] = await Promise.all([
      fetchInvestigations(), fetchSwarmJobs(), fetchTasks(),
    ]);
  } catch (_) {}
  const nexus       = buildNexus(investigations, swarmJobs, tasks);
  const unsupported = nexus.filter((n) => n.status === "UNSUPPORTED").length;
  const fullCount   = nexus.filter((n) => n.status === "FULLY_RESOURCED").length;
  return (
    `Investigation resourcing nexus: ${nexus.length} investigations assessed against ` +
    `${swarmJobs.length} swarm jobs and ${tasks.length} tasks. ` +
    `${fullCount} investigations are fully resourced; ${unsupported} have no matching swarm job or task and require immediate resourcing.`
  );
}

// ── status config ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
  FULLY_RESOURCED: { label: "FULLY RESOURCED", color: GRN },
  SWARM_ONLY:      { label: "SWARM ONLY",       color: CY  },
  TASK_ONLY:       { label: "TASK ONLY",         color: PRP },
  UNSUPPORTED:     { label: "UNSUPPORTED",       color: RED },
};

const TABS = ["ALL", "FULLY_RESOURCED", "SWARM_ONLY", "TASK_ONLY", "UNSUPPORTED"];

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestigationResourcingNexus() {
  const [visible,   setVisible]   = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [nSwarm,    setNSwarm]    = useState(0);
  const [nTask,     setNTask]     = useState(0);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [investigations, swarmJobs, tasks] = await Promise.all([
        fetchInvestigations(), fetchSwarmJobs(), fetchTasks(),
      ]);
      setNSwarm(swarmJobs.length);
      setNTask(tasks.length);
      setNexus(buildNexus(investigations, swarmJobs, tasks));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const h = () => {
      setVisible((v) => !v);
      if (!nexus.length) load();
    };
    window.addEventListener("jarvis:sjtinex-toggle", h);
    return () => window.removeEventListener("jarvis:sjtinex-toggle", h);
  }, [load, nexus.length]);

  useEffect(() => {
    if (!visible) return;
    load();
    const iv = setInterval(load, 90_000);
    return () => clearInterval(iv);
  }, [visible, load]);

  const unsupportedCount = nexus.filter((n) => n.status === "UNSUPPORTED").length;
  const fullCount        = nexus.filter((n) => n.status === "FULLY_RESOURCED").length;

  const filtered = nexus.filter((n) => {
    if (tab !== "ALL" && n.status !== tab) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildSjtinexScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d?.response ?? d?.message ?? d?.text ?? script;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }

  if (!visible) {
    return (
      <button
        onClick={() => { setVisible(true); if (!nexus.length) load(); }}
        title="Investigation × Swarm × Task Resourcing Nexus"
        style={{
          position: "fixed", left: 932100, bottom: 8, zIndex: 628,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${AMB}44`,
          color: AMB, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 8, padding: "3px 6px", cursor: "pointer",
          borderRadius: 2, letterSpacing: 1,
        }}
      >
        ◈ SJTINEX
        {unsupportedCount > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 7,
          }}>{unsupportedCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, zIndex: 2800,
      width: 430, maxHeight: "80vh",
      background: "rgba(0,8,16,0.97)", border: `1px solid ${AMB}44`,
      borderRadius: 6, overflow: "hidden",
      fontFamily: "'JetBrains Mono',monospace",
      display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{
        padding: "10px 14px 8px", borderBottom: `1px solid ${AMB}22`,
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
      }}>
        <span style={{ color: AMB, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
          ◈ INVESTIGATION RESOURCING NEXUS
        </span>
        <button onClick={assess} disabled={assessing} style={{
          marginLeft: "auto", background: "none", border: `1px solid ${AMB}66`,
          color: AMB, fontSize: 8, padding: "2px 8px", cursor: "pointer",
          borderRadius: 2, letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setVisible(false)} style={{
          background: "none", border: "none", color: "#4A6070",
          fontSize: 12, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 1, padding: "8px 10px", flexShrink: 0,
      }}>
        {[
          { label: "INVESTIGATIONS", val: nexus.length,     color: AMB },
          { label: "SWARM JOBS",     val: nSwarm,           color: CY  },
          { label: "TASKS",          val: nTask,            color: PRP },
          { label: "UNSUPPORTED",    val: unsupportedCount, color: RED },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "rgba(0,20,32,0.8)", borderRadius: 3, padding: "6px 4px",
            textAlign: "center",
          }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#3A5060", fontSize: 7, letterSpacing: 1, marginTop: 2 }}>
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "0 10px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {TABS.map((t) => {
          const cfg = t === "ALL" ? null : STATUS_CFG[t];
          const cnt = t === "ALL" ? nexus.length : nexus.filter((n) => n.status === t).length;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? (cfg?.color ?? AMB) + "22" : "rgba(0,16,24,0.5)",
              border: `1px solid ${tab === t ? (cfg?.color ?? AMB) : "#1A3040"}`,
              color: tab === t ? (cfg?.color ?? AMB) : "#3A5060",
              fontSize: 7, padding: "2px 6px", cursor: "pointer",
              borderRadius: 2, letterSpacing: 1,
            }}>
              {t === "ALL" ? "ALL" : STATUS_CFG[t].label} ({cnt})
            </button>
          );
        })}
      </div>

      {/* search */}
      <div style={{ padding: "0 10px 6px", flexShrink: 0 }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search investigation…"
          style={{
            width: "100%", background: "rgba(0,20,32,0.7)", border: `1px solid ${AMB}33`,
            color: AMB, fontFamily: "inherit", fontSize: 9, padding: "4px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 10px" }}>
        {loading && !nexus.length ? (
          <div style={{ color: AMB + "88", fontSize: 9, padding: 10 }}>◌ LOADING…</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "#3A5060", fontSize: 9, padding: 10 }}>NO INVESTIGATIONS MATCH</div>
        ) : (
          filtered.map((inv, i) => {
            const cfg  = STATUS_CFG[inv.status];
            const open = expanded === i;
            return (
              <div key={i} style={{
                marginBottom: 4, background: "rgba(0,16,24,0.7)",
                border: `1px solid ${cfg.color}33`, borderRadius: 3, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(open ? null : i)}
                  style={{
                    padding: "6px 10px", display: "flex", alignItems: "center",
                    gap: 8, cursor: "pointer",
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: cfg.color, flexShrink: 0,
                    ...(inv.status === "UNSUPPORTED" && {
                      animation: "sjtinexpulse 1.4s ease-in-out infinite",
                    }),
                  }} />
                  <span style={{ color: "#C0D8E8", fontSize: 9, flex: 1 }}>{inv.title}</span>
                  {inv.priority != null && (
                    <span style={{ color: cfg.color, fontSize: 8 }}>
                      {inv.priority}
                    </span>
                  )}
                  <span style={{
                    color: cfg.color, fontSize: 7, background: cfg.color + "18",
                    padding: "1px 5px", borderRadius: 2, letterSpacing: 1,
                  }}>
                    {cfg.label}
                  </span>
                  <span style={{ color: "#3A5060", fontSize: 8 }}>{open ? "▲" : "▼"}</span>
                </div>

                {open && (
                  <div style={{ padding: "0 10px 8px", borderTop: `1px solid ${cfg.color}22` }}>
                    {/* Swarm job matches */}
                    <div style={{ color: CY, fontSize: 7, letterSpacing: 1, marginTop: 6, marginBottom: 3 }}>
                      SWARM JOBS ({inv.matchedSwarm.length})
                    </div>
                    {inv.matchedSwarm.length === 0 ? (
                      <div style={{ color: "#3A5060", fontSize: 8 }}>— no match</div>
                    ) : inv.matchedSwarm.map((m, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          color: "#A0C8D8", fontSize: 8, marginBottom: 2,
                        }}>
                          <span>{m.title || "(untitled)"}</span>
                          {m.status && (
                            <span style={{ color: CY + "99", fontSize: 7 }}>{m.status}</span>
                          )}
                        </div>
                        <div style={{
                          height: 3, background: "#0A1E28", borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.round(m.score * 100)}%`,
                            height: "100%", background: CY, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}

                    {/* Task matches */}
                    <div style={{ color: PRP, fontSize: 7, letterSpacing: 1, marginTop: 8, marginBottom: 3 }}>
                      TASKS ({inv.matchedTask.length})
                    </div>
                    {inv.matchedTask.length === 0 ? (
                      <div style={{ color: "#3A5060", fontSize: 8 }}>— no match</div>
                    ) : inv.matchedTask.map((m, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          color: "#A0C8D8", fontSize: 8, marginBottom: 2,
                        }}>
                          <span>{m.title || "(untitled)"}</span>
                          {m.status && (
                            <span style={{ color: PRP + "99", fontSize: 7 }}>{m.status}</span>
                          )}
                        </div>
                        <div style={{
                          height: 3, background: "#0A1E28", borderRadius: 2, overflow: "hidden",
                        }}>
                          <div style={{
                            width: `${Math.round(m.score * 100)}%`,
                            height: "100%", background: PRP, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${AMB}22`,
        display: "flex", gap: 10, fontSize: 8, color: "#3A5060", flexShrink: 0,
      }}>
        <span>{filtered.length} OF {nexus.length} INVESTIGATIONS</span>
        <span style={{ marginLeft: "auto", color: fullCount > 0 ? GRN + "AA" : "#3A5060" }}>
          {fullCount} FULLY RESOURCED
        </span>
      </div>

      <style>{`
        @keyframes sjtinexpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.5); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
