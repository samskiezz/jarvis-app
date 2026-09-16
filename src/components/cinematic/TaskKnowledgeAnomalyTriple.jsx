/**
 * F121 — Task × Knowledge × Anomaly Triple (TKAT)
 *
 * Parallel-fetches /entities/Task, /knowledge/, /v1/jarvis/analytics/anomalies every 90 s.
 * Keyword-correlates each task against KB articles AND active metric anomalies:
 *
 *  FULLY_EXPOSED — task matched by ≥1 KB article AND ≥1 anomaly
 *  KB_ONLY       — task matched by KB article only (no anomaly overlap)
 *  ANOMALY_ONLY  — task matched by anomaly only (no KB coverage)
 *  CLEAR         — no match in either source
 *
 * Stat tiles: tasks / KB articles / anomalies / fully-exposed
 * Amber badge on fully-exposed count.
 * Filter tabs: ALL / FULLY_EXPOSED / KB_ONLY / ANOMALY_ONLY / CLEAR + text search.
 * Expand task → matched KB articles list + matched anomaly rows with |z| bar + relevance score.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TKAT  at left:4080 bottom:18, zIndex:68
 * Event:   jarvis:tkat-toggle
 * Voice:   "task knowledge anomaly / tkat / task anomaly kb / task intel anomaly /
 *           anomalous tasks / which tasks have anomalies / task kb anomaly /
 *           task anomaly exposure / task anomaly coverage"
 * Refresh: 90 s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4444";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4080;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const CLASS_COLOR = {
  FULLY_EXPOSED: RED,
  KB_ONLY:       GREEN,
  ANOMALY_ONLY:  AMBER,
  CLEAR:         MUTED,
};

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map((t, i) => ({
    id:          String(t.id ?? t.task_id ?? i),
    name:        t.name ?? t.title ?? t.summary ?? `Task ${i + 1}`,
    description: t.description ?? t.details ?? t.notes ?? "",
    status:      t.status ?? t.state ?? "",
    priority:    t.priority ?? "",
    tags:        Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? a.description ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseAnomalies(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:          String(a.id ?? a.anomaly_id ?? i),
    metric:      a.metric ?? a.metric_name ?? a.name ?? `Metric ${i + 1}`,
    description: a.description ?? a.details ?? "",
    zscore:      typeof a.zscore === "number" ? a.zscore : parseFloat(a.zscore ?? "0") || 0,
    severity:    a.severity ?? (Math.abs(a.zscore ?? 0) >= 3 ? "HIGH" : "MEDIUM"),
    tags:        Array.isArray(a.tags) ? a.tags : [],
  }));
}

// ─── correlation helpers ──────────────────────────────────────────────────────

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function taskTokens(task) {
  return new Set([
    ...tokenise(task.name),
    ...tokenise(task.description),
    ...tokenise(task.status),
    ...tokenise(task.priority),
    ...task.tags.flatMap(tokenise),
  ]);
}

function correlate(tTokens, items, fieldFn) {
  const matches = [];
  for (const item of items) {
    const iToks = tokenise(fieldFn(item));
    const hits = iToks.filter(t => tTokens.has(t)).length;
    if (hits > 0) matches.push({ ...item, score: hits });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function articleFields(a) {
  return `${a.title} ${a.content} ${a.topic} ${a.tags.join(" ")}`;
}

function anomalyFields(a) {
  return `${a.metric} ${a.description} ${a.tags.join(" ")}`;
}

function classify(kbMatches, anomMatches) {
  const hasKb   = kbMatches.length > 0;
  const hasAnom = anomMatches.length > 0;
  if (hasKb && hasAnom) return "FULLY_EXPOSED";
  if (hasKb)            return "KB_ONLY";
  if (hasAnom)          return "ANOMALY_ONLY";
  return "CLEAR";
}

// ─── exported helpers for JarvisBrain wiring ─────────────────────────────────

export function isTkatQuery(q) {
  return /\b(tkat|task\s*knowledge\s*anomaly|task\s*anomaly\s*kb|task\s*intel\s*anomaly|anomalous\s*tasks|task\s*kb\s*anomaly|task\s*anomaly\s*exposure|task\s*anomaly\s*coverage|which\s*tasks\s*have\s*anomal)\b/i.test(q);
}

export async function buildTkatScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [taskRaw, kbRaw, anomRaw] = await Promise.all([
      fetch(`${base}/entities/Task`,                    { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`,                       { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/jarvis/analytics/anomalies`,    { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const tasks     = normaliseTasks(taskRaw);
    const articles  = normaliseArticles(kbRaw);
    const anomalies = normaliseAnomalies(anomRaw);

    let fully = 0, kbOnly = 0, anomOnly = 0, clear = 0;
    for (const task of tasks) {
      const toks = taskTokens(task);
      const c = classify(
        correlate(toks, articles,  articleFields),
        correlate(toks, anomalies, anomalyFields),
      );
      if (c === "FULLY_EXPOSED") fully++;
      else if (c === "KB_ONLY")       kbOnly++;
      else if (c === "ANOMALY_ONLY")  anomOnly++;
      else clear++;
    }
    const exposedPct = tasks.length > 0 ? Math.round((fully / tasks.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `TKAT summary: ${tasks.length} tasks correlated against ${articles.length} KB articles and ${anomalies.length} active anomalies. Fully exposed (both): ${fully} (${exposedPct}%), KB-only: ${kbOnly}, anomaly-only: ${anomOnly}, clear: ${clear}. Provide a 2-sentence operational brief on task exposure to intelligence anomalies and knowledge gaps.`,
      }),
    });
    const d = await r.json();
    return d.response ?? d.message ?? d.result ?? "TKAT brief unavailable.";
  } catch {
    return "TKAT assessment unavailable.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, background: `${accent}11`, border: `1px solid ${accent}33`,
      borderRadius: 4, padding: "6px 4px", textAlign: "center",
    }}>
      {pulse && (
        <div style={{
          width: 6, height: 6, borderRadius: "50%", background: accent,
          margin: "0 auto 2px",
          animation: "tkat-pulse 1.2s ease-in-out infinite",
        }} />
      )}
      <div style={{ fontSize: 14, fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontSize: 6, color: MUTED, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score, max, color }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 2 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
    </div>
  );
}

function TaskRow({ task }) {
  const [open, setOpen] = useState(false);
  const cls    = task._class;
  const col    = CLASS_COLOR[cls] ?? MUTED;
  const maxKb  = task._kbMatches.length   > 0 ? task._kbMatches[0].score   : 1;
  const maxAno = task._anomMatches.length > 0 ? task._anomMatches[0].score : 1;

  return (
    <div style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 6, marginBottom: 6 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: col }}>{cls.replace(/_/g, " ")}</span>
          {task.priority && (
            <span style={{
              marginLeft: 5, fontSize: 6, color: "#000", background: AMBER,
              borderRadius: 2, padding: "1px 4px",
            }}>{task.priority}</span>
          )}
          {task.status && (
            <span style={{
              marginLeft: 4, fontSize: 6, color: "#000", background: CY,
              borderRadius: 2, padding: "1px 4px",
            }}>{task.status}</span>
          )}
          <div style={{ fontSize: 8, color: CY, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {task.name}
          </div>
          <div style={{ fontSize: 7, color: MUTED }}>
            {task._kbMatches.length} KB articles · {task._anomMatches.length} anomalies
          </div>
        </div>
        <span style={{ fontSize: 8, color: MUTED, marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 6, paddingLeft: 8 }}>
          {task._kbMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 3 }}>KB ARTICLES</div>
              {task._kbMatches.slice(0, 5).map(art => (
                <div key={art.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {art.topic && (
                      <span style={{
                        fontSize: 6, color: "#000", background: GREEN,
                        borderRadius: 2, padding: "1px 3px",
                      }}>{art.topic}</span>
                    )}
                    <span style={{ fontSize: 7, color: GREEN }}>{art.title}</span>
                  </div>
                  <ScoreBar score={art.score} max={maxKb} color={GREEN} />
                </div>
              ))}
            </>
          )}
          {task._anomMatches.length > 0 && (
            <>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginTop: 4, marginBottom: 3 }}>ANOMALIES</div>
              {task._anomMatches.slice(0, 5).map(a => (
                <div key={a.id} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{
                      fontSize: 6, color: "#000",
                      background: a.severity === "HIGH" ? RED : AMBER,
                      borderRadius: 2, padding: "1px 3px",
                    }}>{a.severity}</span>
                    <span style={{ fontSize: 7, color: AMBER }}>
                      {a.metric} (|z|={Math.abs(a.zscore).toFixed(1)})
                    </span>
                  </div>
                  <ScoreBar score={a.score} max={maxAno} color={AMBER} />
                </div>
              ))}
            </>
          )}
          {task._kbMatches.length === 0 && task._anomMatches.length === 0 && (
            <div style={{ fontSize: 7, color: MUTED }}>No matches — CLEAR task.</div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "FULLY_EXPOSED", "KB_ONLY", "ANOMALY_ONLY", "CLEAR"];

// ─── main component ───────────────────────────────────────────────────────────

export default function TaskKnowledgeAnomalyTriple() {
  const [open,      setOpen]      = useState(false);
  const [tasks,     setTasks]     = useState([]);
  const [kbCount,   setKbCount]   = useState(0);
  const [anomCount, setAnomCount] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [taskRaw, kbRaw, anomRaw] = await Promise.all([
        fetch(`${base}/entities/Task`,                  { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,                     { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/jarvis/analytics/anomalies`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const taskList = normaliseTasks(taskRaw);
      const artList  = normaliseArticles(kbRaw);
      const anomList = normaliseAnomalies(anomRaw);
      setKbCount(artList.length);
      setAnomCount(anomList.length);
      const enriched = taskList.map(task => {
        const toks = taskTokens(task);
        const km   = correlate(toks, artList,  articleFields);
        const am   = correlate(toks, anomList, anomalyFields);
        return { ...task, _kbMatches: km, _anomMatches: am, _class: classify(km, am) };
      });
      setTasks(enriched);
    } catch (e) {
      setError(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:tkat-toggle", handler);
    return () => window.removeEventListener("jarvis:tkat-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildTkatScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const fullyExposed = tasks.filter(t => t._class === "FULLY_EXPOSED");
  const kbOnly       = tasks.filter(t => t._class === "KB_ONLY");
  const anomOnly     = tasks.filter(t => t._class === "ANOMALY_ONLY");
  const clear        = tasks.filter(t => t._class === "CLEAR");

  const filtered = tasks
    .filter(t => tab === "ALL" || t._class === tab)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <style>{`@keyframes tkat-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          background: open ? CY : "rgba(41,231,255,0.13)",
          border: `1px solid ${open ? CY : `${CY}44`}`,
          color: open ? "#000" : CY,
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        {fullyExposed.length > 0 && (
          <span style={{
            display: "inline-block", marginRight: 4,
            background: AMBER, color: "#000",
            borderRadius: "50%", fontSize: 7, fontWeight: 700,
            width: 14, height: 14, lineHeight: "14px", textAlign: "center",
          }}>{fullyExposed.length}</span>
        )}
        ◈ TKAT {open ? "▲" : "▼"}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 10, bottom: 55, zIndex: 68,
          width: 480, maxHeight: "74vh",
          background: BG, border: `1px solid ${CY}44`,
          borderRadius: 6, fontFamily: MONO,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 30px ${CY}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
                ◈ TASK × KNOWLEDGE × ANOMALY
              </span>
              {loading && (
                <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
              )}
            </div>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? `${CY}1A` : `${CY}26`,
                border: `1px solid ${CY}66`, color: CY,
                fontFamily: MONO, fontSize: 8, padding: "3px 8px",
                borderRadius: 3, cursor: assessing ? "wait" : "pointer",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* primary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
            <StatTile label="TASKS"         value={tasks.length}        accent={CY} />
            <StatTile label="FULLY EXPOSED" value={fullyExposed.length} accent={RED} pulse={fullyExposed.length > 0} />
            <StatTile label="KB ONLY"       value={kbOnly.length}       accent={GREEN} />
            <StatTile label="ANOMALY ONLY"  value={anomOnly.length}     accent={AMBER} />
          </div>

          {/* secondary stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "0 12px 8px" }}>
            <StatTile label="KB ARTICLES" value={kbCount}      accent={GREEN} />
            <StatTile label="ANOMALIES"   value={anomCount}    accent={AMBER} />
            <StatTile label="CLEAR"       value={clear.length} accent={MUTED} />
          </div>

          {error && (
            <div style={{ padding: "4px 12px", fontSize: 8, color: AMBER }}>{error}</div>
          )}

          {/* filter tabs + search */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? CY : "transparent",
                  border: `1px solid ${tab === t ? CY : `${MUTED}44`}`,
                  color: tab === t ? "#000" : MUTED,
                  fontFamily: MONO, fontSize: 7, fontWeight: 700,
                  padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                flex: 1, minWidth: 80,
                background: `${CY}0D`, border: `1px solid ${CY}33`,
                borderRadius: 2, color: CY, fontFamily: MONO, fontSize: 8,
                padding: "2px 6px", outline: "none",
              }}
            />
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
            {filtered.length === 0 && !loading ? (
              <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
                {tasks.length === 0 ? "No tasks loaded." : "No tasks match filter."}
              </div>
            ) : (
              filtered.map(task => <TaskRow key={task.id} task={task} />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
