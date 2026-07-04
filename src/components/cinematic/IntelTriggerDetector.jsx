/**
 * IntelTriggerDetector — F146
 *
 * Polls /functions/getLiveIntel (seismic + markets) and /v1/scenario/list
 * every 3 minutes. Derives live world-state trigger signals:
 *
 *   SEISMIC_SURGE  — any earthquake magnitude ≥ 6.0
 *   MARKET_SPIKE   — any market instrument |24h change_pct| ≥ 8 %
 *   FX_STRESS      — any FX instrument |24h change_pct| ≥ 2 %
 *
 * Keyword-correlates each scenario (name / objective / type) against active
 * trigger signals. Shows TRIGGERED (matched) vs STANDBY (no active match).
 * Stat tiles: scenarios / active-triggers / triggered / standby.
 *
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence trigger brief + TTS via
 *            jarvis:speak-dossier
 *
 * Toggle: ◈ ITRIG at left:48040 bottom:8 zIndex:97
 * Jarvis voice: "intel trigger"/"scenario trigger"/"triggered scenarios"/
 *               "what's triggered"/"itrig"/"active scenarios"
 * jarvis:itrig-toggle CustomEvent
 * 180-s auto-refresh
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";

const BTN_LEFT   = 48040;
const REFRESH_MS = 180_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── trigger signal definitions ───────────────────────────────────────────────

const TRIGGER_DEFS = [
  {
    type:     "SEISMIC_SURGE",
    label:    "Seismic Surge",
    color:    AMBER,
    icon:     "⚠",
    keywords: ["seismic","earthquake","geological","tectonic","geophysical",
               "natural disaster","disaster","quake","tremor","fault"],
  },
  {
    type:     "MARKET_SPIKE",
    label:    "Market Spike",
    color:    RED,
    icon:     "⚡",
    keywords: ["market","crypto","bitcoin","btc","eth","ethereum","trading",
               "financial","volatility","investment","asset","economic",
               "currency","market crash","bubble"],
  },
  {
    type:     "FX_STRESS",
    label:    "FX Stress",
    color:    AMBER,
    icon:     "⚡",
    keywords: ["forex","currency","exchange rate","fx","dollar","pound","euro",
               "yen","monetary","devaluation","inflation","treasury"],
  },
];

// ─── data parsing ─────────────────────────────────────────────────────────────

function parseQuakes(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.earthquakes)) return raw.earthquakes;
  if (Array.isArray(raw?.seismic))     return raw.seismic;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function parseMarkets(raw) {
  if (Array.isArray(raw?.markets)) return raw.markets;
  if (Array.isArray(raw))          return raw.filter(m => m.price !== undefined);
  return [];
}

// Heuristic: FX instruments are named with short uppercase codes (USD/EUR etc.)
// or contain "fx"/"forex" in their display name.
function isFX(m) {
  const d = String(m.display || m.symbol || "").toLowerCase();
  return d.includes("/") || d.includes("fx") || d.includes("forex") ||
    /^(usd|eur|gbp|jpy|aud|cad|chf|nzd|hkd|cny|sgd|mxn|brl|inr|krw|sek|nok|dkk)/.test(d);
}

function deriveTriggers(quakes, markets) {
  const active = {};

  const maxMag = quakes.reduce((max, q) => {
    const m = parseFloat(q.magnitude ?? q.mag ?? 0) || 0;
    return Math.max(max, m);
  }, 0);
  if (maxMag >= 6.0) {
    active["SEISMIC_SURGE"] = {
      detail: `Max magnitude ${maxMag.toFixed(1)} detected (${quakes.length} events)`,
      severity: maxMag >= 7.0 ? "CRITICAL" : "HIGH",
    };
  }

  const fxItems = markets.filter(isFX);
  const cryptoItems = markets.filter(m => !isFX(m));

  const worstCrypto = cryptoItems.reduce((worst, m) => {
    const ch = Math.abs(parseFloat(m.change_pct ?? m.change ?? 0) || 0);
    return ch > (worst?.ch ?? 0) ? { m, ch } : worst;
  }, null);
  if (worstCrypto && worstCrypto.ch >= 8) {
    active["MARKET_SPIKE"] = {
      detail: `${worstCrypto.m.display ?? "Market"} moved ${worstCrypto.ch.toFixed(1)}% in 24h`,
      severity: worstCrypto.ch >= 15 ? "CRITICAL" : "HIGH",
    };
  }

  const worstFX = fxItems.reduce((worst, m) => {
    const ch = Math.abs(parseFloat(m.change_pct ?? m.change ?? 0) || 0);
    return ch > (worst?.ch ?? 0) ? { m, ch } : worst;
  }, null);
  if (worstFX && worstFX.ch >= 2) {
    active["FX_STRESS"] = {
      detail: `${worstFX.m.display ?? "FX pair"} moved ${worstFX.ch.toFixed(2)}% in 24h`,
      severity: worstFX.ch >= 5 ? "CRITICAL" : "HIGH",
    };
  }

  return active;
}

// ─── scenario correlation ─────────────────────────────────────────────────────

function tokenise(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

function scenarioTriggers(scenario, activeTriggers) {
  const haystack = [scenario.name, scenario.description, scenario.objective, scenario.type]
    .join(" ").toLowerCase();
  const matched = [];
  for (const def of TRIGGER_DEFS) {
    if (!activeTriggers[def.type]) continue;
    if (def.keywords.some(kw => haystack.includes(kw))) {
      matched.push({ ...def, ...activeTriggers[def.type] });
    }
  }
  return matched;
}

// ─── voice/JarvisBrain exports ────────────────────────────────────────────────

const ITRIG_RE = /intel.trigger|scenario.trigger|triggered.scenario|what.?s.triggered|itrig|active.scenario/i;

export function isItrigQuery(q) {
  return ITRIG_RE.test(q || "");
}

export async function buildItrigScript() {
  try {
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [intelRaw, scenRaw] = await Promise.all([
      fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
      fetch(`${apiBase()}/v1/scenario/list`, { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);

    const quakes   = parseQuakes(intelRaw);
    const markets  = parseMarkets(intelRaw);
    const active   = deriveTriggers(quakes, markets);
    const scenarios = Array.isArray(scenRaw) ? scenRaw : (scenRaw?.scenarios ?? []);
    const triggered = scenarios.filter(s => scenarioTriggers(s, active).length > 0);

    const triggerNames = Object.keys(active).map(k => TRIGGER_DEFS.find(d => d.type === k)?.label ?? k);
    const count = triggered.length;

    if (!triggerNames.length) {
      return `Intel Trigger Detector: no active world-state triggers at this time, sir. All ${scenarios.length} scenarios remain on standby.`;
    }

    const scenList = triggered.slice(0, 3).map(s => s.name ?? s.id ?? "Unknown").join(", ");
    return `Intel Trigger Detector active, sir. World conditions are triggering: ${triggerNames.join(" and ")}. ` +
      `${count} of ${scenarios.length} scenarios are now TRIGGERED — including ${scenList}${count > 3 ? " and others" : ""}. Review immediately.`;
  } catch (_) {
    return "Intel Trigger Detector online. Unable to retrieve full world-state data at this time, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function IntelTriggerDetector() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [active, setActive]     = useState({});      // { TRIGGER_TYPE: { detail, severity } }
  const [scenarios, setScenarios] = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [tab, setTab]           = useState("ALL");   // ALL | TRIGGERED | STANDBY
  const [query, setQuery]       = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [intelRaw, scenRaw] = await Promise.all([
        fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdrs }).then(r => r.json()).catch(() => ({})),
        fetch(`${apiBase()}/v1/scenario/list`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      ]);
      const quakes  = parseQuakes(intelRaw);
      const markets = parseMarkets(intelRaw);
      const newActive = deriveTriggers(quakes, markets);
      const list = Array.isArray(scenRaw) ? scenRaw : (scenRaw?.scenarios ?? []);
      setActive(newActive);
      setScenarios(list);
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:itrig-toggle", onToggle);
    return () => window.removeEventListener("jarvis:itrig-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      const triggerNames = Object.keys(active)
        .map(k => TRIGGER_DEFS.find(d => d.type === k)?.label ?? k).join(", ");
      const triggered = scenarios.filter(s => scenarioTriggers(s, active).length > 0);
      const prompt = triggerNames.length
        ? `Active world-state triggers: ${triggerNames}. ${triggered.length} of ${scenarios.length} scenarios are TRIGGERED. ` +
          `Triggered scenarios: ${triggered.slice(0, 5).map(s => s.name ?? s.id).join(", ")}. ` +
          `Give a 2-sentence operational assessment of which scenarios deserve immediate activation and why.`
        : `No active world-state triggers. All ${scenarios.length} scenarios are on STANDBY. ` +
          `Give a 2-sentence status confirmation and readiness advisory.`;
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdrs, body: JSON.stringify({ message: prompt }),
      });
      const data = await resp.json().catch(() => ({}));
      const text = data?.response ?? data?.reply ?? data?.message ?? "No assessment available.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    finally { setAssessing(false); }
  }, [active, scenarios]);

  // ── computed ────────────────────────────────────────────────────────────────
  const activeTriggerCount = Object.keys(active).length;
  const enriched = scenarios.map(s => {
    const matches = scenarioTriggers(s, active);
    return { ...s, triggered: matches.length > 0, matches };
  });
  const q = query.trim().toLowerCase();
  const filtered = enriched.filter(s => {
    const label = [s.name, s.type, s.objective].join(" ").toLowerCase();
    const matchesQ = !q || label.includes(q);
    if (tab === "TRIGGERED") return s.triggered && matchesQ;
    if (tab === "STANDBY")   return !s.triggered && matchesQ;
    return matchesQ;
  });
  const triggeredCount = enriched.filter(s => s.triggered).length;
  const standbyCount   = enriched.filter(s => !s.triggered).length;
  const hasCritical    = Object.values(active).some(t => t.severity === "CRITICAL");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Trigger Detector — live world conditions vs scenarios"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 97,
          background: "rgba(5,10,18,0.85)", border: `1px solid ${hasCritical ? RED : activeTriggerCount ? AMBER : CY}44`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          color: hasCritical ? RED : activeTriggerCount ? AMBER : CY,
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ ITRIG
        {activeTriggerCount > 0 && (
          <span style={{
            background: hasCritical ? RED : AMBER,
            color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 8, fontWeight: 700,
            animation: hasCritical ? "pulse-red 1s infinite" : undefined,
          }}>
            {activeTriggerCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <>
      <div
        onClick={() => setOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 96, background: "rgba(0,4,10,0.55)" }}
      />
      <div style={{
        position: "fixed", bottom: 50, left: BTN_LEFT - 400, zIndex: 97,
        width: 540, maxHeight: "72vh", display: "flex", flexDirection: "column",
        background: "rgba(5,10,20,0.97)", border: `1px solid ${CY}33`,
        borderRadius: 12, overflow: "hidden",
        boxShadow: `0 0 60px ${CY}10, 0 24px 48px rgba(0,0,0,0.8)`,
        fontFamily: "'JetBrains Mono',monospace",
      }}>
        {/* header */}
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
          display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: activeTriggerCount ? AMBER : CY, fontSize: 13 }}>◈</span>
          <span style={{ color: "#DCEBF5", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            INTEL TRIGGER DETECTOR
          </span>
          {loading && <span style={{ color: CY, fontSize: 9, marginLeft: "auto", letterSpacing: 1 }}>SCANNING…</span>}
          {err && <span style={{ color: RED, fontSize: 9, marginLeft: "auto" }}>ERR</span>}
          <button onClick={() => setOpen(false)} style={{
            marginLeft: "auto", background: "none", border: "none",
            color: "#4E6070", cursor: "pointer", fontSize: 14,
          }}>×</button>
        </div>

        {/* active trigger pills */}
        {activeTriggerCount > 0 && (
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(active).map(([type, info]) => {
              const def = TRIGGER_DEFS.find(d => d.type === type);
              const col = info.severity === "CRITICAL" ? RED : AMBER;
              return (
                <span key={type} style={{
                  background: `${col}18`, border: `1px solid ${col}55`,
                  borderRadius: 6, padding: "3px 10px", fontSize: 9,
                  color: col, letterSpacing: 1, display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span>{def?.icon}</span>
                  <span style={{ fontWeight: 700 }}>{def?.label}</span>
                  <span style={{ color: "#7A95AB" }}>— {info.detail}</span>
                </span>
              );
            })}
          </div>
        )}
        {activeTriggerCount === 0 && !loading && (
          <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
            fontSize: 9, color: GREEN, letterSpacing: 1 }}>
            ◎ NO ACTIVE TRIGGERS — all world-state conditions nominal
          </div>
        )}

        {/* stat tiles */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            { label: "SCENARIOS", value: scenarios.length, color: CY },
            { label: "TRIGGERS", value: activeTriggerCount, color: activeTriggerCount ? AMBER : CY },
            { label: "TRIGGERED", value: triggeredCount, color: triggeredCount ? RED : CY },
            { label: "STANDBY",   value: standbyCount,   color: standbyCount === scenarios.length ? GREEN : CY },
          ].map(t => (
            <div key={t.label} style={{ textAlign: "center",
              background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "6px 4px" }}>
              <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
              <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* controls */}
        <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}18`,
          display: "flex", gap: 6, alignItems: "center" }}>
          {["ALL", "TRIGGERED", "STANDBY"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              borderRadius: 4, padding: "2px 8px", cursor: "pointer",
              color: tab === t ? CY : "#4E6070", fontSize: 9, letterSpacing: 1,
            }}>{t}</button>
          ))}
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="filter scenarios…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}22`, borderRadius: 4, padding: "2px 8px",
              color: "#DCEBF5", fontSize: 9, outline: "none",
              fontFamily: "inherit", width: 140 }}
          />
        </div>

        {/* scenario list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "#4E6070", fontSize: 11 }}>
              No scenarios match this filter.
            </div>
          )}
          {filtered.map((s, i) => {
            const col = s.triggered ? RED : GREEN;
            const badge = s.triggered ? "TRIGGERED" : "STANDBY";
            return (
              <div key={s.id ?? s.name ?? i} style={{
                padding: "8px 16px", borderBottom: `1px solid ${CY}0F`,
                borderLeft: s.triggered ? `2px solid ${RED}` : "2px solid transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: col, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                    background: `${col}18`, borderRadius: 4, padding: "1px 6px" }}>
                    {badge}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                    {s.name ?? s.id ?? "Unnamed"}
                  </span>
                  {s.type && (
                    <span style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1,
                      border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 5px" }}>
                      {String(s.type).toUpperCase()}
                    </span>
                  )}
                </div>
                {s.triggered && s.matches.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {s.matches.map(m => (
                      <span key={m.type} style={{ fontSize: 8, color: m.color ?? AMBER, letterSpacing: 0.5 }}>
                        {m.icon} {m.label}
                      </span>
                    ))}
                  </div>
                )}
                {s.objective && (
                  <div style={{ marginTop: 3, color: "#4E6070", fontSize: 9, lineHeight: 1.4 }}>
                    {String(s.objective).slice(0, 100)}{s.objective.length > 100 ? "…" : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* footer */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}18`,
          display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={handleAssess}
            disabled={assessing}
            style={{
              background: assessing ? "transparent" : `${CY}18`,
              border: `1px solid ${CY}44`, borderRadius: 6,
              padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer",
              color: assessing ? "#4E6070" : CY, fontSize: 9, letterSpacing: 1,
            }}
          >
            {assessing ? "ASSESSING…" : "▶ ASSESS"}
          </button>
          <button onClick={fetchData} style={{
            background: "transparent", border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "4px 10px", cursor: "pointer",
            color: "#4E6070", fontSize: 9, letterSpacing: 1,
          }}>↻</button>
          <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 8, letterSpacing: 1 }}>
            /functions/getLiveIntel · /v1/scenario/list · 3 min refresh
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse-red { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
