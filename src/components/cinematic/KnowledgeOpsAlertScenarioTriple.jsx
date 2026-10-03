import { useState, useEffect, useCallback } from "react";

const BTN_LEFT = 903820;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KAOSTRI_RE = /\b(kaostri|knowledge alert scenario|knowledge ops scenario|kno alert scen|alert scenario knowledge|scenario knowledge alert|kno ops scenario triple|knowledge scenario triple|dark knowledge|knowledge coverage triple|ops alert scenario triple)\b/i;
export function isKaostriQuery(t) { return KAOSTRI_RE.test(t || ""); }

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function words(s) {
  return String(s || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
}

function score(article, alerts, scenarios) {
  const kw = [
    ...(article.title ? words(article.title) : []),
    ...(article.content ? words(article.content) : []),
    ...(article.tags   ? words(JSON.stringify(article.tags)) : []),
    ...(article.kind   ? words(article.kind) : []),
    ...(article.summary ? words(article.summary) : []),
  ];
  const alertHits = alerts.filter(a => {
    const af = [
      words(a.message), words(a.name), words(a.type),
      words(a.source), words(a.description),
    ].flat();
    return kw.some(k => af.includes(k));
  });
  const scenHits = scenarios.filter(s => {
    const sf = [
      words(s.name), words(s.description), words(s.type),
      words(s.category), words(s.tags),
    ].flat();
    return kw.some(k => sf.includes(k));
  });
  return { alertHits, scenHits };
}

function classify(alertHits, scenHits) {
  const ha = alertHits.length > 0;
  const hs = scenHits.length > 0;
  if (ha && hs) return "FULLY_COVERED";
  if (ha)       return "ALERT_ONLY";
  if (hs)       return "SCENARIO_ONLY";
  return "DARK";
}

export async function buildKaostriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [kno, alr, scn] = await Promise.all([
      fetch(`${base}/knowledge/articles`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/ops/alerts`,       { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/scenario/list`,    { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const articles  = Array.isArray(kno) ? kno : (kno?.items || kno?.articles || kno?.data || []);
    const alerts    = Array.isArray(alr) ? alr : (alr?.items || alr?.alerts   || alr?.data || []);
    const scenarios = Array.isArray(scn) ? scn : (scn?.items || scn?.scenarios || scn?.data || []);
    let fully = 0, alertOnly = 0, scenOnly = 0, dark = 0;
    articles.forEach(a => {
      const { alertHits, scenHits } = score(a, alerts, scenarios);
      const c = classify(alertHits, scenHits);
      if (c === "FULLY_COVERED")   fully++;
      else if (c === "ALERT_ONLY") alertOnly++;
      else if (c === "SCENARIO_ONLY") scenOnly++;
      else dark++;
    });
    const pct = articles.length ? Math.round((fully / articles.length) * 100) : 0;
    return `KAOSTRI: ${articles.length} knowledge articles × ${alerts.length} ops alerts × ${scenarios.length} scenarios. FULLY COVERED: ${fully} | ALERT ONLY: ${alertOnly} | SCENARIO ONLY: ${scenOnly} | DARK: ${dark} | COVERAGE: ${pct}%.`;
  } catch (e) {
    return `KAOSTRI error: ${e.message}`;
  }
}

const TILE = { minWidth: 90, background: "rgba(0,255,200,0.07)", border: "1px solid rgba(0,255,200,0.18)", borderRadius: 6, padding: "8px 14px", textAlign: "center" };
const LBL  = { fontSize: 10, color: "#7fffd4", letterSpacing: 1, textTransform: "uppercase" };
const VAL  = { fontSize: 22, fontWeight: 700, color: "#00ffc8" };

const CLASS_COLOR = { FULLY_COVERED: "#00ffc8", ALERT_ONLY: "#f0c040", SCENARIO_ONLY: "#7fb3ff", DARK: "#ff4060" };
const TABS = ["ALL", "FULLY_COVERED", "ALERT_ONLY", "SCENARIO_ONLY", "DARK"];

export default function KnowledgeOpsAlertScenarioTriple() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [alertsLen, setALen]  = useState(0);
  const [scenLen, setSLen]    = useState(0);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [loading, setLoading] = useState(false);
  const [ts, setTs]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [kno, alr, scn] = await Promise.all([
        fetch(`${base}/knowledge/articles`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/ops/alerts`,       { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`,    { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const articles  = Array.isArray(kno) ? kno : (kno?.items || kno?.articles || kno?.data || []);
      const alerts    = Array.isArray(alr) ? alr : (alr?.items || alr?.alerts   || alr?.data || []);
      const scenarios = Array.isArray(scn) ? scn : (scn?.items || scn?.scenarios || scn?.data || []);
      setALen(alerts.length);
      setSLen(scenarios.length);
      const enriched = articles.map(a => {
        const { alertHits, scenHits } = score(a, alerts, scenarios);
        return { ...a, alertHits, scenHits, status: classify(alertHits, scenHits) };
      });
      setRows(enriched);
      setTs(new Date().toLocaleTimeString());
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = e => { if (e.detail?.open !== undefined) setOpen(e.detail.open); else setOpen(p => !p); };
    window.addEventListener("jarvis:kaostri-toggle", handler);
    return () => window.removeEventListener("jarvis:kaostri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const fully    = rows.filter(r => r.status === "FULLY_COVERED").length;
  const alertOnly = rows.filter(r => r.status === "ALERT_ONLY").length;
  const scenOnly  = rows.filter(r => r.status === "SCENARIO_ONLY").length;
  const dark      = rows.filter(r => r.status === "DARK").length;
  const pct       = rows.length ? Math.round((fully / rows.length) * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (r.title || r.name || "").toLowerCase().includes(q) || (r.kind || "").toLowerCase().includes(q);
  });

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const summary = await buildKaostriScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `${summary} Provide a 2-sentence operational assessment of knowledge coverage gaps and recommended prioritisation.` }),
      });
      const j = await res.json();
      const txt = j?.response || j?.message || j?.text || summary;
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch (e) {
      setAssessment(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 593, background: "rgba(0,40,30,0.92)", border: "1px solid #00ffc8", borderRadius: 6, color: "#00ffc8", fontSize: 11, padding: "4px 9px", cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}
        title="Knowledge × Ops Alerts × Scenario Triple (KAOSTRI)"
      >◈ KAOSTRI</button>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9600, background: "rgba(0,0,0,0.82)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "min(96vw,1060px)", maxHeight: "88vh", background: "linear-gradient(135deg,#030f0a 0%,#041a10 100%)", border: "1px solid #00ffc8", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 0 48px rgba(0,255,200,0.15)" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderBottom: "1px solid rgba(0,255,200,0.15)" }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#00ffc8", letterSpacing: 2 }}>◈ KAOSTRI</span>
            <span style={{ fontSize: 11, color: "#7fffd4", marginLeft: 12 }}>Knowledge × Ops Alerts × Scenario Triple</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {ts && <span style={{ fontSize: 10, color: "#4a8" }}>{loading ? "refreshing…" : `updated ${ts}`}</span>}
            <button onClick={load} disabled={loading} style={{ background: "rgba(0,255,200,0.08)", border: "1px solid #00ffc8", borderRadius: 4, color: "#00ffc8", fontSize: 11, padding: "3px 9px", cursor: "pointer" }}>↺</button>
            <button onClick={() => setOpen(false)} style={{ background: "rgba(255,60,60,0.12)", border: "1px solid #ff4060", borderRadius: 4, color: "#ff4060", fontSize: 13, padding: "2px 8px", cursor: "pointer" }}>✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 10, padding: "14px 20px", flexWrap: "wrap" }}>
          {[
            { label: "ARTICLES",      value: rows.length,  color: "#00ffc8" },
            { label: "FULLY COVERED", value: fully,        color: "#00ffc8" },
            { label: "ALERT ONLY",    value: alertOnly,    color: "#f0c040" },
            { label: "SCENARIO ONLY", value: scenOnly,     color: "#7fb3ff" },
            { label: "DARK",          value: dark,         color: dark > 0 ? "#ff4060" : "#7fffd4" },
            { label: "COVERAGE %",    value: `${pct}%`,    color: pct >= 70 ? "#00ffc8" : pct >= 40 ? "#f0c040" : "#ff4060" },
          ].map(t => (
            <div key={t.label} style={TILE}>
              <div style={LBL}>{t.label}</div>
              <div style={{ ...VAL, color: t.color }}>{t.value}</div>
            </div>
          ))}
          <div style={{ ...TILE, minWidth: 100 }}>
            <div style={LBL}>OPS ALERTS</div>
            <div style={{ ...VAL, color: "#f0c040" }}>{alertsLen}</div>
          </div>
          <div style={{ ...TILE, minWidth: 100 }}>
            <div style={LBL}>SCENARIOS</div>
            <div style={{ ...VAL, color: "#7fb3ff" }}>{scenLen}</div>
          </div>
        </div>

        {/* Filter + search */}
        <div style={{ display: "flex", gap: 8, padding: "0 20px 12px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: tab === t ? "rgba(0,255,200,0.18)" : "transparent", border: `1px solid ${tab === t ? "#00ffc8" : "rgba(0,255,200,0.2)"}`, borderRadius: 4, color: tab === t ? "#00ffc8" : "#7fffd4", fontSize: 11, padding: "3px 10px", cursor: "pointer" }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="search…"
            style={{ marginLeft: "auto", background: "rgba(0,255,200,0.06)", border: "1px solid rgba(0,255,200,0.2)", borderRadius: 4, color: "#d0fff0", fontSize: 12, padding: "4px 10px", outline: "none", width: 180 }} />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 12px" }}>
          {visible.length === 0 && (
            <div style={{ color: "#4a8", fontSize: 13, textAlign: "center", paddingTop: 30 }}>{loading ? "Loading…" : "No articles match."}</div>
          )}
          {visible.map((r, i) => {
            const id = r.id || r._id || i;
            const isExp = expanded === id;
            const col = CLASS_COLOR[r.status] || "#7fffd4";
            return (
              <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,200,0.04)", border: `1px solid rgba(0,255,200,0.1)`, borderRadius: 6, overflow: "hidden" }}>
                <div onClick={() => setExpanded(isExp ? null : id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: col, border: `1px solid ${col}`, borderRadius: 3, padding: "1px 6px", minWidth: 110, textAlign: "center" }}>{r.status.replace(/_/g, " ")}</span>
                  <span style={{ flex: 1, color: "#d0fff0", fontSize: 13 }}>{r.title || r.name || `Article ${id}`}</span>
                  <span style={{ fontSize: 10, color: "#4a8" }}>{r.kind || r.type || ""}</span>
                  {r.alertHits.length > 0 && <span style={{ fontSize: 10, color: "#f0c040", border: "1px solid #f0c040", borderRadius: 3, padding: "1px 5px" }}>{r.alertHits.length} alerts</span>}
                  {r.scenHits.length  > 0 && <span style={{ fontSize: 10, color: "#7fb3ff", border: "1px solid #7fb3ff", borderRadius: 3, padding: "1px 5px" }}>{r.scenHits.length} scenarios</span>}
                  <span style={{ color: "#4a8", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                </div>
                {isExp && (
                  <div style={{ padding: "6px 14px 12px", borderTop: "1px solid rgba(0,255,200,0.08)" }}>
                    {r.summary && <div style={{ fontSize: 12, color: "#a0e0c0", marginBottom: 8 }}>{r.summary}</div>}
                    {r.alertHits.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#f0c040", marginBottom: 4, letterSpacing: 1 }}>MATCHED OPS ALERTS</div>
                        {r.alertHits.slice(0, 5).map((a, ai) => (
                          <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: "#f0c040", border: "1px solid #f0c040", borderRadius: 3, padding: "1px 5px" }}>{a.type || a.severity || "ALERT"}</span>
                            <span style={{ fontSize: 12, color: "#d0c090" }}>{a.message || a.name || a.description || "Alert"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.scenHits.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: "#7fb3ff", marginBottom: 4, letterSpacing: 1 }}>MATCHED SCENARIOS</div>
                        {r.scenHits.slice(0, 5).map((s, si) => (
                          <div key={si} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: "#7fb3ff", border: "1px solid #7fb3ff", borderRadius: 3, padding: "1px 5px" }}>{s.category || s.type || "SCENARIO"}</span>
                            <span style={{ fontSize: 12, color: "#a0b0d0" }}>{s.name || s.description || "Scenario"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {r.alertHits.length === 0 && r.scenHits.length === 0 && (
                      <div style={{ fontSize: 12, color: "#ff4060" }}>No matching ops alerts or scenarios found for this article.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ASSESS footer */}
        <div style={{ padding: "10px 20px 14px", borderTop: "1px solid rgba(0,255,200,0.12)", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{ alignSelf: "flex-start", background: "rgba(0,255,200,0.12)", border: "1px solid #00ffc8", borderRadius: 6, color: "#00ffc8", fontSize: 13, padding: "6px 18px", cursor: assessing ? "wait" : "pointer" }}>
            {assessing ? "Assessing…" : "▶ ASSESS"}
          </button>
          {assessment && <div style={{ fontSize: 12, color: "#a0e0c0", lineHeight: 1.5 }}>{assessment}</div>}
        </div>

      </div>
    </div>
  );
}
