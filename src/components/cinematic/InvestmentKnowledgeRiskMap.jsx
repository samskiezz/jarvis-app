/**
 * F178 — Investment × Knowledge × RiskSignal Portfolio Risk Intelligence Map (IKRIMAP)
 *
 * Parallel-fetches /entities/Investment + /knowledge/ + /entities/RiskSignal and
 * keyword-correlates each investment against KB articles AND active risk signals to classify:
 *
 *   FULLY_MONITORED — matched both a KB article AND a risk signal
 *   KNOWLEDGE_BACKED — matched a KB article, no risk signal flagging
 *   RISK_FLAGGED    — matched a risk signal, no KB coverage
 *   EXPOSED         — no matches (portfolio intelligence gap)
 *
 * Stat tiles: INVESTMENTS / KB ARTICLES / RISK SIGNALS + four class counts + MONITORED%.
 * Red badge on exposed count.
 * Filter tabs ALL / FULLY_MONITORED / KNOWLEDGE_BACKED / RISK_FLAGGED / EXPOSED + text search.
 * Expand investment → matched KB article cards (green, category badge) + risk signal cards
 *                   (red, severity badge) with relevance bars.
 * ▶ ASSESS PORTFOLIO RISK → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ikrimap-toggle event.
 *
 * Voice triggers:
 *   "ikrimap / portfolio risk / investment risk / exposed investment /
 *    investment knowledge risk / portfolio intelligence gap"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_042_040;
const Z_INDEX  = 239;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const IKRIMAP_RE = /\b(ikrimap|portfolio[\s-]risk\b|investment[\s-]risk\b|exposed[\s-]investment|investment[\s-]knowledge[\s-]risk|portfolio[\s-]intelligence[\s-]gap)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const RD     = "#EF4444";
const AM     = "#F59E0B";
const PU     = "#A855F7";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MONITORED:  GR,
  KNOWLEDGE_BACKED: CY,
  RISK_FLAGGED:     AM,
  EXPOSED:          RD,
};

const TABS = ["ALL", "FULLY_MONITORED", "KNOWLEDGE_BACKED", "RISK_FLAGGED", "EXPOSED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function invText(inv) {
  return `${inv.name || inv.title || ""} ${inv.type || ""} ${inv.sector || ""} ${inv.description || inv.summary || ""} ${(inv.tags || []).join(" ")}`;
}
function kbText(k) {
  return `${k.title || k.name || ""} ${k.content || k.summary || k.description || ""} ${k.category || k.type || ""} ${(k.tags || []).join(" ")}`;
}
function riskText(r) {
  return `${r.title || r.name || ""} ${r.description || r.summary || ""} ${r.type || ""} ${(r.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [invRes, kbRes, riskRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Investment`,  { headers }),
    fetch(`${apiBase}/knowledge/`,           { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const investments = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investments", "items"]) : [];
  const articles = kbRes.status === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "items"]) : [];
  const signals = riskRes.status === "fulfilled" && riskRes.value.ok
    ? normaliseArray(await riskRes.value.json(), ["signals", "items"]) : [];
  return { investments, articles, signals };
}

function correlate(investments, articles, signals) {
  return investments.map(inv => {
    const kws = keywords(invText(inv));
    const matchedArticles = articles
      .map(a => ({ ...a, _score: score(kbText(a), kws) }))
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedSignals = signals
      .map(s => ({ ...s, _score: score(riskText(s), kws) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasArticle = matchedArticles.length > 0;
    const hasSignal  = matchedSignals.length > 0;
    let cls;
    if (hasArticle && hasSignal) cls = "FULLY_MONITORED";
    else if (hasArticle)         cls = "KNOWLEDGE_BACKED";
    else if (hasSignal)          cls = "RISK_FLAGGED";
    else                         cls = "EXPOSED";
    return { ...inv, _cls: cls, _articles: matchedArticles, _signals: matchedSignals };
  });
}

export async function buildIkrimapScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { investments, articles, signals } = await loadAll();
  const corr    = correlate(investments, articles, signals);
  const exposed = corr.filter(i => i._cls === "EXPOSED").length;
  const fully   = corr.filter(i => i._cls === "FULLY_MONITORED").length;
  const context = `Investments: ${investments.length}, KB articles: ${articles.length}, risk signals: ${signals.length}. Fully monitored (KB + risk): ${fully}. Exposed (no KB or risk coverage): ${exposed}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `Assess JARVIS portfolio risk intelligence coverage. ${context} Give a 2-sentence operational brief focusing on exposed investments and portfolio intelligence gaps.` }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${exposed} investments lack both knowledge base coverage and active risk signal monitoring — these represent critical portfolio intelligence gaps. ${fully} investments are fully monitored with both knowledge backing and live risk signal coverage.`;
}

export function isIkrimapQuery(q) { return IKRIMAP_RE.test(q); }

export default function InvestmentKnowledgeRiskMap() {
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [investments, setInvestments] = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [corr,        setCorr]        = useState([]);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [brief,       setBrief]       = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadAll();
      setInvestments(data.investments);
      setArticles(data.articles);
      setSignals(data.signals);
      setCorr(correlate(data.investments, data.articles, data.signals));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ikrimap-toggle", toggle);
    return () => window.removeEventListener("jarvis:ikrimap-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const text = await buildIkrimapScript();
      setBrief(text);
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const r = await fetch(`${apiBase}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        new Audio(url).play().catch(() => {});
      }
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const fully     = corr.filter(i => i._cls === "FULLY_MONITORED").length;
  const kbOnly    = corr.filter(i => i._cls === "KNOWLEDGE_BACKED").length;
  const riskOnly  = corr.filter(i => i._cls === "RISK_FLAGGED").length;
  const exposed   = corr.filter(i => i._cls === "EXPOSED").length;
  const monitPct  = corr.length ? Math.round((fully / corr.length) * 100) : 0;

  const visible = corr.filter(i => {
    const matchTab  = tab === "ALL" || i._cls === tab;
    const matchSrch = !search || invText(i).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: exposed > 0 ? RD : CY, fontFamily: FONT, fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: exposed > 0 ? `0 0 8px ${RD}55` : "none",
        }}
        title="Investment × Knowledge × RiskSignal Portfolio Risk Intelligence Map (F178)"
      >
        ◈ IKRIMAP{exposed > 0 && <span style={{ color: RD, marginLeft: 4 }}>●{exposed}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 40, right: 16, width: 560, maxHeight: "calc(100vh - 60px)",
      zIndex: Z_INDEX + 100, background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, fontFamily: FONT, fontSize: 11, color: CY,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,207,255,0.12)",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          ◈ IKRIMAP — Investment × Knowledge × Risk Portfolio Map
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: AM, fontSize: 10 }}>⟳ loading…</span>}
          <button onClick={refresh} style={{ background: "none", border: `1px solid ${BORDER}`, color: CY, cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS",  corr.length,       CY],
          ["KB ARTICLES",  articles.length,   GR],
          ["RISK SIGNALS", signals.length,    RD],
          ["FULLY MON",    fully,             GR],
          ["KB BACKED",    kbOnly,            CY],
          ["RISK FLAGGED", riskOnly,          AM],
          ["EXPOSED",      exposed,           RD],
          [`${monitPct}% MON`, null,          GR],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{val ?? label}</div>
            {val !== null && <div style={{ color: "#6B7280", fontSize: 9, marginTop: 1 }}>{label}</div>}
          </div>
        ))}
      </div>

      {/* Monitor coverage bar */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 3 }}>FULL MONITORING COVERAGE</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${monitPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "none",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "#6B7280", cursor: "pointer",
            padding: "2px 7px", borderRadius: 3, fontSize: 9, fontFamily: FONT,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontFamily: FONT }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: "#6B7280", padding: 8, textAlign: "center" }}>No items match.</div>
        )}
        {visible.map((inv, i) => {
          const id   = inv.id || inv.investment_id || i;
          const isExp = expanded === id;
          const clr  = CLASS_COLOR[inv._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{inv._cls}</span>
                  <span style={{ color: CY }}>{inv.name || inv.title || `Investment ${id}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                  {inv._articles.length > 0 && <span style={{ color: GR }}>KB:{inv._articles.length}</span>}
                  {inv._signals.length > 0  && <span style={{ color: RD }}>RSK:{inv._signals.length}</span>}
                  <span>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {inv.type && (
                <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>{inv.type}{inv.sector ? ` · ${inv.sector}` : ""}</div>
              )}
              {isExp && (
                <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                  {inv._articles.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 3 }}>KB ARTICLES</div>
                      {inv._articles.map((a, ai) => (
                        <div key={ai} style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: GR, fontSize: 10 }}>{a.title || a.name || "Article"}</span>
                            {a.category && <span style={{ background: "rgba(34,197,94,0.15)", color: GR, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{a.category.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (a._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {inv._signals.length > 0 && (
                    <div>
                      <div style={{ color: RD, fontSize: 9, marginBottom: 3 }}>RISK SIGNALS</div>
                      {inv._signals.map((s, si) => (
                        <div key={si} style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: RD, fontSize: 10 }}>{s.title || s.name || "Signal"}</span>
                            {s.severity && <span style={{ background: "rgba(239,68,68,0.2)", color: RD, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{s.severity.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (s._score / 5) * 100)}%`, background: RD, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {inv._articles.length === 0 && inv._signals.length === 0 && (
                    <div style={{ color: RD, fontSize: 9, padding: "4px 0" }}>No KB or risk signal coverage found for this investment.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess button */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, cursor: assessing ? "wait" : "pointer", padding: "5px 14px", borderRadius: 4, fontFamily: FONT, fontSize: 10, width: "100%" }}
        >
          {assessing ? "⟳ Assessing…" : "▶ ASSESS PORTFOLIO RISK"}
        </button>
        {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
