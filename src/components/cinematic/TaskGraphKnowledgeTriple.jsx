/**
 * TaskGraphKnowledgeTriple — F707
 * "JARVIS, tgkntri / task graph knowledge / task centrality / knowledge grounded task /
 *  graph task nexus / task knowledge triple / grounded task / node task knowledge"
 *
 * 3-way cross-reference: /entities/Task × /v1/graph/centrality × /knowledge/
 * FULLY_GROUNDED — task has ≥1 graph node match AND ≥1 knowledge article match
 * NODE_ONLY      — task matches a graph node but no knowledge article
 * ARTICLE_ONLY   — task matches a knowledge article but no graph node
 * DARK           — no graph node, no knowledge article (blind operational gap)
 *
 * 5 stat tiles (TASKS, FULLY GROUNDED, NODE ONLY, ARTICLE ONLY, COVERAGE%);
 * ALL/FULLY_GROUNDED/NODE_ONLY/ARTICLE_ONLY/DARK filter tabs + search;
 * click-to-expand matched nodes + articles per task;
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS;
 * amber badge on DARK count; 90-s auto-refresh.
 * ◈ TGKNTRI button left:884900 bottom:8 zIndex:243.
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PUR = "#BB88FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 884_900;
const Z_INDEX  = 243;

const TGKNTRI_RE =
  /\btgkntri\b|\btask.?graph.?knowledge\b|\btask.?centrality\b|\bknowledge.?grounded.?task\b|\bgraph.?task.?nexus\b|\btask.?knowledge.?triple\b|\bgrounded.?task\b|\bnode.?task.?knowledge\b/i;

export function isTgkntriQuery(text) {
  return TGKNTRI_RE.test(text || "");
}

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

function taskText(t) {
  return [t.title, t.name, t.description, t.notes, t.status, t.priority,
          t.assignee, t.tags, t.category, t.label]
    .filter(Boolean).join(" ");
}

function nodeText(n) {
  return [n.id, n.label, n.name, n.type, n.category, n.description]
    .filter(Boolean).join(" ");
}

function articleText(a) {
  return [a.title, a.name, a.summary, a.content, a.tags, a.category, a.topic]
    .filter(Boolean).join(" ");
}

function normalise(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const KIND_COLOR = {
  FULLY_GROUNDED: GRN,
  NODE_ONLY:      CY,
  ARTICLE_ONLY:   PUR,
  DARK:           DIM,
};

function classifyTask(task, nodes, articles) {
  const tt = taskText(task);
  const matchedNodes    = nodes.filter((n) => overlap(tt, nodeText(n)) > 0);
  const matchedArticles = articles.filter((a) => overlap(tt, articleText(a)) > 0);
  const hasNode    = matchedNodes.length > 0;
  const hasArticle = matchedArticles.length > 0;
  let classification;
  if (hasNode && hasArticle)  classification = "FULLY_GROUNDED";
  else if (hasNode)           classification = "NODE_ONLY";
  else if (hasArticle)        classification = "ARTICLE_ONLY";
  else                        classification = "DARK";
  return { task, matchedNodes, matchedArticles, classification };
}

export async function buildTgkntriScript() {
  const BASE = apiBase();
  const [tR, gR, kR] = await Promise.allSettled([
    fetch(`${BASE}/entities/Task`).then((r) => r.json()),
    fetch(`${BASE}/v1/graph/centrality`).then((r) => r.json()),
    fetch(`${BASE}/knowledge/`).then((r) => r.json()),
  ]);
  const tasks    = normalise(tR.value, ["items","tasks","data"]);
  const nodes    = normalise(gR.value, ["nodes","items","centrality","data"]);
  const articles = normalise(kR.value, ["articles","items","knowledge","data"]);
  const rows = tasks.map((t) => classifyTask(t, nodes, articles));
  const fullyGrounded = rows.filter((r) => r.classification === "FULLY_GROUNDED").length;
  const nodeOnly      = rows.filter((r) => r.classification === "NODE_ONLY").length;
  const articleOnly   = rows.filter((r) => r.classification === "ARTICLE_ONLY").length;
  const dark          = rows.filter((r) => r.classification === "DARK").length;
  const total         = rows.length;
  const coverage      = total ? Math.round((fullyGrounded / total) * 100) : 0;
  window.dispatchEvent(new CustomEvent("jarvis:tgkntri-toggle"));
  const prompt = `We have ${total} tasks. ${fullyGrounded} are fully grounded (matched in both graph and knowledge base). ${nodeOnly} have graph node matches only, ${articleOnly} have knowledge article matches only, and ${dark} are dark with no grounding at all. Knowledge coverage is ${coverage}%. In 2 sentences, assess operational knowledge coverage and the most critical dark task gap.`;
  try {
    const r = await fetch(`${BASE}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `${fullyGrounded} tasks fully grounded, ${dark} dark. Coverage ${coverage}%.`;
  } catch {
    return `${fullyGrounded} tasks fully grounded (graph + knowledge), ${dark} dark gaps. Coverage ${coverage}%.`;
  }
}

export default function TaskGraphKnowledgeTriple() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const BASE = apiBase();
      const [tR, gR, kR] = await Promise.allSettled([
        fetch(`${BASE}/entities/Task`).then((r) => r.json()),
        fetch(`${BASE}/v1/graph/centrality`).then((r) => r.json()),
        fetch(`${BASE}/knowledge/`).then((r) => r.json()),
      ]);
      const tasks    = normalise(tR.value, ["items","tasks","data"]);
      const nodes    = normalise(gR.value, ["nodes","items","centrality","data"]);
      const articles = normalise(kR.value, ["articles","items","knowledge","data"]);
      setRows(tasks.map((t) => classifyTask(t, nodes, articles)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tgkntri-toggle", toggle);
    return () => window.removeEventListener("jarvis:tgkntri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const fullyGrounded = rows.filter((r) => r.classification === "FULLY_GROUNDED").length;
  const nodeOnly      = rows.filter((r) => r.classification === "NODE_ONLY").length;
  const articleOnly   = rows.filter((r) => r.classification === "ARTICLE_ONLY").length;
  const dark          = rows.filter((r) => r.classification === "DARK").length;
  const total         = rows.length;
  const coverage      = total ? Math.round((fullyGrounded / total) * 100) : 0;

  const visible = rows.filter((row) => {
    if (filter !== "ALL" && row.classification !== filter) return false;
    if (search) {
      const txt = taskText(row.task).toLowerCase();
      if (!txt.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const BASE = apiBase();
      const prompt = `We have ${total} tasks: ${fullyGrounded} fully grounded (graph+knowledge), ${nodeOnly} node-only, ${articleOnly} article-only, ${dark} dark. Coverage ${coverage}%. In 2 sentences, assess knowledge coverage gaps and the highest priority dark task to address.`;
      const r = await fetch(`${BASE}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      if (txt) {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } catch { setAssessment("Unable to reach reasoning core."); }
    setAssessing(false);
  }

  const TABS = ["ALL","FULLY_GROUNDED","NODE_ONLY","ARTICLE_ONLY","DARK"];
  const TAB_COLOR = {
    ALL:           CY,
    FULLY_GROUNDED: GRN,
    NODE_ONLY:     CY,
    ARTICLE_ONLY:  PUR,
    DARK:          DIM,
  };

  return (
    <>
      {/* fixed toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Task × Graph Centrality × Knowledge Triple (TGKNTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? AMB : "rgba(5,8,13,0.75)",
          border: `1px solid ${AMB}`, borderRadius: 6, padding: "3px 7px",
          color: open ? "#04060A" : AMB, fontSize: 10, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
          boxShadow: `0 0 10px ${AMB}44`,
        }}
      >
        {dark > 0 && (
          <span style={{
            position: "absolute", top: -6, right: -6,
            background: AMB, color: "#000", borderRadius: "50%",
            fontSize: 9, minWidth: 16, height: 16, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>{dark}</span>
        )}
        ◈ TGKNTRI
      </button>

      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT, bottom: 36, zIndex: Z_INDEX,
          width: "min(560px,90vw)", maxHeight: "70vh", overflow: "hidden",
          background: "rgba(5,8,13,0.93)", border: `1px solid ${AMB}55`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${AMB}22`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: AMB, fontWeight: 700, fontSize: 11, letterSpacing: 2 }}>
              ◈ TASK × GRAPH × KNOWLEDGE TRIPLE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
              {loading ? "loading…" : `${total} tasks`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
            {[
              { label: "TASKS",    val: total,         col: CY  },
              { label: "GROUNDED", val: fullyGrounded, col: GRN },
              { label: "NODE",     val: nodeOnly,      col: CY  },
              { label: "ARTICLE",  val: articleOnly,   col: PUR },
              { label: "DARK",     val: dark,          col: DIM },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6,
                padding: "6px 4px", textAlign: "center",
                border: `1px solid ${col}33`,
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6 }}>
            <div style={{
              width: `${coverage}%`, height: "100%", borderRadius: 4,
              background: `linear-gradient(90deg,${GRN},${CY})`,
              transition: "width 0.4s",
            }} />
          </div>
          <div style={{ fontSize: 10, color: DIM, textAlign: "right" }}>
            {coverage}% fully grounded coverage
          </div>

          {/* tabs + search */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? TAB_COLOR[t] : "rgba(255,255,255,0.05)",
                border: `1px solid ${TAB_COLOR[t]}55`, borderRadius: 4,
                color: filter === t ? "#000" : TAB_COLOR[t],
                fontSize: 9, padding: "2px 8px", cursor: "pointer",
                fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.06)",
                border: `1px solid ${DIM}44`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 10, padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
              }}
            />
          </div>

          {/* rows */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 16 }}>
                {loading ? "Loading…" : "No matching tasks."}
              </div>
            )}
            {visible.map((row, i) => {
              const t   = row.task;
              const cls = row.classification;
              const col = KIND_COLOR[cls];
              const st  = (t.status || "").toUpperCase();
              const stCol = st === "BLOCKED" ? RED : st === "DONE" ? GRN : st === "IN_PROGRESS" ? CY : AMB;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.04)", borderRadius: 6,
                  border: `1px solid ${col}33`, padding: "6px 10px",
                  cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 9, padding: "1px 6px", borderRadius: 3,
                      background: `${col}22`, color: col, letterSpacing: 1,
                      whiteSpace: "nowrap",
                    }}>{cls.replace(/_/g, " ")}</span>
                    {st && (
                      <span style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: `${stCol}22`, color: stCol,
                      }}>{st}</span>
                    )}
                    <span style={{ fontSize: 11, flex: 1, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.title || t.name || "Task"}
                    </span>
                    <span style={{ fontSize: 9, color: DIM }}>
                      {row.matchedNodes.length}nd / {row.matchedArticles.length}art
                    </span>
                    <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {t.description && (
                        <div style={{ fontSize: 10, color: DIM }}>{t.description}</div>
                      )}
                      {row.matchedNodes.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 3 }}>
                            GRAPH NODES ({row.matchedNodes.length})
                          </div>
                          {row.matchedNodes.slice(0, 5).map((n, j) => (
                            <div key={j} style={{ fontSize: 10, color: "#AABBCC", padding: "2px 0" }}>
                              <span style={{ color: CY }}>◉ </span>
                              {n.label || n.name || n.id || "Node"}
                              {n.type && <span style={{ color: DIM }}> [{n.type}]</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.matchedArticles.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: PUR, letterSpacing: 1, marginBottom: 3 }}>
                            KNOWLEDGE ARTICLES ({row.matchedArticles.length})
                          </div>
                          {row.matchedArticles.slice(0, 5).map((a, j) => (
                            <div key={j} style={{ fontSize: 10, color: "#AABBCC", padding: "2px 0" }}>
                              <span style={{ color: PUR }}>📄 </span>
                              {a.title || a.name || "Article"}
                              {a.category && <span style={{ color: DIM }}> [{a.category}]</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {cls === "DARK" && (
                        <div style={{
                          fontSize: 10, color: AMB, padding: "4px 8px",
                          background: `${AMB}11`, borderRadius: 4,
                          border: `1px solid ${AMB}33`,
                        }}>
                          ⚠ No graph node or knowledge article grounding — operational blind spot.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* assessment */}
          {assessment && (
            <div style={{
              fontSize: 11, color: GRN, padding: "8px 10px",
              background: `${GRN}11`, borderRadius: 6,
              border: `1px solid ${GRN}33`,
            }}>
              {assessment}
            </div>
          )}

          {/* footer */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={load} disabled={loading} style={{
              background: "rgba(255,255,255,0.06)", border: `1px solid ${DIM}55`,
              borderRadius: 4, color: DIM, fontSize: 10, padding: "3px 10px",
              cursor: loading ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺ REFRESH</button>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? `${GRN}22` : `${GRN}11`,
              border: `1px solid ${GRN}55`, borderRadius: 4,
              color: GRN, fontSize: 10, padding: "3px 12px",
              cursor: assessing ? "wait" : "pointer",
              fontFamily: "'JetBrains Mono',monospace",
            }}>▶ ASSESS</button>
          </div>
        </div>
      )}
    </>
  );
}
