/**
 * F113 — Ops Event × Knowledge Coverage Advisor
 *
 * Parallel-fetches /v1/ops/events + /knowledge/ then keyword-correlates each
 * ops event (type / message / service / actor) against the knowledge article
 * catalogue to surface:
 *   DOCUMENTED — event linked to at least one knowledge article (runbook/procedure exists)
 *   DARK       — event with no knowledge coverage (response gap)
 *
 * Stat tiles: events / articles / documented / dark.
 * Filter tabs: ALL | DOCUMENTED | DARK.
 * Text search across event messages.
 * Expand any event → matched articles with relevance score + type badge.
 * Amber badge on dark-event count.
 * ▶ ASSESS: 2-sentence AI ops-knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OEKNOW  at bottom:8 left:32360, zIndex 70.
 * Voice:   "ops event knowledge / event docs / runbook coverage /
 *           dark events / oeknow"
 * Event:   jarvis:oeknow-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 32360;
const POLL_MS  = 90_000;

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

const OEKNOW_RE =
  /\b(ops\s+event\s+know|event\s+docs?|runbook\s+coverage|dark\s+events?|oeknow)\b/i;

export function isOeknowQuery(q) { return OEKNOW_RE.test(q); }

export async function buildOeknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, knRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`, { headers: hdr }),
      fetch(`${base}/knowledge/`,    { headers: hdr }),
    ]);
    const evRaw = await evRes.json();
    const knRaw = await knRes.json();
    const events   = normaliseEvents(evRaw);
    const articles = normaliseArticles(knRaw);

    const documented = events.filter(
      (ev) => articles.some((art) => relevance(ev, art) > 0)
    ).length;
    const dark = events.length - documented;
    const critDark = events.filter(
      (ev) =>
        (ev.severity || "").toLowerCase() === "critical" &&
        !articles.some((art) => relevance(ev, art) > 0)
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops-event knowledge coverage analysis: ${events.length} recent operational events ` +
          `examined against ${articles.length} knowledge articles. ${documented} events are DOCUMENTED ` +
          `(at least one runbook or knowledge article provides coverage), ${dark} events are DARK ` +
          `(no knowledge backing — response gap), including ${critDark} CRITICAL events with no coverage. ` +
          `Give a 2-sentence ops-knowledge readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops-knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Ops-knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ────────────────────────────────────────────────────────

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.events)          ? raw.events
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr
    .map((ev, i) => ({
      id:        ev.id          || String(i),
      message:   ev.message     || ev.title    || ev.description || ev.msg   || `Event ${i + 1}`,
      severity:  (ev.severity   || ev.level    || ev.type        || "info").toLowerCase(),
      service:   ev.service     || ev.source   || ev.actor       || ev.component || "",
      eventType: ev.event_type  || ev.type     || ev.kind        || "",
      ts:        ev.timestamp   || ev.created_at || ev.time      || null,
    }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.articles)               ? raw.articles
    : Array.isArray(raw?.results)                ? raw.results
    : Array.isArray(raw?.items)                  ? raw.items
    : [];
  return arr.map((a, i) => ({
    id:      a.id       || String(i),
    title:   a.title    || a.name    || a.heading || `Article ${i + 1}`,
    content: (a.content || a.summary || a.body    || a.text || "").toString().slice(0, 300),
    type:    a.type     || a.category || a.kind   || "",
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(event, article) {
  const ew = keywords(`${event.message} ${event.service} ${event.eventType}`);
  const aw = keywords(`${article.title} ${article.content} ${article.type} ${article.tags}`);
  return ew.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildCoverage(events, articles) {
  return events.map((ev) => {
    const matched = articles
      .map((art) => ({ ...art, score: relevance(ev, art) }))
      .filter((art) => art.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ev, articles: matched, documented: matched.length > 0 };
  });
}

function sevColor(sev) {
  if (sev === "critical") return "#FF3333";
  if (sev === "high")     return "#FF8800";
  if (sev === "medium")   return "#FFD700";
  if (sev === "info")     return "#60A5FA";
  return "#6B7280";
}

function relTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DOCUMENTED", "DARK"];

export default function OpsEventKnowledgeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [events,    setEvents]    = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, knRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`, { headers: hdr }),
        fetch(`${base}/knowledge/`,    { headers: hdr }),
      ]);
      const evRaw = await evRes.json();
      const knRaw = await knRes.json();
      setEvents(normaliseEvents(evRaw));
      setArticles(normaliseArticles(knRaw));
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
    window.addEventListener("jarvis:oeknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oeknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isOeknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const coverage    = buildCoverage(events, articles);
  const documented  = coverage.filter((ev) => ev.documented).length;
  const dark        = coverage.filter((ev) => !ev.documented).length;
  const darkBadge   = dark;

  const sq = search.toLowerCase();
  const visible = coverage.filter((ev) => {
    if (filter === "DOCUMENTED" && !ev.documented) return false;
    if (filter === "DARK"       &&  ev.documented) return false;
    if (sq && !ev.message.toLowerCase().includes(sq) &&
              !ev.service.toLowerCase().includes(sq))  return false;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildOeknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops Event × Knowledge Coverage (◈ OEKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: open ? "rgba(255,170,0,0.15)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#FFAA00" : S.border}`,
          borderRadius: S.radius, color: open ? "#FFAA00" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #FFAA0044" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OEKNOW{darkBadge > 0 && (
          <span style={{
            marginLeft: 4, background: "#FFAA00", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{darkBadge}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 69,
          bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          width: 380,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #FFAA00",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "72vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#FFAA00", letterSpacing: 2, fontWeight: 700 }}>
              OPS EVENT × KNOWLEDGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || events.length === 0) ? 0.4 : 1,
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
              { label: "EVENTS",     val: events.length,   color: C.neon    },
              { label: "ARTICLES",   val: articles.length, color: C.blue    },
              { label: "DOCUMENTED", val: documented,       color: "#00C853" },
              { label: "DARK",       val: dark,             color: "#FFAA00" },
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
              <button key={t} onClick={() => { setFilter(t); setExpanded(null); }} style={{
                flex: 1, background: filter === t ? "#FFAA0022" : "transparent",
                border: `1px solid ${filter === t ? "#FFAA00" : S.border}`,
                color: filter === t ? "#FFAA00" : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search events…"
              style={{
                width: "100%", background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: S.fs.xxs,
                padding: "4px 8px", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && events.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map((ev) => (
              <div key={ev.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${ev.documented ? "#00C853" : "#FFAA00"}`,
                  }}
                >
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                    background: `${sevColor(ev.severity)}22`, color: sevColor(ev.severity),
                    border: `1px solid ${sevColor(ev.severity)}55`,
                    whiteSpace: "nowrap", textTransform: "uppercase", flexShrink: 0,
                  }}>
                    {ev.severity || "INFO"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: "9px",
                  }}>
                    {ev.message}
                  </span>
                  {ev.ts && (
                    <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {relTime(ev.ts)}
                    </span>
                  )}
                  <span style={{
                    color: ev.documented ? "#00C853" : "#FFAA00",
                    fontSize: "9px", minWidth: 48, textAlign: "right",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {ev.documented ? `${ev.articles.length} DOC` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9, flexShrink: 0 }}>
                    {expanded === ev.id ? "▴" : "▾"}
                  </span>
                </div>

                {expanded === ev.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {ev.service && (
                      <div style={{ color: S.text, fontSize: "8px", marginBottom: 4 }}>
                        service: <span style={{ color: C.neon }}>{ev.service}</span>
                      </div>
                    )}
                    {ev.documented ? ev.articles.map((art) => (
                      <div key={art.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        {art.type && (
                          <span style={{
                            fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                            background: "rgba(96,165,250,0.15)", color: C.blue,
                            border: `1px solid ${C.blue}55`,
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            {art.type}
                          </span>
                        )}
                        <span style={{
                          color: S.textHi, fontSize: "9px", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {art.title}
                        </span>
                        <span style={{ color: "#00C853", fontSize: "9px", whiteSpace: "nowrap" }}>
                          rel:{art.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#FFAA00", fontSize: "9px", padding: "2px 0" }}>
                        No knowledge articles found — response gap, sir.
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
            /v1/ops/events · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
