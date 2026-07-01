/**
 * KnowledgeRiskCoverage — F62.
 *
 * Parallel-fetches /knowledge/ article list + /entities/RiskSignal.
 * Keyword-correlates each risk signal's title/description/category against
 * knowledge article titles/content/tags to identify knowledge coverage gaps:
 *   - BLIND SPOT: risk signal with zero matching knowledge articles
 *   - COVERED:    risk signal matched to ≥1 knowledge articles
 *
 * Stat tiles: risks / articles / covered / blind-spots
 * Filter tabs: BLIND-SPOTS / COVERED / ALL
 * Text search across risk titles.
 * Expand any risk → list its matched knowledge articles (or gap warning).
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence blind-spot advisory + TTS.
 * Amber badge on blind-spot count; 5-min auto-refresh.
 *
 * Intent: "knowledge risk" / "risk coverage" / "knowledge gap" /
 *         "blind spot" / "knowledge blind spot" / "knrsk"
 *   → jarvis:knrsk-toggle + TTS brief via buildKnrskScript()
 *
 * Toggle: ◈ KNRSK at left:13260, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const GR    = "#4ADE80";

const BTN_LEFT   = 13260;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r) => ({
    id:          r.id || r.signal_id || String(Math.random()),
    title:       r.title || r.name || r.signal_name || "Unnamed Risk",
    description: r.description || r.details || r.summary || "",
    severity:    (r.severity || r.level || "medium").toLowerCase(),
    category:    r.category || r.type || r.risk_type || "",
    tags:        [...(r.tags || []), ...(r.keywords || [])].map(String),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)               ? raw.data
    : Array.isArray(raw?.items)              ? raw.items
    : Array.isArray(raw?.results)            ? raw.results
    : Array.isArray(raw?.knowledge)          ? raw.knowledge
    : Array.isArray(raw?.articles)           ? raw.articles
    : Array.isArray(raw?.chunks)             ? raw.chunks
    : [];
  return arr.map((a) => ({
    id:      a.id || a.chunk_id || String(Math.random()),
    title:   a.title || a.name || a.topic || a.subject || "Untitled",
    content: a.content || a.text || a.body || a.summary || "",
    tags:    [...(a.tags || []), ...(a.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(risk, article) {
  const riskText = `${risk.title} ${risk.description} ${risk.category} ${risk.tags.join(" ")}`.toLowerCase();
  const artWords = [
    ...tokens(article.title),
    ...tokens(article.content.slice(0, 300)),
    ...article.tags.flatMap(tokens),
  ];
  return artWords.reduce((acc, w) => acc + (riskText.includes(w) ? 1 : 0), 0);
}

function correlate(risks, articles) {
  return risks.map((risk) => {
    const matched = articles
      .map((a) => ({ ...a, _score: matchScore(risk, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...risk, matched };
  }).sort((a, b) => a.matched.length - b.matched.length); // blind spots first
}

function sevColor(s) {
  if (s === "critical") return RED;
  if (s === "high")     return AMBER;
  if (s === "medium")   return CY;
  return GREEN;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const KNRSK_RE =
  /knowledge.{0,15}risk|risk.{0,15}knowledge|knowledge.{0,12}gap|blind.{0,8}spot|knowledge.{0,15}coverage|knrsk\b/i;

export function isKnrskQuery(q) {
  return KNRSK_RE.test(q || "");
}

export async function buildKnrskScript() {
  try {
    const [artRaw, riskRaw] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const articles = normaliseArticles(artRaw);
    const risks    = normaliseRisks(riskRaw);
    const corr     = correlate(risks, articles);
    const blind    = corr.filter((r) => r.matched.length === 0);
    const covered  = corr.filter((r) => r.matched.length > 0);
    const critBlind = blind.filter((r) => r.severity === "critical" || r.severity === "high");
    return `Knowledge-risk coverage analysis complete, sir. ${risks.length} risk signal${risks.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${blind.length} risk${blind.length !== 1 ? "s have" : " has"} no knowledge coverage — ${critBlind.length} at critical or high severity. ${covered.length} risk${covered.length !== 1 ? "s are" : " is"} supported by existing articles. Blind spots require immediate knowledge base expansion.`;
  } catch (_) {
    return "Knowledge-risk coverage advisor is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeRiskCoverage() {
  const [visible, setVisible]     = useState(false);
  const [risks, setRisks]         = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("BLIND-SPOTS");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [artRaw, riskRaw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setArticles(normaliseArticles(artRaw));
      setRisks(normaliseRisks(riskRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:knrsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:knrsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessRisk(risk) {
    setAssessing(risk.id);
    const artList = risk.matched.length > 0
      ? risk.matched.map((a) => `"${a.title}"`).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence knowledge-gap advisory for the risk signal "${risk.title}" (severity: ${risk.severity}). Matching knowledge articles: ${artList}. Identify the criticality of this gap and recommend the type of knowledge article that should be created.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Knowledge coverage assessment unavailable, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(risks, articles);
  const blind      = correlated.filter((r) => r.matched.length === 0);
  const covered    = correlated.filter((r) => r.matched.length > 0);

  const base =
    tab === "BLIND-SPOTS" ? blind :
    tab === "COVERED"     ? covered : correlated;

  const displayed = search.trim()
    ? base.filter((r) =>
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.category.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge-Risk Coverage (F62)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : `${AMBER}44`}`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ KNRSK
        {blind.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{blind.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 300), zIndex: 65,
          width: 600, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>◈ KNOWLEDGE-RISK COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${AMBER}33`, borderRadius: 3,
              color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["RISKS",       risks.length,    CY],
              ["ARTICLES",    articles.length, GR],
              ["COVERED",     covered.length,  GREEN],
              ["BLIND SPOTS", blind.length,    blind.length > 0 ? AMBER : "#445566"],
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
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["BLIND-SPOTS", "COVERED", "ALL"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AMBER}22` : "transparent",
                border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                color: tab === t ? AMBER : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search risks…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${AMBER}33`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 130,
              }}
            />
          </div>

          {/* Risk rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating risk signals against knowledge base…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "BLIND-SPOTS" ? "All risks have knowledge coverage." : "No items in this filter."}
            </div>
          ) : (
            displayed.map((risk) => {
              const sc      = sevColor(risk.severity);
              const isBlind = risk.matched.length === 0;
              const isOpen  = expanded === risk.id;
              return (
                <div key={risk.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${AMBER}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${isBlind ? AMBER : GREEN}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : risk.id)}>

                  {/* Risk header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{risk.severity}</span>
                    {risk.category && (
                      <span style={{
                        fontSize: 7, color: CY, border: "1px solid #29E7FF44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(risk.category).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{risk.title}</span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isBlind ? AMBER : GREEN,
                    }}>
                      {isBlind ? "⚠ BLIND SPOT" : `${risk.matched.length} article${risk.matched.length !== 1 ? "s" : ""}`}
                    </span>
                  </div>

                  {risk.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {risk.description.slice(0, 120)}{risk.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessRisk(risk); }}
                      disabled={assessing === risk.id}
                      style={{
                        background: assessing === risk.id ? "#1a2530" : `${AMBER}18`,
                        color: assessing === risk.id ? "#445566" : AMBER,
                        border: `1px solid ${AMBER}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === risk.id ? "default" : "pointer",
                      }}
                    >{assessing === risk.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded knowledge articles */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${AMBER}18` }}>
                      {risk.matched.length === 0 ? (
                        <div style={{
                          color: AMBER, fontSize: 8, lineHeight: 1.5,
                          background: `${AMBER}0a`, borderRadius: 4, padding: "6px 8px",
                        }}>
                          ⚠ No knowledge articles cover this risk signal. Knowledge base expansion recommended.
                        </div>
                      ) : (
                        risk.matched.map((art) => (
                          <div key={art.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${GR}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "flex-start", gap: 8,
                          }}>
                            <span style={{
                              fontSize: 7, color: GR, border: "1px solid #4ADE8044",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0,
                            }}>ARTICLE</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{art.title}</div>
                              {art.content && (
                                <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                  {art.content.slice(0, 80)}{art.content.length > 80 ? "…" : ""}
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize: 7, color: `${GR}66`, whiteSpace: "nowrap" }}>
                              match {art._score}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /knowledge/ + /entities/RiskSignal · 5-min auto-refresh · ▶ ASSESS for AI blind-spot advisory
          </div>
        </div>
      )}
    </>
  );
}
