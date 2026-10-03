import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 10 * 60 * 1000; // 10 minutes

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const BRIEF_RE = /\b(exec(utive)?\s*(brief(ing)?|summary)|brief\s*me|sitrep|situation\s*(report|brief)|exec\s*brief)\b/i;
export function isExecBriefQuery(q) { return BRIEF_RE.test(q); }

export async function buildExecBriefScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [statusRes, riskRes, brainRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/v1/cinematic/brain`).then(r => r.json()),
  ]);

  const status = statusRes.status === "fulfilled" ? statusRes.value : {};
  const risks  = riskRes.status  === "fulfilled" ? (riskRes.value?.items  || riskRes.value  || []) : [];
  const brain  = brainRes.status === "fulfilled" ? brainRes.value : {};

  const critical = Array.isArray(risks) ? risks.filter(r => (r.severity||"").toLowerCase() === "critical").length : 0;
  const nodes    = brain?.node_count ?? brain?.nodes ?? "?";
  const synapses = brain?.edge_count ?? brain?.synapses ?? "?";
  const cpu      = status?.cpu_percent ?? status?.cpu ?? "?";
  const mem      = status?.memory_percent ?? status?.mem ?? "?";

  const snapshot = `System: CPU ${cpu}%, MEM ${mem}%. Graph: ${nodes} nodes, ${synapses} edges. ` +
    `Risks: ${Array.isArray(risks) ? risks.length : "?"} active (${critical} critical).`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST", headers,
    body: JSON.stringify({ message: `Executive briefing. Provide exactly 3 sentences: current system health, highest-priority risk, and recommended next action. Data: ${snapshot}` }),
  });
  const d = await r.json();
  return (d.answer || "All systems nominal, sir. No critical risks detected. Recommend continuing standard operations.").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ExecutiveBriefing() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief]     = useState("");
  const [ts, setTs]           = useState(null);
  const timerRef              = useRef(null);
  const audioRef              = useRef(null);

  const base     = apiBase();
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    try {
      const text = await buildExecBriefScript();
      setBrief(text);
      setTs(new Date());
    } catch {
      setBrief("Unable to generate executive brief at this time.");
    } finally {
      setLoading(false);
    }
  }, []);

  const speak = useCallback(async (text) => {
    if (!text) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const r = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: text.slice(0, 400) }),
      });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* TTS unavailable — silently skip */ }
  }, [base]);

  const openAndBrief = useCallback(async () => {
    setOpen(true);
    await fetchBrief();
  }, [fetchBrief]);

  // Auto-refresh while open
  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchBrief, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchBrief]);

  // Voice trigger
  useEffect(() => {
    const handler = () => { setOpen(v => !v); if (!open) fetchBrief(); };
    window.addEventListener("jarvis:exec-brief-toggle", handler);
    return () => window.removeEventListener("jarvis:exec-brief-toggle", handler);
  }, [open, fetchBrief]);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => open ? setOpen(false) : openAndBrief()}
        title="Executive Intel Briefing"
        style={{
          position: "fixed", left: 55640, bottom: 8, zIndex: 110,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ BRIEF
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 38, left: 55640, zIndex: 110,
          width: 420, maxHeight: "60vh",
          background: "rgba(5,8,13,0.93)", border: `1px solid ${CY}55`,
          borderRadius: 10, overflow: "auto",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 40px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", borderBottom: `1px solid ${CY}33`,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              EXECUTIVE BRIEFING
            </span>
            {ts && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
                {ts.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchBrief} title="Refresh" style={{
              background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
              color: CY, fontSize: 9, padding: "2px 6px", cursor: "pointer",
            }}>↺</button>
            <button onClick={() => brief && speak(brief)} title="Speak" style={{
              background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
              color: CY, fontSize: 9, padding: "2px 6px", cursor: "pointer",
            }}>◍ SPEAK</button>
          </div>

          {/* Body */}
          <div style={{ padding: "14px 16px", color: "#DCEBF5", fontSize: 13, lineHeight: 1.7 }}>
            {loading ? (
              <div style={{ color: "#6E8AA0", textAlign: "center", padding: 20 }}>
                <div style={{ color: CY, fontSize: 11, marginBottom: 6 }}>◉ consulting intelligence core…</div>
              </div>
            ) : brief ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{brief}</p>
            ) : (
              <div style={{ color: "#6E8AA0", textAlign: "center" }}>No briefing yet.</div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}22`,
            fontSize: 9, color: "#6E8AA0", display: "flex", justifyContent: "space-between",
          }}>
            <span>AUTO-REFRESH 10m · /v1/jarvis/system/status · /entities/RiskSignal · /v1/cinematic/brain</span>
          </div>
        </div>
      )}
    </>
  );
}
