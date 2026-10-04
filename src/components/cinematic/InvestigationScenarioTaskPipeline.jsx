/**
 * InvestigationScenarioTaskPipeline — F34.
 *
 * Chains open investigations through matching scenarios to executable tasks,
 * building a 3-hop resolution pipeline:
 *   investigation → best-fit scenario → actionable tasks
 *
 * Endpoints used:
 *   /v1/investigations  — open cases
 *   /v1/scenario/list   — operational playbooks
 *   /entities/Task      — mission tasks
 *
 * Stat tiles: investigations / scenarios / tasks / full-chain (all 3 hops present)
 * Filter tabs: ALL / WITH_SCENARIO / WITHOUT_SCENARIO / FULL_CHAIN
 * Panel: investigation row → expand → matched scenario → matched tasks
 * ▶ ASSESS per investigation → /v1/jarvis/agent/chat 2-sentence
 *   resolution brief + TTS via jarvis:speak-dossier.
 * 90 s auto-refresh.
 *
 * Intent: "investigation pipeline" / "case resolution" / "case action plan" /
 *         "investigation to task" / "invpipe" / "case pipeline" /
 *         "how to resolve this case" / "case task plan"
 *   → jarvis:invpipe-toggle + TTS brief via buildInvPipeScript()
 *
 * Toggle: ◈ INVPIPE at left:9560, bottom:8, zIndex:65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const VIOLET = "#A78BFA";
const RED   = "#FF3D5A";
const BTN_LEFT   = 9560;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.case_name || "Unnamed Case",
    description: inv.description || inv.summary || inv.details || "",
    status:      (inv.status || "open").toLowerCase(),
    priority:    inv.priority || inv.severity || "",
    subject:     inv.subject || inv.target || "",
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((sc) => ({
    id:          sc.id || sc.scenario_id || String(Math.random()),
    name:        sc.name || sc.title || sc.scenario_name || "Unnamed Scenario",
    description: sc.description || sc.summary || sc.details || "",
    type:        sc.type || sc.category || "",
    status:      sc.status || "",
  }));
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t) => ({
    id:          t.id || t.task_id || String(Math.random()),
    title:       t.title || t.name || t.task_name || "Unnamed Task",
    description: t.description || t.summary || t.details || "",
    status:      (t.status || "").toLowerCase(),
    priority:    t.priority || t.severity || "",
  }));
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function overlap(a, b) {
  const ta = new Set([...tokens(a.title), ...tokens(a.description), ...tokens(a.subject || "")]);
  const tb = [...tokens(b.name || b.title || ""), ...tokens(b.description || ""), ...tokens(b.type || "")];
  return tb.filter((t) => ta.has(t)).length;
}

function overlapTask(inv, task) {
  const ti = new Set([...tokens(inv.title), ...tokens(inv.description), ...tokens(inv.subject || "")]);
  const tt = [...tokens(task.title), ...tokens(task.description)];
  return tt.filter((t) => ti.has(t)).length;
}

// ─── exported voice intent helpers ───────────────────────────────────────────

export function isInvPipeQuery(q = "") {
  return /\b(invpipe|investigation\s*pipeline|case\s*pipeline|case\s*resolution|case\s*action\s*plan|investigation\s*to\s*task|case\s*task\s*plan|how\s*to\s*resolve.*case|resolution\s*chain)\b/i.test(q);
}

export async function buildInvPipeScript() {
  try {
    const [invRes, scRes, taskRes] = await Promise.all([
      fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/entities/Task`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const invs      = normaliseInvestigations(invRes.ok  ? await invRes.json()  : []);
    const scenarios = normaliseScenarios(scRes.ok        ? await scRes.json()   : []);
    const tasks     = normaliseTasks(taskRes.ok          ? await taskRes.json() : []);

    const open = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");
    const fullChain = open.filter((inv) => {
      const bestScen = scenarios.find((sc) => overlap(inv, sc) > 0);
      if (!bestScen) return false;
      return tasks.some((t) => overlapTask(inv, t) > 0);
    });
    const withScenario    = open.filter((inv) => scenarios.some((sc) => overlap(inv, sc) > 0));
    const withoutScenario = open.filter((inv) => !scenarios.some((sc) => overlap(inv, sc) > 0));

    return (
      `Investigation resolution pipeline: ${open.length} open cases, ${scenarios.length} scenarios, ${tasks.length} tasks. ` +
      `${fullChain.length} investigations have a full resolution chain (scenario + tasks). ` +
      (withoutScenario.length > 0
        ? `${withoutScenario.length} cases have no matching scenario — these are planning gaps.`
        : "All open investigations have at least one matching scenario, sir.")
    );
  } catch {
    return "Unable to retrieve the investigation resolution pipeline at this time, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function InvestigationScenarioTaskPipeline() {
  const [open, setOpen]           = useState(false);
  const [invs, setInvs]           = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState("ALL");
  const [selected, setSelected]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, scRes, taskRes] = await Promise.all([
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/entities/Task`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      setInvs(normaliseInvestigations(invRes.ok  ? await invRes.json()  : []));
      setScenarios(normaliseScenarios(scRes.ok   ? await scRes.json()   : []));
      setTasks(normaliseTasks(taskRes.ok         ? await taskRes.json() : []));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen((v) => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:invpipe-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invpipe-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const openInvs = invs.filter((i) => i.status !== "closed" && i.status !== "resolved");

  const enriched = openInvs.map((inv) => {
    const matchedScenarios = scenarios
      .map((sc) => ({ ...sc, score: overlap(inv, sc) }))
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const matchedTasks = tasks
      .map((t) => ({ ...t, score: overlapTask(inv, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      ...inv,
      matchedScenarios,
      matchedTasks,
      hasScenario: matchedScenarios.length > 0,
      fullChain:   matchedScenarios.length > 0 && matchedTasks.length > 0,
    };
  });

  const withScenarioCount    = enriched.filter((i) => i.hasScenario).length;
  const withoutScenarioCount = enriched.filter((i) => !i.hasScenario).length;
  const fullChainCount       = enriched.filter((i) => i.fullChain).length;

  const visible =
    filter === "WITH_SCENARIO"    ? enriched.filter((i) => i.hasScenario) :
    filter === "WITHOUT_SCENARIO" ? enriched.filter((i) => !i.hasScenario) :
    filter === "FULL_CHAIN"       ? enriched.filter((i) => i.fullChain) :
    enriched;

  async function assess(inv) {
    setAssessing(inv.id);
    try {
      const scenNames  = inv.matchedScenarios.slice(0, 2).map((s) => s.name).join(", ");
      const taskTitles = inv.matchedTasks.slice(0, 3).map((t) => t.title).join(", ");
      const prompt =
        `In 2 sentences, describe the resolution path for investigation: "${inv.title}". ` +
        (scenNames  ? `Matching scenarios: ${scenNames}. ` : "No matching scenario found. ") +
        (taskTitles ? `Candidate tasks: ${taskTitles}.`    : "No candidate tasks found.");
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to build a resolution plan for this case, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(null);
  }

  const TABS = [
    { key: "ALL",              label: `ALL (${enriched.length})` },
    { key: "WITH_SCENARIO",    label: `PLANNED (${withScenarioCount})` },
    { key: "WITHOUT_SCENARIO", label: `NO PLAN (${withoutScenarioCount})` },
    { key: "FULL_CHAIN",       label: `FULL CHAIN (${fullChainCount})` },
  ];

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => { setOpen((v) => { if (!v) load(); return !v; }); }}
        title="Investigation → Scenario → Task Pipeline"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? CY : "rgba(5,8,13,0.75)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 6, padding: "3px 8px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: withoutScenarioCount > 0 ? `0 0 10px ${AMBER}66` : "none",
        }}
      >
        ◈ INVPIPE{withoutScenarioCount > 0 && !open ? ` +${withoutScenarioCount}` : ""}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 30, left: BTN_LEFT - 420, zIndex: 66,
          width: 720, maxHeight: "76vh",
          background: "rgba(5,8,13,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ INVESTIGATION → SCENARIO → TASK PIPELINE
            </span>
            {loading && <span style={{ color: "#4A6070", fontSize: 9 }}>↻</span>}
            <button onClick={load} style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}33`, color: CY, borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9 }}>↻</button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
            {[
              { label: "OPEN CASES",   value: enriched.length,       c: CY },
              { label: "SCENARIOS",    value: scenarios.length,      c: VIOLET },
              { label: "TASKS",        value: tasks.length,          c: "#60A5FA" },
              { label: "FULL CHAIN",   value: fullChainCount,        c: fullChainCount > 0 ? GREEN : "#4A6070" },
              { label: "NO PLAN",      value: withoutScenarioCount,  c: withoutScenarioCount > 0 ? AMBER : "#4A6070" },
            ].map(({ label, value, c }) => (
              <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                <div style={{ color: c, fontSize: 16, fontWeight: 700 }}>{value}</div>
                <div style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}11` }}>
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                flex: 1, padding: "5px 0", background: filter === key ? `${CY}18` : "none",
                border: "none", borderBottom: filter === key ? `2px solid ${CY}` : "2px solid transparent",
                color: filter === key ? CY : "#4A6070", cursor: "pointer", fontSize: 8, letterSpacing: 1,
              }}>{label}</button>
            ))}
          </div>

          {/* split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
            {/* left: investigation list */}
            <div style={{ flex: "0 0 280px", overflowY: "auto", borderRight: `1px solid ${CY}11` }}>
              {visible.length === 0 && (
                <div style={{ padding: 16, color: "#4A6070", fontSize: 11 }}>No cases to display.</div>
              )}
              {visible.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
                  style={{
                    padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${CY}0A`,
                    background: selected?.id === inv.id ? `${CY}0F` : "transparent",
                    borderLeft: `2px solid ${inv.fullChain ? GREEN : inv.hasScenario ? VIOLET : AMBER}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 8, color: inv.fullChain ? GREEN : inv.hasScenario ? VIOLET : AMBER }}>
                      {inv.fullChain ? "●" : inv.hasScenario ? "◑" : "○"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inv.title}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {inv.priority && (
                      <span style={{ fontSize: 8, color: inv.priority === "critical" ? RED : inv.priority === "high" ? AMBER : CY, letterSpacing: 1 }}>
                        {inv.priority.toUpperCase()}
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: "#4A6070", marginLeft: "auto" }}>
                      {inv.matchedScenarios.length}sc · {inv.matchedTasks.length}tk
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* right: resolution chain detail */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px" }}>
              {!selected ? (
                <div style={{ color: "#4A6070", fontSize: 10, paddingTop: 24, textAlign: "center" }}>
                  Select an investigation to view its resolution chain
                </div>
              ) : (
                <>
                  {/* header */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: CY, fontSize: 10, fontWeight: 700, marginBottom: 2 }}>{selected.title}</div>
                    {selected.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 9, lineHeight: 1.4, marginBottom: 6 }}>
                        {selected.description.slice(0, 160)}{selected.description.length > 160 ? "…" : ""}
                      </div>
                    )}
                    <button
                      onClick={() => assess(selected)}
                      disabled={assessing === selected.id}
                      style={{
                        background: assessing === selected.id ? "#2a3a4a" : `${CY}22`,
                        border: `1px solid ${CY}55`, color: CY, borderRadius: 5,
                        padding: "4px 10px", cursor: assessing === selected.id ? "default" : "pointer",
                        fontSize: 9, letterSpacing: 1,
                      }}
                    >
                      {assessing === selected.id ? "◌ RESOLVING…" : "▶ ASSESS RESOLUTION PATH"}
                    </button>
                  </div>

                  {/* hop 1: scenario */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: VIOLET, fontSize: 9, letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>
                      ① MATCHING SCENARIOS
                    </div>
                    {selected.matchedScenarios.length === 0 ? (
                      <div style={{ color: AMBER, fontSize: 10 }}>No matching scenario — planning gap.</div>
                    ) : (
                      selected.matchedScenarios.map((sc) => (
                        <div key={sc.id} style={{
                          background: "rgba(167,139,250,0.07)", borderRadius: 6,
                          padding: "6px 10px", marginBottom: 5, borderLeft: `2px solid ${VIOLET}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {sc.name}
                            </span>
                            <span style={{ color: VIOLET, fontSize: 8, whiteSpace: "nowrap" }}>
                              {sc.score} match{sc.score !== 1 ? "es" : ""}
                            </span>
                          </div>
                          {sc.type && (
                            <span style={{ color: "#4A6070", fontSize: 8, letterSpacing: 1 }}>{sc.type.toUpperCase()}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* hop 2: tasks */}
                  <div>
                    <div style={{ color: "#60A5FA", fontSize: 9, letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>
                      ② CANDIDATE TASKS
                    </div>
                    {selected.matchedTasks.length === 0 ? (
                      <div style={{ color: AMBER, fontSize: 10 }}>No matching tasks — execution gap.</div>
                    ) : (
                      selected.matchedTasks.map((t) => (
                        <div key={t.id} style={{
                          background: "rgba(96,165,250,0.06)", borderRadius: 6,
                          padding: "6px 10px", marginBottom: 5, borderLeft: `2px solid #60A5FA`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {t.title}
                            </span>
                            {t.status && (
                              <span style={{
                                fontSize: 8, letterSpacing: 1, whiteSpace: "nowrap",
                                color: t.status === "completed" ? GREEN : t.status === "in_progress" ? CY : "#4A6070",
                              }}>
                                {t.status.toUpperCase()}
                              </span>
                            )}
                          </div>
                          {t.priority && (
                            <span style={{ color: t.priority === "critical" ? RED : t.priority === "high" ? AMBER : "#4A6070", fontSize: 8, letterSpacing: 1 }}>
                              {t.priority.toUpperCase()}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
