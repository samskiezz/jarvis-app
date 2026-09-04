/**
 * F182 — Live Intel × Scenario Alignment (LISCEN)
 *
 * Parallel-fetches /functions/getLiveIntel (earthquakes + markets) and
 * /v1/scenario/list, then keyword-correlates each active operational scenario
 * against real-world live events to surface:
 *
 *   TRIGGERED — at least one live world event aligns with this scenario's
 *               context (possible real-world activation signal)
 *   DORMANT   — no live world-event correlation found
 *
 * Live events include seismic events (by region/magnitude) and market
 * movements (by ticker, sector, directional extremes).
 *
 * Stat tiles: scenarios / live events / triggered / dormant
 * Filter tabs: ALL | TRIGGERED | DORMANT + text search
 * Expand scenario → matched live events with event-type badge + relevance score.
 * Cyan badge on triggered count.
 * ▶ ASSESS: 2-sentence scenario-intel alignment brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ LISCEN  at bottom:8 left:63480, zIndex:123.
 * Event:   jarvis:liscen-toggle
 * Voice:   "live scenario / world scenario / liscen / intel scenario /
 *           scenario trigger / triggered scenario / live world scenario"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getLiveIntel } from "@/api/backendFunctions";

const BTN_LEFT = 63480;
const POLL_MS  = 60_000;
const CYAN     = "#29E7FF";
const AMBER    = "#F59E0B";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const LISCEN_RE =
  /\b(live\s+scenario[s]?|world\s+scenario[s]?|liscen|intel\s+scenario[s]?|scenario\s+trigger[s]?|triggered\s+scenario[s]?|live\s+world\s+scenario[s]?|real.?world\s+scenario[s]?|scenario\s+alignment|which\s+scenario[s]?\s+(match|align|trigger)|active\s+scenario\s+intel)\b/i;

export function isLiscenQuery(q) { return LISCEN_RE.test(q); }

export async function buildLiscenScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, scenRes] = await Promise.all([
      getLiveIntel({ type: "all" }),
      fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    ]);
    const events    = normaliseLiveEvents(intelRes);
    const scenarios = normaliseScenarios(await scenRes.json());

    const triggered = scenarios.filter(
      (s) => events.some((e) => relevance(s, e) > 0)
    ).length;
    const dormant = scenarios.length - triggered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS live intel × scenario alignment: ${scenarios.length} active operational scenarios, ` +
          `${events.length} live world events (seismic + market). ${triggered} scenarios have ` +
          `real-world live-event alignment — possible activation signals. ${dormant} scenarios ` +
          `show no current world-event correlation. ` +
          `Provide a 2-sentence scenario-intel alignment brief — formal British butler ` +
          `tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Live intel scenario alignment analysis complete, sir.").trim();
  } catch {
    return "Live intel scenario alignment unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseLiveEvents(raw) {
  const events = [];

  // Seismic events
  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  quakes.forEach((q, i) => {
    const mag   = Number(q.mag || q.magnitude || 0);
    const place = String(q.place || q.location || q.region || "");
    const label = `M${mag.toFixed(1)} earthquake — ${place}`;
    const text  = `seismic earthquake magnitude ${mag} ${place} tectonic quake tremor`;
    events.push({
      id:    `quake-${i}`,
      type:  "SEISMIC",
      label,
      text:  `${label} ${text}`,
      mag,
    });
  });

  // Market movements
  const markets = Array.isArray(raw?.markets) ? raw.markets : [];
  markets.forEach((m, i) => {
    const sym  = String(m.symbol || m.display || "");
    const ch   = Number(m.change_pct || m.change || 0);
    const dir  = ch >= 0 ? "rising surge bull" : "falling crash bear drop decline";
    const abs  = Math.abs(ch);
    const label = `${sym} ${ch >= 0 ? "▲" : "▼"} ${abs.toFixed(2)}%`;
    events.push({
      id:    `market-${i}`,
      type:  abs > 5 ? "EXTREME" : "MARKET",
      label,
      text:  `market finance ${sym} ${dir} ${abs.toFixed(2)} percent crypto fx currency asset`,
      change: ch,
    });
  });

  return events;
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)                 ? raw
    : Array.isArray(raw?.scenarios)              ? raw.scenarios
    : Array.isArray(raw?.items)                  ? raw.items
    : Array.isArray(raw?.data)                   ? raw.data
    : Array.isArray(raw?.results)                ? raw.results
    : [];
  return arr.map((s, i) => ({
    id:      s.id          || s.scenario_id   || String(i),
    title:   s.title       || s.name          || s.label       || `Scenario ${i + 1}`,
    status:  s.status      || s.state         || "active",
    summary: (s.description || s.summary      || s.notes       || "").toString().slice(0, 300),
    tags:    Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    type:    s.type        || s.category      || s.kind        || "",
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()\[\]"'%▲▼]+/)
    .filter((w) => w.length >= 3);
}

function relevance(scenario, event) {
  const sw = keywords(`${scenario.title} ${scenario.summary} ${scenario.tags} ${scenario.type}`);
  const ew = keywords(event.text);
  return sw.filter((w) => ew.some((p) => p.includes(w) || w.includes(p))).length;
}

function buildLinked(scenarios, events) {
  return scenarios.map((s) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(s, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...s, events: matched, triggered: matched.length > 0 };
  });
}

function statusColor(status) {
  const lc = String(status || "").toLowerCase();
  if (lc.includes("active") || lc.includes("run"))             return CYAN;
  if (lc.includes("complet") || lc.includes("done"))           return GREEN;
  if (lc.includes("pending") || lc.includes("plan"))           return AMBER;
  if (lc.includes("cancel") || lc.includes("abort"))           return "#FF4444";
  return SLATE;
}

function eventTypeColor(type) {
  if (type === "SEISMIC")  return AMBER;
  if (type === "EXTREME")  return "#FF4444";
  if (type === "MARKET")   return CYAN;
  return VIOLET;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "DORMANT"];

export default function LiveIntelScenarioAlignment() {
  const [open,       setOpen]       = useState(false);
  const [scenarios,  setScenarios]  = useState([]);
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
      const [intelRes, scenRes] = await Promise.all([
        getLiveIntel({ type: "all" }),
        fetch(`${base}/v1/scenario/list`, { headers: hdr }),
      ]);
      setEvents(normaliseLiveEvents(intelRes));
      setScenarios(normaliseScenarios(await scenRes.json()));
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
    window.addEventListener("jarvis:liscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:liscen-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    const text = await buildLiscenScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const linked    = buildLinked(scenarios, events);
  const triggered = linked.filter((s) => s.triggered).length;
  const dormant   = linked.length - triggered;

  const displayed = linked.filter((s) => {
    if (filter === "TRIGGERED" && !s.triggered) return false;
    if (filter === "DORMANT"   && s.triggered)  return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      s.summary.toLowerCase().includes(q)
    );
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Live Intel × Scenario Alignment (LISCEN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 123,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CYAN}55`,
          color: CYAN, padding: "3px 10px", borderRadius: 6,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          cursor: "pointer", backdropFilter: "blur(6px)",
          letterSpacing: 1,
        }}
      >
        {triggered > 0
          ? <><span style={{ background: CYAN, color: "#04060A", borderRadius: 4, padding: "0 4px", marginRight: 4, fontWeight: 700 }}>{triggered}</span>◈ LISCEN</>
          : "◈ LISCEN"
        }
      </button>
    );
  }

  const TILE = { flex: "1 1 100px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px", textAlign: "center" };

  return (
    <div style={{
      position: "fixed", bottom: 52, left: BTN_LEFT - 360, zIndex: 123,
      width: 500, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: "rgba(6,10,16,0.95)", border: `1px solid ${CYAN}44`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: `0 0 40px ${CYAN}22`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}33` }}>
        <span style={{ color: CYAN, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>◈ LISCEN</span>
        <span style={{ color: SLATE, fontSize: 9, flex: 1 }}>LIVE INTEL × SCENARIO ALIGNMENT</span>
        {lastFetch && <span style={{ color: SLATE, fontSize: 8 }}>{lastFetch.toLocaleTimeString()}</span>}
        {loading && <span style={{ color: CYAN, fontSize: 9 }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{ marginLeft: 4, background: "none", border: "none", color: SLATE, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CYAN}22` }}>
        {[
          { label: "SCENARIOS",  value: linked.length,   col: SLATE  },
          { label: "LIVE EVENTS", value: events.length,  col: VIOLET },
          { label: "TRIGGERED",  value: triggered,       col: CYAN   },
          { label: "DORMANT",    value: dormant,         col: SLATE  },
        ].map(({ label, value, col }) => (
          <div key={label} style={TILE}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{value}</div>
            <div style={{ color: SLATE, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* controls */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CYAN}22`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${CYAN}22` : "none",
            border: `1px solid ${filter === t ? CYAN : SLATE}`,
            color: filter === t ? CYAN : SLATE,
            borderRadius: 5, padding: "2px 8px", fontSize: 9,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search scenarios…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(255,255,255,0.04)",
            border: "1px solid #6E8AA044", borderRadius: 5, padding: "2px 8px",
            color: "#DCEBF5", fontSize: 9, outline: "none",
          }}
        />
        <button onClick={assess} disabled={assessing} style={{
          background: "none", border: `1px solid ${CYAN}`,
          color: CYAN, borderRadius: 5, padding: "2px 8px",
          fontSize: 9, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* scenario list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {displayed.length === 0 && !loading && (
          <div style={{ color: SLATE, fontSize: 10, textAlign: "center", padding: 20 }}>
            No scenarios match the current filter.
          </div>
        )}
        {displayed.map((s) => {
          const isExp  = expanded === s.id;
          const col    = s.triggered ? CYAN : SLATE;
          const badge  = s.triggered ? "TRIGGERED" : "DORMANT";
          return (
            <div key={s.id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 7, cursor: "pointer",
                  background: isExp ? `${CYAN}11` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${s.triggered ? `${CYAN}44` : "#6E8AA022"}`,
                  transition: "background 0.2s",
                }}
              >
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "1px 5px",
                  borderRadius: 4, background: `${col}22`, color: col,
                }}>
                  {badge}
                </span>
                <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5" }}>{s.title}</span>
                <span style={{
                  fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                  background: `${statusColor(s.status)}22`, color: statusColor(s.status),
                  letterSpacing: 1,
                }}>
                  {String(s.status || "ACTIVE").toUpperCase().slice(0, 8)}
                </span>
                {s.triggered && (
                  <span style={{ fontSize: 8, color: CYAN }}>{s.events.length} evt.</span>
                )}
                <span style={{ color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ margin: "4px 0 4px 12px", padding: "8px 10px", borderRadius: 7, background: "rgba(255,255,255,0.02)", border: `1px solid ${CYAN}22` }}>
                  {s.summary && (
                    <div style={{ fontSize: 9, color: SLATE, marginBottom: 6 }}>
                      {s.summary.slice(0, 120)}
                    </div>
                  )}
                  {s.events.length === 0 ? (
                    <div style={{ fontSize: 9, color: SLATE }}>
                      No live world events correlate with this scenario — currently dormant.
                    </div>
                  ) : (
                    s.events.map((e) => (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, padding: "4px 8px", borderRadius: 5, background: "rgba(255,255,255,0.03)" }}>
                        <span style={{
                          fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                          background: `${eventTypeColor(e.type)}22`, color: eventTypeColor(e.type),
                          letterSpacing: 1,
                        }}>
                          {e.type}
                        </span>
                        <span style={{ flex: 1, fontSize: 9, color: "#DCEBF5" }}>{e.label}</span>
                        <span style={{ fontSize: 8, color: CYAN }}>rel:{e.score}</span>
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
