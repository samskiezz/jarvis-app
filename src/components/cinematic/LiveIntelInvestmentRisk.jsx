/**
 * F158 — Live Intel × Investment × Risk Signal Financial Threat Pulse (LIFRISK)
 *
 * Answers: "Which portfolio investments are exposed by live market intel AND
 *           active risk signals — and which are currently stable?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /functions/getLiveIntel  → live quake/crypto/FX events
 *   GET /entities/Investment     → portfolio positions (name/type/sector/description)
 *   GET /entities/RiskSignal     → active risk signals (title/description/severity)
 *
 * Classification per investment (keyword correlation):
 *   THREAT_FLAGGED   — matched live intel + risk signal (full exposure — highest risk)
 *   MARKET_VOLATILE  — matched live intel only (market movement, no formal risk signal)
 *   RISK_MONITORED   — matched risk signal only (risk flagged, no current market event)
 *   STABLE           — matched neither (no current exposure)
 *
 * Stat tiles: INVESTMENTS / LIVE EVENTS / RISK SIGNALS + four class counts + THREAT%
 * Red badge on THREAT_FLAGGED count.
 * ▶ ASSESS EXPOSURE: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ LIFRISK  at left:1030840, bottom:8, zIndex:219.
 * Event:   jarvis:lifrisk-toggle
 * Voice:   "lifrisk / financial threat / live investment threat / market risk pulse /
 *           investment market risk / crypto investment risk"
 * Refresh: 5 min auto-poll (live intel changes frequently).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const RED    = "#FF3B6B";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const ORANGE = "#FF7B1C";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1030840;
const REFRESH_MS = 300_000; // 5 min — live intel data rotates frequently
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","investments","signals","events",
                     "earthquakes","crypto","fx","liveEvents","intel"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function extractLiveEvents(raw) {
  // /functions/getLiveIntel returns { earthquakes: [...], crypto: [...], fx: [...] }
  const events = [];
  if (raw && typeof raw === "object") {
    const eq = raw.earthquakes || raw.quakes || [];
    for (const e of (Array.isArray(eq) ? eq : [])) {
      events.push({ name: e.place || e.location || "Seismic event", type: "SEISMIC",
                    description: `M${e.magnitude||""} ${e.place||""}` });
    }
    const cr = raw.crypto || [];
    for (const c of (Array.isArray(cr) ? cr : [])) {
      events.push({ name: c.symbol || c.name || "Crypto", type: "CRYPTO",
                    description: `${c.symbol||""} ${c.price||""} ${c.change||""}` });
    }
    const fx = raw.fx || raw.forex || [];
    for (const f of (Array.isArray(fx) ? fx : [])) {
      events.push({ name: f.pair || f.symbol || "FX pair", type: "FX",
                    description: `${f.pair||""} ${f.rate||""} ${f.change||""}` });
    }
    if (events.length === 0) {
      // Flat array fallback
      for (const item of normArr(raw)) {
        events.push({ name: item.name || item.title || item.symbol || "Event",
                      type: item.type || "INTEL",
                      description: [item.description, item.place, item.summary].filter(Boolean).join(" ") });
      }
    }
  }
  return events;
}

function words(item) {
  const str = [
    item.name, item.title, item.description, item.type,
    item.sector, item.category, item.tags, item.summary,
    item.symbol, item.pair, item.place, item.content,
  ].filter(Boolean).join(" ").toLowerCase();
  return str.split(/\W+/).filter(s => s.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  let hits = 0;
  for (const w of words(b)) if (setA.has(w)) hits++;
  return hits;
}

function relevancePct(hits, maxHits) {
  if (!maxHits) return 0;
  return Math.min(100, Math.round((hits / maxHits) * 100));
}

// ─── exported helpers wired by JarvisBrain ───────────────────────────────────

const LIFRISK_RE = /\b(lifrisk|financial\s+threat|live\s+investment\s+threat|market\s+risk\s+pulse|investment\s+market\s+risk|crypto\s+investment\s+risk)\b/i;

export function isLifriskQuery(q) {
  return LIFRISK_RE.test(q);
}

export async function buildLifriskScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [liveRaw, invRaw, riskRaw] = await Promise.all([
    fetch(`${base}/functions/getLiveIntel`, { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const events      = extractLiveEvents(liveRaw);
  const investments = normArr(invRaw);
  const signals     = normArr(riskRaw);

  let threatened = 0;
  for (const inv of investments) {
    const hasLive = events.some(e => overlap(inv, e) > 0);
    const hasRisk = signals.some(s => overlap(inv, s) > 0);
    if (hasLive && hasRisk) threatened++;
  }
  const pct = investments.length ? Math.round(((investments.length - threatened) / investments.length) * 100) : 0;
  return `LIFRISK Financial Threat Pulse active, sir. Cross-referencing ${investments.length} portfolio investments against ${events.length} live intel events and ${signals.length} risk signals. ${threatened} investments are fully THREAT_FLAGGED — ${pct}% of the portfolio shows no current exposure.`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LiveIntelInvestmentRisk() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ investments: 0, liveEvents: 0, signals: 0, threatened: 0, volatile: 0, monitored: 0, stable: 0 });
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [liveRaw, invRaw, riskRaw] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: h }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const events      = extractLiveEvents(liveRaw);
      const investments = normArr(invRaw);
      const signals     = normArr(riskRaw);

      const built = investments.map(inv => {
        const liveMatches = events
          .map(e => ({ item: e, hits: overlap(inv, e) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const riskMatches = signals
          .map(s => ({ item: s, hits: overlap(inv, s) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const hasLive = liveMatches.length > 0;
        const hasRisk = riskMatches.length > 0;
        const cls = hasLive && hasRisk ? "THREAT_FLAGGED"
                  : hasLive           ? "MARKET_VOLATILE"
                  : hasRisk           ? "RISK_MONITORED"
                  :                     "STABLE";
        return { inv, liveMatches, riskMatches, cls };
      });

      const threatened = built.filter(r => r.cls === "THREAT_FLAGGED").length;
      const volatile_  = built.filter(r => r.cls === "MARKET_VOLATILE").length;
      const monitored  = built.filter(r => r.cls === "RISK_MONITORED").length;
      const stable     = built.filter(r => r.cls === "STABLE").length;

      setRows(built);
      setStats({ investments: investments.length, liveEvents: events.length,
                 signals: signals.length, threatened, volatile: volatile_, monitored, stable });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:lifrisk-toggle", h);
    return () => window.removeEventListener("jarvis:lifrisk-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx = `Investments:${stats.investments} LiveEvents:${stats.liveEvents} RiskSignals:${stats.signals} `
                + `THREAT_FLAGGED:${stats.threatened} MARKET_VOLATILE:${stats.volatile} `
                + `RISK_MONITORED:${stats.monitored} STABLE:${stats.stable}`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `LIFRISK snapshot — ${ctx}. Provide a 2-sentence financial threat exposure brief. Which threat-flagged investments require immediate operator attention and what protective action should be considered?` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || "Financial threat assessment complete, sir.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Financial threat assessment complete, sir.");
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  if (!open) {
    const threatenedCount = stats.threatened;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel × Investment × Risk Signal Financial Threat Pulse (LIFRISK)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 219,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${threatenedCount > 0 ? RED : CY}55`,
          color: threatenedCount > 0 ? RED : CY, cursor: "pointer", borderRadius: 4,
          padding: "3px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          backdropFilter: "blur(4px)", whiteSpace: "nowrap",
        }}
      >
        ◈ LIFRISK{threatenedCount > 0
          ? <span style={{ marginLeft: 4, background: RED, color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: 8 }}>{threatenedCount}</span>
          : null}
      </button>
    );
  }

  const TABS = ["ALL","THREAT_FLAGGED","MARKET_VOLATILE","RISK_MONITORED","STABLE"];
  const clsColor = {
    THREAT_FLAGGED:  RED,
    MARKET_VOLATILE: ORANGE,
    RISK_MONITORED:  AMBER,
    STABLE:          GREEN,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.inv.name, r.inv.description, r.inv.title, r.inv.type, r.inv.sector]
        .filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const threatPct = stats.investments ? Math.round((stats.threatened / stats.investments) * 100) : 0;

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 9000, width: "min(760px,95vw)", maxHeight: "85vh",
      background: BG, border: `1px solid ${RED}44`, borderRadius: 12,
      boxShadow: `0 0 60px ${RED}18`, fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ padding: "12px 18px 8px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: RED, fontSize: 16 }}>◎</span>
        <b style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>LIFRISK</b>
        <span style={{ color: MUTED, fontSize: 10 }}>Live Intel × Investment × Risk Signal Financial Threat Pulse</span>
        <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 18px", flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS",   stats.investments, CY],
          ["LIVE EVENTS",   stats.liveEvents,  ORANGE],
          ["RISK SIGNALS",  stats.signals,     AMBER],
          ["THREAT FLAGGED",stats.threatened,  RED],
          ["MKT VOLATILE",  stats.volatile,    ORANGE],
          ["RISK MON.",     stats.monitored,   AMBER],
          ["STABLE",        stats.stable,      GREEN],
          ["THREAT%",       `${threatPct}%`,   RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* threat exposure bar */}
      <div style={{ padding: "0 18px 8px" }}>
        <div style={{ height: 4, background: `${RED}15`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${threatPct}%`, height: "100%", background: `linear-gradient(90deg,${GREEN},${ORANGE},${RED})`, transition: "width 0.5s" }} />
        </div>
        <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>{threatPct}% of portfolio investments are threat-flagged (live intel + risk signal)</div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${CY}22` : "none", border: `1px solid ${filter === t ? CY : CY+"33"}`,
            color: filter === t ? CY : MUTED, cursor: "pointer", borderRadius: 4,
            padding: "2px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 0.5,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: MONO, outline: "none", width: 150 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
        {loading && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>Loading financial threat pulse…</div>}
        {error   && <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>No investments match the current filter.</div>}
        {visible.map((row, i) => {
          const isExp = expanded === i;
          const cc = clsColor[row.cls] || CY;
          const isPulsed = row.cls === "THREAT_FLAGGED";
          return (
            <div key={i} style={{ borderBottom: `1px solid ${CY}11`, padding: "8px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : i)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                  boxShadow: isPulsed ? `0 0 8px ${RED}` : "none",
                  animation: isPulsed ? "lifriskPulse 1.2s ease-in-out infinite" : "none",
                }} />
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {row.inv.name || row.inv.title || "(unnamed investment)"}
                </span>
                <span style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>
                  {row.inv.type || row.inv.sector || ""}
                </span>
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: cc,
                  background: `${cc}18`, border: `1px solid ${cc}44`,
                  borderRadius: 3, padding: "1px 6px",
                }}>{row.cls}</span>
                <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 16 }}>
                  {/* live intel matches */}
                  {row.liveMatches.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 4 }}>LIVE INTEL EVENTS ({row.liveMatches.length})</div>
                      {row.liveMatches.map((m, j) => {
                        const pct = relevancePct(m.hits, row.liveMatches[0].hits);
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${ORANGE}08`, borderRadius: 4, border: `1px solid ${ORANGE}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: ORANGE, background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>
                                {(m.item.type || "INTEL").toUpperCase()}
                              </span>
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.name || m.item.title || "(event)"}</span>
                            </div>
                            {m.item.description && (
                              <div style={{ fontSize: 9, color: MUTED, paddingLeft: 2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {m.item.description.slice(0, 80)}
                              </div>
                            )}
                            <div style={{ marginTop: 3, height: 3, background: `${ORANGE}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* risk signal matches */}
                  {row.riskMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RED, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS ({row.riskMatches.length})</div>
                      {row.riskMatches.map((m, j) => {
                        const pct = relevancePct(m.hits, row.riskMatches[0].hits);
                        const sev = (m.item.severity || "").toUpperCase();
                        const sevColor = sev === "CRITICAL" ? RED : sev === "HIGH" ? ORANGE : AMBER;
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${RED}08`, borderRadius: 4, border: `1px solid ${RED}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {sev && (
                                <span style={{ fontSize: 8, color: sevColor, background: `${sevColor}22`, border: `1px solid ${sevColor}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>
                                  {sev}
                                </span>
                              )}
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.title || m.item.name || "(signal)"}</span>
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: `${RED}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: RED, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {row.liveMatches.length === 0 && row.riskMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: GREEN, paddingLeft: 4 }}>No current exposure — investment is STABLE.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ borderTop: `1px solid ${CY}22`, padding: "10px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || rows.length === 0} style={{
          background: assessing ? "none" : `${RED}22`, border: `1px solid ${RED}55`,
          color: RED, cursor: assessing ? "default" : "pointer",
          borderRadius: 4, padding: "4px 14px", fontSize: 10, fontFamily: MONO, letterSpacing: 1,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS EXPOSURE"}
        </button>
        {brief && (
          <div style={{ flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      <style>{`
        @keyframes lifriskPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.7); opacity: .35; }
        }
      `}</style>
    </div>
  );
}
