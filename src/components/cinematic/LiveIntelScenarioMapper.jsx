/**
 * LiveIntelScenarioMapper — F212.
 *
 * Parallel-fetches /functions/getLiveIntel (quakes + crypto + FX)
 * and /v1/scenario/list.
 *
 * Derives discrete live events (one row per seismic event, one row per
 * market asset) and keyword-correlates each against the full scenario
 * catalog (name / objective / tags / type) to surface:
 *   COVERED  — at least one scenario prepares for this event
 *   UNPLANNED — no scenario covers this event type
 *
 * Stat tiles: live events / scenarios / covered / unplanned
 * Filter tabs: ALL / COVERED / UNPLANNED + text search
 * Expand event → matched scenarios with type badge + relevance score.
 * ▶ ASSESS per event → /v1/jarvis/agent/chat 2-sentence readiness
 *   brief + TTS via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "intel scenario" / "live event coverage" / "are we prepared" /
 *         "scenario readiness" / "lisc" / "intel readiness" /
 *         "scenario coverage for live events"
 *   → jarvis:lisc-toggle + TTS brief via buildLiscScript()
 *
 * Toggle: ◈ LISC at left:31640, bottom:8, zIndex:62.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";
const TEAL  = "#00D4AA";

const BTN_LEFT   = 31640;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseScenarios(raw) {
  return normaliseArray(raw).map((s) => ({
    id:        s.id || String(Math.random()),
    name:      s.name || s.title || s.scenario_name || "Unnamed Scenario",
    type:      s.type || s.scenario_type || s.category || "general",
    status:    s.status || s.state || "unknown",
    objective: s.objective || s.description || s.details || "",
    tags:      Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
  }));
}

/** Flatten live intel into discrete event rows. */
function extractEvents(data) {
  const events = [];

  // Seismic events
  const quakes = Array.isArray(data?.quakes) ? data.quakes : [];
  for (const q of quakes) {
    const mag  = q.magnitude ?? q.mag ?? null;
    const loc  = q.location || q.place || q.region || "Unknown location";
    events.push({
      id:      `quake-${q.id || Math.random()}`,
      kind:    "SEISMIC",
      label:   `Seismic M${mag != null ? mag.toFixed(1) : "?"} — ${loc}`,
      detail:  `magnitude ${mag}, ${loc}`,
      keywords: [
        "earthquake", "seismic", "quake", "tremor", "tectonic",
        "disaster", "natural disaster", "geological",
        ...(loc.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 2)),
      ],
    });
  }

  // Market assets (crypto + FX)
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  for (const m of markets) {
    const sym     = m.symbol || m.ticker || m.name || "";
    const display = m.display || m.name || sym;
    const chg     = m.change_pct ?? m.changePercent ?? m.pct_change ?? null;
    const atype   = m.asset_type === "FX" || m.type === "FX" ? "FX" : "CRYPTO";
    if (!sym) continue;
    const absChg = chg != null ? Math.abs(Number(chg)) : 0;
    events.push({
      id:      `market-${sym}`,
      kind:    atype,
      label:   `${display} (${sym}) ${chg != null ? (Number(chg) >= 0 ? "+" : "") + Number(chg).toFixed(2) + "%" : ""}`,
      detail:  `${atype} asset ${display}, change ${chg != null ? Number(chg).toFixed(2) + "%" : "N/A"}`,
      keywords: [
        sym.toLowerCase(),
        display.toLowerCase(),
        atype === "FX" ? "currency" : "crypto",
        atype === "FX" ? "forex" : "cryptocurrency",
        atype === "FX" ? "exchange rate" : "bitcoin",
        "financial", "market", "trading",
        ...(absChg >= 8 ? ["spike", "crash", "volatility", "flash"] : []),
        ...(display.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2)),
      ],
    });
  }

  return events;
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function matchScore(event, scenario) {
  const scenText = `${scenario.name} ${scenario.type} ${scenario.objective} ${scenario.tags}`.toLowerCase();
  return event.keywords.reduce((acc, kw) => acc + (scenText.includes(kw) ? 1 : 0), 0)
    + tokens(event.label).reduce((acc, w) => acc + (scenText.includes(w) ? 1 : 0), 0);
}

function correlate(events, scenarios) {
  return events.map((ev) => {
    const matched = scenarios
      .map((s) => ({ ...s, _score: matchScore(ev, s) }))
      .filter((s) => s._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...ev, matched };
  });
}

function kindCol(kind) {
  if (kind === "SEISMIC") return AMBER;
  if (kind === "FX")      return TEAL;
  return CY;
}

function statusCol(status) {
  const s = String(status).toLowerCase();
  if (s === "active" || s === "running") return GREEN;
  if (s === "planned")                   return CY;
  if (s === "completed")                 return "#667788";
  return AMBER;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const LISC_RE =
  /intel.{0,15}scenario|scenario.{0,15}intel|live.{0,12}event.{0,15}coverage|are.{0,8}we.{0,8}prepared|scenario.{0,10}readiness|readiness.{0,10}scenario|lisc\b|intel.{0,10}readiness|scenario.{0,15}coverage.{0,15}live|live.{0,12}intel.{0,12}scenario/i;

export function isLiscQuery(q) {
  return LISC_RE.test(q || "");
}

export async function buildLiscScript() {
  try {
    const [intelData, scenRaw] = await Promise.all([
      getLiveIntel({ type: "all" }),
      fetch(`${apiBase()}/v1/scenario/list`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const events    = extractEvents(intelData);
    const scenarios = normaliseScenarios(scenRaw);
    const corr      = correlate(events, scenarios);
    const covered   = corr.filter((e) => e.matched.length > 0);
    const unplanned = corr.filter((e) => e.matched.length === 0);
    const topUncovered = unplanned.slice(0, 2).map((e) => `"${e.label}"`).join(", ");
    return `Live-intel scenario readiness check complete, sir. ${events.length} live event${events.length !== 1 ? "s" : ""} cross-referenced against ${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""} in the catalog. ${covered.length} event${covered.length !== 1 ? "s have" : " has"} matching scenario coverage${unplanned.length > 0 ? `; ${unplanned.length} event${unplanned.length !== 1 ? "s are" : " is"} unplanned${topUncovered ? ` — including ${topUncovered}` : ""}` : " — all events are covered"}. I recommend reviewing unplanned events and activating or creating appropriate response scenarios immediately.`;
  } catch (_) {
    return "Live intel scenario mapper is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function LiveIntelScenarioMapper() {
  const [visible, setVisible]     = useState(false);
  const [events, setEvents]       = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [intelData, scenRaw] = await Promise.all([
        getLiveIntel({ type: "all" }),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setEvents(extractEvents(intelData));
      setScenarios(normaliseScenarios(scenRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:lisc-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lisc-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessEvent(ev, matched) {
    setAssessing(ev.id);
    const scenList = matched.length > 0
      ? matched.map((s) => s.name).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence operational readiness brief on the live ${ev.kind} event "${ev.label}" and its scenario coverage: ${scenList}. State whether current scenarios are sufficient to address this event and recommend any immediate action.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = (data.answer || "Readiness brief unavailable.").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: "Readiness assessment unavailable." } }));
    } finally {
      setAssessing(null);
    }
  }

  const correlated = correlate(events, scenarios);
  const covered    = correlated.filter((e) => e.matched.length > 0);
  const unplanned  = correlated.filter((e) => e.matched.length === 0);

  const q = search.trim().toLowerCase();
  const visible_rows = correlated.filter((e) => {
    if (tab === "COVERED"   && e.matched.length === 0) return false;
    if (tab === "UNPLANNED" && e.matched.length > 0)   return false;
    if (q) return e.label.toLowerCase().includes(q) || e.kind.toLowerCase().includes(q);
    return true;
  });

  if (!visible) {
    return (
      <button
        title="Live Intel × Scenario Mapper (LISC)"
        onClick={() => setVisible(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 62,
          background: "rgba(0,5,12,0.82)", border: `1px solid ${CY}44`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 1.5, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", userSelect: "none",
        }}
      >
        ◈ LISC{unplanned.length > 0 && <span style={{ color: AMBER, marginLeft: 4 }}>{unplanned.length}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, zIndex: 9200,
      width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: "rgba(2,8,18,0.97)", border: `1px solid ${CY}33`,
      borderTop: `2px solid ${CY}`, borderRadius: 10,
      boxShadow: `0 0 50px ${CY}18, 0 18px 48px rgba(0,0,0,0.85)`,
      fontFamily: "'JetBrains Mono','Courier New',monospace",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 8px",
        borderBottom: `1px solid ${CY}22`,
      }}>
        <div>
          <div style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            ◈ LIVE INTEL × SCENARIO MAPPER
          </div>
          <div style={{ color: "#4a7080", fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>
            LISC — scenario readiness against live world events
          </div>
        </div>
        <button
          onClick={() => setVisible(false)}
          style={{ background: "none", border: "none", color: "#4a7080", cursor: "pointer", fontSize: 14 }}
        >✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px" }}>
        {[
          { label: "EVENTS",    val: events.length,    col: CY },
          { label: "SCENARIOS", val: scenarios.length,  col: "#8899aa" },
          { label: "COVERED",   val: covered.length,    col: GREEN },
          { label: "UNPLANNED", val: unplanned.length,  col: unplanned.length > 0 ? AMBER : GREEN },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${col}22`,
            borderRadius: 6, padding: "6px 4px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{val}</div>
            <div style={{ color: "#4a7080", fontSize: 8, letterSpacing: 1.5, marginTop: 3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", alignItems: "center" }}>
        {["ALL", "COVERED", "UNPLANNED"].map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}18` : "transparent",
            border: `1px solid ${tab === t ? CY : CY + "22"}`,
            color: tab === t ? CY : "#4a7080", fontSize: 9, letterSpacing: 1.5,
            padding: "3px 8px", borderRadius: 4, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            flex: 1, background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}22`,
            color: "#aec8d8", fontFamily: "inherit", fontSize: 9, padding: "3px 7px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 8px 10px" }}>
        {loading && visible_rows.length === 0 && (
          <div style={{ color: "#4a7080", fontSize: 10, padding: "14px 8px", textAlign: "center" }}>
            ◌ fetching live events and scenarios…
          </div>
        )}
        {!loading && visible_rows.length === 0 && (
          <div style={{ color: "#4a7080", fontSize: 10, padding: "14px 8px", textAlign: "center" }}>
            No events match current filter.
          </div>
        )}
        {visible_rows.map((ev) => {
          const isCov   = ev.matched.length > 0;
          const isOpen  = expanded === ev.id;
          return (
            <div key={ev.id} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(isOpen ? null : ev.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 8px", borderRadius: 6, cursor: "pointer",
                  background: isOpen ? "rgba(41,231,255,0.07)" : "rgba(41,231,255,0.02)",
                  border: `1px solid ${isOpen ? CY + "33" : "transparent"}`,
                }}
              >
                {/* Kind badge */}
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: kindCol(ev.kind),
                  border: `1px solid ${kindCol(ev.kind)}44`, borderRadius: 3,
                  padding: "1px 5px", flexShrink: 0,
                }}>{ev.kind}</span>
                {/* Label */}
                <span style={{
                  flex: 1, color: "#b8d8e8", fontSize: 10, letterSpacing: 0.5,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{ev.label}</span>
                {/* Coverage badge */}
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: isCov ? GREEN : AMBER,
                  border: `1px solid ${isCov ? GREEN : AMBER}44`, borderRadius: 3,
                  padding: "1px 5px", flexShrink: 0,
                }}>{isCov ? `COVERED (${ev.matched.length})` : "UNPLANNED"}</span>
                <span style={{ color: "#4a7080", fontSize: 10, flexShrink: 0 }}>{isOpen ? "▲" : "▼"}</span>
              </div>

              {/* Expanded: matched scenarios */}
              {isOpen && (
                <div style={{ padding: "6px 8px 8px 16px", background: "rgba(0,0,0,0.3)", borderRadius: "0 0 6px 6px" }}>
                  {ev.matched.length === 0 ? (
                    <div style={{ color: AMBER, fontSize: 9, letterSpacing: 1 }}>
                      ⚠ No scenario covers this event — gap identified.
                    </div>
                  ) : (
                    ev.matched.map((s) => (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "4px 0", borderBottom: `1px solid ${CY}11`,
                      }}>
                        <span style={{
                          fontSize: 8, color: "#4a7080", border: `1px solid #4a708044`,
                          borderRadius: 3, padding: "1px 4px", flexShrink: 0,
                        }}>{s.type}</span>
                        <span style={{ flex: 1, color: "#8ab0c0", fontSize: 9 }}>{s.name}</span>
                        <span style={{
                          fontSize: 8, color: statusCol(s.status),
                          border: `1px solid ${statusCol(s.status)}44`, borderRadius: 3,
                          padding: "1px 4px", flexShrink: 0,
                        }}>{s.status}</span>
                        {/* Relevance bar */}
                        <div style={{ width: 36, background: "#112233", borderRadius: 2, height: 4, flexShrink: 0 }}>
                          <div style={{
                            width: `${Math.min(100, s._score * 20)}%`,
                            background: CY, height: "100%", borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))
                  )}
                  <button
                    onClick={() => assessEvent(ev, ev.matched)}
                    disabled={!!assessing}
                    style={{
                      marginTop: 6, background: assessing === ev.id ? "#112233" : `${CY}18`,
                      border: `1px solid ${CY}44`, color: assessing === ev.id ? "#4a7080" : CY,
                      fontFamily: "inherit", fontSize: 8, letterSpacing: 1.5,
                      padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    {assessing === ev.id ? "◌ ASSESSING…" : "▶ ASSESS READINESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${CY}18`, padding: "5px 14px",
        display: "flex", justifyContent: "space-between",
        color: "#2a4050", fontSize: 8, letterSpacing: 1.5,
      }}>
        <span>AUTO-REFRESH 5 MIN</span>
        <span>{visible_rows.length} / {correlated.length} EVENTS</span>
        <span style={{ color: loading ? AMBER : GREEN }}>{loading ? "◌ LOADING" : "◉ LIVE"}</span>
      </div>
    </div>
  );
}
