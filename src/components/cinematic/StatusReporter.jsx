import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

/**
 * StatusReporter — F05 spoken status report.
 * Listens for the `jarvis:status` custom event. When fired it fetches
 * /v1/jarvis/system/status and /v1/cinematic/brain in parallel, composes a
 * precise spoken text, calls /v1/voice/tts to read it aloud, and shows a
 * brief HUD card with the live numbers.
 * Additive-only: new file, mounted via App.jsx. Real endpoints only.
 */

const CY = "#29E7FF";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_KEY) ||
  "dev-key";

function fmt(n, digits = 1) {
  if (n == null || isNaN(n)) return "?";
  return Number(n).toFixed(digits);
}

function fmtLarge(n) {
  if (n == null || isNaN(n)) return "?";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

async function fetchBrainStats() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`brain ${r.status}`);
  return r.json();
}

function composeSpokenText(sys, brain) {
  const cpu   = fmt(sys?.cpu_percent  ?? sys?.cpu,    0);
  const memGb = fmt((sys?.memory_mb   ?? sys?.memory_used_mb ?? 0) / 1024, 1);
  const load  = fmt(sys?.load_avg     ?? sys?.load_average ?? sys?.load, 2);
  const nodes = fmtLarge(brain?.node_count ?? brain?.nodes ?? brain?.total_nodes);
  const syns  = fmtLarge(brain?.synapse_count ?? brain?.synapses ?? brain?.total_synapses ?? brain?.edge_count);

  return (
    `JARVIS status report. ` +
    `System: CPU at ${cpu} percent, memory ${memGb} gigabytes, load average ${load}. ` +
    `Neural graph: ${nodes} nodes, ${syns} synapses online. All systems nominal, sir.`
  );
}

export default function StatusReporter() {
  const [card, setCard]       = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const audioRef  = useRef(null);
  const hideTimer = useRef(null);

  async function runReport() {
    setCard({ loading: true });
    clearTimeout(hideTimer.current);

    let sys = {}, brain = {};
    try {
      [sys, brain] = await Promise.all([fetchStatus(), fetchBrainStats()]);
    } catch {
      setCard(null);
      return;
    }

    const spoken = composeSpokenText(sys, brain);

    setCard({ sys, brain, spoken, loading: false });

    // Speak via TTS
    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spoken }),
      });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        try { audioRef.current?.pause(); } catch {}
        const a = new Audio(url);
        audioRef.current = a;
        a.onplay  = () => setSpeaking(true);
        a.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); };
        a.play().catch(() => setSpeaking(false));
      }
    } catch {}

    hideTimer.current = setTimeout(() => setCard(null), 14_000);
  }

  useEffect(() => {
    const onStatus = () => { runReport(); };
    window.addEventListener("jarvis:status", onStatus);
    return () => window.removeEventListener("jarvis:status", onStatus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  if (!card) return null;

  const { sys = {}, brain = {}, spoken, loading } = card;
  const cpu   = sys.cpu_percent  ?? sys.cpu;
  const memGb = ((sys.memory_mb ?? sys.memory_used_mb ?? 0) / 1024);
  const load  = sys.load_avg ?? sys.load_average ?? sys.load;
  const nodes = brain.node_count ?? brain.nodes ?? brain.total_nodes;
  const syns  = brain.synapse_count ?? brain.synapses ?? brain.total_synapses ?? brain.edge_count;

  return (
    <div
      onClick={() => { setCard(null); clearTimeout(hideTimer.current); }}
      style={{
        position: "fixed", left: 18, bottom: 84, zIndex: 75,
        width: "min(340px,82vw)",
        background: "rgba(6,10,18,0.92)",
        border: `1px solid ${CY}44`,
        borderRadius: 12,
        padding: "14px 16px",
        backdropFilter: "blur(10px)",
        boxShadow: `0 0 40px ${CY}18`,
        fontFamily: "'JetBrains Mono',monospace",
        color: "#DCEBF5",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%", background: CY,
          boxShadow: `0 0 10px ${CY}`,
          animation: (loading || speaking) ? "srpulse 1s ease-in-out infinite" : "none",
          flexShrink: 0,
        }} />
        <span style={{ color: CY, fontSize: 10, letterSpacing: 3 }}>STATUS REPORT</span>
        {speaking && (
          <span style={{ marginLeft: "auto", fontSize: 9, color: CY, letterSpacing: 1 }}>◍ speaking</span>
        )}
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: "#6E8AA0" }}>fetching live data…</div>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 4 }}>SYSTEM</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <Stat label="CPU" value={cpu != null ? `${fmt(cpu, 0)}%` : "—"} />
              <Stat label="MEM" value={memGb > 0 ? `${fmt(memGb, 1)} GB` : "—"} />
              <Stat label="LOAD" value={load != null ? fmt(load, 2) : "—"} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 4 }}>NEURAL GRAPH</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <Stat label="NODES"    value={nodes != null ? fmtLarge(nodes) : "—"} />
              <Stat label="SYNAPSES" value={syns  != null ? fmtLarge(syns)  : "—"} />
            </div>
          </div>
          {spoken && (
            <div style={{ marginTop: 10, fontSize: 10, color: "#4A6070", lineHeight: 1.4, borderTop: `1px solid ${CY}18`, paddingTop: 8 }}>
              {spoken}
            </div>
          )}
        </>
      )}
      <style>{`
        @keyframes srpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.6); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 14, color: CY, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 8, color: "#4A6070", letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}
