/**
 * KnowledgeFreshnessPanel — F172
 *
 * Polls /knowledge/ every 5 min and surfaces articles that haven't been
 * updated recently — surfacing corpus staleness at a glance.
 *
 * Staleness buckets:
 *   GREEN  — updated within 7 days
 *   YELLOW — 7–30 days
 *   RED    — >30 days or no timestamp (needs refresh)
 *
 * Sorted oldest-first so the most overdue articles appear at the top.
 * Clicking an article title opens a direct URL or copies the title for use
 * in Document Search (dispatches jarvis:open-document-search).
 *
 * Toggle:  🌿 FRESH  at left:55080, bottom:8, zIndex 65
 * Event:   jarvis:knowledge-freshness-toggle
 * Voice:   "knowledge freshness" | "stale articles" | "outdated knowledge" |
 *          "knowledge gaps" | "corpus freshness" | "stale knowledge"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const GRN   = "#4ADE80";
const YLW   = "#FFD700";
const RED   = "#FF4444";
const CY    = "#29E7FF";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const POLL  = 5 * 60_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const FRESH_RE =
  /\b(knowledge.freshness|stale.articles?|outdated.knowledge|corpus.freshness|stale.knowledge|knowledge.gaps?|knowledge.health|knowledge.age)\b/i;

export function isKnowledgeFreshnessQuery(t) {
  return FRESH_RE.test(t || "");
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function extractTs(item) {
  const raw =
    item.updated_at  ||
    item.modified_at ||
    item.last_updated ||
    item.modified     ||
    item.created_at  ||
    item.timestamp   ||
    item.date        ||
    null;
  if (!raw) return null;
  const d = new Date(typeof raw === "number" ? raw : Date.parse(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysAgo(d) {
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / 86_400_000;
}

function fmtDays(days) {
  if (!isFinite(days)) return "no timestamp";
  if (days < 1)       return `${Math.round(days * 24)}h ago`;
  if (days < 2)       return "1 day ago";
  return `${Math.round(days)}d ago`;
}

function bucketColor(days) {
  if (!isFinite(days) || days > 30) return RED;
  if (days > 7)                     return YLW;
  return GRN;
}

function articleTitle(item) {
  return item.title || item.name || item.topic || item.subject || item.id || "Untitled";
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`knowledge ${r.status}`);
  const d = await r.json();
  return (
    Array.isArray(d)               ? d
    : Array.isArray(d?.data)       ? d.data
    : Array.isArray(d?.items)      ? d.items
    : Array.isArray(d?.knowledge)  ? d.knowledge
    : Array.isArray(d?.results)    ? d.results
    : Array.isArray(d?.articles)   ? d.articles
    : Array.isArray(d?.chunks)     ? d.chunks
    : []
  );
}

/* ── TTS script ─────────────────────────────────────────────────────────── */
export async function buildKnowledgeFreshnessScript() {
  let items = [];
  try { items = await fetchKnowledge(); } catch (_) {}
  if (!items.length) return "Knowledge base is empty or unreachable.";

  const enriched = items.map(i => ({ ...i, _ts: extractTs(i), _days: daysAgo(extractTs(i)) }));
  const stale    = enriched.filter(i => i._days > 30);
  const fresh    = enriched.filter(i => isFinite(i._days) && i._days <= 7);
  const noTs     = enriched.filter(i => !isFinite(i._days));

  const parts = [
    `Knowledge corpus: ${items.length} articles.`,
    stale.length
      ? `${stale.length} article${stale.length !== 1 ? "s" : ""} are over 30 days old and need review.`
      : "No critically stale articles.",
    noTs.length ? `${noTs.length} have no timestamp.` : "",
    `${fresh.length} are fresh within 7 days.`,
  ].filter(Boolean);

  if (stale.length) {
    const topStale = stale
      .sort((a, b) => b._days - a._days)
      .slice(0, 2)
      .map(i => articleTitle(i))
      .join(" and ");
    parts.push(`Most overdue: ${topStale}.`);
  }

  return parts.join(" ");
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function KnowledgeFreshnessPanel() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchKnowledge();
      const enriched = raw
        .map(i => ({ ...i, _ts: extractTs(i), _days: daysAgo(extractTs(i)) }))
        .sort((a, b) => b._days - a._days); // oldest first
      setItems(enriched);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message || "fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // keyboard + event listeners
  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onKey = (e) => {
      if (e.altKey && (e.key === "f" || e.key === "F")) setOpen(v => !v);
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("jarvis:knowledge-freshness-toggle", onToggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("jarvis:knowledge-freshness-toggle", onToggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // voice intent
  useEffect(() => {
    const onAsk = async (e) => {
      const text = e?.detail?.text || "";
      if (!isKnowledgeFreshnessQuery(text)) return;
      setOpen(true);
      const script = await buildKnowledgeFreshnessScript();
      const voice = getActiveVoice ? getActiveVoice() : "ash";
      try {
        const r = await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text: script, voice }),
        });
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
          audio.onended = () => URL.revokeObjectURL(url);
        }
      } catch (_) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
      }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  /* counts */
  const fresh  = items.filter(i => isFinite(i._days) && i._days <= 7).length;
  const medium = items.filter(i => isFinite(i._days) && i._days > 7 && i._days <= 30).length;
  const stale  = items.filter(i => !isFinite(i._days) || i._days > 30).length;

  return (
    <>
      {/* ── toggle button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge Freshness (Alt+F)"
        style={{
          position: "fixed", bottom: 8, left: 55080, zIndex: 65,
          background: open ? `${GRN}22` : "rgba(5,10,18,0.85)",
          border: `1px solid ${open ? GRN : "#1E3040"}`,
          borderRadius: 5, padding: "3px 9px",
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          color: open ? GRN : "#4E6070", cursor: "pointer",
          transition: "all .2s",
        }}
      >
        🌿 FRESH{stale > 0 && <span style={{ color: RED, marginLeft: 4 }}>{stale}</span>}
      </button>

      {/* ── panel ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed", bottom: 36, left: 54600, zIndex: 200,
            width: 360, maxHeight: 480,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${GRN}44`,
            borderRadius: 12,
            boxShadow: `0 0 40px ${GRN}18, 0 16px 40px rgba(0,0,0,0.8)`,
            display: "flex", flexDirection: "column",
            fontFamily: MONO, overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${GRN}22`,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ color: GRN, fontSize: 12, letterSpacing: 1.5, flex: 1 }}>
              🌿 KNOWLEDGE FRESHNESS
            </span>
            <span style={{ color: GRN, fontSize: 10 }}>{fresh}</span>
            <span style={{ color: "#4E6070", fontSize: 9, marginInline: 2 }}>/</span>
            <span style={{ color: YLW, fontSize: 10 }}>{medium}</span>
            <span style={{ color: "#4E6070", fontSize: 9, marginInline: 2 }}>/</span>
            <span style={{ color: RED, fontSize: 10 }}>{stale}</span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: "#4E6070",
                cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>

          {/* legend */}
          <div
            style={{
              padding: "5px 14px",
              display: "flex", gap: 14,
              borderBottom: `1px solid ${GRN}11`,
              fontSize: 9, color: "#4E6070", letterSpacing: 1,
            }}
          >
            <span><span style={{ color: GRN }}>●</span> &lt;7d</span>
            <span><span style={{ color: YLW }}>●</span> 7–30d</span>
            <span><span style={{ color: RED }}>●</span> &gt;30d / no ts</span>
            <span style={{ marginLeft: "auto" }}>
              {loading ? "refreshing…" : lastFetch ? `${Math.round((Date.now() - lastFetch) / 60000)}m ago` : "—"}
            </span>
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {error && (
              <div style={{ padding: "14px", color: RED, fontSize: 11 }}>
                ⚠ {error}
              </div>
            )}
            {!error && items.length === 0 && !loading && (
              <div style={{ padding: "14px", color: "#4E6070", fontSize: 11 }}>
                No knowledge articles found.
              </div>
            )}
            {items.slice(0, 50).map((item, i) => {
              const color = bucketColor(item._days);
              const title = articleTitle(item);
              return (
                <div
                  key={item.id || item.title || i}
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent("jarvis:open-document-search", {
                        detail: { query: title },
                      })
                    );
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "7px 14px",
                    borderBottom: `1px solid ${GRN}0A`,
                    cursor: "pointer",
                    transition: "background .15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${color}0A`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ color, fontSize: 10, flexShrink: 0 }}>●</span>
                  <span
                    style={{
                      color: "#DCEBF5", fontSize: 11, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </span>
                  <span style={{ color: "#4E6070", fontSize: 9, flexShrink: 0, letterSpacing: 0.5 }}>
                    {fmtDays(item._days)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div
            style={{
              padding: "6px 14px",
              borderTop: `1px solid ${GRN}11`,
              display: "flex", justifyContent: "space-between",
              fontSize: 9, color: "#2E4050", letterSpacing: 1,
            }}
          >
            <span>{items.length} articles</span>
            <button
              onClick={load}
              style={{
                background: "none", border: "none",
                color: CY, fontSize: 9, cursor: "pointer",
                letterSpacing: 1, padding: 0,
              }}
            >
              ↺ refresh
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes kf-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
      `}</style>
    </>
  );
}
