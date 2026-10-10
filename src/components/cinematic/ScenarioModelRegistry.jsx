/**
 * ScenarioModelRegistry — F37
 * Polls /v1/scenario/models every 60 s.
 * Displays the prediction-model catalog: name, kind badge, trained / untrained
 * status pill, file size. Drift status strip across the top.
 * Click ▶ ASSESS on any model row → /v1/jarvis/agent/chat 2-sentence brief
 * + TTS via jarvis:speak-dossier.
 * ⬢ MODELS toggle button at left:70760 bottom:18.
 * Ctrl+Shift+M keyboard shortcut.
 * jarvis:model-registry-toggle CustomEvent.
 * Voice triggers: "model registry / scenario models / available models /
 *   prediction models / what models / drift status / trained models"
 * → isModelRegistryQuery + buildModelRegistryScript wired into JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const RED  = "#FF4D6D";
const AMB  = "#FFD700";
const ORG  = "#FF8800";
const DIM  = "#0D1520";
const POLL = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const MODEL_RE =
  /\b(model.?registry|scenario.?model|available.?model|prediction.?model|what.?model|drift.?status|trained.?model|model.?catalog|ml.?model|ai.?model)\b/i;

export function isModelRegistryQuery(t) {
  return MODEL_RE.test(t || "");
}

/* ── script builder (called by JarvisBrain for TTS brief) ─────────────────── */
export async function buildModelRegistryScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/scenario/models`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return "Model registry is unavailable at the moment, sir.";
    const d = await r.json();
    const models = Array.isArray(d?.models) ? d.models : [];
    const trained = models.filter((m) => m.trained).length;
    const untrained = models.length - trained;
    const driftNote = d.drift_engine
      ? `Drift engine: ${d.drift_engine}.`
      : d.drift_note
      ? "Drift monitoring offline — bridge unreachable."
      : "Drift status unknown.";
    return `Model registry contains ${models.length} prediction model${models.length !== 1 ? "s" : ""}: ` +
      `${trained} trained and ready, ${untrained} not yet trained. ${driftNote}`;
  } catch {
    return "I couldn't reach the model registry at the moment, sir.";
  }
}

/* ── size formatter ────────────────────────────────────────────────────────── */
function fmtSize(bytes) {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/* ── kind colour ───────────────────────────────────────────────────────────── */
function kindColour(kind) {
  const k = (kind || "").toLowerCase();
  if (k.includes("oracle") || k.includes("class")) return AMB;
  if (k.includes("regress") || k.includes("forecast")) return "#A78BFA";
  if (k.includes("cluster")) return "#34D399";
  return CY;
}

/* ── component ─────────────────────────────────────────────────────────────── */
export default function ScenarioModelRegistry() {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [drift, setDrift] = useState(null);
  const [driftEngine, setDriftEngine] = useState(null);
  const [driftNote, setDriftNote] = useState(null);
  const [filter, setFilter] = useState("");
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase()}/v1/scenario/models`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) return;
      const d = await r.json();
      setModels(Array.isArray(d?.models) ? d.models : []);
      setDrift(d?.drift ?? null);
      setDriftEngine(d?.drift_engine ?? null);
      setDriftNote(d?.drift_note ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    pollRef.current = setInterval(fetchData, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, fetchData]);

  /* keyboard shortcut & toggle event */
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "M") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("keydown", onKey);
    window.addEventListener("jarvis:model-registry-toggle", onToggle);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("jarvis:model-registry-toggle", onToggle);
    };
  }, []);

  /* voice open */
  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isModelRegistryQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  /* assess a single model via agent/chat */
  async function assessModel(model) {
    setAssessing(model.name);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Two-sentence model assessment for: ${model.name} (kind: ${model.kind}, trained: ${model.trained}).`,
        }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) {
        window.dispatchEvent(
          new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
        );
      }
    } catch {}
    setAssessing(null);
  }

  const trained = models.filter((m) => m.trained).length;
  const visible = models.filter((m) =>
    !filter || m.name.toLowerCase().includes(filter.toLowerCase()) ||
    (m.kind || "").toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Scenario Model Registry (Ctrl+Shift+M)"
        style={{
          position: "fixed", bottom: 18, left: 70760, zIndex: 9200,
          background: open ? CY : "rgba(8,14,22,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 6, padding: "4px 10px", fontSize: 11,
          letterSpacing: 1.5, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(6px)",
          boxShadow: trained > 0 ? `0 0 14px ${GRN}55` : "none",
        }}
      >
        ⬢ MODELS
        {trained > 0 && (
          <span style={{
            marginLeft: 5, background: GRN, color: "#04060A",
            borderRadius: 8, padding: "0 5px", fontSize: 10, fontWeight: 700,
          }}>
            {trained}
          </span>
        )}
      </button>

      {/* panel */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 9201,
          width: "min(480px, 92vw)", maxHeight: "calc(100vh - 90px)",
          background: "rgba(7,12,20,0.94)", border: `1px solid ${CY}44`,
          borderRadius: 12, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", overflow: "hidden",
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⬢ MODEL REGISTRY
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#6E8AA0" }}>
              {models.length} model{models.length !== 1 ? "s" : ""}
              {" · "}{trained} trained
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0",
              cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
            }}>×</button>
          </div>

          {/* drift strip */}
          <div style={{
            padding: "7px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
            background: "rgba(0,0,0,0.2)",
          }}>
            <span style={{ fontSize: 10, color: "#6E8AA0", letterSpacing: 1 }}>DRIFT</span>
            {driftEngine ? (
              <span style={{
                fontSize: 10, color: GRN, background: `${GRN}22`,
                border: `1px solid ${GRN}44`, borderRadius: 4, padding: "1px 7px",
              }}>
                ENGINE: {driftEngine.toUpperCase()}
              </span>
            ) : (
              <span style={{
                fontSize: 10, color: "#6E8AA0", background: "rgba(255,255,255,0.04)",
                border: "1px solid #6E8AA033", borderRadius: 4, padding: "1px 7px",
              }}>
                OFFLINE
              </span>
            )}
            {driftNote && (
              <span style={{ fontSize: 9, color: "#4A6070", marginLeft: 4 }}>
                {driftNote.length > 55 ? driftNote.slice(0, 55) + "…" : driftNote}
              </span>
            )}
          </div>

          {/* filter */}
          <div style={{ padding: "7px 14px", borderBottom: `1px solid ${CY}18`, flexShrink: 0 }}>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by name or kind…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 6,
                color: "#DCEBF5", fontSize: 11, padding: "4px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* model list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {visible.length === 0 ? (
              <div style={{ padding: "20px 14px", color: "#4A6070", fontSize: 11, textAlign: "center" }}>
                {models.length === 0
                  ? "No models returned by /v1/scenario/models."
                  : "No models match the filter."}
              </div>
            ) : (
              visible.map((m) => {
                const kc = kindColour(m.kind);
                const sz = fmtSize(m.size);
                const isAssessing = assessing === m.name;
                return (
                  <div key={m.name} style={{
                    padding: "9px 14px", borderBottom: `1px solid ${CY}11`,
                    display: "flex", alignItems: "center", gap: 10,
                  }}>
                    {/* trained / untrained pill */}
                    <span style={{
                      fontSize: 9, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                      background: m.trained ? `${GRN}22` : `${RED}22`,
                      color: m.trained ? GRN : RED,
                      border: `1px solid ${m.trained ? GRN : RED}44`,
                      letterSpacing: 1,
                    }}>
                      {m.trained ? "TRAINED" : "MISSING"}
                    </span>

                    {/* name */}
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1, wordBreak: "break-word" }}>
                      {m.name}
                    </span>

                    {/* kind badge */}
                    {m.kind && (
                      <span style={{
                        fontSize: 9, color: kc, background: `${kc}18`,
                        border: `1px solid ${kc}44`, borderRadius: 4,
                        padding: "1px 6px", flexShrink: 0, letterSpacing: 0.5,
                      }}>
                        {m.kind}
                      </span>
                    )}

                    {/* size */}
                    {sz && (
                      <span style={{ fontSize: 9, color: "#4A6070", flexShrink: 0 }}>
                        {sz}
                      </span>
                    )}

                    {/* assess button */}
                    <button
                      onClick={() => assessModel(m)}
                      disabled={!!assessing}
                      style={{
                        background: "none", border: `1px solid ${CY}44`,
                        color: CY, borderRadius: 4, fontSize: 9,
                        padding: "2px 7px", cursor: assessing ? "not-allowed" : "pointer",
                        flexShrink: 0, opacity: assessing ? 0.5 : 1,
                        letterSpacing: 0.5,
                      }}
                    >
                      {isAssessing ? "…" : "▶ ASSESS"}
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* footer */}
          <div style={{
            padding: "5px 14px", borderTop: `1px solid ${CY}18`,
            fontSize: 9, color: "#2A3C50", letterSpacing: 0.5, flexShrink: 0,
          }}>
            SOURCE: /v1/scenario/models · auto-refresh 60 s · Ctrl+Shift+M
          </div>
        </div>
      )}
    </>
  );
}
