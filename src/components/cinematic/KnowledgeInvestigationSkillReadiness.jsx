/**
 * F193 — Knowledge × Investigation × AIP Skill — Operational Intelligence Readiness Index (OIRI)
 *
 * Parallel-fetches /knowledge/ + /v1/investigations + /v1/aip/skill every 90 s.
 * Keyword-correlates each KB article (by title/summary/tags) against
 * open investigations AND the AIP skill catalog:
 *
 *   FULLY_UTILIZED — backed by ≥1 investigation AND ≥1 skill (actively applied)
 *   CASE_BACKED    — linked to an investigation, no skill automation
 *   SKILL_BACKED   — skill exists referencing it, no active case
 *   DORMANT        — neither investigations nor skills (unused intelligence)
 *
 * Stat tiles: articles / investigations / skills / fully utilized / dormant
 * Filter tabs: ALL | FULLY_UTILIZED | CASE_BACKED | SKILL_BACKED | DORMANT
 * Text search on article title/tags.
 * Expand row → matched investigations (amber bars) + matched skills (cyan bars).
 * Red badge + pulse on DORMANT count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence readiness brief + TTS.
 *
 * Toggle:  ◈ OIRI  at bottom:8 left:985420, zIndex:694.
 * Event:   jarvis:oiri-toggle
 * Voice:   "oiri / operational intelligence readiness / knowledge investigation skill /
 *           dormant knowledge / unused kb / kb readiness / knowledge gap"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 985_420;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const GREEN    = "#00FF88";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const OIRI_RE =
  /\b(oiri|operational\s+intelligence\s+readiness|knowledge\s+investigation\s+skill|dormant\s+knowledge|unused\s+kb|kb\s+readiness|knowledge\s+gap|kb\s+coverage)\b/i;

export function isOiriQuery(q) {
  return OIRI_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.articles)       return v.articles;
  if (v.investigations) return v.investigations;
  if (v.skills)         return v.skills;
  if (v.items)          return v.items;
  if (v.data)           return Array.isArray(v.data) ? v.data : [];
  if (v.results)        return Array.isArray(v.results) ? v.results : [];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.title, obj.name, obj.summary, obj.tags,
    obj.description, obj.category, obj.status, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.type, obj.description, obj.summary,
    obj.tags, obj.status, obj.category, obj.skill_type, obj.objective,
    obj.subject, obj.topic,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildOiriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [kbr, invr, skillr] = await Promise.allSettled([
      fetch(`${base}/knowledge/`,        { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/aip/skill`,      { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const articles = toArr(kbr.value);
    const invests  = toArr(invr.value);
    const skills   = toArr(skillr.value);
    let dormant = 0;

    for (const art of articles) {
      const kws = keywords(art);
      const hasInv   = invests.some(i => matchKws(kws, i));
      const hasSkill = skills.some(s => matchKws(kws, s));
      if (!hasInv && !hasSkill) dormant++;
    }

    return `OIRI analysis: ${articles.length} KB article${articles.length !== 1 ? "s" : ""} vs ` +
      `${invests.length} investigations × ${skills.length} skills. ` +
      `${dormant} article${dormant !== 1 ? "s are" : " is"} dormant — no active case or skill references them. ` +
      `Recommend linking dormant knowledge to relevant investigations and mapping skill automation.`;
  } catch (e) {
    return `OIRI error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_UTILIZED: GREEN,
  CASE_BACKED:    AMBER,
  SKILL_BACKED:   CY,
  DORMANT:        RED,
};

function classify(art, invests, skills) {
  const kws = keywords(art);
  const hasInv   = invests.some(i => matchKws(kws, i));
  const hasSkill = skills.some(s => matchKws(kws, s));
  if (hasInv && hasSkill)  return "FULLY_UTILIZED";
  if (hasInv && !hasSkill) return "CASE_BACKED";
  if (!hasInv && hasSkill) return "SKILL_BACKED";
  return "DORMANT";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.type, obj.description, obj.summary,
        obj.tags, obj.status, obj.category, obj.skill_type, obj.objective,
        obj.subject, obj.topic,
      ].filter(Boolean).join(" ").toLowerCase();
      const score = kws.filter(k => hay.includes(k)).length;
      return { obj, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.obj);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KnowledgeInvestigationSkillReadiness() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [invests,   setInvests]   = useState([]);
  const [skills,    setSkills]    = useState([]);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessTxt, setAssessTxt] = useState({});
  const [loading,   setLoading]   = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [kr, ir, sr] = await Promise.allSettled([
        fetch(`${base}/knowledge/`,        { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/aip/skill`,      { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const arts = toArr(kr.value);
      const invs = toArr(ir.value);
      const skls = toArr(sr.value);
      setArticles(arts); setInvests(invs); setSkills(skls);
      setRows(arts.map(art => ({
        art,
        cls: classify(art, invs, skls),
        kws: keywords(art),
      })));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => !o); if (!rows.length) load(); };
    window.addEventListener("jarvis:oiri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:oiri-toggle", onToggle);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const TABS = ["ALL", "FULLY_UTILIZED", "CASE_BACKED", "SKILL_BACKED", "DORMANT"];
  const dormantCount = rows.filter(r => r.cls === "DORMANT").length;

  const displayed = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.art.title, r.art.name, r.art.tags, r.art.category].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  async function assess(art, kws) {
    const id = art.id || art.title || art.name;
    setAssessing(id);
    const base = apiBase();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const matchedInvs   = topMatches(kws, invests);
    const matchedSkills = topMatches(kws, skills);
    const prompt =
      `KB article: "${art.title || art.name}". ` +
      `Matched investigations: ${matchedInvs.map(i => i.name || i.title).join(", ") || "none"}. ` +
      `Matched skills: ${matchedSkills.map(s => s.name || s.title).join(", ") || "none"}. ` +
      `In 2 sentences, assess this knowledge article's operational intelligence readiness.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: prompt }),
      });
      const d   = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setAssessTxt(prev => ({ ...prev, [id]: txt }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessTxt(prev => ({ ...prev, [id]: "Assessment unavailable." }));
    }
    setAssessing(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (!rows.length) load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 694,
          background: "rgba(5,8,14,0.82)", border: `1px solid ${dormantCount > 0 ? RED : CY}55`,
          borderRadius: 6, color: dormantCount > 0 ? RED : CY,
          fontSize: 10, fontFamily: MONO, letterSpacing: 2,
          padding: "3px 8px", cursor: "pointer",
          boxShadow: dormantCount > 0 ? `0 0 12px ${RED}44` : "none",
          animation: dormantCount > 0 ? "oiri-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ OIRI{dormantCount > 0 ? ` [${dormantCount}]` : ""}
        <style>{`@keyframes oiri-pulse{0%,100%{opacity:1}50%{opacity:.45}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 300, zIndex: 694,
      width: 660, maxHeight: "72vh",
      background: "rgba(5,9,16,0.97)", border: `1px solid ${CY}33`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 60px ${CY}14, 0 24px 48px rgba(0,0,0,0.85)`,
      fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 3, flex: 1 }}>OPERATIONAL INTELLIGENCE READINESS INDEX</span>
        {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>refreshing…</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: "#4E6070",
          cursor: "pointer", fontSize: 14, padding: 0,
        }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "articles",   val: articles.length,                                          col: CY    },
          { label: "cases",      val: invests.length,                                           col: AMBER },
          { label: "skills",     val: skills.length,                                            col: GREEN },
          { label: "utilized",   val: rows.filter(r => r.cls === "FULLY_UTILIZED").length,      col: GREEN },
          { label: "dormant",    val: dormantCount,                                             col: RED   },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: 6,
            padding: "5px 4px", textAlign: "center",
            border: `1px solid ${col}22`,
          }}>
            <div style={{ color: col, fontSize: 15, fontWeight: "bold" }}>{val}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setFilter(tab)} style={{
            background: filter === tab ? `${CY}18` : "transparent",
            border: `1px solid ${filter === tab ? CY : CY + "22"}`,
            borderRadius: 4, color: filter === tab ? CY : "#4E6070",
            fontSize: 9, letterSpacing: 1, padding: "2px 7px", cursor: "pointer",
          }}>{tab.replace(/_/g, " ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.04)",
            border: `1px solid ${CY}22`, borderRadius: 4,
            color: "#DCEBF5", fontSize: 9, padding: "2px 7px",
            fontFamily: MONO, outline: "none",
          }}
        />
      </div>

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {displayed.length === 0 && (
          <div style={{ padding: "20px 14px", color: "#4E6070", fontSize: 11, textAlign: "center" }}>
            {loading ? "loading…" : "no articles"}
          </div>
        )}
        {displayed.map(({ art, cls, kws }) => {
          const id = art.id || art.title || art.name;
          const isExp = expanded === id;
          const matchedInvs   = topMatches(kws, invests);
          const matchedSkills = topMatches(kws, skills);
          const col = CLASS_COLOR[cls] || CY;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${CY}0F` }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 14px", cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.05)" : "transparent",
                }}
              >
                <span style={{ color: col, fontSize: 9, letterSpacing: 1, flexShrink: 0, width: 130 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {art.title || art.name || id}
                </span>
                <span style={{ color: "#4E6070", fontSize: 9, flexShrink: 0 }}>
                  {art.category || art.tags || ""}
                </span>
                <span style={{ color: "#2E4050", fontSize: 10, flexShrink: 0 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 14px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Investigations */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginBottom: 4 }}>
                    INVESTIGATIONS ({matchedInvs.length})
                  </div>
                  {matchedInvs.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no active case</div>
                    : matchedInvs.map((inv, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: AMBER, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{inv.name || inv.title}</span>
                          {inv.status && <span style={{ color: "#4E6070", fontSize: 9 }}>{inv.status}</span>}
                        </div>
                      ))
                  }

                  {/* Skills */}
                  <div style={{ fontSize: 9, color: "#4E6070", letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                    SKILLS ({matchedSkills.length})
                  </div>
                  {matchedSkills.length === 0
                    ? <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>no skill references</div>
                    : matchedSkills.map((s, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <div style={{ height: 6, borderRadius: 3, background: CY, width: `${Math.max(20, 100 - i * 15)}%`, maxWidth: 180 }} />
                          <span style={{ color: "#9AB0BE", fontSize: 10 }}>{s.name || s.title}</span>
                          {s.skill_type && <span style={{ color: "#4E6070", fontSize: 9 }}>{s.skill_type}</span>}
                        </div>
                      ))
                  }

                  {/* Assess button */}
                  <button
                    onClick={() => assess(art, kws)}
                    disabled={assessing === id}
                    style={{
                      marginTop: 8, background: assessing === id ? "rgba(41,231,255,0.05)" : "rgba(41,231,255,0.1)",
                      border: `1px solid ${CY}44`, borderRadius: 4, color: CY,
                      fontSize: 9, letterSpacing: 1, padding: "3px 10px",
                      cursor: assessing === id ? "not-allowed" : "pointer", fontFamily: MONO,
                    }}
                  >
                    {assessing === id ? "assessing…" : "▶ ASSESS"}
                  </button>

                  {assessTxt[id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: "rgba(41,231,255,0.05)", borderRadius: 4,
                      color: "#9AB0BE", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessTxt[id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 14px", borderTop: `1px solid ${CY}11`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
          OIRI · /knowledge/ × /v1/investigations × /v1/aip/skill · 90s
        </span>
        <span style={{ color: dormantCount > 0 ? RED : "#2E4050", fontSize: 8 }}>
          {dormantCount} DORMANT
        </span>
      </div>
    </div>
  );
}
