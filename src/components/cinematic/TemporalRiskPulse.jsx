/**
 * F239 — JARVIS Temporal Risk Pulse (TARP)
 *
 * Polls /entities/RiskSignal + /v1/ops/events every 60 s.
 * Bins both data sources into time buckets: last 1h, 6h, 24h, 72h, 7d.
 * Shows risk signal creation rate + ops event frequency per bucket as a
 * stacked heat-row grid; ACCELERATING / STEADY / COOLING derived by
 * comparing 1h + 6h bucket density against the 7d baseline.
 *
 * Stat tiles: total signals / total ops events / recent 6h / peak window.
 * Expand bucket row → individual items (up to 6) with severity / type badge.
 * ▶ ASSESS: 2-sentence temporal brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TARP  at left:4860 bottom:18, zIndex:68.
 * Event:   jarvis:tarp-toggle
 * Voice:   "temporal risk / risk pulse / tarp / risk over time / risk activity /
 *           when are risks high / peak risk / risk timing / time risk"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4860;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const BUCKETS = [
  { label: "1h",  ms: 60 * 60 * 1000 },
  { label: "6h",  ms: 6 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "72h", ms: 72 * 60 * 60 * 1000 },
  { label: "7d",  ms: 7 * 24 * 60 * 60 * 1000 },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function parseTimestamp(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((s, i) => ({
    id:        String(s.id ?? s.signal_id ?? i),
    title:     s.title ?? s.name ?? s.signal_name ?? `Signal ${i + 1}`,
    severity:  (s.severity ?? s.level ?? "INFO").toUpperCase(),
    category:  s.category ?? s.type ?? "",
    ts:        parseTimestamp(s.created_at ?? s.timestamp ?? s.detected_at ?? s.date),
  }));
}

function normaliseOps(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:       String(e.id ?? e.event_id ?? i),
    title:    e.title ?? e.type ?? e.resource ?? `Event ${i + 1}`,
    severity: (e.severity ?? e.level ?? "INFO").toUpperCase(),
    type:     e.type ?? e.event_type ?? "",
    ts:       parseTimestamp(e.created_at ?? e.timestamp ?? e.occurred_at ?? e.date),
  }));
}

function bucket(items, windowMs, now) {
  return items.filter(item => {
    if (!item.ts) return false;
    return now - item.ts.getTime() <= windowMs;
  });
}

function deriveState(signals, opsEvents, now) {
  const s1h  = bucket(signals,   BUCKETS[0].ms, now).length;
  const s6h  = bucket(signals,   BUCKETS[1].ms, now).length;
  const s7d  = bucket(signals,   BUCKETS[4].ms, now).length;
  const o1h  = bucket(opsEvents, BUCKETS[0].ms, now).length;
  const o6h  = bucket(opsEvents, BUCKETS[1].ms, now).length;
  const o7d  = bucket(opsEvents, BUCKETS[4].ms, now).length;

  const dailyBaseline = (s7d + o7d) / 7;
  const recent6hRate  = (s6h + o6h) / 6;
  const recent1hRate  = (s1h + o1h);

  if (dailyBaseline === 0 && recent6hRate === 0) return "QUIET";
  if (recent1hRate > 5 || recent6hRate * 4 > dailyBaseline * 1.5) return "ACCELERATING";
  if (recent6hRate * 4 > dailyBaseline * 0.8) return "STEADY";
  return "COOLING";
}

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

function stateColor(s) {
  if (s === "ACCELERATING") return RED;
  if (s === "STEADY")       return AMBER;
  if (s === "COOLING")      return GREEN;
  return MUTED;
}

// ─── exported intent helpers (for JarvisBrain) ────────────────────────────────

const TARP_RE = /temporal risk|risk pulse|tarp|risk over time|risk activity|when are risks high|peak risk|risk timing|time risk/i;
export function isTarpQuery(q) { return TARP_RE.test(q); }

export async function buildTarpScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [sr, or_] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/ops/events`, { headers }).then(r => r.json()).catch(() => []),
    ]);
    const signals   = normaliseSignals(sr);
    const opsEvents = normaliseOps(or_);
    const now       = Date.now();
    const state     = deriveState(signals, opsEvents, now);
    const s6h = bucket(signals, BUCKETS[1].ms, now).length;
    const o6h = bucket(opsEvents, BUCKETS[1].ms, now).length;
    const prompt = `JARVIS Temporal Risk Pulse: ${signals.length} risk signals + ${opsEvents.length} ops events on record. Activity in last 6h: ${s6h} signals, ${o6h} ops events. Momentum: ${state}. In exactly 2 sentences give a temporal risk brief: is activity accelerating, what is the dominant risk pattern, and what should JARVIS watch for?`;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
      `Temporal pulse: ${state}. ${s6h} signals and ${o6h} ops events logged in the last 6 hours.`;
  } catch {
    return "Temporal Risk Pulse data unavailable — check backend connectivity.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function TemporalRiskPulse() {
  const [visible, setVisible]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [signals, setSignals]     = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [sr, or_] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`, { headers }).then(r => r.json()).catch(() => []),
      ]);
      setSignals(normaliseSignals(sr));
      setOpsEvents(normaliseOps(or_));
    } catch { /* backend not reachable */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible(v => !v);
    window.addEventListener("jarvis:tarp-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tarp-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const now    = Date.now();
  const state  = deriveState(signals, opsEvents, now);
  const sColor = stateColor(state);

  // For each bucket, compute both signals + ops items that fall within it
  const bucketRows = BUCKETS.map(b => {
    const sItems = bucket(signals,   b.ms, now);
    const oItems = bucket(opsEvents, b.ms, now);
    return { label: b.label, ms: b.ms, sItems, oItems, total: sItems.length + oItems.length };
  });

  const maxTotal = Math.max(...bucketRows.map(r => r.total), 1);
  const s6h = bucketRows[1].sItems.length;
  const o6h = bucketRows[1].oItems.length;

  // Peak bucket
  const peak = [...bucketRows].sort((a, b) => {
    // density = total per hour
    const aDens = a.total / (a.ms / 3_600_000);
    const bDens = b.total / (b.ms / 3_600_000);
    return bDens - aDens;
  })[0];

  async function assess() {
    setAssessing(true);
    const text = await buildTarpScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    setAssessing(false);
  }

  if (!visible) {
    const recent = bucket(signals, BUCKETS[1].ms, now).length +
                   bucket(opsEvents, BUCKETS[1].ms, now).length;
    return (
      <button
        onClick={() => setVisible(true)}
        title="Temporal Risk Pulse"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${sColor}66`,
          color: sColor, fontFamily: MONO, fontSize: 11, padding: "5px 10px",
          borderRadius: 6, cursor: "pointer", letterSpacing: 1,
          boxShadow: state === "ACCELERATING" ? `0 0 14px ${RED}55` : "none",
        }}
      >
        ◈ TARP
        {recent > 0 && (
          <span style={{
            marginLeft: 6, background: sColor, color: "#04060A",
            borderRadius: 10, padding: "1px 6px", fontSize: 10, fontWeight: 700,
          }}>{recent}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 60, zIndex: 69, width: 480,
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      fontFamily: MONO, color: "#DCEBF5", padding: "14px 16px",
      boxShadow: `0 0 40px ${CY}18`, maxHeight: "75vh", overflowY: "auto",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>◈ TEMPORAL RISK PULSE</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: sColor, fontWeight: 700,
          border: `1px solid ${sColor}`, borderRadius: 4, padding: "1px 6px",
          animation: state === "ACCELERATING" ? "tarpPulse 1s ease-in-out infinite" : "none",
        }}>{state}</span>
        <button onClick={() => setVisible(false)} style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
        {[
          { label: "SIGNALS",   value: signals.length,   color: CY },
          { label: "OPS EVTS",  value: opsEvents.length, color: AMBER },
          { label: "LAST 6H",   value: s6h + o6h,        color: state === "ACCELERATING" ? RED : GREEN },
          { label: "PEAK WIN",  value: peak.label,        color: MUTED },
        ].map(t => (
          <div key={t.label} style={{
            background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
            borderRadius: 8, padding: "8px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.color }}>{t.value}</div>
            <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* bucket grid */}
      {loading && <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 12 }}>loading…</div>}
      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bucketRows.map(row => {
            const barW   = maxTotal > 0 ? (row.total / maxTotal) * 100 : 0;
            const sBarW  = row.total > 0 ? (row.sItems.length / row.total) * 100 : 0;
            const isOpen = expanded === row.label;
            return (
              <div key={row.label} style={{
                background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
                borderRadius: 7, overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : row.label)}
                  style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                >
                  {/* window label */}
                  <span style={{ width: 32, fontSize: 12, fontWeight: 700, color: CY }}>{row.label}</span>

                  {/* stacked bar */}
                  <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${sBarW}%`, background: RED, transition: "width 0.4s" }} />
                    <div style={{ width: `${barW - sBarW}%`, background: AMBER, transition: "width 0.4s" }} />
                  </div>

                  <span style={{ fontSize: 11, color: MUTED, minWidth: 60, textAlign: "right" }}>
                    {row.sItems.length}× risk · {row.oItems.length}× ops
                  </span>
                  <span style={{ color: MUTED, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* expanded items */}
                {isOpen && (
                  <div style={{ borderTop: `1px solid ${CY}22`, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {row.sItems.slice(0, 6).map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <span style={{ color: SEV_COLORS[s.severity] ?? MUTED, minWidth: 58, fontSize: 9,
                          border: `1px solid ${SEV_COLORS[s.severity] ?? MUTED}55`,
                          borderRadius: 3, padding: "0 4px", textAlign: "center" }}>RISK</span>
                        <span style={{ flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                        <span style={{ color: SEV_COLORS[s.severity] ?? MUTED, fontSize: 9 }}>{s.severity}</span>
                      </div>
                    ))}
                    {row.oItems.slice(0, 6).map(o => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                        <span style={{ color: AMBER, minWidth: 58, fontSize: 9,
                          border: `1px solid ${AMBER}55`,
                          borderRadius: 3, padding: "0 4px", textAlign: "center" }}>OPS</span>
                        <span style={{ flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.title}</span>
                        <span style={{ color: SEV_COLORS[o.severity] ?? MUTED, fontSize: 9 }}>{o.severity}</span>
                      </div>
                    ))}
                    {(row.sItems.length + row.oItems.length) === 0 && (
                      <span style={{ color: MUTED, fontSize: 11 }}>No timestamped items in this window</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* legend */}
      <div style={{ marginTop: 10, display: "flex", gap: 14, fontSize: 10, color: MUTED }}>
        <span><span style={{ color: RED }}>■</span> Risk signals</span>
        <span><span style={{ color: AMBER }}>■</span> Ops events</span>
        <span style={{ marginLeft: "auto" }}>Bar = share of window total</span>
      </div>

      {/* assess button */}
      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={assess} disabled={assessing} style={{
          flex: 1, background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.08)",
          border: `1px solid ${CY}55`, color: CY, fontFamily: MONO, fontSize: 11,
          padding: "7px 0", borderRadius: 6, cursor: assessing ? "not-allowed" : "pointer", letterSpacing: 1,
        }}>
          {assessing ? "…briefing" : "▶ ASSESS"}
        </button>
        <button onClick={load} style={{
          background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}33`,
          color: MUTED, fontFamily: MONO, fontSize: 11, padding: "7px 12px",
          borderRadius: 6, cursor: "pointer",
        }}>↺</button>
      </div>

      <style>{`
        @keyframes tarpPulse {
          0%,100% { opacity:1; box-shadow:0 0 8px ${RED}88; }
          50%      { opacity:.6; box-shadow:0 0 20px ${RED}; }
        }
      `}</style>
    </div>
  );
}
