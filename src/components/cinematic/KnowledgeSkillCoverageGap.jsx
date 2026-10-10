/**
 * F173 — Knowledge × Skill Coverage Gap (KSCOV)
 *
 * Parallel-fetches /v1/aip/skill + /knowledge/ then keyword-correlates
 * each skill dimension against the knowledge-article library to surface:
 *   COVERED  — at least one article has keyword overlap with this skill
 *   GAP      — no knowledge article covers this skill (learning blind spot)
 *
 * Stat tiles: skills / articles / covered / gaps
 * Filter tabs: ALL | COVERED | GAP
 * Text search across skill names.
 * Expand any skill → matched articles with relevance score.
 * Blue badge on gap count.
 * ▶ ASSESS: 2-sentence knowledge-skill coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KSCOV  at bottom:8 left:58440, zIndex:114.
 * Event:   jarvis:kscov-toggle
 * Voice:   "knowledge skills / skill knowledge / kscov /
 *           skill knowledge gap / knowledge coverage skills /
 *           skill coverage / knowledge skill audit"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 58440;
const POLL_MS  = 90_000;
const BLUE     = "#60A5FA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const KSCOV_RE =
  /\b(knowledge\s+skill[s]?|skill[s]?\s+knowledge|kscov|skill[s]?\s+knowledge\s+gap|knowledge\s+coverage\s+skill[s]?|skill[s]?\s+coverage\s+(?:gap|audit|map)|knowledge\s+skill[s]?\s+audit|skill\s+learning\s+gap[s]?)\b/i;

export function isKscovQuery(q) { return KSCOV_RE.test(q); }

export async function buildKscovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [skillRes, artRes] = await Promise.all([
      fetch(`${base}/v1/aip/skill`, { headers: hdr }),
      fetch(`${base}/knowledge/`,   { headers: hdr }),
    ]);
    const skills   = normaliseSkills(await skillRes.json());
    const articles = normaliseArticles(await artRes.json());

    const covered = skills.filter((sk) => articles.some((a) => relevance(sk, a) > 0)).length;
    const gaps    = skills.length - covered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS knowledge-skill coverage analysis: ${skills.length} skill dimensions on record, ` +
          `${articles.length} knowledge articles in the library. ${covered} skill dimensions have ` +
          `relevant knowledge backing, ${gaps} skill dimensions have no matching knowledge articles ` +
          `(learning blind spots). Give a 2-sentence knowledge-skill coverage brief — ` +
          `formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Knowledge-skill coverage analysis complete, sir.").trim();
  } catch {
    return "Knowledge-skill coverage analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseSkills(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.skills)               ? raw.skills
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.items)                ? raw.items
    : typeof raw === "object" && raw !== null  ? Object.entries(raw).map(([k, v]) => ({
        id: k, name: k,
        score: typeof v === "number" ? v : (v?.score ?? null),
        description: typeof v === "object" ? (v?.description || "") : "",
        tags: "",
      }))
    : [];
  return arr.map((sk, i) => ({
    id:          sk.id          || sk.skill_id  || String(i),
    name:        sk.name        || sk.skill     || sk.dimension || sk.label || `Skill ${i + 1}`,
    score:       sk.score       != null ? sk.score : (sk.level ?? null),
    category:    sk.category    || sk.domain    || sk.type || "",
    description: (sk.description || sk.summary  || sk.notes || "").toString(),
    tags:        Array.isArray(sk.tags) ? sk.tags.join(" ") : (sk.tags || ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.articles)              ? raw.articles
    : Array.isArray(raw?.knowledge)             ? raw.knowledge
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.items)                 ? raw.items
    : [];
  return arr.map((a, i) => ({
    id:      a.id       || a.article_id || String(i),
    title:   a.title    || a.name       || a.heading || `Article ${i + 1}`,
    content: (a.content || a.body       || a.summary || a.excerpt || "").toString().slice(0, 500),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
    topic:   a.topic    || a.category   || a.domain || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(skill, article) {
  const sw = keywords(`${skill.name} ${skill.description.slice(0, 300)} ${skill.tags} ${skill.category}`);
  const aw = keywords(`${article.title} ${article.content.slice(0, 300)} ${article.tags} ${article.topic}`);
  return sw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildLinked(skills, articles) {
  return skills.map((sk) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(sk, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...sk, articles: matched, covered: matched.length > 0 };
  });
}

function scoreColor(s) {
  if (s === null || s === undefined) return "#94A3B8";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (isNaN(n)) return "#94A3B8";
  if (n >= 80) return "#4ADE80";
  if (n >= 50) return "#FBBF24";
  return "#F87171";
}

function catColor(c) {
  const s = String(c || "").toLowerCase();
  if (s.includes("security") || s.includes("threat")) return "#F87171";
  if (s.includes("intel")    || s.includes("analysis")) return "#818CF8";
  if (s.includes("ops")      || s.includes("operation")) return "#FBBF24";
  if (s.includes("network")  || s.includes("infra"))   return "#60A5FA";
  return "#94A3B8";
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "GAP"];

export default function KnowledgeSkillCoverageGap() {
  const [open,      setOpen]      = useState(false);
  const [skills,    setSkills]    = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [skillRes, artRes] = await Promise.all([
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
        fetch(`${base}/knowledge/`,   { headers: hdr }),
      ]);
      setSkills(normaliseSkills(await skillRes.json()));
      setArticles(normaliseArticles(await artRes.json()));
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
    window.addEventListener("jarvis:kscov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kscov-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isKscovQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked  = buildLinked(skills, articles);
  const covered = linked.filter((sk) => sk.covered).length;
  const gaps    = linked.filter((sk) => !sk.covered).length;

  const visible = linked
    .filter((sk) => {
      if (filter === "COVERED") return sk.covered;
      if (filter === "GAP")     return !sk.covered;
      return true;
    })
    .filter((sk) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        sk.name.toLowerCase().includes(q) ||
        String(sk.category).toLowerCase().includes(q)
      );
    });

  async function assess() {
    setAssessing(true);
    const text = await buildKscovScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Knowledge × Skill Coverage Gap (◈ KSCOV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 114,
          background: open ? `${BLUE}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? BLUE : S.border}`,
          borderRadius: S.radius, color: open ? BLUE : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${BLUE}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ KSCOV{gaps > 0 && (
          <span style={{
            marginLeft: 4,
            background: BLUE,
            color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{gaps}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 115,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${BLUE}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: BLUE, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              KNOWLEDGE × SKILL COVERAGE
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
              { label: "SKILLS",   val: skills.length,   color: BLUE      },
              { label: "ARTICLES", val: articles.length, color: "#A78BFA" },
              { label: "COVERED",  val: covered,         color: "#4ADE80" },
              { label: "GAPS",     val: gaps,            color: "#FB923C" },
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
                flex: 1,
                background: filter === t ? `${BLUE}22` : "transparent",
                border: `1px solid ${filter === t ? BLUE : S.border}`,
                color: filter === t ? BLUE : S.text,
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
              placeholder="search skills…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${S.border}`, borderRadius: S.radius,
                color: S.textHi, fontFamily: S.mono, fontSize: "9px",
                padding: "3px 7px", outline: "none",
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
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${sk.covered ? "#4ADE80" : "#FB923C"}`,
                  }}
                >
                  <span style={{ color: sk.covered ? "#4ADE80" : "#FB923C", fontSize: 10, width: 10 }}>
                    {sk.covered ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sk.name}
                  </span>
                  {sk.category && (
                    <span style={{
                      fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                      background: `${catColor(sk.category)}22`,
                      color: catColor(sk.category),
                      border: `1px solid ${catColor(sk.category)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {String(sk.category).toUpperCase().slice(0, 10)}
                    </span>
                  )}
                  {sk.score !== null && sk.score !== undefined && (
                    <span style={{
                      fontSize: "8px", color: scoreColor(sk.score),
                      whiteSpace: "nowrap", minWidth: 28, textAlign: "right",
                    }}>
                      {typeof sk.score === "number" ? sk.score.toFixed(0) : sk.score}
                    </span>
                  )}
                  <span style={{
                    fontSize: "9px", whiteSpace: "nowrap",
                    color: sk.covered ? "#4ADE80" : "#FB923C",
                    minWidth: 54, textAlign: "right",
                  }}>
                    {sk.covered ? `${sk.articles.length} ART.` : "GAP"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === sk.id ? "▴" : "▾"}</span>
                </div>

                {expanded === sk.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {sk.covered ? sk.articles.map((a) => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}22`,
                      }}>
                        <span style={{
                          fontSize: "7px", padding: "1px 4px", borderRadius: 4,
                          background: "#A78BFA22", color: "#A78BFA",
                          border: "1px solid #A78BFA44",
                          whiteSpace: "nowrap",
                        }}>
                          ART
                        </span>
                        <span style={{ flex: 1, color: S.textHi, fontSize: "9px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          rel:{a.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: "#FB923C", fontSize: "9px", padding: "2px 0" }}>
                        No knowledge articles found for this skill dimension.
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
