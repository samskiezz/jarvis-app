/**
 * IncidentVelocityMonitor — F95 (INCIVCTY).
 *
 * Tracks the rate at which ops events, ops alerts, and investigations are
 * created over the last 24 hours.  Groups each stream into 24 hourly buckets,
 * computes per-hour averages, and flags spike windows (any hour where ≥2
 * streams each exceed 2× their own 24-h average).
 *
 * Endpoints:  /v1/ops/events · /v1/ops/alerts · /v1/investigations
 * Stat tiles: 24H EVENTS | 24H ALERTS | ACTIVE INVEST | SPIKES
 * Charts:     3 SVG 24-bucket bar charts (events / alerts / investigations)
 * Red pulse:  SPIKES tile when spike count > 0
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence velocity brief + TTS
 * 60-s auto-refresh
 *
 * Toggle:    ◈ INCIVCTY at left:974240, bottom:8, zIndex:119
 * Mounted:   App.jsx
 * Wired:     JarvisBrain.jsx via isIncivctyQuery / buildIncivctyScript
 *
 * Voice: "incivcty" / "incident velocity" / "event velocity" /
 *        "alert velocity" / "spike detection" / "ops velocity" /
 *        "velocity monitor" / "ops rate"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const GREEN = "#00c878";
const AMBER = "#FFB347";
const RED   = "#FF3D5A";
const DIM   = "#1a2a38";

const BTN_LEFT   = 974240;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && Array.isArray(raw.events))  return raw.events;
  if (raw && Array.isArray(raw.alerts))  return raw.alerts;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function tsOf(item) {
  const raw =
    item.created_at || item.timestamp || item.opened_at ||
    item.start_date || item.date || item.updated_at || null;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return isNaN(t) ? null : t;
}

/** Returns index 0-23 for the hour bucket within the last 24 h (0=oldest). */
function hourBucket(ts) {
  const nowH = Math.floor(Date.now() / 3_600_000);
  const itemH = Math.floor(ts / 3_600_000);
  const delta = nowH - itemH;
  if (delta < 0 || delta >= 24) return -1;
  return 23 - delta; // 23 = current hour
}

function buildBuckets(items) {
  const b = new Array(24).fill(0);
  for (const item of items) {
    const ts = tsOf(item);
    if (ts === null) continue;
    const idx = hourBucket(ts);
    if (idx >= 0) b[idx]++;
  }
  return b;
}

function detectSpikes(evB, alB, invB) {
  const avg = (b) => b.reduce((s, v) => s + v, 0) / 24;
  const aE = avg(evB), aA = avg(alB), aI = avg(invB);
  const spikes = [];
  for (let h = 0; h < 24; h++) {
    const n =
      (evB[h]  > 2 * aE  ? 1 : 0) +
      (alB[h]  > 2 * aA  ? 1 : 0) +
      (invB[h] > 2 * aI  ? 1 : 0);
    if (n >= 2) spikes.push(23 - h); // hours ago
  }
  return spikes;
}

// ─── tiny SVG bar chart ───────────────────────────────────────────────────────

function BarChart({ buckets, color, spikeMask }) {
  const W = 288, H = 48, n = 24;
  const bw = W / n;
  const mx = Math.max(...buckets, 1);
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {buckets.map((v, i) => {
        const bh = Math.round((v / mx) * (H - 4));
        const isSpike = spikeMask && spikeMask[i];
        return (
          <rect
            key={i}
            x={i * bw + 1}
            y={H - bh}
            width={bw - 2}
            height={bh}
            fill={isSpike ? RED : color}
            opacity={bh > 0 ? 1 : 0.15}
          />
        );
      })}
    </svg>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function IncidentVelocityMonitor() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err,  setErr]  = useState(null);
  const [tab,  setTab]  = useState("ALL");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = authHdr();
      const [evR, alR, invR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`,  { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/ops/alerts`,  { headers: h }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : null),
      ]);
      const events = normaliseArray(evR.status === "fulfilled"  ? evR.value  : []);
      const alerts = normaliseArray(alR.status === "fulfilled"  ? alR.value  : []);
      const invs   = normaliseArray(invR.status === "fulfilled" ? invR.value : []);

      const evB  = buildBuckets(events);
      const alB  = buildBuckets(alerts);
      const invB = buildBuckets(invs);

      const spikes       = detectSpikes(evB, alB, invB);
      const activeInvs   = invs.filter(i => {
        const s = (i.status || i.state || "").toLowerCase();
        return !s.includes("clos") && !s.includes("resolv") && !s.includes("complet");
      }).length;

      // spike mask arrays (bool per bucket — 0=oldest, 23=latest)
      const spikeMaskOf = (b) => {
        const avg = b.reduce((s,v) => s+v, 0) / 24;
        return b.map(v => v > 2 * avg && avg > 0);
      };

      setData({
        evBuckets:  evB,
        alBuckets:  alB,
        invBuckets: invB,
        evSpike:  spikeMaskOf(evB),
        alSpike:  spikeMaskOf(alB),
        invSpike: spikeMaskOf(invB),
        total24hEv:  events.length,
        total24hAl:  alerts.length,
        activeInvs,
        spikes,
        events,
        alerts,
        invs,
      });
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:incivcty-toggle", onToggle);
    return () => window.removeEventListener("jarvis:incivcty-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const prompt =
        `Incident velocity monitor: ${data.total24hEv} ops events, ` +
        `${data.total24hAl} alerts, ${data.activeInvs} active investigations ` +
        `in the last 24 hours. Spike windows detected: ${data.spikes.length}. ` +
        `Provide a 2-sentence velocity assessment and recommended action.`;
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      if (!resp.ok) throw new Error(resp.status);
      const j = await resp.json();
      const txt = j.response || j.message || j.content || JSON.stringify(j);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt.slice(0, 500) }),
      });
    } catch (_) {}
    setAssessing(false);
  }, [data]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 119,
          background: "rgba(41,231,255,0.08)", border: "1px solid rgba(41,231,255,0.3)",
          color: CY, fontSize: 10, padding: "3px 7px", cursor: "pointer",
          borderRadius: 4, fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ INCIVCTY
      </button>
    );
  }

  const tiles = [
    { label: "24H EVENTS", val: data?.total24hEv ?? "…",   color: GREEN },
    { label: "24H ALERTS", val: data?.total24hAl ?? "…",   color: AMBER },
    { label: "ACTIVE INV", val: data?.activeInvs ?? "…",   color: CY   },
    { label: "SPIKES",     val: data?.spikes.length ?? "…", color: RED, pulse: data?.spikes.length > 0 },
  ];

  const charts = [
    { label: "EVENTS / HOUR",          buckets: data?.evBuckets,  spike: data?.evSpike,  color: GREEN },
    { label: "ALERTS / HOUR",          buckets: data?.alBuckets,  spike: data?.alSpike,  color: AMBER },
    { label: "INVESTIGATIONS / HOUR",  buckets: data?.invBuckets, spike: data?.invSpike, color: CY   },
  ];

  const TABS = ["ALL", "EVENTS", "ALERTS", "INVESTIGATIONS"];
  const visibleCharts = tab === "ALL" ? charts
    : tab === "EVENTS" ? charts.slice(0,1)
    : tab === "ALERTS" ? charts.slice(1,2)
    : charts.slice(2,3);

  return (
    <div style={{
      position: "fixed", bottom: 36, right: 12, zIndex: 119,
      width: 340, background: "rgba(8,18,28,0.96)",
      border: "1px solid rgba(41,231,255,0.3)", borderRadius: 8,
      fontFamily: "monospace", color: CY, fontSize: 11,
      boxShadow: "0 0 24px rgba(41,231,255,0.12)",
    }}>
      {/* header */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"8px 10px", borderBottom:"1px solid rgba(41,231,255,0.15)",
      }}>
        <span style={{ fontSize:12, letterSpacing:2 }}>◈ INCIDENT VELOCITY</span>
        <button onClick={() => setOpen(false)} style={{
          background:"none", border:"none", color:CY, cursor:"pointer", fontSize:14,
        }}>✕</button>
      </div>

      {err && (
        <div style={{ padding:8, color:RED, fontSize:10 }}>⚠ {err}</div>
      )}

      {/* stat tiles */}
      <div style={{ display:"flex", gap:4, padding:"8px 8px 4px" }}>
        {tiles.map(({ label, val, color, pulse }) => (
          <div key={label} style={{
            flex:1, background: DIM, borderRadius:4, padding:"4px 0",
            textAlign:"center",
            boxShadow: pulse ? `0 0 8px ${RED}` : "none",
            animation: pulse ? "pulse 1s infinite alternate" : "none",
          }}>
            <div style={{ fontSize:14, fontWeight:"bold", color }}>{val}</div>
            <div style={{ fontSize:8, color:"rgba(41,231,255,0.6)", marginTop:2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* spike note */}
      {data && data.spikes.length > 0 && (
        <div style={{
          margin:"4px 8px", padding:"4px 8px", background:"rgba(255,61,90,0.12)",
          border:"1px solid rgba(255,61,90,0.4)", borderRadius:4, fontSize:10, color:RED,
        }}>
          ⚡ Surge detected {data.spikes.length} hour{data.spikes.length!==1?"s":""} ago
          {data.spikes.length>0 ? ` (most recent: ${data.spikes[0]}h ago)` : ""}
        </div>
      )}

      {/* filter tabs */}
      <div style={{
        display:"flex", gap:4, padding:"6px 8px 2px",
        borderBottom:"1px solid rgba(41,231,255,0.1)",
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab===t ? "rgba(41,231,255,0.18)" : "transparent",
            border: tab===t ? "1px solid rgba(41,231,255,0.5)" : "1px solid transparent",
            color: CY, fontSize:9, padding:"2px 6px", cursor:"pointer", borderRadius:3,
          }}>{t}</button>
        ))}
        <div style={{ flex:1 }}/>
        <button onClick={assess} disabled={assessing || !data} style={{
          background:"rgba(0,200,120,0.12)", border:"1px solid rgba(0,200,120,0.4)",
          color:GREEN, fontSize:9, padding:"2px 6px", cursor:"pointer", borderRadius:3,
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {/* charts */}
      <div style={{ padding:"8px 8px 4px" }}>
        {!data && <div style={{ color:"rgba(41,231,255,0.4)", textAlign:"center", padding:16 }}>Loading…</div>}
        {data && visibleCharts.map(({ label, buckets, spike, color }) => (
          <div key={label} style={{ marginBottom:10 }}>
            <div style={{
              fontSize:9, color:"rgba(41,231,255,0.6)", letterSpacing:1, marginBottom:3,
              display:"flex", justifyContent:"space-between",
            }}>
              <span>{label}</span>
              <span style={{ color }}>
                total: {buckets.reduce((s,v)=>s+v,0)} · peak: {Math.max(...buckets)}
              </span>
            </div>
            <BarChart buckets={buckets} color={color} spikeMask={spike} />
            <div style={{
              display:"flex", justifyContent:"space-between",
              fontSize:8, color:"rgba(41,231,255,0.35)", marginTop:2,
            }}>
              <span>-23h</span><span>-12h</span><span>now</span>
            </div>
          </div>
        ))}
      </div>

      <style>{`@keyframes pulse{from{opacity:1}to{opacity:0.4}}`}</style>

      {/* refresh hint */}
      <div style={{
        textAlign:"center", fontSize:8,
        color:"rgba(41,231,255,0.3)", padding:"4px 0 6px",
      }}>
        auto-refresh 60 s · red bars = spike window
      </div>
    </div>
  );
}

// ─── JarvisBrain intent helpers ───────────────────────────────────────────────

export function isIncivctyQuery(q) {
  const s = q.toLowerCase();
  return (
    s.includes("incivcty") ||
    s.includes("incident velocity") ||
    s.includes("event velocity") ||
    s.includes("alert velocity") ||
    s.includes("spike detection") ||
    s.includes("ops velocity") ||
    s.includes("velocity monitor") ||
    s.includes("ops rate") ||
    s.includes("alert rate") ||
    s.includes("event rate") ||
    s.includes("incident rate")
  );
}

export async function buildIncivctyScript() {
  try {
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [evR, alR, invR] = await Promise.allSettled([
      fetch(`${base}/v1/ops/events`,     { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/ops/alerts`,     { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/investigations`, { headers: h }).then(r => r.ok ? r.json() : null),
    ]);
    const ev  = normaliseArray(evR.status  === "fulfilled" ? evR.value  : []).length;
    const al  = normaliseArray(alR.status  === "fulfilled" ? alR.value  : []).length;
    const inv = normaliseArray(invR.status === "fulfilled" ? invR.value : []).length;
    return (
      `JARVIS incident velocity monitor. Last 24 hours: ` +
      `${ev} operational events, ${al} alerts, ${inv} active investigations. ` +
      `Velocity assessment: ` +
      (ev + al > 20 ? "elevated activity detected. " : "activity within normal range. ") +
      `Monitoring for surge patterns.`
    );
  } catch {
    return "JARVIS incident velocity monitor is loading data.";
  }
}
