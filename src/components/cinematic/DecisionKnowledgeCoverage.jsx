/**
 * F92 — Decision × Knowledge Coverage
 *
 * Parallel-fetches /v1/decision/list + /knowledge/, then keyword-correlates
 * each recorded strategic decision (title/reason/alternatives/expected_outcome)
 * against knowledge article titles and content to surface whether the decision
 * is KNOWLEDGE-BACKED (at least one article supports it) or BLIND (no
 * documented knowledge foundation found).
 *
 * Stat tiles: decisions / articles / backed / blind.
 * Filter tabs: ALL | BACKED | BLIND.
 * Expand any decision → matched articles with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI knowledge-gap brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ DKNOW  at bottom:8 left:25040, zIndex 69.
 * Voice:   "decision knowledge / knowledge decision / backed decisions /
 *           decision docs / dknow"
 * Event:   jarvis:dknow-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 25040;
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

const DKNOW_RE =
  /\b(decision\s+knowledge|knowledge\s+decision|knowledge[\s-]backed\s+decisions?|decision\s+(docs?|articles?)|blind\s+decisions?|decision\s+backing|strategic\s+knowledge\s+(gap|coverage)|dknow)\b/i;

export function isDknowQuery(q) { return DKNOW_RE.test(q); }

export async function buildDknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [dRes, kRes] = await Promise.all([
      fetch(`${base}/v1/decision/list`, { headers: hdr }),
      fetch(`${base}/knowledge/`,       { headers: hdr }),
    ]);
    const dRaw = await dRes.json();
    const kRaw = await kRes.json();
    const decisions = normaliseDecisions(dRaw);
    const articles  = normaliseArticles(kRaw);

    const backed = decisions.filter((d) =>
      articles.some((a) => relevance(d, a) > 0)
    ).length;
    const blind = decisions.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS decision knowledge coverage: ${decisions.length} recorded strategic decisions, ` +
          `${articles.length} knowledge articles, ${backed} decisions with documented knowledge backing, ` +
          `${blind} decisions with zero knowledge support (blind spots). ` +
          `Give a 2-sentence strategic knowledge-gap assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Decision knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Decision knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseDecisions(raw) {
  const arr = Array.isArray(raw)            ? raw
    : Array.isArray(raw?.data)              ? raw.data
    : Array.isArray(raw?.decisions)         ? raw.decisions
    : Array.isArray(raw?.items)             ? raw.items
    : Array.isArray(raw?.results)           ? raw.results
    : [];
  return arr.map((d, i) => ({
    id:               d.id               || String(i),
    title:            d.title            || d.name        || `Decision ${i + 1}`,
    reason:           (d.reason          || d.rationale   || d.description || "").toString().slice(0, 300),
    alternatives:     Array.isArray(d.alternatives) ? d.alternatives.join(" ") : (d.alternatives || ""),
    expected_outcome: (d.expected_outcome || d.outcome || d.expected || "").toString().slice(0, 200),
    status:           d.status           || d.state       || "",
    risks:            Array.isArray(d.risks) ? d.risks.join(" ") : (d.risks || ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.knowledge)           ? raw.knowledge
    : Array.isArray(raw?.articles)            ? raw.articles
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : Array.isArray(raw?.chunks)              ? raw.chunks
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || String(i),
    title:   a.title   || a.name   || a.heading || `Article ${i + 1}`,
    content: (a.content || a.body || a.text || a.summary || a.description || "").toString().slice(0, 400),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(decision, article) {
  const dw = keywords(
    `${decision.title} ${decision.reason} ${decision.alternatives} ${decision.expected_outcome} ${decision.risks}`
  );
  const aw = keywords(`${article.title} ${article.content} ${article.tags}`);
  return dw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildCorrelated(decisions, articles) {
  return decisions.map((d) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(d, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...d, articles: matched, backed: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "BLIND"];

export default function DecisionKnowledgeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [decisions, setDecisions] = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [dRes, kRes] = await Promise.all([
        fetch(`${base}/v1/decision/list`, { headers: hdr }),
        fetch(`${base}/knowledge/`,       { headers: hdr }),
      ]);
      setDecisions(normaliseDecisions(await dRes.json()));
      setArticles(normaliseArticles(await kRes.json()));
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
    window.addEventListener("jarvis:dknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isDknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(decisions, articles);
  const backed     = correlated.filter((d) => d.backed).length;
  const blind      = correlated.filter((d) => !d.backed).length;

  const visible = correlated.filter((d) => {
    if (filter === "BACKED") return d.backed;
    if (filter === "BLIND")  return !d.backed;
    const q = query.toLowerCase();
    return !q || d.title.toLowerCase().includes(q) || d.reason.toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    const text = await buildDknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Decision × Knowledge Coverage (◈ DKNOW)"
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
        ◈ DKNOW{blind > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{blind}</span>
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
              DECISION–KNOWLEDGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || decisions.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || decisions.length === 0) ? 0.4 : 1,
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
              { label: "DECISIONS", val: decisions.length, color: C.neon    },
              { label: "ARTICLES",  val: articles.length,  color: C.blue    },
              { label: "BACKED",    val: backed,            color: "#4ADE80" },
              { label: "BLIND",     val: blind,             color: "#FF8800" },
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
          <div style={{
            display: "flex", gap: 4, padding: "0 12px 8px",
            borderBottom: `1px solid ${S.border}`,
          }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.textMuted,
                borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          {filter === "ALL" && (
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search decisions…"
              style={{
                margin: "6px 12px 2px",
                background: "rgba(0,0,0,0.4)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none",
              }}
            />
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px 10px" }}>
            {loading && decisions.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>◌ loading…</div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: S.textMuted, padding: "12px 0" }}>no decisions in this filter</div>
            )}
            {visible.map((d) => (
              <div key={d.id} style={{
                borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 6,
              }}>
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    gap: 6, cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: d.backed ? "#4ADE80" : "#FF8800",
                      fontWeight: 600, marginBottom: 2,
                    }}>
                      {d.backed ? "● BACKED" : "○ BLIND"}
                      <span style={{ color: S.textHi, fontWeight: 400, marginLeft: 6 }}>
                        {d.title}
                      </span>
                    </div>
                    {d.reason && (
                      <div style={{ color: S.textMuted, fontSize: "9px" }}>
                        {d.reason.slice(0, 80)}{d.reason.length > 80 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <span style={{ color: S.textMuted, fontSize: "9px", flexShrink: 0 }}>
                    {d.articles.length > 0 ? `${d.articles.length} art.` : "—"}
                  </span>
                </div>

                {expanded === d.id && d.articles.length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 8 }}>
                    {d.articles.slice(0, 4).map((a) => (
                      <div key={a.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "3px 0", borderTop: `1px solid ${S.border}`,
                      }}>
                        <span style={{ color: C.blue, fontSize: "9px" }}>
                          {a.title.slice(0, 36)}{a.title.length > 36 ? "…" : ""}
                        </span>
                        <span style={{
                          color: S.textMuted, fontSize: "9px",
                          background: "rgba(0,200,120,0.12)",
                          borderRadius: 4, padding: "0 4px",
                        }}>
                          {a.score}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === d.id && d.articles.length === 0 && (
                  <div style={{
                    marginTop: 6, paddingLeft: 8,
                    color: "#FF8800", fontSize: "9px",
                  }}>
                    ⚠ no knowledge articles found for this decision
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
