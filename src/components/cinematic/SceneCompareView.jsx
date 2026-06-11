/**
 * SceneCompareView — F49 Side-by-side scene anchor comparison.
 * Fetches two user-selected /v1/cinematic/scene/{id} in parallel, then
 * renders a two-column diff: anchors in common (showing health divergence),
 * anchors unique to each scene. Click "COMPARE" → /v1/jarvis/agent/chat for
 * an AI narrative of the differences + TTS via jarvis:speak-dossier.
 * Toggle: ⇄ CMPV at left:3820 bottom strip.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF4444";
const DIM = "#566878";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const SCENE_LABEL = {
  "01_command_atrium":              "Command Atrium",
  "02_ai_core_chamber":             "AI Core Chamber",
  "03_world_control_room":          "World Control Room",
  "04_intelligence_graph_space":    "Intelligence Graph Space",
  "05_operations_war_room":         "Operations War Room",
  "06_data_fusion_reactor":         "Data Fusion Reactor",
  "07_document_intelligence_vault": "Document Intelligence Vault",
  "08_simulation_theatre":          "Simulation Theatre",
  "09_analytics_observatory":       "Analytics Observatory",
  "10_system_security_core":        "System Security Core",
};

export const COMPARE_RE = /\bcompare.scene|scene.comp|diff.scene|scene.diff|compare.anchor|anchor.comp/i;

export function isSceneCompareQuery(text) {
  return COMPARE_RE.test(text);
}

export async function buildSceneCompareScript() {
  try {
    const [a, b] = await Promise.all([
      fetch(`${apiBase()}/v1/cinematic/scene/01_command_atrium`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then(r => r.json()),
      fetch(`${apiBase()}/v1/cinematic/scene/02_ai_core_chamber`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then(r => r.json()),
    ]);
    const aAnchors = Object.keys(a?.anchors || {}).length;
    const bAnchors = Object.keys(b?.anchors || {}).length;
    return `Scene comparison panel is open, sir. Command Atrium has ${aAnchors} anchors, AI Core Chamber has ${bAnchors}. Use the dropdowns to select any two scenes and press Compare for a full analysis.`;
  } catch {
    return "Scene comparison panel is open, sir. Select two scenes and press Compare for a full anchor diff and AI analysis.";
  }
}

function healthColour(val) {
  if (val == null || val === "") return DIM;
  const n = parseFloat(val);
  if (isNaN(n)) return DIM;
  if (n >= 0.8) return GRN;
  if (n >= 0.5) return AMB;
  return RED;
}

function extractAnchors(scene) {
  if (!scene) return {};
  if (scene.anchors && typeof scene.anchors === "object") return scene.anchors;
  return {};
}

function SceneSelector({ value, onChange, other }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: "rgba(5,8,13,0.85)", border: `1px solid ${CY}44`,
        color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
        padding: "3px 6px", borderRadius: 4, cursor: "pointer", flex: 1,
        outline: "none",
      }}
    >
      {SCENE_IDS.filter(id => id !== other).map(id => (
        <option key={id} value={id}>{SCENE_LABEL[id]}</option>
      ))}
    </select>
  );
}

export default function SceneCompareView() {
  const [open, setOpen]         = useState(false);
  const [sceneA, setSceneA]     = useState(SCENE_IDS[0]);
  const [sceneB, setSceneB]     = useState(SCENE_IDS[1]);
  const [dataA, setDataA]       = useState(null);
  const [dataB, setDataB]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [aiText, setAiText]     = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:compare-toggle", onToggle);
    return () => window.removeEventListener("jarvis:compare-toggle", onToggle);
  }, []);

  const fetchScenes = useCallback(async () => {
    setLoading(true); setDataA(null); setDataB(null); setAiText("");
    try {
      const [a, b] = await Promise.all([
        fetch(`${apiBase()}/v1/cinematic/scene/${sceneA}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
        fetch(`${apiBase()}/v1/cinematic/scene/${sceneB}`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then(r => r.json()),
      ]);
      setDataA(a);
      setDataB(b);
    } finally {
      setLoading(false);
    }
  }, [sceneA, sceneB]);

  const runAiCompare = useCallback(async () => {
    if (!dataA || !dataB) return;
    setAiLoading(true); setAiText("");
    const anchA = extractAnchors(dataA);
    const anchB = extractAnchors(dataB);
    const summary =
      `Scene A (${SCENE_LABEL[sceneA]}): anchors=${Object.keys(anchA).join(", ") || "none"}. ` +
      `Scene B (${SCENE_LABEL[sceneB]}): anchors=${Object.keys(anchB).join(", ") || "none"}.`;
    const prompt = `Compare these two JARVIS cinematic scenes and describe the key differences in two sentences: ${summary}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Both scenes share operational infrastructure with diverging anchor health signatures.";
      setAiText(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAiText("Unable to reach reasoning core for comparison narration.");
    } finally {
      setAiLoading(false);
    }
  }, [dataA, dataB, sceneA, sceneB]);

  const anchA = extractAnchors(dataA);
  const anchB = extractAnchors(dataB);
  const keysA = Object.keys(anchA);
  const keysB = Object.keys(anchB);
  const allKeys = Array.from(new Set([...keysA, ...keysB])).sort();
  const inBoth  = allKeys.filter(k => keysA.includes(k) && keysB.includes(k));
  const onlyA   = allKeys.filter(k => keysA.includes(k) && !keysB.includes(k));
  const onlyB   = allKeys.filter(k => !keysA.includes(k) && keysB.includes(k));

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 65, width: "min(860px,94vw)", maxHeight: "80vh",
          background: "rgba(6,10,18,0.95)", border: `1px solid ${CY}44`,
          borderRadius: 14, padding: "16px 18px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 12,
          overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontSize: 13, letterSpacing: 3, fontWeight: 700 }}>⇄ SCENE COMPARE</span>
            <span style={{ marginLeft: "auto", cursor: "pointer", color: DIM, fontSize: 16 }}
              onClick={() => setOpen(false)}>✕</span>
          </div>

          {/* scene selectors */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: DIM, whiteSpace: "nowrap" }}>SCENE A</span>
            <SceneSelector value={sceneA} onChange={setSceneA} other={sceneB} />
            <span style={{ fontSize: 10, color: DIM, whiteSpace: "nowrap" }}>VS</span>
            <SceneSelector value={sceneB} onChange={setSceneB} other={sceneA} />
            <button onClick={fetchScenes} disabled={loading || sceneA === sceneB} style={{
              background: loading ? "rgba(5,8,13,0.5)" : CY, color: "#04060A",
              border: "none", borderRadius: 5, padding: "4px 14px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
              cursor: loading || sceneA === sceneB ? "not-allowed" : "pointer",
              fontWeight: 700, whiteSpace: "nowrap",
            }}>{loading ? "…" : "FETCH"}</button>
          </div>

          {/* diff table */}
          {(dataA || dataB) && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <th style={{ padding: "4px 8px", color: DIM, textAlign: "left", borderBottom: `1px solid ${CY}22`, width: "34%" }}>ANCHOR</th>
                    <th style={{ padding: "4px 8px", color: CY, textAlign: "center", borderBottom: `1px solid ${CY}22`, width: "33%" }}>
                      {SCENE_LABEL[sceneA]?.toUpperCase().slice(0,20)}
                    </th>
                    <th style={{ padding: "4px 8px", color: AMB, textAlign: "center", borderBottom: `1px solid ${CY}22`, width: "33%" }}>
                      {SCENE_LABEL[sceneB]?.toUpperCase().slice(0,20)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allKeys.map(k => {
                    const inA = keysA.includes(k);
                    const inB = keysB.includes(k);
                    const vA  = inA ? anchA[k] : null;
                    const vB  = inB ? anchB[k] : null;
                    const cA  = inA ? healthColour(vA) : DIM;
                    const cB  = inB ? healthColour(vB) : DIM;
                    const rowBg = (!inA || !inB) ? "rgba(255,180,0,0.04)" : "transparent";
                    return (
                      <tr key={k} style={{ background: rowBg }}>
                        <td style={{ padding: "3px 8px", color: "#9BB4C8", fontSize: 10 }}>{k}</td>
                        <td style={{ padding: "3px 8px", textAlign: "center", color: inA ? cA : DIM }}>
                          {inA
                            ? (typeof vA === "object" ? "{ … }" : String(vA ?? "—"))
                            : <span style={{ color: DIM }}>—</span>}
                        </td>
                        <td style={{ padding: "3px 8px", textAlign: "center", color: inB ? cB : DIM }}>
                          {inB
                            ? (typeof vB === "object" ? "{ … }" : String(vB ?? "—"))
                            : <span style={{ color: DIM }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {allKeys.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: "12px 8px", color: DIM, textAlign: "center" }}>
                      Press FETCH to load anchor data.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* stats row */}
          {(dataA || dataB) && (
            <div style={{ display: "flex", gap: 16, fontSize: 10, color: DIM }}>
              <span>SHARED <b style={{ color: CY }}>{inBoth.length}</b></span>
              <span>ONLY IN A <b style={{ color: AMB }}>{onlyA.length}</b></span>
              <span>ONLY IN B <b style={{ color: PRP }}>{onlyB.length}</b></span>
              <span>TOTAL <b style={{ color: "#DCEBF5" }}>{allKeys.length}</b></span>
              <button onClick={runAiCompare} disabled={!dataA || !dataB || aiLoading} style={{
                marginLeft: "auto", background: aiLoading ? "rgba(5,8,13,0.5)" : PRP,
                color: "#fff", border: "none", borderRadius: 5, padding: "3px 12px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
                cursor: (!dataA || !dataB || aiLoading) ? "not-allowed" : "pointer", fontWeight: 700,
              }}>{aiLoading ? "NARRATING…" : "▶ COMPARE"}</button>
            </div>
          )}

          {/* AI narration */}
          {aiText && (
            <div style={{
              background: "rgba(168,85,247,0.08)", border: `1px solid ${PRP}44`,
              borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#DCEBF5", lineHeight: 1.6,
            }}>
              <span style={{ color: PRP, fontSize: 10, letterSpacing: 2 }}>◈ AI ANALYSIS  </span>
              {aiText}
            </div>
          )}
        </div>
      )}

      {/* bottom-strip toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Scene Compare (F49)"
        style={{
          position: "fixed", bottom: 8, left: 3820, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : CY, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${CY}` : "none", whiteSpace: "nowrap",
        }}>
        ⇄ CMPV
      </button>
    </>
  );
}
