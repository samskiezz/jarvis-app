/**
 * F312 — Motor Intent Predictor Panel
 *
 * Polls GET /v1/motor/stats every 60 s (badge: green=gate_ready, amber=advisory, dim=cold).
 * STATS tab: n_events / n_distinct_actions / gate_ready / window / min_samples / target_acc.
 * PREDICT tab: GET /v1/motor/predict?top_k=5 → ranked candidate list with confidence bars +
 *   source chip (model / advisory / frequency); gate_ready chip; context list.
 * TRAIN tab: POST /v1/motor/train → accuracy / n_samples / n_classes / gating / saved result.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence predictor health brief + TTS via jarvis:speak-dossier.
 * ⊕ MINT button left:438480 bottom:8 zIndex:189; jarvis:mint-toggle event.
 */

import { useState, useEffect, useRef, useCallback } from "react";

const API_KEY = import.meta.env.VITE_API_KEY || "dev-key";
const BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

function apiBase() { return BASE; }
function hdr() { return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` }; }

const PANEL_W = 520;
const PANEL_H = 580;

const SRC_COLORS = {
  model: "#22d3ee",
  advisory: "#f59e0b",
  frequency: "#8b5cf6",
};

// ─── exported voice helpers ────────────────────────────────────────────────

export function isMintQuery(q) {
  return /motor intent|intent predict|dock predict|next app|predict dock|mint panel|motor predict|action predictor|motor model|dock suggest|next panel|predict panel|dock intent/i.test(q);
}

export async function buildMintScript() {
  try {
    const s = await fetch(`${apiBase()}/v1/motor/stats`, { headers: hdr() }).then(r => r.json());
    return `Motor intent predictor: ${s.n_events || 0} events logged, ${s.n_distinct_actions || 0} distinct actions, model gate ${s.gate_ready ? "validated" : "advisory"}. ${s.gate_ready ? "Predictions are model-backed." : "Running in advisory mode — needs " + (s.min_samples || 40) + " events to gate."}`;
  } catch {
    return "Motor intent predictor stats unavailable.";
  }
}

// ─── sub-components ────────────────────────────────────────────────────────

function StatTile({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 10px", minWidth: 80 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent || "#e2e8f0" }}>{value}</div>
      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ConfBar({ pct, color }) {
  return (
    <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", background: color || "#22d3ee", borderRadius: 3 }} />
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────

export default function MotorIntentPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("STATS");
  const [stats, setStats] = useState(null);
  const [predict, setPredict] = useState(null);
  const [trainResult, setTrainResult] = useState(null);
  const [training, setTraining] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const fetchStats = useCallback(async () => {
    try {
      const s = await fetch(`${apiBase()}/v1/motor/stats`, { headers: hdr() }).then(r => r.json());
      setStats(s);
    } catch { /* silent */ }
  }, []);

  const fetchPredict = useCallback(async () => {
    setPredicting(true);
    try {
      const d = await fetch(`${apiBase()}/v1/motor/predict?top_k=5`, { headers: hdr() }).then(r => r.json());
      setPredict(d);
    } catch { /* silent */ }
    setPredicting(false);
  }, []);

  // Poll stats every 60 s
  useEffect(() => {
    fetchStats();
    timerRef.current = setInterval(fetchStats, 60_000);
    return () => clearInterval(timerRef.current);
  }, [fetchStats]);

  // Fetch predict when tab switches
  useEffect(() => {
    if (open && tab === "PREDICT") fetchPredict();
  }, [open, tab, fetchPredict]);

  // Toggle via custom event
  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:mint-toggle", h);
    return () => window.removeEventListener("jarvis:mint-toggle", h);
  }, []);

  const handleTrain = async () => {
    setTraining(true);
    setTrainResult(null);
    try {
      const d = await fetch(`${apiBase()}/v1/motor/train`, { method: "POST", headers: hdr() }).then(r => r.json());
      setTrainResult(d);
      fetchStats();
    } catch (e) {
      setTrainResult({ error: String(e) });
    }
    setTraining(false);
  };

  const handleAssess = async () => {
    setAssessing(true); setAssessText("");
    try {
      const prompt = `Summarise motor intent predictor status: events=${stats?.n_events || 0}, actions=${stats?.n_distinct_actions || 0}, gate=${stats?.gate_ready ? "ready" : "advisory"}. Give 2 sentences on predictor health and what's needed to reach validated mode.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr(), body: JSON.stringify({ message: prompt }),
      }).then(x => x.json());
      const txt = (r.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: txt }));
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  };

  // Badge colour
  const gateReady = stats?.gate_ready;
  const hasEvents = (stats?.n_events || 0) > 0;
  const badgeColor = gateReady ? "#22c55e" : hasEvents ? "#f59e0b" : "#475569";
  const badgeLabel = gateReady ? "GATE" : hasEvents ? stats?.n_events : "COLD";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Motor Intent Predictor"
        style={{
          position: "fixed", left: 438480, bottom: 8, zIndex: 189,
          background: "rgba(15,23,42,0.85)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 6, color: "#e2e8f0", fontFamily: "monospace", fontSize: 11,
          padding: "4px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
        }}
      >
        <span style={{ color: "#22d3ee" }}>⊕</span> MINT
        <span style={{
          background: badgeColor, color: "#0f172a", borderRadius: 4,
          padding: "0 5px", fontSize: 10, fontWeight: 700, minWidth: 20, textAlign: "center",
        }}>{badgeLabel}</span>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: "50%", transform: "translateX(-50%)",
      width: PANEL_W, maxHeight: PANEL_H, zIndex: 9200,
      background: "rgba(10,14,26,0.97)", border: "1px solid rgba(34,211,238,0.25)",
      borderRadius: 12, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>⊕ MOTOR INTENT PREDICTOR</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: gateReady ? "#22c55e" : "#f59e0b", background: "rgba(255,255,255,0.06)", padding: "2px 7px", borderRadius: 4 }}>
            {gateReady ? "MODEL VALIDATED" : "ADVISORY MODE"}
          </span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px" }}>
        <StatTile label="EVENTS" value={stats?.n_events ?? "—"} accent="#22d3ee" />
        <StatTile label="ACTIONS" value={stats?.n_distinct_actions ?? "—"} accent="#8b5cf6" />
        <StatTile label="WINDOW" value={stats?.window ?? "—"} accent="#94a3b8" />
        <StatTile label="MIN SAMPLES" value={stats?.min_samples ?? "—"} accent="#f59e0b" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", padding: "0 14px" }}>
        {["STATS", "PREDICT", "TRAIN"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none", color: tab === t ? "#22d3ee" : "#64748b",
            fontSize: 11, fontFamily: "monospace", cursor: "pointer", padding: "8px 12px",
            borderBottom: tab === t ? "2px solid #22d3ee" : "2px solid transparent",
            fontWeight: tab === t ? 700 : 400,
          }}>{t}</button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>

        {tab === "STATS" && stats && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["Events logged", stats.n_events, "#22d3ee"],
              ["Distinct actions", stats.n_distinct_actions, "#8b5cf6"],
              ["Context window", stats.window, "#94a3b8"],
              ["Min samples needed", stats.min_samples, "#f59e0b"],
              ["Target accuracy", stats.target_acc, "#22c55e"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: "#94a3b8" }}>{label}</span>
                <span style={{ color, fontWeight: 700 }}>{val ?? "—"}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
              <span style={{ color: "#94a3b8" }}>Model on disk</span>
              <span style={{ color: stats.model_present ? "#22c55e" : "#f43f5e", fontWeight: 700 }}>{stats.model_present ? "YES" : "NO"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
              <span style={{ color: "#94a3b8" }}>Gate ready</span>
              <span style={{ color: stats.gate_ready ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>{stats.gate_ready ? "YES" : "NO"}</span>
            </div>
            {stats.last_event_ts ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, padding: "4px 0" }}>
                <span style={{ color: "#94a3b8" }}>Last event</span>
                <span style={{ color: "#e2e8f0" }}>{new Date(stats.last_event_ts * 1000).toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        )}

        {tab === "PREDICT" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: "#64748b" }}>Top-5 next dock-app predictions</span>
              <button onClick={fetchPredict} disabled={predicting} style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", borderRadius: 5, fontSize: 10, padding: "3px 8px", cursor: "pointer" }}>
                {predicting ? "LOADING…" : "↺ REFRESH"}
              </button>
            </div>
            {predict?.candidates?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {predict.candidates.map((c, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600 }}>{c.action_id}</span>
                      <span style={{ fontSize: 10, background: SRC_COLORS[c.source] || "#64748b", color: "#0f172a", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>{c.source}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>{Math.round(c.confidence * 100)}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ConfBar pct={c.confidence} color={SRC_COLORS[c.source] || "#22d3ee"} />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                  Gate: <span style={{ color: predict.gate_ready ? "#22c55e" : "#f59e0b" }}>{predict.gate_ready ? "VALIDATED" : "ADVISORY"}</span>
                  {predict.advisory && <span style={{ marginLeft: 8, color: "#475569" }}>• advisory mode</span>}
                  {predict.fallback && <span style={{ marginLeft: 8, color: "#475569" }}>• {predict.fallback} fallback</span>}
                </div>
              </div>
            ) : (
              <div style={{ color: "#475569", fontSize: 12 }}>
                {predicting ? "Loading predictions…" : "No candidates yet — log some dock-app actions first."}
              </div>
            )}
          </div>
        )}

        {tab === "TRAIN" && (
          <div>
            <button onClick={handleTrain} disabled={training} style={{
              width: "100%", background: training ? "rgba(34,211,238,0.05)" : "rgba(34,211,238,0.12)",
              border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee", borderRadius: 6,
              fontSize: 12, padding: "8px", cursor: "pointer", marginBottom: 12,
            }}>
              {training ? "TRAINING…" : "▶ FORCE RETRAIN"}
            </button>
            {trainResult && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["Status", trainResult.status, trainResult.status === "ok" ? "#22c55e" : "#f59e0b"],
                  ["N Samples", trainResult.n_samples, "#22d3ee"],
                  ["N Classes", trainResult.n_classes, "#8b5cf6"],
                  ["Accuracy (mean)", trainResult.accuracy_mean != null ? trainResult.accuracy_mean.toFixed(4) : "—", "#22c55e"],
                  ["Accuracy (std)", trainResult.accuracy_std != null ? trainResult.accuracy_std.toFixed(4) : "—", "#94a3b8"],
                  ["Lower bound", trainResult.accuracy_lower != null ? trainResult.accuracy_lower.toFixed(4) : "—", "#f59e0b"],
                  ["Target acc", trainResult.target_acc, "#94a3b8"],
                  ["Gating", trainResult.gating != null ? (trainResult.gating ? "YES" : "NO") : "—", trainResult.gating ? "#22c55e" : "#f43f5e"],
                  ["Saved", trainResult.saved != null ? (trainResult.saved ? "YES" : "NO") : "—", trainResult.saved ? "#22c55e" : "#64748b"],
                ].map(([label, val, color]) => val !== "—" && val !== undefined ? (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ color: "#94a3b8" }}>{label}</span>
                    <span style={{ color, fontWeight: 700 }}>{String(val)}</span>
                  </div>
                ) : null)}
                {trainResult.note && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{trainResult.note}</div>}
                {trainResult.error && <div style={{ fontSize: 11, color: "#f43f5e", marginTop: 4 }}>{trainResult.error}</div>}
              </div>
            )}
          </div>
        )}

        {/* Assess */}
        {assessText && (
          <div style={{ marginTop: 14, background: "rgba(34,211,238,0.06)", borderRadius: 6, padding: "8px 10px", fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>
            {assessText}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <button onClick={handleAssess} disabled={assessing} style={{
          background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)",
          color: "#22d3ee", borderRadius: 6, fontSize: 11, padding: "5px 12px", cursor: "pointer",
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
