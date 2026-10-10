/**
 * F287 — Alert × Dataset × Knowledge Intelligence Mesh (ADKIM)
 *
 * Parallel-fetches /v1/alerts + /v1/datasets + /knowledge/ every 90 s.
 * Keyword-correlates each active alert against the dataset catalog AND KB articles:
 *
 *  FULL_COVERAGE — matches both a dataset and a KB article
 *  DATA_ONLY     — matches a dataset only
 *  KB_ONLY       — matches a KB article only
 *  DARK          — no dataset or KB coverage (alert flying blind)
 *
 * Stat tiles: alerts / full / data-only / kb-only / dark
 * Amber badge on dark count.
 * Filter tabs: ALL / FULL_COVERAGE / DATA_ONLY / KB_ONLY / DARK + text search.
 * Expand alert → matched datasets + matched KB articles with relevance bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ ADKIM  at left:6960 bottom:18, zIndex:68.
 * Event:   jarvis:adkim-toggle
 * Voice:   "alert dataset knowledge / adkim / alert context / dark alerts /
 *           alert coverage / which alerts have data / alert knowledge gap /
 *           alert data coverage / alert knowledge coverage / alert intel mesh"
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

const BTN_LEFT   = 6960;
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

function normaliseAlerts(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:          String(a.id ?? a.alert_id ?? i),
    name:        a.title ?? a.name ?? a.message ?? `Alert ${i + 1}`,
    description: a.description ?? a.message ?? a.body ?? a.details ?? "",
    severity:    a.severity ?? a.level ?? a.priority ?? "INFO",
    category:    a.category ?? a.type ?? a.alert_type ?? "",
    source:      a.source ?? a.origin ?? a.service ?? "",
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d, i) => ({
    id:          String(d.id ?? d.dataset_id ?? i),
    name:        d.name ?? d.title ?? `Dataset ${i + 1}`,
    description: d.description ?? d.summary ?? d.body ?? "",
    category:    d.category ?? d.type ?? d.dataset_type ?? "",
    tags:        Array.isArray(d.tags) ? d.tags : [],
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

function tokens(str) {
  return String(str ?? "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(alertTokens, targetText) {
  const tgtTokens = tokens(targetText);
  let hits = 0;
  for (const t of alertTokens) {
    if (tgtTokens.some(tt => tt.includes(t) || t.includes(tt))) hits++;
  }
  return hits;
}

function correlate(alerts, datasets, articles) {
  return alerts.map(alert => {
    const aToks = tokens(
      `${alert.name} ${alert.description} ${alert.category} ${alert.source} ${alert.severity}`
    );

    const matchedDatasets = datasets
      .map(d => ({ ...d, score: scoreMatch(aToks, `${d.name} ${d.description} ${d.category} ${d.tags.join(" ")}`) }))
      .filter(d => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const matchedArticles = articles
      .map(a => ({ ...a, score: scoreMatch(aToks, `${a.title} ${a.content} ${a.topic} ${a.tags.join(" ")}`) }))
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasData = matchedDatasets.length > 0;
    const hasKB   = matchedArticles.length > 0;

    let classification;
    if (hasData && hasKB)       classification = "FULL_COVERAGE";
    else if (hasData)           classification = "DATA_ONLY";
    else if (hasKB)             classification = "KB_ONLY";
    else                        classification = "DARK";

    return { alert, matchedDatasets, matchedArticles, classification };
  });
}

function classColour(cls) {
  if (cls === "FULL_COVERAGE") return GREEN;
  if (cls === "DATA_ONLY")     return CY;
  if (cls === "KB_ONLY")       return "#9D6FFF";
  return AMBER;
}

function sevColour(sev) {
  const s = String(sev ?? "").toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return AMBER;
  if (s === "MEDIUM")   return "#F5D623";
  if (s === "WARNING")  return AMBER;
  if (s === "ERROR")    return RED;
  return MUTED;
}

const TABS = ["ALL", "FULL_COVERAGE", "DATA_ONLY", "KB_ONLY", "DARK"];

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isAdkimQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("adkim") ||
    s.includes("alert dataset knowledge") ||
    s.includes("alert context") ||
    s.includes("dark alerts") ||
    s.includes("alert data coverage") ||
    s.includes("alert knowledge gap") ||
    s.includes("alert knowledge coverage") ||
    s.includes("alert intel mesh") ||
    (s.includes("alert") && s.includes("dataset") && s.includes("knowledge")) ||
    (s.includes("alert") && s.includes("coverage") && s.includes("data"))
  );
}

export async function buildAdkimScript() {
  try {
    const base = apiBase();
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [aRaw, dRaw, kRaw] = await Promise.all([
      fetch(`${base}/v1/alerts?status=open&limit=100`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const alerts   = normaliseAlerts(aRaw);
    const datasets = normaliseDatasets(dRaw);
    const articles = normaliseArticles(kRaw);
    const results  = correlate(alerts, datasets, articles);
    const dark     = results.filter(r => r.classification === "DARK").length;
    const full     = results.filter(r => r.classification === "FULL_COVERAGE").length;
    return `JARVIS Alert × Dataset × Knowledge Intelligence Mesh: ${alerts.length} active alerts correlated against ${datasets.length} datasets and ${articles.length} KB articles. ${full} alerts have full coverage; ${dark} alerts are DARK with no dataset or knowledge backing.`;
  } catch {
    return "ADKIM: unable to fetch alert, dataset, or knowledge data at this time.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function AlertDatasetKnowledgeMesh() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [results,  setResults]  = useState([]);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief,    setBrief]    = useState("");
  const [assessing,setAssessing]= useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [aRaw, dRaw, kRaw] = await Promise.all([
        fetch(`${base}/v1/alerts?status=open&limit=100`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`, { headers: hdrs }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const alerts   = normaliseAlerts(aRaw);
      const datasets = normaliseDatasets(dRaw);
      const articles = normaliseArticles(kRaw);
      setResults(correlate(alerts, datasets, articles));
    } catch (e) {
      console.error("ADKIM load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => { if (!v) { load(); } return !v; });
    window.addEventListener("jarvis:adkim-toggle", handler);
    return () => window.removeEventListener("jarvis:adkim-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const base    = apiBase();
      const script  = await buildAdkimScript();
      const resp    = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this intelligence: ${script}` }),
      });
      const data = await resp.json();
      const text = data?.response ?? data?.message ?? data?.content ?? script;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, []);

  const total    = results.length;
  const full     = results.filter(r => r.classification === "FULL_COVERAGE").length;
  const dataOnly = results.filter(r => r.classification === "DATA_ONLY").length;
  const kbOnly   = results.filter(r => r.classification === "KB_ONLY").length;
  const dark     = results.filter(r => r.classification === "DARK").length;

  const datasets_count = results.length ? Math.max(...results.map(r => r.matchedDatasets.length + 1)) : 0;
  const articles_count = results.length ? Math.max(...results.map(r => r.matchedArticles.length + 1)) : 0;

  const filtered = results.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.alert.name.toLowerCase().includes(q) &&
          !r.alert.category.toLowerCase().includes(q) &&
          !r.alert.source.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <>
        {dark > 0 && (
          <div style={{
            position: "fixed",
            left: BTN_LEFT + 26,
            bottom: 28,
            zIndex: 69,
            background: AMBER,
            color: "#000",
            borderRadius: "50%",
            width: 14,
            height: 14,
            fontSize: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontFamily: MONO,
            animation: "adkim-pulse 2s ease-in-out infinite",
            pointerEvents: "none",
          }}>
            {dark > 9 ? "9+" : dark}
          </div>
        )}
        <button
          onClick={() => { setOpen(true); load(); }}
          title="Alert × Dataset × Knowledge Intelligence Mesh (ADKIM)"
          style={{
            position:    "fixed",
            left:        BTN_LEFT,
            bottom:      18,
            zIndex:      68,
            background:  "rgba(5,8,13,0.82)",
            border:      `1px solid ${AMBER}55`,
            color:       AMBER,
            padding:     "3px 7px",
            borderRadius: 4,
            cursor:      "pointer",
            fontSize:    9,
            fontFamily:  MONO,
            letterSpacing: 0.5,
            backdropFilter: "blur(4px)",
          }}
        >
          ◈ ADKIM
        </button>
        <style>{`@keyframes adkim-pulse{0%,100%{opacity:0.9}50%{opacity:0.3}}`}</style>
      </>
    );
  }

  return (
    <>
      <div style={{
        position:      "fixed",
        left:          BTN_LEFT - 280,
        bottom:        50,
        zIndex:        500,
        width:         420,
        maxHeight:     520,
        overflowY:     "auto",
        background:    "rgba(4,8,14,0.96)",
        border:        `1px solid ${AMBER}66`,
        borderRadius: 6,
        fontFamily:   MONO,
        fontSize:     10,
        color:        "#C8E0F0",
      }}>
        {/* header */}
        <div style={{ display:"flex", alignItems:"center", padding:"6px 10px", borderBottom:`1px solid ${AMBER}33`, gap:6 }}>
          <span style={{ color: AMBER, fontWeight: 700, fontSize: 11 }}>◈ ALERT × DATASET × KB MESH</span>
          <span style={{ color: MUTED, fontSize: 9, marginLeft: "auto" }}>{total} alerts</span>
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
            { label:"ALERTS",   val: total,    col: CY    },
            { label:"FULL",     val: full,     col: GREEN },
            { label:"DATA",     val: dataOnly, col: CY    },
            { label:"KB ONLY",  val: kbOnly,   col: "#9D6FFF" },
            { label:"DARK",     val: dark,     col: AMBER },
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
            placeholder="search alerts…"
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
        {filtered.map(({ alert, matchedDatasets, matchedArticles, classification }) => {
          const isExp = expanded === alert.id;
          const col   = classColour(classification);
          return (
            <div
              key={alert.id}
              style={{ borderBottom:`1px solid #1A2A3A`, padding:"4px 10px", cursor:"pointer" }}
              onClick={() => setExpanded(isExp ? null : alert.id)}
            >
              <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{
                  fontSize:     7,
                  padding:      "0 4px",
                  border:       `1px solid ${col}55`,
                  color:        col,
                  borderRadius: 2,
                  minWidth:     62,
                  textAlign:    "center",
                  flexShrink:   0,
                }}>
                  {classification.replace(/_/g, " ")}
                </span>
                <span style={{ color: sevColour(alert.severity), fontSize:7, flexShrink:0 }}>{alert.severity}</span>
                <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:9 }}>
                  {alert.name}
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop:6, paddingLeft:4 }}>
                  {/* datasets */}
                  {matchedDatasets.length > 0 && (
                    <>
                      <div style={{ color: CY, fontSize:8, marginBottom:3 }}>DATASETS ({matchedDatasets.length})</div>
                      {matchedDatasets.map(d => (
                        <div key={d.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            {d.category && (
                              <span style={{ fontSize:7, padding:"0 3px", border:`1px solid ${CY}44`, color: CY, borderRadius:2 }}>
                                {d.category}
                              </span>
                            )}
                            <span style={{ fontSize:8, color:"#90B8D0" }}>{d.name}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, d.score * 10)}%`, height:"100%", background: CY, borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {/* KB articles */}
                  {matchedArticles.length > 0 && (
                    <>
                      <div style={{ color:"#9D6FFF", fontSize:8, marginBottom:3, marginTop: matchedDatasets.length > 0 ? 6 : 0 }}>
                        KB ARTICLES ({matchedArticles.length})
                      </div>
                      {matchedArticles.map(a => (
                        <div key={a.id} style={{ marginBottom:4 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                            {a.topic && (
                              <span style={{ fontSize:7, padding:"0 3px", border:`1px solid #9D6FFF44`, color:"#9D6FFF", borderRadius:2 }}>
                                {a.topic}
                              </span>
                            )}
                            <span style={{ fontSize:8, color:"#90B8D0" }}>{a.title}</span>
                          </div>
                          <div style={{ height:3, background:"#1A2A3A", borderRadius:2, marginTop:2 }}>
                            <div style={{ width:`${Math.min(100, a.score * 10)}%`, height:"100%", background:"#9D6FFF", borderRadius:2 }} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {matchedDatasets.length === 0 && matchedArticles.length === 0 && (
                    <div style={{ color: AMBER, fontSize:8 }}>No dataset or KB coverage — alert is DARK.</div>
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
        @keyframes adkim-pulse {
          0%, 100% { opacity: 0.8; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </>
  );
}
