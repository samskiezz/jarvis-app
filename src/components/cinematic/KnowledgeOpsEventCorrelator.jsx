/**
 * KnowledgeOpsEventCorrelator — F77 (KOEC)
 *
 * Parallel-fetches /knowledge/ + /v1/ops/events every 90 s.
 * Keyword-correlates each KB article against live ops events.
 * Classification: ACTIVE (≥1 correlated ops event) vs DORMANT (0).
 * Amber badge on dormant count.
 *
 * Voice intents: "knowledge ops / ops knowledge / koec / active knowledge /
 *                live knowledge / kb ops / knowledge events / ops articles /
 *                which knowledge is active / knowledge operational"
 * Strip button: ◈ KOEC  left:2100 bottom:18 zIndex:68
 * Custom event: jarvis:koec-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const ORG = "#FF8C00";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const KOEC_RE =
  /\b(knowledge.ops|ops.knowledge|koec|active.knowl|live.knowl|kb.ops|knowl.*event|ops.article|which.knowl.*active|knowledge.operat|kb.active|operational.knowl|knowledge.live.ops)\b/i;

export function isKoecQuery(t) { return KOEC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(article, event) {
  const a = tokenize([article.title, article.content, article.topic, (article.tags || []).join(" ")].join(" "));
  const b = tokenize([event.type, event.resource, event.description, event.message].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

function sevColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return RED;
  if (s === "high")     return ORG;
  if (s === "warning")  return AMB;
  if (s === "info")     return CY;
  return "#566878";
}

async function fetchAll() {
  const base = apiBase();
  const [kr, er] = await Promise.all([
    fetch(`${base}/knowledge/`,     { headers: hdrs }),
    fetch(`${base}/v1/ops/events`,  { headers: hdrs }),
  ]);
  const kd = kr.ok ? await kr.json() : {};
  const ed = er.ok ? await er.json() : {};

  const articles = (Array.isArray(kd) ? kd : kd?.data || kd?.items || kd?.results || kd?.articles || []).map(a => ({
    id:      a.id || a._id || String(Math.random()),
    title:   a.title || a.name || "Untitled",
    topic:   a.topic || a.category || "",
    content: a.content || a.body || a.summary || "",
    tags:    a.tags || [],
    confidence: a.confidence ?? a.score ?? null,
  }));

  const events = (Array.isArray(ed) ? ed : ed?.data || ed?.items || ed?.results || ed?.events || []).map(e => ({
    id:          e.id || e._id || String(Math.random()),
    type:        e.type || e.event_type || "",
    resource:    e.resource || e.service || "",
    description: e.description || e.message || "",
    message:     e.message || "",
    severity:    e.severity || e.level || "info",
    timestamp:   e.timestamp || e.created_at || "",
  }));

  return { articles, events };
}

export async function buildKoecScript() {
  try {
    const { articles, events } = await fetchAll();
    if (!articles.length) return "No knowledge base articles found for operational correlation, sir.";
    const dormant = articles.filter(a =>
      !events.some(e => relevance(a, e) > 0.03)
    );
    const active = articles.length - dormant.length;
    return (
      `Knowledge × Ops Event Correlator: ${articles.length} KB articles checked against ${events.length} live ops events. ` +
      `${active} ACTIVE (matched to operational events), ${dormant.length} DORMANT (no ops correlation). ` +
      (dormant.length
        ? `Dormant articles include: ${dormant.slice(0, 3).map(a => `"${a.title}"`).join(", ")}. ` +
          `Summarise the operational knowledge alignment in exactly 2 sentences and recommend priority actions.`
        : "All knowledge articles have matching operational activity. Excellent coverage, sir.")
    );
  } catch {
    return "Unable to retrieve knowledge ops correlation data at this time, sir.";
  }
}

export default function KnowledgeOpsEventCorrelator() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessed, setAssessed] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await fetchAll();
      setArticles(d.articles); setEvents(d.events);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const t = () => setOpen(v => !v);
    window.addEventListener("jarvis:koec-toggle", t);
    return () => window.removeEventListener("jarvis:koec-toggle", t);
  }, []);

  const correlated = articles.map(art => {
    const matches = events
      .map(e => ({ ...e, score: relevance(art, e) }))
      .filter(e => e.score > 0.03)
      .sort((a, b) => b.score - a.score);
    return { ...art, matches, active: matches.length > 0 };
  });

  const dormantCount = correlated.filter(a => !a.active).length;

  const visible = correlated.filter(art => {
    if (tab === "ACTIVE"  && !art.active)  return false;
    if (tab === "DORMANT" && art.active)   return false;
    if (search) {
      const hay = (art.title + " " + art.topic + " " + art.content).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const assess = async () => {
    setAssessing(true); setAssessed("");
    try {
      const script = await buildKoecScript();
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = r.ok ? await r.json() : {};
      const reply = d.response || d.answer || d.message || d.text || script;
      setAssessed(reply);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: reply } }));
    } catch {
      setAssessed("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* Strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge × Ops Event Correlator (F77)"
        style={{
          position: "fixed", bottom: 18, left: 2100, zIndex: 68,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : CY, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${CY}` : "none", whiteSpace: "nowrap",
        }}>
        ◈ KOEC
        {dormantCount > 0 && (
          <span style={{
            marginLeft: 4, background: AMB, color: "#04060A",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{dormantCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 46, left: 2000, zIndex: 69,
          width: 500, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.94)", border: `1px solid ${CY}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${CY}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11,
              textShadow: `0 0 10px ${CY}` }}>◈ KNOWLEDGE × OPS EVENT CORRELATOR</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && <span style={{ color: AMB, fontSize: 9, animation: "koecpulse 1s infinite" }}>syncing…</span>}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
                color: CY, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}22` }}>
            {[
              ["ARTICLES",  articles.length,                          CY],
              ["OPS EVTS",  events.length,                            "#B485FF"],
              ["ACTIVE",    correlated.filter(a => a.active).length,  GRN],
              ["DORMANT",   dormantCount,                             AMB],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, padding: "7px 4px", textAlign: "center",
                borderRight: `1px solid ${CY}18`,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {["ALL", "ACTIVE", "DORMANT"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 4,
                border: `1px solid ${tab === t ? CY : "#2a3a4a"}`,
                background: tab === t ? `${CY}22` : "transparent",
                color: tab === t ? CY : "#566878",
                cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              type="text" placeholder="search articles…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 80, background: `${CY}0A`, border: `1px solid ${CY}33`,
                borderRadius: 4, color: "#DCEBF5", fontSize: 9,
                padding: "3px 7px", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {err && <div style={{ color: RED, fontSize: 11, padding: 8 }}>⚠ {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 10 }}>No results.</div>
            )}

            {visible.map(art => {
              const col = art.active ? GRN : AMB;
              const isExp = expanded[art.id];
              return (
                <div key={art.id} style={{
                  marginBottom: 10,
                  background: `${col}08`,
                  border: `1px solid ${col}33`,
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div
                    onClick={() => toggle(art.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{art.active ? "ACTIVE" : "DORMANT"}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {art.title}
                    </span>
                    {art.topic && (
                      <span style={{
                        fontSize: 8, color: CY, border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                      }}>{art.topic}</span>
                    )}
                    <span style={{ color: col, fontSize: 10, flexShrink: 0 }}>
                      {art.matches.length} evt{art.matches.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {art.matches.length === 0 ? (
                        <div style={{ color: "#566878", fontSize: 10, fontStyle: "italic" }}>
                          No correlated ops events.
                        </div>
                      ) : art.matches.map(ev => (
                        <div key={ev.id} style={{
                          marginTop: 6, padding: "7px 10px",
                          background: `${CY}0A`, border: `1px solid ${CY}22`,
                          borderRadius: 6,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{
                              fontSize: 8, color: sevColor(ev.severity),
                              border: `1px solid ${sevColor(ev.severity)}55`,
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                            }}>{(ev.severity || "INFO").toUpperCase()}</span>
                            {ev.type && (
                              <span style={{
                                fontSize: 8, color: "#B485FF",
                                border: "1px solid #B485FF44",
                                borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                              }}>{ev.type.toUpperCase()}</span>
                            )}
                            <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {ev.description || ev.resource || "Ops event"}
                            </span>
                            <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                              {(ev.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                            <div style={{
                              height: 3, borderRadius: 2,
                              width: `${Math.min(100, ev.score * 100)}%`,
                              background: GRN, boxShadow: `0 0 6px ${GRN}`,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /knowledge/ + /v1/ops/events
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${correlated.length} articles · ${events.length} events`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes koecpulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
