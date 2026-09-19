/**
 * F151 — Knowledge × Task Coverage (KBTASK)
 *
 * Parallel-fetches /knowledge/ + /entities/Task, then
 * keyword-correlates each KB article (title/category/summary/tags/content)
 * against active tasks (title/description/priority/tags) to surface:
 *
 *   TASKED   — at least one active task engages this knowledge domain
 *   ARCHIVAL — no task coverage — knowledge not operationally activated
 *
 * Stat tiles: KB articles / tasks / tasked / archival
 * Filter tabs: ALL | TASKED | ARCHIVAL + text search
 * Expand any article → matched tasks with priority badge + status badge + relevance score bar.
 * Purple badge on TASKED count.
 * ▶ ASSESS: 2-sentence knowledge-task activation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KBTASK  at bottom:8 left:713200, zIndex:302.
 * Event:   jarvis:kbtask-toggle
 * Voice:   "knowledge task / task knowledge / kbtask / tasked knowledge /
 *           active knowledge / archival knowledge / operational knowledge /
 *           knowledge task coverage / which knowledge has tasks /
 *           knowledge domain task"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 713200;
const POLL_MS  = 90_000;
const PURPLE   = "#A78BFA";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const GREEN    = "#34D399";
const AMBER    = "#F59E0B";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const KBTASK_RE =
  /\b(knowledge\s+task|task\s+knowledge|kbtask|tasked\s+knowledge|active\s+knowledge|archival\s+knowledge|operational\s+knowledge|knowledge\s+task\s+coverage|which\s+knowledge\s+has\s+tasks|knowledge\s+domain\s+task)\b/i;

export function isKbtaskQuery(q) { return KBTASK_RE.test(q); }

export async function buildKbtaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [kbRes, taskRes] = await Promise.all([
      fetch(`${base}/knowledge/`,       { headers: hdr }),
      fetch(`${base}/entities/Task`,    { headers: hdr }),
    ]);
    const articles = normaliseArticles(await kbRes.json());
    const tasks    = normaliseTasks(await taskRes.json());

    const tasked   = articles.filter(
      (a) => tasks.some((t) => relevance(a, t) > 0)
    ).length;
    const archival = articles.length - tasked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS knowledge task activation brief: ${articles.length} knowledge-base articles ` +
          `correlated against ${tasks.length} active tasks. ` +
          `${tasked} articles are TASKED (at least one active task engages their domain); ` +
          `${archival} articles remain ARCHIVAL (no task coverage — knowledge not operationally activated). ` +
          `Provide a 2-sentence knowledge-task activation assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Knowledge task activation analysis complete, sir.").trim();
  } catch {
    return "Knowledge task coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.knowledge)
    ? raw.knowledge
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || String(i),
    label:    a.title    || a.name     || a.subject  || `Article ${i + 1}`,
    category: a.category || a.type     || a.kind     || "KB",
    tokens:   tok(
      `${a.title || ""} ${a.name || ""} ${a.summary || ""} ${a.description || ""} ${(a.tags || []).join(" ")} ${a.content || ""}`
    ),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)
    ? raw.tasks
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((t, i) => ({
    id:       t.id          || String(i),
    label:    t.title       || t.name        || t.subject     || `Task ${i + 1}`,
    status:   t.status      || t.state       || "active",
    priority: t.priority    || t.severity    || "",
    tokens:   tok(
      `${t.title || ""} ${t.name || ""} ${t.description || ""} ${t.mission || ""} ${(t.tags || []).join(" ")}`
    ),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(article, task) {
  const av = new Set(article.tokens);
  return task.tokens.filter((w) => av.has(w)).length;
}

function buildLinked(articles, tasks) {
  return articles.map((a) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(a, t) }))
      .filter((t) => t.score > 0)
      .sort((t1, t2) => t2.score - t1.score)
      .slice(0, 6);
    return { ...a, tasks: matched, tasked: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TASKED", "ARCHIVAL"];

const PRIORITY_COLOR = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#F59E0B",
  low:      "#6B7280",
};

export default function KnowledgeTaskCoverage() {
  const [open,     setOpen]     = useState(false);
  const [data,     setData]     = useState([]);   // linked articles
  const [stats,    setStats]    = useState({ articles: 0, tasks: 0, tasked: 0, archival: 0 });
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [kbRes, taskRes] = await Promise.all([
        fetch(`${base}/knowledge/`,    { headers: hdr }),
        fetch(`${base}/entities/Task`, { headers: hdr }),
      ]);
      const articles = normaliseArticles(await kbRes.json());
      const tasks    = normaliseTasks(await taskRes.json());
      const linked   = buildLinked(articles, tasks);
      const tasked   = linked.filter((a) => a.tasked).length;
      setData(linked);
      setStats({ articles: articles.length, tasks: tasks.length, tasked, archival: articles.length - tasked });
    } catch {
      /* silently keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen((v) => {
        const next = !v;
        if (next) load();
        return next;
      });
    };
    window.addEventListener("jarvis:kbtask-toggle", toggle);
    return () => window.removeEventListener("jarvis:kbtask-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = await buildKbtaskScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const badge = stats.tasked > 0;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Knowledge × Task Coverage — KBTASK"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 302,
          background: "rgba(0,0,0,0.55)", border: `1px solid ${badge ? PURPLE : "#334155"}`,
          borderRadius: 6, color: badge ? PURPLE : SLATE, fontSize: 10,
          fontFamily: "monospace", padding: "2px 6px", cursor: "pointer",
          backdropFilter: "blur(6px)", letterSpacing: "0.05em",
        }}
      >
        ◈ KBTASK {badge ? <span style={{ color: PURPLE }}>({stats.tasked})</span> : ""}
      </button>
    );
  }

  const visible = data.filter((a) => {
    if (tab === "TASKED"   && !a.tasked)  return false;
    if (tab === "ARCHIVAL" &&  a.tasked)  return false;
    if (search) {
      const q = search.toLowerCase();
      return a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 480, maxHeight: "calc(100vh - 80px)",
      background: "rgba(5,12,20,0.97)", border: "1px solid #1E3A5F",
      borderRadius: 10, zIndex: 302, display: "flex", flexDirection: "column",
      fontFamily: "monospace", overflow: "hidden", boxShadow: "0 0 32px rgba(0,0,0,0.7)",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1E3A5F", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: PURPLE, fontSize: 13, fontWeight: 700, flex: 1 }}>◈ KNOWLEDGE × TASK COVERAGE</span>
        <button onClick={assess} disabled={assessing}
          style={{ fontSize: 10, padding: "2px 8px", background: "rgba(167,139,250,0.15)",
            border: `1px solid ${PURPLE}`, borderRadius: 4, color: PURPLE, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ fontSize: 11, background: "none", border: "none", color: SLATE, cursor: "pointer" }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #0F2133" }}>
        {[
          { label: "KB ARTICLES", value: stats.articles, color: BLUE   },
          { label: "TASKS",       value: stats.tasks,    color: SLATE  },
          { label: "TASKED",      value: stats.tasked,   color: PURPLE },
          { label: "ARCHIVAL",    value: stats.archival, color: AMBER  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6,
            padding: "6px 4px", textAlign: "center", border: `1px solid ${color}22` }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: "0.06em" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderBottom: "1px solid #0F2133" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
              background: tab === t ? `${PURPLE}22` : "transparent",
              border: `1px solid ${tab === t ? PURPLE : "#334155"}`,
              color: tab === t ? PURPLE : SLATE }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
            background: "rgba(255,255,255,0.05)", border: "1px solid #334155",
            color: "#CBD5E1", outline: "none", width: 130 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {loading && !data.length && (
          <div style={{ color: SLATE, fontSize: 11, textAlign: "center", padding: 20 }}>Loading…</div>
        )}
        {!loading && !visible.length && (
          <div style={{ color: SLATE, fontSize: 11, textAlign: "center", padding: 20 }}>No articles match.</div>
        )}
        {visible.map((article) => (
          <div key={article.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === article.id ? null : article.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px",
                background: "rgba(255,255,255,0.03)", borderRadius: 6, cursor: "pointer",
                border: `1px solid ${article.tasked ? "#1E3A5F" : "#1E2A3A"}` }}
            >
              <span style={{ fontSize: 9, color: article.tasked ? PURPLE : AMBER,
                background: article.tasked ? `${PURPLE}22` : `${AMBER}22`,
                borderRadius: 3, padding: "1px 5px", fontWeight: 700, minWidth: 60, textAlign: "center" }}>
                {article.tasked ? "TASKED" : "ARCHIVAL"}
              </span>
              <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {article.label}
              </span>
              <span style={{ fontSize: 9, color: SLATE, background: "rgba(255,255,255,0.05)",
                borderRadius: 3, padding: "1px 5px" }}>
                {article.category}
              </span>
              {article.tasked && (
                <span style={{ fontSize: 9, color: PURPLE }}>{article.tasks.length} task{article.tasks.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {expanded === article.id && (
              <div style={{ padding: "6px 8px 2px 16px" }}>
                {article.tasked ? (
                  article.tasks.map((t) => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6,
                      marginBottom: 4, padding: "4px 6px",
                      background: "rgba(167,139,250,0.06)", borderRadius: 4 }}>
                      <span style={{ fontSize: 9, color: PRIORITY_COLOR[t.priority?.toLowerCase()] || SLATE,
                        border: `1px solid ${PRIORITY_COLOR[t.priority?.toLowerCase()] || SLATE}`,
                        borderRadius: 3, padding: "1px 4px", minWidth: 42, textAlign: "center" }}>
                        {(t.priority || "—").toUpperCase().slice(0, 6)}
                      </span>
                      <span style={{ fontSize: 9, color: GREEN, background: `${GREEN}15`,
                        borderRadius: 3, padding: "1px 4px" }}>
                        {(t.status || "active").toLowerCase().slice(0, 10)}
                      </span>
                      <span style={{ color: "#94A3B8", fontSize: 9, flex: 1,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.label}
                      </span>
                      <div style={{ width: 60, height: 4, background: "#0F2133", borderRadius: 2, flexShrink: 0 }}>
                        <div style={{ height: "100%", borderRadius: 2, background: PURPLE,
                          width: `${Math.min(100, t.score * 12)}%` }} />
                      </div>
                      <span style={{ fontSize: 9, color: SLATE, minWidth: 20, textAlign: "right" }}>{t.score}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 9, color: AMBER, padding: "4px 0" }}>
                    No active tasks engage this knowledge domain — archival only.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ padding: "6px 14px", borderTop: "1px solid #0F2133",
        display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: SLATE, fontSize: 9 }}>
          {loading ? "Refreshing…" : `${visible.length} of ${data.length} articles · auto-refresh 90s`}
        </span>
        <button onClick={load} style={{ fontSize: 9, padding: "1px 6px",
          background: "transparent", border: `1px solid #334155`,
          borderRadius: 3, color: SLATE, cursor: "pointer" }}>↺</button>
      </div>
    </div>
  );
}
