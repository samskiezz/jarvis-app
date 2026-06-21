/**
 * KnowledgeReportAuditor — F82.
 *
 * Parallel-fetches /knowledge/ article catalog + /v1/reports to audit the
 * relationship between informal knowledge and formal report documentation.
 * Keyword-correlates article titles/content against report titles to surface:
 *   - Documented: articles with ≥1 matching formal report (good coverage)
 *   - Undocumented: articles with no report backing (documentation gaps)
 *   - Orphaned reports: reports that match no knowledge article
 *
 * Stat tiles: articles / reports / documented / undocumented
 * Filter tabs: ALL / UNDOCUMENTED / DOCUMENTED / ORPHANED
 * Rows sorted: undocumented first (highest-priority gap), then by title.
 * Click ▶ AUDIT on any article → /v1/jarvis/agent/chat AI 2-sentence
 *   documentation-gap assessment + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "knowledge report" / "report knowledge" / "doc gap" / "documentation gap" /
 *         "knowledge coverage" / "krgap" / "report coverage"
 *   → jarvis:krgap-toggle + TTS brief via buildKrgapScript()
 *
 * Toggle: ◎ KRGAP at left:7252, zIndex 65. Amber badge shows undocumented count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY      = "#29E7FF";
const AMBER   = "#F5A623";
const GREEN   = "#00c878";
const VIOLET  = "#A78BFA";
const BTN_LEFT    = 7252;
const REFRESH_MS  = 300_000; // 5 min
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.articles)) return raw.articles;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a) => ({
    id: a.id || a.article_id || String(Math.random()),
    title: a.title || a.name || a.heading || "Untitled Article",
    content: a.content || a.summary || a.body || a.description || a.snippet || "",
    category: a.category || a.type || a.topic || "",
    tags: Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseReports(raw) {
  return normaliseArray(raw).map((r) => ({
    id: r.id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.report_name || "Untitled Report",
    description: r.description || r.summary || r.abstract || "",
    category: r.category || r.type || r.report_type || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function artWords(art) {
  return [
    ...keywords(art.title),
    ...keywords(art.content),
    ...keywords(art.category),
    ...(art.tags || []).flatMap((t) => keywords(t)),
  ];
}

function repWords(rep) {
  return [
    ...keywords(rep.title),
    ...keywords(rep.description),
    ...keywords(rep.category),
  ];
}

function correlateArticles(articles, reports) {
  return articles.map((art) => {
    const aw = new Set(artWords(art));
    const matched = reports.filter((rep) =>
      repWords(rep).some((w) => aw.has(w))
    );
    return { ...art, matchedReports: matched };
  });
}

function findOrphanedReports(articles, reports) {
  const articulated = articles.flatMap((a) =>
    a.matchedReports ? a.matchedReports.map((r) => r.id) : []
  );
  const covered = new Set(articulated);
  return reports.filter((r) => !covered.has(r.id));
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const KRGAP_RE =
  /knowledge.{0,15}report|report.{0,15}knowledge|doc(?:umentation)?.{0,15}gap|knowledge.{0,15}coverage|report.{0,15}coverage|krgap\b/i;

export function isKrgapQuery(q) {
  return KRGAP_RE.test(q || "");
}

export async function buildKrgapScript() {
  try {
    const [artRaw, repRaw] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const articles  = normaliseArticles(artRaw);
    const reports   = normaliseReports(repRaw);
    const corr      = correlateArticles(articles, reports);
    const documented   = corr.filter((a) => a.matchedReports.length > 0).length;
    const undocumented = corr.filter((a) => a.matchedReports.length === 0).length;
    const orphaned     = findOrphanedReports(corr, reports).length;
    window.dispatchEvent(new CustomEvent("jarvis:krgap-toggle"));
    return `Knowledge-report audit complete, sir. ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""} cross-referenced against ${reports.length} formal report${reports.length !== 1 ? "s" : ""}. ${documented} article${documented !== 1 ? "s are" : " is"} backed by formal documentation, ${undocumented} require attention, and ${orphaned} report${orphaned !== 1 ? "s have" : " has"} no knowledge article coverage. Select any entry to request an AI assessment.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:krgap-toggle"));
    return "Knowledge-report auditor is online, sir. Awaiting data to cross-reference the knowledge base against formal documentation.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeReportAuditor() {
  const [visible, setVisible]     = useState(false);
  const [articles, setArticles]   = useState([]);
  const [reports, setReports]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("UNDOCUMENTED");
  const [expanded, setExpanded]   = useState(null);
  const [auditing, setAuditing]   = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [artRaw, repRaw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/reports`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setArticles(normaliseArticles(artRaw));
      setReports(normaliseReports(repRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:krgap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:krgap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function auditArticle(art) {
    setAuditing(art.id);
    const repList = art.matchedReports.length
      ? art.matchedReports.map((r) => `"${r.title}"`).join(", ")
      : "none";
    const prompt = art.matchedReports.length
      ? `As JARVIS, provide a 2-sentence assessment of whether the formal report${art.matchedReports.length > 1 ? "s" : ""} ${repList} adequately document the knowledge article "${art.title}". Note any coverage gaps or strengths.`
      : `As JARVIS, provide a 2-sentence assessment of the documentation gap for knowledge article "${art.title}", which has no formal report backing. Suggest what type of formal report would most strengthen this knowledge area.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess documentation coverage at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Documentation audit unavailable at this time, sir." },
        })
      );
    }
    setAuditing(null);
  }

  const corr      = correlateArticles(articles, reports);
  const documented   = corr.filter((a) => a.matchedReports.length > 0);
  const undocumented = corr.filter((a) => a.matchedReports.length === 0);
  const orphaned     = findOrphanedReports(corr, reports);
  const undocBadge   = undocumented.length;

  let displayed;
  if (tab === "ALL") {
    displayed = [...undocumented, ...documented].map((a) => ({ _kind: "article", ...a }));
  } else if (tab === "UNDOCUMENTED") {
    displayed = undocumented.map((a) => ({ _kind: "article", ...a }));
  } else if (tab === "DOCUMENTED") {
    displayed = documented.map((a) => ({ _kind: "article", ...a }));
  } else {
    displayed = orphaned.map((r) => ({ _kind: "report", ...r, matchedReports: [] }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge-Report Gap Auditor (F82)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : CY}44`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◎ KRGAP
        {undocBadge > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{undocBadge}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 280, zIndex: 65,
          width: 580, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◎ KNOWLEDGE-REPORT AUDITOR</span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: `${CY}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["ARTICLES",      articles.length,    CY],
              ["REPORTS",       reports.length,     VIOLET],
              ["DOCUMENTED",    documented.length,  GREEN],
              ["UNDOCUMENTED",  undocumented.length, AMBER],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[
              ["UNDOCUMENTED", AMBER],
              ["DOCUMENTED",   GREEN],
              ["ORPHANED",     VIOLET],
              ["ALL",          CY],
            ].map(([t, col]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${col}22` : "transparent",
                  border: `1px solid ${tab === t ? col : "#1e3040"}`,
                  color: tab === t ? col : "#445566",
                  borderRadius: 4, padding: "3px 10px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t}{t === "ORPHANED" ? ` (${orphaned.length})` : ""}</button>
            ))}
          </div>

          {/* Rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              auditing knowledge against formal reports…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "UNDOCUMENTED"
                ? "All knowledge articles have formal report backing. Excellent documentation coverage, sir."
                : tab === "ORPHANED"
                ? "No orphaned reports — all formal reports are reflected in the knowledge base."
                : "No entries in this filter."}
            </div>
          ) : (
            displayed.map((row) => {
              const isOrphan  = row._kind === "report";
              const isDocumented = !isOrphan && row.matchedReports.length > 0;
              const accentCol = isOrphan ? VIOLET : isDocumented ? GREEN : AMBER;
              const isOpen    = expanded === row.id;

              return (
                <div
                  key={row.id}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: accentCol, border: `1px solid ${accentCol}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                    }}>
                      {isOrphan ? "ORPHAN" : isDocumented ? "DOCUMENTED" : "GAP"}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{row.title}</span>
                    {!isOrphan && (
                      <span style={{
                        fontSize: 7, color: isDocumented ? `${GREEN}99` : `${AMBER}99`,
                        whiteSpace: "nowrap",
                      }}>
                        {isDocumented
                          ? `${row.matchedReports.length} report${row.matchedReports.length !== 1 ? "s" : ""}`
                          : "no reports"}
                      </span>
                    )}
                  </div>

                  {/* Category / description row */}
                  {(row.category || row.content || row.description) && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {row.category && <span style={{ color: `${CY}66`, marginRight: 6 }}>{row.category}</span>}
                      {String(row.content || row.description || "").slice(0, 90)}
                      {String(row.content || row.description || "").length > 90 ? "…" : ""}
                    </div>
                  )}

                  {/* Audit button for articles */}
                  {!isOrphan && (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); auditArticle(row); }}
                        disabled={auditing === row.id}
                        style={{
                          background: auditing === row.id ? "#1a2530" : `${AMBER}18`,
                          color: auditing === row.id ? "#445566" : AMBER,
                          border: `1px solid ${AMBER}44`,
                          borderRadius: 3, padding: "2px 8px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                          letterSpacing: 1, cursor: auditing === row.id ? "default" : "pointer",
                        }}
                      >{auditing === row.id ? "…auditing" : "▶ AUDIT"}</button>
                    </div>
                  )}

                  {/* Expanded matched reports */}
                  {isOpen && !isOrphan && row.matchedReports.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                        FORMAL REPORTS
                      </div>
                      {row.matchedReports.map((rep) => (
                        <div key={rep.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                        }}>
                          <div style={{ color: "#a0b8cc", fontSize: 10 }}>{rep.title}</div>
                          {rep.description && (
                            <div style={{ color: "#445566", fontSize: 8, lineHeight: 1.4, marginTop: 2 }}>
                              {rep.description.slice(0, 80)}{rep.description.length > 80 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isOpen && !isOrphan && row.matchedReports.length === 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530", color: "#334455", fontSize: 8 }}>
                      No formal reports cover this knowledge article. Consider commissioning a report, sir.
                    </div>
                  )}

                  {isOpen && isOrphan && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${VIOLET}22`, color: "#556677", fontSize: 8 }}>
                      This formal report has no corresponding knowledge article. Consider adding it to the knowledge base.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /knowledge/ + /v1/reports · 5-min auto-refresh · click ▶ AUDIT for AI documentation assessment
          </div>
        </div>
      )}
    </>
  );
}
