/**
 * KnowledgeBrowser — F34 Knowledge Browser.
 * Fetches /knowledge/ → browseable article/chunk list with search input.
 * Clicking an article sends title + snippet to /v1/jarvis/agent/chat for a real
 * AI summary, then speaks it via /v1/voice/tts.
 * "JARVIS, knowledge" opens the panel and briefs the total count.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 * Toggle button at left:2260 bottom strip.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const GR  = "#4ADE80"; // green — knowledge accent
const CY  = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const KNOW_RE = /\bknowledge|know\s?base|article|chunk|wiki|entry|entries|browse\s?knowledge\b/i;

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)              ? d
    : Array.isArray(d?.data)               ? d.data
    : Array.isArray(d?.items)              ? d.items
    : Array.isArray(d?.knowledge)          ? d.knowledge
    : Array.isArray(d?.results)            ? d.results
    : Array.isArray(d?.articles)           ? d.articles
    : Array.isArray(d?.chunks)             ? d.chunks
    : [];
  return arr;
}

export function isKnowledgeQuery(text) {
  return KNOW_RE.test(text || "");
}

export async function buildKnowledgeScript() {
  let items = [];
  try { items = await fetchKnowledge(); } catch (_) {}
  if (!items.length) return "Knowledge base is empty or unreachable at this time, sir.";
  const names = items
    .slice(0, 3)
    .map(i => i.title || i.name || i.topic || i.subject || "Untitled")
    .join(", ");
  return (
    `Knowledge base contains ${items.length} article${items.length !== 1 ? "s" : ""}. ` +
    `Recent entries include: ${names}.`
  );
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

async function summariseAndSpeak(item) {
  const title   = item.title || item.name || item.topic || item.subject || "Untitled";
  const snippet = (item.content || item.body || item.text || item.summary || item.description || "").slice(0, 400);
  const prompt  = snippet
    ? `Summarise this knowledge article in two sentences: "${title}". Content: ${snippet}`
    : `Give me a one-sentence description of a knowledge article titled: "${title}"`;

  let summary = "";
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    summary = (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch (_) {}

  const spoken = summary || `Knowledge article: ${title}. ${snippet.slice(0, 200)}`;
  window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: spoken } }));
}

export default function KnowledgeBrowser() {
  const [open,      setOpen]      = useState(false);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");
  const [speaking,  setSpeaking]  = useState(null); // id of item being summarised

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKnowledge();
      setItems(data);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (KNOW_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = items.filter(item => {
    if (!filter.trim()) return true;
    const hay = [
      item.title, item.name, item.topic, item.subject,
      item.category, item.tags, item.summary, item.description,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  async function handleItemClick(item) {
    const id = item.id || item._id || item.title || "";
    setSpeaking(id);
    await summariseAndSpeak(item);
    setSpeaking(null);
  }

  return (
    <>
      {/* Toggle button — bottom strip at left:2260 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Knowledge Browser (F34)"
        style={{
          position: "fixed", left: 2260, bottom: 18, zIndex: 68,
          background: open ? GR + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${GR}55`,
          borderRadius: 8,
          color: open ? "#04060A" : GR,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${GR}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◉</span>
        KNOW
        {items.length > 0 && (
          <span style={{
            background: GR + "44", color: GR,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {items.length}
          </span>
        )}
      </button>

      {/* Knowledge browser panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(480px,94vw)", maxHeight: "min(620px,78vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${GR}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${GR}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GR}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: GR,
              boxShadow: `0 0 10px ${GR}`, display: "inline-block",
              animation: loading ? "knowpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GR, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              KNOWLEDGE BASE
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading
                ? "SCANNING"
                : lastFetch
                  ? `↻ ${fmtAge(lastFetch)}`
                  : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Search input */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${GR}18` }}>
            <input
              type="text"
              placeholder="search knowledge base…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(74,222,128,0.06)`, border: `1px solid ${GR}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          <div style={{ padding: "4px 14px", fontSize: 8, color: "#566878", letterSpacing: 0.5 }}>
            {visible.length} article{visible.length !== 1 ? "s" : ""} — click any entry for JARVIS AI summary
          </div>

          {/* Article list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0 8px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {items.length === 0
                  ? "Knowledge base empty or unreachable."
                  : "No matches for your query."}
              </div>
            )}
            {visible.map((item, i) => {
              const rawId   = item.id || item._id || item.title || i;
              const title   = item.title || item.name || item.topic || item.subject || `Article ${i + 1}`;
              const snippet = item.summary || item.description || item.content || item.body || item.text || "";
              const cat     = item.category || item.type || item.kind || item.namespace || "";
              const ts      = item.updated_at || item.created_at || item.date;
              const isBusy  = speaking === rawId;

              return (
                <div
                  key={rawId}
                  onClick={() => !isBusy && handleItemClick(item)}
                  title={isBusy ? "Summarising…" : "Click for JARVIS AI summary"}
                  style={{
                    margin: "6px 10px",
                    background: isBusy ? `${GR}10` : `${GR}05`,
                    border: `1px solid ${isBusy ? GR + "55" : GR + "22"}`,
                    borderRadius: 8, padding: "9px 12px",
                    cursor: isBusy ? "wait" : "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => {
                    if (!isBusy) {
                      e.currentTarget.style.borderColor = GR + "55";
                      e.currentTarget.style.background  = GR + "10";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isBusy) {
                      e.currentTarget.style.borderColor = GR + "22";
                      e.currentTarget.style.background  = GR + "05";
                    }
                  }}
                >
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: snippet ? 5 : 0 }}>
                    {cat && (
                      <span style={{
                        fontSize: 8, color: CY,
                        background: CY + "1a", border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "1px 6px",
                        letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
                        flexShrink: 0,
                      }}>
                        {String(cat).slice(0, 10)}
                      </span>
                    )}
                    <span style={{
                      flex: 1, fontSize: 10, color: "#DCEBF5",
                      fontWeight: 700, letterSpacing: 0.5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {title}
                    </span>
                    {isBusy && (
                      <span style={{ fontSize: 8, color: GR, flexShrink: 0, animation: "knowpulse 1s infinite" }}>
                        ◍ asking…
                      </span>
                    )}
                    {ts && !isBusy && (
                      <span style={{ fontSize: 8, color: "#566878", flexShrink: 0 }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>

                  {/* Snippet */}
                  {snippet && (
                    <p style={{
                      margin: 0, fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {snippet.length > 140 ? snippet.slice(0, 140) + "…" : snippet}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes knowpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
