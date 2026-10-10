/**
 * F110 — Live Intel × Knowledge Nexus (LIKN)
 *
 * Parallel-fetches /functions/getLiveIntel and /knowledge/ every 60 s.
 * Keyword-correlates each KB article (title/content/topic/tags) against
 * live world events (crypto/FX/seismic) to classify:
 *
 *  LIVE    — article keywords match at least one current world event
 *  DORMANT — no live-world correlation found
 *
 * Answers: "which KB articles are relevant to what's happening RIGHT NOW?"
 *
 * Stat tiles: articles / live events / live-articles / dormant
 * Amber badge on live count.
 * Filter tabs: ALL / LIVE / DORMANT + text search.
 * Expand article row → matched events with CRYPTO/FX/SEISMIC badge + relevance score bar.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LIKN  at left:3720 bottom:18, zIndex:68.
 * Event:   jarvis:likn-toggle
 * Voice:   "live intel knowledge / knowledge nexus / likn / live kb /
 *           which knowledge is live / knowledge live intel / live articles /
 *           real-time knowledge / live world knowledge"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 3720;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const EVENT_TYPE_COLORS = { SEISMIC: RED, CRYPTO: PURP, FX: AMBER };

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseArticles(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:      String(a.id ?? a.article_id ?? i),
    title:   a.title ?? a.name ?? `Article ${i + 1}`,
    content: a.content ?? a.body ?? a.summary ?? a.text ?? "",
    topic:   a.topic ?? a.category ?? a.type ?? "",
    tags:    Array.isArray(a.tags) ? a.tags : [],
  }));
}

function normaliseLiveIntel(raw) {
  const events = [];
  const quakes = normaliseArray(raw?.earthquakes ?? raw?.seismic ?? []);
  quakes.forEach((q, i) => events.push({
    id:    `q-${i}`,
    type:  "SEISMIC",
    label: q.place ?? q.location ?? q.region ?? `M${q.magnitude ?? "?"} earthquake`,
    extra: q.magnitude ? `M${q.magnitude}` : "",
  }));
  const crypto = normaliseArray(raw?.crypto ?? raw?.cryptocurrency ?? raw?.prices ?? []);
  crypto.forEach((c, i) => events.push({
    id:    `c-${i}`,
    type:  "CRYPTO",
    label: `${c.symbol ?? c.name ?? c.pair ?? `Crypto ${i + 1}`}`,
    extra: c.change_pct != null ? `${c.change_pct > 0 ? "+" : ""}${Number(c.change_pct).toFixed(2)}%` : "",
  }));
  const fx = normaliseArray(raw?.fx ?? raw?.forex ?? raw?.rates ?? []);
  fx.forEach((f, i) => events.push({
    id:    `f-${i}`,
    type:  "FX",
    label: `${f.pair ?? f.symbol ?? f.currency ?? `FX ${i + 1}`}`,
    extra: f.rate != null ? String(Number(f.rate).toFixed(4)) : "",
  }));
  return events;
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(article, events) {
  const aTokens = new Set([
    ...tokenise(article.title),
    ...tokenise(article.content.slice(0, 500)),
    ...tokenise(article.topic),
    ...article.tags.flatMap(t => tokenise(t)),
  ]);
  const matches = [];
  for (const ev of events) {
    const evTokens = tokenise(ev.label);
    const hits = evTokens.filter(t => aTokens.has(t)).length;
    if (hits > 0) matches.push({ ...ev, score: hits });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [liRes, kbRes] = await Promise.all([
    fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
    fetch(`${base}/knowledge/`,             { headers: hdr }),
  ]);
  const liveIntel = normaliseLiveIntel(await liRes.json());
  const articles  = normaliseArticles(await kbRes.json());
  const enriched  = articles.map(a => {
    const matches = correlate(a, liveIntel);
    return { ...a, matches, state: matches.length > 0 ? "LIVE" : "DORMANT" };
  });
  return { articles: enriched, events: liveIntel };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isLiknQuery(q) {
  return /live.?intel.?knowledge|knowledge.?nexus|likn|live.?kb|which.?knowledge.*live|knowledge.?live.?intel|live.?articles|real.?time.?knowledge|live.?world.?knowledge/i.test(q);
}

export async function buildLiknScript() {
  try {
    const { articles, events } = await fetchAll();
    const live    = articles.filter(a => a.state === "LIVE");
    const topLive = live[0];
    const prompt = `JARVIS live intel × knowledge nexus (LIKN): ${articles.length} KB articles cross-referenced against ${events.length} live world events (seismic/crypto/FX). ${live.length} articles classified LIVE — their topics have real-world correlates right now.${topLive ? ` Top live article: "${topLive.title}" matched ${topLive.matches.length} event(s) (${topLive.matches[0]?.type ?? ""}). ` : " "}Summarise which knowledge domains are operationally live in exactly 2 sentences.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${live.length}/${articles.length} KB articles are LIVE against ${events.length} world events.`;
  } catch {
    return "Live intel × knowledge nexus data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "likn-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Article Row ──────────────────────────────────────────────────────────────

function ArticleRow({ article }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...article.matches.map(m => m.score));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${article.state === "LIVE" ? AMBER : MUTED}22`,
      background: article.state === "LIVE"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: article.state === "LIVE" ? AMBER : GREEN,
          border: `1px solid ${article.state === "LIVE" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 46, textAlign: "center",
        }}>
          {article.state === "LIVE" ? "LIVE" : "DORMANT"}
        </span>

        {article.topic && (
          <span style={{
            fontSize: 7, color: PURP, border: `1px solid ${PURP}44`,
            padding: "1px 4px", borderRadius: 2, whiteSpace: "nowrap",
            maxWidth: 60, overflow: "hidden", textOverflow: "ellipsis", flexShrink: 0,
          }}>
            {article.topic.slice(0, 8)}
          </span>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {article.title}
          </div>
        </div>

        {article.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {article.matches.length} ev{article.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {article.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No live-world correlates found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED LIVE EVENTS
              </div>
              {article.matches.slice(0, 6).map((m, idx) => {
                const barPct = Math.round((m.score / maxScore) * 100);
                const typeColor = EVENT_TYPE_COLORS[m.type] ?? CY;
                return (
                  <div key={`${m.id}-${idx}`} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${typeColor}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700, color: typeColor,
                        border: `1px solid ${typeColor}66`,
                        padding: "1px 4px", borderRadius: 2,
                        width: 44, textAlign: "center", flexShrink: 0,
                      }}>
                        {m.type}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.label}
                      </span>
                      {m.extra && (
                        <span style={{ fontSize: 7, color: typeColor, fontWeight: 700, flexShrink: 0 }}>
                          {m.extra}
                        </span>
                      )}
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    <div style={{ height: 3, background: `${typeColor}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: typeColor, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {article.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{article.matches.length - 6} more event{article.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "LIVE", "DORMANT"];

export default function LiveIntelKnowledgeNexus() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchAll());
    } catch (e) {
      setError(String(e));
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
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:likn-toggle", h);
    return () => window.removeEventListener("jarvis:likn-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildLiknScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const articles = data?.articles ?? [];
  const events   = data?.events   ?? [];
  const live     = articles.filter(a => a.state === "LIVE");

  const visible = articles
    .filter(a => tab === "ALL" || a.state === tab)
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.topic.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes likn-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Live Intel × Knowledge Nexus (LIKN)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ LIKN
          {live.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "likn-pulse 1.4s ease-in-out infinite",
            }}>
              {live.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes likn-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      <button
        onClick={() => setOpen(false)}
        title="Close LIKN"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ LIKN ▲
      </button>

      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO,
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ LIVE INTEL × KNOWLEDGE NEXUS
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="KB ARTICLES"  value={articles.length}                accent={CY} />
          <StatTile label="LIVE EVENTS"  value={events.length}                  accent={PURP} />
          <StatTile label="LIVE"         value={live.length}                    accent={AMBER}
            pulse={live.length > 0} />
          <StatTile label="DORMANT"      value={articles.length - live.length}  accent={GREEN} />
        </div>

        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
                color: tab === t ? "#000" : MUTED,
                fontFamily: MONO, fontSize: 7, fontWeight: 700,
                padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search articles…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {articles.length === 0 ? "No KB articles loaded." : "No articles match filter."}
            </div>
          ) : (
            visible.map(a => <ArticleRow key={a.id} article={a} />)
          )}
        </div>
      </div>
    </>
  );
}
