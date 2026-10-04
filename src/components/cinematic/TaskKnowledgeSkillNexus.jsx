/**
 * F233 — Task × Knowledge × AIP Skill Operational Readiness Coverage Nexus (ORCNEX)
 *
 * Parallel-fetches /entities/Task + /knowledge/ + /v1/aip/skill
 * and keyword-correlates each Task against KB articles AND AIP skills:
 *
 *   FULLY_SUPPORTED  — matched KB article + AIP skill (full operational coverage)
 *   SKILL_GUIDED     — matched AIP skill only (no KB backing)
 *   KB_ONLY          — matched KB article only (no AIP skill)
 *   UNSUPPORTED      — no matches (operational readiness gap)
 *
 * Stat tiles: TASKS / KB ARTICLES / AIP SKILLS + four class counts + SUPPORTED%.
 * Amber badge on UNSUPPORTED count.
 * Filter tabs ALL / FULLY_SUPPORTED / SKILL_GUIDED / KB_ONLY / UNSUPPORTED + text search.
 * Expand task → matched KB article cards (green) + matched AIP skill cards (cyan).
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:orcnex-toggle event.
 *
 * Voice triggers:
 *   "orcnex / task operational readiness / unsupported tasks / task knowledge skill /
 *    task skill coverage / knowledge skill task / operational readiness nexus"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_071_720;
const Z_INDEX  = 292;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ORCNEX_RE = /\b(orcnex|task[\s-]operational[\s-]readiness|unsupported[\s-]tasks?|task[\s-]knowledge[\s-]skill|task[\s-]skill[\s-]coverage|knowledge[\s-]skill[\s-]task|operational[\s-]readiness[\s-]nexus|task[\s-]readiness[\s-]coverage)\b/i;

export function isOrcnexQuery(q = "") { return ORCNEX_RE.test(q); }

export async function buildOrcnexScript() {
  const base = apiBase();
  const [tR, kR, sR] = await Promise.allSettled([
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
  ]);
  const tasks   = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.tasks || tR.value || []) : [];
  const articles = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
  const skills  = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.skills || sR.value || []) : [];

  let fullSupported = 0, unsupported = 0;
  for (const t of tasks) {
    const kws = keywords(taskText(t));
    const hasK = articles.some(a => scoreText(articleText(a), kws) > 0);
    const hasS = skills.some(s => scoreText(skillText(s), kws) > 0);
    if (hasK && hasS) fullSupported++;
    else if (!hasK && !hasS) unsupported++;
  }
  const total = tasks.length;
  const pct   = total ? Math.round((fullSupported / total) * 100) : 0;
  return `ORCNEX Operational Readiness Coverage Nexus online, sir. I have cross-referenced ${total} active tasks against ${articles.length} knowledge articles and ${skills.length} AIP skills. ${fullSupported} tasks are fully supported with both knowledge backing and a deployed AIP skill, representing ${pct}% operational readiness coverage. ${unsupported} tasks are completely unsupported with neither matching knowledge articles nor active skills — these represent critical operational readiness gaps requiring immediate assignment, sir.`;
}

const CY   = "#00CFFF";
const GR   = "#22C55E";
const AM   = "#F59E0B";
const PU   = "#A78BFA";
const TE   = "#2DD4BF";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_SUPPORTED: GR,
  SKILL_GUIDED:    CY,
  KB_ONLY:         TE,
  UNSUPPORTED:     AM,
};

const TABS = ["ALL", "FULLY_SUPPORTED", "SKILL_GUIDED", "KB_ONLY", "UNSUPPORTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.reduce((n, w) => n + (h.includes(w) ? 1 : 0), 0);
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.status, ...(t.tags || [])].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.title, a.name, a.content, a.summary, a.category, ...(a.tags || [])].filter(Boolean).join(" ");
}
function skillText(s) {
  return [s.name, s.title, s.description, s.type, s.category, ...(s.tags || [])].filter(Boolean).join(" ");
}

function classify(task, articles, skills) {
  const kws = keywords(taskText(task));
  const matchedKB = articles
    .map(a => ({ ...a, _score: scoreText(articleText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedSkills = skills
    .map(s => ({ ...s, _score: scoreText(skillText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasK = matchedKB.length > 0;
  const hasS = matchedSkills.length > 0;
  let cls;
  if (hasK && hasS)       cls = "FULLY_SUPPORTED";
  else if (!hasK && hasS) cls = "SKILL_GUIDED";
  else if (hasK && !hasS) cls = "KB_ONLY";
  else                    cls = "UNSUPPORTED";

  return { ...task, _cls: cls, _k: matchedKB, _s: matchedSkills };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 9, background: "transparent",
    border: `1px solid ${col}66`, color: col, padding: "2px 6px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2840", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: col, borderRadius: 2, transition: "width 0.3s" }} />
    </div>
  );
}

export default function TaskKnowledgeSkillNexus() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [tasks, setTasks]       = useState([]);
  const [articles, setArticles] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const [tR, kR, sR] = await Promise.allSettled([
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`).then(r => r.json()),
      ]);
      const t = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.tasks || tR.value || []) : [];
      const k = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
      const s = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.skills || sR.value || []) : [];
      setTasks(t);
      setArticles(k);
      setSkills(s);
      setClassified(t.map(task => classify(task, k, s)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:orcnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:orcnex-toggle", onToggle);
  }, []);

  const fullSupported  = classified.filter(c => c._cls === "FULLY_SUPPORTED").length;
  const skillGuided    = classified.filter(c => c._cls === "SKILL_GUIDED").length;
  const kbOnly         = classified.filter(c => c._cls === "KB_ONLY").length;
  const unsupported    = classified.filter(c => c._cls === "UNSUPPORTED").length;
  const total          = classified.length;
  const supportedPct   = total ? Math.round((fullSupported / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || taskText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `ORCNEX: ${total} tasks — FULLY_SUPPORTED: ${fullSupported}, SKILL_GUIDED: ${skillGuided}, KB_ONLY: ${kbOnly}, UNSUPPORTED: ${unsupported} (${supportedPct}% full coverage). KB Articles: ${articles.length}. AIP Skills: ${skills.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `ORCNEX operational readiness coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which unsupported tasks represent the highest-priority operational readiness gaps with no knowledge backing or AIP skills, and what immediate actions should close these gaps. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || d?.text || JSON.stringify(d);
      setBrief(txt);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }).catch(() => {});
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, background: "rgba(0,207,255,0.07)",
          border: "1px solid #00CFFF44", color: CY, padding: "3px 8px",
          borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
        title="Task × Knowledge × AIP Skill Operational Readiness Coverage Nexus"
      >
        {unsupported > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 2, padding: "0 4px", marginRight: 4, fontSize: 8 }}>
            {unsupported}
          </span>
        )}
        ◈ ORCNEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: BTN_LEFT - 400, zIndex: Z_INDEX,
      width: 560, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: "1px solid #00CFFF33", borderRadius: 6,
      fontFamily: FONT, color: CY, fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #00CFFF22", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 10, letterSpacing: 1 }}>◈ ORCNEX — TASK × KNOWLEDGE × AIP SKILL</span>
        <button onClick={load} style={smallBtn(CY)} disabled={loading}>{loading ? "…" : "↻"}</button>
        <button onClick={() => setOpen(false)} style={smallBtn("#EF4444")}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
        {[
          ["TASKS", total, CY],
          ["KB ARTICLES", articles.length, GR],
          ["AIP SKILLS", skills.length, PU],
          ["FULLY SUPPORTED", fullSupported, GR],
          ["SKILL GUIDED", skillGuided, CY],
          ["KB ONLY", kbOnly, TE],
          ["UNSUPPORTED", unsupported, AM],
          ["SUPPORTED", supportedPct + "%", supportedPct > 60 ? GR : supportedPct > 30 ? AM : "#EF4444"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#0A1628", border: `1px solid ${col}33`, borderRadius: 4, padding: "4px 8px", minWidth: 70, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: "#4A7A9B", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...smallBtn(tab === t ? CLASS_COLOR[t] || CY : "#4A7A9B"),
              background: tab === t ? (CLASS_COLOR[t] || CY) + "22" : "transparent",
              fontSize: 9,
            }}
          >
            {t.replace(/_/g, " ")} {t !== "ALL" && classified.filter(c => c._cls === t).length > 0 ? `(${classified.filter(c => c._cls === t).length})` : ""}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          style={{
            width: "100%", background: "#0A1628", border: "1px solid #00CFFF22",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: "#EF4444", fontSize: 9, padding: "0 12px 6px" }}>Error: {error}</div>
      )}

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#4A7A9B", fontSize: 10, textAlign: "center", padding: 16 }}>No tasks found.</div>
        )}
        {visible.map((task, idx) => {
          const col  = CLASS_COLOR[task._cls] || CY;
          const key  = task.id || task.name || idx;
          const isEx = expanded === key;
          return (
            <div
              key={key}
              style={{ borderBottom: "1px solid #0A1628", padding: "6px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isEx ? null : key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: col, fontSize: 9, minWidth: 130 }}>{task._cls.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#E0F0FF", fontSize: 10 }}>{task.name || task.title || "(unnamed task)"}</span>
                {task.status && <span style={{ color: "#4A7A9B", fontSize: 9 }}>{task.status}</span>}
                <span style={{ color: "#4A7A9B", fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>
              {task.type && (
                <div style={{ color: "#4A7A9B", fontSize: 9, marginTop: 1, paddingLeft: 136 }}>{task.type}</div>
              )}

              {isEx && (
                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                  {/* KB Article matches */}
                  {task._k.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 4 }}>KB ARTICLES ({task._k.length})</div>
                      {task._k.map((a, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${GR}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: GR, fontSize: 9, flex: 1 }}>{a.title || a.name || "(article)"}</span>
                            {a.category && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{a.category}</span>}
                          </div>
                          <RelevanceBar score={a._score} max={task._k[0]?._score || 1} col={GR} />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* AIP Skill matches */}
                  {task._s.length > 0 && (
                    <div>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 4 }}>AIP SKILLS ({task._s.length})</div>
                      {task._s.map((s, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${PU}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: PU, fontSize: 9, flex: 1 }}>{s.name || s.title || "(skill)"}</span>
                            {s.type && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{s.type}</span>}
                          </div>
                          <RelevanceBar score={s._score} max={task._s[0]?._score || 1} col={PU} />
                        </div>
                      ))}
                    </div>
                  )}
                  {task._k.length === 0 && task._s.length === 0 && (
                    <div style={{ color: AM, fontSize: 9 }}>No KB article or AIP skill matches — task is operationally unsupported.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess + brief */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #00CFFF22" }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            ...smallBtn(CY),
            background: assessing ? "#0A1628" : "rgba(0,207,255,0.12)",
            fontSize: 10, width: "100%",
          }}
        >
          {assessing ? "▷ ASSESSING…" : "▶ ASSESS READINESS"}
        </button>
        {brief && (
          <div style={{ marginTop: 8, color: "#A0D0E8", fontSize: 9, lineHeight: 1.5, background: "#0A1628", borderRadius: 3, padding: "6px 8px" }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
