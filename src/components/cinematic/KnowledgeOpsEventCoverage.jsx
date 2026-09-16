/**
 * F134 — Knowledge × Ops Event Coverage (KBOPS)
 *
 * Parallel-fetches /knowledge/ KB articles + /v1/ops/events.
 * Keyword-correlates each ops event (name/type/description/category/tags)
 * against KB articles to surface:
 *   INFORMED — at least one KB article backs this ops event's domain
 *   BLIND    — no KB backing — knowledge gap
 *
 * Stat tiles: ops events / KB articles / informed / blind
 * Filter tabs: ALL / INFORMED / BLIND
 * Ops event rows expand to show matched KB articles with relevance score.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops-knowledge coverage brief + TTS.
 * 90-s auto-refresh.
 *
 * Toggle: ◈ KBOPS at bottom:8, left:708160, zIndex:293
 * Voice:  "ops knowledge" / "knowledge ops" / "kbops" / "informed ops" /
 *         "blind ops" / "ops knowledge gap" / "knowledge backed ops" /
 *         "which ops events have knowledge"
 * Event:  jarvis:kbops-toggle
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#F5A623";
const BTN_LEFT   = 708160;
const REFRESH_MS = 90 * 1000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.items))   return raw.items;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.data))    return raw.data;
  if (Array.isArray(raw.articles)) return raw.articles;
  if (Array.isArray(raw.events))  return raw.events;
  if (typeof raw === "object") return Object.values(raw);
  return [];
}

function normaliseKB(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:       a.id       || a.slug  || String(i),
    title:    a.title    || a.name  || a.label || `Article ${i + 1}`,
    category: a.category || a.type  || a.domain || "",
    summary:  (a.summary || a.content || a.body || a.abstract || a.description || "")
      .toString().slice(0, 400),
    tags:     Array.isArray(a.tags) ? a.tags.join(" ") : (a.tags || ""),
  }));
}

function normaliseOps(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:          e.id || e.event_id || String(i),
    name:        e.name || e.title || e.event_name || e.type || `Event ${i + 1}`,
    type:        e.type || e.event_type || e.kind || "",
    severity:    e.severity || e.level || e.priority || "",
    description: (e.description || e.summary || e.details || e.message || "").toString().slice(0, 300),
    category:    e.category || e.domain || "",
    tags:        Array.isArray(e.tags) ? e.tags.join(" ") : (e.tags || ""),
  }));
}

// ── keyword correlation ───────────────────────────────────────────────────────

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4);
}

function opsKeywords(ev) {
  return new Set([
    ...keywords(ev.name),
    ...keywords(ev.type),
    ...keywords(ev.description),
    ...keywords(ev.category),
    ...keywords(ev.tags),
  ]);
}

function articleKeywords(art) {
  return [
    ...keywords(art.title),
    ...keywords(art.category),
    ...keywords(art.summary),
    ...keywords(art.tags),
  ];
}

function matchArticlesToEvent(ev, articles) {
  const evKw = opsKeywords(ev);
  if (evKw.size === 0) return [];
  return articles
    .map((art) => {
      const aKw = articleKeywords(art);
      const hits = aKw.filter((kw) => evKw.has(kw));
      return { art, score: hits.length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ── exported helpers for JarvisBrain ────────────────────────────────────────

const KBOPS_RE =
  /\b(ops[._-]?knowledge|knowledge[._-]?ops|kbops|informed[._-]?ops|blind[._-]?ops|ops[._-]?knowledge[._-]?gap|knowledge[._-]?backed[._-]?ops|which[._-]?ops[._-]?events?[._-]?(have|match)[._-]?knowledge|ops[._-]?kb|kb[._-]?ops|ops[._-]?docs?)\b/i;

export function isKbopsQuery(q) {
  return KBOPS_RE.test(q || "");
}

export async function buildKbopsScript() {
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [kbR, opsR] = await Promise.allSettled([
      fetch(`${apiBase()}/knowledge/`, { headers: hdr }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/ops/events`, { headers: hdr }).then((r) => r.json()),
    ]);
    const articles = normaliseKB(kbR.status === "fulfilled" ? kbR.value : []);
    const events   = normaliseOps(opsR.status === "fulfilled" ? opsR.value : []);
    const informed = events.filter((ev) => matchArticlesToEvent(ev, articles).length > 0);
    const blind    = events.length - informed.length;
    window.dispatchEvent(new CustomEvent("jarvis:kbops-toggle"));
    return (
      `Knowledge × Ops Event Coverage open, sir. ${events.length} ops event${events.length !== 1 ? "s" : ""} cross-matched ` +
      `against ${articles.length} KB article${articles.length !== 1 ? "s" : ""}. ` +
      `${informed.length} event${informed.length !== 1 ? "s are" : " is"} INFORMED by the knowledge base; ` +
      `${blind} remain${blind !== 1 ? "" : "s"} BLIND with no KB backing. ` +
      `Expand any event to inspect matched articles or request an AI ops-knowledge brief, sir.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:kbops-toggle"));
    return "Opening Knowledge × Ops Event Coverage, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KnowledgeOpsEventCoverage() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [articles,  setArticles]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [kbR, opsR] = await Promise.allSettled([
        fetch(`${apiBase()}/knowledge/`, { headers: hdr }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/ops/events`, { headers: hdr }).then((r) => r.json()),
      ]);
      const rawArticles = normaliseKB(kbR.status  === "fulfilled" ? kbR.value  : []);
      const rawEvents   = normaliseOps(opsR.status === "fulfilled" ? opsR.value : []);
      const enriched = rawEvents.map((ev) => ({
        ...ev,
        matched: matchArticlesToEvent(ev, rawArticles),
      }));
      setArticles(rawArticles);
      setEvents(enriched);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:kbops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kbops-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(ev) {
    setAssessing(ev.id);
    try {
      const artNames = ev.matched.map((m) => m.art.title).join(", ") || "none";
      const prompt =
        `Ops event "${ev.name}" (severity: ${ev.severity || "unknown"}, type: ${ev.type || "unknown"}) ` +
        `has ${ev.matched.length} KB article${ev.matched.length !== 1 ? "s" : ""}: ${artNames}. ` +
        `Provide a 2-sentence ops-knowledge coverage assessment: does the knowledge base adequately brief operators on this event domain?`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {}
    setAssessing(null);
  }

  const informed = events.filter((ev) => ev.matched.length > 0);
  const blind    = events.filter((ev) => ev.matched.length === 0);

  const base =
    tab === "INFORMED" ? informed :
    tab === "BLIND"    ? blind :
    events;

  const filtered = search.trim()
    ? base.filter((ev) =>
        [ev.name, ev.type, ev.description, ev.category, ev.tags]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      )
    : base;

  const severityColor = (s) => {
    const v = String(s || "").toLowerCase();
    if (v === "critical") return "#FF3D5A";
    if (v === "warning")  return AMBER;
    if (v === "info")     return CY;
    return "#445566";
  };

  return (
    <>
      {/* toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Knowledge × Ops Event Coverage (F134)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 293,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: 4,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ KBOPS
        {blind.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7,
          }}>
            {blind.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 293,
          width: "min(540px, 94vw)", maxHeight: "80vh",
          background: "rgba(4,10,20,0.94)",
          border: `1px solid ${CY}33`,
          borderTop: `2px solid ${CY}`,
          borderRadius: 10,
          boxShadow: `0 0 40px ${CY}18`,
          backdropFilter: "blur(12px)",
          display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, fontSize: 12 }}>◈</span>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>KNOWLEDGE × OPS EVENT COVERAGE</span>
            </div>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#556677",
              cursor: "pointer", fontSize: 14, padding: 0,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>
            {[
              { label: "OPS EVENTS", val: events.length,   color: CY },
              { label: "KB ARTICLES", val: articles.length, color: "#A78BFA" },
              { label: "INFORMED",   val: informed.length,  color: GREEN },
              { label: "BLIND",      val: blind.length,     color: AMBER },
            ].map((t) => (
              <div key={t.label} style={{
                flex: 1, background: "rgba(255,255,255,0.03)",
                border: `1px solid ${t.color}22`, borderRadius: 5,
                padding: "5px 6px", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: t.color, fontWeight: 700 }}>
                  {loading ? "…" : t.val}
                </div>
                <div style={{ fontSize: 7, color: "#445566", letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", alignItems: "center" }}>
            {["ALL", "INFORMED", "BLIND"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#04060A" : "#445566",
                border: `1px solid ${tab === t ? CY : "#223344"}`,
                borderRadius: 3, padding: "2px 7px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>
                {t}
                {t === "INFORMED" && informed.length > 0 ? ` (${informed.length})` : ""}
                {t === "BLIND"    && blind.length    > 0 ? ` (${blind.length})`    : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: 4, flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #223344", borderRadius: 3,
                color: "#a0b8cc", padding: "2px 7px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                outline: "none",
              }}
            />
            <button onClick={load} style={{
              background: "transparent", color: "#445566",
              border: "1px solid #223344", borderRadius: 3,
              padding: "2px 6px", fontSize: 8,
              fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
            }}>↻</button>
          </div>

          {/* event list */}
          <div style={{ overflowY: "auto", padding: "0 10px 10px" }}>
            {loading && !events.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                loading…
              </div>
            )}
            {!loading && !filtered.length && (
              <div style={{ color: "#445566", fontSize: 10, padding: 20, textAlign: "center" }}>
                no ops events in this filter
              </div>
            )}
            {filtered.map((ev) => {
              const hasMatches = ev.matched.length > 0;
              const accent     = hasMatches ? GREEN : AMBER;
              const isExpanded = expanded === ev.id;
              return (
                <div key={ev.id} style={{
                  background: "rgba(255,255,255,0.025)",
                  border: `1px solid ${accent}22`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 5, padding: "8px 10px", marginBottom: 6,
                }}>
                  {/* event header */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#b0c8d8", fontSize: 11, marginBottom: 2 }}>{ev.name}</div>
                      {ev.description && (
                        <div style={{ color: "#445566", fontSize: 9, lineHeight: 1.4 }}>
                          {ev.description.slice(0, 100)}{ev.description.length > 100 ? "…" : ""}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                        {ev.type && (
                          <span style={{
                            fontSize: 7, color: CY,
                            border: `1px solid ${CY}33`, borderRadius: 2, padding: "1px 5px",
                          }}>{ev.type}</span>
                        )}
                        {ev.severity && (
                          <span style={{
                            fontSize: 7, color: severityColor(ev.severity),
                            border: `1px solid ${severityColor(ev.severity)}44`,
                            borderRadius: 2, padding: "1px 5px",
                          }}>{ev.severity.toUpperCase()}</span>
                        )}
                        {ev.category && (
                          <span style={{
                            fontSize: 7, color: "#445566",
                            border: "1px solid #334455", borderRadius: 2, padding: "1px 5px",
                          }}>{ev.category}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: accent, letterSpacing: 1, fontWeight: 700 }}>
                        {hasMatches ? "INFORMED" : "BLIND"}
                      </div>
                      {hasMatches && (
                        <div style={{ fontSize: 8, color: "#445566", marginTop: 2 }}>
                          {ev.matched.length} article{ev.matched.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* action row */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {hasMatches && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : ev.id)}
                        style={{
                          background: `${CY}12`, color: CY,
                          border: `1px solid ${CY}33`, borderRadius: 3,
                          padding: "3px 10px",
                          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                          letterSpacing: 1, cursor: "pointer",
                        }}
                      >
                        {isExpanded ? "▾ HIDE" : "▸ KB ARTICLES"}
                      </button>
                    )}
                    <button
                      onClick={() => assess(ev)}
                      disabled={assessing === ev.id}
                      style={{
                        background: assessing === ev.id ? "#1a2530" : `${accent}18`,
                        color: assessing === ev.id ? "#445566" : accent,
                        border: `1px solid ${accent}44`, borderRadius: 3,
                        padding: "3px 10px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                        letterSpacing: 1, cursor: assessing === ev.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === ev.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* expanded KB article list */}
                  {isExpanded && hasMatches && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}15` }}>
                      {ev.matched.map(({ art, score }) => (
                        <div key={art.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                        }}>
                          <div style={{ color: "#a0b8cc", fontSize: 10, marginBottom: 2 }}>{art.title}</div>
                          {art.summary && (
                            <div style={{ color: "#445566", fontSize: 8, lineHeight: 1.4 }}>
                              {art.summary.slice(0, 120)}{art.summary.length > 120 ? "…" : ""}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center" }}>
                            {art.category && (
                              <span style={{
                                fontSize: 7, color: "#A78BFA",
                                border: "1px solid #A78BFA33",
                                borderRadius: 2, padding: "1px 5px",
                              }}>{art.category}</span>
                            )}
                            <div style={{ flex: 1, height: 3, background: "#1e2a35", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{
                                width: `${Math.min(100, score * 20)}%`,
                                height: "100%", background: GREEN, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ fontSize: 7, color: "#334455" }}>score {score}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
