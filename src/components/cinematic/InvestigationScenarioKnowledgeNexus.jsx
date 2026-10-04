/**
 * InvestigationScenarioKnowledgeNexus — F242.
 *
 * Parallel-fetches /v1/investigations × /v1/scenario/list × /knowledge/
 * and keyword-correlates each investigation against available scenarios AND
 * KB articles to classify:
 *
 *   FULLY_COVERED  — investigation has ≥1 matching scenario AND ≥1 KB article
 *   SCENARIO_ONLY  — scenario exists but no KB article backing
 *   KB_ONLY        — KB article exists but no scenario coverage
 *   UNCOVERED      — neither scenario nor KB article (investigation intelligence gap)
 *
 * Stat tiles: INVESTIGATIONS / SCENARIOS / KB ARTICLES / UNCOVERED
 * Amber badge: UNCOVERED count on toggle button.
 * Filter tabs: ALL | FULLY_COVERED | SCENARIO_ONLY | KB_ONLY | UNCOVERED + text search.
 * Expand investigation → matched scenario cards (cyan) + KB article cards (green) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intelligence response nexus brief + TTS.
 *
 * Toggle:  ◈ ISKRNEX at left:1092240, bottom:8, zIndex:666.
 * Event:   jarvis:iskrnex-toggle
 * Voice:   "iskrnex" / "investigation scenario" / "case scenario" / "investigation knowledge" /
 *          "uncovered investigations" / "scenario case" / "intelligence response nexus"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const GN  = "#4CAF50";
const AM  = "#FFB300";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1092240;
const Z_IDX      = 666;

const ISKRNEX_RE =
  /\b(iskrnex|investigation[._\-\s]scenario|case[._\-\s]scenario|investigation[._\-\s]knowledge|uncovered[._\-\s]investigations?|scenario[._\-\s]case|intelligence[._\-\s]response[._\-\s]nexus)\b/i;

export function isIskrnexQuery(t) {
  return ISKRNEX_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normInvestigations(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.investigations || raw.cases || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((v, i) => ({
    id:     v.id || String(i),
    name:   v.name || v.title || v.case_name || v.summary || `Investigation ${i + 1}`,
    desc:   v.description || v.detail || v.summary || "",
    status: v.status || v.state || "",
    type:   v.type || v.category || "",
  }));
}

function normScenarios(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.scenarios || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:   s.id || String(i),
    name: s.name || s.title || s.scenario || `Scenario ${i + 1}`,
    desc: s.description || s.summary || s.detail || "",
    type: s.type || s.category || "",
  }));
}

function normArticles(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.articles || raw.knowledge || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((a, i) => ({
    id:       a.id || String(i),
    name:     a.title || a.name || a.heading || `Article ${i + 1}`,
    desc:     a.content || a.summary || a.description || a.body || "",
    category: a.category || a.type || a.tag || "",
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(inv, other) {
  const iWords = new Set(tokens(`${inv.name} ${inv.desc} ${inv.type}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || other.category || ""}`);
  const hits = oWords.filter(w => iWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(investigations, scenarios, articles) {
  return investigations.map(inv => {
    const matchedScenarios = scenarios
      .map(s => ({ ...s, score: relevanceScore(inv, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedArticles = articles
      .map(a => ({ ...a, score: relevanceScore(inv, a) }))
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score);

    let coverage;
    if (matchedScenarios.length > 0 && matchedArticles.length > 0) {
      coverage = "FULLY_COVERED";
    } else if (matchedScenarios.length > 0) {
      coverage = "SCENARIO_ONLY";
    } else if (matchedArticles.length > 0) {
      coverage = "KB_ONLY";
    } else {
      coverage = "UNCOVERED";
    }

    return { ...inv, coverage, matchedScenarios, matchedArticles };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildIskrnexScript() {
  const base = apiBase();
  const [iRaw, sRaw, kRaw] = await Promise.all([
    fetch(`${base}/investigations`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/scenario/list`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/knowledge/`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const invs      = normInvestigations(iRaw);
  const scenarios = normScenarios(sRaw);
  const articles  = normArticles(kRaw);
  const rows      = classify(invs, scenarios, articles);
  const uncovered = rows.filter(r => r.coverage === "UNCOVERED").length;
  const covered   = rows.filter(r => r.coverage === "FULLY_COVERED").length;
  return `Intelligence Response Nexus online, sir. Of ${invs.length} active investigations cross-referenced against ${scenarios.length} scenarios and ${articles.length} knowledge articles, ${covered} are fully supported — but ${uncovered} investigations have neither scenario nor knowledge backing, representing critical response intelligence gaps requiring immediate attention.`;
}

// ── status colour ─────────────────────────────────────────────────────────────

function statusColour(s) {
  if (s === "FULLY_COVERED")  return GN;
  if (s === "SCENARIO_ONLY")  return CY;
  if (s === "KB_ONLY")        return "#9C27B0";
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function InvestigationScenarioKnowledgeNexus() {
  const [open,         setOpen]         = useState(false);
  const [rows,         setRows]         = useState([]);
  const [invCount,     setInvCount]     = useState(0);
  const [scenCount,    setScenCount]    = useState(0);
  const [kbCount,      setKbCount]      = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState(null);
  const [filter,       setFilter]       = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [expanded,     setExpanded]     = useState(null);
  const [assessing,    setAssessing]    = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [iRaw, sRaw, kRaw] = await Promise.all([
        fetch(`${base}/investigations`,  { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/scenario/list`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/knowledge/`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const invs      = normInvestigations(iRaw);
      const scenarios = normScenarios(sRaw);
      const articles  = normArticles(kRaw);
      setInvCount(invs.length);
      setScenCount(scenarios.length);
      setKbCount(articles.length);
      setRows(classify(invs, scenarios, articles));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:iskrnex-toggle", toggle);
    return () => window.removeEventListener("jarvis:iskrnex-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const uncovered = rows.filter(r => r.coverage === "UNCOVERED").length;

  const FILTERS = ["ALL", "FULLY_COVERED", "SCENARIO_ONLY", "KB_ONLY", "UNCOVERED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.coverage === filter)
    .filter(r => !search || `${r.name} ${r.desc}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildIskrnexScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      const r = await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play();
      }
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: uncovered > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${uncovered > 0 ? AM : CY}44`,
    color: uncovered > 0 ? AM : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 580, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ ISKRNEX
        {uncovered > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
            animation: "iskrnex-pulse 1.4s infinite",
          }}>{uncovered}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, letterSpacing: 2, fontSize: 10 }}>
              ◈ INVESTIGATION × SCENARIO × KNOWLEDGE NEXUS
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              ["INVESTIGATIONS", invCount,   CY],
              ["SCENARIOS",      scenCount,  "#00E5A0"],
              ["KB ARTICLES",    kbCount,    GN],
              ["UNCOVERED",      uncovered,  AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${col}22`, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${statusColour(f === "ALL" ? "FULLY_COVERED" : f)}22` : "transparent",
                  border: `1px solid ${filter === f ? statusColour(f === "ALL" ? "FULLY_COVERED" : f) : "rgba(255,255,255,0.12)"}`,
                  color: filter === f ? statusColour(f === "ALL" ? "FULLY_COVERED" : f) : "rgba(255,255,255,0.5)",
                  fontFamily: MN, fontSize: 8, padding: "3px 7px", borderRadius: 3, cursor: "pointer",
                  letterSpacing: 1,
                }}>
                {f.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search investigations…"
              style={{
                marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 130,
              }}
            />
          </div>

          {/* rows */}
          {loading && <div style={{ color: CY, fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>◌ LOADING…</div>}
          {err && <div style={{ color: RD, fontSize: 9, padding: "8px 0" }}>⚠ {err}</div>}
          {!loading && visible.map(row => {
            const hasDetail = row.matchedScenarios.length > 0 || row.matchedArticles.length > 0;
            const col = statusColour(row.coverage);
            return (
              <div key={row.id} style={{
                background: DIM, borderRadius: 4,
                border: `1px solid ${col}33`,
                marginBottom: 4, padding: "7px 10px",
                cursor: hasDetail ? "pointer" : "default",
              }} onClick={() => hasDetail && setExpanded(expanded === row.id ? null : row.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    color: col, fontSize: 7, letterSpacing: 1,
                    border: `1px solid ${col}44`, padding: "1px 4px", borderRadius: 2,
                    minWidth: 80, textAlign: "center",
                  }}>{row.coverage.replace(/_/g, " ")}</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", flex: 1, fontSize: 10 }}>{row.name}</span>
                  {row.status && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>{row.status}</span>}
                  {hasDetail && (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                      {expanded === row.id ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* expanded matches */}
                {expanded === row.id && (
                  <div style={{ marginTop: 6, marginLeft: 88 }}>
                    {/* scenario matches */}
                    {row.matchedScenarios.map(s => (
                      <div key={s.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(0,229,255,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${CY}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: CY, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${CY}44`, padding: "1px 4px", borderRadius: 2,
                          }}>SCENARIO</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{s.name}</span>
                          {s.type && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{s.type}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(s.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${CY}88 ${Math.round(s.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                    {/* KB article matches */}
                    {row.matchedArticles.map(a => (
                      <div key={a.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(76,175,80,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${GN}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: GN, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${GN}44`, padding: "1px 4px", borderRadius: 2,
                          }}>KB</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{a.name}</span>
                          {a.category && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{a.category}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(a.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${GN}88 ${Math.round(a.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: `${AM}18`,
              border: `1px solid ${AM}44`, color: AM, fontFamily: MN, fontSize: 9,
              letterSpacing: 1.5, padding: "6px 0", borderRadius: 3, cursor: "pointer",
            }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS INTELLIGENCE RESPONSE NEXUS"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes iskrnex-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
