/**
 * SceneAutoTour — F30
 * Cycles all 10 cinematic scenes hands-free with real spoken narration.
 * Each scene is fetched from /v1/cinematic/scene/{id} and narrated via /v1/voice/tts.
 * Controls: ▶ START TOUR / ⏸ PAUSE / ■ STOP; ⟳ TOUR toggle at left:1844 bottom strip.
 * Voice intent: "JARVIS, start tour" / "give me a tour" → isTourQuery + buildTourScript.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchScene } from "@/api/cinematicDataAdapters";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY = "#29E7FF";
const GRN = "#00E5A0";

const SCENE_IDS = [
  "01_command_atrium",
  "02_ai_core_chamber",
  "03_world_control_room",
  "04_intelligence_graph_space",
  "05_operations_war_room",
  "06_data_fusion_reactor",
  "07_document_intelligence_vault",
  "08_simulation_theatre",
  "09_analytics_observatory",
  "10_system_security_core",
];

const SCENE_NAMES = {
  "01_command_atrium": "Command Atrium",
  "02_ai_core_chamber": "AI Core Chamber",
  "03_world_control_room": "World Control Room",
  "04_intelligence_graph_space": "Intelligence Graph Space",
  "05_operations_war_room": "Operations War Room",
  "06_data_fusion_reactor": "Data Fusion Reactor",
  "07_document_intelligence_vault": "Document Intelligence Vault",
  "08_simulation_theatre": "Simulation Theatre",
  "09_analytics_observatory": "Analytics Observatory",
  "10_system_security_core": "System Security Core",
};

const TOUR_RE = /\b(tour|auto.?tour|scene.?tour|take.+tour|give.+tour|walk.?through|walkthrough)\b/i;

export function isTourQuery(text) {
  return TOUR_RE.test(text || "");
}

export function buildTourScript() {
  return "Initiating scene auto-tour, sir. I will narrate each of the ten JARVIS command centres in sequence.";
}

function buildNarration(sceneId, data) {
  const name = SCENE_NAMES[sceneId] || sceneId.replace(/_/g, " ");
  if (!data) return `Now entering the ${name}.`;

  const parts = [`Now entering the ${name}.`];

  const anchors = data.anchors ? Object.keys(data.anchors).filter((k) => !k.startsWith("_")) : [];
  if (anchors.length > 0) {
    const named = anchors
      .slice(0, 4)
      .map((k) => k.split(".").slice(1).join(" ").replace(/_/g, " "))
      .filter(Boolean)
      .join(", ");
    if (named) parts.push(`Active data anchors include: ${named}.`);
  }

  const health = data.health;
  if (health && typeof health.filled === "number" && typeof health.total === "number") {
    parts.push(`${health.filled} of ${health.total} data slots are bound.`);
  }

  return parts.join(" ");
}

export default function SceneAutoTour() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);

  const audioRef = useRef(null);
  const runRef = useRef(false);
  const pausedRef = useRef(false);
  const audioEndResolveRef = useRef(null);

  function stopAudio() {
    try { audioRef.current?.pause(); } catch (_) {}
    audioRef.current = null;
    if (audioEndResolveRef.current) {
      audioEndResolveRef.current();
      audioEndResolveRef.current = null;
    }
  }

  async function speak(text) {
    return new Promise((resolve) => {
      fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: getActiveVoice() }),
      })
        .then(async (r) => {
          if (!r.ok) { resolve(); return; }
          const url = URL.createObjectURL(await r.blob());
          stopAudio();
          const a = new Audio(url);
          audioRef.current = a;
          audioEndResolveRef.current = resolve;
          a.onended = () => { URL.revokeObjectURL(url); audioEndResolveRef.current = null; resolve(); };
          a.play().catch(() => { URL.revokeObjectURL(url); resolve(); });
        })
        .catch(() => resolve());
    });
  }

  async function waitIfPaused() {
    while (pausedRef.current && runRef.current) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  async function runTour() {
    setRunning(true); runRef.current = true;
    setPaused(false); pausedRef.current = false;

    await speak("Initiating JARVIS scene auto-tour. Cycling through all ten command centres.");

    for (let i = 0; i < SCENE_IDS.length; i++) {
      if (!runRef.current) break;
      await waitIfPaused();
      if (!runRef.current) break;

      const id = SCENE_IDS[i];
      setCurrentIdx(i);
      navigate(`/cinematic/${id}`);

      await new Promise((r) => setTimeout(r, 900));
      if (!runRef.current) break;
      await waitIfPaused();
      if (!runRef.current) break;

      let data = null;
      try { data = await fetchScene(id); } catch (_) {}
      if (!runRef.current) break;

      const narration = buildNarration(id, data);
      await speak(narration);

      if (!runRef.current) break;
      await new Promise((r) => setTimeout(r, 800));
    }

    if (runRef.current) {
      await speak("Tour complete, sir. All ten command centres reviewed. Returning to Command Atrium.");
      navigate("/cinematic/01_command_atrium");
    }

    runRef.current = false;
    setRunning(false);
    setPaused(false);
    setCurrentIdx(-1);
  }

  function handleStart() {
    if (running) return;
    setOpen(true);
    runTour();
  }

  function handlePause() {
    if (!running) return;
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    if (next) {
      try { audioRef.current?.pause(); } catch (_) {}
    } else {
      try { audioRef.current?.play().catch(() => {}); } catch (_) {}
    }
  }

  function handleStop() {
    runRef.current = false;
    stopAudio();
    setRunning(false);
    setPaused(false);
    setCurrentIdx(-1);
  }

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (!TOUR_RE.test(q)) return;
      setOpen(true);
      if (!runRef.current) runTour();
    };
    const onTour = () => { setOpen(true); if (!runRef.current) runTour(); };
    window.addEventListener("jarvis:ask", onAsk);
    window.addEventListener("jarvis:tour-start", onTour);
    return () => {
      window.removeEventListener("jarvis:ask", onAsk);
      window.removeEventListener("jarvis:tour-start", onTour);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { runRef.current = false; stopAudio(); }, []);

  const pct = currentIdx >= 0 ? ((currentIdx + 1) / SCENE_IDS.length) * 100 : 0;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scene Auto-Tour — cycle all 10 scenes with spoken narration"
        style={{
          position: "fixed", left: 1844, bottom: 18, zIndex: 68,
          background: running ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${running ? CY : CY + "44"}`,
          borderRadius: 8,
          color: running ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${running ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: running && !paused ? "jtourpulse 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>{running ? (paused ? "⏸" : "▶") : "⟳"}</span>
        <span>TOUR</span>
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 1844, bottom: 54, zIndex: 68,
          width: 290,
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 50px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>

          <div style={{
            padding: "9px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: running ? GRN : CY,
              boxShadow: `0 0 10px ${running ? GRN : CY}`,
              display: "inline-block",
              animation: running && !paused ? "jtourpulse 1.5s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>
              SCENE AUTO-TOUR
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, marginLeft: "auto",
            }}>×</button>
          </div>

          {running && (
            <div style={{ padding: "8px 14px 4px", borderBottom: `1px solid ${CY}11` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#4A6070", marginBottom: 4, letterSpacing: 1 }}>
                <span>SCENE {currentIdx + 1} / {SCENE_IDS.length}</span>
                <span style={{ color: paused ? CY + "88" : GRN }}>{paused ? "PAUSED" : "NARRATING"}</span>
              </div>
              <div style={{ background: "#0D1A22", borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: `${pct}%`,
                  background: paused ? CY + "66" : GRN,
                  transition: "width 0.5s",
                }} />
              </div>
              {currentIdx >= 0 && (
                <div style={{ fontSize: 9, color: CY + "AA", marginTop: 4, letterSpacing: 1 }}>
                  {SCENE_NAMES[SCENE_IDS[currentIdx]]}
                </div>
              )}
            </div>
          )}

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {SCENE_IDS.map((id, i) => {
              const done = running && i < currentIdx;
              const active = running && i === currentIdx;
              return (
                <div key={id} style={{
                  padding: "7px 14px",
                  borderBottom: `1px solid ${CY}08`,
                  display: "flex", alignItems: "center", gap: 8,
                  background: active ? CY + "10" : "transparent",
                  borderLeft: `3px solid ${active ? GRN : done ? CY + "44" : "transparent"}`,
                }}>
                  <span style={{ fontSize: 10, color: active ? GRN : done ? CY + "55" : "#3A5060", width: 14, flexShrink: 0 }}>
                    {active ? "▶" : done ? "✓" : String(i + 1)}
                  </span>
                  <span style={{
                    fontSize: 10, letterSpacing: 1,
                    color: active ? CY : done ? "#4A6070" : "#5A7888",
                    fontWeight: active ? 700 : 400,
                  }}>
                    {SCENE_NAMES[id]}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{
            padding: "10px 14px",
            borderTop: `1px solid ${CY}18`,
            display: "flex", gap: 8,
          }}>
            {!running ? (
              <button onClick={handleStart} style={{
                flex: 1, background: GRN + "22", border: `1px solid ${GRN}55`,
                borderRadius: 6, color: GRN, cursor: "pointer", padding: "7px 0",
                fontSize: 10, letterSpacing: 2, fontFamily: "inherit", fontWeight: 700,
              }}>▶ START TOUR</button>
            ) : (
              <>
                <button onClick={handlePause} style={{
                  flex: 1, background: CY + "11", border: `1px solid ${CY}44`,
                  borderRadius: 6, color: CY, cursor: "pointer", padding: "7px 0",
                  fontSize: 10, letterSpacing: 2, fontFamily: "inherit",
                }}>{paused ? "▶ RESUME" : "⏸ PAUSE"}</button>
                <button onClick={handleStop} style={{
                  flex: 1, background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.3)",
                  borderRadius: 6, color: "#FF6060", cursor: "pointer", padding: "7px 0",
                  fontSize: 10, letterSpacing: 2, fontFamily: "inherit",
                }}>■ STOP</button>
              </>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes jtourpulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(1.12)}}`}</style>
    </>
  );
}
