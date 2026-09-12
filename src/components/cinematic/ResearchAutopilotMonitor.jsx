/**
 * ResearchAutopilotMonitor — F50 LLM research autopilot live monitor.
 *
 * Polls /v1/jarvis/research/status every 30 s and shows the state of the
 * continuous LLM research loop (is the GPU / local LLM being hammered):
 * autopilot running/idle, backend (ollama / openai-compatible / null),
 * concurrency, interval, uptime, iterations, topics researched, notes
 * injected, last topic, last error, idle-no-llm flag, connection info
 * (ollama_host / source / model). ASSESS asks /v1/jarvis/agent/chat for a
 * 2-sentence brief and speaks it via jarvis:speak-dossier.
 *
 * Button: ◈ RAUT (left:900 bottom:18)
 * Endpoint: /v1/jarvis/research/status (+ /v1/jarvis/agent/chat for ASSESS)
 * Voice trigger: "research autopilot" | "raut" | "autopilot status" |
 *                "research status" | "gpu autopilot" | "research loop"
 * Event: jarvis:raut-toggle
 * Refresh: 30 s auto-poll.
 *
 * Additive only — mounted via App.jsx; wired via JarvisBrain.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

const CY    = "#29E7FF";
const GRN   = "#00E5A0";
const AMB   = "#F59E0B";
const RED   = "#FF3B6B";
const DIM   = "#4A6070";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT = 900;
const POLL_MS  = 30_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── data ────────────────────────────────────────────────────────────────────

async function fetchResearchStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/research/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`research/status ${r.status}`);
  const d = await r.json();
  const ap = d?.autopilot || {};
  const cn = d?.connection || {};
  return {
    backend:   d?.backend ? String(d.backend) : null,
    available: Boolean(d?.available),
    hint:      d?.hint ? String(d.hint) : "",
    autopilot: {
      running:            Boolean(ap.running),
      backend:            ap.backend ? String(ap.backend) : null,
      concurrency:        Number.isFinite(Number(ap.concurrency)) ? Number(ap.concurrency) : 0,
      interval_s:         Number.isFinite(Number(ap.interval_s)) ? Number(ap.interval_s) : 0,
      started_ts:         Number.isFinite(Number(ap.started_ts)) ? Number(ap.started_ts) : null,
      iterations:         Number.isFinite(Number(ap.iterations)) ? Number(ap.iterations) : 0,
      topics_researched:  Number.isFinite(Number(ap.topics_researched)) ? Number(ap.topics_researched) : 0,
      notes_injected:     Number.isFinite(Number(ap.notes_injected)) ? Number(ap.notes_injected) : 0,
      last_topic:         ap.last_topic ? String(ap.last_topic) : "",
      last_injected:      Number.isFinite(Number(ap.last_injected)) ? Number(ap.last_injected) : 0,
      last_ts:            Number.isFinite(Number(ap.last_ts)) ? Number(ap.last_ts) : null,
      last_error:         ap.last_error ? String(ap.last_error) : "",
      idle_no_llm:        Boolean(ap.idle_no_llm),
      enabled_env:        Boolean(ap.enabled_env),
    },
    connection: {
      ollama_host: cn.ollama_host ? String(cn.ollama_host) : "",
      source:      cn.source ? String(cn.source) : "",
      model:       cn.model ? String(cn.model) : "",
    },
  };
}

function fmtUptime(startedTs) {
  if (!startedTs) return "—";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - startedTs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtRelTs(ts) {
  if (!ts) return "—";
  const secs = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── voice intent (exported for JarvisBrain) ─────────────────────────────────

const VOICE_RE =
  /\b(raut|research\s*autopilot|autopilot\s*status|research\s*status|gpu\s*autopilot|research\s*loop)\b/i;

export function isRautQuery(text) { return VOICE_RE.test(text || ""); }

export async function buildRautScript() {
  let data;
  try { data = await fetchResearchStatus(); }
  catch { return "Research autopilot status is currently unavailable, sir."; }
  const ap = data.autopilot;
  if (!ap.enabled_env && !ap.running) {
    return "Research autopilot is disabled; set LLM_AUTOPILOT_ENABLE to activate the loop.";
  }
  const state = ap.running
    ? "running"
    : ap.idle_no_llm
      ? "idle, waiting for an LLM backend"
      : "stopped";
  const backendClause = data.backend
    ? ` Backend ${data.backend}.`
    : " No LLM backend reachable.";
  const workClause = ap.iterations
    ? ` ${ap.iterations} iterations, ${ap.topics_researched} topics researched, ${ap.notes_injected} notes injected.`
    : " No iterations yet.";
  const lastClause = ap.last_topic
    ? ` Last topic: ${ap.last_topic}.`
    : "";
  const errClause = ap.last_error
    ? ` Last error: ${ap.last_error}.`
    : "";
  return `Research autopilot ${state}.${backendClause}${workClause}${lastClause}${errClause}`;
}

// ── panel ───────────────────────────────────────────────────────────────────

export default function ResearchAutopilotMonitor() {
  const [open,      setOpen]      = useState(false);
  const [snap,      setSnap]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [tick,      setTick]      = useState(0);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchResearchStatus();
      setSnap(d);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Re-render every second so uptime + relative timestamps stay live.
  useEffect(() => {
    if (!open) return undefined;
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:raut-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:raut-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const ap  = snap?.autopilot;
  const cn  = snap?.connection;
  const runState = useMemo(() => {
    if (!ap) return { label: "OFFLINE", color: DIM };
    if (ap.running)     return { label: "RUNNING", color: GRN };
    if (ap.idle_no_llm) return { label: "IDLE",    color: AMB };
    if (ap.enabled_env) return { label: "STOPPED", color: RED };
    return { label: "DISABLED", color: DIM };
  }, [ap]);

  // Referenced so React re-runs uptime formatters when `tick` changes.
  void tick;

  const accent = runState.color === GRN ? CY : runState.color;

  const runAssess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildRautScript();
      let brief = script;
      try {
        const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            message:
              "In 2 short sentences, assess the LLM research autopilot state and any operational risk to Jarvis brain growth. " +
              `Data: ${script}`,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const t = d?.reply || d?.message || d?.text || d?.output || "";
          if (t && String(t).trim()) brief = String(t).trim();
        }
      } catch { /* fall back to script */ }
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: brief, source: "raut" },
      }));
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Research Autopilot Monitor"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: open ? accent + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? accent : accent + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : accent,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: MONO, fontWeight: 700,
          boxShadow: `0 0 20px ${accent}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        RAUT
        {ap && (
          <span style={{
            background: runState.color + "33",
            color: runState.color,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 26, textAlign: "center",
            animation: ap.running ? "rautPulse 1.6s ease-in-out infinite" : "none",
          }}>
            {ap.running ? "ON" : "OFF"}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(680px,82vh)",
          background: BG,
          border: `1px solid ${accent}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${accent}18`,
          fontFamily: MONO,
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${accent}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: runState.color, boxShadow: `0 0 10px ${runState.color}`,
              display: "inline-block",
              animation: (loading || ap?.running) ? "rautPulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: accent, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              RESEARCH AUTOPILOT
            </span>
            <span style={{
              marginLeft: 4,
              color: runState.color, fontSize: 9, letterSpacing: 1, fontWeight: 700,
              background: runState.color + "22",
              borderRadius: 5, padding: "2px 6px",
            }}>
              {runState.label}
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "PROBING" : "30s POLL"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {error && (
            <div style={{
              padding: "20px 18px", color: RED, fontSize: 10,
              letterSpacing: 1, textAlign: "center",
            }}>
              {error.toUpperCase()}
            </div>
          )}

          {!error && !snap && (
            <div style={{
              padding: "28px 18px", color: DIM,
              fontSize: 11, textAlign: "center", letterSpacing: 1,
            }}>
              PROBING AUTOPILOT…
            </div>
          )}

          {!error && snap && (
            <>
              {/* Stat tiles */}
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
                gap: 6, padding: "10px 14px 4px",
              }}>
                {[
                  { label: "ITER",     value: ap.iterations.toLocaleString(),         color: CY  },
                  { label: "TOPICS",   value: ap.topics_researched.toLocaleString(),  color: GRN },
                  { label: "NOTES",    value: ap.notes_injected.toLocaleString(),     color: AMB },
                  { label: "UPTIME",   value: fmtUptime(ap.started_ts),               color: CY  },
                ].map((t) => (
                  <div key={t.label} style={{
                    background: `${t.color}0f`,
                    border: `1px solid ${t.color}33`,
                    borderRadius: 8, padding: "6px 8px",
                    display: "flex", flexDirection: "column", gap: 2,
                  }}>
                    <span style={{ color: t.color, fontSize: 9, letterSpacing: 1 }}>{t.label}</span>
                    <span style={{ color: "#DCF0FF", fontSize: 15, fontWeight: 700 }}>
                      {t.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Search-style refresh + assess row */}
              <div style={{
                padding: "8px 14px 6px", display: "flex", gap: 8, alignItems: "center",
                borderBottom: `1px solid ${accent}18`,
              }}>
                <span style={{
                  flex: 1, color: MUTED, fontSize: 10, letterSpacing: 1,
                  overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                }}>
                  {ap.enabled_env
                    ? `LLM_AUTOPILOT_ENABLE=1 · CONCURRENCY ${ap.concurrency} · INTERVAL ${ap.interval_s}s`
                    : "LLM_AUTOPILOT_ENABLE=0 · LOOP DISABLED VIA ENV"}
                </span>
                <button onClick={load} style={{
                  background: "transparent", border: `1px solid ${accent}33`,
                  borderRadius: 6, color: MUTED, padding: "5px 8px",
                  fontSize: 9, cursor: "pointer", letterSpacing: 1, fontFamily: MONO,
                }} title="Refresh">↺</button>
                <button
                  onClick={runAssess}
                  disabled={assessing}
                  style={{
                    background: assessing ? `${accent}33` : "transparent",
                    border: `1px solid ${accent}66`,
                    borderRadius: 6, color: accent, padding: "5px 10px",
                    fontSize: 9, cursor: assessing ? "not-allowed" : "pointer",
                    letterSpacing: 1, fontFamily: MONO,
                  }}
                  title="Ask JARVIS to assess research autopilot state"
                >
                  {assessing ? "…" : "▶ ASSESS"}
                </button>
              </div>

              {/* Detail rows */}
              <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px 14px" }}>
                <DetailRow
                  label="BACKEND"
                  value={snap.backend ? snap.backend.toUpperCase() : "NONE"}
                  color={snap.backend ? GRN : RED}
                  accent={accent}
                />
                <DetailRow
                  label="AVAILABLE"
                  value={snap.available ? "YES" : "NO"}
                  color={snap.available ? GRN : RED}
                  accent={accent}
                />
                <DetailRow
                  label="AUTOPILOT BACKEND"
                  value={ap.backend ? ap.backend.toUpperCase() : "—"}
                  color={ap.backend ? GRN : DIM}
                  accent={accent}
                />
                <DetailRow
                  label="IDLE NO LLM"
                  value={ap.idle_no_llm ? "YES" : "NO"}
                  color={ap.idle_no_llm ? AMB : GRN}
                  accent={accent}
                />
                <DetailRow
                  label="LAST INJECTED"
                  value={ap.last_injected.toString()}
                  color={ap.last_injected > 0 ? GRN : MUTED}
                  accent={accent}
                />
                <DetailRow
                  label="LAST ITERATION"
                  value={fmtRelTs(ap.last_ts)}
                  color={ap.last_ts ? CY : MUTED}
                  accent={accent}
                />
                <DetailRow
                  label="LAST TOPIC"
                  value={ap.last_topic || "—"}
                  color="#DCF0FF"
                  accent={accent}
                  full
                />
                <DetailRow
                  label="OLLAMA HOST"
                  value={cn.ollama_host || "—"}
                  color="#DCF0FF"
                  accent={accent}
                  full
                />
                <DetailRow
                  label="CONFIG SOURCE"
                  value={cn.source ? cn.source.toUpperCase() : "—"}
                  color={CY}
                  accent={accent}
                />
                <DetailRow
                  label="MODEL"
                  value={cn.model || "—"}
                  color="#DCF0FF"
                  accent={accent}
                  full
                />
                {ap.last_error && (
                  <DetailRow
                    label="LAST ERROR"
                    value={ap.last_error}
                    color={RED}
                    accent={accent}
                    full
                  />
                )}
                {snap.hint && (
                  <div style={{
                    marginTop: 8, padding: "8px 10px",
                    background: `${AMB}0f`,
                    border: `1px dashed ${AMB}44`,
                    borderRadius: 6,
                    color: AMB + "cc", fontSize: 9, letterSpacing: 0.5,
                    lineHeight: 1.5,
                  }}>
                    HINT · {snap.hint}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div style={{
                padding: "7px 14px", borderTop: `1px solid ${accent}18`,
                display: "flex", alignItems: "center", gap: 10,
                fontSize: 9, color: DIM,
              }}>
                <span>
                  {ap.running ? `LOOP UP ${fmtUptime(ap.started_ts)}` : "LOOP DOWN"}
                </span>
                <span style={{ marginLeft: "auto", color: accent + "88" }}>
                  /v1/jarvis/research/status
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes rautPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.35); opacity: 0.55; }
        }
      `}</style>
    </>
  );
}

function DetailRow({ label, value, color, accent, full }) {
  return (
    <div style={{
      padding: "6px 0",
      borderBottom: `1px solid ${accent}0F`,
      display: "flex", alignItems: "center", gap: 10,
      minHeight: 26,
    }}>
      <span style={{
        color: MUTED, fontSize: 9, letterSpacing: 1,
        width: 130, flexShrink: 0, fontWeight: 700,
      }}>
        {label}
      </span>
      <span style={{
        color, fontSize: 10.5, fontWeight: 600,
        flex: 1, textAlign: "right",
        wordBreak: full ? "break-all" : "normal",
        whiteSpace: full ? "normal" : "nowrap",
        overflow: full ? "visible" : "hidden",
        textOverflow: full ? "clip" : "ellipsis",
      }} title={String(value)}>
        {value}
      </span>
    </div>
  );
}
