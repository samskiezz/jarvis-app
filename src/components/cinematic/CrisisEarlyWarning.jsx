/**
 * CrisisEarlyWarning — F79.
 *
 * Parallel-fetches /entities/RiskSignal + /functions/getLiveIntel +
 * /v1/ops/events to compute a composite DEFCON-style threat level (1–5):
 *   1 = CRITICAL  (immediately actionable — red pulse)
 *   2 = SEVERE    (high danger — red)
 *   3 = ELEVATED  (above normal — amber)
 *   4 = GUARDED   (low threat — cyan)
 *   5 = NORMAL    (all clear — green)
 *
 * Composite score = 40% risk signals (critical/high count) +
 *                   35% seismic (max magnitude ÷ 9.5) +
 *                   25% ops events (critical sev≥90 count in last hour)
 *
 * When the level worsens between polls, announces via jarvis:speak-dossier + TTS.
 * 90s auto-refresh.
 *
 * Intent: "crisis level" / "threat level" / "early warning" /
 *         "defcon" / "crisis status" / "global threat" / "crisis"
 *   → jarvis:crisis-warning-toggle + TTS brief via buildCrisisWarningScript()
 *
 * Toggle: ⚠ CRISIS at left:6940, zIndex 65. Pulse badge on level ≤ 2.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 6940;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── threat model ─────────────────────────────────────────────────────────────

const DEFCON = [
  { level: 1, label: "CRITICAL",  color: RED,   desc: "Immediate action required" },
  { level: 2, label: "SEVERE",    color: RED,   desc: "High probability of incident" },
  { level: 3, label: "ELEVATED",  color: AMBER, desc: "Significant threat environment" },
  { level: 4, label: "GUARDED",   color: CY,    desc: "Low threat, heightened awareness" },
  { level: 5, label: "NORMAL",    color: GREEN, desc: "All systems nominal" },
];

function defconInfo(level) {
  return DEFCON.find((d) => d.level === level) || DEFCON[4];
}

function computeLevel(riskScore, seismicScore, opsScore) {
  // Weighted composite 0–100; higher = more dangerous
  const composite = riskScore * 0.4 + seismicScore * 0.35 + opsScore * 0.25;
  if (composite >= 80) return 1;
  if (composite >= 60) return 2;
  if (composite >= 40) return 3;
  if (composite >= 20) return 4;
  return 5;
}

function normaliseRiskSignals(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.results)) arr = raw.results;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  return arr;
}

function riskScore(signals) {
  const criticals = signals.filter((s) => {
    const sev = Number(s.severity || s.score || s.risk_score || 0);
    const lbl = (s.severity_label || s.label || "").toLowerCase();
    return sev >= 90 || lbl === "critical";
  }).length;
  const highs = signals.filter((s) => {
    const sev = Number(s.severity || s.score || s.risk_score || 0);
    const lbl = (s.severity_label || s.label || "").toLowerCase();
    return (sev >= 70 && sev < 90) || lbl === "high";
  }).length;
  // Each critical = 20 pts, each high = 8 pts, capped at 100
  return Math.min(100, criticals * 20 + highs * 8);
}

function seismicScore(raw) {
  // Normalise to a 0–100 scale using max magnitude (9.5 = Richter upper bound)
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.seismic)) arr = raw.seismic;
  else if (raw && Array.isArray(raw.earthquakes)) arr = raw.earthquakes;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  else if (raw && typeof raw === "object") {
    for (const key of Object.keys(raw)) {
      if (Array.isArray(raw[key]) && raw[key][0]?.magnitude !== undefined) {
        arr = raw[key]; break;
      }
    }
  }
  if (arr.length === 0) return 0;
  const maxMag = Math.max(...arr.map((q) => parseFloat(q.magnitude || q.mag || 0) || 0));
  const countBonus = Math.min(30, arr.length * 2);
  return Math.min(100, Math.round((maxMag / 9.5) * 70 + countBonus));
}

function normaliseOpsEvents(raw) {
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.results)) arr = raw.results;
  else if (raw && Array.isArray(raw.events)) arr = raw.events;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  return arr;
}

function opsScore(events) {
  const hourAgo = Date.now() - 3_600_000;
  const recent = events.filter((e) => {
    const ts = e.timestamp || e.created_at || e.occurred_at || 0;
    return ts ? new Date(ts).getTime() >= hourAgo : true;
  });
  const criticals = recent.filter((e) => Number(e.severity || e.score || 0) >= 90).length;
  return Math.min(100, criticals * 25);
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const CRISIS_RE =
  /crisis.{0,20}(level|status|warn|alert|early)|threat.{0,15}level|early.{0,15}warn|defcon|global.{0,15}threat|\bcrisis\b/i;

export function isCrisisWarningQuery(q) {
  return CRISIS_RE.test(q || "");
}

export async function buildCrisisWarningScript() {
  try {
    const hdrs = { Authorization: `Bearer ${API_KEY}` };
    const [rsRaw, seisRaw, opsRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/RiskSignal?limit=100`, { headers: hdrs }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdrs }).then((r) => r.json()).catch(() => ({})),
      fetch(`${apiBase()}/v1/ops/events?limit=50`, { headers: hdrs }).then((r) => r.json()).catch(() => []),
    ]);
    const signals = normaliseRiskSignals(rsRaw);
    const rs = riskScore(signals);
    const ss = seismicScore(seisRaw);
    const os = opsScore(normaliseOpsEvents(opsRaw));
    const level = computeLevel(rs, ss, os);
    const info = defconInfo(level);
    const critRisks = signals.filter((s) => Number(s.severity || s.score || 0) >= 90).length;
    return `Crisis Early Warning System, DEFCON ${level}: ${info.label}. ${info.desc}. ` +
      `Risk factor ${Math.round(rs)}, seismic factor ${Math.round(ss)}, ops factor ${Math.round(os)}. ` +
      `${critRisks} critical risk signal${critRisks !== 1 ? "s" : ""} active. ` +
      (level <= 2 ? "Immediate review recommended, sir." : level === 3 ? "Heightened vigilance advised, sir." : "Situation is under control, sir.");
  } catch (_) {
    return "Crisis Early Warning System online. Unable to retrieve all factors at this time, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CrisisEarlyWarning() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [level, setLevel]         = useState(null);
  const [rsFactor, setRsFactor]   = useState(0);
  const [seisFactor, setSeisFactor] = useState(0);
  const [opsFactor, setOpsFactor] = useState(0);
  const [sigCount, setSigCount]   = useState(0);
  const [critCount, setCritCount] = useState(0);
  const [maxMag, setMaxMag]       = useState(0);
  const [critOps, setCritOps]     = useState(0);
  const [lastLevel, setLastLevel] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const hdrs = { Authorization: `Bearer ${API_KEY}` };
      const [rsRaw, seisRaw, opsRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/RiskSignal?limit=100`, { headers: hdrs }).then((r) => r.json()).catch(() => []),
        fetch(`${apiBase()}/functions/getLiveIntel`, { headers: hdrs }).then((r) => r.json()).catch(() => ({})),
        fetch(`${apiBase()}/v1/ops/events?limit=50`, { headers: hdrs }).then((r) => r.json()).catch(() => []),
      ]);
      const signals  = normaliseRiskSignals(rsRaw);
      const rs       = riskScore(signals);
      const ss       = seismicScore(seisRaw);
      const opsEvents = normaliseOpsEvents(opsRaw);
      const os       = opsScore(opsEvents);
      const newLevel = computeLevel(rs, ss, os);

      // Flatten quakes for maxMag display
      let quakes = [];
      if (Array.isArray(seisRaw)) quakes = seisRaw;
      else if (seisRaw?.seismic) quakes = seisRaw.seismic;
      else if (seisRaw?.earthquakes) quakes = seisRaw.earthquakes;
      else if (seisRaw?.data) quakes = seisRaw.data;
      const mx = quakes.length
        ? Math.max(...quakes.map((q) => parseFloat(q.magnitude || q.mag || 0) || 0))
        : 0;

      const co = opsEvents.filter((e) => Number(e.severity || e.score || 0) >= 90).length;
      const cc = signals.filter((s) => Number(s.severity || s.score || 0) >= 90).length;

      setRsFactor(rs); setSeisFactor(ss); setOpsFactor(os);
      setSigCount(signals.length); setCritCount(cc);
      setMaxMag(mx); setCritOps(co);
      setLevel(newLevel);

      // Announce if level worsened
      if (lastLevel !== null && newLevel < lastLevel) {
        const info = defconInfo(newLevel);
        const msg = `Alert: Crisis threat level elevated to DEFCON ${newLevel}: ${info.label}. ${info.desc}, sir.`;
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: msg } }));
      }
      setLastLevel(newLevel);
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, [lastLevel]);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:crisis-warning-toggle", onToggle);
    return () => window.removeEventListener("jarvis:crisis-warning-toggle", onToggle);
  }, []);

  const info  = level ? defconInfo(level) : null;
  const pulse = level !== null && level <= 2;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Crisis Early Warning System"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: open ? (info?.color || CY) : "rgba(8,14,22,0.75)",
          border: `1px solid ${info?.color || CY}`,
          color: open ? "#04060A" : (info?.color || CY),
          borderRadius: 4, padding: "2px 7px", fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer", letterSpacing: 1,
          boxShadow: pulse ? `0 0 14px ${RED}` : "none",
          animation: pulse ? "cew-pulse 1.2s ease-in-out infinite" : "none",
        }}
      >
        ⚠ CRISIS
        {level !== null && (
          <span style={{
            marginLeft: 5, background: info?.color, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {level}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 30, left: BTN_LEFT - 60, zIndex: 65,
          width: 340, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,10,16,0.95)", border: `1px solid ${info?.color || CY}55`,
          borderTop: `2px solid ${info?.color || CY}`,
          borderRadius: 10, padding: 14,
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: pulse ? `0 0 40px ${RED}33` : `0 0 30px ${CY}11`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: info?.color || CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⚠ CRISIS EARLY WARNING
            </span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 13,
            }}>✕</button>
          </div>

          {loading && !level && (
            <div style={{ color: "#445566", fontSize: 9, textAlign: "center", padding: 20 }}>
              ◌ scanning threat landscape…
            </div>
          )}

          {err && (
            <div style={{ color: RED, fontSize: 9, padding: 8 }}>⚠ {err}</div>
          )}

          {level !== null && (
            <>
              {/* DEFCON level display */}
              <div style={{
                textAlign: "center", padding: "12px 0 16px",
                borderBottom: `1px solid ${info?.color}33`, marginBottom: 14,
              }}>
                <div style={{
                  fontSize: 9, color: "#445566", letterSpacing: 3, marginBottom: 4,
                }}>THREAT LEVEL</div>
                <div style={{
                  fontSize: 44, fontWeight: 900, color: info?.color,
                  textShadow: `0 0 30px ${info?.color}`,
                  animation: pulse ? "cew-pulse 1.2s ease-in-out infinite" : "none",
                  lineHeight: 1,
                }}>
                  {level}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: info?.color,
                  letterSpacing: 4, marginTop: 4,
                }}>
                  {info?.label}
                </div>
                <div style={{ fontSize: 9, color: "#667788", marginTop: 6, letterSpacing: 1 }}>
                  {info?.desc}
                </div>
              </div>

              {/* Factor breakdown */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 8, color: "#445566", letterSpacing: 2, marginBottom: 6 }}>
                  COMPOSITE FACTORS
                </div>

                {[
                  { label: "RISK SIGNALS", value: rsFactor, weight: "40%", detail: `${critCount} critical / ${sigCount} total` },
                  { label: "SEISMIC",      value: seisFactor, weight: "35%", detail: `max M${maxMag.toFixed(1)}` },
                  { label: "OPS EVENTS",   value: opsFactor,  weight: "25%", detail: `${critOps} critical in last hour` },
                ].map(({ label, value, weight, detail }) => {
                  const barColor = value >= 80 ? RED : value >= 60 ? RED : value >= 40 ? AMBER : value >= 20 ? CY : GREEN;
                  return (
                    <div key={label} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 8, color: "#667788", letterSpacing: 1 }}>
                          {label} <span style={{ color: "#334455" }}>({weight})</span>
                        </span>
                        <span style={{ fontSize: 8, color: barColor, fontWeight: 700 }}>
                          {Math.round(value)}
                        </span>
                      </div>
                      <div style={{ height: 4, background: "#0d1620", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          width: `${value}%`, height: "100%",
                          background: barColor,
                          boxShadow: `0 0 6px ${barColor}`,
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <div style={{ fontSize: 7, color: "#334455", marginTop: 2 }}>{detail}</div>
                    </div>
                  );
                })}
              </div>

              {/* Composite score ring (text summary) */}
              <div style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 8, marginBottom: 10,
              }}>
                <div style={{ fontSize: 8, color: "#445566", letterSpacing: 2, marginBottom: 4 }}>COMPOSITE SCORE</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => {
                    const composite = Math.round(rsFactor * 0.4 + seisFactor * 0.35 + opsFactor * 0.25);
                    const compositeColor = composite >= 80 ? RED : composite >= 60 ? RED : composite >= 40 ? AMBER : composite >= 20 ? CY : GREEN;
                    return (
                      <div style={{ textAlign: "center", flex: 1 }}>
                        <span style={{ fontSize: 28, fontWeight: 900, color: compositeColor }}>
                          {composite}
                        </span>
                        <div style={{ fontSize: 7, color: "#334455", letterSpacing: 1 }}>/100</div>
                      </div>
                    );
                  })()}
                  <div style={{ flex: 2, display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
                    {DEFCON.map((d) => (
                      <div key={d.level} style={{
                        display: "flex", alignItems: "center", gap: 5,
                        opacity: d.level === level ? 1 : 0.3,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: d.color,
                          boxShadow: d.level === level ? `0 0 8px ${d.color}` : "none",
                        }} />
                        <span style={{ fontSize: 7, color: d.color, letterSpacing: 1 }}>
                          {d.level} — {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Get AI assessment button */}
              <button
                onClick={async () => {
                  setSelectedDetail("loading");
                  try {
                    const info2 = defconInfo(level);
                    const prompt = `Crisis Early Warning System assessment: DEFCON ${level} (${info2.label}). ` +
                      `Risk factor ${Math.round(rsFactor)}/100 (${critCount} critical signals, ${sigCount} total). ` +
                      `Seismic factor ${Math.round(seisFactor)}/100 (max M${maxMag.toFixed(1)}). ` +
                      `Ops factor ${Math.round(opsFactor)}/100 (${critOps} critical events in last hour). ` +
                      `Provide a 2-sentence crisis assessment and immediate recommended action.`;
                    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
                      body: JSON.stringify({ message: prompt }),
                    });
                    const d = await r.json();
                    const txt = (d.answer || d.response || d.message || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
                    setSelectedDetail(txt || "No assessment available.");
                    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
                  } catch (_) {
                    setSelectedDetail("Unable to fetch AI assessment at this time, sir.");
                  }
                }}
                style={{
                  width: "100%", padding: "6px 10px", background: "none",
                  border: `1px solid ${info?.color}`, borderRadius: 5,
                  color: info?.color, fontSize: 9, letterSpacing: 1, cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ▶ JARVIS CRISIS ASSESSMENT
              </button>

              {selectedDetail && selectedDetail !== "loading" && (
                <div style={{
                  marginTop: 8, padding: 8, background: "rgba(0,0,0,0.3)", borderRadius: 5,
                  fontSize: 9, color: "#AABBCC", lineHeight: 1.5,
                  borderLeft: `2px solid ${info?.color}`,
                }}>
                  {selectedDetail}
                </div>
              )}
              {selectedDetail === "loading" && (
                <div style={{ marginTop: 8, color: "#445566", fontSize: 9, textAlign: "center" }}>
                  ◌ consulting threat analysis core…
                </div>
              )}

              <div style={{ marginTop: 10, color: "#223344", fontSize: 7, textAlign: "right" }}>
                /entities/RiskSignal · /functions/getLiveIntel · /v1/ops/events · 90s auto-refresh
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes cew-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.75; }
        }
      `}</style>
    </>
  );
}
