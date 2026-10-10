/**
 * OpsAlertTaskSkillReadiness — F47 (overnight 2026-09-13)
 * Sources: /v1/ops/alerts × /entities/Task × /v1/aip/skill
 * Keyword-correlates each ops alert against active tasks AND available skills:
 *   FULLY_READY   (alert has both a matching task + skill)
 *   TASK_ONLY     (matched a task but no skill)
 *   SKILL_ONLY    (matched a skill but no task)
 *   UNREADY       (no task or skill matches)
 * Stat tiles: alerts / fully ready / task only / skill only / unready.
 * Filter tabs: ALL / FULLY_READY / TASK_ONLY / SKILL_ONLY / UNREADY.
 * Text search on alert message/service.
 * Expand row → matched tasks (cyan bars) + matched skills (green bars).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS.
 * ◈ OATSKL button (left:933820 bottom:8 zIndex:630).
 * Voice triggers: "ops alert readiness" / "oatskl" / "alert response readiness" /
 *                 "alert task skill" / "response capability" / "unready alerts".
 * Toggle: jarvis:oatskl-toggle event.
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

const OATSKL_RE =
  /\boatskl\b|ops.alert.readiness|alert.response.readiness|alert.task.skill|response.capabilit|unready.alert|alert.skill.task|ops.readiness|task.skill.alert/i;

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchAlerts() {
  const r = await fetch(`${apiBase()}/v1/ops/alerts`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.alerts)  ? d.alerts
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

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.skills)  ? d.skills
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
    .filter((t) => t.length > 2);
}

function overlap(tokensA, tokensB) {
  const setB = new Set(tokensB);
  return tokensA.filter((t) => setB.has(t)).length;
}

function alertTokens(a) {
  return tokenize(
    [a.message, a.service, a.type, a.title, a.category].join(" ")
  );
}

function taskTokens(t) {
  return tokenize(
    [t.title, t.description, t.name, t.type, t.tags?.join?.(" ")].join(" ")
  );
}

function skillTokens(s) {
  return tokenize(
    [s.name, s.description, s.category, s.type, s.tags?.join?.(" ")].join(" ")
  );
}

function classifyAlert(alert, tasks, skills) {
  const aToks = alertTokens(alert);
  const matchedTasks = tasks
    .map((t) => ({ item: t, score: overlap(aToks, taskTokens(t)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const matchedSkills = skills
    .map((s) => ({ item: s, score: overlap(aToks, skillTokens(s)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const hasTask  = matchedTasks.length > 0;
  const hasSkill = matchedSkills.length > 0;
  const status =
    hasTask && hasSkill ? "FULLY_READY"
    : hasTask           ? "TASK_ONLY"
    : hasSkill          ? "SKILL_ONLY"
    :                     "UNREADY";

  return { alert, matchedTasks, matchedSkills, status };
}

// ── exported voice helpers ────────────────────────────────────────────────────

export function isOatskLQuery(q) {
  return OATSKL_RE.test(q || "");
}

export async function buildOatskLScript() {
  try {
    const [alerts, tasks, skills] = await Promise.all([
      fetchAlerts(), fetchTasks(), fetchSkills(),
    ]);
    const rows = alerts.map((a) => classifyAlert(a, tasks, skills));
    const unready = rows.filter((r) => r.status === "UNREADY").length;
    const fully   = rows.filter((r) => r.status === "FULLY_READY").length;
    return `Ops alert response readiness: ${rows.length} alerts analysed. ` +
      `${fully} fully ready (task + skill matched), ${unready} unready with no matching task or skill. ` +
      `${unready > 0 ? "Immediate triage recommended for unready alerts." : "All alerts have coverage."}`;
  } catch {
    return "Unable to fetch ops alert readiness data at this time, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "FULLY_READY", "TASK_ONLY", "SKILL_ONLY", "UNREADY"];

const STATUS_COLOR = {
  FULLY_READY: GRN,
  TASK_ONLY:   CY,
  SKILL_ONLY:  PRP,
  UNREADY:     RED,
};

export default function OpsAlertTaskSkillReadiness() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [alerts, tasks, skills] = await Promise.all([
        fetchAlerts(), fetchTasks(), fetchSkills(),
      ]);
      setRows(alerts.map((a) => classifyAlert(a, tasks, skills)));
    } catch {
      /* silent — no fake data */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:oatskl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oatskl-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const unreadyCount = rows.filter((r) => r.status === "UNREADY").length;
  const fullyCount   = rows.filter((r) => r.status === "FULLY_READY").length;
  const taskOnly     = rows.filter((r) => r.status === "TASK_ONLY").length;
  const skillOnly    = rows.filter((r) => r.status === "SKILL_ONLY").length;

  const visible = rows.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const a = r.alert;
      return [a.message, a.service, a.type, a.title].some(
        (f) => (f || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function assess() {
    const script = await buildOatskLScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }

  const tile = (label, val, col) => (
    <div style={{ flex: 1, background: "rgba(0,0,0,0.3)", borderRadius: 6,
      padding: "6px 8px", textAlign: "center", border: `1px solid ${col}33` }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const maxScore = (arr) => Math.max(...arr.map((x) => x.score), 1);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:oatskl-toggle"))}
        style={{
          position: "fixed", left: 933820, bottom: 8, zIndex: 630,
          background: "rgba(5,8,13,0.75)", border: `1px solid ${unreadyCount > 0 ? RED : CY}55`,
          color: unreadyCount > 0 ? RED : CY, borderRadius: 6, padding: "3px 9px",
          fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ OATSKL{unreadyCount > 0 && (
          <span style={{ marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9 }}>
            {unreadyCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)",
          zIndex: 10000, width: "min(780px,94vw)",
          background: "rgba(5,10,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 14, padding: "18px 20px",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          maxHeight: "84vh", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13,
                textShadow: `0 0 12px ${CY}` }}>OPS ALERT READINESS</span>
              <span style={{ marginLeft: 10, color: "#4A6070", fontSize: 10 }}>
                /v1/ops/alerts × /entities/Task × /v1/aip/skill
              </span>
            </div>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#4A6070",
                cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {tile("ALERTS",      rows.length,  CY)}
            {tile("FULLY READY", fullyCount,   GRN)}
            {tile("TASK ONLY",   taskOnly,     CY)}
            {tile("SKILL ONLY",  skillOnly,    PRP)}
            {tile("UNREADY",     unreadyCount, RED)}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${STATUS_COLOR[f] || CY}22` : "transparent",
                  border: `1px solid ${filter === f ? (STATUS_COLOR[f] || CY) : "#2A3A4A"}`,
                  color: filter === f ? (STATUS_COLOR[f] || CY) : "#4A6070",
                  borderRadius: 6, padding: "3px 10px", fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                }}>
                {f}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search alerts…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${CY}44`, borderRadius: 6, color: "#DCEBF5",
                padding: "3px 10px", fontSize: 10, width: 160,
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Alert list */}
          <div style={{ overflowY: "auto", flex: 1, paddingRight: 4 }}>
            {loading && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ textAlign: "center", color: "#4A6070", padding: 24, fontSize: 12 }}>
                No alerts match
              </div>
            )}
            {visible.map((row, i) => {
              const a     = row.alert;
              const isExp = expanded === i;
              const col   = STATUS_COLOR[row.status] || CY;
              const label = (a.message || a.title || a.type || "Alert").slice(0, 80);
              const svc   = (a.service || a.category || "").slice(0, 30);
              const sev   = (a.severity || a.level || "").toUpperCase();
              return (
                <div key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 6, padding: "8px 10px",
                    background: isExp ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.2)",
                    border: `1px solid ${col}33`,
                    borderRadius: 8, cursor: "pointer",
                    borderLeft: row.status === "UNREADY" ? `3px solid ${RED}` : `3px solid ${col}66`,
                    animation: row.status === "UNREADY" ? "oatskl-pulse 2s ease-in-out infinite" : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "#DCEBF5", fontWeight: 600,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 9, color: "#4A6070", marginTop: 2 }}>
                        {svc && <span style={{ marginRight: 8 }}>{svc}</span>}
                        {sev && <span style={{ color: sev === "CRITICAL" ? RED : AMB }}>{sev}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 9, letterSpacing: 1, color: col,
                        border: `1px solid ${col}66`, borderRadius: 4, padding: "2px 6px",
                      }}>{row.status}</span>
                      <span style={{ color: "#4A6070", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      {/* Tasks */}
                      <div>
                        <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED TASKS ({row.matchedTasks.length})
                        </div>
                        {row.matchedTasks.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching tasks</div>
                          : row.matchedTasks.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedTasks)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.title || x.item.name || "Task").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: CY, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                      {/* Skills */}
                      <div>
                        <div style={{ fontSize: 9, color: GRN, letterSpacing: 1, marginBottom: 6 }}>
                          MATCHED SKILLS ({row.matchedSkills.length})
                        </div>
                        {row.matchedSkills.length === 0
                          ? <div style={{ fontSize: 9, color: "#4A6070" }}>no matching skills</div>
                          : row.matchedSkills.map((x, j) => {
                              const pct = Math.min(100, Math.round((x.score / maxScore(row.matchedSkills)) * 100));
                              return (
                                <div key={j} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 9, color: "#DCEBF5", marginBottom: 2,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {(x.item.name || x.item.title || "Skill").slice(0, 40)}
                                  </div>
                                  <div style={{ height: 4, background: "rgba(0,0,0,0.3)", borderRadius: 2 }}>
                                    <div style={{ height: "100%", width: `${pct}%`,
                                      background: GRN, borderRadius: 2 }} />
                                  </div>
                                </div>
                              );
                            })
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between",
            alignItems: "center", borderTop: `1px solid ${CY}22`, paddingTop: 10 }}>
            <span style={{ fontSize: 9, color: "#4A6070" }}>
              {visible.length} / {rows.length} alerts • auto-refresh 90 s
            </span>
            <button onClick={assess}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}66`,
                color: CY, borderRadius: 6, padding: "4px 14px",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace",
              }}>
              ▶ ASSESS
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes oatskl-pulse {
          0%,100% { border-left-color: ${RED}; box-shadow: none; }
          50%      { border-left-color: ${RED}; box-shadow: 0 0 8px ${RED}55; }
        }
      `}</style>
    </>
  );
}
