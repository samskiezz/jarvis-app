/**
 * TaskKnowledgeCoverage — cross-references /entities/Task against /knowledge/
 * to surface which tasks have backing knowledge articles (COVERED) and which
 * have no documentation support (DARK).  Additive panel; never edits shell files.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";

const BTN_LEFT   = 28400;
const REFRESH_MS = 120_000;
const API_KEY    = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TKNOW_RE = /\b(task[\s-]?know|know[\s-]?task|which\s+tasks?\s+(have|got)\s+docs?|task[\s-]?docs?|task[\s-]?knowledge[\s-]?gap|tknow\b)/i;

export function isTaskKnowledgeQuery(q) {
  return TKNOW_RE.test(q || "");
}

export async function buildTaskKnowledgeScript() {
  try {
    const base = apiBase();
    const [tr, kr] = await Promise.all([
      fetch(`${base}/entities/Task`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/knowledge/`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const tasks   = normaliseArray(tr.ok  ? await tr.json()  : []);
    const know    = normaliseArray(kr.ok  ? await kr.json()  : []);
    const items   = normaliseTasks(tasks);
    const articles = normaliseArticles(know);
    const corr    = correlate(items, articles);
    const covered = corr.filter(r => r.matches.length > 0).length;
    const dark    = corr.length - covered;
    return `Task knowledge audit complete. ${items.length} tasks checked against ${articles.length} knowledge articles. ${covered} tasks have documentation coverage; ${dark} tasks are dark with no backing articles. Top uncovered task: ${corr.find(r => r.matches.length === 0)?.task?.title || "none"}.`;
  } catch (_) {
    return "Task knowledge audit unavailable — check /entities/Task and /knowledge/ endpoints.";
  }
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseTasks(raw) {
  return normaliseArray(raw).map(t => ({
    id:          t.id          || t._id          || String(Math.random()),
    title:       t.title       || t.name         || t.label || "Untitled Task",
    description: t.description || t.summary      || t.body  || "",
    status:      t.status      || t.state        || "unknown",
    priority:    t.priority    || t.urgency       || "",
    tags:        Array.isArray(t.tags) ? t.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map(a => ({
    id:      a.id      || a._id      || String(Math.random()),
    title:   a.title   || a.name     || a.heading || "Untitled Article",
    content: a.content || a.body     || a.text    || a.summary || "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function tokens(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function matchScore(task, article) {
  const tTok = new Set([
    ...tokens(task.title),
    ...tokens(task.description),
    ...tokens(task.tags.join(" ")),
  ]);
  const aTok = [
    ...tokens(article.title),
    ...tokens(article.content.slice(0, 400)),
    ...tokens(article.tags.join(" ")),
  ];
  let score = 0;
  for (const t of aTok) if (tTok.has(t)) score++;
  return score;
}

function correlate(tasks, articles) {
  return tasks.map(task => {
    const scored = articles
      .map(a => ({ article: a, score: matchScore(task, a) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { task, matches: scored };
  });
}

export default function TaskKnowledgeCoverage() {
  const [visible,    setVisible]  = useState(false);
  const [tasks,      setTasks]    = useState([]);
  const [articles,   setArticles] = useState([]);
  const [loading,    setLoading]  = useState(false);
  const [tab,        setTab]      = useState("ALL");
  const [search,     setSearch]   = useState("");
  const [expanded,   setExpanded] = useState(null);
  const [assessing,  setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const [tr, kr] = await Promise.all([
        fetch(`${base}/entities/Task`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/knowledge/`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      if (tr.ok)  setTasks(normaliseTasks(normaliseArray(await tr.json())));
      if (kr.ok)  setArticles(normaliseArticles(normaliseArray(await kr.json())));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible(v => !v);
    window.addEventListener("jarvis:tknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessTask(row) {
    setAssessing(row.task.id);
    try {
      const prompt = `In two sentences, assess task "${row.task.title}" given ${row.matches.length} knowledge articles backing it. Highlight the biggest gap.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Assessment unavailable." } }));
    } finally {
      setAssessing(null);
    }
  }

  const corr    = correlate(tasks, articles);
  const covered = corr.filter(r => r.matches.length > 0);
  const dark    = corr.filter(r => r.matches.length === 0);

  let rows = corr;
  if (tab === "COVERED") rows = covered;
  if (tab === "DARK")    rows = dark;
  if (search.trim()) {
    const q = search.toLowerCase();
    rows = rows.filter(r =>
      r.task.title.toLowerCase().includes(q) ||
      r.task.description.toLowerCase().includes(q) ||
      r.task.status.toLowerCase().includes(q)
    );
  }

  const TABS = ["ALL", "COVERED", "DARK"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible(v => !v)}
        title="Task Knowledge Coverage"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 64,
          background: visible ? `${CY}22` : "rgba(5,12,22,0.85)",
          border: `1px solid ${visible ? CY : CY + "44"}`,
          borderRadius: 6, color: visible ? CY : CY + "88",
          fontSize: 9, letterSpacing: 1.5, padding: "3px 7px",
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TKNOW
      </button>

      {/* Panel */}
      {visible && (
        <div style={{
          position: "fixed",
          bottom: 32,
          left: Math.max(8, BTN_LEFT - 280),
          width: 580,
          maxHeight: "70vh",
          zIndex: 64,
          background: "rgba(3,8,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 0 60px ${CY}14, 0 20px 40px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            borderBottom: `1px solid ${CY}33`,
            padding: "10px 14px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ TASK KNOWLEDGE COVERAGE
            </span>
            <span style={{ color: "#2E4050", fontSize: 9, letterSpacing: 1 }}>
              {loading ? "SYNCING…" : `${tasks.length}T · ${articles.length}A`}
            </span>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
            {[
              { label: "TASKS",    val: tasks.length,    col: CY },
              { label: "ARTICLES", val: articles.length, col: PURPLE },
              { label: "COVERED",  val: covered.length,  col: GREEN },
              { label: "DARK",     val: dark.length,     col: RED },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: `${s.col}11`,
                border: `1px solid ${s.col}33`, borderRadius: 6,
                padding: "5px 8px", textAlign: "center",
              }}>
                <div style={{ color: s.col, fontSize: 15, fontWeight: 700 }}>{s.val}</div>
                <div style={{ color: s.col + "88", fontSize: 8, letterSpacing: 1.5 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${CY}22` }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : CY + "33"}`,
                borderRadius: 4, color: tab === t ? CY : CY + "55",
                fontSize: 9, letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="filter…"
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}22`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 10, padding: "2px 8px",
                outline: "none", width: 120,
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {rows.length === 0 && (
              <div style={{ color: "#2E4050", fontSize: 11, textAlign: "center", padding: 20 }}>
                {loading ? "Loading…" : "No tasks match."}
              </div>
            )}
            {rows.map(row => {
              const isExpanded = expanded === row.task.id;
              const hasCover   = row.matches.length > 0;
              return (
                <div key={row.task.id} style={{ borderBottom: `1px solid ${CY}14` }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.task.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 14px", cursor: "pointer",
                      background: isExpanded ? `${CY}0A` : "transparent",
                    }}
                  >
                    <span style={{ color: hasCover ? GREEN : RED, fontSize: 13, flexShrink: 0 }}>
                      {hasCover ? "●" : "○"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                      {row.task.title}
                    </span>
                    <span style={{
                      color: hasCover ? GREEN + "88" : RED + "88",
                      fontSize: 9, letterSpacing: 1, flexShrink: 0,
                    }}>
                      {row.matches.length} ARTICLE{row.matches.length !== 1 ? "S" : ""}
                    </span>
                    {row.task.priority && (
                      <span style={{
                        color: row.task.priority.toLowerCase().includes("high") ? AMBER : "#4E6070",
                        fontSize: 8, letterSpacing: 1, flexShrink: 0,
                      }}>
                        {row.task.priority.toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: "#2E4050", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "0 14px 10px 38px" }}>
                      {row.task.description && (
                        <div style={{ color: "#4E6070", fontSize: 10, marginBottom: 6 }}>
                          {row.task.description.slice(0, 160)}
                          {row.task.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {row.matches.length > 0 ? (
                        <>
                          <div style={{ color: CY + "88", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                            MATCHED ARTICLES
                          </div>
                          {row.matches.map(m => (
                            <div key={m.article.id} style={{
                              display: "flex", justifyContent: "space-between",
                              padding: "3px 0", borderBottom: `1px solid ${CY}0A`,
                            }}>
                              <span style={{ color: "#7A95AB", fontSize: 10 }}>{m.article.title}</span>
                              <span style={{ color: PURPLE, fontSize: 9 }}>+{m.score}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div style={{ color: RED + "88", fontSize: 9, letterSpacing: 1 }}>
                          NO KNOWLEDGE COVERAGE — DARK TASK
                        </div>
                      )}
                      <button
                        onClick={() => assessTask(row)}
                        disabled={assessing === row.task.id}
                        style={{
                          marginTop: 8,
                          background: `${AMBER}22`,
                          border: `1px solid ${AMBER}55`,
                          borderRadius: 4, color: AMBER,
                          fontSize: 9, letterSpacing: 1,
                          padding: "3px 10px", cursor: "pointer",
                        }}
                      >
                        {assessing === row.task.id ? "ASSESSING…" : "⚡ ASSESS"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${CY}1A`,
            padding: "5px 14px",
            display: "flex", justifyContent: "space-between",
            color: "#2E4050", fontSize: 9, letterSpacing: 1,
          }}>
            <span>TASK × KNOWLEDGE COVERAGE</span>
            <span>{rows.length} TASKS SHOWN</span>
          </div>
        </div>
      )}
    </>
  );
}
