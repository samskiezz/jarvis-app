/**
 * F96 — IntelProfile × Knowledge Coverage (IPKC)
 *
 * Answers: "Which intelligence profiles are documented in the knowledge base,
 *           and which remain undocumented knowledge gaps?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/IntelProfile  → active intelligence profiles
 *   GET /knowledge/             → KB articles catalog
 *
 * Each IntelProfile's name/aliases/role/organization/tags is keyword-matched
 * against each KB article's title/summary/content/tags/category to produce:
 *   DOCUMENTED   — at least one KB article covers this intel profile
 *   UNDOCUMENTED — no KB article covers this intel profile
 *
 * Stat tiles:  profiles / articles / documented / undocumented
 * Amber badge: undocumented count on button (knowledge gaps).
 * Expand row:  matched KB articles with topic badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPKC  at left:3180 bottom:18, zIndex:68.
 * Event:   jarvis:ipkc-toggle
 * Voice:   "intel profile knowledge / profile kb / ipkc / documented profiles /
 *           undocumented intel / intel knowledge gap / profile knowledge coverage /
 *           which intel profiles have kb / intel kb / profile documentation"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3180;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))              return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data))  return raw.data;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean);
}

function tokenSet(obj, fields) {
  return new Set(fields.flatMap(f => tokens(obj[f])));
}

function score(profileToks, articleToks) {
  let hits = 0;
  for (const t of profileToks) if (articleToks.has(t) && t.length > 2) hits++;
  return hits;
}

function correlate(profiles, articles) {
  return profiles.map(p => {
    const pToks = new Set([
      ...tokens(p.name),
      ...tokens(p.role),
      ...tokens(p.organization),
      ...(p.aliases || []).flatMap(tokens),
      ...(p.tags || []).flatMap(tokens),
    ].filter(t => t.length > 2));

    const matches = articles
      .map(a => {
        const aToks = tokenSet(a, ["title", "summary", "content", "tags", "category", "topic"]);
        const s = score(pToks, aToks);
        return s > 0 ? { article: a, score: s } : null;
      })
      .filter(Boolean)
      .sort((x, y) => y.score - x.score)
      .slice(0, 8);

    return { profile: p, matches, status: matches.length > 0 ? "DOCUMENTED" : "UNDOCUMENTED" };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const IPKC_RE = /\b(ipkc|intel\s+profile\s+knowledge|profile\s+kb|intel\s+kb|intel\s+knowledge\s+gap|profile\s+knowledge|documented\s+profiles|undocumented\s+intel|intel\s+kb\s+coverage|which\s+intel\s+profiles\s+have\s+kb|profile\s+documentation)\b/i;

export function isIpkcQuery(q) { return IPKC_RE.test(q); }

export async function buildIpkcScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [pr, kr] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/knowledge/`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const profiles = normArr(pr);
    const articles = normArr(kr);
    const rows = correlate(profiles, articles);
    const documented   = rows.filter(r => r.status === "DOCUMENTED").length;
    const undocumented = rows.filter(r => r.status === "UNDOCUMENTED").length;
    return `IPKC: ${profiles.length} profiles vs ${articles.length} KB articles. ${documented} documented, ${undocumented} undocumented.`;
  } catch {
    return "IPKC data unavailable.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function IntelProfileKnowledgeCoverage() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [rows, setRows]         = useState([]);
  const [articles, setArticles] = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [pr, kr] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`, { headers }).then(r => r.json()).catch(() => []),
      ]);
      const profiles = normArr(pr);
      const arts = normArr(kr);
      setArticles(arts);
      setRows(correlate(profiles, arts));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = e => {
      setOpen(v => !v);
      if (e?.detail?.query) setBrief("");
    };
    window.addEventListener("jarvis:ipkc-toggle", h);
    return () => window.removeEventListener("jarvis:ipkc-toggle", h);
  }, []);

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const documented   = rows.filter(r => r.status === "DOCUMENTED").length;
      const undocumented = rows.filter(r => r.status === "UNDOCUMENTED").length;
      const q = `JARVIS IPKC assessment: ${rows.length} intel profiles vs ${articles.length} KB articles. ${documented} documented, ${undocumented} undocumented. Provide a 2-sentence intelligence knowledge coverage brief.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: q }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const documented   = rows.filter(r => r.status === "DOCUMENTED").length;
  const undocumented = rows.filter(r => r.status === "UNDOCUMENTED").length;

  const visible = rows.filter(r => {
    if (filter === "DOCUMENTED"   && r.status !== "DOCUMENTED")   return false;
    if (filter === "UNDOCUMENTED" && r.status !== "UNDOCUMENTED") return false;
    if (search) {
      const q = search.toLowerCase();
      const p = r.profile;
      return (p.name || "").toLowerCase().includes(q) ||
             (p.role || "").toLowerCase().includes(q) ||
             (p.organization || "").toLowerCase().includes(q);
    }
    return true;
  });

  const maxScore = Math.max(1, ...rows.flatMap(r => r.matches.map(m => m.score)));

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="IntelProfile × Knowledge Coverage (IPKC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? CY : "rgba(4,7,14,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}88`,
          borderRadius: 7, padding: "3px 9px", fontSize: 10,
          fontFamily: MONO, letterSpacing: 1, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}>
        ◈ IPKC
        {undocumented > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#04060A",
            borderRadius: 4, padding: "0 4px", fontSize: 9, fontWeight: 700,
          }}>{undocumented}</span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", left: BTN_LEFT - 340, bottom: 52, zIndex: 120,
          width: 440, maxHeight: "70vh",
          background: BG, border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "14px 16px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${CY}18`,
          fontFamily: MONO, color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 10,
          overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ INTEL PROFILE × KNOWLEDGE COVERAGE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
            {[
              { label: "PROFILES",      value: rows.length,  color: CY    },
              { label: "ARTICLES",      value: articles.length, color: CY },
              { label: "DOCUMENTED",    value: documented,   color: GREEN  },
              { label: "UNDOCUMENTED",  value: undocumented, color: AMBER  },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6,
                padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? CY : "rgba(255,255,255,0.05)",
                color: filter === f ? "#04060A" : MUTED,
                border: "none", borderRadius: 5, padding: "2px 8px",
                fontSize: 9, letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
              }}>{f}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.05)",
                border: `1px solid ${CY}33`, borderRadius: 5,
                color: "#DCEBF5", padding: "2px 8px", fontSize: 10,
                fontFamily: MONO, outline: "none", width: 120,
              }} />
          </div>

          {/* loading */}
          {loading && (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center" }}>
              Correlating intel profiles against KB…
            </div>
          )}

          {/* rows */}
          {!loading && visible.map((r, i) => {
            const p = r.profile;
            const isEx = expanded === i;
            const statusColor = r.status === "DOCUMENTED" ? GREEN : AMBER;
            return (
              <div key={p.id || p.name || i} style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 8,
                padding: "8px 10px", cursor: "pointer",
                border: `1px solid ${statusColor}22`,
              }} onClick={() => setExpanded(isEx ? null : i)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    background: statusColor + "22", color: statusColor,
                    borderRadius: 4, padding: "1px 6px", fontSize: 9, letterSpacing: 1,
                  }}>{r.status}</span>
                  <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name || p.id || "—"}
                  </span>
                  {p.role && (
                    <span style={{ color: MUTED, fontSize: 9 }}>{p.role}</span>
                  )}
                  <span style={{ color: MUTED, fontSize: 10 }}>{isEx ? "▲" : "▼"}</span>
                </div>

                {/* expanded: matched articles */}
                {isEx && r.matches.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {r.matches.map((m, j) => {
                      const a = m.article;
                      const pct = Math.round((m.score / maxScore) * 100);
                      return (
                        <div key={a.id || a.title || j} style={{
                          background: "rgba(255,255,255,0.04)", borderRadius: 5,
                          padding: "5px 8px",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            {(a.category || a.topic) && (
                              <span style={{
                                background: CY + "22", color: CY,
                                borderRadius: 3, padding: "0 4px", fontSize: 8, letterSpacing: 1,
                              }}>{(a.category || a.topic || "").toUpperCase()}</span>
                            )}
                            <span style={{ fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {a.title || a.id || "—"}
                            </span>
                            <span style={{ color: MUTED, fontSize: 9 }}>score {m.score}</span>
                          </div>
                          <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: GREEN, borderRadius: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {isEx && r.status === "UNDOCUMENTED" && (
                  <div style={{ marginTop: 6, color: AMBER, fontSize: 9, letterSpacing: 1 }}>
                    No KB articles matched this intel profile.
                  </div>
                )}
              </div>
            );
          })}

          {!loading && visible.length === 0 && (
            <div style={{ color: MUTED, fontSize: 10, textAlign: "center" }}>No profiles match filter.</div>
          )}

          {/* assess button */}
          <button onClick={assess} disabled={assessing || rows.length === 0} style={{
            background: assessing ? "rgba(41,231,255,0.1)" : CY + "22",
            border: `1px solid ${CY}55`, color: CY,
            borderRadius: 6, padding: "5px 10px", fontSize: 10,
            letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
          }}>
            {assessing ? "Assessing…" : "▶ ASSESS"}
          </button>
          {brief && (
            <div style={{
              background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
              borderRadius: 6, padding: "8px 10px", fontSize: 10, lineHeight: 1.5, color: "#DCEBF5",
            }}>{brief}</div>
          )}
        </div>
      )}
    </>
  );
}
