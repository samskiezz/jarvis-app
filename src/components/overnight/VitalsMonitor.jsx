/**
 * F51 — Biometric Vitals Monitor
 *
 * Polls /v1/vitals/latest every 60 s and shows HR, HRV, SpO2, steps,
 * sleep_min, and weight_kg as gauge cards. Falls back to the endpoint's
 * built-in defaults when no observations have been posted yet so the panel
 * is always useful. A ▶ ASSESS button sends the snapshot to
 * /v1/jarvis/agent/chat for an AI health commentary spoken via TTS.
 *
 * Voice triggers: "JARVIS, vitals" / "biometrics" / "health metrics" /
 *                 "vitals" / "vitals monitor" / "body stats"
 * Button: ◈ VITALS  left:10460, bottom:8, zIndex 65
 */
import { useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT  = 10460;
const POLL_MS   = 60_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

async function fetchVitals() {
  const r = await fetch(`${apiBase()}/v1/vitals/latest`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`vitals ${r.status}`);
  return r.json();
}

async function askJarvis(prompt) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`agent/chat ${r.status}`);
  const j = await r.json();
  return j.response || j.message || JSON.stringify(j);
}

function speak(text) {
  window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
}

const METRIC_META = {
  hr:         { label: "HEART RATE",  unit: "bpm",  color: C.red,    norm: [50, 100], icon: "♥" },
  hrv:        { label: "HRV",         unit: "ms",   color: C.neon,   norm: [20, 80],  icon: "~" },
  spo2:       { label: "SpO₂",        unit: "%",    color: C.blue,   norm: [95, 100], icon: "O₂" },
  steps:      { label: "STEPS",       unit: "steps",color: C.gold,   norm: [0, 10000],icon: "⊳" },
  sleep_min:  { label: "SLEEP",       unit: "min",  color: C.purple, norm: [0, 480],  icon: "◌" },
  weight_kg:  { label: "WEIGHT",      unit: "kg",   color: C.orange, norm: [40, 120], icon: "▣" },
};

const DISPLAY_ORDER = ["hr", "hrv", "spo2", "steps", "sleep_min", "weight_kg"];

function clamp01(v, lo, hi) {
  if (hi <= lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

function GaugeBar({ value, norm, color }) {
  const pct = clamp01(value ?? 0, norm[0], norm[1]) * 100;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color,
        borderRadius: 2, transition: "width 0.4s ease" }} />
    </div>
  );
}

function VitalCard({ metaKey, item }) {
  const meta = METRIC_META[metaKey];
  if (!meta || item == null) return null;
  const val   = item.value ?? 0;
  const unit  = item.unit || meta.unit;
  const src   = item.source || "—";
  const ts    = item.ts ? new Date(item.ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

  const displayVal = metaKey === "sleep_min"
    ? `${Math.floor(val / 60)}h ${Math.round(val % 60)}m`
    : metaKey === "steps"
    ? val.toLocaleString()
    : Number.isFinite(val) ? val.toFixed(metaKey === "weight_kg" ? 1 : 0) : "—";

  return (
    <div style={{
      background: "rgba(0,0,0,0.28)", border: `1px solid rgba(255,255,255,0.07)`,
      borderRadius: S.radius, padding: "10px 12px", minWidth: 130,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontFamily: S.mono, fontSize: S.fs.xxs, color: S.text, letterSpacing: 1 }}>
        <span style={{ color: meta.color, fontWeight: 700 }}>{meta.icon} {meta.label}</span>
        <span style={{ color: S.text, fontSize: 6 }}>{ts}</span>
      </div>
      <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, color: meta.color,
        lineHeight: 1.1, margin: "4px 0 6px" }}>
        {displayVal}
        <span style={{ fontSize: S.fs.xxs, fontWeight: 400, color: S.textHi, marginLeft: 4 }}>
          {unit}
        </span>
      </div>
      <GaugeBar value={val} norm={meta.norm} color={meta.color} />
      <div style={{ fontFamily: S.mono, fontSize: S.fs.xxs, color: S.text,
        marginTop: 4, letterSpacing: 0.5 }}>{src}</div>
    </div>
  );
}

export default function VitalsMonitor() {
  const [open,    setOpen]    = useState(false);
  const [vitals,  setVitals]  = useState(null);
  const [err,     setErr]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState(null);
  const [tick,    setTick]    = useState(0);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchVitals();
      setVitals(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(() => {
      load();
      setTick((t) => t + 1);
    }, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    function onAsk(e) {
      const q = (e.detail?.text || e.detail?.message || "").toLowerCase();
      const isVitals = /vitals|biometric|health metric|body stat|heart rate|hrv|spo2|my health/i.test(q);
      if (isVitals) setOpen(true);
    }
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function assess() {
    if (!vitals?.items) return;
    setAssessing(true);
    setAssessment(null);
    try {
      const items = vitals.items;
      const summary = Object.entries(items)
        .map(([k, v]) => {
          const m = METRIC_META[k];
          const label = m ? m.label : k;
          const unit  = v.unit || (m ? m.unit : "");
          return `${label}: ${v.value} ${unit}`;
        })
        .join(", ");
      const prompt = `JARVIS biometric snapshot — ${summary}. Give a 2-sentence health commentary on these readings.`;
      const reply = await askJarvis(prompt);
      setAssessment(reply);
      speak(reply);
    } catch (e) {
      setAssessment(`Assessment unavailable: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
    background: open ? C.red : "rgba(4,10,16,0.90)",
    border: `1px solid ${open ? C.red : "rgba(232,32,60,0.3)"}`,
    color: open ? "#fff" : C.red,
    fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1.5,
    padding: "3px 9px", borderRadius: S.radius, cursor: "pointer",
    transition: "all 0.2s",
  };

  if (!open) {
    return <button style={btnStyle} onClick={() => setOpen(true)}>◈ VITALS</button>;
  }

  const items = vitals?.items || {};

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>◈ VITALS</button>

      <div style={{
        position: "fixed", bottom: 36, right: 20, zIndex: 65, width: 540,
        background: S.glass, backdropFilter: S.blur,
        border: `1px solid rgba(232,32,60,0.22)`,
        borderRadius: S.radius, padding: "14px 16px",
        fontFamily: S.mono,
        boxShadow: "0 0 32px -8px rgba(232,32,60,0.18)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12 }}>
          <span style={{ color: C.red, fontSize: S.fs.sm, fontWeight: 700, letterSpacing: 2 }}>
            ♥ BIOMETRIC VITALS
          </span>
          <span style={{ color: S.text, fontSize: S.fs.xxs }}>
            {loading ? "SYNCING…" : vitals?.source === "live" ? "LIVE" : vitals ? "DEFAULT SCHEMA" : "—"}
            {" · "}
            {tick > 0 ? `${tick} polls` : "initialising"}
          </span>
        </div>

        {err && (
          <div style={{ color: C.red, fontSize: S.fs.xs, marginBottom: 10 }}>
            ⚠ {err}
          </div>
        )}

        {/* Vital cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
          {DISPLAY_ORDER.map((key) => (
            <VitalCard key={key} metaKey={key} item={items[key]} />
          ))}
        </div>

        {/* Assess button */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: assessment ? 10 : 0 }}>
          <button
            disabled={assessing || !vitals}
            onClick={assess}
            style={{
              background: assessing ? "transparent" : "rgba(232,32,60,0.12)",
              border: `1px solid ${C.red}44`,
              color: C.red, fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
              padding: "4px 12px", borderRadius: S.radius, cursor: assessing ? "default" : "pointer",
            }}>
            {assessing ? "ASSESSING…" : "▶ JARVIS ASSESS"}
          </button>
          <span style={{ color: S.text, fontSize: S.fs.xxs }}>
            {vitals?.count != null ? `${vitals.count} metrics` : ""}
          </span>
        </div>

        {/* AI assessment */}
        {assessment && (
          <div style={{
            background: "rgba(232,32,60,0.06)", border: `1px solid rgba(232,32,60,0.18)`,
            borderRadius: S.radius, padding: "8px 10px",
            color: S.textHi, fontSize: S.fs.xs, lineHeight: 1.55,
          }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
