/**
 * KnowledgePulsePanel — F39 (overnight backlog)
 *
 * Polls GET /knowledge/ every 5 min; lists articles with kind badge,
 * confidence bar, and age; click to expand full body; text search.
 * ASSESS → /v1/jarvis/agent/chat 2-sentence KB health brief + TTS.
 *
 * Toggle:  ◎ KPULSE  at left:882320 bottom:8 zIndex:584.
 * Event:   jarvis:kpulse-toggle
 * Voice:   "knowledge pulse / kpulse / knowledge base / browse knowledge / kb pulse"
 * Refresh: 300 s while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ACC   = "#84CC16";
const CY    = "#29E7FF";
const DIM   = "#0B1420";
const POLL  = 300_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── exported helpers for JarvisBrain ───────────────────────────────────────── */

export function isKpulseQuery(q) {
  return /\b(knowledge[\s_-]*pulse|kpulse|knowledge[\s_-]*base|browse[\s_-]*knowledge|kb[\s_-]*pulse|knowledge[\s_-]*browser|knowledge[\s_-]*articles|show[\s_-]*knowledge)\b/i.test(
    q || ""
  );
}

export async function buildKpulseScript() {
  try {
    const r = await fetch(`${apiBase()}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const raw = r.ok ? await r.json() : [];
    const articles = normalise(raw);
    window.dispatchEvent(new CustomEvent("jarvis:kpulse-toggle"));
    if (!articles.length) return "No knowledge articles found in the knowledge base, sir.";
    const highConf = articles.filter((a) => (a.confidence ?? 0) >= 0.75).length;
    const kinds = [...new Set(articles.map((a) => a.kind).filter(Boolean))].join(", ");
    return (
      `Knowledge base pulse online, sir. ${articles.length} article${articles.length !== 1 ? "s" : ""} across ${kinds || "multiple"} categories. ` +
      `${highConf} article${highConf !== 1 ? "s" : ""} carry high confidence. Panel is open for review.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:kpulse-toggle"));
    return "Knowledge pulse panel open, sir.";
  }
}

/* ── helpers ────────────────────────────────────────────────────────────────── */

function normalise(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["knowledge", "articles", "items", "results", "data", "records"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
  }
  return [];
}

function relAge(ts) {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function KindBadge({ kind }) {
  const COLORS = {
    note: CY, daily: "#22C55E", log: "#F97316",
    article: "#A78BFA", report: "#F43F5E", ref: "#38BDF8",
  };
  const c = COLORS[(kind || "").toLowerCase()] ?? ACC;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 9, color: c,
      border: `1px solid ${c}55`, borderRadius: 3,
      padding: "1px 4px", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
    }}>
      {kind ?? "—"}
    </span>
  );
}

function ConfBar({ val }) {
  const pct = Math.round((val ?? 0) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 40, height: 4, background: "#1a2030", borderRadius: 2 }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: pct > 75 ? ACC : pct > 40 ? "#F59E0B" : "#EF4444",
        }} />
      </div>
      <span style={{ color: "#4E6070", fontSize: 9 }}>{pct}%</span>
    </div>
  );
}

/* ── component ──────────────────────────────────────────────────────────────── */

export default function KnowledgePulsePanel() {
  const [visible, setVisible]   = useState(false);
  const [articles, setArticles] = useState([]);
  const [err, setErr]           = useState(null);
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText]     = useState("");
  const timerRef                = useRef(null);

  const fetchArticles = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/knowledge/`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      setArticles(normalise(d));
      setErr(null);
    } catch {
      setErr("FETCH ERROR");
    }
  }, []);

  useEffect(() => {
    const handler = () => setVisible((v) => !v);
    window.addEventListener("jarvis:kpulse-toggle", handler);
    return () => window.removeEventListener("jarvis:kpulse-toggle", handler);
  }, []);

  useEffect(() => {
    if (!visible) {
      clearInterval(timerRef.current);
      return;
    }
    fetchArticles();
    timerRef.current = setInterval(fetchArticles, POLL);
    return () => clearInterval(timerRef.current);
  }, [visible, fetchArticles]);

  const filtered = query.trim()
    ? articles.filter((a) =>
        (a.title   || "").toLowerCase().includes(query.toLowerCase()) ||
        (a.kind    || "").toLowerCase().includes(query.toLowerCase()) ||
        (a.body_md || "").toLowerCase().includes(query.toLowerCase())
      )
    : articles;

  async function assess() {
    setAiLoading(true);
    setAiText("");
    const lowConf = articles.filter((a) => (a.confidence ?? 0) < 0.5).map((a) => a.title || "Untitled").slice(0, 5);
    const prompt =
      `As JARVIS, provide a 2-sentence assessment of this knowledge base: ` +
      `${articles.length} total articles, ${lowConf.length} low-confidence item${lowConf.length !== 1 ? "s" : ""}` +
      (lowConf.length ? ` (${lowConf.join(", ")})` : "") +
      `. Identify the primary knowledge gap and recommend a priority action. Be direct and operational.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(txt);
      if (txt) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAiText("Unable to reach reasoning core.");
    } finally {
      setAiLoading(false);
    }
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        title="Knowledge Pulse — browse & assess the KB"
        style={{
          position: "fixed", left: 882320, bottom: 8, zIndex: 584,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${ACC}55`,
          borderRadius: 6, color: ACC, fontFamily: "monospace",
          fontSize: 10, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◎ KPULSE
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 8, top: "8%", zIndex: 584,
      width: 320, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: "rgba(8,14,22,0.92)", border: `1px solid ${ACC}55`,
      borderRadius: 10, fontFamily: "monospace", color: "#DCEBF5",
      boxShadow: `0 0 40px ${ACC}18`, backdropFilter: "blur(10px)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px 8px", borderBottom: `1px solid ${ACC}33`,
        flexShrink: 0,
      }}>
        <span style={{ color: ACC, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>◎ KNOWLEDGE PULSE</span>
        <span style={{ marginLeft: "auto", color: "#4E6070", fontSize: 9 }}>
          {articles.length} article{articles.length !== 1 ? "s" : ""}
        </span>
        <button onClick={() => setVisible(false)} style={{
          background: "none", border: "none", color: "#4E6070",
          cursor: "pointer", fontSize: 14, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${ACC}22`, flexShrink: 0 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter articles…"
          style={{
            width: "100%", background: "#0B1420", border: `1px solid ${ACC}33`,
            borderRadius: 4, color: "#DCEBF5", fontFamily: "monospace",
            fontSize: 11, padding: "4px 8px", outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Article list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {err && (
          <div style={{ color: "#FF3D5A", fontSize: 10, padding: "8px 12px" }}>{err}</div>
        )}
        {!err && filtered.length === 0 && (
          <div style={{ color: "#4E6070", fontSize: 10, padding: "12px", textAlign: "center" }}>
            {articles.length === 0 ? "Loading…" : "No matches"}
          </div>
        )}
        {filtered.map((a, i) => {
          const id = a.id ?? a._id ?? i;
          const isExp = expanded === id;
          return (
            <div key={id} style={{
              borderBottom: `1px solid ${ACC}18`,
              background: isExp ? `${ACC}0A` : "transparent",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  padding: "7px 12px", cursor: "pointer", display: "flex",
                  flexDirection: "column", gap: 3,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <KindBadge kind={a.kind} />
                  <span style={{
                    fontSize: 11, color: "#DCEBF5", flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.title || a.name || "Untitled"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ConfBar val={a.confidence} />
                  <span style={{ color: "#4E6070", fontSize: 9, marginLeft: "auto" }}>
                    {relAge(a.created_at ?? a.updated_at ?? a.timestamp)}
                  </span>
                </div>
              </div>
              {isExp && (a.body_md || a.summary || a.content) && (
                <div style={{
                  padding: "0 12px 10px", fontSize: 10, color: "#8AA4B8",
                  lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: 180, overflowY: "auto",
                }}>
                  {a.body_md || a.summary || a.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: ASSESS */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${ACC}33`,
        display: "flex", flexDirection: "column", gap: 6, flexShrink: 0,
      }}>
        {aiText && (
          <div style={{ fontSize: 10, color: "#A0C4D8", lineHeight: 1.4 }}>{aiText}</div>
        )}
        <button
          onClick={assess}
          disabled={aiLoading || articles.length === 0}
          style={{
            background: aiLoading ? "#1a2030" : `${ACC}22`,
            border: `1px solid ${ACC}55`, borderRadius: 5,
            color: ACC, fontFamily: "monospace", fontSize: 10,
            padding: "5px 10px", cursor: aiLoading ? "default" : "pointer",
            letterSpacing: 1,
          }}
        >
          {aiLoading ? "…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
