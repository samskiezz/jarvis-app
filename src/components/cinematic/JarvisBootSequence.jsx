/**
 * JarvisBootSequence — F18
 * Fires once per browser session. Fetches real counts from
 * /v1/jarvis/system/status and /v1/cinematic/brain, renders
 * a cinematic boot terminal, then speaks "all systems online"
 * via /v1/voice/tts on user click (required for browser autoplay).
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GOLD = "#FFD700";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function dig(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

export default function JarvisBootSequence() {
  // idle → loading → ready → speaking → fading → done
  const [phase, setPhase] = useState("idle");
  const [stats, setStats] = useState(null);
  const [bootLines, setBootLines] = useState([]);
  const audioRef = useRef(null);
  const lineTimers = useRef([]);

  useEffect(() => {
    if (sessionStorage.getItem("jarvis-booted")) return;
    setPhase("loading");

    const headers = { Authorization: `Bearer ${API_KEY}` };
    Promise.allSettled([
      fetch(`${apiBase()}/v1/jarvis/system/status`, { headers }).then((r) =>
        r.ok ? r.json() : null
      ),
      fetch(`${apiBase()}/v1/cinematic/brain`, { headers }).then((r) =>
        r.ok ? r.json() : null
      ),
    ]).then(([sr, br]) => {
      const sys = sr.status === "fulfilled" ? sr.value : null;
      const brain = br.status === "fulfilled" ? br.value : null;

      const cpu = sys ? dig(sys, "cpu_percent", "cpu", "system.cpu_percent") ?? null : null;
      const mem = sys ? dig(sys, "memory.percent", "memory_percent", "mem_percent", "mem") ?? null : null;
      const nodes = brain ? dig(brain, "nodes", "node_count", "neurons") ?? null : null;
      const synapses = brain ? dig(brain, "synapses", "edge_count", "edges") ?? null : null;

      setStats({ cpu, mem, nodes, synapses });

      const lines = [
        "INITIALIZING JARVIS INTELLIGENCE PROTOCOL ...",
        "LOADING NEURAL GRAPH ...",
        nodes != null
          ? `NODES DETECTED: ${parseInt(nodes).toLocaleString()}`
          : "NODES: CALIBRATING ...",
        synapses != null
          ? `SYNAPSES ACTIVE: ${parseInt(synapses).toLocaleString()}`
          : "SYNAPSES: CALIBRATING ...",
        "CONNECTING TO LIVE INTEL STREAMS ...",
        cpu != null ? `CPU LOAD: ${Math.round(parseFloat(cpu))}%` : "CPU LOAD: NOMINAL",
        mem != null
          ? `MEMORY USAGE: ${Math.round(parseFloat(mem))}%`
          : "MEMORY USAGE: NOMINAL",
        "ALL SYSTEMS NOMINAL.",
        "► CLICK TO INITIALIZE VOICE INTERFACE",
      ];

      lines.forEach((line, i) => {
        const t = setTimeout(() => {
          setBootLines((prev) => [...prev, line]);
          if (i === lines.length - 1) setPhase("ready");
        }, i * 320 + 300);
        lineTimers.current.push(t);
      });
    });

    return () => {
      lineTimers.current.forEach(clearTimeout);
    };
  }, []);

  async function initialize() {
    if (phase !== "ready") return;
    setPhase("speaking");

    const { nodes, synapses, cpu } = stats || {};
    const parts = ["JARVIS online, sir."];
    if (nodes != null && synapses != null) {
      parts.push(
        `Neural graph initialized with ${parseInt(nodes).toLocaleString()} nodes and ${parseInt(synapses).toLocaleString()} active synapses.`
      );
    } else if (nodes != null) {
      parts.push(
        `Neural graph initialized with ${parseInt(nodes).toLocaleString()} nodes.`
      );
    }
    if (cpu != null) {
      parts.push(`Systems running at ${Math.round(parseFloat(cpu))} percent CPU.`);
    }
    parts.push("All systems nominal. How may I assist you today?");
    const script = parts.join(" ");

    try {
      const r = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      });
      if (r.ok) {
        const url = URL.createObjectURL(await r.blob());
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = () => {
          URL.revokeObjectURL(url);
          dismiss();
        };
        a.play().catch(() => dismiss());
      } else {
        dismiss();
      }
    } catch (_) {
      dismiss();
    }
  }

  function dismiss() {
    try { audioRef.current?.pause(); } catch (_) {}
    sessionStorage.setItem("jarvis-booted", "1");
    setPhase("fading");
    setTimeout(() => setPhase("done"), 650);
  }

  if (phase === "idle" || phase === "done") return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2,5,10,0.97)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono',monospace",
        opacity: phase === "fading" ? 0 : 1,
        transition: "opacity 0.65s ease",
        pointerEvents: phase === "fading" ? "none" : "auto",
      }}
    >
      {/* Wordmark */}
      <div style={{ marginBottom: 36, textAlign: "center" }}>
        <div
          style={{
            fontSize: 30,
            fontWeight: 900,
            letterSpacing: 14,
            color: CY,
            textShadow: `0 0 40px ${CY}, 0 0 80px ${CY}55`,
          }}
        >
          J·A·R·V·I·S
        </div>
        <div
          style={{
            fontSize: 10,
            letterSpacing: 7,
            color: "#4A6A80",
            marginTop: 6,
            textTransform: "uppercase",
          }}
        >
          Intelligence Framework
        </div>
      </div>

      {/* Boot terminal */}
      <div
        style={{
          width: "min(580px, 92vw)",
          minHeight: 210,
          background: "rgba(4,10,18,0.92)",
          border: `1px solid ${CY}2A`,
          borderRadius: 6,
          padding: "20px 26px",
          boxShadow: `0 0 80px ${CY}0D`,
        }}
      >
        {bootLines.map((line, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              lineHeight: 1.9,
              letterSpacing: 1.2,
              color: line.startsWith("ALL SYSTEMS")
                ? CY
                : line.startsWith("►")
                ? GOLD
                : "#6A90A8",
              fontWeight:
                line.startsWith("ALL SYSTEMS") || line.startsWith("►") ? 700 : 400,
              textShadow:
                line.startsWith("ALL SYSTEMS") ? `0 0 10px ${CY}88` : "none",
            }}
          >
            {line}
          </div>
        ))}
        {phase === "loading" && (
          <div
            style={{
              fontSize: 13,
              color: CY,
              animation: "jblink 0.9s step-end infinite",
            }}
          >
            ▋
          </div>
        )}
      </div>

      {/* Initialize button — appears after all lines rendered */}
      {phase === "ready" && (
        <button
          onClick={initialize}
          style={{
            marginTop: 30,
            padding: "10px 36px",
            border: `1px solid ${CY}`,
            borderRadius: 4,
            background: "transparent",
            color: CY,
            fontSize: 11,
            letterSpacing: 5,
            cursor: "pointer",
            boxShadow: `0 0 24px ${CY}44`,
            textTransform: "uppercase",
            transition: "box-shadow 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.boxShadow = `0 0 40px ${CY}88`)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.boxShadow = `0 0 24px ${CY}44`)
          }
        >
          INITIALIZE VOICE
        </button>
      )}

      {/* Speaking indicator */}
      {phase === "speaking" && (
        <div
          style={{
            marginTop: 30,
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: CY,
            fontSize: 11,
            letterSpacing: 5,
            textShadow: `0 0 12px ${CY}`,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: CY,
              boxShadow: `0 0 12px ${CY}`,
              animation: "jpulse 1.1s ease-in-out infinite",
              display: "inline-block",
            }}
          />
          SPEAKING
        </div>
      )}

      {/* Skip */}
      <button
        onClick={dismiss}
        style={{
          position: "absolute",
          top: 18,
          right: 22,
          background: "none",
          border: "none",
          color: "#3A5060",
          fontSize: 10,
          letterSpacing: 2,
          cursor: "pointer",
          textTransform: "uppercase",
        }}
      >
        SKIP ✕
      </button>

      <style>{`
        @keyframes jblink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes jpulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.6); opacity: 0.4; } }
      `}</style>
    </div>
  );
}
