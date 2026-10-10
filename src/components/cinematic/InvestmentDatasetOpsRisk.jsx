/**
 * F194 — Investment × Dataset × OpsEvent — Portfolio Operational Risk Intelligence (PORI)
 *
 * Parallel-fetches /entities/Investment + /v1/datasets + /v1/ops/events every 90 s.
 * Keyword-correlates each investment against the dataset catalog AND live ops events:
 *
 *   FULLY_COVERED  — backed by ≥1 dataset AND flagged in ≥1 ops event (fully monitored)
 *   DATA_BACKED    — dataset coverage exists, no ops event exposure
 *   EVENT_EXPOSED  — ops event references it, no supporting dataset
 *   UNMONITORED    — neither dataset backing nor ops event tracking
 *
 * Stat tiles: investments / datasets / events / fully covered / unmonitored
 * Filter tabs: ALL | FULLY_COVERED | DATA_BACKED | EVENT_EXPOSED | UNMONITORED
 * Text search on investment name/type/sector.
 * Expand row → matched datasets (green bars) + matched events (amber bars).
 * Orange badge + pulse on UNMONITORED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ PORI  at bottom:8 left:986280, zIndex:695.
 * Event:   jarvis:pori-toggle
 * Voice:   "pori / portfolio risk / investment ops / investment dataset / ops risk / portfolio monitor"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 986_280;
const POLL_MS  = 90_000;
const GREEN    = "#00FF88";
const AMBER    = "#FFB020";
const ORANGE   = "#FF8C00";
const CY       = "#29E7FF";
const RED      = "#FF4545";
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

const PORI_RE =
  /\b(pori|portfolio\s+(?:operational\s+)?risk|investment\s+ops|investment\s+dataset|ops\s+risk|portfolio\s+monitor|investment\s+risk\s+intel|investment\s+coverage)\b/i;

export function isPoriQuery(q) {
  return PORI_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  const keys = ["investments","datasets","events","items","data","results","records"];
  for (const k of keys) if (Array.isArray(v[k])) return v[k];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.type, obj.sector, obj.category,
    obj.description, obj.summary, obj.tags, obj.symbol, obj.status,
    obj.asset_class, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/.-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const hay = [
    obj.name, obj.title, obj.type, obj.description, obj.summary,
    obj.tags, obj.status, obj.category, obj.dataset_name,
    obj.event_type, obj.severity, obj.service, obj.message,
    obj.sector, obj.asset_class, obj.symbol,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => hay.includes(k));
}

export async function buildPoriScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [invR, dsR, evR] = await Promise.allSettled([
      fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/datasets`,         { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/ops/events`,        { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const investments = toArr(invR.value);
    const datasets    = toArr(dsR.value);
    const events      = toArr(evR.value);
    let unmonitored = 0;

    for (const inv of investments) {
      const kws = keywords(inv);
      const hasDs  = datasets.some(d => matchKws(kws, d));
      const hasEv  = events.some(e => matchKws(kws, e));
      if (!hasDs && !hasEv) unmonitored++;
    }

    window.dispatchEvent(new CustomEvent("jarvis:pori-toggle"));
    return `PORI analysis: ${investments.length} investment${investments.length !== 1 ? "s" : ""} vs ` +
      `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} × ${events.length} ops event${events.length !== 1 ? "s" : ""}. ` +
      `${unmonitored} investment${unmonitored !== 1 ? "s are" : " is"} unmonitored — no dataset backing or ops event coverage. ` +
      `Recommend data pipeline coverage and operational alert wiring for exposed positions.`;
  } catch (e) {
    window.dispatchEvent(new CustomEvent("jarvis:pori-toggle"));
    return `PORI panel open, sir. Error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_COVERED: GREEN,
  DATA_BACKED:   CY,
  EVENT_EXPOSED: AMBER,
  UNMONITORED:   ORANGE,
};

function classify(inv, datasets, events) {
  const kws = keywords(inv);
  const hasDs = datasets.some(d => matchKws(kws, d));
  const hasEv = events.some(e => matchKws(kws, e));
  if (hasDs && hasEv)  return "FULLY_COVERED";
  if (hasDs && !hasEv) return "DATA_BACKED";
  if (!hasDs && hasEv) return "EVENT_EXPOSED";
  return "UNMONITORED";
}

function topMatches(kws, pool, n = 4) {
  return pool
    .map(obj => {
      const hay = [
        obj.name, obj.title, obj.type, obj.description, obj.summary,
        obj.tags, obj.status, obj.category, obj.dataset_name,
        obj.event_type, obj.severity, obj.service, obj.message,
        obj.sector, obj.asset_class, obj.symbol,
      ].filter(Boolean).join(" ").toLowerCase();
      const score = kws.filter(k => hay.includes(k)).length;
      return { obj, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(x => x.obj);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestmentDatasetOpsRisk() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [investments, setInvestments] = useState([]);
  const [datasets,  setDatasets]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [assessTxt, setAssessTxt] = useState({});
  const [loading,   setLoading]   = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [invR, dsR, evR] = await Promise.allSettled([
        fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/datasets`,         { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/ops/events`,        { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const invs = toArr(invR.value);
      const dss  = toArr(dsR.value);
      const evs  = toArr(evR.value);
      setInvestments(invs);
      setDatasets(dss);
      setEvents(evs);
      setRows(invs.map(inv => ({ inv, cls: classify(inv, dss, evs) })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => {
      const next = !o;
      if (next) load();
      return next;
    });
    window.addEventListener("jarvis:pori-toggle", toggle);
    return () => window.removeEventListener("jarvis:pori-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (open) {
      pollRef.current = setInterval(load, POLL_MS);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const handleAssess = useCallback(async (inv) => {
    const key = inv.id || inv.name || JSON.stringify(inv).slice(0, 32);
    setAssessing(key);
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Assess the operational risk and data coverage for this investment: ${JSON.stringify(inv)}. ` +
            `Cross-reference with available datasets and ops events. Respond in 2 sentences.`,
        }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessTxt(prev => ({ ...prev, [key]: txt }));
      if (txt && window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(txt);
        u.rate = 1.0; u.pitch = 0.85;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }
    } catch {
      setAssessTxt(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, []);

  const TABS = ["ALL", "FULLY_COVERED", "DATA_BACKED", "EVENT_EXPOSED", "UNMONITORED"];
  const counts = Object.fromEntries(TABS.map(t => [t, t === "ALL" ? rows.length : rows.filter(r => r.cls === t).length]));
  const unmonitoredCount = counts["UNMONITORED"] || 0;

  const filtered = rows.filter(({ inv, cls }) => {
    if (filter !== "ALL" && cls !== filter) return false;
    if (!search) return true;
    const hay = [inv.name, inv.type, inv.sector, inv.asset_class, inv.symbol, inv.description]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Portfolio Operational Risk Intelligence (PORI)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 695,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "#0A1525E8", border: `1px solid ${ORANGE}55`,
          color: ORANGE, borderRadius: 4, padding: "3px 7px",
          cursor: "pointer", userSelect: "none",
          boxShadow: unmonitoredCount > 0 ? `0 0 6px ${ORANGE}66` : "none",
          animation: unmonitoredCount > 0 ? "pori-pulse 2s ease-in-out infinite" : "none",
        }}
      >
        <style>{`@keyframes pori-pulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
        ◈ PORI{unmonitoredCount > 0 ? ` [${unmonitoredCount}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 460, zIndex: 695,
      width: 520, maxHeight: "74vh", display: "flex", flexDirection: "column",
      background: "#080F1CF2", border: `1px solid ${ORANGE}44`,
      borderRadius: 8, fontFamily: MONO, fontSize: 11,
      boxShadow: `0 0 24px ${ORANGE}22`,
      backdropFilter: "blur(12px)",
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${ORANGE}28`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: ORANGE, letterSpacing: 2, fontSize: 10 }}>
          ◈ PORTFOLIO OPERATIONAL RISK INTELLIGENCE
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#3E5060", fontSize: 9 }}>LOADING…</span>}
          <button onClick={load} style={{ background: "none", border: `1px solid ${ORANGE}33`, color: ORANGE, borderRadius: 3, padding: "2px 6px", cursor: "pointer", fontSize: 9 }}>↻</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#3E5060", cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "INVESTMENTS", val: investments.length, color: CY },
          { label: "DATASETS",    val: datasets.length,    color: GREEN },
          { label: "OPS EVENTS",  val: events.length,      color: AMBER },
          { label: "COVERED",     val: counts["FULLY_COVERED"] || 0, color: GREEN },
          { label: "UNMONITORED", val: unmonitoredCount, color: ORANGE, pulse: unmonitoredCount > 0 },
        ].map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex: "1 1 80px", background: "#0B1420", border: `1px solid ${color}33`,
            borderRadius: 5, padding: "5px 8px", textAlign: "center",
            boxShadow: pulse ? `0 0 8px ${color}44` : "none",
          }}>
            <div style={{ color, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#2E4060", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "0 14px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search investments…"
          style={{
            width: "100%", background: "#0B1420", border: `1px solid ${ORANGE}33`,
            color: "#A0C0D0", borderRadius: 4, padding: "4px 8px",
            fontFamily: MONO, fontSize: 10, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            fontFamily: MONO, fontSize: 8, letterSpacing: 1,
            background: filter === t ? `${CLASS_COLOR[t] || ORANGE}22` : "transparent",
            border: `1px solid ${filter === t ? (CLASS_COLOR[t] || ORANGE) : "#1E3040"}`,
            color: filter === t ? (CLASS_COLOR[t] || ORANGE) : "#3E5060",
            borderRadius: 3, padding: "2px 6px", cursor: "pointer",
          }}>
            {t} ({counts[t] || 0})
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {filtered.length === 0 && (
          <div style={{ color: "#2E4060", fontSize: 10, textAlign: "center", padding: "16px 0" }}>
            {loading ? "Fetching portfolio data…" : "No investments match filter."}
          </div>
        )}
        {filtered.map(({ inv, cls }, i) => {
          const key = inv.id || inv.name || String(i);
          const kws = keywords(inv);
          const matchedDs = topMatches(kws, datasets, 4);
          const matchedEv = topMatches(kws, events, 4);
          const clrC = CLASS_COLOR[cls] || ORANGE;
          const isExp = expanded === key;
          const aKey  = inv.id || inv.name || key;

          return (
            <div key={key} style={{
              marginBottom: 5, borderRadius: 5,
              border: `1px solid ${isExp ? clrC + "55" : "#1A2A3A"}`,
              background: isExp ? "#0C1520" : "transparent",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : key)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", cursor: "pointer",
                }}
              >
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: clrC,
                  border: `1px solid ${clrC}55`, borderRadius: 3,
                  padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0,
                }}>
                  {cls}
                </span>
                <span style={{ color: "#A0C0D0", flex: 1, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {inv.name || inv.title || inv.symbol || key}
                </span>
                {inv.type && (
                  <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{inv.type}</span>
                )}
                <span style={{ color: "#2E4060", fontSize: 9 }}>{isExp ? "▴" : "▾"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid #1A2A3A` }}>
                  {/* dataset matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    DATA SOURCES ({matchedDs.length})
                  </div>
                  {matchedDs.length > 0 ? matchedDs.map((d, di) => (
                    <div key={di} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: GREEN, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {d.name || d.title || d.dataset_name || `dataset-${di + 1}`}
                        </span>
                        <span style={{ color: "#2E4060", fontSize: 8, flexShrink: 0 }}>{d.type || d.category || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(d).toLowerCase().includes(k)).length * 15))}%`, background: GREEN, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No dataset matches.</div>
                  )}

                  {/* ops event matches */}
                  <div style={{ color: "#3E5060", fontSize: 8, letterSpacing: 1, margin: "6px 0 4px" }}>
                    OPS EVENTS ({matchedEv.length})
                  </div>
                  {matchedEv.length > 0 ? matchedEv.map((ev, ei) => (
                    <div key={ei} style={{ marginBottom: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
                        <span style={{ color: AMBER, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                          {ev.title || ev.name || ev.message || ev.event_type || `event-${ei + 1}`}
                        </span>
                        <span style={{ color: RED, fontSize: 8, flexShrink: 0 }}>{ev.severity || ev.status || ""}</span>
                      </div>
                      <div style={{ height: 3, background: "#0B1420", borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: "100%", width: `${Math.min(100, 40 + (kws.filter(k => JSON.stringify(ev).toLowerCase().includes(k)).length * 15))}%`, background: AMBER, borderRadius: 2 }} />
                      </div>
                    </div>
                  )) : (
                    <div style={{ color: "#2E4060", fontSize: 9, marginBottom: 4 }}>No ops event matches.</div>
                  )}

                  {/* ASSESS */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(inv); }}
                    disabled={assessing === aKey}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${ORANGE}18`, border: `1px solid ${ORANGE}44`,
                      color: ORANGE, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === aKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === aKey ? "ASSESSING…" : "▶ ASSESS"}
                  </button>

                  {assessTxt[aKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${ORANGE}0A`, border: `1px solid ${ORANGE}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessTxt[aKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${ORANGE}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{rows.length} INVESTMENTS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={load}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${ORANGE}33`,
            color: ORANGE, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
