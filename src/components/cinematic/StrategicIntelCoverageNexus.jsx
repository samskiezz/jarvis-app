/**
 * F211 — Knowledge × Task × Investment Strategic Intelligence Coverage Nexus (STICNEX)
 *
 * Parallel-fetches /knowledge/ + /entities/Task + /entities/Investment
 * and keyword-correlates each knowledge article against tasks AND investments to
 * classify strategic intelligence coverage:
 *
 *   FULLY_MAPPED        — matched tasks + investments (article is strategically grounded)
 *   TASK_LINKED         — tasks present, no investment match
 *   INVESTMENT_BACKED   — investment linked, no task match
 *   ISOLATED            — neither tasks nor investments (strategic intel gap)
 *
 * Stat tiles: KB ARTICLES / TASKS / INVESTMENTS + four class counts + COVERAGE%.
 * Amber badge on ISOLATED count.
 * Filter tabs ALL / FULLY_MAPPED / TASK_LINKED / INVESTMENT_BACKED / ISOLATED + text search.
 * Expand article → matched task cards (cyan) + investment cards (green) with relevance bars.
 * ▶ ASSESS STRATEGIC COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:sticnex-toggle event.
 *
 * Voice triggers:
 *   "sticnex / strategic intel coverage / knowledge task investment /
 *    isolated knowledge / investment knowledge coverage / knowledge strategy"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_061_080;
const Z_INDEX  = 273;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const STICNEX_RE = /\b(sticnex|strategic[\s-]intel[\s-]coverage|knowledge[\s-]task[\s-]investment|isolated[\s-]knowledge|investment[\s-]knowledge[\s-]coverage|knowledge[\s-]strategy)\b/i;
export function isSticnexQuery(q = "") { return STICNEX_RE.test(q); }

function keywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function scoreText(target = "", kws = []) {
  if (!kws.length || !target) return 0;
  const t = target.toLowerCase();
  return kws.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0) / kws.length;
}

function articleText(a = {}) {
  return [a.title, a.content, a.summary, a.category, a.tags?.join(" ")].filter(Boolean).join(" ");
}
function taskText(t = {}) {
  return [t.title, t.name, t.description, t.status, t.priority, t.tags?.join(" ")].filter(Boolean).join(" ");
}
function investmentText(inv = {}) {
  return [inv.name, inv.title, inv.description, inv.type, inv.sector, inv.tags?.join(" ")].filter(Boolean).join(" ");
}

const THRESHOLD = 0.08;

function classifyArticle(article, tasks, investments) {
  const kws = keywords(articleText(article));
  const matchedTasks       = tasks.filter(t   => scoreText(taskText(t),       kws) >= THRESHOLD);
  const matchedInvestments = investments.filter(i => scoreText(investmentText(i), kws) >= THRESHOLD);
  const hasTask       = matchedTasks.length > 0;
  const hasInvestment = matchedInvestments.length > 0;
  const category =
    hasTask && hasInvestment ? "FULLY_MAPPED"        :
    hasTask                  ? "TASK_LINKED"         :
    hasInvestment            ? "INVESTMENT_BACKED"   :
                               "ISOLATED";
  return { ...article, category, matchedTasks, matchedInvestments };
}

export async function buildSticnexScript() {
  const base = apiBase();
  const [kRes, tRes, iRes] = await Promise.allSettled([
    fetch(`${base}/knowledge/`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Task`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Investment`,{ headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const rawArticles     = kRes.status === "fulfilled" ? (kRes.value?.items || kRes.value?.data || kRes.value || []) : [];
  const rawTasks        = tRes.status === "fulfilled" ? (tRes.value?.items || tRes.value?.data || []) : [];
  const rawInvestments  = iRes.status === "fulfilled" ? (iRes.value?.items || iRes.value?.data || []) : [];
  const articles        = rawArticles.map(a => classifyArticle(a, rawTasks, rawInvestments));
  const isolated        = articles.filter(a => a.category === "ISOLATED").length;
  const fullyMapped     = articles.filter(a => a.category === "FULLY_MAPPED").length;
  const pct             = articles.length ? Math.round((fullyMapped / articles.length) * 100) : 0;
  return `STICNEX Strategic Intelligence Coverage Nexus online, sir. Cross-referencing ${articles.length} knowledge articles against ` +
    `${rawTasks.length} active tasks and ${rawInvestments.length} investments. ` +
    `Full strategic coverage: ${pct}%. ${isolated} article${isolated === 1 ? "" : "s"} isolated — ` +
    `no matching task or investment link. Strategic intelligence realignment recommended, sir.`;
}

const CAT_LABEL = {
  FULLY_MAPPED:      "FULLY MAPPED",
  TASK_LINKED:       "TASK LINKED",
  INVESTMENT_BACKED: "INVESTMENT BACKED",
  ISOLATED:          "ISOLATED",
};
const CAT_COLOR = {
  FULLY_MAPPED:      "#29E7FF",
  TASK_LINKED:       "#34D399",
  INVESTMENT_BACKED: "#A78BFA",
  ISOLATED:          "#6B7280",
};
const TABS = ["ALL", "FULLY_MAPPED", "TASK_LINKED", "INVESTMENT_BACKED", "ISOLATED"];

export default function StrategicIntelCoverageNexus() {
  const [open, setOpen]           = useState(false);
  const [articles, setArticles]   = useState([]);
  const [tasks, setTasks]         = useState([]);
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [kR, tR, iR] = await Promise.allSettled([
        fetch(`${base}/knowledge/`,         { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Task`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Investment`,{ headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const rawArticles    = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.data || kR.value || []) : [];
      const rawTasks       = tR.status === "fulfilled" ? (tR.value?.items || tR.value?.data || []) : [];
      const rawInvestments = iR.status === "fulfilled" ? (iR.value?.items || iR.value?.data || []) : [];
      setTasks(rawTasks);
      setInvestments(rawInvestments);
      setArticles(rawArticles.map(a => classifyArticle(a, rawTasks, rawInvestments)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timer.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(timer.current);
    }
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:sticnex-toggle", h);
    return () => window.removeEventListener("jarvis:sticnex-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (!articles.length) return;
    setAssessing(true);
    setBrief("");
    try {
      const base     = apiBase();
      const isolated = articles.filter(a => a.category === "ISOLATED").length;
      const mapped   = articles.filter(a => a.category === "FULLY_MAPPED").length;
      const pct      = articles.length ? Math.round((mapped / articles.length) * 100) : 0;
      const ctx      = `STICNEX: ${articles.length} KB articles, ${mapped} fully mapped (${pct}%), ${isolated} isolated with no task or investment link.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess strategic intelligence coverage gaps: ${ctx}` }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: txt }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [articles]);

  const classified    = articles.reduce((acc, a) => { acc[a.category] = (acc[a.category] || 0) + 1; return acc; }, {});
  const isolated      = classified["ISOLATED"] || 0;
  const fullyMapped   = classified["FULLY_MAPPED"] || 0;
  const total         = articles.length;
  const pct           = total ? Math.round((fullyMapped / total) * 100) : 0;
  const barColor      = pct >= 70 ? "#29E7FF" : pct >= 40 ? "#FCD34D" : "#F87171";

  const filtered = articles.filter(a => {
    if (tab !== "ALL" && a.category !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (a.title || a.id || "").toLowerCase().includes(s) ||
             (a.content || a.summary || "").toLowerCase().includes(s);
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(15,25,40,0.85)", border: "1px solid rgba(41,231,255,0.35)",
          color: "#29E7FF", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1, padding: "4px 10px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {isolated > 0 && (
          <span style={{
            background: "#F59E0B", color: "#000", borderRadius: "50%", fontSize: 8,
            minWidth: 14, height: 14, display: "inline-flex", alignItems: "center",
            justifyContent: "center", padding: "0 3px",
          }}>
            {isolated}
          </span>
        )}
        ◈ STICNEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 280, zIndex: Z_INDEX,
      width: 620, maxHeight: "72vh", background: "rgba(8,18,30,0.97)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 6,
      display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 0 24px rgba(41,231,255,0.08)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: "1px solid rgba(41,231,255,0.15)", flexShrink: 0,
      }}>
        <span style={{ color: "#29E7FF", fontSize: 9, letterSpacing: 2 }}>◈ STICNEX — STRATEGIC INTEL COVERAGE NEXUS</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B9BAF", cursor: "pointer", fontSize: 11 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          { label: "KB ARTICLES",       val: total,                                          color: "#29E7FF" },
          { label: "TASKS",             val: tasks.length,                                   color: "#34D399" },
          { label: "INVESTMENTS",       val: investments.length,                             color: "#A78BFA" },
          { label: "FULLY MAPPED",      val: fullyMapped,                                    color: "#29E7FF" },
          { label: "TASK LINKED",       val: classified["TASK_LINKED"]       || 0,           color: "#34D399" },
          { label: "INVEST BACKED",     val: classified["INVESTMENT_BACKED"] || 0,           color: "#A78BFA" },
          { label: "ISOLATED",          val: isolated,                                       color: "#F87171" },
          { label: "COVERAGE%",         val: `${pct}%`,                                      color: barColor  },
        ].map(t => (
          <div key={t.label} style={{
            background: "rgba(41,231,255,0.05)", border: "1px solid rgba(41,231,255,0.12)",
            borderRadius: 4, padding: "4px 8px", minWidth: 64,
          }}>
            <div style={{ fontSize: 7, color: "#6B9BAF", letterSpacing: 1 }}>{t.label}</div>
            <div style={{ fontSize: 13, color: t.color, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      {total > 0 && (
        <div style={{ margin: "0 12px 6px", height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "4px 12px", flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(41,231,255,0.18)" : "rgba(41,231,255,0.04)",
            border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(41,231,255,0.12)"}`,
            color: tab === t ? "#29E7FF" : "#6B9BAF", fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8, letterSpacing: 1, padding: "3px 8px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {CAT_LABEL[t] || t}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "4px 12px", flexShrink: 0 }}>
        <input
          placeholder="SEARCH KB ARTICLES…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)", border: "1px solid rgba(41,231,255,0.2)",
            color: "#C0D8E8", fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            padding: "4px 8px", borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Article list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 12px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 16, color: "#29E7FF", fontSize: 9 }}>◌ LOADING…</div>
        )}
        {filtered.map((article, i) => {
          const isExp = expanded === (article.id || i);
          return (
            <div
              key={article.id || i}
              style={{
                marginBottom: 4, background: "rgba(41,231,255,0.03)",
                border: `1px solid ${article.category === "ISOLATED" ? "rgba(248,113,113,0.3)" : "rgba(41,231,255,0.12)"}`,
                borderRadius: 4, padding: "6px 8px",
              }}
            >
              <div
                onClick={() => setExpanded(isExp ? null : (article.id || i))}
                style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                <span style={{
                  fontSize: 8, padding: "1px 5px", borderRadius: 2,
                  background: `${CAT_COLOR[article.category]}22`, color: CAT_COLOR[article.category],
                  letterSpacing: 1, flexShrink: 0,
                }}>
                  {CAT_LABEL[article.category]}
                </span>
                <span style={{ fontSize: 9, color: "#C0D8E8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {article.title || article.id || "Untitled Article"}
                </span>
                {article.category && (
                  <span style={{ fontSize: 7, color: "#6B9BAF", flexShrink: 0 }}>
                    {(article.category || "").toUpperCase().slice(0, 6)}
                  </span>
                )}
                <span style={{ fontSize: 8, color: "#29E7FF", flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 6, paddingLeft: 8, fontSize: 8, color: "#8AA8B8", lineHeight: 1.6 }}>
                  {article.summary || article.content?.slice(0, 120) || "No description available."}
                  {article.matchedTasks?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#34D399", letterSpacing: 1, marginBottom: 3 }}>TASKS ({article.matchedTasks.length})</div>
                      {article.matchedTasks.slice(0, 4).map((t, ti) => (
                        <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: "rgba(52,211,153,0.12)", color: "#34D399" }}>
                            {(t.priority || t.status || "TASK").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {t.title || t.name || t.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {article.matchedInvestments?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ color: "#A78BFA", letterSpacing: 1, marginBottom: 3 }}>INVESTMENTS ({article.matchedInvestments.length})</div>
                      {article.matchedInvestments.slice(0, 4).map((inv, ii) => (
                        <div key={ii} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ fontSize: 7, padding: "1px 4px", borderRadius: 2, background: "rgba(167,139,250,0.12)", color: "#A78BFA" }}>
                            {(inv.type || inv.sector || "INVEST").toUpperCase().slice(0, 8)}
                          </span>
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {inv.name || inv.title || inv.id}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 24, color: "#6B9BAF", fontSize: 9 }}>NO ARTICLES MATCH CURRENT FILTER</div>
        )}
      </div>

      {/* AI Assess */}
      <div style={{ borderTop: "1px solid rgba(41,231,255,0.15)", padding: "8px 12px", flexShrink: 0 }}>
        {brief && (
          <div style={{
            marginBottom: 6, fontSize: 8, color: "#A0C8D8", lineHeight: 1.6,
            maxHeight: 80, overflowY: "auto", background: "rgba(41,231,255,0.05)",
            borderRadius: 4, padding: "4px 8px",
          }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing || articles.length === 0}
          style={{
            background: assessing ? "rgba(41,231,255,0.08)" : "rgba(41,231,255,0.14)",
            border: "1px solid rgba(41,231,255,0.4)", color: assessing ? "#6B9BAF" : "#29E7FF",
            fontFamily: "'JetBrains Mono',monospace", fontSize: 9, letterSpacing: 1,
            padding: "5px 14px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS STRATEGIC COVERAGE"}
        </button>
      </div>
    </div>
  );
}
