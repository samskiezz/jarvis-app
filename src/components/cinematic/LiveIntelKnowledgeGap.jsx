/**
 * LiveIntelKnowledgeGap — F216.
 *
 * Parallel-fetches /functions/getLiveIntel (quakes, crypto, FX)
 * and /knowledge/ (all knowledge articles).
 *
 * Derives discrete live events (earthquake regions, crypto/FX assets) and
 * keyword-correlates each against the knowledge base to surface:
 *   KNOWN      — ≥1 knowledge article covers this live event
 *   BLIND SPOT — no knowledge article matches this event
 *
 * Stat tiles: events / articles / known / blind spots
 * Filter tabs: ALL / KNOWN / BLIND SPOT + text search
 * Expand event → matched articles with relevance score.
 * ▶ ASSESS per event → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "intel knowledge" / "knowledge gap" / "knowledge blind spot" /
 *         "live knowledge gap" / "ikgap" / "what don't we know" /
 *         "blind spot" / "what's unknown" / "knowledge coverage"
 *   → jarvis:ikgap-toggle + TTS brief via buildIkgapScript()
 *
 * Toggle: ◈ IKGAP at left:9720, bottom:8, zIndex:70.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";
const PUR   = "#A78BFA";

const BTN_LEFT   = 9720;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.articles)) return raw.articles;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a) => ({
    id:      a.id || a._id || String(Math.random()),
    title:   a.title || a.name || a.subject || "Untitled",
    content: a.content || a.body || a.summary || a.description || "",
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    type:    a.type || a.kind || a.category || "",
  }));
}

/** Derive discrete live events from getLiveIntel payload. */
function extractLiveEvents(data) {
  const events = [];

  // Earthquakes → one event per quake
  const quakes = Array.isArray(data?.earthquakes) ? data.earthquakes
    : Array.isArray(data?.seismic) ? data.seismic
    : [];
  for (const q of quakes) {
    const place = q.place || q.location || q.region || "";
    const mag   = q.magnitude || q.mag || 0;
    const id    = q.id || `quake-${place}-${mag}`;
    const keywords = [
      "earthquake", "seismic", "quake",
      ...place.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2),
    ].filter(Boolean);
    events.push({
      id,
      label: `M${mag} — ${place || "Unknown location"}`,
      kind: "QUAKE",
      severity: mag >= 6 ? "critical" : mag >= 5 ? "high" : mag >= 4 ? "medium" : "low",
      keywords,
      meta: `magnitude ${mag}`,
    });
  }

  // Crypto/FX markets → one event per asset
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  for (const m of markets) {
    const sym     = m.symbol || m.ticker || m.name || "";
    const display = m.display || m.name || sym;
    const chg     = m.change_pct ?? m.changePercent ?? m.pct_change ?? null;
    const atype   = m.asset_type === "FX" || m.type === "FX" ? "FX" : "CRYPTO";
    if (!sym) continue;
    const keywords = [
      sym.toLowerCase(),
      display.toLowerCase(),
      atype.toLowerCase(),
      "market", "trading", "finance",
      ...sym.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0),
      ...display.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2),
    ].filter(Boolean);
    events.push({
      id: `${atype}-${sym}`,
      label: `${display} (${sym})`,
      kind: atype,
      severity: chg != null && Math.abs(chg) >= 5 ? "high" : "medium",
      keywords,
      meta: chg != null ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%` : "—",
    });
  }

  return events;
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function matchScore(event, article) {
  const artText = `${article.title} ${article.tags} ${article.content}`.toLowerCase();
  return event.keywords.reduce((acc, kw) => acc + (artText.includes(kw) ? 1 : 0), 0)
    + tokens(event.label).reduce((acc, w) => acc + (artText.includes(w) ? 1 : 0), 0);
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

function severityCol(sev) {
  if (sev === "critical") return RED;
  if (sev === "high")     return AMBER;
  if (sev === "medium")   return "#F5D623";
  return GREEN;
}

function kindBadgeCol(kind) {
  if (kind === "QUAKE")  return CY;
  if (kind === "CRYPTO") return PUR;
  if (kind === "FX")     return "#7FFFD4";
  return "#445566";
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const IKGAP_RE =
  /intel.{0,15}knowledge|knowledge.{0,12}(gap|blind|cover|hole)|live.{0,12}knowledge.{0,12}gap|ikgap\b|blind.{0,8}spot|what.{0,8}(don.t|dont).{0,8}we.{0,8}know|what.{0,8}(is|are).{0,8}unknown|knowledge.{0,12}coverage.{0,12}(live|intel|real)/i;

export function isIkgapQuery(q) {
  return IKGAP_RE.test(q || "");
}

export async function buildIkgapScript() {
  try {
    const [intelData, artRaw] = await Promise.all([
      getLiveIntel({ type: "all" }),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events   = extractLiveEvents(intelData);
    const articles = normaliseArticles(artRaw);
    const corr     = correlate(events, articles);
    const known    = corr.filter((e) => e.matched.length > 0);
    const blind    = corr.filter((e) => e.matched.length === 0);
    const topBlind = blind.slice(0, 3).map((e) => `"${e.label}"`).join(", ");
    return `Live intelligence knowledge gap analysis complete, sir. ${events.length} live event${events.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${known.length} event${known.length !== 1 ? "s are" : " is"} covered by existing knowledge articles; ${blind.length} event${blind.length !== 1 ? "s have" : " has"} no matching documentation — these are your blind spots${topBlind ? `: ${topBlind}` : ""}. I recommend creating targeted knowledge articles for each uncovered live event to close these intelligence gaps.`;
  } catch (_) {
    return "Live intelligence knowledge gap detector is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LiveIntelKnowledgeGap() {
  const [visible, setVisible]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [intelData, artRaw] = await Promise.all([
        getLiveIntel({ type: "all" }),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(extractLiveEvents(intelData));
      setArticles(normaliseArticles(artRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:ikgap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ikgap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessEvent(ev, matched) {
    setAssessing(ev.id);
    const artList = matched.length > 0
      ? matched.map((a) => `"${a.title}"`).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence intelligence knowledge gap assessment for the live event "${ev.label}" (kind: ${ev.kind}, ${ev.meta}). Matching knowledge articles: ${artList}. Comment on whether current knowledge base coverage is sufficient and what documentation should be created to address this live intelligence event.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Assessment unavailable, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(events, articles);
  const known  = correlated.filter((e) => e.matched.length > 0);
  const blind  = correlated.filter((e) => e.matched.length === 0);

  const base =
    tab === "KNOWN"       ? known :
    tab === "BLIND SPOT"  ? blind : correlated;

  const displayed = search.trim()
    ? base.filter((e) =>
        e.label.toLowerCase().includes(search.toLowerCase()) ||
        e.kind.toLowerCase().includes(search.toLowerCase()) ||
        e.severity.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Live Intel × Knowledge Gap Detector (F216)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 70,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ IKGAP
        {blind.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{blind.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 300), zIndex: 70,
          width: 660, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}33`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}14`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ LIVE INTEL × KNOWLEDGE GAP
            </span>
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
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, marginBottom: 10,
          }}>
            {[
              ["EVENTS",      events.length,   CY],
              ["ARTICLES",    articles.length, PUR],
              ["KNOWN",       known.length,    GREEN],
              ["BLIND SPOTS", blind.length,    blind.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "KNOWN", "BLIND SPOT"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${CY}33`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 140,
              }}
            />
          </div>

          {/* Event rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              cross-referencing live intel against knowledge base…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "BLIND SPOT"
                ? "All live events are covered by existing knowledge articles."
                : "No items in this filter."}
            </div>
          ) : (
            displayed.map((ev) => {
              const isKnown  = ev.matched.length > 0;
              const isOpen   = expanded === ev.id;
              const sevCol   = severityCol(ev.severity);
              const kindCol  = kindBadgeCol(ev.kind);
              return (
                <div
                  key={ev.id}
                  onClick={() => setExpanded(isOpen ? null : ev.id)}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                    borderLeft: `3px solid ${isKnown ? GREEN : AMBER}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Event header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 7, color: kindCol,
                      border: `1px solid ${kindCol}44`,
                      borderRadius: 3, padding: "1px 5px",
                      letterSpacing: 1, whiteSpace: "nowrap",
                      textTransform: "uppercase", flexShrink: 0,
                    }}>{ev.kind}</span>
                    <span style={{
                      fontSize: 7, color: sevCol,
                      border: `1px solid ${sevCol}44`,
                      borderRadius: 3, padding: "1px 5px",
                      letterSpacing: 1, whiteSpace: "nowrap",
                      textTransform: "uppercase", flexShrink: 0,
                    }}>{ev.severity}</span>
                    <span style={{
                      color: "#DCEBF5", fontSize: 10, flex: 1, minWidth: 0,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ev.label}
                    </span>
                    <span style={{ fontSize: 8, color: "#445566", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {ev.meta}
                    </span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isKnown ? GREEN : AMBER,
                    }}>
                      {isKnown
                        ? `${ev.matched.length} article${ev.matched.length !== 1 ? "s" : ""} KNOWN`
                        : "BLIND SPOT"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 5 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessEvent(ev, ev.matched); }}
                      disabled={assessing === ev.id}
                      style={{
                        background: assessing === ev.id ? "#1a2530" : `${CY}18`,
                        color: assessing === ev.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1,
                        cursor: assessing === ev.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === ev.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded: matched articles */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {ev.matched.length === 0 ? (
                        <div style={{
                          color: AMBER, fontSize: 8, lineHeight: 1.5,
                          background: `${AMBER}0a`, borderRadius: 4, padding: "6px 8px",
                        }}>
                          ⚠ No knowledge articles cover this live event. Creating targeted documentation is recommended.
                        </div>
                      ) : (
                        ev.matched.map((a, i) => (
                          <div key={`${a.id}-${i}`} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${GREEN}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "center", gap: 8,
                          }}>
                            {a.type && (
                              <span style={{
                                fontSize: 7, color: PUR,
                                border: `1px solid ${PUR}44`,
                                borderRadius: 3, padding: "1px 5px",
                                letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0,
                              }}>{a.type.toUpperCase()}</span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                color: "#a0b8cc", fontSize: 10,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{a.title}</div>
                            </div>
                            <div style={{ fontSize: 7, color: `${GREEN}66`, whiteSpace: "nowrap", flexShrink: 0 }}>
                              match {a._score}
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

          <div style={{
            marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right",
          }}>
            /functions/getLiveIntel + /knowledge/ · 5-min auto-refresh · ▶ ASSESS for AI knowledge-gap brief
          </div>
        </div>
      )}
    </>
  );
}
