/**
 * TaskExecutionCoverageMonitor — F522 (TEXMON)
 * "JARVIS, task execution / texmon / which tasks have swarm / swarm task coverage / task automation / manual tasks / unautomated tasks"
 * Cross-references /entities/Task + /entities/SwarmJob + /v1/investigations.
 * FULL = task keyword-matches ≥1 swarm job AND ≥1 investigation.
 * SWARM_ONLY = swarm match, no investigation match.
 * CASE_ONLY  = investigation match, no swarm match.
 * MANUAL     = no swarm, no investigation — fully unautomated tasks.
 * Red badge on MANUAL count. ◈ TEXMON button left:882320 bottom:8 zIndex:584.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF4466";
const AMB = "#FFA500";
const PRP = "#BB88FF";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 882_320;
const Z_INDEX  = 584;

const TEXMON_RE =
  /\btexmon\b|\btask.?execution\b|\bexecution.?coverage\b|\bwhich.?tasks.?have.?swarm\b|\bswarm.?task.?coverage\b|\btask.?automation\b|\bmanual.?tasks?\b|\bunautomated.?tasks?\b|\btask.?swarm.?coverage\b|\btask.?investigation.?coverage\b|\btask.?triple\b/i;

export function isTexmonQuery(text) {
  return TEXMON_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw = data.tasks || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:          t.id || `tk-${i}`,
    title:       t.title || t.name || t.task_name || `Task ${i + 1}`,
    description: t.description || t.summary || t.notes || null,
    status:      (t.status || "PENDING").toUpperCase(),
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : String(t.tags || ""),
  }));
}

function normaliseSwarm(data) {
  if (!data) return [];
  const raw = data.jobs || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:          j.id || `sj-${i}`,
    name:        j.name || j.job_name || j.title || `SwarmJob ${i + 1}`,
    description: j.description || j.summary || null,
    status:      (j.status || "RUNNING").toUpperCase(),
    tags:        Array.isArray(j.tags) ? j.tags.join(" ") : String(j.tags || ""),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((c, i) => ({
    id:      c.id || `inv-${i}`,
    title:   c.title || c.name || c.case_name || `Case ${i + 1}`,
    summary: c.summary || c.description || null,
    status:  (c.status || "OPEN").toUpperCase(),
    lead:    c.lead || c.assigned_to || null,
  }));
}

function crossRef(tasks, swarmJobs, investigations) {
  return tasks.map((tk) => {
    const haystack = `${tk.title} ${tk.description || ""} ${tk.tags}`;

    const swarmMatches = swarmJobs
      .map((sj) => ({ ...sj, hits: overlap(haystack, `${sj.name} ${sj.description || ""} ${sj.tags}`) }))
      .filter((sj) => sj.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    const caseMatches = investigations
      .map((inv) => ({ ...inv, hits: overlap(haystack, `${inv.title} ${inv.summary || ""}`) }))
      .filter((inv) => inv.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    const hasSwarm = swarmMatches.length > 0;
    const hasCase  = caseMatches.length > 0;
    const coverage =
      hasSwarm && hasCase ? "FULL"
      : hasSwarm           ? "SWARM_ONLY"
      : hasCase            ? "CASE_ONLY"
      :                      "MANUAL";

    return { ...tk, swarmMatches, caseMatches, hasSwarm, hasCase, coverage };
  });
}

// ─── buildTexmonScript (for JarvisBrain) ────────────────────────────────────

export async function buildTexmonScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [tkRes, sjRes, invRes] = await Promise.all([
      fetch(`${base}/entities/Task`,          { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,       { headers: hdr }),
      fetch(`${base}/v1/investigations`,       { headers: hdr }),
    ]);
    const tkData  = tkRes.ok  ? await tkRes.json()  : {};
    const sjData  = sjRes.ok  ? await sjRes.json()  : {};
    const invData = invRes.ok ? await invRes.json() : {};

    const tasks   = normaliseTasks(tkData);
    const swarm   = normaliseSwarm(sjData);
    const cases   = normaliseInvestigations(invData);
    const crossed = crossRef(tasks, swarm, cases);

    const total      = crossed.length;
    const full       = crossed.filter((t) => t.coverage === "FULL").length;
    const swarmOnly  = crossed.filter((t) => t.coverage === "SWARM_ONLY").length;
    const caseOnly   = crossed.filter((t) => t.coverage === "CASE_ONLY").length;
    const manual     = crossed.filter((t) => t.coverage === "MANUAL").length;
    const coverage   = total > 0 ? Math.round(((full + swarmOnly + caseOnly) / total) * 100) : 0;

    const brief =
      `${coverage}% of ${total} tasks have execution coverage. ` +
      `${full} FULL (swarm+case), ${swarmOnly} SWARM_ONLY, ${caseOnly} CASE_ONLY, ${manual} MANUAL (unautomated).`;

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Task Execution Coverage: ${brief} Assess operational readiness in 2 sentences.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    window.dispatchEvent(new CustomEvent("jarvis:texmon-toggle"));
    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Task Execution Coverage Monitor unavailable: ${err.message}`;
  }
}

// ─── coverage colour map ─────────────────────────────────────────────────────

const COV_COLOR = {
  FULL:       GRN,
  SWARM_ONLY: CY,
  CASE_ONLY:  PRP,
  MANUAL:     RED,
};

const STATUS_COLOR = {
  DONE:        GRN,
  COMPLETED:   GRN,
  IN_PROGRESS: CY,
  PENDING:     AMB,
  BLOCKED:     RED,
};

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskExecutionCoverageMonitor() {
  const [open, setOpen]       = useState(false);
  const [crossed, setCrossed] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssess] = useState(false);
  const [brief, setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [tkRes, sjRes, invRes] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`, { headers: hdr }),
        fetch(`${base}/v1/investigations`, { headers: hdr }),
      ]);
      const tkData  = tkRes.ok  ? await tkRes.json()  : {};
      const sjData  = sjRes.ok  ? await sjRes.json()  : {};
      const invData = invRes.ok ? await invRes.json() : {};

      const tasks = normaliseTasks(tkData);
      const swarm = normaliseSwarm(sjData);
      const cases = normaliseInvestigations(invData);
      setCrossed(crossRef(tasks, swarm, cases));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () =>
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    window.addEventListener("jarvis:texmon-toggle", onToggle);
    return () => window.removeEventListener("jarvis:texmon-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssess(true);
    setBrief("");
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const manual   = crossed.filter((t) => t.coverage === "MANUAL").length;
      const full     = crossed.filter((t) => t.coverage === "FULL").length;
      const coverage = total > 0 ? Math.round(((total - manual) / total) * 100) : 0;
      const prompt =
        `Task Execution Coverage: ${coverage}% automated coverage, ${manual}/${total} tasks fully MANUAL (no swarm job or case). ` +
        `${full} tasks have FULL coverage (swarm + investigation). Assess operational readiness in 2 sentences.`;

      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = res.ok ? await res.json() : {};
      const text = d.response || d.message || d.reply || "Assessment complete.";
      setBrief(text);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: "onyx" }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssess(false);
    }
  }, [crossed]);

  const visible = crossed.filter((tk) => {
    if (tab !== "ALL" && tk.coverage !== tab) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!tk.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nFull     = crossed.filter((t) => t.coverage === "FULL").length;
  const nSwarm    = crossed.filter((t) => t.coverage === "SWARM_ONLY").length;
  const nCase     = crossed.filter((t) => t.coverage === "CASE_ONLY").length;
  const nManual   = crossed.filter((t) => t.coverage === "MANUAL").length;
  const coverage  = total > 0 ? Math.round(((nFull + nSwarm + nCase) / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${CY}`,
    color: CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 7px",
    borderRadius: 4,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    bottom: 36,
    right: 12,
    width: 440,
    maxHeight: "72vh",
    zIndex: Z_INDEX + 10,
    background: "rgba(6,10,18,0.97)",
    border: `1px solid ${CY}33`,
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    fontFamily: "monospace",
    fontSize: 10,
    color: CY,
    overflow: "hidden",
  };

  const TABS = ["ALL", "FULL", "SWARM_ONLY", "CASE_ONLY", "MANUAL"];

  return (
    <>
      {/* Toggle button */}
      <button
        style={btnStyle}
        onClick={() =>
          setOpen((v) => {
            if (!v) load();
            return !v;
          })
        }
        title="Task Execution Coverage Monitor — TEXMON"
      >
        ◈ TEXMON
        {nManual > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: RED,
              color: "#000",
              borderRadius: 3,
              padding: "0 4px",
              fontSize: 9,
              fontWeight: "bold",
            }}
          >
            {nManual}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div
            style={{
              padding: "8px 12px",
              borderBottom: `1px solid ${CY}22`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: CY, fontWeight: "bold" }}>
              ⬡ TASK EXECUTION COVERAGE
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: DIM,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕
            </button>
          </div>

          {/* Stats tiles */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "8px 12px",
              borderBottom: `1px solid ${CY}22`,
              flexWrap: "wrap",
            }}
          >
            {[
              { label: "TASKS",   val: total,   col: CY  },
              { label: "FULL",    val: nFull,   col: GRN },
              { label: "SWARM",   val: nSwarm,  col: CY  },
              { label: "CASE",    val: nCase,   col: PRP },
              { label: "MANUAL",  val: nManual, col: RED },
              { label: "COV%",    val: `${coverage}%`, col: coverage >= 70 ? GRN : AMB },
            ].map(({ label, val, col }) => (
              <div
                key={label}
                style={{
                  flex: "1 1 60px",
                  background: "rgba(0,0,0,0.4)",
                  border: `1px solid ${col}33`,
                  borderRadius: 4,
                  padding: "4px 6px",
                  textAlign: "center",
                }}
              >
                <div style={{ color: col, fontWeight: "bold", fontSize: 12 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* ASSESS button */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
            <button
              onClick={assess}
              disabled={assessing || total === 0}
              style={{
                background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.1)",
                border: `1px solid ${CY}55`,
                color: CY,
                borderRadius: 4,
                padding: "3px 10px",
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
              }}
            >
              {assessing ? "▷ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div
                style={{
                  marginTop: 4,
                  color: GRN,
                  fontSize: 9,
                  lineHeight: 1.4,
                  maxHeight: 60,
                  overflowY: "auto",
                }}
              >
                {brief}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 12px",
              borderBottom: `1px solid ${CY}22`,
              overflowX: "auto",
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "rgba(0,0,0,0.4)",
                  color:      tab === t ? "#000" : DIM,
                  border:     `1px solid ${CY}44`,
                  borderRadius: 3,
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontSize: 9,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 12px", borderBottom: `1px solid ${CY}22` }}>
            <input
              type="text"
              placeholder="Search tasks…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.5)",
                border: `1px solid ${CY}44`,
                color: CY,
                borderRadius: 3,
                padding: "3px 8px",
                fontFamily: "monospace",
                fontSize: 10,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Task list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px" }}>
            {loading && total === 0 ? (
              <div style={{ color: DIM, textAlign: "center", marginTop: 20 }}>
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ color: DIM, textAlign: "center", marginTop: 20 }}>
                No tasks match.
              </div>
            ) : (
              visible.map((tk) => (
                <div key={tk.id} style={{ marginBottom: 4 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 6px",
                      borderRadius: 4,
                      background:
                        expanded === tk.id
                          ? "rgba(41,231,255,0.06)"
                          : "rgba(0,0,0,0.3)",
                      border: `1px solid ${COV_COLOR[tk.coverage]}33`,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpanded((e) => (e === tk.id ? null : tk.id))
                    }
                  >
                    <span
                      style={{
                        color: COV_COLOR[tk.coverage],
                        fontSize: 8,
                        fontWeight: "bold",
                        minWidth: 70,
                      }}
                    >
                      [{tk.coverage}]
                    </span>
                    <span
                      style={{
                        color:
                          STATUS_COLOR[tk.status] || DIM,
                        fontSize: 8,
                        minWidth: 70,
                      }}
                    >
                      {tk.status}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        color: CY,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tk.title}
                    </span>
                    <span style={{ fontSize: 8, color: DIM }}>
                      {tk.swarmMatches.length > 0 && `⚙${tk.swarmMatches.length} `}
                      {tk.caseMatches.length > 0 && `📂${tk.caseMatches.length}`}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {expanded === tk.id && (
                    <div
                      style={{
                        marginLeft: 12,
                        marginBottom: 4,
                        paddingTop: 4,
                      }}
                    >
                      {tk.description && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>
                          {tk.description.slice(0, 120)}
                          {tk.description.length > 120 ? "…" : ""}
                        </div>
                      )}

                      {/* Swarm matches */}
                      {tk.swarmMatches.length > 0 && (
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ color: CY, fontSize: 8, marginBottom: 2 }}>
                            SWARM JOBS
                          </div>
                          {tk.swarmMatches.slice(0, 3).map((sj) => (
                            <div
                              key={sj.id}
                              style={{
                                padding: "2px 6px",
                                marginBottom: 2,
                                borderRadius: 2,
                                background: "rgba(41,231,255,0.05)",
                                border: `1px solid ${CY}22`,
                                fontSize: 9,
                                display: "flex",
                                gap: 6,
                              }}
                            >
                              <span style={{ color: CY }}>{sj.name}</span>
                              <span style={{ color: DIM }}>hits:{sj.hits}</span>
                              <span
                                style={{
                                  color:
                                    sj.status === "RUNNING"
                                      ? GRN
                                      : sj.status === "FAILED"
                                      ? RED
                                      : DIM,
                                }}
                              >
                                {sj.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Investigation matches */}
                      {tk.caseMatches.length > 0 && (
                        <div>
                          <div style={{ color: PRP, fontSize: 8, marginBottom: 2 }}>
                            INVESTIGATIONS
                          </div>
                          {tk.caseMatches.slice(0, 3).map((inv) => (
                            <div
                              key={inv.id}
                              style={{
                                padding: "2px 6px",
                                marginBottom: 2,
                                borderRadius: 2,
                                background: "rgba(187,136,255,0.05)",
                                border: `1px solid ${PRP}22`,
                                fontSize: 9,
                                display: "flex",
                                gap: 6,
                              }}
                            >
                              <span style={{ color: PRP }}>{inv.title}</span>
                              <span style={{ color: DIM }}>hits:{inv.hits}</span>
                              <span
                                style={{
                                  color:
                                    inv.status === "OPEN" || inv.status === "ACTIVE"
                                      ? GRN
                                      : inv.status === "ESCALATED"
                                      ? RED
                                      : DIM,
                                }}
                              >
                                {inv.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {tk.swarmMatches.length === 0 && tk.caseMatches.length === 0 && (
                        <div style={{ color: RED, fontSize: 9 }}>
                          No swarm job or investigation linked to this task.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "4px 12px",
              borderTop: `1px solid ${CY}22`,
              color: DIM,
              fontSize: 8,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>auto-refresh 90s</span>
            <span>
              {loading ? "refreshing…" : `${visible.length}/${total} shown`}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
