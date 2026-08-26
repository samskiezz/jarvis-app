/**
 * KnowledgeScenarioCoverage — F62.
 *
 * Parallel-fetches /knowledge/ (article library) + /v1/scenario/list.
 * Keyword-correlates each scenario against knowledge articles to identify
 * which simulations have learning material backing them and which are
 * "knowledge-dark" — running without any documented rationale or reference.
 *
 * Stat tiles: scenarios / articles / backed / knowledge-dark
 * Filter tabs: ALL / BACKED / DARK
 * Split panel: scenario list left, matched articles right on expand.
 * Click ▶ ASSESS on any scenario → /v1/jarvis/agent/chat AI 2-sentence
 *   knowledge-readiness brief + TTS via jarvis:speak-dossier.
 * 120 s auto-refresh.
 *
 * Intent: "knowledge scenario" / "scenario knowledge" / "kbscen" /
 *         "knowledge backed scenario" / "unbriefed scenario" / "scenario briefing"
 *   → jarvis:kbscen-toggle + TTS brief via buildKbscenScript()
 *
 * Toggle: ◈ KBSCEN at left:8188, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 8188;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id:          s.id || s.scenario_id || String(Math.random()),
    title:       s.title || s.name || s.scenario_name || "Unnamed Scenario",
    description: s.description || s.summary || s.details || "",
    type:        s.type || s.category || s.scenario_type || "",
    status:      (s.status || "pending").toLowerCase(),
    tags:        [...(s.tags || []), ...(s.keywords || [])].map(String),
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a) => ({
    id:          a.id || a.article_id || String(Math.random()),
    title:       a.title || a.name || "Unnamed Article",
    description: a.description || a.summary || a.content || a.excerpt || "",
    type:        a.type || a.category || a.article_type || "",
    tags:        [...(a.tags || []), ...(a.keywords || [])].map(String),
    date:        a.date || a.created_at || a.updated_at || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(scenario, article) {
  const artText = `${article.title} ${article.description} ${article.tags.join(" ")}`.toLowerCase();
  const scenWords = [
    ...tokens(scenario.title),
    ...tokens(scenario.description),
    ...tokens(scenario.type),
    ...scenario.tags.flatMap(tokens),
  ];
  return scenWords.reduce((acc, w) => acc + (artText.includes(w) ? 1 : 0), 0);
}

function correlate(scenarios, articles) {
  return scenarios.map((s) => {
    const matched = articles
      .map((a) => ({ ...a, _score: matchScore(s, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...s, matched };
  });
}

function statusColor(s) {
  if (s === "running")                                return GREEN;
  if (s === "pending" || s === "queued")              return AMBER;
  if (s === "failed" || s === "error")                return RED;
  if (s === "completed" || s === "done")              return CY;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const KBSCEN_RE =
  /knowledge.{0,20}scenario|scenario.{0,20}knowledge|know.{0,15}scenario|scenario.{0,15}know|knowledge[\s-]?backed[\s-]?scenario|unbriefed[\s-]?scenario|scenario[\s-]?briefing|kbscen\b/i;

export function isKbscenQuery(q) {
  return KBSCEN_RE.test(q || "");
}

export async function buildKbscenScript() {
  try {
    const [knowledgeRaw, scenarioRaw] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const articles  = normaliseArticles(knowledgeRaw);
    const scenarios = normaliseScenarios(scenarioRaw);
    const correlated = correlate(scenarios, articles);
    const backed  = correlated.filter((s) => s.matched.length > 0);
    const dark    = correlated.filter((s) => s.matched.length === 0);
    return `Knowledge-scenario coverage active, sir. ${scenarios.length} simulation scenario${scenarios.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${backed.length} scenario${backed.length !== 1 ? "s have" : " has"} knowledge backing. ${dark.length} scenario${dark.length !== 1 ? "s are" : " is"} knowledge-dark — running without documented learning material. Select a scenario to assess its knowledge readiness.`;
  } catch (_) {
    return "Knowledge-scenario coverage panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function KnowledgeScenarioCoverage() {
  const [visible, setVisible]     = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("DARK");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [knowledgeRaw, scenarioRaw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setArticles(normaliseArticles(knowledgeRaw));
      setScenarios(normaliseScenarios(scenarioRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:kbscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kbscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessScenario(scenario) {
    setAssessing(scenario.id);
    const artTitles = scenario.matched.map((a) => `"${a.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence knowledge-readiness assessment for the scenario "${scenario.title}". Knowledge articles available: ${artTitles || "none"}. Focus on whether the scenario is adequately supported by knowledge material or requires additional documentation.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient knowledge material to assess this scenario's readiness, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(scenarios, articles);
  const backed     = correlated.filter((s) => s.matched.length > 0);
  const dark       = correlated.filter((s) => s.matched.length === 0);

  const displayed =
    tab === "ALL"    ? correlated :
    tab === "BACKED" ? backed     : dark;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge × Scenario Coverage (KBSCEN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ KBSCEN
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ KNOWLEDGE-SCENARIO COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
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
              ["SCENARIOS", scenarios.length, CY],
              ["ARTICLES",  articles.length,  PURPLE],
              ["BACKED",    backed.length,    GREEN],
              ["DARK",      dark.length,      dark.length > 0 ? AMBER : "#445566"],
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
            {["ALL", "BACKED", "DARK"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Scenario rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating scenarios against knowledge library…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DARK" ? "All scenarios have knowledge backing." : "No scenarios in this filter."}
            </div>
          ) : (
            displayed.map((scenario) => {
              const sc      = statusColor(scenario.status);
              const isOpen  = expanded === scenario.id;
              const hasDocs = scenario.matched.length > 0;
              return (
                <div key={scenario.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasDocs ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : scenario.id)}>
                  {/* Scenario header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {scenario.status && (
                      <span style={{
                        fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                        whiteSpace: "nowrap", textTransform: "uppercase",
                      }}>{scenario.status}</span>
                    )}
                    {scenario.type && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{String(scenario.type).toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{scenario.title}</span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasDocs ? GREEN : AMBER,
                    }}>
                      {hasDocs ? `${scenario.matched.length} article${scenario.matched.length !== 1 ? "s" : ""}` : "⚠ DARK"}
                    </span>
                  </div>

                  {scenario.description && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {scenario.description.slice(0, 120)}{scenario.description.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455", flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); assessScenario(scenario); }}
                      disabled={assessing === scenario.id}
                      style={{
                        background: assessing === scenario.id ? "#1a2530" : `${CY}18`,
                        color: assessing === scenario.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === scenario.id ? "default" : "pointer",
                      }}
                    >{assessing === scenario.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded article list */}
                  {isOpen && hasDocs && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {scenario.matched.map((article) => (
                        <div key={article.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {article.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0,
                              textTransform: "uppercase",
                            }}>{article.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{article.title}</div>
                            {article.description && (
                              <div style={{ color: "#445566", fontSize: 8, marginTop: 1 }}>
                                {article.description.slice(0, 80)}{article.description.length > 80 ? "…" : ""}
                              </div>
                            )}
                            {article.date && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                {String(article.date).slice(0, 10)}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {article._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasDocs && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No knowledge articles found for this scenario. Consider creating supporting documentation.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /knowledge/ + /v1/scenario/list · 120 s auto-refresh · ▶ ASSESS for AI knowledge-readiness brief
          </div>
        </div>
      )}
    </>
  );
}
