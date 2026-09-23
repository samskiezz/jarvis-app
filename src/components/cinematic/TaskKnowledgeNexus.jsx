/**
 * TaskKnowledgeNexus — F617
 * "JARVIS, task knowledge / knowledge tasks / tskknow / task documentation / documented tasks / undocumented tasks"
 * Cross-references /entities/Task + /knowledge/.
 * Finds DOCUMENTED tasks (≥1 knowledge article keyword-matches) vs UNDOCUMENTED (no knowledge backing).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched articles.
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
const BTN_LEFT = 95_060;
const Z_INDEX  = 169;

const TSKKNOW_RE =
  /\btskknow\b|\btask.?knowledge\b|\bknowledge.?task\b|\btask.?documentation\b|\bdocumented.?task\b|\bundocumented.?task\b|\bwhich.?task\w*.?have.?knowledge\b|\btask.?knowledge.?gap\b|\bknowledge.?backed.?task\b/i;

export function isTskknowQuery(text) {
  return TSKKNOW_RE.test(text || "");
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

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)
    ? raw.tasks
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.items)
    ? raw.items
    : [];
  return arr.map((t, i) => ({
    id:          t.id          || t.task_id    || String(i),
    title:       t.title       || t.name       || t.summary || `Task ${i + 1}`,
    status:      (t.status     || t.state      || "UNKNOWN").toString().toUpperCase(),
    priority:    (t.priority   || t.urgency    || "NORMAL").toString().toUpperCase(),
    description: (t.description || t.detail    || t.body || "").toString().slice(0, 300),
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.notes)
    ? raw.notes
    : [];
  return arr.map((a, i) => ({
    id:      a.id    || a.slug   || String(i),
    title:   a.title || a.name   || a.heading || `Article ${i + 1}`,
    kind:    (a.kind || a.type   || a.category || "ARTICLE").toString().toUpperCase(),
    summary: (a.summary || a.content || a.body || a.description || "").toString().slice(0, 200),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function crossRef(tasks, articles) {
  return tasks.map((task) => {
    const haystack = `${task.title} ${task.description} ${task.tags} ${task.status}`;
    const matches = articles
      .map((art) => ({
        art,
        hits: overlap(haystack, `${art.title} ${art.summary} ${art.kind} ${art.tags}`),
      }))
      .filter(({ hits }) => hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return {
      ...task,
      documented: matches.length > 0,
      matches: matches.map(({ art, hits }) => ({ ...art, hits })),
    };
  });
}

// ─── buildTskknowScript (for JarvisBrain) ────────────────────────────────────

export async function buildTskknowScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, knowRes] = await Promise.all([
      fetch(`${base}/entities/Task`,  { headers: hdr }),
      fetch(`${base}/knowledge/`,     { headers: hdr }),
    ]);
    const taskData = taskRes.ok ? await taskRes.json() : {};
    const knowData = knowRes.ok ? await knowRes.json() : {};

    const tasks    = normaliseTasks(taskData);
    const articles = normaliseArticles(knowData);
    const crossed  = crossRef(tasks, articles);

    const total        = crossed.length;
    const documented   = crossed.filter((t) => t.documented).length;
    const undocumented = total - documented;
    const coverage     = total > 0 ? Math.round((documented / total) * 100) : 0;
    const topUndoc     = crossed
      .filter((t) => !t.documented)
      .slice(0, 2)
      .map((t) => t.title)
      .join(", ");

    const brief =
      `${coverage}% of ${total} tasks have knowledge article backing. ` +
      `${documented} DOCUMENTED, ${undocumented} UNDOCUMENTED.` +
      (topUndoc ? ` Top undocumented: ${topUndoc}.` : "");

    const agentRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Task × Knowledge Nexus: ${brief} Provide a 2-sentence assessment of the task knowledge coverage and which gaps to prioritise.`,
      }),
    });
    const agentData = agentRes.ok ? await agentRes.json() : {};
    const agentText = agentData.response || agentData.message || agentData.reply || "";

    return agentText ? `${brief}\n\n${agentText}` : brief;
  } catch (err) {
    return `Task × Knowledge Nexus unavailable: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  DONE: GRN, COMPLETE: GRN, COMPLETED: GRN,
  IN_PROGRESS: CY, ACTIVE: CY, RUNNING: CY,
  BLOCKED: "#FF4444",
  PENDING: AMB, TODO: AMB,
};

export default function TaskKnowledgeNexus() {
  const [open, setOpen]         = useState(false);
  const [crossed, setCrossed]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, knowRes] = await Promise.all([
        fetch(`${base}/entities/Task`, { headers: hdr }),
        fetch(`${base}/knowledge/`,    { headers: hdr }),
      ]);
      const taskData = taskRes.ok ? await taskRes.json() : {};
      const knowData = knowRes.ok ? await knowRes.json() : {};
      const tasks    = normaliseTasks(taskData);
      const articles = normaliseArticles(knowData);
      setCrossed(crossRef(tasks, articles));
    } catch (_) {
      // silent — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => { setOpen((o) => !o); load(); };
    window.addEventListener("jarvis:tskknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tskknow-toggle", onToggle);
  }, [load]);

  const assess = useCallback(async () => {
    setAssess(true);
    try {
      const result = await buildTskknowScript();
      setBrief(result);
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...hdr, "Content-Type": "application/json" },
        body: JSON.stringify({ text: result.slice(0, 400) }),
      });
    } catch (_) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssess(false);
    }
  }, []);

  const documented   = crossed.filter((t) => t.documented).length;
  const undocumented = crossed.length - documented;
  const coverage     = crossed.length > 0 ? Math.round((documented / crossed.length) * 100) : 0;

  const visible = crossed.filter((t) => {
    if (tab === "DOCUMENTED"   && !t.documented) return false;
    if (tab === "UNDOCUMENTED" &&  t.documented) return false;
    if (query) {
      const q = query.toLowerCase();
      return t.title.toLowerCase().includes(q) || t.status.toLowerCase().includes(q);
    }
    return true;
  });

  const panelStyle = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 50,
    width: 340,
    maxHeight: 520,
    background: "rgba(0,8,20,0.97)",
    border: `1px solid ${CY}44`,
    borderRadius: 6,
    zIndex: Z_INDEX,
    display: "flex",
    flexDirection: "column",
    fontFamily: "monospace",
    overflow: "hidden",
  };

  return (
    <>
      {/* Dock button */}
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: undocumented > 0 ? "rgba(255,165,0,0.12)" : "rgba(0,8,20,0.85)",
          border: `1px solid ${undocumented > 0 ? AMB : DIM}55`,
          borderRadius: 4,
          color: undocumented > 0 ? AMB : DIM,
          fontSize: 9,
          padding: "3px 6px",
          cursor: "pointer",
          fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TSKKNOW{undocumented > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMB,
            color: "#000",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: 8,
          }}>{undocumented}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{
            padding: "8px 10px 6px",
            borderBottom: `1px solid ${CY}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: 700, flex: 1 }}>
              ◈ TASK × KNOWLEDGE
            </span>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.12)",
                border: `1px solid ${CY}44`,
                borderRadius: 3,
                color: CY,
                fontSize: 9,
                padding: "2px 6px",
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 12, cursor: "pointer" }}
            >
              ✕
            </button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex",
            gap: 6,
            padding: "6px 10px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              { label: "TASKS",      val: crossed.length, col: CY },
              { label: "DOCUMENTED", val: documented,      col: GRN },
              { label: "UNDOC",      val: undocumented,    col: AMB },
              { label: "COVERAGE",   val: `${coverage}%`,  col: GRN },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1,
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${col}33`,
                borderRadius: 3,
                padding: "4px 3px",
                textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 12, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* AI brief */}
          {brief && (
            <div style={{
              padding: "4px 10px 2px",
              fontSize: 9,
              color: DIM,
              borderBottom: `1px solid ${CY}11`,
              maxHeight: 60,
              overflowY: "auto",
            }}>
              {brief}
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "4px 10px" }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY : DIM}44`,
                  borderRadius: 3,
                  color: tab === t ? CY : DIM,
                  fontSize: 8,
                  padding: "2px 6px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search tasks…"
            style={{
              margin: "0 10px 4px",
              padding: "3px 6px",
              background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`,
              borderRadius: 3,
              color: CY,
              fontSize: 9,
              outline: "none",
              fontFamily: "monospace",
            }}
          />

          {/* Task rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 10px 8px" }}>
            {loading ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>No tasks match.</div>
            ) : (
              visible.map((task) => (
                <div key={task.id}>
                  <div
                    onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 6px",
                      marginBottom: 3,
                      cursor: "pointer",
                      borderRadius: 3,
                      background: "rgba(41,231,255,0.04)",
                      border: `1px solid ${task.documented ? GRN + "44" : AMB + "44"}`,
                    }}
                  >
                    <span style={{
                      fontSize: 8,
                      padding: "1px 4px",
                      borderRadius: 2,
                      background: `${STATUS_COLOR[task.status] || DIM}22`,
                      color: STATUS_COLOR[task.status] || DIM,
                      minWidth: 44,
                      textAlign: "center",
                    }}>
                      {task.status.slice(0, 8)}
                    </span>
                    <span style={{
                      flex: 1,
                      fontSize: 10,
                      color: task.documented ? GRN : AMB,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {task.title}
                    </span>
                    {task.documented ? (
                      <span style={{ fontSize: 8, color: GRN }}>◈ {task.matches.length} art</span>
                    ) : (
                      <span style={{ fontSize: 8, color: AMB }}>UNDOC</span>
                    )}
                  </div>

                  {/* Expanded matched articles */}
                  {expanded === task.id && task.documented && (
                    <div style={{ marginLeft: 12, marginBottom: 6 }}>
                      {task.description && (
                        <div style={{ fontSize: 9, color: DIM, marginBottom: 4 }}>
                          {task.description.slice(0, 120)}
                        </div>
                      )}
                      {task.matches.map((art) => (
                        <div
                          key={art.id}
                          style={{
                            padding: "3px 6px",
                            marginBottom: 2,
                            borderRadius: 2,
                            background: "rgba(0,229,160,0.05)",
                            border: `1px solid ${GRN}33`,
                            fontSize: 9,
                          }}
                        >
                          <span style={{ color: CY, fontSize: 8 }}>[{art.kind.slice(0, 8)}]</span>
                          <span style={{ color: GRN, marginLeft: 4 }}>{art.title}</span>
                          <span style={{ color: DIM, marginLeft: 6 }}>hits:{art.hits}</span>
                          {art.summary && (
                            <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>
                              {art.summary.slice(0, 80)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {expanded === task.id && !task.documented && (
                    <div style={{ marginLeft: 12, marginBottom: 6, fontSize: 9, color: AMB }}>
                      No knowledge articles match this task.
                      {task.description && (
                        <div style={{ color: DIM, marginTop: 2 }}>{task.description.slice(0, 120)}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
