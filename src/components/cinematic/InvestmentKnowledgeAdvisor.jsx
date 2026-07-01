/**
 * F88 — Investment × Knowledge Advisor
 *
 * Parallel-fetches /entities/Investment + /knowledge/, then keyword-correlates
 * each holding (name / type / sector / description) against knowledge article
 * titles and content to surface whether a position is RESEARCHED (at least one
 * article backs it) or DARK (no knowledge documentation found).
 *
 * Stat tiles: investments / articles / researched / dark.
 * Filter tabs: ALL | RESEARCHED | DARK + text search.
 * Expand any investment → matched articles with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI portfolio-knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ INVKNOW  at bottom:8 left:22800, zIndex 69.
 * Voice:   "investment knowledge / portfolio research / which investments have
 *           docs / researched investments / dark holdings / invknow"
 * Event:   jarvis:invknow-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 22800;
const POLL_MS  = 120_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const INVKNOW_RE =
  /\b(investment\s+knowledge|portfolio\s+research|which\s+investments?\s+(have\s+)?(docs?|articles?|research|knowledge)|researched\s+investments?|dark\s+holdings?|invest(?:ment)?\s+docs?|invknow)\b/i;

export function isInvknowQuery(q) { return INVKNOW_RE.test(q); }

export async function buildInvknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [iRes, kRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/knowledge/`,          { headers: hdr }),
    ]);
    const iRaw = await iRes.json();
    const kRaw = await kRes.json();
    const investments = normaliseInvestments(iRaw);
    const articles    = normaliseArticles(kRaw);

    const researched = investments.filter((inv) =>
      articles.some((a) => relevance(inv, a) > 0)
    ).length;
    const dark = investments.length - researched;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS portfolio-knowledge coverage: ${investments.length} investments, ` +
          `${articles.length} knowledge articles, ${researched} holdings with documented research, ` +
          `${dark} holdings with no knowledge backing. ` +
          `Give a 2-sentence portfolio-knowledge brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Portfolio knowledge analysis complete, sir.").trim();
  } catch {
    return "Investment knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.investments)       ? raw.investments
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((inv, i) => ({
    id:          inv.id           || String(i),
    name:        inv.name         || inv.ticker   || inv.symbol   || `Investment ${i + 1}`,
    type:        inv.type         || inv.asset_type || inv.category || "",
    sector:      inv.sector       || inv.industry  || "",
    description: (inv.description || inv.notes     || inv.details  || "").toString().slice(0, 200),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.knowledge)         ? raw.knowledge
    : Array.isArray(raw?.articles)          ? raw.articles
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : Array.isArray(raw?.chunks)            ? raw.chunks
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || String(i),
    title:   a.title   || a.name    || a.heading || `Article ${i + 1}`,
    content: (a.content || a.body   || a.text    || a.summary || a.description || "").toString().slice(0, 400),
    tags:    Array.isArray(a.tags)  ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(investment, article) {
  const iw = keywords(`${investment.name} ${investment.type} ${investment.sector} ${investment.description}`);
  const aw = keywords(`${article.title} ${article.content} ${article.tags}`);
  return iw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildCorrelated(investments, articles) {
  return investments.map((inv) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(inv, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, articles: matched, researched: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "RESEARCHED", "DARK"];

export default function InvestmentKnowledgeAdvisor() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [iRes, kRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/knowledge/`,          { headers: hdr }),
      ]);
      const iRaw = await iRes.json();
      const kRaw = await kRes.json();
      setInvestments(normaliseInvestments(iRaw));
      setArticles(normaliseArticles(kRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isInvknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelated(investments, articles);
  const researched  = correlated.filter((inv) => inv.researched).length;
  const dark        = correlated.filter((inv) => !inv.researched).length;

  const sq = search.toLowerCase();
  const visible = correlated.filter((inv) => {
    if (filter === "RESEARCHED" && !inv.researched) return false;
    if (filter === "DARK"       &&  inv.researched) return false;
    if (sq && !`${inv.name} ${inv.type} ${inv.sector}`.toLowerCase().includes(sq)) return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildInvknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Investment–Knowledge Advisor (◈ INVKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ INVKNOW{dark > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              INVESTMENT–KNOWLEDGE ADVISOR
            </span>
            <button
              onClick={assess}
              disabled={assessing || investments.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || investments.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "INVEST",     val: investments.length, color: C.neon    },
              { label: "ARTICLES",   val: articles.length,    color: C.blue    },
              { label: "RESEARCHED", val: researched,         color: "#4ADE80" },
              { label: "DARK",       val: dark,               color: "#FF8800" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search holdings…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs, padding: "4px 8px",
                outline: "none",
              }}
            />
          </div>

          {/* Investment list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && investments.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No investments match.</div>
            ) : visible.map((inv) => (
              <div key={inv.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${inv.researched ? "#4ADE80" : "#FF8800"}`,
                  }}
                >
                  <span style={{ color: inv.researched ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                    {inv.researched ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.name}
                  </span>
                  {inv.type && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {inv.type}
                    </span>
                  )}
                  <span style={{ color: inv.researched ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 40, textAlign: "right" }}>
                    {inv.researched ? `${inv.articles.length} ART` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === inv.id ? "▴" : "▾"}</span>
                </div>

                {expanded === inv.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {inv.researched ? inv.articles.map((a) => (
                      <div key={a.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap" }}>
                          rel:{a.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching knowledge articles found for this holding.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/Investment · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
