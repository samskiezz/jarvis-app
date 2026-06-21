/**
 * OpsKnowledgeCorrelator — F63.
 *
 * Parallel-fetches /v1/ops/events + /knowledge/ then keyword-correlates
 * each live ops event against the knowledge article library to surface
 * relevant documentation for active incidents.
 *
 * Stat tiles: events / articles / linked / dark
 * Filter tabs: ALL / LINKED / DARK
 * Expand event → matched knowledge articles with relevance score.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI guidance brief
 *   + jarvis:speak-dossier TTS.
 * 60 s auto-refresh.
 *
 * Intent: "ops knowledge" / "knowledge response" / "event docs" /
 *         "incident docs" / "knowledge ops" / "opskn"
 *   → jarvis:opskn-toggle + TTS brief via buildOpsKnScript()
 *
 * Toggle: ◈ OPSKN at left:8292, bottom:8, zIndex 65.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3D5A";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 8292;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.events))  return raw.events;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseEvents(raw) {
  return normaliseArray(raw).map((e) => ({
    id:       e.id || e.event_id || String(Math.random()),
    title:    e.title || e.name || e.message || e.description || "Unnamed Event",
    severity: (e.severity || e.level || "low").toLowerCase(),
    service:  e.service || e.source || e.system || "",
    type:     e.type || e.category || e.event_type || "",
    ts:       e.timestamp || e.created_at || e.occurred_at || e.ts || "",
    summary:  e.summary || e.details || "",
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

function matchScore(event, article) {
  const artText = `${article.title} ${article.description} ${article.tags.join(" ")}`.toLowerCase();
  const evWords = [
    ...tokens(event.title),
    ...tokens(event.summary),
    ...tokens(event.service),
    ...tokens(event.type),
  ];
  return evWords.reduce((acc, w) => acc + (artText.includes(w) ? 1 : 0), 0);
}

function correlate(events, articles) {
  return events.map((ev) => {
    const matched = articles
      .map((a) => ({ ...a, _score: matchScore(ev, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...ev, matched };
  });
}

function sevColor(s) {
  if (s === "critical")              return RED;
  if (s === "high")                  return AMBER;
  if (s === "medium")                return PURPLE;
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const OPSKN_RE =
  /ops[\s-]?knowledge|knowledge[\s-]?ops|knowledge[\s-]?response|event[\s-]?docs?|incident[\s-]?docs?|ops[\s-]?docs?|opskn\b/i;

export function isOpsKnQuery(q) {
  return OPSKN_RE.test(q || "");
}

export async function buildOpsKnScript() {
  try {
    const [evRaw, knRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/ops/events?limit=30`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events   = normaliseEvents(evRaw);
    const articles = normaliseArticles(knRaw);
    const corr     = correlate(events, articles);
    const linked   = corr.filter((e) => e.matched.length > 0);
    const dark     = corr.filter((e) => e.matched.length === 0);
    const critDark = dark.filter((e) => e.severity === "critical" || e.severity === "high").length;
    return `Ops-knowledge correlator active, sir. ${events.length} live ops event${events.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${linked.length} event${linked.length !== 1 ? "s have" : " has"} matching documentation. ${dark.length} event${dark.length !== 1 ? "s are" : " is"} knowledge-dark${critDark > 0 ? `, including ${critDark} critical or high severity` : ""}. Select any event to surface relevant knowledge and request an AI guidance brief.`;
  } catch (_) {
    return "Ops-knowledge correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function OpsKnowledgeCorrelator() {
  const [visible, setVisible]   = useState(false);
  const [events, setEvents]     = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("DARK");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [evRaw, knRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/ops/events?limit=30`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(normaliseEvents(evRaw));
      setArticles(normaliseArticles(knRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:opskn-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opskn-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessEvent(ev) {
    setAssessing(ev.id);
    const artTitles = ev.matched.map((a) => `"${a.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence operational guidance brief for the event "${ev.title}" (severity: ${ev.severity}). Knowledge articles available: ${artTitles || "none"}. Focus on immediate recommended action and whether documentation is sufficient for response.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient documentation to guide response for this event, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(events, articles);
  const linked     = correlated.filter((e) => e.matched.length > 0);
  const dark       = correlated.filter((e) => e.matched.length === 0);
  const critDark   = dark.filter((e) => e.severity === "critical" || e.severity === "high").length;

  const displayed =
    tab === "ALL"    ? correlated :
    tab === "LINKED" ? linked     : dark;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Ops-Knowledge Correlator (F63)"
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
        ◈ OPSKN
        {critDark > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{critDark}</span>
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
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ OPS-KNOWLEDGE CORRELATOR</span>
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
              ["EVENTS",   events.length,   CY],
              ["ARTICLES", articles.length, PURPLE],
              ["LINKED",   linked.length,   GREEN],
              ["DARK",     dark.length,     dark.length > 0 ? AMBER : "#445566"],
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
            {["ALL", "LINKED", "DARK"].map((t) => (
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

          {/* Event rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating ops events against knowledge library…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DARK" ? "All ops events have knowledge coverage." : "No events in this filter."}
            </div>
          ) : (
            displayed.map((ev) => {
              const sc     = sevColor(ev.severity);
              const isOpen = expanded === ev.id;
              const hasDocs = ev.matched.length > 0;
              return (
                <div key={ev.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasDocs ? GREEN : (sc === RED ? RED : AMBER)}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                  animation: ev.severity === "critical" ? "opskn-pulse 2s ease-in-out infinite" : "none",
                }} onClick={() => setExpanded(isOpen ? null : ev.id)}>
                  {/* Event header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 7, color: sc, border: `1px solid ${sc}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", textTransform: "uppercase",
                    }}>{ev.severity}</span>
                    {ev.service && (
                      <span style={{
                        fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 1, whiteSpace: "nowrap",
                      }}>{ev.service.toUpperCase()}</span>
                    )}
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{ev.title}</span>
                    <span style={{ fontSize: 7, whiteSpace: "nowrap", color: hasDocs ? GREEN : AMBER }}>
                      {hasDocs ? `${ev.matched.length} article${ev.matched.length !== 1 ? "s" : ""}` : "⚠ DARK"}
                    </span>
                  </div>

                  {ev.summary && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {ev.summary.slice(0, 120)}{ev.summary.length > 120 ? "…" : ""}
                    </div>
                  )}

                  {ev.ts && (
                    <div style={{ color: "#334455", fontSize: 7, marginBottom: 4 }}>
                      {String(ev.ts).slice(0, 19).replace("T", " ")}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessEvent(ev); }}
                      disabled={assessing === ev.id}
                      style={{
                        background: assessing === ev.id ? "#1a2530" : `${CY}18`,
                        color: assessing === ev.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === ev.id ? "default" : "pointer",
                      }}
                    >{assessing === ev.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded article list */}
                  {isOpen && hasDocs && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {ev.matched.map((article) => (
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
                              whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
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
                      ⚠ No knowledge articles found for this event. Consider creating supporting documentation.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/ops/events + /knowledge/ · 60 s auto-refresh · ▶ ASSESS for AI guidance brief
          </div>
        </div>
      )}

      <style>{`
        @keyframes opskn-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%       { box-shadow: 0 0 8px 3px ${RED}33; }
        }
      `}</style>
    </>
  );
}
