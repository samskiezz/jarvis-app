/**
 * KnowledgeTaskGapDetector — F490
 * "JARVIS, knowledge task / task knowledge / knowledge gap / ktgap /
 *  task coverage / grounded task / ungrounded task / task support"
 * Cross-references /knowledge/ + /entities/Task to surface
 * GROUNDED tasks (≥1 matching knowledge article) vs
 * UNGROUNDED tasks (no knowledge support — operational blind spots).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const ORG = "#FF8C42";
const DIM = "#8899AA";
const RED = "#FF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const KTGAP_RE =
  /\bktgap\b|\bknowledge.?task\b|\btask.?knowledge\b|\bknowledge.?gap\b|\btask.?coverage\b|\bgrounded.?task\b|\bungrounded.?task\b|\btask.?support\b|\btask.?knowledge.?base\b|\bknowledge.?backed.?task\b|\bknowledge.?for.?task\b|\btask.?documentation\b/i;

export function isKtgapQuery(text) {
  return KTGAP_RE.test(text || "");
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw = data.tasks || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:     t.id || `task-${i}`,
    name:   (t.name || t.title || t.label || `Task ${i + 1}`).trim(),
    status: (t.status || "PENDING").toUpperCase(),
    tags:   [...(t.tags || []), t.category, t.type, t.priority]
              .filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function normaliseArticles(data) {
  if (!data) return [];
  const raw = data.articles || data.items || data.results || data.notes ||
              data.documents || (Array.isArray(data) ? data : []);
  return raw.map((a, i) => ({
    id:    a.id || `art-${i}`,
    title: (a.title || a.name || a.label || `Article ${i + 1}`).trim(),
    kind:  (a.kind || a.type || a.category || "note").toLowerCase(),
    tags:  [...(a.tags || []), a.kind, a.type, a.category]
             .filter(Boolean).map(x => String(x).toLowerCase()),
  }));
}

function tokenise(str) {
  return (str || "").toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function matchScore(task, article) {
  const taskWords = new Set([...tokenise(task.name), ...task.tags]);
  const artWords  = new Set([...tokenise(article.title), ...article.tags, ...tokenise(article.kind)]);
  let hits = 0;
  for (const w of artWords) {
    if (taskWords.has(w)) hits++;
  }
  return hits;
}

function classify(tasks, articles) {
  return tasks.map(task => {
    const matched = articles
      .map(a => ({ ...a, score: matchScore(task, a) }))
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...task, matched, grounded: matched.length > 0 };
  });
}

export async function buildKtgapScript() {
  let tasks = [], articles = [];
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [tr, kr] = await Promise.all([
      fetch(`${base}/entities/Task`,  { headers: hdr }),
      fetch(`${base}/knowledge/`,     { headers: hdr }),
    ]);
    if (tr.ok) tasks    = normaliseTasks(await tr.json());
    if (kr.ok) articles = normaliseArticles(await kr.json());
  } catch (_) {}

  if (!tasks.length) return "Unable to retrieve knowledge-task coverage data at this time, sir.";

  const rows       = classify(tasks, articles);
  const grounded   = rows.filter(r => r.grounded).length;
  const ungrounded = rows.length - grounded;
  const pct        = rows.length ? Math.round((grounded / rows.length) * 100) : 0;

  const parts = [
    `Knowledge-task coverage: ${tasks.length} active task${tasks.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}.`,
    `${grounded} task${grounded !== 1 ? "s are" : " is"} KNOWLEDGE-GROUNDED — ${pct}% coverage.`,
  ];
  if (ungrounded > 0) {
    const top = rows.filter(r => !r.grounded).slice(0, 2).map(r => r.name).join(", ");
    parts.push(`${ungrounded} task${ungrounded !== 1 ? "s have" : " has"} no knowledge support — operational blind spots. Top ungrounded: ${top}.`);
  } else {
    parts.push("All tasks have at least one supporting knowledge article, sir.");
  }

  return parts.join(" ");
}

const BTN_LEFT = 18_660;
const Z_IDX    = 80;

export default function KnowledgeTaskGapDetector() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [artCount,  setArtCount]  = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [tr, kr] = await Promise.all([
        fetch(`${base}/entities/Task`,  { headers: hdr }),
        fetch(`${base}/knowledge/`,     { headers: hdr }),
      ]);
      const tasks    = tr.ok ? normaliseTasks(await tr.json())    : [];
      const articles = kr.ok ? normaliseArticles(await kr.json()) : [];
      setArtCount(articles.length);
      setRows(classify(tasks, articles));
      setLastTs(Date.now());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (KTGAP_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ktgap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ktgap-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const ungrounded = rows.filter(r => !r.grounded);
      const grounded   = rows.filter(r => r.grounded);
      const prompt =
        `Analyse knowledge-task gap: ${rows.length} tasks, ${grounded.length} knowledge-grounded (${artCount} articles), ` +
        `${ungrounded.length} ungrounded. Top ungrounded tasks: ${ungrounded.slice(0, 3).map(r => r.name).join(", ") || "none"}. ` +
        `Give a 2-sentence operational assessment and key remediation priority.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const j = r.ok ? await r.json() : {};
      const txt = j.response || j.message || j.content || j.text || "Assessment unavailable, sir.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch (_) { setBrief("Assessment unavailable at this time, sir."); }
    finally { setAssessing(false); }
  }, [rows, artCount]);

  const ungroundedCount = rows.filter(r => !r.grounded).length;
  const filtered = rows.filter(r => {
    const matchTab =
      tab === "ALL"         ? true :
      tab === "GROUNDED"    ? r.grounded :
      tab === "UNGROUNDED"  ? !r.grounded : true;
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const fmtTs = (ts) => ts ? new Date(ts).toLocaleTimeString() : "—";
  const pct   = rows.length ? Math.round((rows.filter(r => r.grounded).length / rows.length) * 100) : 0;

  const STATUS_COLOR = { DONE: GRN, COMPLETE: GRN, IN_PROGRESS: CY, PENDING: ORG, BLOCKED: RED };

  return (
    <>
      {/* ◈ KTGAP button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_IDX,
          background: "rgba(0,0,0,0.75)", border: `1px solid ${ungroundedCount > 0 ? ORG : CY}`,
          color: ungroundedCount > 0 ? ORG : CY, padding: "3px 7px", fontSize: 10,
          fontFamily: "monospace", cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
        title="Knowledge × Task Gap Detector"
      >
        ◈ KTGAP
        {ungroundedCount > 0 && (
          <span style={{
            marginLeft: 4, background: ORG, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{ungroundedCount}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 20, width: 520, maxHeight: "80vh",
          background: "rgba(0,8,20,0.97)", border: `1px solid ${CY}40`,
          borderRadius: 6, zIndex: 9000, display: "flex", flexDirection: "column",
          fontFamily: "monospace", color: CY, boxShadow: `0 0 24px ${CY}20`,
          overflowY: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderBottom: `1px solid ${CY}30`,
          }}>
            <span style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ◈ KNOWLEDGE × TASK GAP DETECTOR
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
            {[
              { label: "TASKS",      val: rows.length,                         col: CY  },
              { label: "ARTICLES",   val: artCount,                            col: CY  },
              { label: "GROUNDED",   val: rows.filter(r => r.grounded).length, col: GRN },
              { label: "UNGROUNDED", val: ungroundedCount,                     col: ungroundedCount > 0 ? ORG : DIM },
              { label: "COVERAGE",   val: `${pct}%`,                           col: pct >= 80 ? GRN : pct >= 50 ? ORG : RED },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4,
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Tabs + Search */}
          <div style={{ padding: "0 14px 8px", display: "flex", gap: 6, alignItems: "center" }}>
            {["ALL", "GROUNDED", "UNGROUNDED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}20` : "none",
                border: `1px solid ${tab === t ? CY : CY + "30"}`,
                color: tab === t ? CY : DIM, padding: "2px 8px", fontSize: 9,
                fontFamily: "monospace", cursor: "pointer", borderRadius: 3, letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                flex: 1, background: "rgba(255,255,255,0.05)", border: `1px solid ${CY}30`,
                color: CY, padding: "3px 8px", fontSize: 10, fontFamily: "monospace",
                borderRadius: 3, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
            {loading && !rows.length && (
              <div style={{ color: DIM, fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                Loading…
              </div>
            )}
            {filtered.map(row => (
              <div key={row.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                    padding: "6px 8px", borderRadius: 4,
                    background: expanded === row.id ? `${CY}10` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${row.grounded ? GRN + "40" : ORG + "40"}`,
                  }}
                >
                  <span style={{ fontSize: 8, color: row.grounded ? GRN : ORG, letterSpacing: 1 }}>
                    {row.grounded ? "GROUNDED" : "UNGROUNDED"}
                  </span>
                  <span style={{ flex: 1, fontSize: 10, color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.name}
                  </span>
                  <span style={{
                    fontSize: 8, letterSpacing: 1, padding: "1px 5px", borderRadius: 8,
                    background: `${STATUS_COLOR[row.status] || DIM}20`,
                    color: STATUS_COLOR[row.status] || DIM, border: `1px solid ${STATUS_COLOR[row.status] || DIM}40`,
                  }}>{row.status}</span>
                  <span style={{ fontSize: 8, color: row.grounded ? GRN : DIM }}>
                    {row.grounded ? `${row.matched.length} art.` : "—"}
                  </span>
                </div>
                {expanded === row.id && row.grounded && (
                  <div style={{
                    marginTop: 2, padding: "6px 10px",
                    background: "rgba(0,229,160,0.04)", borderRadius: 4,
                    border: `1px solid ${GRN}20`,
                  }}>
                    {row.matched.slice(0, 4).map(a => (
                      <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <span style={{
                          fontSize: 8, color: CY, background: `${CY}15`, borderRadius: 8,
                          padding: "1px 5px", letterSpacing: 1,
                        }}>{a.kind}</span>
                        <span style={{ flex: 1, fontSize: 10, color: CY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ fontSize: 9, color: GRN }}>{a.score} hit{a.score !== 1 ? "s" : ""}</span>
                      </div>
                    ))}
                    {row.matched.length > 4 && (
                      <div style={{ fontSize: 9, color: DIM }}>+{row.matched.length - 4} more articles</div>
                    )}
                  </div>
                )}
                {expanded === row.id && !row.grounded && (
                  <div style={{
                    marginTop: 2, padding: "6px 10px",
                    background: `${ORG}08`, borderRadius: 4, border: `1px solid ${ORG}20`,
                    fontSize: 9, color: ORG,
                  }}>
                    No supporting knowledge articles found for this task. Consider creating a knowledge entry or adjusting task nomenclature.
                  </div>
                )}
              </div>
            ))}
            {!loading && !filtered.length && (
              <div style={{ color: DIM, fontSize: 10, padding: "20px 0", textAlign: "center" }}>
                No tasks match.
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}20`,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <button
              onClick={assess}
              disabled={assessing || !rows.length}
              style={{
                background: assessing ? `${CY}10` : `${CY}20`, border: `1px solid ${CY}`,
                color: CY, padding: "3px 10px", fontSize: 10, fontFamily: "monospace",
                cursor: assessing ? "wait" : "pointer", borderRadius: 3, letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <span style={{ fontSize: 8, color: DIM, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              {brief || `Last: ${fmtTs(lastTs)}`}
            </span>
            <span style={{ fontSize: 8, color: DIM }}>{loading ? "↻" : `${filtered.length}/${rows.length}`}</span>
          </div>
        </div>
      )}
    </>
  );
}
