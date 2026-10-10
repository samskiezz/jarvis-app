/**
 * SensorActivityMonitor — F258.
 *
 * Data sources (real — backed by server/routes/sensors.py):
 *   GET  /v1/sensors/status
 *       → { ok, imu: { buffered, capacity, last_ts, last_source },
 *             audio: { ok, available, loaded, model } }
 *   GET  /v1/sensors/recent?window_s=60
 *       → { ok, window_s, samples, activity, rms_linear_acceleration_mps2,
 *             peak_linear_acceleration_mps2, peak_rotation_rate_dps,
 *             buffered, first_ts, last_ts }
 *
 * Displays:
 *   - Stat tiles: buffered / activity / peak-accel / audio-state
 *   - Activity badge (still / walking / running / vehicle / high_motion / no_data)
 *   - IMU source + last-seen age chip
 *   - Audio classifier availability chip
 *   - Acc + rotation bars
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ⊙ SNSR at left:201360, bottom:8, zIndex:137.
 * Badge: green = has IMU data, amber = no IMU but audio available, dim = empty.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isSnsrQuery(q) / buildSnsrScript()
 *
 * Voice triggers: "sensors / imu / motion sensor / sensor activity /
 *   sensor monitor / accelerometer / gyroscope / snsr / ambient sensor /
 *   motion data / physical sensors / device motion / sensor health"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 201360;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SNSR_RE =
  /\b(sensors?|imu|motion sensor|sensor activity|sensor monitor|accelerometer|gyroscope|snsr|ambient sensor|motion data|physical sensors?|device motion|sensor health)\b/i;

export function isSnsrQuery(t) {
  return SNSR_RE.test(t || "");
}

export async function buildSnsrScript() {
  try {
    const [sr, rr] = await Promise.all([
      fetch(`${apiBase()}/v1/sensors/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/sensors/recent?window_s=60`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const status = await sr.json();
    const recent = await rr.json();
    const buffered = status?.imu?.buffered ?? 0;
    const activity = recent?.activity || "no_data";
    const audio = status?.audio?.loaded ? "loaded" : "not loaded";
    return (
      `IMU buffer holds ${buffered} samples; ` +
      `current activity over the last 60 s is "${activity}". ` +
      `Audio classifier is ${audio}. ` +
      `Peak linear acceleration ${recent?.peak_linear_acceleration_mps2 ?? "—"} m/s².`
    );
  } catch {
    return "Unable to reach the sensor endpoints at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/sensors/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchRecent(window_s = 60) {
  const r = await fetch(`${apiBase()}/v1/sensors/recent?window_s=${window_s}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(activity, buffered, peakAcc) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the current sensor activity in 2 sentences: ` +
        `IMU buffer has ${buffered} samples, ` +
        `activity label is "${activity}", ` +
        `peak acceleration ${peakAcc} m/s². ` +
        `Note any operational implications for the operator.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── activity colour map ────────────────────────────────────────────────────

function activityColor(label) {
  const l = (label || "").toLowerCase();
  if (l === "still")       return GN;
  if (l === "walking")     return CY;
  if (l === "running")     return AM;
  if (l === "vehicle")     return PUR;
  if (l === "high_motion") return RED;
  return DIM;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 55, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700, color, letterSpacing: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 7, padding: "1px 6px", borderRadius: 3,
      border: `1px solid ${color}55`, color, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
        <span style={{ fontSize: 7, color }}>{typeof value === "number" ? value.toFixed(3) : value}</span>
      </div>
      <div style={{ height: 4, background: `${color}1a`, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = (Date.now() - ts * 1000) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s ago`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

// ─── main component ─────────────────────────────────────────────────────────

export default function SensorActivityMonitor() {
  const [open,      setOpen]      = useState(false);
  const [status,    setStatus]    = useState(null);
  const [recent,    setRecent]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [dossier,   setDossier]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([fetchStatus(), fetchRecent(60)]);
      setStatus(s);
      setRecent(r);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (SNSR_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:snsr-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:snsr-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const activity = recent?.activity || "no_data";
      const buffered = status?.imu?.buffered ?? 0;
      const peakAcc  = recent?.peak_linear_acceleration_mps2 ?? 0;
      const text = await agentAssess(activity, buffered, peakAcc);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived values
  const buffered    = status?.imu?.buffered ?? 0;
  const capacity    = status?.imu?.capacity ?? 200000;
  const lastSrc     = status?.imu?.last_source || "—";
  const lastTs      = status?.imu?.last_ts || null;
  const audioLoaded = status?.audio?.loaded ?? false;
  const audioAvail  = status?.audio?.available ?? false;
  const activity    = recent?.activity || "no_data";
  const rms         = recent?.rms_linear_acceleration_mps2 ?? 0;
  const peakAcc     = recent?.peak_linear_acceleration_mps2 ?? 0;
  const peakRot     = recent?.peak_rotation_rate_dps ?? 0;
  const sampleCount = recent?.samples ?? 0;

  const actColor = activityColor(activity);

  // badge logic: green if has IMU data, amber if audio available but no IMU, dim if empty
  const badgeColor =
    buffered > 0 ? GN : (audioAvail ? AM : null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 137,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⊙ SNSR
        {badgeColor && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {buffered > 9999 ? "∞" : buffered > 0 ? "●" : "○"}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 137,
      width: 340, maxHeight: 520,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ⊙ SENSOR ACTIVITY
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="BUFFERED"  value={buffered}           color={buffered > 0 ? GN : DIM} />
        <Tile label="ACTIVITY"  value={activity.slice(0, 8)} color={actColor} />
        <Tile label="PEAK m/s²" value={peakAcc.toFixed(2)} color={peakAcc > 2 ? AM : CY} />
        <Tile label="AUDIO"     value={audioLoaded ? "LOADED" : audioAvail ? "AVAIL" : "N/A"} color={audioLoaded ? GN : audioAvail ? AM : DIM} />
      </div>

      {/* activity + meta row */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 5, flexWrap: "wrap" }}>
        <Chip label={`ACTIVITY: ${activity.toUpperCase()}`} color={actColor} />
        <Chip label={`SRC: ${lastSrc.slice(0, 12)}`} color={CY} />
        {lastTs && <Chip label={timeAgo(lastTs)} color={DIM} />}
        {sampleCount > 0 && <Chip label={`${sampleCount} samples`} color={GN} />}
      </div>

      {/* acceleration + rotation bars */}
      <div style={{ padding: "0 12px 4px" }}>
        <Bar label="RMS LINEAR ACCEL (m/s²)"   value={rms}     max={5}   color={CY} />
        <Bar label="PEAK LINEAR ACCEL (m/s²)"  value={peakAcc} max={10}  color={AM} />
        <Bar label="PEAK ROTATION RATE (dps)"  value={peakRot} max={360} color={PUR} />
        <Bar label="BUFFER FILL"               value={buffered} max={capacity} color={GN} />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>
          audio: {audioLoaded ? "●loaded" : audioAvail ? "○avail" : "—"}
        </span>
        <span>60 s poll · /v1/sensors</span>
      </div>
    </div>
  );
}
