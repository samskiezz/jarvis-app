/**
 * F134 — Skill × Knowledge Coverage Gap
 *
 * Parallel-fetches /v1/aip/skill and /knowledge/ then keyword-correlates
 * each self-improvement skill against the knowledge article catalogue to
 * surface DOCUMENTED skills (at least one article exists) vs DARK skills
 * (no knowledge documentation — learning gap, capability without material).
 *
 * Stat tiles: skills / articles / documented / dark.
 * Filter tabs: ALL | DOCUMENTED | DARK + text search.
 * Expand any skill → matched articles with relevance score + type badge.
 * ▶ ASSESS: 2-sentence AI skill-knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SKKNOW  at bottom:8 left:42440, zIndex:87.
 * Voice:   "skill knowledge / knowledge skills / documented skills /
 *           skill docs / dark skills / skknow"
 * Event:   jarvis:skknow-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 42440;
const POLL_MS  = 120_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SKKNOW_RE =
  /\b(skill\s+knowledge|knowledge\s+skills?|documented\s+skills?|skill\s+docs?|dark\s+skills?|skknow|skill[-\s]knowledge\s+gap|skill[-\s]knowledge\s+coverage|knowledge[-\s]backed\s+skills?)\b/i;

export function isSkknowQuery(q) { return SKKNOW_RE.test(q); }

export async function buildSkknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, knowRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`,  { headers: hdr }),
      fetch(`${base}/knowledge/`,    { headers: hdr }),
    ]);
    const skills   = normaliseSkills(await skillRes.json());
    const articles = normaliseArticles(await knowRes.json());

    const documented = skills.filter(
      (sk) => articles.some((a) => relevance(sk, a) > 0)
    ).length;
    const dark = skills.length - documented;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS skill-knowledge coverage analysis: ${skills.length} self-improvement skills ` +
          `assessed against ${articles.length} knowledge articles. ${documented} skills have at ` +
          `least one matching knowledge article providing learning material. ${dark} skills are ` +
          `DARK — no knowledge documentation found for them, representing a learning and ` +
          `reference gap in the system. Give a 2-sentence skill-knowledge coverage brief — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Skill-knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Skill-knowledge coverage analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.skills)                 ? raw.skills
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr.map((sk, i) => ({
    id:       sk.id          || String(i),
    name:     sk.name        || sk.title      || sk.skill_name || `Skill ${i + 1}`,
    category: (sk.category   || sk.type       || sk.domain    || "").toString(),
    desc:     (sk.description || sk.summary   || sk.notes     || "").toString(),
    score:    sk.score != null ? Number(sk.score) : null,
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)                  ? raw
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.articles)               ? raw.articles
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr.map((a, i) => ({
    id:       a.id           || String(i),
    title:    a.title        || a.name     || a.slug  || `Article ${i + 1}`,
    type:     (a.type        || a.category || a.kind  || "article").toString(),
    content:  (a.content     || a.body     || a.summary || a.description || "").toString(),
  }));
}

function skillKeywords(sk) {
  return String(`${sk.name} ${sk.category} ${sk.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function articleKeywords(a) {
  return String(`${a.title} ${a.type} ${a.content.slice(0, 300)}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, article) {
  const sw = skillKeywords(skill);
  const aw = articleKeywords(article);
  return sw.filter((w) => aw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(skills, articles) {
  return skills.map((sk) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(sk, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, articles: matched, documented: matched.length > 0 };
  }).sort((a, b) => (b.documented ? 1 : 0) - (a.documented ? 1 : 0) || b.articles.length - a.articles.length);
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "DOCUMENTED", "DARK"];

export default function SkillKnowledgeCoverage() {
  const [open,       setOpen]       = useState(false);
  const [skills,     setSkills]     = useState([]);
  const [articles,   setArticles]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skillRes, knowRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
        fetch(`${base}/knowledge/`,   { headers: hdr }),
      ]);
      setSkills(normaliseSkills(await skillRes.json()));
      setArticles(normaliseArticles(await knowRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:skknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:skknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSkknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked    = buildLinked(skills, articles);
  const docCnt    = linked.filter((sk) => sk.documented).length;
  const darkCnt   = linked.filter((sk) => !sk.documented).length;

  const q = search.trim().toLowerCase();
  const visible = linked.filter((sk) => {
    if (filter === "DOCUMENTED") { if (!sk.documented) return false; }
    if (filter === "DARK")       { if (sk.documented)  return false; }
    if (q) return skillKeywords(sk).some((w) => w.includes(q) || q.includes(w)) ||
                  sk.name.toLowerCase().includes(q);
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildSkknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Skill × Knowledge Coverage (◈ SKKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 87,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SKKNOW{darkCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#F59E0B", color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{darkCnt}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 86,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              SKILL × KNOWLEDGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || skills.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || skills.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "SKILLS",  val: skills.length,   color: C.blue    },
              { label: "ARTICLES",val: articles.length,  color: C.gold    },
              { label: "DOCD",    val: docCnt,           color: "#4ADE80" },
              { label: "DARK",    val: darkCnt,          color: "#F59E0B" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 4px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "0 12px 6px" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search skills…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)", border: `1px solid ${S.border}`,
                borderRadius: S.radius, color: S.textHi,
                fontFamily: S.mono, fontSize: "9px",
                padding: "3px 8px", outline: "none",
              }}
            />
          </div>

          {/* Skill list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && skills.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No skills match.</div>
            ) : visible.map((sk) => (
              <div key={sk.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === sk.id ? null : sk.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sk.documented ? "#4ADE80" : "#F59E0B"}`,
                  }}
                >
                  <span style={{ color: sk.documented ? "#4ADE80" : "#F59E0B", fontSize: 10, width: 10 }}>
                    {sk.documented ? "●" : "○"}
                  </span>
                  <span style={{
                    flex: 1, color: S.textHi, fontSize: "9px",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {sk.name}
                  </span>
                  {sk.category && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`, whiteSpace: "nowrap",
                    }}>
                      {sk.category}
                    </span>
                  )}
                  <span style={{
                    color: sk.documented ? "#4ADE80" : "#F59E0B",
                    fontSize: "9px", minWidth: 44, textAlign: "right",
                  }}>
                    {sk.documented ? `${sk.articles.length} ART.` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sk.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sk.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sk.documented ? sk.articles.map((a) => (
                      <div key={a.id} style={{
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{
                            color: S.textHi, fontSize: "9px", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {a.title}
                          </span>
                          <span style={{
                            fontSize: "8px", marginLeft: 6, whiteSpace: "nowrap",
                            padding: "1px 4px", borderRadius: 4,
                            background: `${C.gold}22`, color: C.gold,
                            border: `1px solid ${C.gold}44`,
                          }}>
                            {a.type}
                          </span>
                          <span style={{
                            fontSize: "8px", marginLeft: 4, color: C.neon, whiteSpace: "nowrap",
                          }}>
                            {a.score}pt
                          </span>
                        </div>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No knowledge articles match this skill — learning gap with no documentation.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /v1/aip/skill · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
