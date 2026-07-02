/**
 * F91 — Intel Profile × Knowledge Advisor
 *
 * Parallel-fetches /entities/IntelProfile + /knowledge/, then keyword-correlates
 * each known threat actor / subject-of-interest against knowledge article titles
 * and content to surface whether the actor is RESEARCHED (at least one article
 * covers them or their domain) or DARK (no documented intelligence found).
 *
 * Stat tiles: profiles / articles / researched / dark.
 * Filter tabs: ALL | RESEARCHED | DARK.
 * Expand any profile → matched articles with relevance score.
 * ▶ ASSESS: sends a 2-sentence AI intel-knowledge brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPKNOW  at bottom:8 left:24480, zIndex 69.
 * Voice:   "intel knowledge / profile knowledge / actor docs / know the threats / ipknow"
 * Event:   jarvis:ipknow-toggle
 * Refresh: 120 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 24480;
const POLL_MS  = 120_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const IPKNOW_RE =
  /\b(intel\s+(profile\s+)?knowledge|profile\s+knowledge|actor\s+(docs?|knowledge|articles?)|know\s+the\s+threats?|threat\s+knowledge|threat\s+docs?|intelligence\s+knowledge|subject\s+knowledge|ipknow)\b/i;

export function isIpknowQuery(q) { return IPKNOW_RE.test(q); }

export async function buildIpknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [pRes, kRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/knowledge/`,            { headers: hdr }),
    ]);
    const pRaw = await pRes.json();
    const kRaw = await kRes.json();
    const profiles = normaliseProfiles(pRaw);
    const articles = normaliseArticles(kRaw);

    const researched = profiles.filter((p) =>
      articles.some((a) => relevance(p, a) > 0)
    ).length;
    const dark = profiles.length - researched;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS intel-profile knowledge coverage: ${profiles.length} known threat actors/subjects, ` +
          `${articles.length} knowledge articles, ${researched} profiles with documented intelligence, ` +
          `${dark} profiles with zero knowledge backing (blind spots). ` +
          `Give a 2-sentence intelligence-gap assessment — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Intel profile knowledge analysis complete, sir.").trim();
  } catch {
    return "Intel profile knowledge coverage analysis unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.intel_profiles)      ? raw.intel_profiles
    : Array.isArray(raw?.profiles)            ? raw.profiles
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:           p.id            || String(i),
    name:         p.name          || p.title || p.subject || `Profile ${i + 1}`,
    type:         p.type          || p.category || "",
    threat_level: p.threat_level  || p.threat || p.severity || "",
    description:  (p.description  || p.summary || p.notes || "").toString().slice(0, 300),
    org:          p.org           || p.organization || p.affiliation || "",
    aliases:      Array.isArray(p.aliases) ? p.aliases.join(" ") : (p.aliases || ""),
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)              ? raw
    : Array.isArray(raw?.data)                ? raw.data
    : Array.isArray(raw?.knowledge)           ? raw.knowledge
    : Array.isArray(raw?.articles)            ? raw.articles
    : Array.isArray(raw?.items)               ? raw.items
    : Array.isArray(raw?.results)             ? raw.results
    : Array.isArray(raw?.chunks)              ? raw.chunks
    : [];
  return arr.map((a, i) => ({
    id:      a.id      || String(i),
    title:   a.title   || a.name   || a.heading || `Article ${i + 1}`,
    content: (a.content || a.body || a.text || a.summary || a.description || "").toString().slice(0, 400),
    tags:    Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, article) {
  const pw = keywords(
    `${profile.name} ${profile.description} ${profile.org} ${profile.type} ${profile.aliases}`
  );
  const aw = keywords(`${article.title} ${article.content} ${article.tags}`);
  return pw.filter((w) => aw.some((a) => a.includes(w) || w.includes(a))).length;
}

function buildCorrelated(profiles, articles) {
  return profiles.map((p) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(p, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, articles: matched, researched: matched.length > 0 };
  });
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "RESEARCHED", "DARK"];

const THREAT_COLOR = {
  critical: "#FF2D55",
  high:     "#FF6B00",
  medium:   "#FFB300",
  low:      "#4ADE80",
};

export default function IntelProfileKnowledgeAdvisor() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [pRes, kRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/knowledge/`,            { headers: hdr }),
      ]);
      const pRaw = await pRes.json();
      const kRaw = await kRes.json();
      setProfiles(normaliseProfiles(pRaw));
      setArticles(normaliseArticles(kRaw));
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
    window.addEventListener("jarvis:ipknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipknow-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIpknowQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated  = buildCorrelated(profiles, articles);
  const researched  = correlated.filter((p) => p.researched).length;
  const dark        = correlated.filter((p) => !p.researched).length;

  const visible = correlated.filter((p) => {
    if (filter === "RESEARCHED") return p.researched;
    if (filter === "DARK")       return !p.researched;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildIpknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile × Knowledge Advisor (◈ IPKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IPKNOW{dark > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
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
              INTEL PROFILE–KNOWLEDGE
            </span>
            <button
              onClick={assess}
              disabled={assessing || profiles.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || profiles.length === 0) ? 0.4 : 1,
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
              { label: "PROFILES",   val: profiles.length,  color: C.neon    },
              { label: "ARTICLES",   val: articles.length,  color: C.blue    },
              { label: "RESEARCHED", val: researched,        color: "#4ADE80" },
              { label: "DARK",       val: dark,              color: "#FF8800" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
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

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && profiles.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No profiles match.</div>
            ) : visible.map((p) => (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${p.researched ? "#4ADE80" : "#FF8800"}`,
                  }}
                >
                  <span style={{ color: p.researched ? "#4ADE80" : "#FF8800", fontSize: 10, width: 10 }}>
                    {p.researched ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  {p.threat_level && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${THREAT_COLOR[p.threat_level.toLowerCase()] || C.blue}22`,
                      color: THREAT_COLOR[p.threat_level.toLowerCase()] || C.blue,
                      border: `1px solid ${THREAT_COLOR[p.threat_level.toLowerCase()] || C.blue}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {p.threat_level.toUpperCase()}
                    </span>
                  )}
                  <span style={{ color: p.researched ? "#4ADE80" : "#FF8800", fontSize: "9px", minWidth: 40, textAlign: "right" }}>
                    {p.researched ? `${p.articles.length} ART` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === p.id ? "▴" : "▾"}</span>
                </div>

                {expanded === p.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {p.researched ? p.articles.map((a) => (
                      <div key={a.id} style={{
                        display: "flex", justifyContent: "space-between",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap" }}>
                          rel:{a.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No knowledge articles found for this intel profile — intelligence blind spot.
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
            /entities/IntelProfile · /knowledge/ · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
