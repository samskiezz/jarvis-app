/**
 * F760 — Task × Contact × Knowledge Triple Nexus (TCKTRI)
 * Endpoints: /entities/Task  ×  /entities/Contact  ×  /knowledge/
 * Classification: FULLY_STAFFED | CONTACT_ONLY | KNOWLEDGE_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 923_800;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const TCKTRI_RE =
  /\b(tcktri|task\s+contact\s+knowledge|task\s+knowledge\s+contact|contact\s+task\s+knowledge|knowledge\s+task\s+contact|staffed\s+task|task\s+staffing|task\s+owner\s+knowledge|task\s+knowledge\s+gap|contact\s+task\s+intel|who\s+owns\s+tasks|task\s+coverage\s+triple|task\s+people\s+knowledge)\b/i;

export function isTcktriQuery(t) {
  return TCKTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    ""
  );
}

function normaliseTasks(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.tasks))   return raw.tasks;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.items))   return raw.items;
  return [];
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseArticles(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.articles)) return raw.articles;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.topic, obj.domain, obj.content,
    obj.status, obj.priority, obj.role, obj.organization,
    obj.subject, obj.owner, obj.assignee,
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

function buildNexus(tasks, contacts, articles) {
  return tasks.map(task => {
    const tKw = keywords(task);

    const bestContact = contacts.reduce(
      (best, c) => {
        const s = scoreMatch(tKw, keywords(c));
        return s > best.score ? { score: s, c } : best;
      },
      { score: 0, c: null },
    );

    const bestArticle = articles.reduce(
      (best, a) => {
        const s = scoreMatch(tKw, keywords(a));
        return s > best.score ? { score: s, a } : best;
      },
      { score: 0, a: null },
    );

    const hasContact = bestContact.score > 0;
    const hasKnow    = bestArticle.score > 0;

    const classification =
      hasContact && hasKnow ? "FULLY_STAFFED"
      : hasContact          ? "CONTACT_ONLY"
      : hasKnow             ? "KNOWLEDGE_ONLY"
      :                       "DARK";

    return {
      task,
      classification,
      bestContact:   bestContact.c,
      contactScore:  bestContact.score,
      bestArticle:   bestArticle.a,
      articleScore:  bestArticle.score,
    };
  });
}

export async function buildTcktriScript() {
  const base = apiBase();
  try {
    const [taskR, cntR, knoR] = await Promise.all([
      fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const tasks    = normaliseTasks(await taskR.json());
    const contacts = normaliseContacts(await cntR.json());
    const articles = normaliseArticles(await knoR.json());
    const nexus    = buildNexus(tasks, contacts, articles);
    const staffed  = nexus.filter(r => r.classification === "FULLY_STAFFED").length;
    const dark     = nexus.filter(r => r.classification === "DARK").length;
    const pct      = tasks.length ? Math.round((staffed / tasks.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Task × Contact × Knowledge triple nexus: ${tasks.length} tasks analysed against ${contacts.length} contacts and ${articles.length} knowledge articles. ${staffed} tasks are fully staffed (contact owner + knowledge backing), ${dark} are dark (no contact or knowledge link). Coverage ${pct}%. Summarise task staffing and knowledge posture in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${tasks.length} tasks analysed. ${staffed} fully staffed (contact + knowledge), ${dark} dark — no owner or documentation detected.`;
  } catch (e) {
    return `TCKTRI fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_STAFFED", "CONTACT_ONLY", "KNOWLEDGE_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_STAFFED:  GN,
  CONTACT_ONLY:   CY,
  KNOWLEDGE_ONLY: AM,
  DARK:           RD,
};

const STATUS_COLOR = {
  DONE:        GN,
  COMPLETED:   GN,
  IN_PROGRESS: CY,
  PENDING:     AM,
  BLOCKED:     RD,
  OPEN:        AM,
};

export default function TaskContactKnowledgeTriple() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [badgeDark, setBadgeDark]   = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [taskR, cntR, knoR] = await Promise.all([
        fetch(`${base}/entities/Task`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/knowledge/`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const tasks    = normaliseTasks(await taskR.json());
      const contacts = normaliseContacts(await cntR.json());
      const articles = normaliseArticles(await knoR.json());
      const nexus    = buildNexus(tasks, contacts, articles);
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
    window.addEventListener("jarvis:tcktri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tcktri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.task).includes(search.toLowerCase()) ||
      (r.bestContact && keywords(r.bestContact).includes(search.toLowerCase())) ||
      (r.bestArticle && keywords(r.bestArticle).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:          rows.length,
    FULLY_STAFFED:  rows.filter(r => r.classification === "FULLY_STAFFED").length,
    CONTACT_ONLY:   rows.filter(r => r.classification === "CONTACT_ONLY").length,
    KNOWLEDGE_ONLY: rows.filter(r => r.classification === "KNOWLEDGE_ONLY").length,
    DARK:           rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_STAFFED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 618,
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
          ◈ TCKTRI — TASK × CONTACT × KNOWLEDGE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} tasks · ${pct}% staffed`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["TASKS",          counts.total,          CY],
          ["FULLY STAFFED",  counts.FULLY_STAFFED,  GN],
          ["CONTACT ONLY",   counts.CONTACT_ONLY,   CY],
          ["KNOWLEDGE ONLY", counts.KNOWLEDGE_ONLY,  AM],
          ["DARK",           counts.DARK,             RD],
          ["COVERAGE",       `${pct}%`,               pct >= 60 ? GN : pct >= 30 ? AM : RD],
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
        placeholder="Search tasks / contacts / knowledge articles…"
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
          const name   = r.task.name || r.task.title || r.task.label || `Task ${i + 1}`;
          const status = r.task.status || r.task.state;
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
                  {r.bestContact ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Contact:</b>{" "}
                      {r.bestContact.name || r.bestContact.title || "contact"}{" "}
                      <span style={{ color: DIM }}>
                        (role: {r.bestContact.role || r.bestContact.type || "—"}, hits: {r.contactScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching contact found.</div>
                  )}
                  {r.bestArticle ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Knowledge:</b>{" "}
                      {r.bestArticle.title || r.bestArticle.name || "article"}{" "}
                      <span style={{ color: DIM }}>
                        (kind: {r.bestArticle.kind || r.bestArticle.type || "—"}, hits: {r.articleScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching knowledge article found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No tasks match current filter.
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
        title="Task × Contact × Knowledge Triple Nexus (TCKTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 618,
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
        ◈ TCKTRI
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
