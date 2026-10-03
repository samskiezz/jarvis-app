/**
 * F177 — Scenario × IntelProfile × Knowledge Actor Intelligence Preparedness Map (AIPMAP)
 *
 * Parallel-fetches /v1/scenario/list + /entities/IntelProfile + /knowledge/ and
 * keyword-correlates each scenario against known threat actor profiles AND knowledge
 * base articles to classify:
 *
 *   FULLY_PREPARED  — matched both a threat actor profile AND a KB article
 *   ACTOR_AWARE     — matched a threat actor profile, no KB coverage
 *   KB_BACKED       — matched a KB article, no threat actor profile
 *   UNPREPARED      — no matches (intelligence preparedness gap)
 *
 * Stat tiles: SCENARIOS / INTEL PROFILES / KB ARTICLES + four class counts + PREPARED%.
 * Red badge on unprepared count.
 * Filter tabs ALL / FULLY_PREPARED / ACTOR_AWARE / KB_BACKED / UNPREPARED + text search.
 * Expand scenario → matched intel profile cards (orange, role badge) + KB article cards
 *                  (green, category badge) with relevance bars.
 * ▶ ASSESS PREPAREDNESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:aipmap-toggle event.
 *
 * Voice triggers:
 *   "aipmap / actor intel preparedness / scenario actor / unprepared scenarios /
 *    threat actor preparedness / actor knowledge / scenario intel preparedness"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_041_480;
const Z_INDEX  = 238;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const AIPMAP_RE = /\b(aipmap|actor[\s-]intel[\s-]preparedness|scenario[\s-]actor\b|unprepared[\s-]scenarios|threat[\s-]actor[\s-]preparedness|actor[\s-]knowledge\b|scenario[\s-]intel[\s-]preparedness)\b/i;

const CY     = "#00CFFF";
const OR     = "#F97316";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_PREPARED: GR,
  ACTOR_AWARE:    OR,
  KB_BACKED:      CY,
  UNPREPARED:     RD,
};

const TABS = ["ALL", "FULLY_PREPARED", "ACTOR_AWARE", "KB_BACKED", "UNPREPARED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scenText(s) {
  return `${s.name || s.title || ""} ${s.description || s.summary || ""} ${s.type || ""} ${(s.tags || []).join(" ")}`;
}
function profileText(p) {
  return `${p.name || ""} ${(p.aliases || []).join(" ")} ${p.org || p.organization || ""} ${p.role || ""} ${p.description || ""} ${(p.tags || []).join(" ")}`;
}
function kbText(k) {
  return `${k.title || k.name || ""} ${k.content || k.summary || k.description || ""} ${k.category || k.type || ""} ${(k.tags || []).join(" ")}`;
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
  const [scenRes, profRes, kbRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/scenario/list`,       { headers }),
    fetch(`${apiBase}/entities/IntelProfile`,  { headers }),
    fetch(`${apiBase}/knowledge/`,             { headers }),
  ]);
  const scenarios = scenRes.status === "fulfilled" && scenRes.value.ok
    ? normaliseArray(await scenRes.value.json(), ["scenarios", "items"]) : [];
  const profiles = profRes.status === "fulfilled" && profRes.value.ok
    ? normaliseArray(await profRes.value.json(), ["profiles", "items"]) : [];
  const articles = kbRes.status === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "items"]) : [];
  return { scenarios, profiles, articles };
}

function correlate(scenarios, profiles, articles) {
  return scenarios.map(scen => {
    const kws = keywords(scenText(scen));
    const matchedProfiles = profiles
      .map(p => ({ ...p, _score: score(profileText(p), kws) }))
      .filter(p => p._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedArticles = articles
      .map(a => ({ ...a, _score: score(kbText(a), kws) }))
      .filter(a => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasProfile = matchedProfiles.length > 0;
    const hasArticle = matchedArticles.length > 0;
    let cls;
    if (hasProfile && hasArticle) cls = "FULLY_PREPARED";
    else if (hasProfile)          cls = "ACTOR_AWARE";
    else if (hasArticle)          cls = "KB_BACKED";
    else                          cls = "UNPREPARED";
    return { ...scen, _cls: cls, _profiles: matchedProfiles, _articles: matchedArticles };
  });
}

export async function buildAipmapScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { scenarios, profiles, articles } = await loadAll();
  const corr       = correlate(scenarios, profiles, articles);
  const unprepared = corr.filter(s => s._cls === "UNPREPARED").length;
  const fully      = corr.filter(s => s._cls === "FULLY_PREPARED").length;
  const context = `Scenarios: ${scenarios.length}, Intel profiles: ${profiles.length}, KB articles: ${articles.length}. Fully prepared (actor + KB): ${fully}. Unprepared (no actor or KB coverage): ${unprepared}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `Assess JARVIS scenario actor intelligence preparedness. ${context} Give a 2-sentence operational preparedness brief focusing on unprepared scenarios and intelligence gaps.` }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${unprepared} scenarios lack both threat-actor profiling and knowledge base coverage — these represent critical intelligence preparedness gaps. ${fully} scenarios are fully prepared with both actor intelligence and knowledge backing.`;
}

export function isAipmapQuery(q) { return AIPMAP_RE.test(q); }

export default function ActorIntelPreparednessMap() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [corr,      setCorr]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadAll();
      setScenarios(data.scenarios);
      setProfiles(data.profiles);
      setArticles(data.articles);
      setCorr(correlate(data.scenarios, data.profiles, data.articles));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:aipmap-toggle", toggle);
    return () => window.removeEventListener("jarvis:aipmap-toggle", toggle);
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
      const text = await buildAipmapScript();
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

  const fully      = corr.filter(s => s._cls === "FULLY_PREPARED").length;
  const actorOnly  = corr.filter(s => s._cls === "ACTOR_AWARE").length;
  const kbOnly     = corr.filter(s => s._cls === "KB_BACKED").length;
  const unprepared = corr.filter(s => s._cls === "UNPREPARED").length;
  const prepPct    = corr.length ? Math.round((fully / corr.length) * 100) : 0;

  const visible = corr.filter(s => {
    const matchTab  = tab === "ALL" || s._cls === tab;
    const matchSrch = !search || scenText(s).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: unprepared > 0 ? RD : CY, fontFamily: FONT, fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: unprepared > 0 ? `0 0 8px ${RD}55` : "none",
        }}
        title="Scenario × IntelProfile × Knowledge Actor Intelligence Preparedness Map (F177)"
      >
        ◈ AIPMAP{unprepared > 0 && <span style={{ color: RD, marginLeft: 4 }}>●{unprepared}</span>}
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
          ◈ AIPMAP — Scenario × Actor Intel × Knowledge Preparedness
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
          ["SCENARIOS",   corr.length,  CY],
          ["PROFILES",    profiles.length, OR],
          ["KB ARTICLES", articles.length, GR],
          ["FULLY PREP",  fully,        GR],
          ["ACTOR AWARE", actorOnly,    OR],
          ["KB BACKED",   kbOnly,       CY],
          ["UNPREPARED",  unprepared,   RD],
          [`${prepPct}% PREP`, null,    GR],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{val ?? label}</div>
            {val !== null && <div style={{ color: "#6B7280", fontSize: 9, marginTop: 1 }}>{label}</div>}
          </div>
        ))}
      </div>

      {/* Preparedness bar */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 3 }}>FULL PREPAREDNESS</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${prepPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
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
          placeholder="search scenarios…"
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontFamily: FONT }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: "#6B7280", padding: 8, textAlign: "center" }}>No items match.</div>
        )}
        {visible.map((s, i) => {
          const id   = s.id || s.scenario_id || i;
          const isExp = expanded === id;
          const clr  = CLASS_COLOR[s._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{s._cls}</span>
                  <span style={{ color: CY }}>{s.name || s.title || `Scenario ${id}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                  {s._profiles.length > 0 && <span style={{ color: OR }}>ACT:{s._profiles.length}</span>}
                  {s._articles.length > 0 && <span style={{ color: GR }}>KB:{s._articles.length}</span>}
                  <span>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {s.description && (
                <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>{s.description.slice(0, 100)}</div>
              )}
              {isExp && (
                <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                  {s._profiles.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 3 }}>INTEL PROFILES</div>
                      {s._profiles.map((p, pi) => (
                        <div key={pi} style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: OR, fontSize: 10 }}>{p.name || "Actor"}</span>
                            {p.role && <span style={{ background: "rgba(249,115,22,0.2)", color: OR, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{p.role.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (p._score / 5) * 100)}%`, background: OR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {s._articles.length > 0 && (
                    <div>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 3 }}>KB ARTICLES</div>
                      {s._articles.map((a, ai) => (
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
                  {s._profiles.length === 0 && s._articles.length === 0 && (
                    <div style={{ color: RD, fontSize: 9, padding: "4px 0" }}>No actor or KB coverage found for this scenario.</div>
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
          {assessing ? "⟳ Assessing…" : "▶ ASSESS PREPAREDNESS"}
        </button>
        {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
