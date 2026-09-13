/**
 * KnowledgeFreshnessMonitor — F31 Knowledge Freshness Monitor.
 * Polls /knowledge/ to list articles, classifies each by age:
 *   FRESH   < 24 h
 *   CURRENT 1–7 days
 *   STALE   > 7 days
 * Toggle button (⬡ KFM) in the bottom strip at left:8580.
 * "JARVIS, knowledge freshness / stale knowledge / knowledge age" opens panel + TTS.
 * 120 s auto-refresh. Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#00E5A0";
const RD  = "#FF4444";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";

const POLL_MS = 120_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KFM_RE =
  /\bknowledge\s+fresh|\bstale\s+knowledge|\bknowledge\s+age|\bknowledge\s+staleness|\bkfm\b|\bfreshness\s+monitor|\bold\s+knowledge|\bknowledge\s+update\b/i;

export function isKfmQuery(text) {
  return KFM_RE.test(text || "");
}

async function fetchKnowledge() {
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  for (const path of ["/knowledge/", "/knowledge/articles", "/knowledge/topics"]) {
    try {
      const r = await fetch(`${base}${path}`, { headers });
      if (!r.ok) continue;
      const d = await r.json();
      const arr =
        Array.isArray(d)             ? d
        : Array.isArray(d?.items)    ? d.items
        : Array.isArray(d?.articles) ? d.articles
        : Array.isArray(d?.topics)   ? d.topics
        : Array.isArray(d?.results)  ? d.results
        : Array.isArray(d?.data)     ? d.data
        : [];
      if (arr.length > 0) return arr;
    } catch (_) { /* try next path */ }
  }
  return [];
}

function getAge(item) {
  const ts =
    item.updated_at   ||
    item.last_modified ||
    item.modified_at   ||
    item.last_updated  ||
    item.created_at    ||
    item.created_date  ||
    item.timestamp     ||
    null;
  if (!ts) return null;
  const ms = typeof ts === "number" ? ts : Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return Date.now() - ms;
}

function classify(ageMs) {
  if (ageMs === null) return "UNKNOWN";
  const days = ageMs / 86_400_000;
  if (days < 1)  return "FRESH";
  if (days <= 7) return "CURRENT";
  return "STALE";
}

function fmtAge(ageMs) {
  if (ageMs === null) return "—";
  const mins = Math.round(ageMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

function getName(item) {
  return (
    item.title || item.name || item.topic || item.subject ||
    item.article_name || item.slug || `Article ${item.id ?? "?"}`
  );
}

export async function buildKfmScript() {
  let items = [];
  try { items = await fetchKnowledge(); } catch (_) {}

  if (!items.length) return "Knowledge base appears empty or unreachable, sir.";

  const counts = { FRESH: 0, CURRENT: 0, STALE: 0, UNKNOWN: 0 };
  for (const it of items) {
    counts[classify(getAge(it))]++;
  }

  const staleMsg = counts.STALE > 0
    ? ` Warning: ${counts.STALE} article${counts.STALE !== 1 ? "s are" : " is"} stale.`
    : "";

  return (
    `Knowledge base: ${items.length} article${items.length !== 1 ? "s" : ""} indexed. ` +
    `${counts.FRESH} fresh, ${counts.CURRENT} current, ${counts.STALE} stale.` +
    staleMsg
  );
}

const BADGE_STYLE = (color) => ({
  fontSize: 9, letterSpacing: 0.7, fontWeight: 700,
  color, border: `1px solid ${color}55`,
  borderRadius: 3, padding: "1px 5px",
});

export default function KnowledgeFreshnessMonitor() {
  const [open,    setOpen]    = useState(false);
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLast]  = useState(null);
  const [filter,  setFilter]  = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchKnowledge();
      setItems(arr);
      setLast(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (KFM_RE.test(q)) setOpen(true);
    };
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:ask",        onAsk);
    window.addEventListener("jarvis:kfm-toggle", onToggle);
    return () => {
      window.removeEventListener("jarvis:ask",        onAsk);
      window.removeEventListener("jarvis:kfm-toggle", onToggle);
    };
  }, []);

  const enriched = items.map(it => {
    const ageMs = getAge(it);
    return { ...it, _ageMs: ageMs, _cls: classify(ageMs) };
  });

  const counts = { FRESH: 0, CURRENT: 0, STALE: 0, UNKNOWN: 0 };
  for (const it of enriched) counts[it._cls]++;

  const visible = filter === "ALL"
    ? [...enriched].sort((a, b) => (b._ageMs ?? 0) - (a._ageMs ?? 0))
    : enriched.filter(it => it._cls === filter)
              .sort((a, b) => (b._ageMs ?? 0) - (a._ageMs ?? 0));

  const CLS_COLOR = { FRESH: GN, CURRENT: AM, STALE: RD, UNKNOWN: DIM };
  const staleColor = counts.STALE > 0 ? RD : CY;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge Freshness Monitor"
        style={{
          position: "fixed", left: 8580, bottom: 8, zIndex: 68,
          background: open ? `${CY}cc` : "rgba(5,8,13,0.78)",
          border: `1px solid ${CY}55`, borderRadius: 8,
          color: open ? "#04060A" : CY, cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        KFM
        {counts.STALE > 0 && (
          <span style={{
            background: `${RD}44`, color: RD,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {counts.STALE}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(400px,92vw)", maxHeight: "min(540px,74vh)",
          background: BG, border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${CY}14`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: staleColor,
              boxShadow: `0 0 10px ${staleColor}`,
              display: "inline-block",
              animation: loading ? "kfm-pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              KNOWLEDGE FRESHNESS
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING"
                : lastFetch ? `↻ ${fmtAge(Date.now() - lastFetch.getTime())} ago` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats bar */}
          <div style={{
            padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 14, alignItems: "center",
          }}>
            {[["FRESH", GN], ["CURRENT", AM], ["STALE", RD]].map(([cls, col]) => (
              <button key={cls} onClick={() => setFilter(filter === cls ? "ALL" : cls)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: filter === cls ? col : "#566878",
                  fontSize: 9, letterSpacing: 1, fontWeight: 700, padding: 0,
                  textDecoration: filter === cls ? "underline" : "none",
                }}
              >
                {cls} {counts[cls]}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontSize: 9, color: DIM }}>
              {items.length} TOTAL
            </span>
          </div>

          {/* Article list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: DIM, fontSize: 10, textAlign: "center" }}>
                {items.length === 0 ? "No knowledge articles indexed." : "No matches."}
              </div>
            )}
            {visible.map((it, i) => {
              const col = CLS_COLOR[it._cls];
              return (
                <div key={it.id || it.slug || i} style={{
                  margin: "5px 10px",
                  background: `${col}08`,
                  border: `1px solid ${col}28`,
                  borderRadius: 8, padding: "8px 12px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 10, color: "#DCEBF5", fontWeight: 700,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {getName(it)}
                    </div>
                    {(it.description || it.summary) && (
                      <div style={{ fontSize: 8, color: "#8ba3b8", marginTop: 2, lineHeight: 1.5 }}>
                        {(it.description || it.summary || "").slice(0, 80)}
                        {(it.description || it.summary || "").length > 80 ? "…" : ""}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={BADGE_STYLE(col)}>{it._cls}</span>
                    <span style={{ fontSize: 8, color: DIM }}>
                      {it._ageMs !== null ? fmtAge(it._ageMs) : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes kfm-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.5); opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
