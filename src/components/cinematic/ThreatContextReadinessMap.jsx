/**
 * F183 — IntelProfile × Knowledge × Ops Event Threat Context Readiness Map (TCRMAP)
 *
 * Parallel-fetches /entities/IntelProfile + /knowledge/ + /v1/ops/events
 * and keyword-correlates each threat actor profile against KB articles AND ops events
 * to classify:
 *
 *   CONTEXT_RICH      — matched KB article + ops event (fully contextualised threat actor)
 *   KB_BACKED         — KB article match, no ops event
 *   OPS_TRACKED       — ops event match, no KB article
 *   UNCONTEXTUALIZED  — no matches (intelligence gap)
 *
 * Stat tiles: PROFILES / KB ARTICLES / OPS EVENTS + four class counts + CONTEXT%.
 * Amber badge on uncontextualized count.
 * Filter tabs ALL / CONTEXT_RICH / KB_BACKED / OPS_TRACKED / UNCONTEXTUALIZED + text search.
 * Expand profile → matched KB article cards (green) + ops event cards (blue) with relevance bars.
 * ▶ ASSESS CONTEXT → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tcrmap-toggle event.
 *
 * Voice triggers:
 *   "tcrmap / threat context / intel readiness / threat profile context /
 *    intel context map / uncontextualized intel / actor context / profile context"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_044_840;
const Z_INDEX  = 244;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TCRMAP_RE = /\b(tcrmap|threat[\s-]context|intel[\s-]readiness|threat[\s-]profile[\s-]context|intel[\s-]context[\s-]map|uncontextuali[sz]ed[\s-]intel|actor[\s-]context|profile[\s-]context)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  CONTEXT_RICH:      GR,
  KB_BACKED:         CY,
  OPS_TRACKED:       BL,
  UNCONTEXTUALIZED:  AM,
};

const TABS = ["ALL", "CONTEXT_RICH", "KB_BACKED", "OPS_TRACKED", "UNCONTEXTUALIZED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function profileText(p) {
  return `${p.name || ""} ${(p.aliases || []).join(" ")} ${p.org || p.organization || ""} ${p.role || ""} ${p.description || p.summary || ""} ${(p.tags || []).join(" ")}`;
}
function kbText(a) {
  return `${a.title || a.name || ""} ${a.content || a.summary || a.body || ""} ${a.category || a.type || ""} ${(a.tags || []).join(" ")}`;
}
function opsText(e) {
  return `${e.title || e.name || ""} ${e.description || e.summary || ""} ${e.type || e.event_type || ""} ${(e.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [profRes, kbRes, opsRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/IntelProfile`,  { headers }),
    fetch(`${apiBase}/knowledge/`,             { headers }),
    fetch(`${apiBase}/v1/ops/events`,          { headers }),
  ]);
  const profiles = profRes.status === "fulfilled" && profRes.value.ok
    ? normaliseArray(await profRes.value.json(), ["profiles", "intel_profiles", "items"]) : [];
  const articles = kbRes.status === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "knowledge", "items"]) : [];
  const ops = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events", "items"]) : [];
  return { profiles, articles, ops };
}

function correlate(profiles, articles, ops) {
  return profiles.map(p => {
    const kws = keywords(profileText(p));
    const matchedKb = articles
      .map(a => ({ ...a, _score: score(kbText(a), kws) }))
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedOps = ops
      .map(e => ({ ...e, _score: score(opsText(e), kws) }))
      .filter(e => e._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasKb  = matchedKb.length > 0;
    const hasOps = matchedOps.length > 0;
    let cls;
    if (hasKb && hasOps)       cls = "CONTEXT_RICH";
    else if (hasKb && !hasOps) cls = "KB_BACKED";
    else if (!hasKb && hasOps) cls = "OPS_TRACKED";
    else                       cls = "UNCONTEXTUALIZED";
    return { ...p, _cls: cls, _kb: matchedKb, _ops: matchedOps };
  });
}

export async function buildTcrmapScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { profiles, articles, ops } = await loadAll();
  const corr   = correlate(profiles, articles, ops);
  const unctx  = corr.filter(d => d._cls === "UNCONTEXTUALIZED").length;
  const rich   = corr.filter(d => d._cls === "CONTEXT_RICH").length;
  const context = `Threat actor profiles: ${profiles.length}, KB articles: ${articles.length}, ops events: ${ops.length}. Context-rich (KB + ops): ${rich}. Uncontextualized: ${uctx}.`
    .replace("uctx", unctx);
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      message: `Assess JARVIS threat actor context readiness. ${context} Give a 2-sentence brief on intelligence gaps and uncontextualized threat profiles.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${unctx} threat actor profiles lack both knowledge base and operational event context — these represent active intelligence gaps. ${rich} profiles are fully context-rich with corroborated KB articles and live ops events.`
    .replace("uctx", unctx);
}

export function isTcrmapQuery(q) { return TCRMAP_RE.test(q); }

export default function ThreatContextReadinessMap() {
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [profiles,    setProfiles]    = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [ops,         setOps]         = useState([]);
  const [correlated,  setCorrelated]  = useState([]);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [brief,       setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { profiles: pr, articles: ar, ops: ev } = await loadAll();
      setProfiles(pr); setArticles(ar); setOps(ev);
      setCorrelated(correlate(pr, ar, ev));
    } catch (e) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) setBrief(""); return !o; });
    window.addEventListener("jarvis:tcrmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tcrmap-toggle", onToggle);
  }, []);

  const unctx    = correlated.filter(d => d._cls === "UNCONTEXTUALIZED").length;
  const rich     = correlated.filter(d => d._cls === "CONTEXT_RICH").length;
  const kbOnly   = correlated.filter(d => d._cls === "KB_BACKED").length;
  const opsOnly  = correlated.filter(d => d._cls === "OPS_TRACKED").length;
  const ctxPct   = correlated.length
    ? Math.round(((rich + kbOnly + opsOnly) / correlated.length) * 100)
    : 0;

  const visible = correlated.filter(d =>
    (tab === "ALL" || d._cls === tab) &&
    (!search || profileText(d).toLowerCase().includes(search.toLowerCase()))
  );

  async function assess() {
    setAssessing(true);
    try { setBrief(await buildTcrmapScript()); } catch { setBrief("Unable to assess threat context readiness at this time."); }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => { if (!o) setBrief(""); return !o; })}
        title="F183 — IntelProfile × Knowledge × Ops Event Threat Context Readiness Map"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(6,11,22,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#000" : AM, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ TCRMAP{unctx > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 2, padding: "0 3px", fontSize: 8 }}>
            {unctx}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 780, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2 }}>TCRMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>IntelProfile × Knowledge × Ops Event — Threat Context Readiness Map</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "PROFILES",       val: profiles.length,  clr: PU },
              { label: "KB ARTICLES",    val: articles.length,  clr: GR },
              { label: "OPS EVENTS",     val: ops.length,       clr: BL },
              { label: "CONTEXT RICH",   val: rich,             clr: GR },
              { label: "KB BACKED",      val: kbOnly,           clr: CY },
              { label: "OPS TRACKED",    val: opsOnly,          clr: BL },
              { label: "UNCTX.",         val: unctx,            clr: AM },
              { label: "CONTEXT%",       val: `${ctxPct}%`,     clr: ctxPct >= 70 ? GR : ctxPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 72, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace("_", " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No profiles match current filter.</div>
            )}
            {visible.map((p, i) => {
              const clr = CLASS_COLOR[p._cls] || AM;
              const isExp = expanded === i;
              return (
                <div key={p.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 110 }}>{p._cls.replace("_", " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{p.name || p.id || "Unknown Profile"}</span>
                    {p.role && <span style={{ color: "#6B7280", fontSize: 9 }}>{p.role}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {p._kb.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>KNOWLEDGE BASE ({p._kb.length})</div>
                          {p._kb.map((a, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(34,197,94,0.06)", borderRadius: 3 }}>
                              <div style={{ color: "#DCEBF5", fontSize: 10 }}>{a.title || a.name || "Article"}</div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (a._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {p._ops.length > 0 && (
                        <div>
                          <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>OPS EVENTS ({p._ops.length})</div>
                          {p._ops.map((e, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(59,130,246,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{e.title || e.name || "Event"}</span>
                                {e.type && <span style={{ color: BL, fontSize: 8, border: `1px solid ${BL}33`, borderRadius: 2, padding: "0 3px" }}>{e.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (e._score / 5) * 100)}%`, background: BL, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {p._kb.length === 0 && p._ops.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No KB articles or ops events correlated — intelligence gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS CONTEXT"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/IntelProfile · /knowledge/ · /v1/ops/events
            </span>
          </div>
        </div>
      )}
    </>
  );
}
