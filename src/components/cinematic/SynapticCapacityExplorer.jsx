/**
 * SynapticCapacityExplorer — F231.
 *
 * Parallel-fetches:
 *   GET /v1/jarvis/system/capacity  → materialised counts + capacity figures
 *   GET /v1/jarvis/system/expansion → hierarchical cluster tiers + grand tally
 *
 * Displays:
 *   - Stat tiles: neurons / total_nodes / neural_synapses / full_mesh
 *   - Hierarchy tier table (neurons → clusters → super → hyper…)
 *   - Capacity breakdown bars (input synapses / mesh / neural total)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence AI brief + TTS
 *
 * Toggle: ⬡ SYNAP at left:87360, bottom:8, zIndex:112.
 * Amber badge = neuron count. 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isSynapticCapacityQuery(q) / buildSynapticCapacityScript()
 *
 * Voice triggers: "synaptic capacity / brain capacity / neural capacity /
 *   capacity explorer / synap / synaptic scale / how big is the brain"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const VIOLET = "#A78BFA";
const GREEN  = "#4ADE80";
const BTN_LEFT  = 87360;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchCapacity() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/capacity`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`capacity ${r.status}`);
  return r.json();
}

async function fetchExpansion() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/expansion`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`expansion ${r.status}`);
  return r.json();
}

function fmt(n) {
  if (n == null || n === 0) return "0";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

export function isSynapticCapacityQuery(q) {
  return /synaptic.capac|brain.capac|neural.capac|capac.explor|synap\b|synaptic.scale|how.big.is.the.brain|neuron.count|cluster.hierarchy|synaptic.expansion/i.test(
    q || ""
  );
}

export async function buildSynapticCapacityScript() {
  try {
    const [cap, exp] = await Promise.all([fetchCapacity(), fetchExpansion()]);
    window.dispatchEvent(new CustomEvent("jarvis:synap-toggle"));
    const neurons = cap?.materialised?.neurons ?? 0;
    const neural  = cap?.capacity?.neural_synapses_total ?? 0;
    const tiers   = exp?.hierarchy?.tiers ?? [];
    const tierStr = tiers.length
      ? `${tiers.length} cluster tier${tiers.length !== 1 ? "s" : ""} above the neuron layer`
      : "no cluster hierarchy formed yet";
    return `Synaptic capacity analysis complete, sir. The JARVIS brain currently materialises ${fmt(neurons)} neurons with ${fmt(neural)} potential neural synapses at full connectivity, forming ${tierStr}. Full-graph undirected mesh would reach ${fmt(exp?.synapses?.full_mesh_undirected ?? 0)} connections — the architecture scales combinatorially as the corpus grows.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:synap-toggle"));
    return "Synaptic Capacity Explorer open, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SynapticCapacityExplorer() {
  const [visible,    setVisible]    = useState(false);
  const [cap,        setCap]        = useState(null);
  const [exp,        setExp]        = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:synap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:synap-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, e] = await Promise.all([fetchCapacity(), fetchExpansion()]);
      setCap(c);
      setExp(e);
    } catch {
      // silently retain stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const neurons       = cap?.materialised?.neurons        ?? 0;
  const totalNodes    = exp?.nodes?.total_nodes           ?? 0;
  const neuralSyn     = cap?.capacity?.neural_synapses_total ?? 0;
  const fullMesh      = exp?.synapses?.full_mesh_undirected  ?? 0;
  const inputSyn      = cap?.capacity?.neuron_input_synapses ?? 0;
  const meshSyn       = cap?.capacity?.neuron_to_neuron_synapses ?? 0;
  const tiers         = exp?.hierarchy?.tiers             ?? [];
  const primitives    = cap?.primitives?.total            ?? 0;

  const maxBar = Math.max(inputSyn, meshSyn, neuralSyn, 1);
  const barPct = (v) => Math.round((v / maxBar) * 100);

  async function handleAssess() {
    setAssessing(true);
    try {
      const apiUrl = `${apiBase()}/v1/jarvis/agent/chat`;
      const context = cap
        ? `neurons=${neurons}, neural_synapses=${neuralSyn}, full_mesh=${fullMesh}, tiers=${tiers.length}`
        : "no data";
      const r = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Interpret this JARVIS synaptic capacity snapshot in 2 sentences: ${context}. Focus on what the scale means for system intelligence.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.reply || d.message || "Assessment complete.";
      setAssessment(text);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 112,
          background: visible ? `${VIOLET}22` : "rgba(5,10,18,0.82)",
          border: `1px solid ${visible ? VIOLET : VIOLET + "55"}`,
          borderRadius: 6,
          padding: "3px 9px",
          color: visible ? VIOLET : VIOLET + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⬡ SYNAP
        {neurons > 0 && (
          <span
            style={{
              marginLeft: 5,
              background: AMBER + "33",
              border: `1px solid ${AMBER}66`,
              borderRadius: 3,
              padding: "0 4px",
              color: AMBER,
              fontSize: 9,
            }}
          >
            {fmt(neurons)}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 38,
            left: BTN_LEFT - 220,
            width: 480,
            maxHeight: "72vh",
            overflowY: "auto",
            zIndex: 113,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${VIOLET}44`,
            borderRadius: 12,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 60px ${VIOLET}18, 0 20px 40px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${VIOLET}33`,
            }}
          >
            <span style={{ color: VIOLET, fontSize: 11, letterSpacing: 2 }}>
              ⬡ SYNAPTIC CAPACITY EXPLORER
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ color: "#4E6070", fontSize: 9 }}>◌ LOADING</span>
              )}
              <button
                onClick={handleAssess}
                disabled={assessing || !cap}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? "#4E6070" : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !cap ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4E6070",
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "0 2px",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 14px" }}>
            {/* Stat tiles */}
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}
            >
              {[
                { label: "NEURONS",     value: fmt(neurons),    color: CY },
                { label: "TOTAL NODES", value: fmt(totalNodes), color: GREEN },
                { label: "NEURAL SYN",  value: fmt(neuralSyn),  color: VIOLET },
                { label: "FULL MESH",   value: fmt(fullMesh),   color: AMBER },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    background: color + "0E",
                    border: `1px solid ${color}33`,
                    borderRadius: 6,
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ color, fontSize: 13, letterSpacing: 0.5 }}>{value}</div>
                  <div style={{ color: "#4E6070", fontSize: 8, marginTop: 2, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Primitives breakdown */}
            {cap?.materialised && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 5 }}>
                  MATERIALISED PRIMITIVES ({fmt(primitives)} total)
                </div>
                {[
                  { key: "objects",   label: "Objects",   color: CY },
                  { key: "neurons",   label: "Neurons",   color: VIOLET },
                  { key: "sources",   label: "Sources",   color: GREEN },
                  { key: "documents", label: "Documents", color: AMBER },
                  { key: "links",     label: "Links",     color: "#F87171" },
                ].map(({ key, label, color }) => {
                  const v = cap.materialised[key] || 0;
                  const pct = primitives > 0 ? Math.round((v / primitives) * 100) : 0;
                  return (
                    <div
                      key={key}
                      style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
                    >
                      <span style={{ color: "#4E6070", fontSize: 9, width: 66, flexShrink: 0 }}>
                        {label}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 5,
                          background: "#0A1420",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: color,
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span style={{ color, fontSize: 9, width: 36, textAlign: "right", flexShrink: 0 }}>
                        {fmt(v)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Capacity breakdown bars */}
            {cap?.capacity && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 5 }}>
                  SYNAPTIC CAPACITY (combinatorial potential)
                </div>
                {[
                  { label: "Input (data→neuron)", value: inputSyn, color: CY },
                  { label: "Mesh (neuron↔neuron)", value: meshSyn, color: VIOLET },
                  { label: "Neural total",          value: neuralSyn, color: GREEN },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
                  >
                    <span style={{ color: "#4E6070", fontSize: 9, width: 130, flexShrink: 0 }}>
                      {label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: 5,
                        background: "#0A1420",
                        borderRadius: 3,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${barPct(value)}%`,
                          height: "100%",
                          background: color,
                          borderRadius: 3,
                        }}
                      />
                    </div>
                    <span style={{ color, fontSize: 9, width: 40, textAlign: "right", flexShrink: 0 }}>
                      {fmt(value)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Hierarchy tier table */}
            {tiers.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 2, marginBottom: 5 }}>
                  CLUSTER HIERARCHY (branching: {exp?.hierarchy?.branching ?? "–"})
                </div>
                {[
                  { label: "Neurons",                     count: neurons },
                  ...tiers.map((t) => ({ label: t.layer.replace(/_/g, " "), count: t.count })),
                ].map(({ label, count }, i) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "3px 6px",
                      marginBottom: 2,
                      background: i === 0 ? `${VIOLET}0A` : `${CY}06`,
                      borderRadius: 4,
                    }}
                  >
                    <span
                      style={{
                        color: i === 0 ? VIOLET : `${CY}AA`,
                        fontSize: 9,
                        flex: 1,
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                      }}
                    >
                      {"  ".repeat(i)}
                      {i > 0 ? "└ " : ""}
                      {label}
                    </span>
                    <span style={{ color: i === 0 ? VIOLET : CY, fontSize: 10 }}>
                      {fmt(count)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Assessment */}
            {assessment && (
              <div
                style={{
                  background: `${CY}0A`,
                  border: `1px solid ${CY}33`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  color: "#DCEBF5",
                  fontSize: 10,
                  lineHeight: 1.5,
                  letterSpacing: 0.3,
                }}
              >
                {assessment}
              </div>
            )}

            {!cap && !loading && (
              <div style={{ color: "#4E6070", fontSize: 10, textAlign: "center", padding: "16px 0" }}>
                No capacity data available
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              borderTop: `1px solid ${VIOLET}1A`,
              padding: "5px 14px",
              color: "#2E4050",
              fontSize: 9,
              letterSpacing: 1,
            }}
          >
            /v1/jarvis/system/capacity · /v1/jarvis/system/expansion · 90 s refresh
          </div>
        </div>
      )}
    </>
  );
}
