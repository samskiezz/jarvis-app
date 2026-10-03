/**
 * F92 — Report × Knowledge Coverage (RPTKB)
 *
 * Parallel-fetches /v1/reports + /knowledge/ every 90 s.
 * Keyword-correlates each intelligence report against KB articles:
 *   GROUNDED — ≥2 KB articles match this report's keywords
 *   PARTIAL   — exactly 1 KB article matches
 *   BARE      — 0 KB articles match (knowledge gap)
 *
 * Stat tiles:  reports / articles / grounded / partial / bare
 * Filter tabs: ALL | GROUNDED | PARTIAL | BARE
 * Text search: across report title / type / topic.
 * Expand row → matched KB article cards with relevance score bar.
 * Amber badge on BARE count.
 * ▶ ASSESS: 2-sentence knowledge coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RPTKB  at left:29160, bottom:8, zIndex:93.
 * Event:   jarvis:rptkb-toggle
 * Voice:   "rptkb" / "report knowledge" / "report kb" /
 *          "report articles" / "knowledge reports" /
 *          "knowledge backed reports" / "bare reports" /
 *          "report knowledge gap" / "report knowledge coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const PARTIAL_CLR = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 29160;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:    String(r.id ?? r.report_id ?? i),
    title: r.title ?? r.name ?? r.report_name ?? `Report ${i + 1}`,
    type:  r.type ?? r.report_type ?? r.category ?? null,
    topic: r.topic ?? r.subject ?? r.description ?? r.summary ?? "",
    year:  r.year ?? r.date ? String(r.date ?? "").slice(0, 4) : null,
    body: [
      r.title, r.name, r.description, r.summary, r.topic,
      r.subject, r.type, r.report_type, r.category, r.tags,
      r.keywords, r.author,
    ].filter(Boolean).join(" "),
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    category: a.category ?? a.type ?? null,
    body: [
      a.title, a.name, a.description, a.summary, a.content,
      a.body, a.category, a.type, a.tags, a.topic,
    ].filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [repRes, kbRes] = await Promise.all([
    fetch(`${base}/v1/reports`,  { headers: hdr }),
    fetch(`${base}/knowledge/`,  { headers: hdr }),
  ]);
  return {
    reports:  normaliseReports(repRes.ok  ? await repRes.json()  : []),
    articles: normaliseArticles(kbRes.ok  ? await kbRes.json()   : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(reports, articles) {
  return reports.map(rep => {
    const kws = buildKeywords([rep.title, rep.type ?? "", rep.topic, rep.body]);
    const matched = articles
      .map(art => ({ art, score: scoreMatch(kws, `${art.title} ${art.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const cls = matched.length >= 2 ? "GROUNDED"
              : matched.length === 1 ? "PARTIAL"
              : "BARE";
    return { ...rep, matched, classification: cls };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const RPTKB_RE =
  /\b(rptkb|report[\s_-]?knowledge|report[\s_-]?kb|report[\s_-]?article[s]?|knowledge[\s_-]?report[s]?|knowledge[\s_-]?backed[\s_-]?report[s]?|bare[\s_-]?report[s]?|report[\s_-]?knowledge[\s_-]?gap|report[\s_-]?knowledge[\s_-]?coverage|ungrounded[\s_-]?report[s]?|report[\s_-]?doc[\s_-]?coverage)\b/i;

export function isRptkbQuery(q) { return RPTKB_RE.test(q); }

export async function buildRptkbScript() {
  try {
    const { reports, articles } = await fetchAll();
    const rows     = correlate(reports, articles);
    const grounded = rows.filter(r => r.classification === "GROUNDED").length;
    const partial  = rows.filter(r => r.classification === "PARTIAL").length;
    const bare     = rows.filter(r => r.classification === "BARE").length;
    const prompt =
      `Report knowledge coverage: ${reports.length} intelligence reports cross-referenced ` +
      `against ${articles.length} knowledge base articles. ` +
      `${grounded} reports are GROUNDED (≥2 KB articles back them), ` +
      `${partial} are PARTIAL (1 article), and ${bare} are BARE (no knowledge base support). ` +
      `In 2 sentences, assess the overall knowledge coverage health and identify the most ` +
      `critical bare reports that urgently require knowledge base documentation.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:rptkb-toggle"));
    return (data.answer || "Report knowledge coverage panel is now open, sir.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rptkb-toggle"));
    return "Report knowledge coverage panel is standing by, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ClsBadge({ cls }) {
  const colour = cls === "GROUNDED" ? GREEN
               : cls === "PARTIAL"  ? PARTIAL_CLR
               : AMBER;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 1,
      padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${colour}`, color: colour,
    }}>{cls}</span>
  );
}

function RelevanceBar({ score, max }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#0d1927", borderRadius: 2, marginTop: 3 }}>
      <div style={{ height: 3, width: `${pct}%`, borderRadius: 2, background: CY }} />
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ReportKnowledgeCoverage() {
  const [open,      setOpen]      = useState(false);
  const [reports,   setReports]   = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [rows,      setRows]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [q,         setQ]         = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { reports: r, articles: a } = await fetchAll();
      setReports(r);
      setArticles(a);
      setRows(correlate(r, a));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:rptkb-toggle", handler);
    return () => window.removeEventListener("jarvis:rptkb-toggle", handler);
  }, []);

  const grounded = rows.filter(r => r.classification === "GROUNDED").length;
  const partial  = rows.filter(r => r.classification === "PARTIAL").length;
  const bare     = rows.filter(r => r.classification === "BARE").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.classification !== tab) return false;
    if (q) {
      const lq = q.toLowerCase();
      return (r.title + (r.type ?? "") + r.topic).toLowerCase().includes(lq);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matched.map(m => m.score)));

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildRptkbScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { /* silent */ }
    setAssessing(false);
  }

  const TABS = ["ALL", "GROUNDED", "PARTIAL", "BARE"];
  const TAB_COLOUR = { GROUNDED: GREEN, PARTIAL: PARTIAL_CLR, BARE: AMBER, ALL: CY };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report × Knowledge Coverage"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 93,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${AMBER}`, color: AMBER, background: "rgba(4,7,14,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        ◈ RPTKB{bare > 0 && <span style={{ marginLeft: 5, color: AMBER }}>({bare})</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, left: 220, zIndex: 93,
      width: "min(680px,92vw)", maxHeight: "82vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`,
    }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ REPORT × KNOWLEDGE COVERAGE
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: MUTED }}>
          {reports.length} reports · {articles.length} articles · {loading ? "refreshing…" : "live"}
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          { label: "REPORTS",  value: reports.length,  colour: CY         },
          { label: "ARTICLES", value: articles.length,  colour: MUTED      },
          { label: "GROUNDED", value: grounded,         colour: GREEN      },
          { label: "PARTIAL",  value: partial,          colour: PARTIAL_CLR },
          { label: "BARE",     value: bare,             colour: AMBER      },
        ].map(({ label, value, colour }) => (
          <div key={label} style={{
            flex: "1 1 90px", minWidth: 80,
            background: "rgba(10,20,35,0.6)", borderRadius: 8,
            border: `1px solid ${colour}33`, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: colour }}>{value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", alignItems: "center", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: 1,
            padding: "2px 10px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${tab === t ? TAB_COLOUR[t] : MUTED + "55"}`,
            color: tab === t ? TAB_COLOUR[t] : MUTED,
            background: tab === t ? `${TAB_COLOUR[t]}18` : "transparent",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search reports…"
          style={{
            flex: 1, minWidth: 140, fontFamily: MONO, fontSize: 11,
            background: "rgba(10,20,35,0.7)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: "#DCEBF5", padding: "3px 8px", outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 12px", borderRadius: 4, cursor: "pointer",
          border: `1px solid ${CY}`, color: CY, background: "transparent",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "assessing…" : "▶ ASSESS"}
        </button>
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px 16px" }}>
        {visible.length === 0 && (
          <div style={{ textAlign: "center", color: MUTED, marginTop: 24, fontSize: 12 }}>
            {loading ? "loading reports…" : "no reports match current filter"}
          </div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "rgba(10,20,35,0.5)", borderRadius: 8,
                border: `1px solid ${CY}22`, padding: "8px 12px", cursor: "pointer",
              }}
            >
              <ClsBadge cls={row.classification} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#DCEBF5" }}>
                  {row.title}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                  {row.type && (
                    <span style={{ fontSize: 10, color: MUTED }}>{row.type}</span>
                  )}
                  {row.year && (
                    <span style={{ fontSize: 10, color: MUTED }}>{row.year}</span>
                  )}
                </div>
              </div>
              <span style={{ fontSize: 10, color: MUTED }}>
                {row.matched.length} article{row.matched.length !== 1 ? "s" : ""}
              </span>
              <span style={{ color: MUTED, fontSize: 12 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                background: "rgba(5,10,20,0.7)", borderRadius: "0 0 8px 8px",
                border: `1px solid ${CY}18`, borderTop: "none",
                padding: "10px 12px",
              }}>
                {row.topic && (
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 8, lineHeight: 1.5 }}>
                    {row.topic.slice(0, 200)}{row.topic.length > 200 ? "…" : ""}
                  </div>
                )}
                {row.matched.length === 0 ? (
                  <div style={{ fontSize: 11, color: MUTED }}>
                    No knowledge base articles support this report — knowledge gap identified.
                  </div>
                ) : (
                  row.matched.map(({ art, score }) => (
                    <div key={art.id} style={{
                      marginBottom: 8, padding: "6px 10px",
                      background: "rgba(10,20,35,0.5)", borderRadius: 6,
                      border: `1px solid ${CY}18`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DCEBF5", flex: 1 }}>
                          {art.title}
                        </span>
                        {art.category && (
                          <span style={{
                            fontSize: 9, padding: "1px 5px", borderRadius: 3,
                            border: `1px solid ${CY}44`, color: CY,
                          }}>{art.category}</span>
                        )}
                        <span style={{ fontSize: 10, color: MUTED }}>×{score}</span>
                      </div>
                      <RelevanceBar score={score} max={maxScore} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
