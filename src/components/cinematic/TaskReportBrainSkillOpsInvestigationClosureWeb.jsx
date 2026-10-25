/**
 * F178 Task × Report × Brain × Skill × Ops Alert × Investigation
 * Full Mission Intelligence Closure Web — ◈ TMICWB
 *
 * Fetches: /entities/Task + /v1/reports + /v1/cinematic/brain
 *          + /v1/aip/skill + /v1/ops/alerts + /v1/investigations
 * Classifies each task across 4 tiers by cross-source keyword overlap:
 *   CLOSED    — matched 5-6 sources
 *   CAPABLE   — matched 3-4 sources
 *   MONITORED — matched 1-2 sources
 *   ADRIFT    — zero matches (tasks with no report trail, no brain model,
 *               no skill backing, no ops alert, no investigation — mission orphans)
 * Red pulse on ADRIFT count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { CLOSED: GREEN, CAPABLE: CYAN, MONITORED: AMBER, ADRIFT: RED };
const CLS_ORDER = { CLOSED: 4, CAPABLE: 3, MONITORED: 2, ADRIFT: 1 };

const TMICWB_RE = /\b(tmicwb|task.closure|mission.closure|mission.intelligence.closure|task.brain.skill|task.report.investigation|task.ops.investigation|adrift.task|orphan.task|task.dead.end|task.intelligence.web|mission.closure.web|task.closure.audit|full.mission.intelligence|task.coverage.web)\b/i;

export function isTmicwbQuery(q) { return TMICWB_RE.test(q || ""); }

export function buildTmicwbScript(rows) {
  const total  = rows.length;
  const closed = rows.filter(r => r.cls === "CLOSED").length;
  const adrift = rows.filter(r => r.cls === "ADRIFT").length;
  return (
    `Full Mission Intelligence Closure Web: ${total} task${total !== 1 ? "s" : ""} assessed across report, brain model, skill, ops alert, and investigation sources. ` +
    `${closed} fully closed (5-6 sources grounded). ` +
    (adrift > 0
      ? `${adrift} ADRIFT — no report trail, no brain model, no skill backing, no ops alert, no investigation. These are mission orphans requiring immediate intelligence closure.`
      : "No mission orphans detected. All tasks have full intelligence closure.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.nodes)   ? raw.nodes
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

function classify(sourceCount) {
  if (sourceCount >= 5) return "CLOSED";
  if (sourceCount >= 3) return "CAPABLE";
  if (sourceCount >= 1) return "MONITORED";
  return "ADRIFT";
}

async function loadData() {
  const [tasksRaw, reportsRaw, brainRaw, skillsRaw, alertsRaw, investigationsRaw] = await Promise.all([
    fetcher("/entities/Task"),
    fetcher("/v1/reports"),
    fetcher("/v1/cinematic/brain"),
    fetcher("/v1/aip/skill"),
    fetcher("/v1/ops/alerts"),
    fetcher("/v1/investigations"),
  ]);

  const tasks         = normalizeArray(tasksRaw,         ["name","title","task_name","label","id"]);
  const reports       = normalizeArray(reportsRaw,       ["title","name","report_title","subject","id"]);
  const brainNodes    = normalizeArray(
    Array.isArray(brainRaw?.nodes) ? brainRaw.nodes : (Array.isArray(brainRaw) ? brainRaw : []),
    ["name","label","entity","id"]
  );
  const skills        = normalizeArray(skillsRaw,        ["name","skill_name","title","id"]);
  const alerts        = normalizeArray(alertsRaw,        ["title","name","message","alert_type","id"]);
  const investigations = normalizeArray(investigationsRaw, ["title","name","case_name","subject","id"]);

  return tasks.map(task => {
    const tToks = tokens(
      task._label + " " +
      (task.description || "") + " " +
      (task.status || "") + " " +
      (task.type || "") + " " +
      (task.tags || "").toString()
    );

    const matchedReports       = reports.filter(r => overlaps(tToks, r._label + " " + (r.category || "") + " " + (r.tags || "").toString()));
    const matchedBrain         = brainNodes.filter(b => overlaps(tToks, b._label + " " + (b.type || "") + " " + (b.centrality || "")));
    const matchedSkills        = skills.filter(s => overlaps(tToks, s._label + " " + (s.description || "") + " " + (s.category || "") + " " + (s.score || "")));
    const matchedAlerts        = alerts.filter(a => overlaps(tToks, a._label + " " + (a.severity || "") + " " + (a.type || "")));
    const matchedInvestigations = investigations.filter(inv => overlaps(tToks, inv._label + " " + (inv.status || "") + " " + (inv.type || "")));

    const sourceCount =
      (matchedReports.length        > 0 ? 1 : 0) +
      (matchedBrain.length          > 0 ? 1 : 0) +
      (matchedSkills.length         > 0 ? 1 : 0) +
      (matchedAlerts.length         > 0 ? 1 : 0) +
      (matchedInvestigations.length > 0 ? 1 : 0);

    return {
      ...task,
      cls: classify(sourceCount),
      matchedReports,
      matchedBrain,
      matchedSkills,
      matchedAlerts,
      matchedInvestigations,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "CLOSED", "CAPABLE", "MONITORED", "ADRIFT"];
const LEFT_PX = 148040;
const Z_IDX   = 275;

export default function TaskReportBrainSkillOpsInvestigationClosureWeb() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 90_000) return;
    setLoading(true);
    try {
      const data = await loadData();
      setRows(data);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) load(true); return !v; }); };
    window.addEventListener("jarvis:tmicwb-toggle", handler);
    return () => window.removeEventListener("jarvis:tmicwb-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildTmicwbScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j.response || j.message || j.reply || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    CLOSED:   rows.filter(r => r.cls === "CLOSED").length,
    CAPABLE:  rows.filter(r => r.cls === "CAPABLE").length,
    MONITORED: rows.filter(r => r.cls === "MONITORED").length,
    ADRIFT:   rows.filter(r => r.cls === "ADRIFT").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.status || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasAdrift = counts.ADRIFT > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(true); return !v; }); }}
        style={{
          position: "fixed",
          bottom: 8,
          left: LEFT_PX,
          zIndex: Z_IDX,
          background: open ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${hasAdrift ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasAdrift ? RED : CYAN,
          cursor: "pointer",
          padding: "5px 10px",
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 5,
          animation: hasAdrift ? "tmicwb_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasAdrift && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "tmicwb_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ TMICWB
        {hasAdrift && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.ADRIFT} ADRIFT
          </span>
        )}
      </button>

      <style>{`
        @keyframes tmicwb_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes tmicwb_dot_pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1100px, 96vw)",
          maxHeight: "78vh",
          zIndex: Z_IDX + 1,
          background: "linear-gradient(145deg,#040d1aee,#071426ee)",
          border: `1px solid ${hasAdrift ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasAdrift ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: "1px solid #ffffff11",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ FULL MISSION INTELLIGENCE CLOSURE WEB
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              TASK × REPORT × BRAIN × SKILL × OPS ALERT × INVESTIGATION
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} style={{
                  background: `${CLS_COLOR[k]}15`,
                  border: `1px solid ${CLS_COLOR[k]}44`,
                  borderRadius: 5,
                  color: CLS_COLOR[k],
                  fontSize: 9,
                  padding: "2px 8px",
                  fontWeight: 700,
                }}>
                  {k} {v}
                </span>
              ))}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: assessing ? "#1a2a3a" : `${GREEN}22`,
                  border: `1px solid ${GREEN}55`,
                  borderRadius: 6,
                  color: GREEN,
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 10px",
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "1px solid #ffffff22",
                  borderRadius: 5,
                  color: "#566878",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{
            padding: "8px 18px",
            borderBottom: "1px solid #ffffff0a",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${f === "ALL" ? CYAN : CLS_COLOR[f]}22` : "none",
                  border: `1px solid ${filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#ffffff22"}`,
                  borderRadius: 5,
                  color: filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#566878",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 9px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {f}{f !== "ALL" ? ` (${counts[f] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto",
                background: "#071426",
                border: "1px solid #ffffff22",
                borderRadius: 5,
                color: CYAN,
                fontSize: 9,
                padding: "4px 10px",
                fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
                width: 180,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {loading && (
              <div style={{ color: CYAN, fontSize: 10, padding: "20px", textAlign: "center" }}>
                LOADING MISSION INTELLIGENCE CLOSURE DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No tasks match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{ borderBottom: "1px solid #ffffff08", padding: "0 18px" }}
                >
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 82,
                      background: `${clsColor}18`,
                      border: `1px solid ${clsColor}44`,
                      borderRadius: 4,
                      color: clsColor,
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 7px",
                      letterSpacing: 1,
                      textAlign: "center",
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: "#c8d8e8", fontSize: 10, flex: 1 }}>
                      {row._label || row.id || "—"}
                    </span>
                    {row.status && (
                      <span style={{ color: "#566878", fontSize: 9 }}>{row.status}</span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <DetailSection
                        label="REPORTS" color={CYAN}
                        items={row.matchedReports}
                        renderItem={r => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{r._label}</span>
                            {r.date && <Badge color={CYAN}>{r.date}</Badge>}
                            {r.category && <Badge color={AMBER}>{r.category}</Badge>}
                          </>
                        )}
                      />
                      <DetailSection
                        label="BRAIN NODES" color={GREEN}
                        items={row.matchedBrain}
                        renderItem={b => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{b._label}</span>
                            {b.centrality != null && (
                              <Badge color={GREEN}>{Number(b.centrality).toFixed(3)}</Badge>
                            )}
                            {b.type && <Badge color={CYAN}>{b.type}</Badge>}
                          </>
                        )}
                      />
                      <DetailSection
                        label="SKILLS" color={AMBER}
                        items={row.matchedSkills}
                        renderItem={s => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{s._label}</span>
                            {s.score != null && (
                              <Badge color={GREEN}>{String(s.score).slice(0, 6)}</Badge>
                            )}
                            {s.category && <Badge color={CYAN}>{s.category}</Badge>}
                          </>
                        )}
                      />
                      <DetailSection
                        label="OPS ALERTS" color={RED}
                        items={row.matchedAlerts}
                        renderItem={a => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{a._label}</span>
                            {a.severity && (
                              <Badge color={a.severity === "critical" ? RED : AMBER}>{a.severity}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="INVESTIGATIONS" color={CYAN}
                        items={row.matchedInvestigations}
                        renderItem={inv => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{inv._label}</span>
                            {inv.status && (
                              <Badge color={inv.status === "open" ? AMBER : GREEN}>{inv.status}</Badge>
                            )}
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 18px",
            borderTop: "1px solid #ffffff0a",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}>
            <span style={{ color: "#566878", fontSize: 8 }}>
              {rows.length} tasks · auto-refresh 90s
            </span>
            {loading && <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>}
            <button
              onClick={() => load(true)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${CYAN}33`,
                borderRadius: 4,
                color: CYAN,
                cursor: "pointer",
                fontSize: 8,
                padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ label, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{ color, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 6).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {renderItem(item)}
          </div>
        ))}
        {items.length > 6 && (
          <span style={{ color: "#566878", fontSize: 8 }}>+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      color,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
