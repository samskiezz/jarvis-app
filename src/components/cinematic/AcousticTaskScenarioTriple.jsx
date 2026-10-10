/**
 * F747 — Acoustic × Task × Scenario Triple Nexus (ACTASKSCN)
 * Endpoints: /v1/acoustic/contacts  ×  /entities/Task  ×  /v1/scenario/list
 * Classification: FULLY_OPERATIONAL | TASK_ONLY | SCENARIO_ONLY | DARK
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";

const BTN_LEFT = 914_240;
const POLL_MS  = 90_000;

const ACTASKSCN_RE =
  /\b(actaskscn|acoustic\s+task\s+scenario|acoustic\s+scenario\s+task|sensor\s+task\s+scenario|task\s+scenario\s+acoustic|acoustic\s+mission\s+scenario|acoustic\s+operational|acoustic\s+task\s+plan|sensor\s+mission\s+plan|acoustic\s+scenario\s+coverage|task\s+backed\s+acoustic)\b/i;

export function isActaskscnQuery(t) {
  return ACTASKSCN_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseAcoustic(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseTasks(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tasks)) return raw.tasks;
  if (raw && Array.isArray(raw.data))  return raw.data;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.scenarios)) return raw.scenarios;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.role, obj.subject, obj.topic,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(contacts, tasks, scenarios) {
  return contacts.map(contact => {
    const cKw = keywords(contact);

    const bestTask = tasks.reduce(
      (best, t) => {
        const s = scoreMatch(cKw, keywords(t));
        return s > best.score ? { score: s, t } : best;
      },
      { score: 0, t: null },
    );

    const bestScenario = scenarios.reduce(
      (best, sc) => {
        const s = scoreMatch(cKw, keywords(sc));
        return s > best.score ? { score: s, sc } : best;
      },
      { score: 0, sc: null },
    );

    const hasTask     = bestTask.score > 0;
    const hasScenario = bestScenario.score > 0;

    const status =
      hasTask && hasScenario ? "FULLY_OPERATIONAL" :
      hasTask                ? "TASK_ONLY"          :
      hasScenario            ? "SCENARIO_ONLY"      :
                               "DARK";

    return {
      contact,
      matchedTask     : hasTask     ? bestTask.t   : null,
      matchedScenario : hasScenario ? bestScenario.sc : null,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [acousticRes, tasksRes, scenariosRes] = await Promise.all([
    fetch(`${base}/v1/acoustic/contacts`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/entities/Task`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/scenario/list`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    contacts  : normaliseAcoustic(acousticRes),
    tasks     : normaliseTasks(tasksRes),
    scenarios : normaliseScenarios(scenariosRes),
  };
}

export async function buildActaskscnScript() {
  try {
    const { contacts, tasks, scenarios } = await fetchAll();
    const nexus = buildNexus(contacts, tasks, scenarios);
    const counts = {
      FULLY_OPERATIONAL : nexus.filter(r => r.status === "FULLY_OPERATIONAL").length,
      TASK_ONLY         : nexus.filter(r => r.status === "TASK_ONLY").length,
      SCENARIO_ONLY     : nexus.filter(r => r.status === "SCENARIO_ONLY").length,
      DARK              : nexus.filter(r => r.status === "DARK").length,
    };
    const darkNames = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.contact.name || r.contact.label || r.contact.id || "Unknown")
      .join("; ");
    const cov = contacts.length
      ? Math.round((counts.FULLY_OPERATIONAL / contacts.length) * 100)
      : 0;
    return (
      `Acoustic Task Scenario Triple Nexus: ${contacts.length} acoustic contacts cross-referenced ` +
      `against ${tasks.length} tasks and ${scenarios.length} scenarios. ` +
      `${counts.FULLY_OPERATIONAL} fully operational (task + scenario match). ` +
      `${counts.TASK_ONLY} task only. ${counts.SCENARIO_ONLY} scenario only. ` +
      `${counts.DARK} dark — no mission or playbook coverage${darkNames ? `: ${darkNames}` : ""}. ` +
      `Overall coverage: ${cov}%. Review dark contacts for unplanned operational exposure.`
    );
  } catch {
    return "Acoustic Task Scenario Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_OPERATIONAL : { label: "FULLY OPERATIONAL", col: GN  },
  TASK_ONLY         : { label: "TASK ONLY",          col: CY  },
  SCENARIO_ONLY     : { label: "SCENARIO ONLY",      col: AM  },
  DARK              : { label: "DARK",               col: RD  },
};

export default function AcousticTaskScenarioTriple() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [counts,  setCounts]  = useState({
    FULLY_OPERATIONAL:0, TASK_ONLY:0, SCENARIO_ONLY:0, DARK:0,
  });
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, tasks, scenarios } = await fetchAll();
      const nexus = buildNexus(contacts, tasks, scenarios);
      setRows(nexus);
      setCounts({
        FULLY_OPERATIONAL : nexus.filter(r => r.status === "FULLY_OPERATIONAL").length,
        TASK_ONLY         : nexus.filter(r => r.status === "TASK_ONLY").length,
        SCENARIO_ONLY     : nexus.filter(r => r.status === "SCENARIO_ONLY").length,
        DARK              : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:actaskscn-toggle", toggle);
    return () => window.removeEventListener("jarvis:actaskscn-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = filter === "ALL" ? rows : rows.filter(r => r.status === filter);
  const cov = rows.length
    ? Math.round((counts.FULLY_OPERATIONAL / rows.length) * 100)
    : 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 606,
          background  : open ? "rgba(41,231,255,0.14)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? CY : DIM}`,
          color       : open ? CY : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing: "0.05em",
          whiteSpace  : "nowrap",
        }}
        title="Acoustic × Task × Scenario Triple Nexus (F747)"
      >
        ACTASKSCN
        {counts.DARK > 0 && (
          <span style={{
            marginLeft  : 5,
            background  : RD,
            color       : "#000",
            borderRadius: 3,
            padding     : "0 4px",
            fontSize    : 9,
            fontWeight  : 700,
          }}>
            {counts.DARK}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position     : "fixed",
            bottom       : 36,
            left         : BTN_LEFT,
            width        : 820,
            maxHeight    : 540,
            zIndex       : 606,
            background   : "rgba(10,13,20,0.97)",
            border       : `1px solid ${CY}`,
            borderRadius : 10,
            boxShadow    : `0 0 32px ${CY}44`,
            display      : "flex",
            flexDirection: "column",
            overflow     : "hidden",
            fontFamily   : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding     : "8px 14px 6px",
            borderBottom: `1px solid ${CY}44`,
            display     : "flex",
            alignItems  : "center",
            gap         : 10,
            flexShrink  : 0,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              ACOUSTIC × TASK × SCENARIO — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F747</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background:"none", border:"none", color: DIM, cursor:"pointer", fontSize:14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "5px 14px",
            borderBottom: `1px solid ${CY}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {/* Summary tiles */}
            {[
              { label: "CONTACTS",    val: rows.length,               col: CY },
              { label: "COVERAGE",    val: `${cov}%`,                 col: GN },
              { label: "DARK",        val: counts.DARK,               col: RD },
            ].map(tile => (
              <span key={tile.label} style={{
                background  : `${tile.col}11`,
                border      : `1px solid ${tile.col}44`,
                color       : tile.col,
                borderRadius: 4,
                padding     : "2px 10px",
                fontSize    : 10,
              }}>
                {tile.label}: <strong>{tile.val}</strong>
              </span>
            ))}

            {/* Filter buttons */}
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${CY}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? CY : DIM + "66"}`,
                color       : filter === "ALL" ? CY : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {/* Error */}
          {err && (
            <div style={{ padding:"6px 14px", color: RD, fontSize:11 }}>
              ERROR: {err}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize:11, padding:"12px 14px" }}>
                No contacts{filter !== "ALL" ? ` matching filter: ${filter}` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const c = row.contact;
              const meta = STATUS_META[row.status];
              const name  = c.name  || c.label || c.id || `Contact #${i + 1}`;
              const type  = c.type  || c.category || "";
              const taskLabel = row.matchedTask
                ? (row.matchedTask.title || row.matchedTask.name || "Task")
                : null;
              const scLabel = row.matchedScenario
                ? (row.matchedScenario.name || row.matchedScenario.title || "Scenario")
                : null;
              const taskStatus = row.matchedTask?.status || "";
              const scKind     = row.matchedScenario?.kind || row.matchedScenario?.type || "";
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${CY}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth     : 148,
                    fontSize     : 9,
                    color        : meta.col,
                    fontWeight   : 700,
                    letterSpacing: "0.06em",
                    paddingTop   : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex:1 }}>
                    <div style={{ color:"#E8EEF6", fontSize:11, fontWeight:600 }}>
                      {name}
                      {type && (
                        <span style={{ color: DIM, fontWeight:400, marginLeft:6, fontSize:10 }}>
                          [{type}]
                        </span>
                      )}
                    </div>
                    <div style={{ display:"flex", gap:6, marginTop:3, flexWrap:"wrap" }}>
                      {taskLabel && (
                        <span style={{ color: CY, fontSize:9, background:`${CY}12`, borderRadius:3, padding:"1px 5px" }}>
                          TASK: {taskLabel}{taskStatus ? ` (${taskStatus})` : ""}
                        </span>
                      )}
                      {scLabel && (
                        <span style={{ color: AM, fontSize:9, background:`${AM}12`, borderRadius:3, padding:"1px 5px" }}>
                          SCN: {scLabel}{scKind ? ` [${scKind}]` : ""}
                        </span>
                      )}
                      {!taskLabel && !scLabel && (
                        <span style={{ color: RD, fontSize:9, background:`${RD}12`, borderRadius:3, padding:"1px 5px" }}>
                          NO MISSION/PLAYBOOK COVERAGE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${CY}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /v1/acoustic/contacts × /entities/Task × /v1/scenario/list | poll {POLL_MS / 1000}s | F747
          </div>
        </div>
      )}
    </>
  );
}
