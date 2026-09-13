/**
 * F184 — Live Intel × Risk Signal Convergence Monitor (LIRISCONV)
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes + crypto + FX) and
 * /entities/RiskSignal, then keyword-correlates each active risk signal
 * (title, category, description, tags) against live world events to surface:
 *
 *   TRIGGERED — at least one live event keyword-matches this risk signal
 *   DORMANT   — no live world event aligns with this risk signal
 *
 * Stat tiles: risk signals / live events / triggered / dormant
 * Filter tabs: ALL | TRIGGERED | DORMANT + text search
 * Expand risk signal → matched live events with type badge (SEISMIC/CRYPTO/FX)
 *   + relevance score.
 * Amber badge on triggered count.
 * ▶ ASSESS: 2-sentence convergence brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LIRISCONV  at bottom:8 left:64600, zIndex:125.
 * Event:   jarvis:lirisconv-toggle
 * Voice:   "live risk / world risk / intel risk / lirisconv / real-time risk /
 *           live risk signal / live signal convergence / risk world events"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 64600;
const POLL_MS  = 60_000;
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const CYAN     = "#29E7FF";
const VIOLET   = "#A78BFA";
const RED      = "#FF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const LIRISCONV_RE =
  /\b(live\s+risk[s]?(\s+signal[s]?)?|world\s+risk[s]?|intel\s+risk[s]?|lirisconv|real[\s-]?time\s+risk[s]?|live\s+signal[s]?\s+convergence|risk\s+world\s+event[s]?|live\s+world\s+risk[s]?|current\s+risk\s+trigger[s]?|active\s+risk\s+event[s]?)\b/i;

export function isLirisconvQuery(q) { return LIRISCONV_RE.test(q); }

export async function buildLirisconvScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, riskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
    ]);
    const events = normaliseEvents(await intelRes.json());
    const risks  = normaliseRisks(await riskRes.json());

    const triggered = risks.filter(
      (r) => events.some((e) => relevance(r, e) > 0)
    ).length;
    const dormant = risks.length - triggered;

    const criticals = risks.filter((r) =>
      ["critical", "high", "severe"].includes(String(r.severity || "").toLowerCase())
    ).length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS live intel risk convergence analysis: ${risks.length} active risk signals ` +
          `(${criticals} critical/high) cross-referenced against ${events.length} live world events ` +
          `(seismic, crypto, FX). ${triggered} risk signals are triggered by live world data; ` +
          `${dormant} signals have no current real-world convergence. ` +
          `Provide a 2-sentence convergence brief — formal British butler tone, ` +
          `first person, highlight any critical-severity triggered signals.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Live risk convergence analysis complete, sir.").trim();
  } catch {
    return "Live intel risk convergence assessment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  const crypto = Array.isArray(raw?.crypto)      ? raw.crypto      : [];
  const fx     = Array.isArray(raw?.fx)          ? raw.fx          :
                 Array.isArray(raw?.forex)        ? raw.forex       : [];

  const out = [];

  quakes.forEach((q, i) => {
    const mag  = q.magnitude ?? q.mag ?? q.properties?.mag ?? "";
    const place = q.place ?? q.location ?? q.properties?.place ?? "";
    const title = q.title ?? q.properties?.title ?? `M${mag} ${place}`;
    out.push({
      id:    `quake-${i}`,
      type:  "SEISMIC",
      title: String(title).slice(0, 120),
      body:  `magnitude:${mag} region:${place}`.slice(0, 200),
      col:   RED,
    });
  });

  crypto.forEach((c, i) => {
    const sym    = c.symbol ?? c.name ?? `CRYPTO${i}`;
    const change = c.change_24h ?? c.change ?? c.pct_change ?? "";
    out.push({
      id:    `crypto-${i}`,
      type:  "CRYPTO",
      title: `${sym} ${change ? (Number(change) >= 0 ? "+" : "") + Number(change).toFixed(2) + "%" : ""}`.trim(),
      body:  `asset:${sym} sector:cryptocurrency digital-asset blockchain`.slice(0, 200),
      col:   CYAN,
    });
  });

  fx.forEach((f, i) => {
    const pair = f.pair ?? f.symbol ?? f.name ?? `FX${i}`;
    const rate = f.rate ?? f.price ?? f.value ?? "";
    out.push({
      id:    `fx-${i}`,
      type:  "FX",
      title: `${pair}${rate ? " @ " + Number(rate).toFixed(4) : ""}`,
      body:  `currency:${pair} forex:${pair} exchange-rate`.slice(0, 200),
      col:   VIOLET,
    });
  });

  return out;
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.risks)                ? raw.risks
    : Array.isArray(raw?.risk_signals)         ? raw.risk_signals
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:       r.id            || r.risk_id            || String(i),
    title:    r.title         || r.name               || r.label        || `Risk ${i + 1}`,
    severity: r.severity      || r.level              || r.priority     || "medium",
    category: r.category      || r.type               || r.kind         || "",
    tags:     Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags        || ""),
    summary:  (r.description  || r.summary            || r.notes        || "").toString().slice(0, 300),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%+]+/)
    .filter((w) => w.length >= 3);
}

function relevance(risk, event) {
  const rw = keywords(
    `${risk.title} ${risk.category} ${risk.tags} ${risk.summary}`
  );
  const ew = keywords(`${event.title} ${event.body}`);
  return rw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(risks, events) {
  return risks.map((r) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(r, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...r, events: matched, triggered: matched.length > 0 };
  });
}

function severityColor(sev) {
  const lc = String(sev || "").toLowerCase();
  if (lc === "critical" || lc === "severe") return RED;
  if (lc === "high")                         return "#FF8C42";
  if (lc === "medium")                       return AMBER;
  if (lc === "low")                          return GREEN;
  return SLATE;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "DORMANT"];

export default function LiveIntelRiskConvergence() {
  const [open,       setOpen]       = useState(false);
  const [risks,      setRisks]      = useState([]);
  const [events,     setEvents]     = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [lastFetch,  setLastFetch]  = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelRes, riskRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
      ]);
      setEvents(normaliseEvents(await intelRes.json()));
      setRisks(normaliseRisks(await riskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => {
      setOpen((v) => {
        if (!v) load();
        return !v;
      });
    };
    window.addEventListener("jarvis:lirisconv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lirisconv-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildLirisconvScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(risks, events);
  const triggered = linked.filter((r) => r.triggered).length;
  const dormant   = linked.length - triggered;

  const displayed = linked.filter((r) => {
    if (filter === "TRIGGERED" && !r.triggered) return false;
    if (filter === "DORMANT"   && r.triggered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Risk Signal Convergence Monitor (LIRISCONV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 125,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${AMBER}55`,
          color: AMBER, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {triggered > 0
          ? <><span style={{ background: AMBER, color: "#000", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{triggered}</span>◈ LIRISCONV</>
          : "◈ LIRISCONV"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 125,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${AMBER}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${AMBER}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}33` }}>
        <span style={{ color: AMBER, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ LIRISCONV</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>LIVE INTEL × RISK SIGNAL CONVERGENCE</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: AMBER, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${AMBER}22` }}>
        {[
          { label: "RISK SIGNALS", value: linked.length, col: SLATE  },
          { label: "LIVE EVENTS",  value: events.length, col: CYAN   },
          { label: "TRIGGERED",    value: triggered,     col: AMBER  },
          { label: "DORMANT",      value: dormant,       col: GREEN  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${AMBER}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${AMBER}22` : "none",
            border: `1px solid ${filter === t ? AMBER : SLATE}`,
            color: filter === t ? AMBER : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${AMBER}`,
          color: AMBER, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* risk signal list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No risk signals match the current filter.
          </div>
        )}
        {displayed.map((r) => {
          const isExp = expanded === r.id;
          const col   = r.triggered ? AMBER : GREEN;
          const badge = r.triggered ? "TRIGGERED" : "DORMANT";
          return (
            <div key={r.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : r.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${AMBER}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${r.triggered ? `${AMBER}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col, flexShrink: 0,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{r.title}</span>
                {r.category && (
                  <span style={{
                    fontSize: 8, padding: "1px 5px", borderRadius: 4,
                    background: `${VIOLET}22`, color: VIOLET, letterSpacing: 1,
                  }}>
                    {r.category.slice(0, 10).toUpperCase()}
                  </span>
                )}
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: `${severityColor(r.severity)}22`, color: severityColor(r.severity),
                  letterSpacing: 1,
                }}>
                  {String(r.severity || "MED").toUpperCase().slice(0, 4)}
                </span>
                {r.triggered && (
                  <span style={{ fontSize: 8, color: AMBER }}>{r.events.length} event{r.events.length !== 1 ? "s" : ""}</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${AMBER}22` }}>
                  {r.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {r.summary.slice(0, 120)}
                    </div>
                  )}
                  {r.events.length === 0 ? (
                    <div style={{ fontSize: 9, color: GREEN }}>
                      No live world events correlate with this risk signal — signal is currently dormant.
                    </div>
                  ) : (
                    r.events.map((e) => (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${e.col}22`, color: e.col, letterSpacing: 1, flexShrink: 0,
                        }}>
                          {e.type}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{e.title}</span>
                        <span style={{ fontSize: 8, color: AMBER }}>rel:{e.score}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
