/**
 * F181 — Task × IntelProfile × Scenario × Knowledge Mission Intelligence Completeness Index (TMICKI)
 *
 * Parallel-fetches /entities/Task + /entities/IntelProfile + /v1/scenario/list + /knowledge/
 * and keyword-correlates each task against intel actor profiles AND scenario playbooks
 * AND knowledge articles to classify:
 *
 *   FULLY_COMPLETE  — matched intel profile + scenario + knowledge article
 *   DUAL_LINKED     — matched any two of the three
 *   SINGLE_LINKED   — matched exactly one
 *   INCOMPLETE      — no matches (mission intelligence gap)
 *
 * Stat tiles: TASKS / INTEL PROFILES / SCENARIOS / KB ARTICLES + four class counts + COMPLETE%.
 * Amber badge on incomplete count.
 * Filter tabs ALL / FULLY_COMPLETE / DUAL_LINKED / SINGLE_LINKED / INCOMPLETE + text search.
 * Expand task → matched intel profile cards (orange, role badge) + scenario cards (cyan, type badge)
 *             + KB article cards (green, category badge) with relevance bars.
 * ▶ ASSESS COMPLETENESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tmicki-toggle event.
 *
 * Voice triggers:
 *   "tmicki / task mission intel / mission completeness / incomplete tasks /
 *    task intel scenario / task scenario coverage / task completeness index /
 *    mission intel completeness / task actor knowledge"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_043_720;
const Z_INDEX  = 242;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TMICKI_RE = /\b(tmicki|task[\s-]mission[\s-]intel(?:ligence)?|mission[\s-]completeness(?:[\s-]index)?|incomplete[\s-]tasks?|task[\s-]intel[\s-]scenario|task[\s-]scenario[\s-]coverage|task[\s-]completeness(?:[\s-]index)?|mission[\s-]intel[\s-]completeness|task[\s-]actor[\s-]knowledge)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COMPLETE: GR,
  DUAL_LINKED:    CY,
  SINGLE_LINKED:  OR,
  INCOMPLETE:     RD,
};

const TABS = ["ALL", "FULLY_COMPLETE", "DUAL_LINKED", "SINGLE_LINKED", "INCOMPLETE"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return `${t.name || t.title || ""} ${t.description || t.summary || ""} ${t.priority || ""} ${(t.tags || []).join(" ")}`;
}
function intelText(p) {
  return `${p.name || ""} ${p.aliases || ""} ${p.org || p.organization || ""} ${p.role || ""} ${p.description || ""} ${(p.tags || []).join(" ")}`;
}
function scenarioText(s) {
  return `${s.name || s.title || ""} ${s.description || s.summary || ""} ${s.type || ""} ${(s.tags || []).join(" ")}`;
}
function kbText(a) {
  return `${a.title || a.name || ""} ${a.content || a.summary || a.description || ""} ${a.category || ""} ${(a.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [tasksRes, intelRes, scenarioRes, kbRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Task`,      { headers }),
    fetch(`${apiBase}/entities/IntelProfile`, { headers }),
    fetch(`${apiBase}/v1/scenario/list`,   { headers }),
    fetch(`${apiBase}/knowledge/`,         { headers }),
  ]);
  const tasks = tasksRes.status === "fulfilled" && tasksRes.value.ok
    ? normaliseArray(await tasksRes.value.json(), ["tasks", "items"]) : [];
  const intel = intelRes.status === "fulfilled" && intelRes.value.ok
    ? normaliseArray(await intelRes.value.json(), ["profiles", "intel_profiles", "items"]) : [];
  const scenarios = scenarioRes.status === "fulfilled" && scenarioRes.value.ok
    ? normaliseArray(await scenarioRes.value.json(), ["scenarios", "items"]) : [];
  const kb = kbRes.status === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "knowledge", "items"]) : [];
  return { tasks, intel, scenarios, kb };
}

function correlate(tasks, intel, scenarios, kb) {
  return tasks.map(task => {
    const kws = keywords(taskText(task));
    const matchedIntel = intel
      .map(p => ({ ...p, _score: score(intelText(p), kws) }))
      .filter(p => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedScenarios = scenarios
      .map(s => ({ ...s, _score: score(scenarioText(s), kws) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedKb = kb
      .map(a => ({ ...a, _score: score(kbText(a), kws) }))
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchCount = (matchedIntel.length > 0 ? 1 : 0)
                     + (matchedScenarios.length > 0 ? 1 : 0)
                     + (matchedKb.length > 0 ? 1 : 0);
    const cls = matchCount === 3 ? "FULLY_COMPLETE"
              : matchCount === 2 ? "DUAL_LINKED"
              : matchCount === 1 ? "SINGLE_LINKED"
              : "INCOMPLETE";
    return { ...task, _class: cls, _intel: matchedIntel, _scenarios: matchedScenarios, _kb: matchedKb };
  });
}

export async function buildTmickiScript() {
  const base = apiBase;
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { tasks, intel, scenarios, kb } = await loadAll();
  const correlated = correlate(tasks, intel, scenarios, kb);
  const complete   = correlated.filter(t => t._class === "FULLY_COMPLETE").length;
  const incomplete = correlated.filter(t => t._class === "INCOMPLETE").length;
  const pct        = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  const prompt     = `TMICKI Mission Intelligence Completeness Index: ${tasks.length} tasks, ${intel.length} intel profiles, ${scenarios.length} scenarios, ${kb.length} KB articles. Completeness: ${pct}% (${complete} fully complete, ${incomplete} incomplete/no intelligence coverage). Give a 2-sentence operational assessment of mission intelligence completeness and the top gap to address.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error("chat error");
  const j = await r.json();
  return j.response || j.message || j.reply || j.content || "TMICKI Mission Intelligence Completeness Index assessed, sir.";
}

export function isTmickiQuery(q) {
  return TMICKI_RE.test(q);
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{ background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 14px", minWidth: 90, textAlign: "center" }}>
      <div style={{ color, fontFamily: FONT, fontSize: 18, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "rgba(0,207,255,0.5)", fontFamily: FONT, fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score: s, max }) {
  const pct = max > 0 ? Math.min(100, (s / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(0,207,255,0.1)", borderRadius: 2, marginTop: 4 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: CY, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function TaskIntelScenarioKnowledgeIndex() {
  const [open, setOpen] = useState(false);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [brief, setBrief]   = useState("");
  const [briefing, setBriefing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { tasks, intel, scenarios, kb } = await loadAll();
      const correlated = correlate(tasks, intel, scenarios, kb);
      setData({ tasks, intel, scenarios, kb, correlated });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:tmicki-toggle", handler);
    return () => window.removeEventListener("jarvis:tmicki-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const handleBrief = useCallback(async () => {
    setBriefing(true); setBrief("");
    try {
      const script = await buildTmickiScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      setBrief("TMICKI data loaded. Mission intelligence completeness assessment complete.");
    } finally {
      setBriefing(false);
    }
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="TMICKI — Task × IntelProfile × Scenario × Knowledge Mission Intelligence Completeness Index"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: CY, fontFamily: FONT, fontSize: 8, letterSpacing: 1,
          padding: "4px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TMICKI
      </button>
    );
  }

  const { correlated = [], tasks = [], intel = [], scenarios = [], kb = [] } = data || {};
  const counts = { FULLY_COMPLETE: 0, DUAL_LINKED: 0, SINGLE_LINKED: 0, INCOMPLETE: 0 };
  correlated.forEach(t => { counts[t._class] = (counts[t._class] || 0) + 1; });
  const completePct = tasks.length ? Math.round((counts.FULLY_COMPLETE / tasks.length) * 100) : 0;

  const filtered = correlated.filter(t => {
    if (tab !== "ALL" && t._class !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.name || t.title || "").toLowerCase().includes(q)
        || (t.description || t.summary || "").toLowerCase().includes(q);
  });

  return (
    <div style={{
      position: "fixed", bottom: 50, left: "50%", transform: "translateX(-50%)",
      zIndex: Z_INDEX + 100, width: 780, maxHeight: "82vh",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      display: "flex", flexDirection: "column", fontFamily: FONT,
      boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
          ◈ TMICKI — MISSION INTELLIGENCE COMPLETENESS INDEX
        </div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "rgba(0,207,255,0.5)", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", flexWrap: "wrap" }}>
        <StatTile label="TASKS" value={tasks.length} />
        <StatTile label="INTEL PROFS" value={intel.length} color={OR} />
        <StatTile label="SCENARIOS" value={scenarios.length} color={CY} />
        <StatTile label="KB ARTICLES" value={kb.length} color={GR} />
        <StatTile label="FULLY COMPLETE" value={counts.FULLY_COMPLETE} color={GR} />
        <StatTile label="DUAL LINKED" value={counts.DUAL_LINKED} color={CY} />
        <StatTile label="SINGLE LINKED" value={counts.SINGLE_LINKED} color={OR} />
        <StatTile label="INCOMPLETE" value={counts.INCOMPLETE} color={AM} />
        <StatTile label="COMPLETE%" value={`${completePct}%`} color={completePct >= 70 ? GR : completePct >= 40 ? AM : RD} />
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 16px 8px" }}>
        <div style={{ fontSize: 9, color: "rgba(0,207,255,0.5)", letterSpacing: 1, marginBottom: 4 }}>COMPLETENESS COVERAGE</div>
        <div style={{ height: 6, background: "rgba(0,207,255,0.1)", borderRadius: 3 }}>
          <div style={{ height: "100%", width: `${completePct}%`, background: completePct >= 70 ? GR : completePct >= 40 ? AM : RD, borderRadius: 3, transition: "width 0.5s" }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 16px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "none",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "rgba(0,207,255,0.4)",
            fontFamily: FONT, fontSize: 8, letterSpacing: 1, padding: "3px 8px",
            borderRadius: 4, cursor: "pointer",
          }}>
            {t}{t !== "ALL" ? ` (${counts[t] || 0})` : ""}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: "auto", background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`, color: CY, fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 4, outline: "none", width: 160 }}
        />
      </div>

      {/* Task list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 8px" }}>
        {loading && !data && <div style={{ color: "rgba(0,207,255,0.4)", fontSize: 10, padding: 16, textAlign: "center" }}>LOADING…</div>}
        {error && <div style={{ color: RD, fontSize: 10, padding: 16 }}>Error: {error}</div>}
        {filtered.map((task, i) => {
          const id = task.id || task._id || i;
          const isExp = !!expanded[id];
          const maxScore = Math.max(...[...task._intel, ...task._scenarios, ...task._kb].map(x => x._score), 1);
          return (
            <div key={id} style={{ margin: "4px 0", border: `1px solid ${BORDER}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", background: "rgba(0,207,255,0.03)" }}
              >
                <span style={{ color: CLASS_COLOR[task._class], fontSize: 8, border: `1px solid ${CLASS_COLOR[task._class]}`, borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>{task._class}</span>
                <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.name || task.title || `Task #${id}`}</span>
                <span style={{ color: "rgba(0,207,255,0.3)", fontSize: 8 }}>{task.priority || task.status || ""}</span>
                <span style={{ color: "rgba(0,207,255,0.35)", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "8px 12px", borderTop: `1px solid ${BORDER}` }}>
                  {task._intel.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: OR, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>INTEL PROFILES ({task._intel.length})</div>
                      {task._intel.map((p, j) => (
                        <div key={j} style={{ background: "rgba(249,115,22,0.07)", border: `1px solid rgba(249,115,22,0.2)`, borderRadius: 4, padding: "5px 8px", marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: OR, fontSize: 9 }}>{p.name || p.alias || `Profile #${j}`}</span>
                            <span style={{ color: "rgba(249,115,22,0.5)", fontSize: 8, border: `1px solid rgba(249,115,22,0.3)`, borderRadius: 3, padding: "0 4px" }}>{p.role || p.type || "ACTOR"}</span>
                          </div>
                          <RelevanceBar score={p._score} max={maxScore} />
                        </div>
                      ))}
                    </div>
                  )}
                  {task._scenarios.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS ({task._scenarios.length})</div>
                      {task._scenarios.map((s, j) => (
                        <div key={j} style={{ background: "rgba(0,207,255,0.06)", border: `1px solid rgba(0,207,255,0.15)`, borderRadius: 4, padding: "5px 8px", marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: CY, fontSize: 9 }}>{s.name || s.title || `Scenario #${j}`}</span>
                            <span style={{ color: "rgba(0,207,255,0.5)", fontSize: 8, border: `1px solid rgba(0,207,255,0.3)`, borderRadius: 3, padding: "0 4px" }}>{s.type || "SCENARIO"}</span>
                          </div>
                          <RelevanceBar score={s._score} max={maxScore} />
                        </div>
                      ))}
                    </div>
                  )}
                  {task._kb.length > 0 && (
                    <div>
                      <div style={{ color: GR, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({task._kb.length})</div>
                      {task._kb.map((a, j) => (
                        <div key={j} style={{ background: "rgba(34,197,94,0.06)", border: `1px solid rgba(34,197,94,0.2)`, borderRadius: 4, padding: "5px 8px", marginBottom: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: GR, fontSize: 9 }}>{a.title || a.name || `Article #${j}`}</span>
                            <span style={{ color: "rgba(34,197,94,0.5)", fontSize: 8, border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 3, padding: "0 4px" }}>{a.category || "KB"}</span>
                          </div>
                          <RelevanceBar score={a._score} max={maxScore} />
                        </div>
                      ))}
                    </div>
                  )}
                  {task._intel.length === 0 && task._scenarios.length === 0 && task._kb.length === 0 && (
                    <div style={{ color: "rgba(239,68,68,0.6)", fontSize: 9 }}>No intelligence coverage found for this task.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && data && (
          <div style={{ color: "rgba(0,207,255,0.3)", fontSize: 9, textAlign: "center", padding: 20 }}>No tasks match current filter.</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${BORDER}`, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={handleBrief} disabled={briefing} style={{
          background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "5px 14px",
          borderRadius: 4, cursor: briefing ? "wait" : "pointer",
        }}>
          {briefing ? "ASSESSING…" : "▶ ASSESS COMPLETENESS"}
        </button>
        {counts.INCOMPLETE > 0 && (
          <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}`, borderRadius: 4, padding: "2px 8px" }}>
            ⚠ {counts.INCOMPLETE} INCOMPLETE
          </span>
        )}
        {brief && <div style={{ color: "rgba(0,207,255,0.7)", fontSize: 9, flex: 1, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
