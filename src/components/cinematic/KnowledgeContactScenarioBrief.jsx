/**
 * KnowledgeContactScenarioBrief — F85.
 *
 * Triple-nexus: /knowledge/ × /entities/Contact × /v1/scenario/list
 *
 * Keyword-correlates each knowledge article against:
 *   - contacts (who could action or own that knowledge)
 *   - scenarios (which active plans the article could inform)
 *
 * Classification per article:
 *   FULLY_BRIEFED   — matched ≥1 contact AND ≥1 scenario
 *   CONTACT_ONLY    — matched contact but no scenario
 *   SCENARIO_ONLY   — matched scenario but no contact
 *   DARK            — no contact or scenario match (isolated intelligence)
 *
 * Stat tiles: KB ARTICLES / CONTACTS / SCENARIOS / FULLY BRIEFED / DARK
 * Filter tabs: ALL / FULLY_BRIEFED / CONTACT_ONLY / SCENARIO_ONLY / DARK
 * List: articles sorted by classification (DARK first), each expandable.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 120s auto-refresh.
 *
 * Intent: "kcsbrief" / "knowledge brief" / "dark knowledge" /
 *         "briefed knowledge" / "isolated knowledge" / "knowledge contact" /
 *         "knowledge scenario"
 *   → jarvis:kcsbrief-toggle + TTS via buildKcsbriefScript()
 *
 * Toggle: ◈ KCSBRIEF at left:965640, bottom:8, zIndex:109.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 965640;
const REFRESH_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a) => ({
    id: a.id || a.article_id || String(Math.random()),
    title: a.title || a.name || a.subject || "Untitled",
    subject: a.subject || a.category || a.topic || a.kind || "",
    body: a.body || a.content || a.summary || a.description || "",
  }));
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c) => ({
    id: c.id || c.contact_id || String(Math.random()),
    name: c.name || c.full_name || c.display_name || "Unknown",
    role: c.role || c.title || c.position || "",
    org:  c.org || c.organization || c.company || "",
    tags: [...(c.tags || []), ...(c.keywords || [])].map(String),
  }));
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id: s.id || s.scenario_id || String(Math.random()),
    name: s.name || s.title || s.scenario_name || "Unnamed",
    type: s.type || s.scenario_type || s.category || "",
    description: s.description || s.summary || "",
  }));
}

function keywords(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function articleWords(a) {
  return keywords(`${a.title} ${a.subject} ${a.body.slice(0, 400)}`);
}

function matchScoreContact(article, contact) {
  const artWords = articleWords(article);
  const contactText = `${contact.name} ${contact.role} ${contact.org} ${contact.tags.join(" ")}`.toLowerCase();
  return artWords.reduce((acc, w) => acc + (contactText.includes(w) ? 1 : 0), 0);
}

function matchScoreScenario(article, scenario) {
  const artWords = articleWords(article);
  const scenText = `${scenario.name} ${scenario.type} ${scenario.description}`.toLowerCase();
  return artWords.reduce((acc, w) => acc + (scenText.includes(w) ? 1 : 0), 0);
}

function correlate(articles, contacts, scenarios) {
  return articles.map((art) => {
    const matchedContacts = contacts
      .map((c) => ({ ...c, _score: matchScoreContact(art, c) }))
      .filter((c) => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const matchedScenarios = scenarios
      .map((s) => ({ ...s, _score: matchScoreScenario(art, s) }))
      .filter((s) => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 4);

    const hasContact  = matchedContacts.length > 0;
    const hasScenario = matchedScenarios.length > 0;
    const cls =
      hasContact && hasScenario ? "FULLY_BRIEFED" :
      hasContact                ? "CONTACT_ONLY"  :
      hasScenario               ? "SCENARIO_ONLY" : "DARK";

    return { ...art, matchedContacts, matchedScenarios, cls };
  });
}

function classColor(cls) {
  if (cls === "FULLY_BRIEFED") return GREEN;
  if (cls === "CONTACT_ONLY")  return CY;
  if (cls === "SCENARIO_ONLY") return AMBER;
  return RED;
}

function classOrder(cls) {
  if (cls === "DARK")           return 0;
  if (cls === "SCENARIO_ONLY") return 1;
  if (cls === "CONTACT_ONLY")  return 2;
  return 3;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const KCSBRIEF_RE =
  /kcsbrief\b|knowledge.{0,10}brief|briefed.{0,10}knowledge|dark.{0,10}knowledge|isolated.{0,10}knowledge|knowledge.{0,10}contact.{0,10}scenario|knowledge.{0,10}scenario.{0,10}contact/i;

export function isKcsbriefQuery(q) {
  return KCSBRIEF_RE.test(q || "");
}

export async function buildKcsbriefScript() {
  try {
    const [kbRaw, contactRaw, scenRaw] = await Promise.all([
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/entities/Contact`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const articles  = normaliseArticles(kbRaw);
    const contacts  = normaliseContacts(contactRaw);
    const scenarios = normaliseScenarios(scenRaw);
    const corr      = correlate(articles, contacts, scenarios);
    const fully     = corr.filter((a) => a.cls === "FULLY_BRIEFED").length;
    const dark      = corr.filter((a) => a.cls === "DARK").length;
    const contOnly  = corr.filter((a) => a.cls === "CONTACT_ONLY").length;
    const scenOnly  = corr.filter((a) => a.cls === "SCENARIO_ONLY").length;
    return (
      `Knowledge intelligence briefing complete, sir. ` +
      `${articles.length} article${articles.length !== 1 ? "s" : ""} assessed against ` +
      `${contacts.length} contact${contacts.length !== 1 ? "s" : ""} and ` +
      `${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""}. ` +
      `${fully} article${fully !== 1 ? "s" : ""} ${fully !== 1 ? "are" : "is"} fully briefed. ` +
      `${contOnly} contact-only, ${scenOnly} scenario-only. ` +
      `${dark} article${dark !== 1 ? "s" : ""} ${dark !== 1 ? "are" : "is"} dark — ` +
      `isolated intelligence with no assigned contact or active scenario. Recommend immediate triage.`
    );
  } catch (_) {
    return "Knowledge intelligence briefing is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function KnowledgeContactScenarioBrief() {
  const [visible,   setVisible]   = useState(false);
  const [articles,  setArticles]  = useState([]);
  const [contacts,  setContacts]  = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [query,     setQuery]     = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [kbRaw, contactRaw, scenRaw] = await Promise.all([
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/entities/Contact`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setArticles(normaliseArticles(kbRaw));
      setContacts(normaliseContacts(contactRaw));
      setScenarios(normaliseScenarios(scenRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:kcsbrief-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kcsbrief-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessArticle(art) {
    setAssessing(art.id);
    const contactNames  = art.matchedContacts.map((c) => c.name).join(", ");
    const scenarioNames = art.matchedScenarios.map((s) => s.name).join(", ");
    const prompt =
      `As JARVIS, provide a 2-sentence intelligence-briefing assessment for the knowledge article "${art.title}"` +
      `${art.subject ? ` (subject: ${art.subject})` : ""}. ` +
      `Matched contacts: ${contactNames || "none"}. Matched scenarios: ${scenarioNames || "none"}. ` +
      `Advise on whether this intelligence is adequately distributed and actioned, or represents an isolated gap.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this intelligence article at this time, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Intelligence briefing assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(articles, contacts, scenarios);
  const fullyBriefed = correlated.filter((a) => a.cls === "FULLY_BRIEFED");
  const contactOnly  = correlated.filter((a) => a.cls === "CONTACT_ONLY");
  const scenarioOnly = correlated.filter((a) => a.cls === "SCENARIO_ONLY");
  const dark         = correlated.filter((a) => a.cls === "DARK");

  const base =
    tab === "FULLY_BRIEFED"  ? fullyBriefed  :
    tab === "CONTACT_ONLY"   ? contactOnly   :
    tab === "SCENARIO_ONLY"  ? scenarioOnly  :
    tab === "DARK"           ? dark          : correlated;

  const displayed = (query.trim()
    ? base.filter((a) =>
        `${a.title} ${a.subject}`.toLowerCase().includes(query.toLowerCase())
      )
    : base
  ).sort((a, b) => classOrder(a.cls) - classOrder(b.cls));

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Knowledge × Contact × Scenario Intelligence Brief (F85)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 109,
          background: visible ? `${AMBER}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? AMBER : AMBER}44`,
          color: visible ? AMBER : `${AMBER}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ KCSBRIEF
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 420, zIndex: 109,
          width: 600, maxHeight: "72vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMBER}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
              ◈ KNOWLEDGE × CONTACT × SCENARIO BRIEF
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${AMBER}33`, borderRadius: 3,
                color: `${AMBER}88`, padding: "2px 6px", fontSize: 7,
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["KB ARTICLES",    correlated.length,    CY],
              ["CONTACTS",       contacts.length,       PURPLE],
              ["SCENARIOS",      scenarios.length,      AMBER],
              ["FULLY BRIEFED",  fullyBriefed.length,   GREEN],
              ["DARK",           dark.length,            RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 7, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "FULLY_BRIEFED", "CONTACT_ONLY", "SCENARIO_ONLY", "DARK"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "#1e3040"}`,
                  color: tab === t ? AMBER : "#445566",
                  borderRadius: 4, padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer",
                }}
              >{t.replace("_", " ")}</button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search articles…"
              style={{
                marginLeft: "auto", background: "rgba(245,166,35,0.05)",
                border: "1px solid #1e3040", borderRadius: 4,
                color: AMBER, padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 150,
              }}
            />
          </div>

          {/* Articles list */}
          {loading ? (
            <div style={{ color: "#445566", fontSize: 9, textAlign: "center", padding: 20 }}>
              loading…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 9, textAlign: "center", padding: 20 }}>
              {query ? "no matches" : `no ${tab.replace("_", " ").toLowerCase()} articles`}
            </div>
          ) : (
            displayed.map((art) => {
              const col = classColor(art.cls);
              return (
                <div
                  key={art.id}
                  style={{
                    marginBottom: 6, borderRadius: 6,
                    background: expanded === art.id ? "rgba(245,166,35,0.04)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${col}22`,
                    padding: "8px 10px",
                    ...(art.cls === "DARK" ? {
                      animation: "kcsbrief-pulse 2s ease-in-out infinite",
                    } : {}),
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                    onClick={() => setExpanded(expanded === art.id ? null : art.id)}
                  >
                    <span style={{
                      fontSize: 7, padding: "1px 5px", borderRadius: 3, letterSpacing: 1,
                      background: `${col}22`, color: col, border: `1px solid ${col}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {art.cls.replace("_", " ")}
                    </span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", fontWeight: "bold", flex: 1 }}>
                      {art.title}
                    </span>
                    {art.subject && (
                      <span style={{ fontSize: 7, color: `${PURPLE}88`, letterSpacing: 1 }}>
                        {art.subject}
                      </span>
                    )}
                    <span style={{ color: "#334455", fontSize: 9 }}>
                      {expanded === art.id ? "▲" : "▼"}
                    </span>
                  </div>

                  {expanded === art.id && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #0d1e2d" }}>
                      {/* Matched contacts */}
                      <div style={{ color: "#445566", fontSize: 8, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED CONTACTS ({art.matchedContacts.length})
                      </div>
                      {art.matchedContacts.length > 0 ? (
                        art.matchedContacts.map((c) => (
                          <div key={c.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            marginBottom: 3, padding: "3px 6px",
                            background: "rgba(41,231,255,0.04)", borderRadius: 4,
                            border: `1px solid ${CY}18`,
                          }}>
                            <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>{c.name}</span>
                            {c.role && (
                              <span style={{ fontSize: 7, color: `${PURPLE}88` }}>{c.role}</span>
                            )}
                            <span style={{ fontSize: 7, color: `${CY}88`, marginLeft: "auto" }}>
                              score {c._score}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{
                          padding: "5px 8px", borderRadius: 4,
                          background: `${RED}08`, border: `1px solid ${RED}22`,
                          color: RED, fontSize: 8, marginBottom: 4,
                        }}>No contacts matched — this knowledge has no assigned owner.</div>
                      )}

                      {/* Matched scenarios */}
                      <div style={{
                        color: "#445566", fontSize: 8, margin: "8px 0 4px", letterSpacing: 1,
                      }}>
                        MATCHED SCENARIOS ({art.matchedScenarios.length})
                      </div>
                      {art.matchedScenarios.length > 0 ? (
                        art.matchedScenarios.map((s) => (
                          <div key={s.id} style={{
                            display: "flex", alignItems: "center", gap: 6,
                            marginBottom: 3, padding: "3px 6px",
                            background: "rgba(245,166,35,0.04)", borderRadius: 4,
                            border: `1px solid ${AMBER}18`,
                          }}>
                            <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>{s.name}</span>
                            {s.type && (
                              <span style={{ fontSize: 7, color: `${AMBER}88` }}>{s.type}</span>
                            )}
                            <span style={{ fontSize: 7, color: `${AMBER}88`, marginLeft: "auto" }}>
                              score {s._score}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div style={{
                          padding: "5px 8px", borderRadius: 4,
                          background: `${AMBER}08`, border: `1px solid ${AMBER}22`,
                          color: AMBER, fontSize: 8, marginBottom: 4,
                        }}>No scenarios matched — this knowledge informs no active plan.</div>
                      )}

                      <button
                        disabled={assessing === art.id}
                        onClick={() => assessArticle(art)}
                        style={{
                          marginTop: 8,
                          background: assessing === art.id ? "transparent" : `${AMBER}18`,
                          border: `1px solid ${AMBER}44`,
                          color: assessing === art.id ? "#445566" : AMBER,
                          borderRadius: 4, padding: "4px 12px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                          letterSpacing: 1, cursor: assessing === art.id ? "default" : "pointer",
                        }}
                      >
                        {assessing === art.id ? "▶ ASSESSING…" : "▶ ASSESS"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Coverage footer */}
          {correlated.length > 0 && !loading && (
            <div style={{
              marginTop: 10, paddingTop: 8, borderTop: "1px solid #0d1e2d",
              fontSize: 8, color: "#445566", textAlign: "center",
            }}>
              briefed coverage:{" "}
              <span style={{ color: GREEN, fontWeight: "bold" }}>
                {Math.round((fullyBriefed.length / correlated.length) * 100)}%
              </span>
              {" "}({fullyBriefed.length}/{correlated.length} fully briefed) ·{" "}
              {dark.length > 0 && (
                <span style={{ color: RED, fontWeight: "bold" }}>
                  {dark.length} dark
                </span>
              )}
              {dark.length === 0 && <span style={{ color: GREEN }}>no dark articles</span>}
              {" "}· 120 s refresh
            </div>
          )}
        </div>
      )}
      <style>{`
        @keyframes kcsbrief-pulse {
          0%, 100% { border-color: rgba(255,61,90,0.13); }
          50%       { border-color: rgba(255,61,90,0.45); }
        }
      `}</style>
    </>
  );
}
