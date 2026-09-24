/**
 * F75 — Knowledge × Ops Event × Risk Triple Coverage (KORSTRI)
 * Endpoints: /knowledge/ × /v1/ops/events × /entities/RiskSignal
 * Classification: FULLY_GROUNDED | OPS_BACKED | RISK_FLAGGED | ISOLATED
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 985_480;
const POLL_MS = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const KORSTRI_RE =
  /\b(korstri|knowledge\s*ops?\s*risk|knowledge\s*ops?\s*triple|knowledge\s*triple|grounded\s*knowledge|isolated\s*knowledge|knowledge\s*risk\s*ops?|knowledge\s*event\s*risk|knowledge\s*risk\s*event|ops?\s*risk\s*knowledge|risk\s*knowledge\s*coverage|knowledge\s*triple\s*coverage|kors\s*tri)\b/i;

export function isKorstriQuery(t) {
  return KORSTRI_RE.test(t || "");
}

function normaliseArticle(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.article_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.subject || "Untitled Article",
    content: raw.content || raw.body || raw.summary || raw.description || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    created_at: raw.created_at || raw.date || raw.published_at || "",
    extra: raw,
  };
}

function normaliseOpsEvent(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.event_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.event_type || raw.type || "Untitled Event",
    description: raw.description || raw.details || raw.summary || "",
    severity: raw.severity || raw.level || raw.priority || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseRiskSignal(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.signal_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.label || "Untitled Signal",
    description: raw.description || raw.details || raw.summary || "",
    severity: (raw.severity || raw.level || "medium").toLowerCase(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function keywords(obj) {
  const txt = JSON.stringify(obj || "").toLowerCase();
  return txt.match(/[a-z]{4,}/g) || [];
}

function scoreMatch(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

const CLASS_META = {
  FULLY_GROUNDED: { label: "FULLY GROUNDED", color: "#00ff88", desc: "backed by ops event + risk signal" },
  OPS_BACKED:     { label: "OPS BACKED",     color: "#00bfff", desc: "ops event match only" },
  RISK_FLAGGED:   { label: "RISK FLAGGED",   color: "#ff6b6b", desc: "risk signal match only" },
  ISOLATED:       { label: "ISOLATED",       color: "#ffaa00", desc: "no ops or risk coverage" },
};

const SEV_COLOR = { critical: "#ff3333", high: "#ff6b6b", medium: "#ffaa00", low: "#88bbcc" };

async function fetchAll() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const [knRes, opsRes, rskRes] = await Promise.allSettled([
    fetch(`${base}/knowledge/`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/ops/events`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers }).then((r) => r.json()),
  ]);

  const rawArticles  = knRes.status  === "fulfilled" ? (knRes.value.items  || knRes.value.articles  || knRes.value.results  || knRes.value  || []) : [];
  const rawOps       = opsRes.status === "fulfilled" ? (opsRes.value.items || opsRes.value.events   || opsRes.value.results  || opsRes.value || []) : [];
  const rawRisk      = rskRes.status === "fulfilled" ? (rskRes.value.items || rskRes.value.signals  || rskRes.value.results  || rskRes.value || []) : [];

  const articles = (Array.isArray(rawArticles) ? rawArticles : []).map(normaliseArticle).filter(Boolean);
  const opsEvents = (Array.isArray(rawOps) ? rawOps : []).map(normaliseOpsEvent).filter(Boolean);
  const riskSignals = (Array.isArray(rawRisk) ? rawRisk : []).map(normaliseRiskSignal).filter(Boolean);

  return { articles, opsEvents, riskSignals };
}

function buildTriple(articles, opsEvents, riskSignals) {
  const opsKws  = opsEvents.map((e) => keywords({ title: e.title, desc: e.description, tags: e.tags }));
  const riskKws = riskSignals.map((s) => keywords({ title: s.title, desc: s.description, tags: s.tags }));

  return articles.map((art) => {
    const artKw = keywords({ title: art.title, content: art.content, tags: art.tags });

    const matchedOps = opsEvents
      .map((e, i) => ({ ...e, score: scoreMatch(artKw, opsKws[i]) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedRisk = riskSignals
      .map((s, i) => ({ ...s, score: scoreMatch(artKw, riskKws[i]) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const hasOps  = matchedOps.length > 0;
    const hasRisk = matchedRisk.length > 0;

    const cls =
      hasOps && hasRisk ? "FULLY_GROUNDED"
      : hasOps           ? "OPS_BACKED"
      : hasRisk          ? "RISK_FLAGGED"
      :                    "ISOLATED";

    return { art, matchedOps, matchedRisk, cls };
  });
}

export async function buildKorstriScript() {
  try {
    const { articles, opsEvents, riskSignals } = await fetchAll();
    const rows = buildTriple(articles, opsEvents, riskSignals);
    const counts = {
      FULLY_GROUNDED: rows.filter((r) => r.cls === "FULLY_GROUNDED").length,
      OPS_BACKED:     rows.filter((r) => r.cls === "OPS_BACKED").length,
      RISK_FLAGGED:   rows.filter((r) => r.cls === "RISK_FLAGGED").length,
      ISOLATED:       rows.filter((r) => r.cls === "ISOLATED").length,
    };
    const coverage = articles.length
      ? Math.round(((articles.length - counts.ISOLATED) / articles.length) * 100)
      : 0;
    return (
      `Knowledge Ops Risk Triple Coverage: ${articles.length} knowledge articles cross-referenced against ` +
      `${opsEvents.length} operational events and ${riskSignals.length} risk signals. ` +
      `Fully grounded: ${counts.FULLY_GROUNDED}. ` +
      `Ops backed: ${counts.OPS_BACKED}. ` +
      `Risk flagged: ${counts.RISK_FLAGGED}. ` +
      `Isolated (no coverage): ${counts.ISOLATED}. ` +
      `Overall knowledge coverage: ${coverage}%.`
    );
  } catch (e) {
    return `Knowledge Ops Risk Triple unavailable: ${e.message}`;
  }
}

const CY = "#00e5ff";
const TABS = ["ALL", "FULLY_GROUNDED", "OPS_BACKED", "RISK_FLAGGED", "ISOLATED"];

export default function KnowledgeOpsRiskTriple() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [articles, setArticles] = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [riskSignals, setRiskSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief] = useState("");
  const timerRef = useRef(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const { articles: arts, opsEvents: ops, riskSignals: risks } = await fetchAll();
      setArticles(arts); setOpsEvents(ops); setRiskSignals(risks);
      setRows(buildTriple(arts, ops, risks));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:korstri-toggle", handler);
    return () => window.removeEventListener("jarvis:korstri-toggle", handler);
  }, []);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const counts = {
        FULLY_GROUNDED: rows.filter((r) => r.cls === "FULLY_GROUNDED").length,
        OPS_BACKED:     rows.filter((r) => r.cls === "OPS_BACKED").length,
        RISK_FLAGGED:   rows.filter((r) => r.cls === "RISK_FLAGGED").length,
        ISOLATED:       rows.filter((r) => r.cls === "ISOLATED").length,
      };
      const coverage = articles.length
        ? Math.round(((articles.length - counts.ISOLATED) / articles.length) * 100)
        : 0;
      const prompt =
        `Knowledge Ops Risk Triple Coverage snapshot: ${articles.length} KB articles, ` +
        `${opsEvents.length} ops events, ${riskSignals.length} risk signals. ` +
        `Fully grounded: ${counts.FULLY_GROUNDED}. Ops backed: ${counts.OPS_BACKED}. ` +
        `Risk flagged: ${counts.RISK_FLAGGED}. Isolated: ${counts.ISOLATED}. Coverage: ${coverage}%. ` +
        `Provide a 2-sentence knowledge coverage assessment focusing on the isolated articles and ` +
        `what operational or risk gaps they reveal.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      });
    } catch (e) {
      setBrief(`Assessment error: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_GROUNDED: rows.filter((r) => r.cls === "FULLY_GROUNDED").length,
    OPS_BACKED:     rows.filter((r) => r.cls === "OPS_BACKED").length,
    RISK_FLAGGED:   rows.filter((r) => r.cls === "RISK_FLAGGED").length,
    ISOLATED:       rows.filter((r) => r.cls === "ISOLATED").length,
  };
  const coverage = rows.length
    ? Math.round(((rows.length - counts.ISOLATED) / rows.length) * 100)
    : 0;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.art.title.toLowerCase().includes(q) ||
        r.art.content.toLowerCase().includes(q) ||
        r.art.tags.join(" ").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const panelStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 138,
    width: 520, maxHeight: "82vh", overflowY: "auto",
    background: "rgba(4,8,14,0.97)", border: `1px solid ${CY}44`,
    borderRadius: 12, padding: 16,
    fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    backdropFilter: "blur(10px)", boxShadow: `0 0 40px ${CY}18`,
  };

  const tileStyle = (color) => ({
    background: `${color}11`, border: `1px solid ${color}44`,
    borderRadius: 8, padding: "8px 12px", textAlign: "center", flex: 1,
  });

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Knowledge × Ops × Risk Triple Coverage (KORSTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 138,
          background: open ? CY : "rgba(4,8,14,0.85)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 6,
          padding: "3px 9px", fontSize: 11, letterSpacing: 2,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 14px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ KORSTRI{counts.ISOLATED > 0 && (
          <span style={{
            marginLeft: 6, background: "#ffaa00", color: "#04060A",
            borderRadius: 4, padding: "0 5px", fontSize: 10, fontWeight: 700,
          }}>{counts.ISOLATED}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ color: CY, letterSpacing: 3, fontSize: 12, fontWeight: 700 }}>◈ KORSTRI</span>
            <span style={{ fontSize: 10, color: "#6E8AA0" }}>Knowledge × Ops × Risk Triple Coverage</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <div style={tileStyle("#88bbcc")}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#88bbcc" }}>{articles.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>ARTICLES</div>
            </div>
            <div style={tileStyle("#4488bb")}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#4488bb" }}>{opsEvents.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>OPS EVENTS</div>
            </div>
            <div style={tileStyle("#bb4488")}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#bb4488" }}>{riskSignals.length}</div>
              <div style={{ fontSize: 9, color: "#6E8AA0" }}>RISK SIGNALS</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(CLASS_META).map(([k, m]) => (
              <div key={k} style={tileStyle(m.color)}>
                <div style={{ fontSize: 16, fontWeight: 700, color: m.color }}>{counts[k]}</div>
                <div style={{ fontSize: 9, color: "#6E8AA0" }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6E8AA0", marginBottom: 3 }}>
              <span>COVERAGE</span><span style={{ color: coverage > 60 ? "#00ff88" : "#ffaa00" }}>{coverage}%</span>
            </div>
            <div style={{ background: "#111827", borderRadius: 4, height: 5 }}>
              <div style={{ width: `${coverage}%`, height: "100%", background: coverage > 60 ? "#00ff88" : "#ffaa00", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#04060A" : CY,
                border: `1px solid ${CY}44`, letterSpacing: 1,
              }}>{t === "ALL" ? "ALL" : CLASS_META[t]?.label || t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search articles…"
            style={{
              width: "100%", padding: "5px 8px", marginBottom: 8,
              background: "#0a1020", border: `1px solid ${CY}33`, borderRadius: 5,
              color: "#DCEBF5", fontSize: 12, fontFamily: "'JetBrains Mono',monospace",
              boxSizing: "border-box",
            }}
          />

          {/* Assess */}
          <button onClick={assess} disabled={assessing || rows.length === 0} style={{
            width: "100%", padding: "6px 0", marginBottom: 10, fontSize: 11,
            background: assessing ? "#111827" : `${CY}22`, border: `1px solid ${CY}55`,
            borderRadius: 6, color: CY, cursor: assessing ? "not-allowed" : "pointer",
            letterSpacing: 2, fontFamily: "'JetBrains Mono',monospace",
          }}>
            {assessing ? "◍ assessing…" : "▶ ASSESS KNOWLEDGE COVERAGE"}
          </button>
          {brief && (
            <div style={{ fontSize: 11, color: "#88ccaa", background: "#0a1820", border: `1px solid ${CY}22`, borderRadius: 6, padding: "8px 10px", marginBottom: 10, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          {loading && <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>loading…</div>}
          {error && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

          {/* Article list */}
          {!loading && visible.map((row) => {
            const meta = CLASS_META[row.cls];
            const isExp = expanded === row.art.id;
            return (
              <div key={row.art.id} style={{
                marginBottom: 6, border: `1px solid ${meta.color}33`, borderRadius: 8, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : row.art.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: `${meta.color}08` }}
                >
                  <span style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 4,
                    background: `${meta.color}22`, color: meta.color, letterSpacing: 1, whiteSpace: "nowrap",
                  }}>{meta.label}</span>
                  <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.art.title}
                  </span>
                  <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "8px 10px", background: "rgba(4,8,14,0.6)", borderTop: `1px solid ${meta.color}22` }}>
                    {row.art.content && (
                      <div style={{ fontSize: 11, color: "#88a0b0", marginBottom: 8, lineHeight: 1.4 }}>
                        {row.art.content.slice(0, 200)}{row.art.content.length > 200 ? "…" : ""}
                      </div>
                    )}

                    {/* Matched ops events */}
                    {row.matchedOps.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: "#00bfff", letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({row.matchedOps.length})</div>
                        {row.matchedOps.slice(0, 3).map((e) => (
                          <div key={e.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ color: "#DCEBF5" }}>{e.title}</span>
                              <span style={{ color: "#00bfff", fontSize: 10 }}>+{e.score}</span>
                            </div>
                            <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                              <div style={{ width: `${Math.min(100, e.score * 12)}%`, height: "100%", background: "#00bfff", borderRadius: 3 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched risk signals */}
                    {row.matchedRisk.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: "#ff6b6b", letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS ({row.matchedRisk.length})</div>
                        {row.matchedRisk.slice(0, 3).map((s) => (
                          <div key={s.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ color: "#DCEBF5" }}>{s.title}</span>
                              <span style={{
                                fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                background: `${SEV_COLOR[s.severity] || "#6E8AA0"}22`,
                                color: SEV_COLOR[s.severity] || "#6E8AA0",
                              }}>{s.severity.toUpperCase()}</span>
                            </div>
                            <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                              <div style={{ width: `${Math.min(100, s.score * 12)}%`, height: "100%", background: SEV_COLOR[s.severity] || "#ff6b6b", borderRadius: 3 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {row.matchedOps.length === 0 && row.matchedRisk.length === 0 && (
                      <div style={{ fontSize: 11, color: "#6E8AA0", fontStyle: "italic" }}>No operational or risk signal coverage found for this article.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && !error && (
            <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>No articles match this filter.</div>
          )}

          <div style={{ textAlign: "right", fontSize: 9, color: "#3a4a5a", marginTop: 8 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} articles
          </div>
        </div>
      )}
    </>
  );
}
