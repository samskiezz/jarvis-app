/**
 * F134: Knowledge Article Reader — right-edge slide-in at 76 % vertical.
 * Polls GET /knowledge/ every 5 min; lists all articles with kind badge +
 * confidence bar + age; click row expands full body_md inline.
 * Client-side text filter. Lime (#84CC16) accent.
 */
import { useState, useEffect, useRef } from "react";

const POLL_MS = 300_000;
const ACC = "#84CC16";
const DRAWER_W = 300;
const TOP_PCT = "76%";

function relAge(ts) {
  if (!ts) return "—";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60)    return `${sec}s ago`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function KindBadge({ kind }) {
  const COLORS = { note: "#29E7FF", daily: "#22C55E", log: "#F97316", article: "#A78BFA" };
  const c = COLORS[kind] ?? ACC;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 9, color: c,
      border: `1px solid ${c}55`, borderRadius: 3,
      padding: "1px 4px", letterSpacing: 1,
      textTransform: "uppercase", flexShrink: 0,
    }}>
      {kind ?? "—"}
    </span>
  );
}

function ConfBar({ val }) {
  const pct = Math.round((val ?? 0) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 40, height: 4, background: "#1a2030", borderRadius: 2,
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: pct > 75 ? ACC : pct > 40 ? "#F59E0B" : "#EF4444",
          borderRadius: 2,
        }} />
      </div>
      <span style={{ color: "#4E6070", fontSize: 9 }}>{pct}%</span>
    </div>
  );
}

export default function KnowledgeArticleReader() {
  const [open, setOpen]         = useState(false);
  const [articles, setArticles] = useState([]);
  const [err, setErr]           = useState(null);
  const [query, setQuery]       = useState("");
  const [expanded, setExpanded] = useState(null);
  const timerRef                = useRef(null);

  const fetchArticles = async () => {
    try {
      const r = await fetch("/knowledge/");
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      const arr = Array.isArray(d?.knowledge) ? d.knowledge
                : Array.isArray(d)            ? d
                : [];
      setArticles(arr);
      setErr(null);
    } catch {
      setErr("FETCH ERROR");
    }
  };

  useEffect(() => {
    if (!open) {
      clearInterval(timerRef.current);
      return;
    }
    fetchArticles();
    timerRef.current = setInterval(fetchArticles, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const filtered = query.trim()
    ? articles.filter(a =>
        (a.title || "").toLowerCase().includes(query.toLowerCase()) ||
        (a.kind  || "").toLowerCase().includes(query.toLowerCase()) ||
        (a.body_md || "").toLowerCase().includes(query.toLowerCase())
      )
    : articles;

  const toggle = (id) => setExpanded(prev => prev === id ? null : id);

  return (
    <>
      {/* Edge tab */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: TOP_PCT,
          zIndex: 200,
          background: "#0a0c10",
          border: `1px solid ${ACC}`,
          borderRight: "none",
          color: ACC,
          padding: "6px 4px",
          cursor: "pointer",
          fontSize: 10,
          fontFamily: "monospace",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          transform: "rotate(180deg)",
          userSelect: "none",
          letterSpacing: 1,
          transition: "right 0.2s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span>◈ KNOW</span>
        {articles.length > 0 && (
          <span style={{
            background: ACC, color: "#000",
            borderRadius: "50%", width: 14, height: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: "bold", writingMode: "horizontal-tb",
            transform: "rotate(180deg)",
          }}>
            {articles.length > 99 ? "99" : articles.length}
          </span>
        )}
      </div>

      {/* Drawer */}
      {open && (
        <div style={{
          position: "fixed",
          right: 0, top: 0, bottom: 0,
          width: DRAWER_W,
          zIndex: 199,
          background: "rgba(8,10,14,0.97)",
          border: `1px solid ${ACC}55`,
          borderRight: "none",
          display: "flex",
          flexDirection: "column",
          fontFamily: "monospace",
          fontSize: 11,
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 12px",
            borderBottom: `1px solid ${ACC}44`,
            flexShrink: 0,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 6,
            }}>
              <span style={{ color: ACC, letterSpacing: 2, fontSize: 10 }}>
                ◈ KNOWLEDGE BASE
              </span>
              <span style={{ color: "#4E6070", fontSize: 9 }}>
                {filtered.length} / {articles.length} articles
              </span>
            </div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="search articles…"
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${ACC}33`, borderRadius: 4,
                color: "#DCEBF5", fontSize: 10, padding: "4px 8px",
                outline: "none", fontFamily: "monospace", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Error */}
          {err && (
            <div style={{
              padding: "8px 12px", color: "#EF4444",
              fontSize: 10, borderBottom: `1px solid #EF444422`,
              flexShrink: 0,
            }}>
              {err}
            </div>
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!err && filtered.length === 0 && (
              <div style={{ padding: "16px 12px", color: "#4E6070", fontSize: 10 }}>
                {articles.length === 0 ? "LOADING…" : "NO MATCH"}
              </div>
            )}
            {filtered.map(a => (
              <div key={a.id}>
                <div
                  onClick={() => toggle(a.id)}
                  style={{
                    padding: "8px 12px",
                    borderBottom: `1px solid #ffffff0a`,
                    cursor: "pointer",
                    background: expanded === a.id ? `${ACC}0a` : "transparent",
                  }}
                >
                  <div style={{
                    display: "flex", alignItems: "flex-start",
                    gap: 6, marginBottom: 4,
                  }}>
                    <span style={{
                      color: expanded === a.id ? "#DCEBF5" : "#7A95AB",
                      flex: 1, lineHeight: 1.4,
                      wordBreak: "break-word",
                    }}>
                      {a.title || "(untitled)"}
                    </span>
                    <span style={{ color: ACC, fontSize: 9, flexShrink: 0 }}>
                      {expanded === a.id ? "▲" : "▼"}
                    </span>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center",
                    gap: 6, flexWrap: "wrap",
                  }}>
                    <KindBadge kind={a.kind} />
                    {a.confidence != null && <ConfBar val={a.confidence} />}
                    <span style={{ color: "#2E4050", fontSize: 9, marginLeft: "auto" }}>
                      {relAge(a.updated_ts || a.created_ts)}
                    </span>
                  </div>
                </div>

                {expanded === a.id && a.body_md && (
                  <div style={{
                    padding: "8px 12px",
                    background: `${ACC}08`,
                    borderBottom: `1px solid ${ACC}22`,
                    color: "#B0CCDE",
                    fontSize: 10,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 260,
                    overflowY: "auto",
                  }}>
                    {a.body_md}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 12px",
            borderTop: `1px solid ${ACC}22`,
            color: "#2E4050", fontSize: 9,
            flexShrink: 0,
          }}>
            GET /knowledge/ · 5-min poll · click row to expand
          </div>
        </div>
      )}
    </>
  );
}
