/**
 * LiveBrainPulse — F31 overnight 2026-09-11
 *
 * Persistent ambient indicator showing live neural activity level.
 * Polls /v1/cinematic/brain every 30 s. Derives a "pulse rate" from the
 * delta in nodes + synapses vs the previous reading — slow pulse when idle,
 * fast pulse during brain growth. Clicking sends a 2-sentence brain-health
 * brief from /v1/jarvis/agent/chat and speaks it via jarvis:speak-dossier.
 *
 * Voice triggers: "brain pulse" / "neural activity" / "live brain"
 * Event: jarvis:brain-pulse-toggle
 * Always-on mount: App.jsx
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 30_000;
const BRAIN_PULSE_RE = /brain\s*pulse|neural\s*activ|live\s*brain/i;

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error("brain fetch failed");
  return r.json();
}

function extractCounts(raw) {
  if (!raw) return { nodes: 0, synapses: 0 };
  const nodes =
    raw.nodes ?? raw.node_count ?? raw.total_nodes ?? raw.graph?.nodes ?? 0;
  const synapses =
    raw.synapses ?? raw.synapse_count ?? raw.edge_count ?? raw.total_edges ?? raw.graph?.edges ?? 0;
  return { nodes: Number(nodes) || 0, synapses: Number(synapses) || 0 };
}

export function isBrainPulseQuery(q) {
  return BRAIN_PULSE_RE.test(q);
}

export default function LiveBrainPulse() {
  const [current, setCurrent] = useState(null);
  const prevRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const raw = await fetchBrain();
      const counts = extractCounts(raw);
      setCurrent((prev) => {
        prevRef.current = prev;
        return counts;
      });
    } catch {
      // silent — backend may be unreachable
    }
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  // jarvis:brain-pulse-toggle event
  useEffect(() => {
    const h = () => setVisible((v) => !v);
    window.addEventListener("jarvis:brain-pulse-toggle", h);
    return () => window.removeEventListener("jarvis:brain-pulse-toggle", h);
  }, []);

  // voice trigger via jarvis:ask
  useEffect(() => {
    const h = (e) => {
      const q = e.detail?.query || "";
      if (BRAIN_PULSE_RE.test(q)) {
        setVisible((v) => !v);
      }
    };
    window.addEventListener("jarvis:ask", h);
    return () => window.removeEventListener("jarvis:ask", h);
  }, []);

  const assess = useCallback(async () => {
    if (busy || !current) return;
    setBusy(true);
    try {
      const prev = prevRef.current;
      const dn = prev ? current.nodes - prev.nodes : 0;
      const ds = prev ? current.synapses - prev.synapses : 0;
      const msg = `Brain metrics: nodes=${current.nodes}, synapses=${current.synapses}, Δnodes=${dn > 0 ? "+" : ""}${dn}, Δsynapses=${ds > 0 ? "+" : ""}${ds} (last 30 s). Provide a 2-sentence health assessment of the cognitive graph state.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: msg }),
      });
      if (!r.ok) throw new Error();
      const json = await r.json();
      const text = json.response || json.message || "";
      if (text) {
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text } })
        );
      }
    } catch {
      // silent
    }
    setBusy(false);
  }, [busy, current]);

  if (!visible || !current) return null;

  const prev = prevRef.current;
  const delta = prev
    ? Math.abs(current.nodes - prev.nodes) + Math.abs(current.synapses - prev.synapses)
    : 0;
  // activity: 0 (idle) → 1 (rapid growth), caps at delta≥20
  const activity = Math.min(delta / 20, 1);
  const pulseDuration = `${2 - activity * 1.4}s`;
  const pulseColor = activity > 0.5 ? "#00E5A0" : "#29E7FF";
  const orb = 9 + activity * 7; // 9px – 16px

  return (
    <>
      <style>{`
        @keyframes jarvis-brain-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%       { opacity: 0.35; transform: scale(0.65); }
        }
      `}</style>

      <div
        onClick={assess}
        title={`Brain Pulse — ${current.nodes} nodes / ${current.synapses} synapses${busy ? " — assessing…" : ""}`}
        style={{
          position: "fixed",
          bottom: 54,
          right: 12,
          zIndex: 9400,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(3,8,14,0.82)",
          border: `1px solid ${pulseColor}28`,
          borderRadius: 20,
          padding: "4px 10px 4px 6px",
          backdropFilter: "blur(8px)",
          cursor: busy ? "wait" : "pointer",
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: orb,
            height: orb,
            borderRadius: "50%",
            background: pulseColor,
            boxShadow: `0 0 ${orb + 4}px ${pulseColor}66`,
            animation: `jarvis-brain-pulse ${pulseDuration} ease-in-out infinite`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 9,
            color: pulseColor,
            letterSpacing: 1.4,
            lineHeight: 1,
          }}
        >
          {current.nodes}N
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            fontSize: 9,
            color: "#3a5060",
            letterSpacing: 1,
            lineHeight: 1,
          }}
        >
          {current.synapses}S
        </span>
        {busy && (
          <span
            style={{
              color: "#29E7FF",
              fontSize: 9,
              fontFamily: "monospace",
              opacity: 0.7,
            }}
          >
            …
          </span>
        )}
      </div>
    </>
  );
}
