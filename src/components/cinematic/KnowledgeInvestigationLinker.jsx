/**
 * KnowledgeInvestigationLinker — F62.
 *
 * Cross-references /knowledge/ article catalog against /v1/investigations
 * open cases by keyword matching to surface relevant research for each case.
 * Click an article → /v1/jarvis/agent/chat AI relevance summary + TTS via
 * jarvis:speak-dossier.
 *
 * Intent: "JARVIS, knowledge linker" / "link knowledge" / "case knowledge"
 *   → jarvis:kinvlinker-toggle + TTS brief via buildKnowledgeInvScript()
 *
 * Toggle: ◉ KINV at left:5172, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 5172;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isKnowledgeInvQuery(q) {
  return /knowledge.{0,15}(invest|case|link|brief)|invest.{0,15}knowledge|(case|investigation)\s+knowledge|kinv\b|link knowledge/i.test(
    q || ""
  );
}

export async function buildKnowledgeInvScript() {
  try {
    const [kr, ir] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const articles = normaliseArray(kr.ok ? await kr.json() : []);
    const cases = normaliseArray(ir.ok ? await ir.json() : []);
    const open = cases.filter(
      (c) => !["closed", "resolved"].includes((c.status || "open").toLowerCase())
    );
    const pairs = buildLinks(open, articles);
    const linked = new Set(pairs.map((p) => p.caseId)).size;
    window.dispatchEvent(new CustomEvent("jarvis:kinvlinker-toggle"));
    if (!open.length)
      return "No open investigations to cross-reference, sir. Case board is clear.";
    return `Knowledge-investigation linker active, sir. ${open.length} open case${open.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${linked} case${linked !== 1 ? "s" : ""} have relevant articles surfaced. Select a case to review supporting intelligence.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:kinvlinker-toggle"));
    return "Knowledge-investigation linker panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeInvestigationLinker() {
  const [visible, setVisible] = useState(false);
  const [articles, setArticles] = useState([]);
  const [cases, setCases] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const [filter, setFilter] = useState("all");
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [kr, ir] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawArticles = normaliseArray(kr.ok ? await kr.json() : []);
      const rawCases = normaliseArray(ir.ok ? await ir.json() : []);
      setArticles(rawArticles);
      setCases(rawCases);
      setLinks(buildLinks(rawCases, rawArticles));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:kinvlinker-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kinvlinker-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 5 * 60_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function getArticleRelevance(caseItem, article) {
    const key = `${caseItem.id}::${article.id}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const caseTitle = caseItem.title || caseItem.name || caseItem.description || "Unknown Case";
    const articleTitle = article.title || article.name || article.heading || "Unknown Article";
    const snippet = article.content || article.summary || article.body || articleTitle;
    const prompt = `As JARVIS, provide a 2-sentence assessment of how the knowledge article titled "${articleTitle}" is relevant to the investigation "${caseTitle}". Content excerpt: "${String(snippet).slice(0, 300)}". Be direct and analytical.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiMap((prev) => ({ ...prev, [key]: answer }));
      if (answer)
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
    } catch (_) {
      setAiMap((prev) => ({ ...prev, [key]: "Unable to reach reasoning core." }));
    } finally {
      setAiLoading(null);
    }
  }

  const openCases = cases.filter(
    (c) => !["closed", "resolved"].includes((c.status || "open").toLowerCase())
  );

  const linkedCaseIds = new Set(links.map((l) => l.caseId));
  const filteredCases =
    filter === "linked"
      ? openCases.filter((c) => linkedCaseIds.has(c.id || c._id || c.title))
      : filter === "unlinked"
      ? openCases.filter((c) => !linkedCaseIds.has(c.id || c._id || c.title))
      : openCases;

  const selectedLinks = selected
    ? links.filter((l) => l.caseId === (selected.id || selected._id || selected.title))
    : [];

  const linkedCount = linkedCaseIds.size;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge-Investigation Linker"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
          height: 26,
          padding: "0 8px",
          background: visible ? `${GREEN}22` : "rgba(8,14,22,0.82)",
          border: `1px solid ${visible ? GREEN : "#2A3A4A"}`,
          borderRadius: 5,
          color: visible ? GREEN : "#6E8AA0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {linkedCount > 0 && !visible && (
          <span
            style={{
              display: "inline-block",
              marginRight: 5,
              background: GREEN,
              color: "#000",
              borderRadius: "50%",
              width: 14,
              height: 14,
              fontSize: 9,
              lineHeight: "14px",
              textAlign: "center",
            }}
          >
            {linkedCount}
          </span>
        )}
        ◉ KINV
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 44,
            left: Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex: 65,
            width: 640,
            maxHeight: "75vh",
            display: "flex",
            flexDirection: "column",
            background: "rgba(4,10,18,0.96)",
            border: `1px solid ${GREEN}44`,
            borderTop: `2px solid ${GREEN}`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${GREEN}14, 0 8px 32px rgba(0,0,0,0.75)`,
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
              borderBottom: `1px solid ${GREEN}22`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: GREEN, fontSize: 13 }}>◉</span>
            <span style={{ color: GREEN, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              KNOWLEDGE–INVESTIGATION LINKER
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>
                loading…
              </span>
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
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {[
              { label: "OPEN CASES", val: openCases.length, col: CY },
              { label: "ARTICLES", val: articles.length, col: VIOLET },
              { label: "LINKED", val: linkedCount, col: GREEN },
              { label: "UNLINKED", val: openCases.length - linkedCount, col: AMBER },
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

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "7px 14px",
              borderBottom: `1px solid #1A2A3A`,
              flexShrink: 0,
            }}
          >
            {["all", "linked", "unlinked"].map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setSelected(null); }}
                style={{
                  padding: "2px 8px",
                  borderRadius: 4,
                  border: `1px solid ${filter === f ? GREEN : "#2A3A4A"}`,
                  background: filter === f ? `${GREEN}22` : "transparent",
                  color: filter === f ? GREEN : "#6E8AA0",
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
          </div>

          {/* Split body: case list (left) + article detail (right) */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Case list */}
            <div
              style={{
                width: 230,
                borderRight: `1px solid #1A2A3A`,
                overflowY: "auto",
                flexShrink: 0,
              }}
            >
              {!loading && filteredCases.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>
                  No cases in this filter.
                </div>
              )}
              {filteredCases.map((c) => {
                const cid = c.id || c._id || c.title;
                const isLinked = linkedCaseIds.has(cid);
                const isActive = selected && (selected.id || selected._id || selected.title) === cid;
                const prio = (c.priority || c.severity || c.urgency || "").toString().toUpperCase();
                const prioColor =
                  prio === "CRITICAL" || Number(prio) >= 90
                    ? RED
                    : prio === "HIGH" || Number(prio) >= 70
                    ? AMBER
                    : CY;
                return (
                  <div
                    key={cid}
                    onClick={() => setSelected(c)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${GREEN}12` : "transparent",
                      borderLeft: isActive ? `3px solid ${GREEN}` : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: isLinked ? GREEN : "#2A3A4A",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.title || c.name || c.description || cid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      <span
                        style={{
                          fontSize: 8,
                          color: prioColor,
                          letterSpacing: 1,
                          padding: "1px 4px",
                          border: `1px solid ${prioColor}44`,
                          borderRadius: 3,
                        }}
                      >
                        {prio || "OPEN"}
                      </span>
                      {isLinked && (
                        <span style={{ fontSize: 8, color: GREEN, letterSpacing: 1 }}>
                          {links.filter((l) => l.caseId === cid).length} article
                          {links.filter((l) => l.caseId === cid).length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Article detail pane */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {!selected && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10, lineHeight: 1.6 }}>
                  Select a case to see relevant knowledge articles.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching knowledge articles found for this case.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: "8px 14px",
                      borderBottom: `1px solid #1A2A3A`,
                      color: GREEN,
                      fontSize: 10,
                      letterSpacing: 1,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLinks.length} ARTICLE{selectedLinks.length !== 1 ? "S" : ""} LINKED TO "{(selected.title || selected.name || "CASE").toUpperCase()}"
                  </div>
                  {selectedLinks.map((link, i) => {
                    const art = link.article;
                    const artId = art.id || art._id || art.title;
                    const aiKey = `${selected.id || selected._id || selected.title}::${artId}`;
                    const aiText = aiMap[aiKey];
                    const isLoadingThis = aiLoading === aiKey;
                    return (
                      <div
                        key={`${aiKey}-${i}`}
                        style={{
                          padding: "10px 14px",
                          borderBottom: `1px solid #0E1A26`,
                        }}
                      >
                        {/* Article header */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 5 }}>
                          <span style={{ color: VIOLET, fontSize: 12, marginTop: 1, flexShrink: 0 }}>◉</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 2 }}>
                              {art.title || art.name || art.heading || artId}
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {art.type && (
                                <span style={{ fontSize: 8, color: VIOLET, letterSpacing: 1, padding: "1px 4px", border: `1px solid ${VIOLET}44`, borderRadius: 3 }}>
                                  {art.type}
                                </span>
                              )}
                              <span style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1 }}>
                                [{link.matchScore} keyword match{link.matchScore !== 1 ? "es" : ""}]
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => getArticleRelevance(selected, art)}
                            disabled={isLoadingThis || !!aiText}
                            style={{
                              flexShrink: 0,
                              padding: "2px 8px",
                              borderRadius: 4,
                              border: `1px solid ${aiText ? GREEN + "66" : VIOLET + "66"}`,
                              background: aiText ? `${GREEN}12` : isLoadingThis ? `${VIOLET}22` : "transparent",
                              color: aiText ? GREEN : VIOLET,
                              fontSize: 9,
                              letterSpacing: 1,
                              cursor: isLoadingThis || aiText ? "default" : "pointer",
                              fontFamily: "inherit",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {aiText ? "✓ ASSESSED" : isLoadingThis ? "consulting…" : "▶ ASSESS"}
                          </button>
                        </div>

                        {/* Article snippet */}
                        {(art.summary || art.content || art.body) && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginBottom: 5,
                              fontSize: 10,
                              color: "#4E8A9A",
                              lineHeight: 1.5,
                              maxHeight: 48,
                              overflow: "hidden",
                            }}
                          >
                            {String(art.summary || art.content || art.body).slice(0, 180)}…
                          </div>
                        )}

                        {/* AI relevance text */}
                        {aiText && (
                          <div
                            style={{
                              marginLeft: 20,
                              marginTop: 5,
                              padding: "6px 10px",
                              background: `${GREEN}0A`,
                              border: `1px solid ${GREEN}22`,
                              borderRadius: 5,
                              fontSize: 10,
                              color: "#A0D8B0",
                              lineHeight: 1.5,
                            }}
                          >
                            <span style={{ color: GREEN, fontSize: 8, letterSpacing: 1, fontWeight: 700, display: "block", marginBottom: 3 }}>JARVIS ASSESSMENT</span>
                            {aiText}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "5px 14px",
              borderTop: `1px solid ${GREEN}18`,
              fontSize: 10,
              color: "#4E6A7A",
              letterSpacing: 1,
              flexShrink: 0,
            }}
          >
            /knowledge/ + /v1/investigations · 5-min auto-refresh · click ▶ ASSESS for AI relevance
          </div>
        </div>
      )}
    </>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of [
      "items",
      "results",
      "data",
      "articles",
      "investigations",
      "cases",
      "records",
      "nodes",
    ]) {
      if (Array.isArray(data[k])) return data[k];
    }
  }
  return [];
}

function keywords(str) {
  if (!str) return [];
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function buildLinks(cases, articles) {
  if (!cases.length || !articles.length) return [];
  const results = [];

  for (const c of cases) {
    const cid = c.id || c._id || c.title;
    const cText = [
      c.title || "",
      c.name || "",
      c.description || "",
      c.subject || "",
      ...(Array.isArray(c.tags) ? c.tags : []),
    ].join(" ");
    const cKws = keywords(cText);
    if (!cKws.length) continue;

    for (const art of articles) {
      const artText = [
        art.title || "",
        art.name || "",
        art.heading || "",
        art.summary || "",
        art.type || "",
        ...(Array.isArray(art.tags) ? art.tags : []),
      ].join(" ");
      const artKws = keywords(artText);
      const score = cKws.filter((w) => artKws.includes(w)).length;
      if (score >= 1) {
        results.push({ caseId: cid, article: art, matchScore: score });
      }
    }
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
