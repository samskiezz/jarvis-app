/**
 * ReportKnowledgeGapAdvisor — F125.
 *
 * Parallel-fetches /v1/reports + /knowledge/ and keyword-correlates in BOTH
 * directions to surface two categories of intelligence gaps:
 *
 *   UNEXTRACTED  — reports with no matching knowledge article (information
 *                  exists in raw report form but hasn't been distilled into
 *                  reusable knowledge — extraction opportunity)
 *   UNSOURCED    — knowledge articles with no backing report (knowledge
 *                  recorded without traceable source documentation)
 *   MATCHED      — items with at least one cross-reference found
 *
 * Stat tiles: reports / articles / matched-reports / unsourced-articles.
 * Filter tabs: ALL | UNEXTRACTED | UNSOURCED | MATCHED + text search.
 * Expand report → matched articles; expand article → matched reports.
 * Amber badge on unextracted count (knowledge extraction backlog).
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-curation brief
 *   + TTS via jarvis:speak-dossier.
 *
 * Toggle:  ◈ RPKNOW at left:37960, bottom:8, zIndex:79.
 * Event:   jarvis:rpknow-toggle
 * Voice:   "report knowledge" / "knowledge extraction" /
 *          "unsourced knowledge" / "unextracted reports" / "rpknow"
 * Refresh: 120s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const VIOLET = "#A78BFA";
const RED    = "#FF3D5A";
const BTN_LEFT = 37960;
const POLL_MS  = 120_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ──────────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.reports)         ? raw.reports
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:    r.id       || String(i),
    title: r.title    || r.name     || r.heading   || `Report ${i + 1}`,
    body:  String(r.content || r.body || r.summary || r.text || r.description || "").slice(0, 500),
    type:  r.type     || r.category || r.report_type || "",
    year:  r.year     || (r.created_at ? new Date(r.created_at).getFullYear() : null),
    tags:  Array.isArray(r.tags) ? r.tags.join(" ") : String(r.tags || ""),
  }));
}

function normaliseArticles(raw) {
  // /knowledge/ may return { articles:[…] } or { items:[…] } or an array or { data:[…] }
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.articles)        ? raw.articles
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((a, i) => ({
    id:    a.id      || a.slug    || String(i),
    title: a.title   || a.name   || a.heading   || `Article ${i + 1}`,
    body:  String(a.content || a.body || a.summary || a.text || a.description || "").slice(0, 500),
    type:  a.type    || a.category || a.article_type || "",
    tags:  Array.isArray(a.tags) ? a.tags.join(" ") : String(a.tags || ""),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s,;:_\-/\.]+/)
    .filter((t) => t.length > 2);
}

function relevance(aTokenSet, bTokens) {
  if (!aTokenSet.size || !bTokens.length) return 0;
  const hits = bTokens.filter((t) => aTokenSet.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(aTokenSet.size, bTokens.length)) * 100 * 4));
}

function buildCoverage(reports, articles) {
  // report → article pairs
  const rptMatched = new Set();
  const artMatched = new Set();
  const rptPairs   = [];   // { rptId, article, score }
  const artPairs   = [];   // { artId, report,  score }

  for (const rpt of reports) {
    const rTokens = new Set([
      ...tokenize(rpt.title), ...tokenize(rpt.body), ...tokenize(rpt.tags),
    ]);
    for (const art of articles) {
      const aTokens = [...tokenize(art.title), ...tokenize(art.body), ...tokenize(art.tags)];
      const score = relevance(rTokens, aTokens);
      if (score >= 10) {
        rptMatched.add(rpt.id);
        artMatched.add(art.id);
        rptPairs.push({ rptId: rpt.id, article: art, score });
        artPairs.push({ artId: art.id, report: rpt, score });
      }
    }
  }

  return { rptMatched, artMatched, rptPairs, artPairs };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isRpknowQuery(q) {
  return /report\s*knowledge|knowledge\s*extraction|unsourced\s*knowledge|unextracted\s*report|rpknow\b/i.test(q || "");
}

export async function buildRpknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [rRes, aRes] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers: hdr }),
      fetch(`${base}/knowledge/`, { headers: hdr }),
    ]);
    const reports  = normaliseReports(rRes.ok  ? await rRes.json()  : []);
    const articles = normaliseArticles(aRes.ok ? await aRes.json() : []);
    const { rptMatched, artMatched } = buildCoverage(reports, articles);
    const unextracted = reports.length  - rptMatched.size;
    const unsourced   = articles.length - artMatched.size;
    window.dispatchEvent(new CustomEvent("jarvis:rpknow-toggle"));
    if (!reports.length && !articles.length)
      return "No reports or knowledge articles on record yet, sir.";
    return (
      `Report–knowledge gap advisor active, sir. ` +
      `${reports.length} report${reports.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ` +
      `${unextracted} report${unextracted !== 1 ? "s are" : " is"} UNEXTRACTED — ` +
      `no matching knowledge article found. ` +
      `${unsourced} article${unsourced !== 1 ? "s are" : " is"} UNSOURCED — ` +
      `no backing report on record.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rpknow-toggle"));
    return "Report–knowledge gap advisor is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportKnowledgeGapAdvisor() {
  const [visible,   setVisible]   = useState(false);
  const [reports,   setReports]   = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [coverage,  setCoverage]  = useState({ rptMatched: new Set(), artMatched: new Set(), rptPairs: [], artPairs: [] });
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState("");
  const [filter,    setFilter]    = useState("unextracted");
  const [selected,  setSelected]  = useState(null);
  const [aiMap,     setAiMap]     = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [rRes, aRes] = await Promise.all([
        fetch(`${base}/v1/reports`, { headers: hdr }),
        fetch(`${base}/knowledge/`, { headers: hdr }),
      ]);
      const rawReports  = normaliseReports(rRes.ok  ? await rRes.json()  : []);
      const rawArticles = normaliseArticles(aRes.ok ? await aRes.json() : []);
      setReports(rawReports);
      setArticles(rawArticles);
      setCoverage(buildCoverage(rawReports, rawArticles));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:rpknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rpknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getAiAssessment(itemId, promptText) {
    if (aiMap[itemId] || aiLoading === itemId) return;
    setAiLoading(itemId);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: promptText }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [itemId]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [itemId]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const unextracted = reports.length  - coverage.rptMatched.size;
  const unsourced   = articles.length - coverage.artMatched.size;

  // Build the item list based on the active filter tab
  // In UNEXTRACTED / MATCHED tabs we show reports; in UNSOURCED we show articles
  const showingReports = filter !== "unsourced";

  const filteredItems = showingReports
    ? reports.filter((rpt) => {
        if (filter === "unextracted" && coverage.rptMatched.has(rpt.id)) return false;
        if (filter === "matched"     && !coverage.rptMatched.has(rpt.id)) return false;
        if (search) {
          const s = search.toLowerCase();
          if (![rpt.title, rpt.body, rpt.type, rpt.tags].join(" ").toLowerCase().includes(s))
            return false;
        }
        return true;
      })
    : articles.filter((art) => {
        if (filter === "unsourced" && coverage.artMatched.has(art.id)) return false;
        if (search) {
          const s = search.toLowerCase();
          if (![art.title, art.body, art.type, art.tags].join(" ").toLowerCase().includes(s))
            return false;
        }
        return true;
      });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Report × Knowledge Gap Advisor"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 79,
          height: 26,
          padding: "0 8px",
          background: visible ? `${AMBER}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? AMBER : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? AMBER : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unextracted > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: AMBER,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            {unextracted > 9 ? "9+" : unextracted}
          </span>
        )}
        ◈ RPKNOW
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 79,
            width: 640,
            maxHeight: "76vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${AMBER}44`,
            borderTop: `2px solid ${AMBER}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily: "'JetBrains Mono', monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderBottom: `1px solid ${AMBER}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              REPORT × KNOWLEDGE GAP ADVISOR
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft: loading ? 0 : "auto",
                background: "transparent",
                border: "none",
                color: "#6E8AA0",
                cursor: "pointer",
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink: 0,
            }}
          >
            {[
              { label: "REPORTS",       val: reports.length,         col: CY     },
              { label: "ARTICLES",      val: articles.length,        col: VIOLET },
              { label: "UNEXTRACTED",   val: unextracted,            col: AMBER  },
              { label: "UNSOURCED",     val: unsourced,              col: RED    },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid #1A2A3A",
                  borderRadius: 6,
                  padding: "5px 8px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>
                  {t.label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: "1px solid #1A2A3A",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            {["unextracted", "unsourced", "matched", "all"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? AMBER : "#2A3A4A"}`,
                  background: filter === f ? `${AMBER}22` : "transparent",
                  color: filter === f ? AMBER : "#6E8AA0",
                  fontSize: 10,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "uppercase",
                }}
              >
                {f}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              placeholder={showingReports ? "search reports…" : "search articles…"}
              style={{
                marginLeft: "auto",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #2A3A4A",
                borderRadius: 4,
                padding: "3px 8px",
                color: "#A0B8C8",
                fontSize: 10,
                fontFamily: "inherit",
                outline: "none",
                width: 140,
              }}
            />
          </div>

          {/* Sub-heading */}
          <div style={{ padding: "4px 14px", flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: "#4E6A7A", letterSpacing: 1 }}>
              {filter === "unextracted"
                ? "REPORTS with no matching knowledge article — extraction backlog"
                : filter === "unsourced"
                ? "KNOWLEDGE ARTICLES with no backing report — unsourced claims"
                : filter === "matched"
                ? "REPORTS with at least one matching knowledge article"
                : "ALL REPORTS + UNSOURCED ARTICLES combined"}
            </span>
          </div>

          {/* Item list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {filteredItems.length === 0 && !loading && (
              <div style={{ padding: "20px 14px", color: "#4E6A7A", fontSize: 11, textAlign: "center" }}>
                No items match the current filter.
              </div>
            )}
            {filteredItems.map((item) => {
              const isRpt      = showingReports;
              const hasMatch   = isRpt ? coverage.rptMatched.has(item.id) : coverage.artMatched.has(item.id);
              const isExpanded = selected?.id === item.id && selected?.kind === (isRpt ? "rpt" : "art");

              const matchedItems = isRpt
                ? coverage.rptPairs.filter((p) => p.rptId === item.id).sort((a, b) => b.score - a.score).map((p) => p.article)
                : coverage.artPairs.filter((p) => p.artId === item.id).sort((a, b) => b.score - a.score).map((p) => p.report);

              const accentCol = hasMatch ? GREEN : (isRpt ? AMBER : RED);
              const statusLabel = hasMatch
                ? (isRpt ? `${matchedItems.length} ART` : `${matchedItems.length} RPT`)
                : (isRpt ? "UNEXTRACTED" : "UNSOURCED");

              return (
                <div
                  key={`${isRpt ? "r" : "a"}-${item.id}`}
                  style={{
                    borderBottom: "1px solid #0E1E2E",
                    background: isExpanded ? "rgba(245,166,35,0.04)" : "transparent",
                  }}
                >
                  {/* Row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 14px",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setSelected(isExpanded ? null : { id: item.id, kind: isRpt ? "rpt" : "art" })
                    }
                  >
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        flexShrink: 0,
                        background: accentCol,
                        boxShadow: `0 0 6px ${accentCol}`,
                      }}
                    />
                    <span style={{ flex: 1, color: hasMatch ? "#C8E8D0" : "#D8C090", fontSize: 11, wordBreak: "break-word" }}>
                      {item.title}
                    </span>
                    {item.type && (
                      <span
                        style={{
                          fontSize: 9,
                          color: VIOLET,
                          border: `1px solid ${VIOLET}44`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          flexShrink: 0,
                          textTransform: "uppercase",
                        }}
                      >
                        {item.type}
                      </span>
                    )}
                    {item.year && (
                      <span style={{ fontSize: 9, color: "#5E7A8A", flexShrink: 0 }}>{item.year}</span>
                    )}
                    <span style={{ fontSize: 10, color: accentCol, flexShrink: 0, marginLeft: 4 }}>
                      {statusLabel}
                    </span>
                    <span style={{ color: "#3E5A6A", fontSize: 12, flexShrink: 0 }}>
                      {isExpanded ? "▾" : "▸"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "0 14px 10px 28px",
                        borderTop: "1px solid #1A2A3A",
                        background: "rgba(0,0,0,0.2)",
                      }}
                    >
                      {matchedItems.length === 0 ? (
                        <div style={{ padding: "8px 0", color: "#6E8AA0", fontSize: 10 }}>
                          {isRpt
                            ? "No matching knowledge articles found. This report's content has not been distilled into the knowledge base."
                            : "No backing reports found. This knowledge article has no traceable source documentation."}
                        </div>
                      ) : (
                        matchedItems.map((match) => {
                          const score = isRpt
                            ? coverage.rptPairs.find((p) => p.rptId === item.id && p.article.id === match.id)?.score ?? 0
                            : coverage.artPairs.find((p) => p.artId === item.id && p.report.id  === match.id)?.score ?? 0;
                          return (
                            <div
                              key={match.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "5px 0",
                                borderBottom: "1px solid #0E1E2E",
                              }}
                            >
                              <span style={{ fontSize: 10, color: "#A0C8A0", flex: 1, wordBreak: "break-word" }}>
                                {match.title}
                              </span>
                              {match.type && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    color: VIOLET,
                                    border: `1px solid ${VIOLET}44`,
                                    borderRadius: 3,
                                    padding: "1px 5px",
                                    flexShrink: 0,
                                  }}
                                >
                                  {match.type}
                                </span>
                              )}
                              <div
                                style={{
                                  width: 48,
                                  height: 4,
                                  background: "#1A2A3A",
                                  borderRadius: 2,
                                  overflow: "hidden",
                                  flexShrink: 0,
                                }}
                              >
                                <div
                                  style={{
                                    width: `${score}%`,
                                    height: "100%",
                                    background: GREEN,
                                    borderRadius: 2,
                                  }}
                                />
                              </div>
                              <span style={{ fontSize: 9, color: "#5E7A8A", width: 28, textAlign: "right", flexShrink: 0 }}>
                                {score}%
                              </span>
                            </div>
                          );
                        })
                      )}

                      {/* ASSESS button */}
                      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const prompt = matchedItems.length > 0
                              ? `As JARVIS, provide a 2-sentence knowledge-curation assessment for the ` +
                                `${isRpt ? "report" : "knowledge article"} titled "${item.title}". ` +
                                `It is cross-referenced with ${matchedItems.length} ` +
                                `${isRpt ? "knowledge article(s): " + matchedItems.map(m => m.title).join(", ") : "report(s): " + matchedItems.map(m => m.title).join(", ")}. ` +
                                `Assess the quality of this knowledge linkage and recommend any curation action.`
                              : `As JARVIS, provide a 2-sentence knowledge-curation advisory for the ` +
                                (isRpt
                                  ? `report titled "${item.title}". It has NO matching knowledge article — ` +
                                    `recommend what knowledge extraction or distillation should be performed.`
                                  : `knowledge article titled "${item.title}". It has NO backing report — ` +
                                    `recommend how to source or validate this knowledge claim.`);
                            getAiAssessment(item.id, prompt);
                          }}
                          disabled={aiLoading === item.id}
                          style={{
                            padding: "3px 10px",
                            background: `${AMBER}22`,
                            border: `1px solid ${AMBER}66`,
                            borderRadius: 4,
                            color: AMBER,
                            fontSize: 10,
                            fontFamily: "inherit",
                            cursor: aiLoading === item.id ? "wait" : "pointer",
                            flexShrink: 0,
                          }}
                        >
                          {aiLoading === item.id ? "…" : "▶ ASSESS"}
                        </button>
                        {aiMap[item.id] && (
                          <span style={{ fontSize: 10, color: "#8AA8B8", lineHeight: 1.5 }}>
                            {aiMap[item.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: "1px solid #1A2A3A",
              flexShrink: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: 9, color: "#3E6A5A", letterSpacing: 1 }}>
              120s AUTO-REFRESH · /v1/reports · /knowledge/
            </span>
            <span style={{ fontSize: 9, color: "#3E5A6A" }}>
              {filteredItems.length} / {showingReports ? reports.length : articles.length} items
            </span>
          </div>
        </div>
      )}
    </>
  );
}
