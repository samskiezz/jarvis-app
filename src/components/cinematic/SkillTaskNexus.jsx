/**
 * SkillTaskNexus — F517
 * "JARVIS, skill task / stask / task skill / which tasks have skill /
 *  skill-backed tasks / unskilled tasks / skill coverage task / task skill coverage"
 * Cross-references /v1/aip/skill + /entities/Task.
 * Finds BACKED tasks (≥1 skill keyword-matches) vs UNSKILLED (no skill backing).
 * Coverage % tile; ALL/BACKED/UNSKILLED filter tabs + search; click-to-expand skills.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 35_860;
const Z_INDEX  = 100;

const STASK_RE =
  /\bstask\b|\bskill.?task\b|\btask.?skill\b|\bskill.?backed.?task\b|\bunskilled.?task\b|\btask.?skill.?coverage\b|\bskill.?coverage.?task\b|\bwhich.?tasks.?have.?skill\b|\btask.?capability\b/i;

export function isStaskQuery(text) {
  return STASK_RE.test(text || "");
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
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:          t.id || `task-${i}`,
    name:        t.name || t.title || t.label || `Task ${i + 1}`,
    status:      (t.status || "PENDING").toUpperCase(),
    description: t.description || t.notes || null,
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : String(t.tags || ""),
  }));
}

function normaliseSkills(data) {
  if (!data) return [];
  const raw =
    data.skills || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:     s.id || `skill-${i}`,
    name:   s.name || s.skill || s.title || `Skill ${i + 1}`,
    domain: (s.domain || s.category || s.type || "GENERAL").toUpperCase(),
    score:  typeof s.score === "number" ? s.score : (typeof s.proficiency === "number" ? s.proficiency : null),
    tags:   Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

function crossRef(tasks, skills) {
  return tasks.map((task) => {
    const haystack = `${task.name} ${task.description || ""} ${task.tags}`;
    const matches = skills
      .map((sk) => ({
        sk,
        hits: overlap(haystack, `${sk.name} ${sk.domain} ${sk.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...task,
      backed:  matches.length > 0,
      matches: matches.map(({ sk, hits }) => ({ ...sk, hits })),
    };
  });
}

// ─── buildStaskScript (for JarvisBrain) ──────────────────────────────────────

export async function buildStaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, skillRes] = await Promise.all([
      fetch(`${base}/entities/Task`,    { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,     { headers: hdr }),
    ]);
    const taskData  = taskRes.ok  ? await taskRes.json()  : {};
    const skillData = skillRes.ok ? await skillRes.json() : {};

    const tasks  = normaliseTasks(taskData);
    const skills = normaliseSkills(skillData);
    const crossed = crossRef(tasks, skills);

    const total    = crossed.length;
    const backed   = crossed.filter((t) => t.backed).length;
    const unskilled = total - backed;
    const coverage = total > 0 ? Math.round((backed / total) * 100) : 0;

    const topUnskilled = crossed
      .filter((t) => !t.backed)
      .slice(0, 3)
      .map((t) => t.name)
      .join(", ");

    const brief =
      `${coverage}% of ${total} tasks have skill backing. ` +
      `${backed} BACKED, ${unskilled} UNSKILLED.` +
      (topUnskilled ? ` Key unskilled tasks: ${topUnskilled}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Skill × Task Coverage: ${brief} Provide a 2-sentence operational capability assessment.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Skill × Task Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  DONE:        "#00E5A0",
  COMPLETE:    "#00E5A0",
  COMPLETED:   "#00E5A0",
  IN_PROGRESS: "#29E7FF",
  ACTIVE:      "#29E7FF",
  PENDING:     "#FFA500",
  BLOCKED:     "#FF4466",
  FAILED:      "#FF4466",
};

const DOMAIN_COLOR = {
  SECURITY:    "#FF4466",
  CYBER:       "#29E7FF",
  INTEL:       "#00E5A0",
  OPS:         "#FFA500",
  FINANCIAL:   "#A0C4FF",
  RESEARCH:    "#B0FFA0",
  ANALYSIS:    "#C8A0FF",
  GENERAL:     "#8899AA",
};

export default function SkillTaskNexus() {
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
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, skillRes] = await Promise.all([
        fetch(`${base}/entities/Task`,  { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,   { headers: hdr }),
      ]);
      const taskData  = taskRes.ok  ? await taskRes.json()  : {};
      const skillData = skillRes.ok ? await skillRes.json() : {};

      const tasks  = normaliseTasks(taskData);
      const skills = normaliseSkills(skillData);
      setCrossed(crossRef(tasks, skills));
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
    window.addEventListener("jarvis:stask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:stask-toggle", onToggle);
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
      const base     = apiBase();
      const hdr      = { Authorization: `Bearer ${API_KEY}` };
      const total    = crossed.length;
      const backed   = crossed.filter((t) => t.backed).length;
      const unskilled = total - backed;
      const coverage = total > 0 ? Math.round((backed / total) * 100) : 0;
      const prompt =
        `Skill × Task Coverage: ${coverage}% (${backed}/${total} backed, ${unskilled} unskilled). Assess operational capability in 2 sentences.`;

      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d    = res.ok ? await res.json() : {};
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

  const visible = crossed.filter((task) => {
    if (tab === "BACKED"    && !task.backed) return false;
    if (tab === "UNSKILLED" &&  task.backed) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !task.name.toLowerCase().includes(q) &&
        !(task.description || "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const total     = crossed.length;
  const nBacked   = crossed.filter((t) => t.backed).length;
  const nUnskilled = total - nBacked;
  const coverage  = total > 0 ? Math.round((nBacked / total) * 100) : 0;

  const btnStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: Z_INDEX,
    background: "rgba(0,0,0,0.85)",
    border: `1px solid ${nUnskilled > 0 ? AMB : CY}`,
    color: nUnskilled > 0 ? AMB : CY,
    fontFamily: "monospace",
    fontSize: 10,
    padding: "3px 8px",
    cursor: "pointer",
    borderRadius: 3,
    display: "flex",
    alignItems: "center",
    gap: 4,
  };

  const panelStyle = {
    position: "fixed",
    right: 8,
    top: 60,
    width: 380,
    maxHeight: "80vh",
    overflowY: "auto",
    background: "rgba(0,8,20,0.97)",
    border: `1px solid ${CY}`,
    borderRadius: 6,
    zIndex: Z_INDEX + 1,
    fontFamily: "monospace",
    fontSize: 11,
    color: CY,
    padding: 12,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((v) => !v)}>
        ◈ STASK
        {nUnskilled > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>
            {nUnskilled}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontWeight: "bold", fontSize: 12 }}>⬡ SKILL × TASK NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >
              ✕
            </button>
          </div>

          {/* coverage tile */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, background: "rgba(0,229,160,0.08)", border: `1px solid ${GRN}44`, borderRadius: 4, padding: "6px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, color: GRN, fontWeight: "bold" }}>{coverage}%</div>
              <div style={{ fontSize: 9, color: DIM }}>COVERAGE</div>
            </div>
            <div style={{ flex: 1, background: "rgba(41,231,255,0.08)", border: `1px solid ${CY}44`, borderRadius: 4, padding: "6px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, color: CY, fontWeight: "bold" }}>{nBacked}</div>
              <div style={{ fontSize: 9, color: DIM }}>BACKED</div>
            </div>
            <div style={{ flex: 1, background: "rgba(255,165,0,0.08)", border: `1px solid ${AMB}44`, borderRadius: 4, padding: "6px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 18, color: AMB, fontWeight: "bold" }}>{nUnskilled}</div>
              <div style={{ fontSize: 9, color: DIM }}>UNSKILLED</div>
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "BACKED", "UNSKILLED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "3px 0",
                  fontSize: 9,
                  fontFamily: "monospace",
                  background: tab === t ? CY : "transparent",
                  color: tab === t ? "#000" : DIM,
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search tasks..."
            style={{
              width: "100%",
              marginBottom: 8,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}44`,
              borderRadius: 3,
              color: CY,
              fontFamily: "monospace",
              fontSize: 10,
              padding: "4px 8px",
              boxSizing: "border-box",
            }}
          />

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing || crossed.length === 0}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: "4px 0",
              fontSize: 10,
              fontFamily: "monospace",
              background: assessing ? "transparent" : `${GRN}22`,
              color: GRN,
              border: `1px solid ${GRN}`,
              borderRadius: 3,
              cursor: assessing ? "not-allowed" : "pointer",
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>

          {brief && (
            <div style={{ fontSize: 9, color: GRN, background: `${GRN}11`, border: `1px solid ${GRN}44`, borderRadius: 3, padding: "6px 8px", marginBottom: 8, whiteSpace: "pre-wrap" }}>
              {brief}
            </div>
          )}

          {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 8 }}>LOADING…</div>}

          {!loading && visible.length === 0 && (
            <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 8 }}>No tasks match.</div>
          )}

          {/* task list */}
          {visible.map((task) => (
            <div
              key={task.id}
              style={{
                marginBottom: 4,
                border: `1px solid ${task.backed ? GRN : AMB}33`,
                borderRadius: 3,
                background: task.backed ? "rgba(0,229,160,0.04)" : "rgba(255,165,0,0.04)",
                padding: "4px 6px",
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              >
                <span style={{ fontSize: 9, color: STATUS_COLOR[task.status] || DIM, minWidth: 72 }}>
                  {task.status}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: task.backed ? GRN : DIM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.name}
                </span>
                {task.backed ? (
                  <span style={{ fontSize: 8, color: GRN }}>⬡ {task.matches.length} skill{task.matches.length !== 1 ? "s" : ""}</span>
                ) : (
                  <span style={{ fontSize: 8, color: AMB }}>UNSKILLED</span>
                )}
              </div>

              {expanded === task.id && task.backed && (
                <div style={{ marginLeft: 12, marginTop: 4 }}>
                  {task.description && (
                    <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>{task.description}</div>
                  )}
                  {task.matches.map((sk) => (
                    <div
                      key={sk.id}
                      style={{
                        padding: "3px 6px",
                        marginBottom: 2,
                        borderRadius: 2,
                        background: "rgba(41,231,255,0.05)",
                        border: `1px solid ${DOMAIN_COLOR[sk.domain] || DIM}33`,
                        fontSize: 9,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ color: DOMAIN_COLOR[sk.domain] || DIM, minWidth: 60 }}>[{sk.domain}]</span>
                      <span style={{ color: CY, flex: 1 }}>{sk.name}</span>
                      {sk.score !== null && (
                        <span style={{ color: GRN, fontSize: 8 }}>score:{sk.score}</span>
                      )}
                      <span style={{ color: DIM, fontSize: 8 }}>hits:{sk.hits}</span>
                    </div>
                  ))}
                </div>
              )}

              {expanded === task.id && !task.backed && (
                <div style={{ marginLeft: 12, marginTop: 4, fontSize: 9, color: DIM }}>
                  No skill domains cover this task.
                  {task.description && <div style={{ marginTop: 2 }}>{task.description}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
