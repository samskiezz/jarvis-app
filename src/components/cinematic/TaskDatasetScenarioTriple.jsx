/**
 * F755 — Task × Dataset × Scenario Triple Nexus (TDSCTRI)
 * Endpoints: /entities/Task  ×  /v1/datasets  ×  /v1/scenario/list
 * Classification: FULLY_PLANNED | DATASET_ONLY | SCENARIO_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 920_360;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TDSCTRI_RE =
  /\b(tdsctri|task\s+dataset\s+scenario|task\s+data\s+plan|task\s+scenario\s+dataset|planned\s+task|task\s+planning\s+triple|task\s+operational\s+context|task\s+data\s+scenario|dataset\s+scenario\s+task|task\s+triple\s+nexus)\b/i;

export function isTdsctriQuery(t) {
  return TDSCTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseTasks(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tasks))  return raw.tasks;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function normaliseDatasets(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.datasets)) return raw.datasets;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
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
    obj.tags, obj.topic, obj.domain, obj.content,
    obj.status, obj.priority, obj.dataset_type,
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

function buildNexus(tasks, datasets, scenarios) {
  return tasks.map(task => {
    const tKw = keywords(task);

    const bestDataset = datasets.reduce(
      (best, ds) => {
        const s = scoreMatch(tKw, keywords(ds));
        return s > best.score ? { score: s, ds } : best;
      },
      { score: 0, ds: null },
    );

    const bestScenario = scenarios.reduce(
      (best, sc) => {
        const s = scoreMatch(tKw, keywords(sc));
        return s > best.score ? { score: s, sc } : best;
      },
      { score: 0, sc: null },
    );

    const hasDataset  = bestDataset.score  > 0;
    const hasScenario = bestScenario.score > 0;

    const classification =
      hasDataset && hasScenario ? "FULLY_PLANNED"
      : hasDataset              ? "DATASET_ONLY"
      : hasScenario             ? "SCENARIO_ONLY"
      :                           "DARK";

    return {
      task,
      classification,
      bestDataset:   bestDataset.ds,
      datasetScore:  bestDataset.score,
      bestScenario:  bestScenario.sc,
      scenarioScore: bestScenario.score,
    };
  });
}

export async function buildTdsctriScript() {
  const base = apiBase();
  try {
    const [taskR, dsR, scR] = await Promise.all([
      fetch(`${base}/entities/Task`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/scenario/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const tasks     = normaliseTasks(await taskR.json());
    const datasets  = normaliseDatasets(await dsR.json());
    const scenarios = normaliseScenarios(await scR.json());
    const nexus     = buildNexus(tasks, datasets, scenarios);
    const planned   = nexus.filter(r => r.classification === "FULLY_PLANNED").length;
    const dark      = nexus.filter(r => r.classification === "DARK").length;
    const pct       = tasks.length ? Math.round((planned / tasks.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Task × Dataset × Scenario coverage: ${tasks.length} tasks analysed, ${planned} fully planned (dataset+scenario match), ${dark} dark (no dataset or scenario backing). Coverage ${pct}%. Summarise task operational readiness in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${tasks.length} tasks analysed. ${planned} fully planned with data and scenario backing, ${dark} dark — no dataset or scenario context detected.`;
  } catch (e) {
    return `TDSCTRI fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_PLANNED", "DATASET_ONLY", "SCENARIO_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_PLANNED:  GN,
  DATASET_ONLY:   CY,
  SCENARIO_ONLY:  AM,
  DARK:           RD,
};

export default function TaskDatasetScenarioTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [taskR, dsR, scR] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/datasets`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const tasks     = normaliseTasks(await taskR.json());
      const datasets  = normaliseDatasets(await dsR.json());
      const scenarios = normaliseScenarios(await scR.json());
      const nexus     = buildNexus(tasks, datasets, scenarios);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:tdsctri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdsctri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.task).includes(search.toLowerCase()) ||
      (r.bestDataset  && keywords(r.bestDataset).includes(search.toLowerCase())) ||
      (r.bestScenario && keywords(r.bestScenario).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:          rows.length,
    FULLY_PLANNED:  rows.filter(r => r.classification === "FULLY_PLANNED").length,
    DATASET_ONLY:   rows.filter(r => r.classification === "DATASET_ONLY").length,
    SCENARIO_ONLY:  rows.filter(r => r.classification === "SCENARIO_ONLY").length,
    DARK:           rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_PLANNED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 614,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ TDSCTRI — TASK × DATASET × SCENARIO
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} tasks · ${pct}% planned`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["TASKS",        counts.total,         CY],
          ["FULLY PLANNED",counts.FULLY_PLANNED,  GN],
          ["DATASET ONLY", counts.DATASET_ONLY,   CY],
          ["SCENARIO ONLY",counts.SCENARIO_ONLY,  AM],
          ["DARK",         counts.DARK,           RD],
          ["COVERAGE",     `${pct}%`,             pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search tasks / datasets / scenarios…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp = expanded === i;
          const col   = BADGE_COLOR[r.classification];
          const name  = r.task.title || r.task.name || r.task.description || `Task ${i + 1}`;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {r.task.priority && (
                  <span style={{
                    fontSize: 9, background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, padding: "1px 6px", color: AM,
                  }}>{r.task.priority}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestDataset ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Dataset:</b>{" "}
                      {r.bestDataset.name || r.bestDataset.title || "dataset"}{" "}
                      <span style={{ color: DIM }}>
                        (kind: {r.bestDataset.dataset_type || r.bestDataset.kind || "—"}, hits: {r.datasetScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching dataset found.</div>
                  )}
                  {r.bestScenario ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Scenario:</b>{" "}
                      {r.bestScenario.title || r.bestScenario.name || "scenario"}{" "}
                      <span style={{ color: DIM }}>
                        (kind: {r.bestScenario.kind || r.bestScenario.category || "—"}, hits: {r.scenarioScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching scenario found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No tasks match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="Task × Dataset × Scenario Triple Nexus (TDSCTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 614,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ TDSCTRI
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
