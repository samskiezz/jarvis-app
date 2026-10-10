/**
 * F185 — Investment × Investigation × Knowledge Coverage Matrix (IIKM)
 *
 * Parallel-fetches /entities/Investment + /v1/investigations + /knowledge/ every 90 s.
 * Keyword-correlates each investment against open investigations AND KB articles:
 *
 *   FULLY_COVERED — matched ≥1 investigation AND ≥1 KB article
 *   CASE_ONLY     — investigation matched, no KB article
 *   KB_ONLY       — KB article matched, no investigation
 *   DARK          — no investigation and no KB coverage
 *
 * Stat tiles: investments / investigations / articles / fully covered / dark
 * Filter tabs: ALL | FULLY_COVERED | CASE_ONLY | KB_ONLY | DARK
 * Text search on investment name / type / description.
 * Expand row → matched investigations (amber bars) + matched KB articles (cyan bars).
 * Red badge + pulse on DARK count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ IIKM  at bottom:8 left:978540, zIndex:686.
 * Event:   jarvis:iikm-toggle
 * Voice:   "iikm / investment investigation knowledge / investment coverage /
 *           investment knowledge / investment case / dark investment /
 *           investment intelligence coverage / capital case coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 978_540;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const RED      = "#FF2244";
const AMBER    = "#FFB020";
const GREEN    = "#7FEFB4";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const IIKM_RE =
  /\b(iikm|investment\s+investigation\s+knowledge|investment\s+coverage|investment\s+knowledge|investment\s+case|dark\s+investment|investment\s+intelligence\s+coverage|capital\s+case\s+coverage)\b/i;

export function isIikmQuery(q) {
  return IIKM_RE.test(q || "");
}

export async function buildIikmScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [ir, invr, kbr] = await Promise.allSettled([
      fetch(`${base}/entities/Investment?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/investigations?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/knowledge/`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const investments    = toArr(ir.value);
    const investigations = toArr(invr.value);
    const articles       = toArr(kbr.value);
    let dark = 0;
    investments.forEach(inv => {
      const kws = keywords(inv);
      const hasCase = investigations.some(i => matchKws(kws, i));
      const hasKb   = articles.some(a => matchKws(kws, a));
      if (!hasCase && !hasKb) dark++;
    });
    return `Investment Investigation Knowledge Coverage: ${investments.length} investments assessed against ${investigations.length} investigations and ${articles.length} KB articles. ${dark} investments have no case coverage and no knowledge documentation — these represent unmonitored capital exposure.`;
  } catch {
    return "IIKM assessment unavailable.";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.items)) return v.items;
  if (Array.isArray(v.results)) return v.results;
  if (Array.isArray(v.data)) return v.data;
  if (Array.isArray(v.articles)) return v.articles;
  if (Array.isArray(v.investments)) return v.investments;
  if (Array.isArray(v.investigations)) return v.investigations;
  return [];
}

function txt(obj) {
  return [
    obj?.id, obj?.name, obj?.title, obj?.label,
    obj?.description, obj?.summary, obj?.type,
    obj?.category, obj?.entity_type, obj?.ticker,
    obj?.asset_class, obj?.sector,
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywords(inv) {
  const raw = txt(inv);
  return raw.split(/\W+/).filter(w => w.length > 3);
}

function matchKws(kws, item) {
  if (!kws.length) return false;
  const haystack = txt(item);
  return kws.some(k => haystack.includes(k));
}

function classify(inv, investigations, articles) {
  const kws    = keywords(inv);
  const hasCase = investigations.some(i => matchKws(kws, i));
  const hasKb   = articles.some(a => matchKws(kws, a));
  if (hasCase && hasKb)  return "FULLY_COVERED";
  if (hasCase)           return "CASE_ONLY";
  if (hasKb)             return "KB_ONLY";
  return "DARK";
}

const CLASS_COLORS = {
  FULLY_COVERED: CY,
  CASE_ONLY:     AMBER,
  KB_ONLY:       GREEN,
  DARK:          RED,
};

const CLASS_ORDER = ["FULLY_COVERED", "CASE_ONLY", "KB_ONLY", "DARK"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestmentInvestigationKnowledge() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [invCount, setInvCount]     = useState(0);
  const [kbCount, setKbCount]       = useState(0);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [ir, invr, kbr] = await Promise.allSettled([
        fetch(`${base}/entities/Investment?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/investigations?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/knowledge/`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const investments    = toArr(ir.value);
      const investigations = toArr(invr.value);
      const articles       = toArr(kbr.value);
      setInvCount(investigations.length);
      setKbCount(articles.length);
      setRows(investments.map(inv => ({
        inv,
        cls: classify(inv, investigations, articles),
        matchedCases: investigations.filter(i => matchKws(keywords(inv), i)).slice(0, 5),
        matchedKb:    articles.filter(a => matchKws(keywords(inv), a)).slice(0, 5),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isIikmQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:iikm-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:iikm-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildIikmScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(ans || script);
      window.dispatchEvent(new CustomEvent("jarvis:tts", { detail: { text: ans || script } }));
    } catch {
      const fallback = await buildIikmScript();
      setAssessment(fallback);
    }
    setAssessing(false);
  }

  const darkCount = rows.filter(r => r.cls === "DARK").length;

  const displayRows = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = txt(r.inv);
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const stats = CLASS_ORDER.reduce((acc, cls) => {
    acc[cls] = rows.filter(r => r.cls === cls).length;
    return acc;
  }, {});

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment × Investigation × Knowledge Coverage (IIKM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 686,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${darkCount > 0 ? RED : "#334F62"}88`,
          borderRadius: 8, padding: "3px 8px", cursor: "pointer",
          color: open ? "#fff" : darkCount > 0 ? RED : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          boxShadow: darkCount > 0 ? `0 0 10px ${RED}44` : "none",
          animation: darkCount > 0 ? "iikm-pulse 2s infinite" : "none",
        }}
      >
        ◈ IIKM{darkCount > 0 ? ` ${darkCount}!` : ""}
      </button>
      <style>{`
        @keyframes iikm-pulse {
          0%,100% { box-shadow: 0 0 10px ${RED}44; }
          50%      { box-shadow: 0 0 20px ${RED}88; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", left: Math.max(8, BTN_LEFT - 340), bottom: 36, zIndex: 686,
          width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${RED}22`,
          fontFamily: MONO,
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>◈ IIKM</span>
            <span style={{ color: "#334F62", fontSize: 9 }}>investment intel coverage</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#334F62",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 10px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              ["INVESTMENTS", rows.length,      CY],
              ["CASES",       invCount,          AMBER],
              ["KB ARTICLES", kbCount,           GREEN],
              ["COVERED",     stats.FULLY_COVERED, CY],
              ["DARK",        darkCount,          RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "3px 7px", textAlign: "center", minWidth: 54,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#334F62", fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "4px 8px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)} style={{
                background: filter === cls ? `${CLASS_COLORS[cls] || CY}22` : "transparent",
                border: `1px solid ${filter === cls ? (CLASS_COLORS[cls] || CY) : "#1A2A38"}`,
                borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                color: filter === cls ? (CLASS_COLORS[cls] || CY) : "#334F62",
                fontSize: 8, letterSpacing: 0.5,
              }}>{cls === "ALL" ? `ALL (${rows.length})` : `${cls} (${stats[cls] || 0})`}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                padding: "4px 8px", color: CY, fontSize: 10,
                fontFamily: MONO, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "16px", color: "#334F62", fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "loading…" : "no matches"}
              </div>
            ) : displayRows.map((row, i) => {
              const { inv, cls, matchedCases, matchedKb } = row;
              const col   = CLASS_COLORS[cls];
              const label = inv?.name || inv?.title || inv?.ticker || inv?.id || `Investment ${i + 1}`;
              const itype = inv?.type || inv?.asset_class || inv?.sector || "";
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0A`, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.04)" : "transparent",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0,
                      boxShadow: cls === "DARK" ? `0 0 6px ${RED}` : "none",
                    }} />
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</span>
                    {itype && (
                      <span style={{ color: "#334F62", fontSize: 8, flexShrink: 0 }}>
                        {itype.slice(0, 12).toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: col, fontSize: 8, flexShrink: 0 }}>{cls}</span>
                    <span style={{ color: "#334F62", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "4px 12px 8px" }}>
                      {inv?.description && (
                        <div style={{ color: "#5A7A90", fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                          {inv.description.slice(0, 120)}
                        </div>
                      )}
                      {/* Investigations */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: AMBER, fontSize: 8, marginBottom: 3 }}>
                          INVESTIGATIONS ({matchedCases.length})
                        </div>
                        {matchedCases.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedCases.map((c, ci) => (
                            <div key={ci} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: AMBER,
                                  width: `${Math.min(100, 40 + ci * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(c?.title || c?.name || c?.id || "Case").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      {/* KB Articles */}
                      <div>
                        <div style={{ color: GREEN, fontSize: 8, marginBottom: 3 }}>
                          KB ARTICLES ({matchedKb.length})
                        </div>
                        {matchedKb.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedKb.map((a, ai) => (
                            <div key={ai} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: GREEN,
                                  width: `${Math.min(100, 40 + ai * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(a?.title || a?.name || a?.id || "Article").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} investments · {invCount} cases · {kbCount} articles
          </div>
        </div>
      )}
    </>
  );
}
