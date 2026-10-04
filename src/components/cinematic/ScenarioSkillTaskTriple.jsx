/**
 * F762 — Scenario × Skill × Task Triple Nexus (SSKLTRI)
 * Endpoints: /v1/scenario/list  ×  /v1/aip/skill  ×  /entities/Task
 * Classification: FULLY_PLANNED | SKILL_ONLY | TASK_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 924_660;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SSKLTRI_RE =
  /\b(sskltri|scenario\s+skill\s+task|skill\s+task\s+scenario|task\s+skill\s+scenario|scenario\s+task\s+skill|planned\s+scenario|scenario\s+planning|scenario\s+skill\s+coverage|scenario\s+task\s+coverage|skill\s+scenario\s+task|unplanned\s+scenario|dark\s+scenario)\b/i;

export function isSskltriQuery(t) {
  return SSKLTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    ""
  );
}

function normaliseScenarios(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.scenarios)) return raw.scenarios;
  if (raw && Array.isArray(raw.data))      return raw.data;
  if (raw && Array.isArray(raw.items))     return raw.items;
  return [];
}

function normaliseSkills(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.skills)) return raw.skills;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function normaliseTasks(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tasks))  return raw.tasks;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.domain, obj.content, obj.status,
    obj.priority, obj.objective, obj.goal, obj.subject,
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

function buildNexus(scenarios, skills, tasks) {
  return scenarios.map(scenario => {
    const sKw = keywords(scenario);

    const bestSkill = skills.reduce(
      (best, sk) => {
        const s = scoreMatch(sKw, keywords(sk));
        return s > best.score ? { score: s, sk } : best;
      },
      { score: 0, sk: null },
    );

    const bestTask = tasks.reduce(
      (best, tk) => {
        const s = scoreMatch(sKw, keywords(tk));
        return s > best.score ? { score: s, tk } : best;
      },
      { score: 0, tk: null },
    );

    const hasSkill = bestSkill.score > 0;
    const hasTask  = bestTask.score > 0;

    const classification =
      hasSkill && hasTask ? "FULLY_PLANNED"
      : hasSkill          ? "SKILL_ONLY"
      : hasTask           ? "TASK_ONLY"
      :                     "DARK";

    return {
      scenario,
      classification,
      bestSkill:  bestSkill.sk,
      skillScore: bestSkill.score,
      bestTask:   bestTask.tk,
      taskScore:  bestTask.score,
    };
  });
}

export async function buildSskltriScript() {
  const base = apiBase();
  try {
    const [scnR, skR, tkR] = await Promise.all([
      fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/aip/skill`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Task`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const scenarios = normaliseScenarios(await scnR.json());
    const skills    = normaliseSkills(await skR.json());
    const tasks     = normaliseTasks(await tkR.json());
    const nexus     = buildNexus(scenarios, skills, tasks);
    const planned   = nexus.filter(r => r.classification === "FULLY_PLANNED").length;
    const dark      = nexus.filter(r => r.classification === "DARK").length;
    const pct       = scenarios.length ? Math.round((planned / scenarios.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Scenario × Skill × Task triple nexus: ${scenarios.length} scenarios analysed against ${skills.length} skills and ${tasks.length} tasks. ${planned} scenarios are fully planned (skill + task backing), ${dark} are dark (no skill or task link). Coverage ${pct}%. Summarise scenario operational readiness in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${scenarios.length} scenarios analysed. ${planned} fully planned (skill + task), ${dark} dark — no skill or task coverage detected.`;
  } catch (e) {
    return `SSKLTRI fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_PLANNED", "SKILL_ONLY", "TASK_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_PLANNED: GN,
  SKILL_ONLY:    CY,
  TASK_ONLY:     AM,
  DARK:          RD,
};

const STATUS_COLOR = {
  DONE:        GN,
  COMPLETED:   GN,
  ACTIVE:      GN,
  IN_PROGRESS: CY,
  PENDING:     AM,
  BLOCKED:     RD,
  OPEN:        AM,
  DRAFT:       DIM,
};

export default function ScenarioSkillTaskTriple() {
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
      const [scnR, skR, tkR] = await Promise.all([
        fetch(`${base}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/aip/skill`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Task`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const scenarios = normaliseScenarios(await scnR.json());
      const skills    = normaliseSkills(await skR.json());
      const tasks     = normaliseTasks(await tkR.json());
      const nexus     = buildNexus(scenarios, skills, tasks);
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
    window.addEventListener("jarvis:sskltri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sskltri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.scenario).includes(search.toLowerCase()) ||
      (r.bestSkill && keywords(r.bestSkill).includes(search.toLowerCase())) ||
      (r.bestTask  && keywords(r.bestTask).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:        rows.length,
    FULLY_PLANNED: rows.filter(r => r.classification === "FULLY_PLANNED").length,
    SKILL_ONLY:    rows.filter(r => r.classification === "SKILL_ONLY").length,
    TASK_ONLY:     rows.filter(r => r.classification === "TASK_ONLY").length,
    DARK:          rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_PLANNED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 619,
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
          ◈ SSKLTRI — SCENARIO × SKILL × TASK
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} scenarios · ${pct}% planned`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["SCENARIOS",     counts.total,          CY],
          ["FULLY PLANNED", counts.FULLY_PLANNED,  GN],
          ["SKILL ONLY",    counts.SKILL_ONLY,     CY],
          ["TASK ONLY",     counts.TASK_ONLY,      AM],
          ["DARK",          counts.DARK,            RD],
          ["COVERAGE",      `${pct}%`,              pct >= 60 ? GN : pct >= 30 ? AM : RD],
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
        placeholder="Search scenarios / skills / tasks…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp  = expanded === i;
          const col    = BADGE_COLOR[r.classification];
          const name   = r.scenario.name || r.scenario.title || r.scenario.label || `Scenario ${i + 1}`;
          const status = r.scenario.status || r.scenario.kind || r.scenario.state;
          const statusCol = (status && STATUS_COLOR[status.toUpperCase()]) || DIM;
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
                {status && (
                  <span style={{
                    fontSize: 9, background: `${statusCol}22`, border: `1px solid ${statusCol}44`,
                    borderRadius: 4, padding: "1px 6px", color: statusCol, letterSpacing: 1,
                  }}>{status.toUpperCase()}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestSkill ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Skill:</b>{" "}
                      {r.bestSkill.name || r.bestSkill.title || "skill"}{" "}
                      <span style={{ color: DIM }}>
                        (domain: {r.bestSkill.domain || r.bestSkill.type || "—"}, hits: {r.skillScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching skill found.</div>
                  )}
                  {r.bestTask ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Task:</b>{" "}
                      {r.bestTask.name || r.bestTask.title || "task"}{" "}
                      <span style={{ color: DIM }}>
                        (status: {r.bestTask.status || r.bestTask.state || "—"}, hits: {r.taskScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching task found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No scenarios match current filter.
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
        title="Scenario × Skill × Task Triple Nexus (SSKLTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 619,
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
        ◈ SSKLTRI
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
