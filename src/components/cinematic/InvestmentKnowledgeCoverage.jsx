/**
 * InvestmentKnowledgeCoverage — F97
 *
 * Parallel-fetches /entities/Investment + /knowledge/ then keyword-
 * correlates portfolio positions against KB articles to surface
 * GROUNDED (≥2 article matches) / PARTIAL (1) / DARK (0 — no knowledge
 * backing for the position).
 *
 * Stat tiles: positions / articles / grounded / partial / dark
 * Filter tabs: ALL / GROUNDED / PARTIAL / DARK
 * Expand position → matched KB article cards with relevance score bar.
 * Click ▶ ASSESS KNOWLEDGE GAPS → /v1/jarvis/agent/chat 2-sentence brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "investment knowledge" / "invkb" / "portfolio kb" /
 *         "dark investments" / "investment grounding" /
 *         "ungrounded investments" / "investment articles"
 *   → jarvis:invkb-toggle + TTS brief via buildInvkbScript()
 *
 * Toggle: ◈ INVKB at left:31800, bottom:8, zIndex 97.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4444";
const DIM   = "#4A6070";
const BG    = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 31800;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const INVKB_RE =
  /\b(invkb|invest.*knowl|knowl.*invest|portfolio.kb|portfolio.*knowl|knowl.*portfolio|dark.invest|invest.*ground|unground.*invest|invest.*artic)\b/i;

export function isInvkbQuery(t) { return INVKB_RE.test(t || ""); }

export async function buildInvkbScript() {
  const [iRaw, kRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/entities/Investment`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/knowledge/`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const positions = normaliseInvestments(iRaw.status === "fulfilled" ? iRaw.value : []);
  const articles  = normaliseArticles(kRaw.status === "fulfilled" ? kRaw.value : []);
  const pairs     = correlate(positions, articles);
  const grounded  = pairs.filter((p) => p.matches.length >= 2).length;
  const partial   = pairs.filter((p) => p.matches.length === 1).length;
  const dark      = pairs.filter((p) => p.matches.length === 0).length;
  const topDark   = pairs
    .filter((p) => p.matches.length === 0)
    .slice(0, 3)
    .map((p) => p.inv.name)
    .join(", ") || "none";
  return (
    `Assess JARVIS investment portfolio knowledge coverage in 2 sentences. ` +
    `${positions.length} positions vs ${articles.length} KB articles: ` +
    `${grounded} GROUNDED (≥2 articles), ${partial} PARTIAL (1 article), ` +
    `${dark} DARK (no KB backing — investments with no knowledge coverage). ` +
    `Top dark positions: ${topDark}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestments(raw) {
  return normaliseArray(raw, ["investments", "positions", "portfolio"]).map((inv) => ({
    id:     inv.id || inv.investment_id || String(Math.random()),
    name:   inv.name || inv.title || inv.ticker || inv.symbol || inv.asset || "Unknown",
    type:   inv.type || inv.asset_type || inv.category || "",
    value:  inv.value || inv.amount || inv.quantity || 0,
    tags:   [...(inv.tags || []), ...(inv.labels || [])].map(String),
    sector: inv.sector || inv.industry || "",
  }));
}

function normaliseArticles(raw) {
  return normaliseArray(raw, ["articles", "knowledge", "items"]).map((a) => ({
    id:      a.id || a.article_id || String(Math.random()),
    title:   a.title || a.name || a.heading || "Untitled Article",
    summary: a.summary || a.description || a.body || a.content || "",
    tags:    [...(a.tags || []), ...(a.categories || []), ...(a.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(inv, article) {
  const invWords = tokens(
    `${inv.name} ${inv.type} ${inv.sector} ${inv.tags.join(" ")}`
  );
  const artText  = `${article.title} ${article.summary} ${article.tags.join(" ")}`.toLowerCase();
  const hits = invWords.filter((w) => artText.includes(w));
  return hits.length / Math.max(invWords.length, 1);
}

function correlate(positions, articles) {
  return positions.map((inv) => {
    const scored = articles
      .map((a) => ({ a, score: matchScore(inv, a) }))
      .filter((x) => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    return { inv, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 60, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function InvestmentKnowledgeCoverage() {
  const [open, setOpen]           = useState(false);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [iRes, kRes] = await Promise.allSettled([
        fetch(`${apiBase()}/entities/Investment`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/knowledge/`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const positions = normaliseInvestments(iRes.status === "fulfilled" ? iRes.value : []);
      const articles  = normaliseArticles(kRes.status === "fulfilled" ? kRes.value : []);
      setPairs(correlate(positions, articles));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:invkb-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invkb-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const grounded = pairs.filter((p) => p.matches.length >= 2);
  const partial  = pairs.filter((p) => p.matches.length === 1);
  const dark     = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "GROUNDED") return p.matches.length >= 2;
      if (tab === "PARTIAL")  return p.matches.length === 1;
      if (tab === "DARK")     return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.inv.name.toLowerCase().includes(q) ||
        p.inv.type.toLowerCase().includes(q) ||
        p.inv.sector.toLowerCase().includes(q) ||
        p.matches.some((m) => m.a.title.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildInvkbScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore assessment errors
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Knowledge Coverage (INVKB)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 97,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ INVKB
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {dark.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "GROUNDED", "PARTIAL", "DARK"];
  const tabColor = (t) => {
    if (t === "DARK")     return AMBER;
    if (t === "GROUNDED") return GREEN;
    if (t === "PARTIAL")  return CY;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 97,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ INVESTMENT × KNOWLEDGE
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS KNOWLEDGE GAPS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="POSITIONS" value={pairs.length}     color={CY}   />
        <Tile label="ARTICLES"  value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.a.id)))].length
            : 0
        } color={CY} />
        <Tile label="GROUNDED" value={grounded.length}  color={GREEN} />
        <Tile label="PARTIAL"  value={partial.length}   color={CY}   />
        <Tile label="DARK"     value={dark.length}      color={AMBER} />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "2px 6px", width: 120, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {loading && (
          <div style={{ color: DIM, padding: "8px 0" }}>◌ loading…</div>
        )}
        {error && (
          <div style={{ color: RED, padding: "4px 0" }}>⚠ {error}</div>
        )}
        {!loading && visible.length === 0 && !error && (
          <div style={{ color: DIM, padding: "8px 0" }}>no results</div>
        )}
        {visible.map((p) => {
          const status =
            p.matches.length >= 2 ? "GROUNDED" :
            p.matches.length === 1 ? "PARTIAL" : "DARK";
          const statusColor =
            status === "GROUNDED" ? GREEN :
            status === "PARTIAL"  ? CY    : AMBER;
          const isExp = expanded[p.inv.id];
          return (
            <div
              key={p.inv.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                paddingBottom: 6, marginBottom: 6,
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  cursor: "pointer", padding: "4px 0",
                }}
                onClick={() => toggleRow(p.inv.id)}
              >
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.inv.name}
                </span>
                {p.inv.type && (
                  <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                    {p.inv.type}
                  </span>
                )}
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.matches.length} kb
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
                  {p.matches.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9 }}>
                      ⚠ no KB article match — DARK position
                    </div>
                  ) : (
                    p.matches.map(({ a, score }) => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 3,
                      }}>
                        <span style={{
                          color: GREEN, fontSize: 9, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {a.title}
                        </span>
                        <ScoreBar score={score} />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "4px 12px", borderTop: `1px solid ${AMBER}22`,
        color: DIM, fontSize: 8, letterSpacing: 1,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>INVKB · /entities/Investment × /knowledge/</span>
        <span
          onClick={load}
          style={{ cursor: "pointer", color: CY }}
          title="refresh now"
        >
          ↺ {REFRESH_MS / 1000}s
        </span>
      </div>
    </div>
  );
}
