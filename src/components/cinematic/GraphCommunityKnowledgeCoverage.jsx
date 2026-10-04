/**
 * F150 — Graph Community × Knowledge Coverage (GCKNOW)
 *
 * Parallel-fetches /v1/graph/communities + /knowledge/, then
 * keyword-correlates each network cluster (label/members/summary)
 * against knowledge-base articles to surface:
 *
 *   BACKED — at least one KB article covers this community's domain
 *   DARK   — no knowledge-base backing — intelligence gap
 *
 * Stat tiles: communities / KB articles / backed / dark
 * Filter tabs: ALL | BACKED | DARK + text search
 * Expand any cluster → matched KB articles with category badge + relevance score bar.
 * Amber badge on DARK count.
 * ▶ ASSESS: 2-sentence community-knowledge coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ GCKNOW  at bottom:8 left:712640, zIndex:301.
 * Event:   jarvis:gcknow-toggle
 * Voice:   "community knowledge / knowledge community / gcknow /
 *           backed community / dark community / community kb coverage /
 *           community knowledge gap / which communities have knowledge /
 *           community knowledge coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 712640;
const POLL_MS  = 90_000;
const AMBER    = "#F59E0B";
const SLATE    = "#6E8AA0";
const BLUE     = "#60A5FA";
const VIOLET   = "#A78BFA";
const GREEN    = "#34D399";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const GCKNOW_RE =
  /\b(communit\w*\s+knowledge|knowledge\s+communit\w*|gcknow|backed\s+communit\w*|dark\s+communit\w*|communit\w*\s+kb|communit\w*\s+knowledge\s+gap|communit\w*\s+knowledge\s+coverage|which\s+communities\s+have\s+knowledge|community\s+knowledge\s+coverage)\b/i;

export function isGcknowQuery(q) { return GCKNOW_RE.test(q); }

export async function buildGcknowScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [commRes, kbRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/knowledge/`,           { headers: hdr }),
    ]);
    const communities = normaliseCommunities(await commRes.json());
    const articles    = normaliseArticles(await kbRes.json());

    const backed = communities.filter(
      (c) => articles.some((a) => relevance(c, a) > 0)
    ).length;
    const dark = communities.length - backed;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS community knowledge coverage brief: ${communities.length} graph communities ` +
          `correlated against ${articles.length} knowledge-base articles. ` +
          `${backed} communities are BACKED (at least one KB article covers their domain); ` +
          `${dark} communities remain DARK (no knowledge-base documentation — intelligence gap). ` +
          `Provide a 2-sentence community-knowledge coverage assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Community knowledge coverage analysis complete, sir.").trim();
  } catch {
    return "Community knowledge coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.communities)
    ? raw.communities
    : Array.isArray(raw?.clusters)
    ? raw.clusters
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.items)
    ? raw.items
    : [];
  return arr.map((c, i) => ({
    id:      c.id        || c.community_id  || String(i),
    label:   c.label     || c.name          || c.title     || `Community ${i + 1}`,
    members: Array.isArray(c.members) ? c.members.join(" ") : (c.members || ""),
    summary: (c.summary  || c.description   || c.notes     || "").toString().slice(0, 300),
    size:    c.size      || (Array.isArray(c.members) ? c.members.length : 0) || 0,
  }));
}

function normaliseArticles(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.articles)
    ? raw.articles
    : Array.isArray(raw?.knowledge)
    ? raw.knowledge
    : Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
    ? raw.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || String(i),
    label:    a.title    || a.name     || a.subject  || `Article ${i + 1}`,
    category: a.category || a.type     || a.kind     || "KB",
    tokens:   tok(
      `${a.title || ""} ${a.name || ""} ${a.summary || ""} ${a.description || ""} ${(a.tags || []).join(" ")} ${a.content || ""}`
    ),
  }));
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function relevance(community, article) {
  const cw = tok(`${community.label} ${community.members} ${community.summary}`);
  const av = new Set(article.tokens);
  return cw.filter((w) => av.has(w)).length;
}

function buildLinked(communities, articles) {
  return communities.map((c) => {
    const matched = articles
      .map((a) => ({ ...a, score: relevance(c, a) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    return { ...c, articles: matched, backed: matched.length > 0 };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "BACKED", "DARK"];

export default function GraphCommunityKnowledgeCoverage() {
  const [open,        setOpen]        = useState(false);
  const [communities, setCommunities] = useState([]);
  const [articles,    setArticles]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [commRes, kbRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/knowledge/`,           { headers: hdr }),
      ]);
      setCommunities(normaliseCommunities(await commRes.json()));
      setArticles(normaliseArticles(await kbRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:gcknow-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcknow-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildGcknowScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked  = buildLinked(communities, articles);
  const backed  = linked.filter((c) => c.backed).length;
  const dark    = linked.length - backed;

  const displayed = linked.filter((c) => {
    if (filter === "BACKED" && !c.backed) return false;
    if (filter === "DARK"   && c.backed)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return c.label.toLowerCase().includes(q) || c.members.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Graph Community × Knowledge Coverage (GCKNOW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 301,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {dark > 0
          ? (
            <>
              <span style={{
                background: AMBER, color: "#04060A", borderRadius: 4,
                padding: "0 4px", marginRight: 4, fontWeight: 700,
              }}>
                {dark}
              </span>
              ◈ GCKNOW
            </>
          )
          : "◈ GCKNOW"
        }
      </button>
    );
  }

  const TILE = {
    flex: "1 1 100px", background: "rgba(255,255,255,0.04)",
    borderRadius: 8, padding: "10px 12px", textAlign: "center",
  };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 301,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px", borderBottom: `1px solid ${AMBER}33`,
      }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ GCKNOW</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>COMMUNITY × KNOWLEDGE COVERAGE</span>
        {lastFetch && (
          <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>
        )}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button
          onClick={() => setOpen(false)}
          style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
        >✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "flex", gap: 8, padding: "10px 14px",
        borderBottom: `1px solid ${AMBER}22`,
      }}>
        {[
          { label: "COMMUNITIES", value: linked.length,    col: BLUE   },
          { label: "KB ARTICLES", value: articles.length,  col: VIOLET },
          { label: "BACKED",      value: backed,           col: GREEN  },
          { label: "DARK",        value: dark,             col: AMBER  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{
        display: "flex", gap: 6, padding: "8px 14px",
        borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap",
      }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            style={{
              background: filter === t ? `${AMBER}22` : "none",
              border: `1px solid ${filter === t ? AMBER : SLATE}`,
              color: filter === t ? AMBER : SLATE,
              borderRadius: 5, padding: "2px 8px", fontSize: 9,
              cursor: "pointer", letterSpacing: 1,
            }}
          >{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search communities…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: "none", border: `1px solid ${AMBER}`,
            color: AMBER, borderRadius: 5, padding: "2px 8px",
            fontSize: 9, cursor: "pointer", letterSpacing: 1,
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* community list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No communities match the current filter.
          </div>
        )}
        {displayed.map((c) => {
          const isExp  = expanded === c.id;
          const col    = c.backed ? GREEN : AMBER;
          const badge  = c.backed ? "BACKED" : "DARK";
          return (
            <div key={c.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${c.backed ? `${GREEN}44` : `${AMBER}44`}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1,
                  padding: "1px 5px", borderRadius: 4,
                  background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{c.label}</span>
                {c.size > 0 && (
                  <span style={{ fontSize: 8, color: SLATE }}>{c.size} nodes</span>
                )}
                {c.backed && (
                  <span style={{ fontSize: 8, color: GREEN }}>
                    {c.articles.length} article{c.articles.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{
                  margin: "4px 0 4px 12px", padding: "8px 10px",
                  borderRadius: 7, background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${AMBER}22`,
                }}>
                  {c.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {c.summary.slice(0, 120)}
                    </div>
                  )}
                  {c.articles.length === 0 ? (
                    <div style={{ fontSize: 9, color: AMBER }}>
                      No knowledge-base articles currently cover this community's domain.
                    </div>
                  ) : (
                    c.articles.map((a, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          marginBottom: 5, padding: "4px 8px", borderRadius: 5,
                          background: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px",
                          borderRadius: 4, background: `${VIOLET}22`, color: VIOLET,
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {String(a.category).toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{
                          flex: 1, fontSize: 9, color: "#DCEBF5",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {a.label}
                        </span>
                        <div style={{
                          width: 60, height: 4, borderRadius: 2,
                          background: "rgba(255,255,255,0.08)", flexShrink: 0,
                        }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: AMBER,
                            width: `${Math.min(100, a.score * 20)}%`,
                          }} />
                        </div>
                        <span style={{ fontSize: 8, color: AMBER, flexShrink: 0 }}>{a.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
