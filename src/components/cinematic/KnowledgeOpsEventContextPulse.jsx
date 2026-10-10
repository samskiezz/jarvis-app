/**
 * F195 — Knowledge × Ops Event × RiskSignal Intel Context Coverage Pulse (KOECP)
 *
 * Parallel-fetches /knowledge/ + /v1/ops/events + /entities/RiskSignal
 * and keyword-correlates each KB article against ops events AND active
 * risk signals to classify contextual grounding:
 *
 *   FULLY_CONTEXTUALIZED — matched ops event + risk signal (live intel context complete)
 *   OPS_LINKED           — ops event present, no risk signal coverage
 *   RISK_BACKED          — risk signal coverage, no ops event link
 *   ISOLATED             — neither (context gap — knowledge floating without live intel anchor)
 *
 * Stat tiles: KB ARTICLES / OPS EVENTS / RISK SIGNALS + four class counts + CONTEXT%.
 * Amber badge on ISOLATED count.
 * Filter tabs ALL / FULLY_CONTEXTUALIZED / OPS_LINKED / RISK_BACKED / ISOLATED + text search.
 * Expand article → matched ops event cards (blue) + risk signal cards (red) with relevance bars.
 * ▶ ASSESS CONTEXT → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:koecp-toggle event.
 *
 * Voice triggers:
 *   "koecp / knowledge ops / intel context coverage / isolated knowledge /
 *    ops knowledge / risk knowledge / context pulse / knowledge context"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_051_560;
const Z_INDEX  = 256;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const KOECP_RE = /\b(koecp|knowledge[\s-]ops|intel[\s-]context[\s-]coverage|isolated[\s-]knowledge|ops[\s-]knowledge|risk[\s-]knowledge|context[\s-]pulse|knowledge[\s-]context)\b/i;

export function isKoecpQuery(q = "") { return KOECP_RE.test(q); }

export async function buildKoecpScript() {
  const base = apiBase();
  const [kbRes, opsRes, riskRes] = await Promise.allSettled([
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);
  const articles = kbRes.status   === "fulfilled" ? (kbRes.value?.items   || kbRes.value   || []) : [];
  const events   = opsRes.status  === "fulfilled" ? (opsRes.value?.items  || opsRes.value  || []) : [];
  const signals  = riskRes.status === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : [];

  let fullyCtx = 0, isolated = 0;
  for (const a of articles) {
    const kws = keywords(articleText(a));
    const hasOps  = events.some(e  => scoreText(opsText(e),    kws) > 0);
    const hasRisk = signals.some(s => scoreText(riskText(s),   kws) > 0);
    if (hasOps && hasRisk) fullyCtx++;
    else if (!hasOps && !hasRisk) isolated++;
  }
  const total      = articles.length;
  const contextPct = total ? Math.round((fullyCtx / total) * 100) : 0;
  return `KOECP Intel Context Coverage Pulse online, sir. I have cross-referenced ${total} knowledge base articles against ${events.length} operational events and ${signals.length} active risk signals. ${fullyCtx} articles are fully contextualized with both operational and risk signal grounding, representing ${contextPct}% of the knowledge base. ${isolated} articles are completely isolated — floating without any live intel anchor. Recommend prioritising those isolated articles for operational context tagging, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const BL     = "#3B82F6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_CONTEXTUALIZED: GR,
  OPS_LINKED:           BL,
  RISK_BACKED:          RD,
  ISOLATED:             AM,
};

const TABS = ["ALL", "FULLY_CONTEXTUALIZED", "OPS_LINKED", "RISK_BACKED", "ISOLATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function articleText(a) {
  return [a.title, a.name, a.content, a.summary, a.description, a.tags, a.category, a.author].filter(Boolean).join(" ");
}
function opsText(e) {
  return [e.title, e.name, e.description, e.type, e.source, e.category, e.tags, e.summary].filter(Boolean).join(" ");
}
function riskText(s) {
  return [s.title, s.name, s.description, s.category, s.source, s.tags, s.severity, s.type].filter(Boolean).join(" ");
}

function classify(article, events, signals) {
  const kws = keywords(articleText(article));
  const matchedEvents = events
    .map(e  => ({ ...e,  _score: scoreText(opsText(e),  kws) }))
    .filter(e  => e._score  > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedSignals = signals
    .map(s  => ({ ...s,  _score: scoreText(riskText(s), kws) }))
    .filter(s  => s._score  > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasOps  = matchedEvents.length  > 0;
  const hasRisk = matchedSignals.length > 0;
  let cls;
  if (hasOps && hasRisk)   cls = "FULLY_CONTEXTUALIZED";
  else if (hasOps)          cls = "OPS_LINKED";
  else if (hasRisk)         cls = "RISK_BACKED";
  else                      cls = "ISOLATED";
  return { ...article, _cls: cls, _events: matchedEvents, _signals: matchedSignals };
}

export default function KnowledgeOpsEventContextPulse() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [articles, setArticles]     = useState([]);
  const [events, setEvents]         = useState([]);
  const [signals, setSignals]       = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [kbRes, opsRes, riskRes] = await Promise.allSettled([
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const art = kbRes.status   === "fulfilled" ? (kbRes.value?.items   || kbRes.value   || []) : [];
      const evs = opsRes.status  === "fulfilled" ? (opsRes.value?.items  || opsRes.value  || []) : [];
      const sig = riskRes.status === "fulfilled" ? (riskRes.value?.items || riskRes.value || []) : [];
      setArticles(art);
      setEvents(evs);
      setSignals(sig);
      setClassified(art.map(a => classify(a, evs, sig)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:koecp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:koecp-toggle", onToggle);
  }, []);

  const fullyCtx  = classified.filter(c => c._cls === "FULLY_CONTEXTUALIZED").length;
  const opsLinked = classified.filter(c => c._cls === "OPS_LINKED").length;
  const riskBacked= classified.filter(c => c._cls === "RISK_BACKED").length;
  const isolated  = classified.filter(c => c._cls === "ISOLATED").length;
  const total     = classified.length;
  const contextPct= total ? Math.round((fullyCtx / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || articleText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `KOECP: ${total} KB articles — FULLY_CONTEXTUALIZED: ${fullyCtx}, OPS_LINKED: ${opsLinked}, RISK_BACKED: ${riskBacked}, ISOLATED: ${isolated} (${contextPct}% contextualized). Ops Events: ${events.length}. Risk Signals: ${signals.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `KOECP intel context coverage pulse assessment. Context: ${ctx}. Provide a 2-sentence operational brief about which isolated knowledge articles represent the highest intelligence gap and which live operational events or risk signals should be linked immediately for context grounding. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Intel context assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Knowledge Ops Event Context Pulse (KOECP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isolated > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {isolated}
          </span>
        )}
        ◈ KOECP
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ KOECP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Knowledge × Ops Event × RiskSignal Intel Context Coverage Pulse
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["KB ARTICLES",           total,        CY],
          ["OPS EVENTS",            events.length, BL],
          ["RISK SIGNALS",          signals.length, RD],
          ["FULLY CONTEXTUALIZED",  fullyCtx,      GR],
          ["OPS LINKED",            opsLinked,     BL],
          ["RISK BACKED",           riskBacked,    RD],
          ["ISOLATED",              isolated,      AM],
          ["CONTEXT%",              contextPct + "%", GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INTEL CONTEXT COVERAGE</div>
        <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", position: "relative", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${contextPct}%`, background: GR, borderRadius: 3, transition: "width 0.4s" }} />
        </div>
        <div style={{ color: GR, fontSize: 9, marginTop: 2 }}>{contextPct}% of knowledge articles fully contextualized</div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={assess} disabled={assessing} style={{
          fontFamily: FONT, fontSize: 10, letterSpacing: 1, cursor: assessing ? "not-allowed" : "pointer",
          background: assessing ? "rgba(0,207,255,0.1)" : "rgba(0,207,255,0.15)",
          border: `1px solid ${CY}66`, color: CY, padding: "4px 10px", borderRadius: 4,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS CONTEXT"}
        </button>
      </div>
      {brief && (
        <div style={{ color: "#DCEBF5", fontSize: 12, lineHeight: 1.5, marginBottom: 12,
          padding: "8px 12px", background: "rgba(0,207,255,0.06)", borderRadius: 6,
          border: `1px solid ${CY}22` }}>
          {brief}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 9, letterSpacing: 1, padding: "3px 8px", borderRadius: 4,
            cursor: "pointer",
            background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.06)",
            border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "rgba(0,207,255,0.18)"}`,
            color: tab === t ? "#000" : (CLASS_COLOR[t] || CY),
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="search articles…"
        style={{
          fontFamily: FONT, fontSize: 11, width: "100%", maxWidth: 340, marginBottom: 12,
          background: "rgba(0,207,255,0.04)", border: `1px solid ${BORDER}`,
          color: "#DCEBF5", borderRadius: 4, padding: "5px 10px", outline: "none",
        }}
      />

      {/* Article list */}
      {visible.length === 0 && !loading && (
        <div style={{ color: "#6E8AA0", fontSize: 11 }}>No articles match current filter.</div>
      )}
      {visible.map((a, i) => {
        const col   = CLASS_COLOR[a._cls];
        const isExp = expanded === i;
        const name  = a.title || a.name || `Article ${i + 1}`;
        return (
          <div key={i} style={{
            marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 6,
            background: "rgba(0,207,255,0.02)", overflow: "hidden",
          }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
            >
              <span style={{ color: col, fontSize: 9, letterSpacing: 1, border: `1px solid ${col}55`,
                borderRadius: 3, padding: "1px 5px", minWidth: 110, textAlign: "center" }}>
                {a._cls.replace(/_/g, " ")}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{name}</span>
              {a.category && (
                <span style={{ color: AM, fontSize: 9, border: `1px solid ${AM}44`, borderRadius: 2, padding: "0 4px" }}>
                  {a.category}
                </span>
              )}
              {a._events.length > 0 && (
                <span style={{ color: BL, fontSize: 9 }}>⊕ {a._events.length} event{a._events.length !== 1 ? "s" : ""}</span>
              )}
              {a._signals.length > 0 && (
                <span style={{ color: RD, fontSize: 9 }}>⚑ {a._signals.length} signal{a._signals.length !== 1 ? "s" : ""}</span>
              )}
              <span style={{ color: col, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid ${col}22` }}>
                {a.summary && (
                  <div style={{ color: "#6E8AA0", fontSize: 10, marginTop: 6, marginBottom: 8 }}>
                    {String(a.summary).slice(0, 200)}
                  </div>
                )}

                {a._events.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED OPS EVENTS</div>
                    {a._events.map((e, j) => {
                      const maxScore = Math.max(...a._events.map(x => x._score), 1);
                      const bar = Math.round((e._score / maxScore) * 100);
                      return (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {e.title || e.name || "Event"}
                            </span>
                            {e.type && (
                              <span style={{ color: BL, fontSize: 9, border: `1px solid ${BL}44`, borderRadius: 2, padding: "0 4px" }}>
                                {e.type}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: BL, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {a._signals.length > 0 && (
                  <div>
                    <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>▸ MATCHED RISK SIGNALS</div>
                    {a._signals.map((s, k) => {
                      const maxScore = Math.max(...a._signals.map(x => x._score), 1);
                      const bar = Math.round((s._score / maxScore) * 100);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>
                              {s.title || s.name || "Signal"}
                            </span>
                            {s.severity && (
                              <span style={{ color: RD, fontSize: 9, border: `1px solid ${RD}44`, borderRadius: 2, padding: "0 4px" }}>
                                {s.severity}
                              </span>
                            )}
                          </div>
                          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.05)", marginTop: 2 }}>
                            <div style={{ height: "100%", width: `${bar}%`, background: RD, borderRadius: 2, opacity: 0.7 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {a._events.length === 0 && a._signals.length === 0 && (
                  <div style={{ color: AM, fontSize: 10, marginTop: 6 }}>
                    ◌ No ops event or risk signal coverage — isolated knowledge article
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function smallBtn(color) {
  return {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10, cursor: "pointer",
    background: "transparent", border: `1px solid ${color}55`,
    color: color, padding: "2px 6px", borderRadius: 3,
  };
}
