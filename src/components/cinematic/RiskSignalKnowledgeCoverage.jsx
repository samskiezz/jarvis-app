/**
 * RiskSignalKnowledgeCoverage — F80.
 *
 * Parallel-fetches /entities/RiskSignal + /knowledge/ and keyword-correlates
 * each risk signal against the knowledge article catalogue to surface COVERED
 * signals (at least one article supports them) vs DARK signals (no knowledge
 * backing found).
 *
 * Stat tiles: signals / articles / covered / dark
 * Filter tabs: ALL / COVERED / DARK + text search
 * Expand any signal → matched articles with relevance score
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence knowledge-gap brief + TTS
 *
 * Toggle: ◈ RSKNOW at left:20000, zIndex 65.
 * Voice: "risk signal knowledge" / "risk knowledge coverage" / "knowledge risk" / "rsknow"
 * Auto-refresh: 120 s.
 *
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const RED = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT = 20000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isRsknowQuery(q) {
  return /risk.{0,15}(signal|signal).{0,15}know|know.{0,15}risk|risk\s+knowledge|rsknow\b/i.test(q || "");
}

export async function buildRsknowScript() {
  try {
    const [rr, kr] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({}),
      }),
      fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const signals = normaliseArray(rr.ok ? await rr.json() : []);
    const articles = normaliseArray(kr.ok ? await kr.json() : []);
    const links = buildLinks(signals, articles);
    const covered = new Set(links.map((l) => l.signalId)).size;
    const dark = signals.length - covered;
    window.dispatchEvent(new CustomEvent("jarvis:rsknow-toggle"));
    if (!signals.length)
      return "No risk signals found, sir. The signal board is clear.";
    return `Risk signal knowledge coverage active, sir. ${signals.length} risk signal${signals.length !== 1 ? "s" : ""} cross-referenced against ${articles.length} knowledge article${articles.length !== 1 ? "s" : ""}. ${covered} signal${covered !== 1 ? "s" : ""} ha${covered === 1 ? "s" : "ve"} knowledge backing. ${dark} signal${dark !== 1 ? "s" : ""} ${dark === 1 ? "is" : "are"} dark — no supporting documentation found. Select a signal to review matched articles.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rsknow-toggle"));
    return "Risk signal knowledge coverage panel open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function RiskSignalKnowledgeCoverage() {
  const [visible, setVisible] = useState(false);
  const [signals, setSignals] = useState([]);
  const [articles, setArticles] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [aiMap, setAiMap] = useState({});
  const [aiLoading, setAiLoading] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [rr, kr] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({}),
        }),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      const rawSignals = normaliseArray(rr.ok ? await rr.json() : []);
      const rawArticles = normaliseArray(kr.ok ? await kr.json() : []);
      setSignals(rawSignals);
      setArticles(rawArticles);
      setLinks(buildLinks(rawSignals, rawArticles));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:rsknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rsknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, 120_000);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessSignal(signal, article) {
    const key = `${signal.id || signal._id || signal.title}::${article.id || article._id || article.title}`;
    if (aiMap[key] || aiLoading === key) return;
    setAiLoading(key);
    const sigTitle = signal.title || signal.name || signal.description || signal.type || "Unknown Signal";
    const artTitle = article.title || article.name || article.heading || "Unknown Article";
    const snippet = article.content || article.summary || article.body || artTitle;
    const prompt = `As JARVIS, provide a 2-sentence assessment of how the knowledge article "${artTitle}" supports understanding or mitigating the risk signal "${sigTitle}". Content excerpt: "${String(snippet).slice(0, 300)}". Be direct and intelligence-focused.`;
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

  const coveredIds = new Set(links.map((l) => l.signalId));
  const darkCount = signals.length - coveredIds.size;

  const filtered = signals
    .filter((s) => {
      if (filter === "covered") return coveredIds.has(s.id || s._id || s.title);
      if (filter === "dark") return !coveredIds.has(s.id || s._id || s.title);
      return true;
    })
    .filter((s) => {
      if (!search.trim()) return true;
      const txt = [s.title || "", s.name || "", s.description || "", s.type || ""].join(" ").toLowerCase();
      return txt.includes(search.toLowerCase());
    });

  const selectedLinks = selected
    ? links.filter((l) => l.signalId === (selected.id || selected._id || selected.title))
    : [];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Risk Signal × Knowledge Coverage"
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 65,
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
        {darkCount > 0 && !visible && (
          <span style={{
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
          }}>
            {darkCount}
          </span>
        )}
        ◈ RSKNOW
      </button>

      {/* Panel */}
      {visible && (
        <div style={{
          position: "fixed",
          bottom: 44,
          left: Math.min(BTN_LEFT, window.innerWidth - 660),
          zIndex: 65,
          width: 640,
          maxHeight: "75vh",
          display: "flex",
          flexDirection: "column",
          background: "rgba(4,10,18,0.96)",
          border: `1px solid ${AMBER}44`,
          borderTop: `2px solid ${AMBER}`,
          borderRadius: 12,
          boxShadow: `0 0 40px ${AMBER}14, 0 8px 32px rgba(0,0,0,0.75)`,
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: `1px solid ${AMBER}22`,
            flexShrink: 0,
          }}>
            <span style={{ color: AMBER, fontSize: 13 }}>◈</span>
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              RISK SIGNAL KNOWLEDGE COVERAGE
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{ marginLeft: loading ? 0 : "auto", background: "transparent", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1 }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid #1A2A3A`, flexShrink: 0 }}>
            {[
              { label: "SIGNALS", val: signals.length, col: RED },
              { label: "ARTICLES", val: articles.length, col: VIOLET },
              { label: "COVERED", val: coveredIds.size, col: GREEN },
              { label: "DARK", val: darkCount, col: AMBER },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid #1A2A3A",
                borderRadius: 6,
                padding: "5px 8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: t.col, fontWeight: 700 }}>{t.val}</div>
                <div style={{ fontSize: 8, color: "#4E6A7A", letterSpacing: 1, marginTop: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, padding: "7px 14px", borderBottom: `1px solid #1A2A3A`, flexShrink: 0, alignItems: "center" }}>
            {["all", "covered", "dark"].map((f) => (
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
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "transparent",
                border: `1px solid #2A3A4A`,
                borderRadius: 4,
                padding: "2px 8px",
                color: "#DCEBF5",
                fontSize: 10,
                fontFamily: "inherit",
                width: 120,
                outline: "none",
              }}
            />
          </div>

          {/* Split body */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
            {/* Signal list */}
            <div style={{ width: 230, borderRight: `1px solid #1A2A3A`, overflowY: "auto", flexShrink: 0 }}>
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 14, color: "#6E8AA0", fontSize: 10 }}>No signals in this filter.</div>
              )}
              {filtered.map((s) => {
                const sid = s.id || s._id || s.title;
                const isCovered = coveredIds.has(sid);
                const isActive = selected && (selected.id || selected._id || selected.title) === sid;
                const sev = (s.severity || s.priority || s.urgency || s.level || "").toString().toUpperCase();
                const sevColor = sev === "CRITICAL" ? RED : sev === "HIGH" ? AMBER : sev === "MEDIUM" ? CY : GREEN;
                return (
                  <div
                    key={sid}
                    onClick={() => setSelected(s)}
                    style={{
                      padding: "9px 12px",
                      borderBottom: `1px solid #0E1A26`,
                      cursor: "pointer",
                      background: isActive ? `${AMBER}12` : "transparent",
                      borderLeft: isActive ? `3px solid ${AMBER}` : "3px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      <span style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isCovered ? GREEN : "#2A3A4A",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title || s.name || s.description || s.type || sid}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 5, paddingLeft: 12 }}>
                      {sev && (
                        <span style={{ fontSize: 8, color: sevColor, letterSpacing: 1, padding: "1px 4px", border: `1px solid ${sevColor}44`, borderRadius: 3 }}>
                          {sev}
                        </span>
                      )}
                      {isCovered ? (
                        <span style={{ fontSize: 8, color: GREEN, letterSpacing: 1 }}>
                          {links.filter((l) => l.signalId === sid).length} article{links.filter((l) => l.signalId === sid).length !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span style={{ fontSize: 8, color: AMBER, letterSpacing: 1 }}>DARK</span>
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
                  Select a risk signal to see matched knowledge articles.
                </div>
              )}
              {selected && selectedLinks.length === 0 && (
                <div style={{ padding: 20, color: "#6E8AA0", fontSize: 10 }}>
                  No matching knowledge articles for this signal. Signal is DARK — no documentation found.
                </div>
              )}
              {selected && selectedLinks.length > 0 && (
                <div>
                  <div style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid #1A2A3A`,
                    color: GREEN,
                    fontSize: 10,
                    letterSpacing: 1,
                    fontWeight: 700,
                  }}>
                    {selectedLinks.length} ARTICLE{selectedLinks.length !== 1 ? "S" : ""} FOR "{(selected.title || selected.name || selected.type || "SIGNAL").toUpperCase()}"
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
                        style={{ padding: "10px 14px", borderBottom: `1px solid #0E1A26` }}
                      >
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
                            onClick={() => assessSignal(selected, art)}
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
                        {(art.summary || art.content || art.body) && (
                          <div style={{
                            marginLeft: 20,
                            marginBottom: 5,
                            fontSize: 10,
                            color: "#4E8A9A",
                            lineHeight: 1.5,
                            maxHeight: 48,
                            overflow: "hidden",
                          }}>
                            {String(art.summary || art.content || art.body).slice(0, 180)}…
                          </div>
                        )}
                        {aiText && (
                          <div style={{
                            marginLeft: 20,
                            marginTop: 5,
                            padding: "6px 10px",
                            background: `${GREEN}0A`,
                            border: `1px solid ${GREEN}22`,
                            borderRadius: 5,
                            fontSize: 10,
                            color: "#A0D8B0",
                            lineHeight: 1.5,
                          }}>
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
          <div style={{
            padding: "5px 14px",
            borderTop: `1px solid ${AMBER}18`,
            fontSize: 10,
            color: "#4E6A7A",
            letterSpacing: 1,
            flexShrink: 0,
          }}>
            /entities/RiskSignal + /knowledge/ · 120-s auto-refresh · click ▶ ASSESS for AI relevance
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
    for (const k of ["items", "results", "data", "signals", "articles", "records", "nodes"]) {
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

function buildLinks(signals, articles) {
  if (!signals.length || !articles.length) return [];
  const results = [];
  for (const s of signals) {
    const sid = s.id || s._id || s.title;
    const sText = [s.title || "", s.name || "", s.description || "", s.type || "", ...(Array.isArray(s.tags) ? s.tags : [])].join(" ");
    const sKws = keywords(sText);
    if (!sKws.length) continue;
    for (const art of articles) {
      const artText = [art.title || "", art.name || "", art.heading || "", art.summary || "", art.type || "", ...(Array.isArray(art.tags) ? art.tags : [])].join(" ");
      const artKws = keywords(artText);
      const score = sKws.filter((w) => artKws.includes(w)).length;
      if (score >= 1) results.push({ signalId: sid, article: art, matchScore: score });
    }
  }
  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}
