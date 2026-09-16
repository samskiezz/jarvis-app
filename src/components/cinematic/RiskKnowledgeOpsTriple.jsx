/**
 * F251 — Risk Signal × Knowledge × Ops Event Triple (RKET)
 *
 * Parallel-fetches /entities/RiskSignal + /knowledge/ + /v1/ops/events every 90 s.
 * Keyword-correlates each risk signal against KB articles AND ops events:
 *
 *  DUAL_COVERAGE  — matches both a KB article and an ops event
 *  KB_ONLY        — matches KB only
 *  OPS_ONLY       — matches ops event only
 *  DARK           — no knowledge or ops event coverage
 *
 * Stat tiles: signals / full / kb-only / ops-only / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / DUAL_COVERAGE / KB_ONLY / OPS_ONLY / DARK + text search.
 * Expand signal → matched KB articles + ops events with relevance bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RKET  at left:5460 bottom:18, zIndex:68.
 * Event:   jarvis:rket-toggle
 * Voice:   "risk knowledge ops / rket / dark risks / risk ops coverage /
 *           risk kb / risk knowledge / risk triple / ops risk knowledge /
 *           which risks have no coverage / uncovered risks"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 5460;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:          String(s.id ?? s.signal_id ?? i),
    name:        s.name ?? s.title ?? s.signal_name ?? `Signal ${i + 1}`,
    description: s.description ?? s.details ?? s.body ?? "",
    severity:    s.severity ?? s.level ?? "UNKNOWN",
    source:      s.source ?? s.origin ?? "",
    tags:        Array.isArray(s.tags) ? s.tags : [],
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? a.text ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseOpsEvents(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:          String(e.id ?? e.event_id ?? i),
    name:        e.name ?? e.title ?? e.type ?? `Event ${i + 1}`,
    description: e.description ?? e.body ?? e.details ?? "",
    severity:    e.severity ?? e.level ?? e.priority ?? "INFO",
    type:        e.type ?? e.category ?? e.event_type ?? "",
    source:      e.source ?? e.service ?? "",
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlateSignal(signal, articles, events) {
  const sigTokens = new Set([
    ...tokenise(signal.name),
    ...tokenise(signal.description),
    ...tokenise(signal.source),
    ...signal.tags.flatMap(tokenise),
  ]);

  const matchedArticles = articles
    .map(a => {
      const artTokens = [
        ...tokenise(a.title),
        ...tokenise(a.content),
        ...tokenise(a.topic),
        ...a.tags.flatMap(tokenise),
      ];
      const score = artTokens.filter(t => sigTokens.has(t)).length;
      return { ...a, score };
    })
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const matchedEvents = events
    .map(e => {
      const evTokens = [
        ...tokenise(e.name),
        ...tokenise(e.description),
        ...tokenise(e.type),
        ...tokenise(e.source),
      ];
      const score = evTokens.filter(t => sigTokens.has(t)).length;
      return { ...e, score };
    })
    .filter(e => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const hasKb  = matchedArticles.length > 0;
  const hasOps = matchedEvents.length > 0;
  const classification =
    hasKb && hasOps ? "DUAL_COVERAGE" :
    hasKb           ? "KB_ONLY"       :
    hasOps          ? "OPS_ONLY"      :
                      "DARK";

  return { signal, matchedArticles, matchedEvents, classification };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isRketQuery(q) {
  return /\b(rket|risk knowledge ops|risk triple|risk kb|dark risks|risk ops coverage|uncovered risks|risk knowledge|ops risk knowledge|which risks have no coverage)\b/i.test(q);
}

export async function buildRketScript() {
  try {
    const [sRaw, kRaw, oRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase()}/v1/ops/events`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
    ]);
    const signals  = normaliseSignals(sRaw);
    const articles = normaliseArticles(kRaw);
    const events   = normaliseOpsEvents(oRaw);
    const results  = signals.map(s => correlateSignal(s, articles, events));
    const dark     = results.filter(r => r.classification === "DARK").length;
    const dual     = results.filter(r => r.classification === "DUAL_COVERAGE").length;
    return `JARVIS RKET: ${signals.length} risk signals correlated against ${articles.length} KB articles and ${events.length} ops events. ${dual} signals have dual coverage; ${dark} are DARK with no KB or ops coverage. Review dark signals for intelligence blind spots.`;
  } catch {
    return "RKET analysis unavailable — check backend connectivity.";
  }
}

// ─── severity colour ──────────────────────────────────────────────────────────

function sevColour(sev) {
  switch (String(sev).toUpperCase()) {
    case "CRITICAL": return RED;
    case "HIGH":     return "#FF8C42";
    case "MEDIUM":   return AMBER;
    case "LOW":      return GREEN;
    default:         return MUTED;
  }
}

function classColour(cls) {
  switch (cls) {
    case "DUAL_COVERAGE": return GREEN;
    case "KB_ONLY":       return CY;
    case "OPS_ONLY":      return "#9D6FFF";
    case "DARK":          return AMBER;
    default:              return MUTED;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function RiskKnowledgeOpsTriple() {
  const [open,     setOpen]     = useState(false);
  const [results,  setResults]  = useState([]);
  const [articles, setArticles] = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRaw, kRaw, oRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
        fetch(`${apiBase()}/knowledge/`,          { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
        fetch(`${apiBase()}/v1/ops/events`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()).catch(() => []),
      ]);
      const sigs  = normaliseSignals(sRaw);
      const arts  = normaliseArticles(kRaw);
      const evts  = normaliseOpsEvents(oRaw);
      setArticles(arts);
      setEvents(evts);
      setResults(sigs.map(s => correlateSignal(s, arts, evts)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!results.length) load(); };
    window.addEventListener("jarvis:rket-toggle", toggle);
    return () => window.removeEventListener("jarvis:rket-toggle", toggle);
  }, [load, results.length]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildRketScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally { setAssessing(false); }
  };

  if (!open) {
    const dark = results.filter(r => r.classification === "DARK").length;
    return (
      <button
        onClick={() => { setOpen(true); if (!results.length) load(); }}
        style={{
          position:     "fixed",
          left:         BTN_LEFT,
          bottom:       18,
          zIndex:       68,
          background:   "transparent",
          border:       `1px solid ${AMBER}44`,
          color:        dark > 0 ? AMBER : MUTED,
          padding:      "2px 7px",
          borderRadius: 4,
          cursor:       "pointer",
          fontSize:     9,
          fontFamily:   MONO,
          whiteSpace:   "nowrap",
        }}
      >
        ◈ RKET{dark > 0 ? ` ${dark}` : ""}
      </button>
    );
  }

  const total = results.length;
  const dual  = results.filter(r => r.classification === "DUAL_COVERAGE").length;
  const kbOnly= results.filter(r => r.classification === "KB_ONLY").length;
  const opsOnly=results.filter(r => r.classification === "OPS_ONLY").length;
  const dark  = results.filter(r => r.classification === "DARK").length;

  const filtered = results.filter(r => {
    const matchFilter =
      filter === "ALL"           ||
      filter === r.classification;
    const q = search.toLowerCase();
    const matchSearch = !q || r.signal.name.toLowerCase().includes(q) || r.signal.description.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const TABS = ["ALL", "DUAL_COVERAGE", "KB_ONLY", "OPS_ONLY", "DARK"];

  return (
    <>
      <div style={{
        position:    "fixed",
        right:       16,
        top:         60,
        width:       380,
        maxHeight:   "80vh",
        overflowY:   "auto",
        zIndex:      68,
        background:  "#08101Aee",
        border:      `1px solid ${AMBER}55`,
        borderRadius: 6,
        fontFamily:  MONO,
        fontSize:    10,
        color:       "#C8E0F0",
      }}>
        {/* header */}
        <div style={{ display:"flex", alignItems:"center", padding:"6px 10px", borderBottom:`1px solid ${AMBER}33`, gap:6 }}>
          <span style={{ color: AMBER, fontWeight: 700, fontSize: 11 }}>◈ RISK × KB × OPS TRIPLE</span>
          <span style={{ color: MUTED, fontSize: 9, marginLeft: "auto" }}>{total} signals · {articles.length} KB · {events.length} ops</span>
          <button
            onClick={assess}
            disabled={assessing}
            style={{ background:"transparent", border:`1px solid ${CY}55`, color: CY, padding:"1px 6px", borderRadius:3, cursor:"pointer", fontSize:9 }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{ background:"transparent", border:"none", color: MUTED, cursor:"pointer", fontSize:13, lineHeight:1 }}
          >
            ×
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4, padding:"6px 10px" }}>
          {[
            { label:"SIGNALS",  val: total, col: CY    },
            { label:"DUAL",     val: dual,  col: GREEN },
            { label:"KB ONLY",  val: kbOnly,col: CY    },
            { label:"OPS ONLY", val: opsOnly,col:"#9D6FFF"},
            { label:"DARK",     val: dark,  col: AMBER },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background:"#0C1820", border:`1px solid ${col}33`, borderRadius:4, padding:"4px 0", textAlign:"center" }}>
              <div style={{ color: col, fontWeight:700, fontSize:12 }}>{val}</div>
              <div style={{ color: MUTED, fontSize:7 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* brief */}
        {brief && (
          <div style={{ margin:"0 10px 6px", padding:"5px 8px", background:"#0a1520", border:`1px solid ${CY}33`, borderRadius:4, fontSize:9, color: CY, lineHeight:1.5 }}>
            {brief}
          </div>
        )}

        {/* filter tabs */}
        <div style={{ display:"flex", gap:3, padding:"0 10px 6px", flexWrap:"wrap" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{
                background:   filter === t ? `${classColour(t)}22` : "transparent",
                border:       `1px solid ${filter === t ? classColour(t) : MUTED + "44"}`,
                color:        filter === t ? classColour(t) : MUTED,
                padding:      "1px 6px",
                borderRadius: 3,
                cursor:       "pointer",
                fontSize:     8,
                fontFamily:   MONO,
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <div style={{ padding:"0 10px 6px" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search signals…"
            style={{
              width:       "100%",
              background:  "#0C1820",
              border:      `1px solid ${MUTED}44`,
              color:       "#C8E0F0",
              padding:     "3px 6px",
              borderRadius: 3,
              fontSize:    9,
              fontFamily:  MONO,
              boxSizing:   "border-box",
            }}
          />
        </div>

        {/* rows */}
        {loading && !results.length && (
          <div style={{ padding:"10px", color: MUTED, textAlign:"center" }}>loading…</div>
        )}
        {filtered.map(({ signal, matchedArticles, matchedEvents, classification }) => {
          const isExp = expanded === signal.id;
          const col   = classColour(classification);
          return (
            <div
              key={signal.id}
              style={{ borderBottom:`1px solid #1A2A3A`, padding:"4px 10px", cursor:"pointer" }}
              onClick={() => setExpanded(isExp ? null : signal.id)}
            >
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{
                  fontSize:     7,
                  padding:      "0 4px",
                  border:       `1px solid ${col}55`,
                  color:        col,
                  borderRadius: 2,
                  minWidth:     60,
                  textAlign:    "center",
                  flexShrink:   0,
                }}>
                  {classification.replace("_", " ")}
                </span>
                <span style={{ color: sevColour(signal.severity), fontSize:7, flexShrink:0 }}>{signal.severity}</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:9 }}>
                  {signal.name}
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop:6, paddingLeft:4 }}>
                  {/* KB articles */}
                  {matchedArticles.length > 0 && (
                    <>
                      <div style={{ color: CY, fontSize:8, marginBottom:3 }}>KB ARTICLES ({matchedArticles.length})</div>
                      {matchedArticles.map(a => (
                        <div key={a.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            {a.topic && (
                              <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${CY}44`, color: CY, borderRadius:2 }}>
                                {a.topic}
                              </span>
                            )}
                            <span style={{ fontSize:8, color:"#90B8D0" }}>{a.title}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, a.score * 10)}%`, height:"100%", background: CY, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {/* ops events */}
                  {matchedEvents.length > 0 && (
                    <>
                      <div style={{ color:"#9D6FFF", fontSize:8, marginBottom:3, marginTop:matchedArticles.length > 0 ? 6 : 0 }}>
                        OPS EVENTS ({matchedEvents.length})
                      </div>
                      {matchedEvents.map(e => (
                        <div key={e.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${sevColour(e.severity)}44`, color: sevColour(e.severity), borderRadius:2 }}>
                              {e.severity}
                            </span>
                            <span style={{ fontSize:8, color:"#90B8D0" }}>{e.name}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, e.score * 10)}%`, height:"100%", background:"#9D6FFF", borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {matchedArticles.length === 0 && matchedEvents.length === 0 && (
                    <div style={{ color: AMBER, fontSize:8 }}>No KB or ops coverage — signal is DARK.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ padding:"10px", color: MUTED, textAlign:"center" }}>no results</div>
        )}

        {/* footer */}
        <div style={{ padding:"4px 10px", borderTop:`1px solid ${AMBER}22`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color: MUTED, fontSize:8 }}>auto-refresh 90 s</span>
          <button
            onClick={load}
            disabled={loading}
            style={{ background:"transparent", border:`1px solid ${AMBER}33`, color: AMBER, padding:"1px 6px", borderRadius:3, cursor: loading ? "default":"pointer", fontSize:7, fontFamily: MONO }}
          >
            {loading ? "…" : "↻"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes rket-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
