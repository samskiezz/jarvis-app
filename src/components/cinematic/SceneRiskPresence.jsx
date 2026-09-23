/**
 * F52 SceneRiskPresence — cross-correlates the 10 cinematic scenes (anchors
 * from /v1/cinematic/scene/{id}) against active risk signals
 * (/entities/RiskSignal) to surface which scenes have associated risks.
 *
 * Exports:
 *   isSceneRiskQuery(q)     — voice intent detector
 *   buildSceneRiskScript()  — async TTS script builder
 *   default SceneRiskPresence — panel component (jarvis:srisk-toggle)
 */
import { useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4B4B";
const GR  = "#00c878";
const AM  = "#FFB800";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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
const SCENE_LABELS = {
  "01_command_atrium":             "Command Atrium",
  "02_ai_core_chamber":            "AI Core Chamber",
  "03_world_control_room":         "World Control Room",
  "04_intelligence_graph_space":   "Intelligence Graph",
  "05_operations_war_room":        "Operations War Room",
  "06_data_fusion_reactor":        "Data Fusion Reactor",
  "07_document_intelligence_vault":"Document Vault",
  "08_simulation_theatre":         "Simulation Theatre",
  "09_analytics_observatory":      "Analytics Observatory",
  "10_system_security_core":       "System Security Core",
};

export function isSceneRiskQuery(q) {
  return /\b(scene risk|srisk|at[\s-]?risk scenes?|risk map|which scenes?.*risk|scene.*risk|risk.*scene|risk presence)\b/i.test(q || "");
}

function kw(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean); }

function correlate(scenes, risks) {
  return scenes.map((scene) => {
    const anchorText = (scene.anchors || []).map((a) =>
      `${a.label || ""} ${a.description || ""} ${a.type || ""}`
    ).join(" ").toLowerCase();
    const sceneKws = kw(anchorText + " " + (scene.id || ""));
    const matched = risks.filter((r) => {
      const rKws = kw(`${r.name || ""} ${r.description || ""} ${r.category || ""} ${r.type || ""}`);
      return rKws.some((rk) => sceneKws.some((sk) => sk.includes(rk) || rk.includes(sk)));
    });
    const critical = matched.filter((r) => (r.severity || "").toLowerCase() === "critical");
    return {
      ...scene,
      label: SCENE_LABELS[scene.id] || scene.id,
      matchedRisks: matched,
      critical: critical.length,
      atRisk: matched.length > 0,
    };
  });
}

export async function buildSceneRiskScript() {
  try {
    const base = apiBase();
    const [sceneResults, riskResp] = await Promise.all([
      Promise.allSettled(
        SCENE_IDS.map((id) => fetch(`${base}/v1/cinematic/scene/${id}`).then((r) => r.ok ? r.json() : null))
      ),
      fetch(`${base}/entities/RiskSignal`).then((r) => r.ok ? r.json() : []),
    ]);
    const scenes = sceneResults
      .map((r, i) => r.status === "fulfilled" && r.value ? { id: SCENE_IDS[i], ...(r.value?.scene || r.value) } : { id: SCENE_IDS[i] });
    const risks = Array.isArray(riskResp) ? riskResp : (riskResp?.items || riskResp?.data || []);
    const correlated = correlate(scenes, risks);
    const atRisk = correlated.filter((s) => s.atRisk);
    const critical = correlated.filter((s) => s.critical > 0);
    if (risks.length === 0) return "Risk signal feed is offline, sir. Scene risk presence cannot be assessed at this time.";
    const parts = [`Scene risk presence analysis complete, sir. ${atRisk.length} of ${correlated.length} scenes have associated active risk signals.`];
    if (critical.length > 0)
      parts.push(`Critical alert: ${critical.map((s) => s.label).join(", ")} ${critical.length === 1 ? "has" : "have"} critical severity risks present.`);
    if (atRisk.length === 0)
      parts.push("All scenes are currently clear of active risk associations.");
    else {
      const topScene = atRisk.reduce((a, b) => b.matchedRisks.length > a.matchedRisks.length ? b : a);
      parts.push(`The ${topScene.label} has the highest exposure with ${topScene.matchedRisks.length} matched risk${topScene.matchedRisks.length !== 1 ? "s" : ""}.`);
    }
    parts.push("Scene risk presence panel is now active, sir.");
    return parts.join(" ");
  } catch {
    return "Scene risk presence analysis encountered an error, sir.";
  }
}

export default function SceneRiskPresence() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [risks, setRisks] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const [assessText, setAssessText] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:srisk-toggle", h);
    return () => window.removeEventListener("jarvis:srisk-toggle", h);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const base = apiBase();
      const [sceneResults, riskResp] = await Promise.all([
        Promise.allSettled(
          SCENE_IDS.map((id) => fetch(`${base}/v1/cinematic/scene/${id}`).then((r) => r.ok ? r.json() : null))
        ),
        fetch(`${base}/entities/RiskSignal`).then((r) => r.ok ? r.json() : []),
      ]);
      const scenes = sceneResults.map((r, i) =>
        r.status === "fulfilled" && r.value ? { id: SCENE_IDS[i], ...(r.value?.scene || r.value) } : { id: SCENE_IDS[i] }
      );
      const riskArr = Array.isArray(riskResp) ? riskResp : (riskResp?.items || riskResp?.data || []);
      setRisks(riskArr);
      setRows(correlate(scenes, riskArr));
    } catch {}
    setLoading(false);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function assess(row) {
    setAssessing(row.id); setAssessText("");
    try {
      const base = apiBase();
      const riskNames = row.matchedRisks.slice(0, 5).map((r) => r.name || r.id).join(", ");
      const prompt = `Scene "${row.label}" has ${row.matchedRisks.length} associated risk signal(s): ${riskNames}. Provide a 2-sentence risk presence summary and recommended action for this JARVIS operational scene.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      setAssessText((d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim());
    } catch { setAssessText("Assessment endpoint unreachable."); }
    setAssessing(null);
  }

  const filtered = rows.filter((r) => {
    if (filter === "AT_RISK") return r.atRisk;
    if (filter === "CLEAR") return !r.atRisk;
    if (filter === "CRITICAL") return r.critical > 0;
    return true;
  });

  const atRiskCount = rows.filter((r) => r.atRisk).length;
  const criticalCount = rows.filter((r) => r.critical > 0).length;
  const clearCount = rows.filter((r) => !r.atRisk).length;

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      title="Scene Risk Presence (F52)"
      style={{
        position: "fixed", bottom: 10, left: 11400, zIndex: 80,
        background: "rgba(5,12,20,0.75)", border: `1px solid rgba(255,75,75,0.3)`,
        color: RED, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
        padding: "4px 8px", borderRadius: 6, cursor: "pointer",
        backdropFilter: "blur(6px)", whiteSpace: "nowrap",
      }}
    >◈ SRISK</button>
  );

  return (
    <div style={{
      position: "fixed", top: "8vh", right: 24, zIndex: 9500,
      width: "min(640px,94vw)", maxHeight: "82vh",
      background: "rgba(5,10,18,0.94)", backdropFilter: "blur(18px)",
      border: `1px solid rgba(255,75,75,0.25)`, borderTop: `2px solid ${RED}`,
      borderRadius: 14, display: "flex", flexDirection: "column",
      boxShadow: `0 0 60px rgba(255,75,75,0.12), 0 20px 50px rgba(0,0,0,0.7)`,
      fontFamily: SANS,
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid rgba(255,75,75,0.15)`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: RED, fontFamily: MONO, fontSize: 12, letterSpacing: 2, flex: 1 }}>◈ SCENE RISK PRESENCE</span>
        <button onClick={load} style={{ background: "none", border: `1px solid rgba(255,75,75,0.3)`, color: RED, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: MONO, fontSize: 10 }}>⟳ REFRESH</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4a6070", cursor: "pointer", fontFamily: MONO, fontSize: 14 }}>✕</button>
      </div>

      {/* Stats */}
      <div style={{ padding: "10px 16px", display: "flex", gap: 12, borderBottom: `1px solid rgba(255,75,75,0.1)` }}>
        {[
          { label: "SCENES", val: rows.length, color: CY },
          { label: "RISKS", val: risks.length, color: CY },
          { label: "AT RISK", val: atRiskCount, color: atRiskCount > 0 ? RED : GR },
          { label: "CRITICAL", val: criticalCount, color: criticalCount > 0 ? RED : GR },
          { label: "CLEAR", val: clearCount, color: GR },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 4px" }}>
            <div style={{ fontFamily: MONO, fontSize: 18, color, fontWeight: 700 }}>{val}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: "#4a6070", letterSpacing: 1.5 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ padding: "8px 16px", display: "flex", gap: 8, borderBottom: `1px solid rgba(255,75,75,0.1)` }}>
        {["ALL", "AT_RISK", "CRITICAL", "CLEAR"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "3px 10px", borderRadius: 5, cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
            background: filter === f ? `${RED}22` : "transparent",
            border: `1px solid ${filter === f ? RED : "rgba(255,75,75,0.2)"}`,
            color: filter === f ? RED : "#4a6070",
          }}>{f}</button>
        ))}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 8px" }}>
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#4a6070" }}>scanning scene anchors…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", fontFamily: MONO, fontSize: 12, color: "#4a6070" }}>no scenes match filter</div>
        ) : filtered.map((row) => (
          <div key={row.id} style={{ marginBottom: 6, borderRadius: 9, border: `1px solid ${row.critical > 0 ? "rgba(255,75,75,0.4)" : row.atRisk ? "rgba(255,184,0,0.3)" : "rgba(41,231,255,0.12)"}`, background: "rgba(255,255,255,0.02)" }}>
            {/* Row header */}
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{ padding: "9px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
            >
              <span style={{ fontFamily: MONO, fontSize: 11, color: row.critical > 0 ? RED : row.atRisk ? AM : GR, width: 20, textAlign: "center" }}>
                {row.critical > 0 ? "⚠" : row.atRisk ? "●" : "○"}
              </span>
              <span style={{ flex: 1, fontSize: 13, color: "#C0DCE8" }}>{row.label}</span>
              <span style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: 1.5,
                color: row.critical > 0 ? RED : row.atRisk ? AM : GR,
                padding: "2px 7px", borderRadius: 4,
                background: row.critical > 0 ? "rgba(255,75,75,0.12)" : row.atRisk ? "rgba(255,184,0,0.12)" : "rgba(0,200,120,0.1)",
              }}>
                {row.critical > 0 ? `CRITICAL ×${row.critical}` : row.atRisk ? `AT RISK ×${row.matchedRisks.length}` : "CLEAR"}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#2a4050" }}>{expanded === row.id ? "▲" : "▼"}</span>
            </div>

            {/* Expanded */}
            {expanded === row.id && (
              <div style={{ padding: "0 12px 12px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                {row.matchedRisks.length === 0 ? (
                  <div style={{ color: GR, fontFamily: MONO, fontSize: 11, padding: "8px 0" }}>No active risk signals correlated to this scene's anchors.</div>
                ) : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 6, margin: "8px 0" }}>
                      {row.matchedRisks.map((r) => (
                        <div key={r.id || r.name} style={{ background: "rgba(255,75,75,0.07)", borderRadius: 7, padding: "7px 10px", border: `1px solid rgba(255,75,75,0.15)` }}>
                          <div style={{ fontFamily: MONO, fontSize: 11, color: (r.severity || "").toLowerCase() === "critical" ? RED : AM, letterSpacing: 1 }}>
                            {(r.severity || "RISK").toUpperCase()}
                          </div>
                          <div style={{ fontSize: 12, color: "#C0DCE8", marginTop: 2 }}>{r.name || r.id}</div>
                          {r.description && <div style={{ fontSize: 11, color: "#4a6070", marginTop: 3, lineHeight: 1.4 }}>{r.description.slice(0, 80)}{r.description.length > 80 ? "…" : ""}</div>}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => assess(row)}
                      disabled={assessing === row.id}
                      style={{
                        marginTop: 4, padding: "5px 14px", borderRadius: 6, cursor: "pointer",
                        background: assessing === row.id ? "rgba(255,75,75,0.05)" : "rgba(255,75,75,0.12)",
                        border: `1px solid rgba(255,75,75,0.3)`, color: RED,
                        fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
                      }}
                    >
                      {assessing === row.id ? "▷ ASSESSING…" : "▶ ASSESS RISK PRESENCE"}
                    </button>
                    {assessText && assessing !== row.id && expanded === row.id && (
                      <div style={{ marginTop: 8, fontSize: 12, color: "#A0C8DC", lineHeight: 1.6, fontFamily: SANS, background: "rgba(255,75,75,0.05)", borderRadius: 7, padding: "8px 10px" }}>
                        {assessText}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 16px", borderTop: `1px solid rgba(255,75,75,0.1)`, fontFamily: MONO, fontSize: 10, color: "#2a4050", display: "flex", gap: 12 }}>
        <span>↑↓ scroll</span><span>click to expand</span>
        <span style={{ marginLeft: "auto" }}>{filtered.length} scene{filtered.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
