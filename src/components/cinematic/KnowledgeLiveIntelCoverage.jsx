/**
 * F96 — Knowledge × Live Intel Coverage (KBLIVE)
 *
 * Parallel-fetches /knowledge/ + /functions/getLiveIntel (quakes/crypto/FX),
 * then keyword-correlates each KB article against live world events to surface:
 *
 *   TRIGGERED — at least one live world event aligns with this article's topic
 *   DORMANT   — no current live signal matches this article's domain
 *
 * Stat tiles: KB articles / live events / triggered / dormant
 * Filter tabs: ALL | TRIGGERED | DORMANT + text search
 * Expand any article → matched live events with SEISMIC/CRYPTO/FX type badge +
 *   relevance score bar.
 * Amber badge on TRIGGERED count.
 * ▶ ASSESS: 2-sentence knowledge-world relevance brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ KBLIVE  at bottom:8 left:695840, zIndex:271.
 * Event:   jarvis:kblive-toggle
 * Voice:   "knowledge live / live knowledge / kblive / triggered knowledge /
 *           live kb / kb world event / knowledge world event / active kb /
 *           knowledge live intel / live intel knowledge"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 695840;
const POLL_MS  = 60_000;
const AMBER    = "#F59E0B";
const BLUE     = "#60A5FA";
const VIOLET   = "#A78BFA";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const CYAN     = "#22D3EE";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const KBLIVE_RE =
  /\b(knowledge[_\s-]?live(\s+intel)?|live[_\s-]?knowledge|kblive|triggered[_\s-]?knowledge|live[_\s-]?kb|kb[_\s-]?world[_\s-]?event[s]?|knowledge[_\s-]?world[_\s-]?event[s]?|active[_\s-]?kb|knowledge[_\s-]?live[_\s-]?intel|live[_\s-]?intel[_\s-]?knowledge|which[_\s-]?kb[_\s-]?articles?\s+are\s+live)\b/i;

export function isKbliveQuery(q) { return KBLIVE_RE.test(q); }

export async function buildKbliveScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [kbRes, liveRes] = await Promise.all([
      fetch(`${base}/knowledge/`,            { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
    ]);
    const articles = normaliseArticles(await kbRes.json());
    const events   = normaliseIntel(await liveRes.json());

    const triggered = articles.filter(
      (a) => events.some((ev) => relevance(a, ev) > 0)
    ).length;
    const dormant = articles.length - triggered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS knowledge live-intel brief: ${articles.length} knowledge base articles ` +
          `correlated against ${events.length} live world signals (seismic/crypto/FX). ` +
          `${triggered} articles are TRIGGERED (live world event aligns with article topic); ` +
          `${dormant} articles remain DORMANT (no current live signal matches their domain). ` +
          `Provide a 2-sentence knowledge-world relevance assessment — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Knowledge live-intel correlation complete, sir.").trim();
  } catch {
    return "Knowledge live-intel coverage unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArticles(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["articles", "knowledge", "items", "results", "data"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function normaliseIntel(raw) {
  if (!raw) return [];
  const out = [];
  if (raw.earthquakes) {
    for (const e of (Array.isArray(raw.earthquakes) ? raw.earthquakes : [])) {
      const place = e.place || e.location || "";
      const mag   = e.magnitude || e.mag || "";
      out.push({
        type:   "SEISMIC",
        label:  `M${mag} ${place}`.trim(),
        tokens: tok(`${place} earthquake seismic quake tectonic geological disaster`),
      });
    }
  }
  if (raw.crypto) {
    for (const c of (Array.isArray(raw.crypto) ? raw.crypto : [])) {
      const sym = c.symbol || c.name || "";
      out.push({
        type:   "CRYPTO",
        label:  sym,
        tokens: tok(`${sym} crypto bitcoin blockchain digital currency asset finance market`),
      });
    }
  }
  if (raw.fx) {
    for (const f of (Array.isArray(raw.fx) ? raw.fx : [])) {
      const pair = f.pair || f.symbol || f.name || "";
      out.push({
        type:   "FX",
        label:  pair,
        tokens: tok(`${pair} forex currency exchange rate finance market trade economics`),
      });
    }
  }
  return out;
}

function tok(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function artTokens(article) {
  return [
    ...tok(article.title   || ""),
    ...tok(article.name    || ""),
    ...tok(article.summary || ""),
    ...tok(article.description || ""),
    ...tok(article.category    || ""),
    ...tok(article.type        || ""),
    ...tok(Array.isArray(article.tags) ? article.tags.join(" ") : (article.tags || "")),
    ...tok(article.content     || ""),
  ].filter(Boolean);
}

function relevance(article, event) {
  const aToks = new Set(artTokens(article));
  return event.tokens.filter((w) => aToks.has(w)).length;
}

function typeColor(type) {
  if (type === "SEISMIC") return AMBER;
  if (type === "CRYPTO")  return VIOLET;
  if (type === "FX")      return GREEN;
  return SLATE;
}

function buildLinked(articles, events) {
  return articles.map((a, i) => {
    const matched = events
      .map((ev) => ({ ...ev, score: relevance(a, ev) }))
      .filter((ev) => ev.score > 0)
      .sort((ev1, ev2) => ev2.score - ev1.score)
      .slice(0, 6);
    return {
      id:        a.id       || String(i),
      label:     a.title    || a.name    || `Article ${i + 1}`,
      category:  (a.category || a.type  || "KB").toString().toUpperCase(),
      summary:   (a.summary  || a.description || "").toString().slice(0, 200),
      events:    matched,
      triggered: matched.length > 0,
    };
  });
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "DORMANT"];

export default function KnowledgeLiveIntelCoverage() {
  const [open,      setOpen]      = useState(false);
  const [articles,  setArticles]  = useState([]);
  const [events,    setEvents]    = useState([]);
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
      const [kbRes, liveRes] = await Promise.all([
        fetch(`${base}/knowledge/`,            { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      ]);
      setArticles(normaliseArticles(await kbRes.json()));
      setEvents(normaliseIntel(await liveRes.json()));
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
    window.addEventListener("jarvis:kblive-toggle", onToggle);
    return () => window.removeEventListener("jarvis:kblive-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildKbliveScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(articles, events);
  const triggered = linked.filter((a) =>  a.triggered).length;
  const dormant   = linked.length - triggered;

  const displayed = linked.filter((a) => {
    if (filter === "TRIGGERED" && !a.triggered) return false;
    if (filter === "DORMANT"   && a.triggered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Knowledge × Live Intel Coverage (KBLIVE)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 271,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {triggered > 0
          ? <><span style={{ background: AMBER, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{triggered}</span>◈ KBLIVE</>
          : "◈ KBLIVE"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 90px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 271,
      width: 480, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ KBLIVE</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>KNOWLEDGE × LIVE INTEL COVERAGE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "KB ARTICLES", value: linked.length,   col: BLUE   },
          { label: "LIVE EVENTS", value: events.length,   col: CYAN   },
          { label: "TRIGGERED",   value: triggered,       col: AMBER  },
          { label: "DORMANT",     value: dormant,         col: SLATE  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : SLATE}`,
            color: filter === t ? AMBER : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* article list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No articles match the current filter.
          </div>
        )}
        {displayed.map((a) => {
          const isExp = expanded === a.id;
          const col   = a.triggered ? AMBER : SLATE;
          const badge = a.triggered ? "TRIGGERED" : "DORMANT";
          return (
            <div key={a.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : a.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${a.triggered ? `${AMBER}44` : "#6E8AA033"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{
                  fontSize: 8, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                  background: "rgba(255,255,255,0.06)", color: BLUE,
                }}>
                  {a.category.slice(0, 8)}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.label}
                </span>
                {a.triggered && (
                  <span style={{ fontSize: 8, color: AMBER, flexShrink: 0 }}>
                    {a.events.length} event{a.events.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {a.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {a.summary.slice(0, 150)}
                    </div>
                  )}
                  {a.events.length === 0 ? (
                    <div style={{ fontSize: 9, color: SLATE }}>No live world events currently align with this article's domain.</div>
                  ) : (
                    a.events.map((ev, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${typeColor(ev.type)}22`, color: typeColor(ev.type),
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {ev.type}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.label}
                        </span>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", flexShrink: 0 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: typeColor(ev.type), width: `${Math.min(100, ev.score * 25)}%` }} />
                        </div>
                        <span style={{ fontSize: 8, color: typeColor(ev.type), flexShrink: 0 }}>{ev.score}</span>
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
