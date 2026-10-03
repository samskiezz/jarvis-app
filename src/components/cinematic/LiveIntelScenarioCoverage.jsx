/**
 * LiveIntelScenarioCoverage — F202
 *
 * Parallel-fetches /functions/getLiveIntel (quakes/crypto/FX) + /v1/scenario/list
 * then keyword-correlates each live world event against threat scenarios to surface:
 *   TRIGGERED (≥1 scenario match) — live event activates a threat scenario
 *   DORMANT   (0 matches)         — live event has no matching scenario
 *
 * Stat tiles: events / scenarios / triggered / dormant
 * Filter tabs: ALL / TRIGGERED / DORMANT
 * Text search.
 * Expand event → matched scenario cards with relevance bar.
 * ▶ ASSESS TRIGGERS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 60 s auto-refresh.
 *
 * Intent: "liscen" / "live intel scenario" / "scenario trigger" /
 *         "triggered scenarios" / "live scenario" / "world scenario" /
 *         "event scenario"
 *   → jarvis:liscen-toggle + TTS brief via buildLiscenScript()
 *
 * Toggle: ◈ LISCEN at left:35160, bottom:8, zIndex:102.
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
const BTN_LEFT   = 35160;
const REFRESH_MS = 60_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const LISCEN_RE =
  /\b(liscen|live.intel.scenario|scenario.trigger|triggered.scenario|live.scenario|world.scenario|event.scenario|scenario.world.event|intel.scenario.gap)\b/i;

export function isLiscenQuery(t) { return LISCEN_RE.test(t || ""); }

export async function buildLiscenScript() {
  const [iRaw, sRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/functions/getLiveIntel`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/scenario/list`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const events    = normaliseEvents(iRaw.status === "fulfilled" ? iRaw.value : {});
  const scenarios = normaliseScenarios(sRaw.status === "fulfilled" ? sRaw.value : []);
  const pairs     = correlate(events, scenarios);
  const triggered = pairs.filter((p) => p.matches.length >= 1).length;
  const dormant   = pairs.filter((p) => p.matches.length === 0).length;
  const topTriggered = pairs
    .filter((p) => p.matches.length >= 1)
    .slice(0, 3)
    .map((p) => `${p.event.name} → ${p.matches[0]?.s.title || "?"}`)
    .join("; ") || "none";
  return (
    `Assess JARVIS live intel scenario activation in 2 sentences. ` +
    `${events.length} live world events vs ${scenarios.length} threat scenarios: ` +
    `${triggered} TRIGGERED (live event activates a scenario), ` +
    `${dormant} DORMANT (no scenario covers these events). ` +
    `Top activations: ${topTriggered}.`
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

function normaliseEvents(data) {
  const events = [];
  if (!data || typeof data !== "object") return events;

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    events.push({
      id:   q.id || `quake-${i}`,
      type: "seismic",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      desc: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}`,
      keywords: `seismic earthquake ${q.place || ""} magnitude disaster geologic tremor tectonic`.toLowerCase(),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto : [];
  coins.slice(0, 10).forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    const chg = c.change_24h ?? c.pct_change ?? null;
    events.push({
      id:   `crypto-${sym}`,
      type: "crypto",
      name: `${sym} ${chg !== null ? (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%" : ""}`.trim(),
      desc: `Cryptocurrency ${sym}: price ${c.price ?? "?"} USD`,
      keywords: `crypto ${sym} ${sym.toLowerCase()} digital asset market finance blockchain currency`.toLowerCase(),
    });
  });

  const fx = Array.isArray(data.fx) ? data.fx : [];
  fx.slice(0, 8).forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    const rate = f.rate ?? f.price ?? "?";
    events.push({
      id:   `fx-${pair}`,
      type: "fx",
      name: `${pair} ${rate}`,
      desc: `FX pair ${pair}: rate ${rate}`,
      keywords: `forex fx ${pair} ${pair.toLowerCase()} currency exchange rate finance market`.toLowerCase(),
    });
  });

  return events;
}

function normaliseScenarios(raw) {
  return normaliseArray(raw, ["scenarios", "items", "data"]).map((s) => ({
    id:    s.id || s.scenario_id || String(Math.random()),
    title: s.title || s.name || s.scenario_title || "Untitled Scenario",
    desc:  s.description || s.summary || s.overview || s.content?.slice?.(0, 200) || "",
    tags:  [...(s.tags || []), ...(s.categories || [])].map(String),
    status: s.status || "",
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(event, scenario) {
  const evWords = tokens(`${event.name} ${event.desc} ${event.keywords}`);
  const scText  = `${scenario.title} ${scenario.desc} ${scenario.tags.join(" ")}`.toLowerCase();
  const hits = evWords.filter((w) => scText.includes(w));
  return hits.length / Math.max(evWords.length, 1);
}

function correlate(events, scenarios) {
  return events.map((event) => {
    const scored = scenarios
      .map((s) => ({ s, score: matchScore(event, s) }))
      .filter((x) => x.score > 0.06)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { event, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 55, background: "rgba(0,0,0,0.3)",
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

const TYPE_COLOR = { seismic: AMBER, crypto: CY, fx: GREEN };
const TYPE_ICON  = { seismic: "⚡", crypto: "◆", fx: "◈" };

// ─── main component ────────────────────────────────────────────────────────────

export default function LiveIntelScenarioCoverage() {
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
      const [iRes, sRes] = await Promise.allSettled([
        fetch(`${apiBase()}/functions/getLiveIntel`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const events    = normaliseEvents(iRes.status === "fulfilled" ? iRes.value : {});
      const scenarios = normaliseScenarios(sRes.status === "fulfilled" ? sRes.value : []);
      setPairs(correlate(events, scenarios));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:liscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:liscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const triggered = pairs.filter((p) => p.matches.length >= 1);
  const dormant   = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "TRIGGERED") return p.matches.length >= 1;
      if (tab === "DORMANT")   return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.event.name.toLowerCase().includes(q) ||
        p.event.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.s.title.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildLiscenScript();
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
        json.answer || JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore
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
        title="Live Intel × Scenario Coverage (LISCEN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 102,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ LISCEN
        {triggered.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {triggered.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "TRIGGERED", "DORMANT"];
  const tabColor = (t) => {
    if (t === "TRIGGERED") return AMBER;
    if (t === "DORMANT")   return GREEN;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 102,
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
          ◈ LIVE INTEL × SCENARIO COVERAGE
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
            {assessing ? "…" : "▶ ASSESS TRIGGERS"}
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
        <Tile label="EVENTS"    value={pairs.length}      color={CY}   />
        <Tile label="SCENARIOS" value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.s.id)))].length
            : 0
        } color={CY} />
        <Tile label="TRIGGERED" value={triggered.length}  color={AMBER} />
        <Tile label="DORMANT"   value={dormant.length}    color={GREEN} />
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
          const status = p.matches.length >= 1 ? "TRIGGERED" : "DORMANT";
          const statusColor = status === "TRIGGERED" ? AMBER : GREEN;
          const typeColor = TYPE_COLOR[p.event.type] || CY;
          const typeIcon  = TYPE_ICON[p.event.type] || "◈";
          const isExp = expanded[p.event.id];
          return (
            <div
              key={p.event.id}
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
                onClick={() => toggleRow(p.event.id)}
              >
                <span style={{ color: typeColor, fontSize: 10, flexShrink: 0 }}>
                  {typeIcon}
                </span>
                <span style={{
                  fontSize: 8, border: `1px solid ${statusColor}`,
                  borderRadius: 3, color: statusColor,
                  padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{
                  color: CY, flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.event.name}
                </span>
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {p.event.type} · {p.matches.length} scen
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>
                  {isExp ? "▲" : "▼"}
                </span>
              </div>

              {isExp && (
                <div style={{ paddingLeft: 16, paddingBottom: 4 }}>
                  <div style={{ color: DIM, fontSize: 8, marginBottom: 4 }}>
                    {p.event.desc}
                  </div>
                  {p.matches.length === 0 ? (
                    <div style={{ color: GREEN, fontSize: 9 }}>
                      ◎ no scenario covers this live event — DORMANT
                    </div>
                  ) : (
                    p.matches.map(({ s, score }) => (
                      <div key={s.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 3,
                      }}>
                        <span style={{
                          color: AMBER, fontSize: 9, flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {s.title}
                        </span>
                        {s.status && (
                          <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                            {s.status}
                          </span>
                        )}
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
        <span>LISCEN · /functions/getLiveIntel × /v1/scenario/list</span>
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
