/**
 * SkillProgressionTracker — F37 (overnight 2026-09-18)
 *
 * Polls /v1/aip/skill every 2 minutes and keeps a rolling 24-reading
 * history in localStorage. Shows each skill's current value, a mini
 * sparkline of the last N readings, and a Δ delta badge vs the previous
 * reading so the operator can see Jarvis's self-improvement at a glance.
 *
 * Endpoint used:
 *   /v1/aip/skill  — JARVIS AIP self-improvement metrics
 *
 * Panel: per-skill row → skill name | current score | Δ badge | sparkline
 * 2-minute auto-refresh. Max 24 history readings stored.
 *
 * Voice trigger: "skill progress" / "skill trend" / "aip progress" /
 *               "skill evolution" / "skillp" / "jarvis skill history"
 * Toggle: ⬡ SKILLP at left:55080, bottom:8, zIndex:67.
 * Event in: jarvis:skillp-toggle
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY      = "#29E7FF";
const GREEN   = "#00c878";
const AMBER   = "#F5A623";
const RED     = "#FF3D5A";
const DIM     = "rgba(41,231,255,0.35)";

const BTN_LEFT    = 55080;
const REFRESH_MS  = 120_000;   // 2 minutes
const MAX_HISTORY = 24;
const LS_KEY      = "jarvis_skill_history";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise /v1/aip/skill response ────────────────────────────────────────

function normaliseSkills(raw) {
  if (!raw) return {};
  // array of { name, score } or { skill, value } objects
  if (Array.isArray(raw)) {
    const out = {};
    for (const item of raw) {
      const name  = item.name  || item.skill  || item.key  || String(Math.random());
      const score = item.score ?? item.value ?? item.metric ?? item.rating ?? 0;
      out[name] = typeof score === "number" ? score : parseFloat(score) || 0;
    }
    return out;
  }
  // object with a nested skills/metrics/data key
  if (raw.skills && typeof raw.skills === "object")  return normaliseSkills(raw.skills);
  if (raw.metrics && typeof raw.metrics === "object") return normaliseSkills(raw.metrics);
  if (raw.data && typeof raw.data === "object")       return normaliseSkills(raw.data);
  // flat object { skillName: score }
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number") out[k] = v;
    else if (typeof v === "object" && v !== null) {
      const score = v.score ?? v.value ?? v.rating ?? null;
      if (score !== null) out[k] = typeof score === "number" ? score : parseFloat(score) || 0;
    }
  }
  return out;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
  } catch {}
}

// ─── sparkline SVG ───────────────────────────────────────────────────────────

function Sparkline({ values = [], color = CY }) {
  if (values.length < 2) {
    return (
      <svg width={60} height={18} style={{ display: "block" }}>
        <line x1={0} y1={9} x2={60} y2={9} stroke={color} strokeWidth={1} opacity={0.3} />
      </svg>
    );
  }
  const lo  = Math.min(...values);
  const hi  = Math.max(...values);
  const rng = hi - lo || 1;
  const W   = 60;
  const H   = 18;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - lo) / rng) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* last dot */}
      {pts.length > 0 && (() => {
        const last = pts[pts.length - 1].split(",");
        return (
          <circle cx={last[0]} cy={last[1]} r={2} fill={color} />
        );
      })()}
    </svg>
  );
}

// ─── delta badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ delta }) {
  if (delta === null || delta === undefined) return null;
  const abs = Math.abs(delta).toFixed(1);
  if (delta > 0.05)  return <span style={{ color: GREEN,  fontSize: 9, fontFamily: "monospace" }}>↑{abs}</span>;
  if (delta < -0.05) return <span style={{ color: RED,    fontSize: 9, fontFamily: "monospace" }}>↓{abs}</span>;
  return               <span style={{ color: DIM,    fontSize: 9, fontFamily: "monospace" }}>→{abs}</span>;
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isSkillProgressQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("skillp") ||
    lq.includes("skill progress") ||
    lq.includes("skill trend") ||
    lq.includes("skill evolution") ||
    lq.includes("skill history") ||
    lq.includes("aip progress") ||
    lq.includes("jarvis skill")
  );
}

export async function buildSkillProgressScript() {
  const base = apiBase();
  try {
    const r = await fetch(`${base}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return "Skill progression tracker is standing by, sir. AIP metrics unavailable.";
    const skills = normaliseSkills(await r.json());
    const entries = Object.entries(skills);
    if (entries.length === 0) return "Skill progression tracker is online, sir, but no metrics are reported yet.";
    // Load history to compute deltas
    const history = loadHistory();
    const prev    = history.length >= 2 ? history[history.length - 2]?.skills ?? {} : {};
    const improving = entries.filter(([k, v]) => (prev[k] !== undefined) && v > prev[k]);
    const top = entries.sort(([, a], [, b]) => b - a).slice(0, 3);
    const topStr = top.map(([k, v]) => `${k} at ${v.toFixed(1)}`).join(", ");
    return (
      `Skill progression tracker: ${entries.length} active metrics. Top performers: ${topStr}. ` +
      (improving.length > 0
        ? `${improving.length} skill${improving.length > 1 ? "s" : ""} showing upward trend since last reading. Excellent self-improvement trajectory, sir.`
        : `No significant delta since last reading. Monitoring continues, sir.`)
    );
  } catch {
    return "Skill progression tracker encountered a network error, sir. Will retry on next cycle.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SkillProgressionTracker() {
  const [open,    setOpen]    = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/aip/skill`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const skills = normaliseSkills(await r.json());
      if (Object.keys(skills).length === 0) return;
      const reading = { ts: Date.now(), skills };
      setHistory((prev) => {
        const next = [...prev, reading].slice(-MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:skillp-toggle", handler);
    return () => window.removeEventListener("jarvis:skillp-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    timerRef.current = setInterval(poll, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, poll]);

  // ── derive per-skill series from history ────────────────────────────────────
  const latest = history.length > 0 ? history[history.length - 1]?.skills ?? {} : {};
  const prev    = history.length > 1 ? history[history.length - 2]?.skills ?? {} : {};

  const skillNames = Object.keys(latest).sort((a, b) => (latest[b] ?? 0) - (latest[a] ?? 0));

  function seriesFor(name) {
    return history.map((h) => h.skills?.[name] ?? null).filter((v) => v !== null);
  }

  function scoreColor(v) {
    if (v >= 80) return GREEN;
    if (v >= 55) return CY;
    if (v >= 35) return AMBER;
    return RED;
  }

  return (
    <>
      {/* Toggle pill */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 67,
          background: open ? CY : "rgba(0,0,0,0.55)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4,
          padding: "3px 8px",
          fontSize: 10,
          fontFamily: "monospace",
          cursor: "pointer",
          letterSpacing: 1,
          whiteSpace: "nowrap",
        }}
      >
        ⬡ SKILLP
        {skillNames.length > 0 && (
          <span
            style={{
              marginLeft: 4,
              background: CY + "33",
              color: CY,
              borderRadius: 3,
              padding: "0 4px",
              fontWeight: 700,
              fontSize: 9,
            }}
          >
            {skillNames.length}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 40,
            width: 480,
            maxHeight: "72vh",
            background: "rgba(0,8,20,0.97)",
            border: `1px solid ${CY}`,
            borderRadius: 6,
            zIndex: 9002,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: `0 0 24px ${CY}44`,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "10px 14px 8px",
              borderBottom: `1px solid ${CY}33`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ color: CY, fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>
              ⬡ SKILL PROGRESSION TRACKER
            </span>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {loading && (
                <span style={{ color: CY, fontSize: 9, opacity: 0.7, fontFamily: "monospace" }}>
                  SYNC…
                </span>
              )}
              <span style={{ color: DIM, fontSize: 9, fontFamily: "monospace" }}>
                {history.length}/{MAX_HISTORY} readings
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Summary tiles */}
          <div
            style={{
              display: "flex",
              gap: 8,
              padding: "8px 14px",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {[
              {
                label: "SKILLS",
                val: skillNames.length,
                col: CY,
              },
              {
                label: "READINGS",
                val: history.length,
                col: CY,
              },
              {
                label: "IMPROVING",
                val: skillNames.filter(
                  (k) => prev[k] !== undefined && (latest[k] ?? 0) > (prev[k] ?? 0)
                ).length,
                col: GREEN,
              },
              {
                label: "DECLINING",
                val: skillNames.filter(
                  (k) => prev[k] !== undefined && (latest[k] ?? 0) < (prev[k] ?? 0)
                ).length,
                col: AMBER,
              },
            ].map(({ label, val, col }) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 4,
                  padding: "6px 8px",
                  textAlign: "center",
                  border: `1px solid ${col}44`,
                }}
              >
                <div style={{ color: col, fontSize: 16, fontWeight: 700, fontFamily: "monospace" }}>
                  {val}
                </div>
                <div style={{ color: col, fontSize: 8, opacity: 0.7, letterSpacing: 1 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Skill rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px 12px" }}>
            {skillNames.length === 0 && (
              <div
                style={{
                  color: CY,
                  opacity: 0.5,
                  fontFamily: "monospace",
                  fontSize: 10,
                  padding: "20px 0",
                  textAlign: "center",
                }}
              >
                {loading
                  ? "Fetching AIP skill metrics…"
                  : "No skill metrics yet. Panel will populate on first poll."}
              </div>
            )}
            {skillNames.map((name) => {
              const current = latest[name] ?? 0;
              const delta   = prev[name] !== undefined ? current - prev[name] : null;
              const series  = seriesFor(name);
              const col     = scoreColor(current);
              return (
                <div
                  key={name}
                  style={{
                    marginBottom: 6,
                    background: "rgba(255,255,255,0.03)",
                    border: `1px solid ${col}33`,
                    borderRadius: 4,
                    padding: "6px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  {/* Score bar */}
                  <div
                    style={{
                      width: 36,
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        color: col,
                        fontSize: 14,
                        fontWeight: 700,
                        fontFamily: "monospace",
                        lineHeight: 1,
                      }}
                    >
                      {current.toFixed(0)}
                    </div>
                    <div style={{ color: col, fontSize: 7, opacity: 0.6, letterSpacing: 1 }}>
                      SCORE
                    </div>
                  </div>

                  {/* Name + delta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: "#d0e8ff",
                        fontSize: 10,
                        fontFamily: "monospace",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name.replace(/_/g, " ").toUpperCase()}
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <DeltaBadge delta={delta} />
                      {delta === null && (
                        <span style={{ color: DIM, fontSize: 8, fontFamily: "monospace" }}>
                          first reading
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div style={{ flexShrink: 0 }}>
                    <Sparkline values={series} color={col} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer: last update time */}
          {history.length > 0 && (
            <div
              style={{
                padding: "5px 14px",
                borderTop: `1px solid ${CY}22`,
                fontSize: 8,
                color: DIM,
                fontFamily: "monospace",
                letterSpacing: 1,
              }}
            >
              LAST READING:{" "}
              {new Date(history[history.length - 1].ts).toLocaleTimeString()}
              {" — "}NEXT IN 2 MIN
            </div>
          )}
        </div>
      )}
    </>
  );
}
