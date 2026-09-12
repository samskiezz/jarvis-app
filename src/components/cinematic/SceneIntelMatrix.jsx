/**
 * SceneIntelMatrix — F37.
 * Sources from /v1/cinematic/scene/{id} (all 10 scenes) + /v1/cinematic/brain.
 * Provides a glanceable 10-cell grid showing each cinematic scene's live anchor
 * data alongside global brain stats — the operator sees every scene's data state
 * at once without jumping to each scene individually.
 * "scene matrix" / "all scenes" / "scem" / "scene overview" opens the panel.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";

const CY   = "#29E7FF";
const GR   = "#00E5A0";
const AM   = "#F5A623";
const DIM  = "#3A4A55";
const MONO = "'JetBrains Mono','Courier New',monospace";
const SANS = "'Inter',system-ui,sans-serif";

const POLL_MS = 120_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SCEM_RE = /\bscem\b|\bscene\s*(matrix|intel\s*matrix|overview|grid|all|status|summary)\b|\ball\s*scenes?\b|\bcinematic\s*(matrix|overview|scenes?\s*status)\b/i;
export function isScemQuery(t) { return SCEM_RE.test(t || ""); }

function normAnchors(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["anchors", "items", "data", "results", "nodes", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function anchorTitle(a) {
  return a.title || a.label || a.name || a.id || "—";
}

export async function buildScemScript() {
  try {
    const base = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [brainRes, ...sceneResults] = await Promise.allSettled([
      fetch(`${base}/v1/cinematic/brain`, { headers }).then(r => r.ok ? r.json() : null),
      ...CINEMATIC_SCENES.map(s =>
        fetch(`${base}/v1/cinematic/scene/${s.id}`, { headers })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      ),
    ]);

    const brain = brainRes.status === "fulfilled" ? brainRes.value : null;
    const nodes = brain?.nodes ?? brain?.node_count ?? brain?.total_nodes ?? 0;
    const synapses = brain?.synapses ?? brain?.edge_count ?? brain?.connections ?? 0;

    let totalAnchors = 0;
    const sceneLines = CINEMATIC_SCENES.map((s, i) => {
      const data = sceneResults[i]?.status === "fulfilled" ? sceneResults[i].value : null;
      const anchors = normAnchors(data);
      totalAnchors += anchors.length;
      return `${s.label}: ${anchors.length} anchor${anchors.length !== 1 ? "s" : ""}`;
    });

    return `Scene Intelligence Matrix — ${CINEMATIC_SCENES.length} scenes scanned. ` +
      `Total anchors across all scenes: ${totalAnchors}. Brain: ${nodes} nodes, ${synapses} synapses. ` +
      `Breakdown — ${sceneLines.slice(0, 5).join("; ")}. ` +
      (totalAnchors === 0 ? "No anchor data returned — check scene endpoint connectivity." : "All scene endpoints reachable.");
  } catch {
    return "Scene Intelligence Matrix: unable to reach cinematic scene endpoints.";
  }
}

export default function SceneIntelMatrix() {
  const [open, setOpen]           = useState(false);
  const [scenes, setScenes]       = useState([]);
  const [brain, setBrain]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]         = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [brainRes, ...sceneResults] = await Promise.allSettled([
        fetch(`${base}/v1/cinematic/brain`, { headers }).then(r => r.ok ? r.json() : null),
        ...CINEMATIC_SCENES.map(s =>
          fetch(`${base}/v1/cinematic/scene/${s.id}`, { headers })
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        ),
      ]);

      const brainData = brainRes.status === "fulfilled" ? brainRes.value : null;
      setBrain(brainData);

      const rows = CINEMATIC_SCENES.map((s, i) => {
        const raw = sceneResults[i]?.status === "fulfilled" ? sceneResults[i].value : null;
        const anchors = normAnchors(raw);
        return { ...s, anchors, error: !raw };
      });
      setScenes(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:scem-toggle", toggle);
    return () => window.removeEventListener("jarvis:scem-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const script = await buildScemScript();
      setBrief(script);
      const ttsRes = await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      }
    } catch {
      /* TTS optional */
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const totalAnchors = scenes.reduce((n, s) => n + s.anchors.length, 0);
  const nodes    = brain?.nodes ?? brain?.node_count ?? brain?.total_nodes ?? "—";
  const synapses = brain?.synapses ?? brain?.edge_count ?? brain?.connections ?? "—";

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Scene Intelligence Matrix"
        style={{
          position: "fixed", left: 928960, bottom: 8, zIndex: 624,
          background: open ? CY : "#0D1F2A",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}`,
          borderRadius: 4, padding: "3px 8px",
          fontFamily: MONO, fontSize: 10, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SCEM
      </button>

      {!open ? null : (
        <div style={{
          position: "fixed", top: 60, right: 16, width: 680,
          maxHeight: "calc(100vh - 80px)", overflowY: "auto",
          background: "rgba(6,18,26,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 8, zIndex: 8800,
          fontFamily: SANS, color: "#C8D8E0",
          boxShadow: `0 0 32px ${CY}22`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ fontFamily: MONO, color: CY, fontSize: 12, letterSpacing: 2 }}>
              ◈ SCENE INTELLIGENCE MATRIX
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assess} disabled={assessing} style={{
                background: "none", border: `1px solid ${GR}`, color: GR,
                borderRadius: 4, padding: "2px 8px", fontFamily: MONO, fontSize: 10,
                cursor: assessing ? "not-allowed" : "pointer", opacity: assessing ? 0.5 : 1,
              }}>
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button onClick={load} disabled={loading} style={{
                background: "none", border: `1px solid ${DIM}`, color: "#8A9BA8",
                borderRadius: 4, padding: "2px 8px", fontFamily: MONO, fontSize: 10, cursor: "pointer",
              }}>↻</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#8A9BA8",
                fontSize: 16, cursor: "pointer", padding: "0 4px",
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${CY}11`,
          }}>
            {[
              { label: "SCENES",         val: CINEMATIC_SCENES.length, col: CY },
              { label: "TOTAL ANCHORS",  val: loading ? "…" : totalAnchors, col: AM },
              { label: "BRAIN NODES",    val: loading ? "…" : nodes,    col: GR },
              { label: "SYNAPSES",       val: loading ? "…" : synapses, col: GR },
            ].map(t => (
              <div key={t.label} style={{
                background: "#0A1820", borderRadius: 4, padding: "6px 8px",
                border: `1px solid ${t.col}22`,
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: "#8A9BA8", letterSpacing: 1 }}>{t.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 18, color: t.col, marginTop: 2 }}>{t.val}</div>
              </div>
            ))}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{
              margin: "8px 14px", padding: "8px 10px",
              background: "#061218", border: `1px solid ${GR}22`,
              borderRadius: 4, fontFamily: MONO, fontSize: 10,
              color: GR, lineHeight: 1.6,
            }}>
              {brief}
            </div>
          )}

          {/* Error */}
          {err && (
            <div style={{ margin: "8px 14px", color: "#FF4C4C", fontFamily: MONO, fontSize: 10 }}>
              ⚠ {err}
            </div>
          )}

          {/* Scene grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2,1fr)",
            gap: 8, padding: "10px 14px 14px",
          }}>
            {(scenes.length ? scenes : CINEMATIC_SCENES.map(s => ({ ...s, anchors: [], error: false }))).map((s, idx) => {
              const topAnchor = s.anchors[0] ? anchorTitle(s.anchors[0]) : null;
              const hasData = s.anchors.length > 0;
              return (
                <div key={s.id} style={{
                  background: "#0A1820",
                  border: `1px solid ${hasData ? CY : DIM}33`,
                  borderRadius: 6, padding: "8px 10px",
                  position: "relative",
                }}>
                  {/* Scene number badge */}
                  <span style={{
                    position: "absolute", top: 6, right: 8,
                    fontFamily: MONO, fontSize: 9, color: "#3A5060",
                  }}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  {/* Rail label */}
                  <div style={{
                    fontFamily: MONO, fontSize: 8, color: AM,
                    letterSpacing: 1.5, marginBottom: 3,
                  }}>
                    {s.rail}
                  </div>

                  {/* Scene label */}
                  <div style={{
                    fontFamily: SANS, fontSize: 11, color: hasData ? "#C8D8E0" : "#5A6A74",
                    fontWeight: 600, marginBottom: 4,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    paddingRight: 24,
                  }}>
                    {s.label}
                  </div>

                  {/* Anchor count + top anchor */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 20,
                      color: hasData ? CY : DIM,
                      lineHeight: 1,
                    }}>
                      {loading && !s.anchors.length ? "…" : s.anchors.length}
                    </span>
                    <span style={{
                      fontFamily: MONO, fontSize: 9, color: "#8A9BA8",
                    }}>
                      {s.anchors.length === 1 ? "anchor" : "anchors"}
                    </span>
                  </div>

                  {topAnchor && (
                    <div style={{
                      fontFamily: MONO, fontSize: 9, color: GR,
                      marginTop: 4, whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      ↳ {topAnchor}
                    </div>
                  )}

                  {s.error && (
                    <div style={{ fontFamily: MONO, fontSize: 9, color: "#FF4C4C", marginTop: 3 }}>
                      endpoint unreachable
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer refresh note */}
          <div style={{
            padding: "4px 14px 8px", fontFamily: MONO, fontSize: 9, color: "#3A5060",
          }}>
            auto-refresh every {POLL_MS / 1000}s · /v1/cinematic/scene/* + /v1/cinematic/brain
          </div>
        </div>
      )}
    </>
  );
}
