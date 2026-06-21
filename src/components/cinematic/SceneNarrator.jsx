/**
 * SceneNarrator — F56.
 *
 * Reads the current cinematic scene's real anchor data from
 * /v1/cinematic/scene/{sceneId}, feeds it to /v1/jarvis/agent/chat for an
 * AI-composed scene narrative, then speaks the result via /v1/voice/tts.
 *
 * Differs from SceneAnchorDrillDown (raw data) and SceneAutoTour (cycler).
 * This is an on-demand "what does this scene mean?" synthesis for the scene
 * you are currently viewing.
 *
 * Toggle: ◎ NARRATE  at left:5728, bottom:8, zIndex 65.
 * Event:  jarvis:narrate-scene
 * Voice:  "narrate scene" | "describe this scene" | "scene story" |
 *         "scene narrative" | "snarrate" | "what does this scene show"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const PU  = "#a855f7";
const BG  = "rgba(3,5,9,0.97)";
const BTN_LEFT = 5728;
const MONO = "'JetBrains Mono', 'Courier New', monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCENE_LABELS = {
  "01_command_atrium":          "Command Atrium",
  "02_ai_core_chamber":         "AI Core Chamber",
  "03_world_control_room":      "World Control Room",
  "04_intelligence_graph_space":"Intelligence Graph Space",
  "05_operations_war_room":     "Operations War Room",
  "06_data_fusion_reactor":     "Data Fusion Reactor",
  "07_document_intelligence_vault": "Document Intelligence Vault",
  "08_simulation_theatre":      "Simulation Theatre",
  "09_analytics_observatory":   "Analytics Observatory",
  "10_system_security_core":    "System Security Core",
};

const NARRATOR_RE =
  /\b(narrate[\s-]?scene|scene[\s-]?narrat|scene[\s-]?stor|scene[\s-]?narrativ|snarrate|describe[\s-]?this[\s-]?scene|what[\s-]?does[\s-]?this[\s-]?scene)\b/i;

export function isSceneNarratorQuery(t) {
  return NARRATOR_RE.test(t || "");
}

function currentSceneId() {
  const m = window.location.pathname.match(/\/cinematic\/([^/]+)/);
  return m ? m[1] : "01_command_atrium";
}

export async function buildSceneNarratorScript() {
  const sceneId = currentSceneId();
  const label = SCENE_LABELS[sceneId] || sceneId;

  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${sceneId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();

  const anchors = Array.isArray(d?.anchors) ? d.anchors
    : Array.isArray(d?.data?.anchors) ? d.data.anchors
    : [];

  const anchorSummary = anchors.slice(0, 12)
    .map((a) => `${a.label ?? a.name ?? a.id}: ${a.value ?? a.current ?? "—"} ${a.unit ?? ""}`.trim())
    .join("; ");

  const prompt = `You are JARVIS. Provide a concise (3–4 sentence) spoken intelligence narrative for the "${label}" scene. Current readings: ${anchorSummary || "no anchor data available"}. Interpret what these values mean operationally, sir.`;

  const cr = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const cd = await cr.json();
  const narrative = (cd.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
  return narrative || `The ${label} is nominal, sir. All systems reading within expected parameters.`;
}

export default function SceneNarrator() {
  const location = useLocation();
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [narrative, setNarrative] = useState("");
  const [sceneLabel, setSceneLabel] = useState("");
  const cancelRef = useRef(false);

  const narrate = useCallback(async () => {
    const sceneId = currentSceneId();
    setSceneLabel(SCENE_LABELS[sceneId] || sceneId);
    setLoading(true); setNarrative(""); cancelRef.current = false;

    try {
      const text = await buildSceneNarratorScript();
      if (cancelRef.current) return;
      setNarrative(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      if (!cancelRef.current)
        setNarrative("Unable to reach the intelligence core, sir.");
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, []);

  // Open and narrate on jarvis:narrate-scene
  useEffect(() => {
    const h = () => { setOpen(true); narrate(); };
    window.addEventListener("jarvis:narrate-scene", h);
    return () => window.removeEventListener("jarvis:narrate-scene", h);
  }, [narrate]);

  // Re-narrate when scene changes while panel is open
  useEffect(() => {
    if (!open) return;
    narrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function close() {
    cancelRef.current = true;
    setOpen(false); setNarrative(""); setSceneLabel("");
  }

  const isApex = location.pathname.startsWith("/apex");
  if (isApex) return null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { if (open) close(); else { setOpen(true); narrate(); } }}
        title="Scene Narrator — AI narrative of current scene (⌘+narrate)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: open ? "rgba(168,85,247,0.18)" : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? PU : "rgba(168,85,247,0.22)"}`,
          color: PU, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >◎ NARRATE</button>

      {/* Narrative panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 36, left: Math.min(BTN_LEFT, window.innerWidth - 420),
          zIndex: 66, width: "min(400px, 90vw)",
          background: BG, border: `1px solid ${PU}44`,
          borderTop: `2px solid ${PU}`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(14px)", fontFamily: MONO,
          boxShadow: `0 0 40px ${PU}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: PU,
              boxShadow: `0 0 10px ${PU}`, flexShrink: 0,
              animation: loading ? "jbpulse 1s ease-in-out infinite" : "none" }} />
            <span style={{ color: PU, fontSize: 11, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
              SCENE NARRATIVE
            </span>
            <button onClick={close}
              style={{ background: "transparent", border: "none", color: "#3a5060",
                cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
          </div>

          {sceneLabel && (
            <div style={{ fontSize: 9, letterSpacing: 2, color: CY, marginBottom: 8, opacity: 0.8 }}>
              {sceneLabel.toUpperCase()}
            </div>
          )}

          <div style={{ fontSize: 12, lineHeight: 1.65, color: "#B0CCD8", minHeight: 40 }}>
            {loading
              ? <span style={{ color: "#3a5060" }}>composing intelligence narrative…</span>
              : narrative
                ? <>{narrative}<span style={{ color: PU }}>▌</span></>
                : <span style={{ color: "#3a5060" }}>press NARRATE to generate</span>}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button
              onClick={narrate}
              disabled={loading}
              style={{
                background: "transparent", border: `1px solid ${PU}66`,
                color: PU, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
                padding: "3px 10px", borderRadius: 5, cursor: loading ? "default" : "pointer",
                opacity: loading ? 0.5 : 1,
              }}>
              ▶ {loading ? "generating…" : "re-narrate"}
            </button>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#3a5060", alignSelf: "center" }}>
              /v1/cinematic/scene + /v1/jarvis/agent/chat
            </span>
          </div>
        </div>
      )}

      <style>{`@keyframes jbpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.6);opacity:.4}}`}</style>
    </>
  );
}
