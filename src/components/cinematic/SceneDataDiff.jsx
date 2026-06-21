/**
 * SceneDataDiff — F51
 * Polls all 10 /v1/cinematic/scene/{id} endpoints every 90 s,
 * diffs anchor values against the previous snapshot, and surfaces a
 * live change-feed showing exactly which anchor keys shifted and by how much.
 *
 * Background polling accumulates diffs even while the panel is closed; the
 * unread badge on the toggle button clears when the user opens the panel.
 * If ≥ 3 anchors change in a single cycle JARVIS announces a brief via
 * jarvis:speak-dossier so the notification reaches the user hands-free.
 *
 * Toggle: △ DIFF at left:5200 bottom strip.
 * Event:  jarvis:scene-diff-toggle
 * Voice:  "scene diff" | "scene changes" | "anchor changes" | "what changed"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GN  = "#39FF14";
const AM  = "#F5A623";
const RD  = "#FF4444";
const DIM = "#4A6070";
const BG  = "rgba(3,5,9,0.97)";
const POLL   = 90_000;
const MAX_LOG = 80;

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
  "01_command_atrium":          "Command Atrium",
  "02_ai_core_chamber":         "AI Core",
  "03_world_control_room":      "World Control",
  "04_intelligence_graph_space":"Intel Graph",
  "05_operations_war_room":     "Ops War Room",
  "06_data_fusion_reactor":     "Data Fusion",
  "07_document_intelligence_vault": "Doc Vault",
  "08_simulation_theatre":      "Sim Theatre",
  "09_analytics_observatory":   "Analytics",
  "10_system_security_core":    "Security Core",
};

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DIFF_RE =
  /\b(scene[\s-]?diff|scene[\s-]?change|anchor[\s-]?change|what[\s-]?changed|scene[\s-]?update|scene[\s-]?delta|data[\s-]?drift)\b/i;

export function isSceneDataDiffQuery(t) {
  return DIFF_RE.test(t || "");
}

async function fetchScene(id) {
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${id}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function fetchAllScenes() {
  const results = await Promise.allSettled(SCENE_IDS.map(fetchScene));
  const scenes = {};
  results.forEach((res, i) => {
    if (res.status === "fulfilled" && res.value) scenes[SCENE_IDS[i]] = res.value;
  });
  return scenes;
}

function flattenAnchors(sceneData) {
  const anchors = {};
  const raw = sceneData?.anchors ?? sceneData?.data?.anchors ?? sceneData;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v !== "object" || v === null) {
        anchors[k] = String(v);
      } else if (Array.isArray(v)) {
        anchors[k] = `[${v.length} items]`;
      } else {
        anchors[k] = JSON.stringify(v).slice(0, 60);
      }
    }
  }
  return anchors;
}

function computeDiff(prev, curr) {
  const changes = [];
  const now = new Date().toLocaleTimeString();
  for (const sceneId of SCENE_IDS) {
    const prevAnchors = prev[sceneId] ? flattenAnchors(prev[sceneId]) : {};
    const currScene   = curr[sceneId];
    if (!currScene) continue;
    const currAnchors = flattenAnchors(currScene);

    for (const [k, v] of Object.entries(currAnchors)) {
      if (prevAnchors[k] !== v) {
        changes.push({
          sceneId,
          scene: SCENE_LABELS[sceneId] ?? sceneId,
          key: k,
          prev: prevAnchors[k] ?? "(new)",
          curr: v,
          ts: now,
        });
      }
    }
    for (const k of Object.keys(prevAnchors)) {
      if (!(k in currAnchors)) {
        changes.push({
          sceneId,
          scene: SCENE_LABELS[sceneId] ?? sceneId,
          key: k,
          prev: prevAnchors[k],
          curr: "(removed)",
          ts: now,
        });
      }
    }
  }
  return changes;
}

export async function buildSceneDataDiffScript() {
  try {
    const scenes = await fetchAllScenes();
    const live   = Object.keys(scenes).length;
    const total  = Object.values(scenes).reduce(
      (n, s) => n + Object.keys(flattenAnchors(s)).length, 0
    );
    return (
      `Scene data snapshot acquired, sir. ${live} of 10 cinematic scenes are live, ` +
      `exposing ${total} tracked anchor data points across the cinematic layer. ` +
      `The diff panel will flag any anchor that changes value between polling cycles.`
    );
  } catch (_) {
    return "Unable to snapshot the cinematic scene data at this time, sir.";
  }
}

export default function SceneDataDiff() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [changeLog,  setChangeLog]  = useState([]);
  const [liveScenes, setLiveScenes] = useState(0);
  const [badge,      setBadge]      = useState(0);
  const prevRef  = useRef(null);
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    setLoading(true);
    try {
      const curr = await fetchAllScenes();
      setLiveScenes(Object.keys(curr).length);
      if (prevRef.current !== null) {
        const diff = computeDiff(prevRef.current, curr);
        if (diff.length > 0) {
          setChangeLog(prev => [...diff, ...prev].slice(0, MAX_LOG));
          setBadge(prev => prev + diff.length);
          if (diff.length >= 3) {
            const scenes = [...new Set(diff.map(d => d.scene))];
            const msg =
              `${diff.length} anchor value${diff.length !== 1 ? "s" : ""} changed across ` +
              `${scenes.length} scene${scenes.length !== 1 ? "s" : ""}: ${scenes.join(", ")}.`;
            window.dispatchEvent(
              new CustomEvent("jarvis:speak-dossier", { detail: { text: msg } })
            );
          }
        }
      }
      prevRef.current = curr;
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:scene-diff-toggle", handler);
    return () => window.removeEventListener("jarvis:scene-diff-toggle", handler);
  }, []);

  useEffect(() => {
    poll();
    timerRef.current = setInterval(poll, POLL);
    return () => clearInterval(timerRef.current);
  }, [poll]);

  useEffect(() => { if (open) setBadge(0); }, [open]);

  const hasNew  = changeLog.some(c => c.prev === "(new)");
  const hasGone = changeLog.some(c => c.curr === "(removed)");
  const accent  = hasGone ? RD : hasNew ? GN : CY;

  return (
    <>
      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: 560, maxHeight: "calc(100vh - 100px)",
          background: BG, border: `1px solid ${CY}33`, borderRadius: 10,
          zIndex: 72, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 40px ${CY}15`, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: CY, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
                △ SCENE ANCHOR DIFF
              </span>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}
              >✕</button>
            </div>
            <div style={{ color: DIM, fontSize: 7, marginTop: 2, letterSpacing: 0.5 }}>
              /v1/cinematic/scene/&#123;id&#125; × 10 — 90 s polling · {liveScenes}/10 scenes live
              {loading && <span style={{ color: CY, marginLeft: 8 }}>◌</span>}
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {error && (
              <div style={{ color: RD, fontSize: 8, padding: "4px 0" }}>{error}</div>
            )}
            {changeLog.length === 0 ? (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 30 }}>
                {prevRef.current !== null
                  ? "No anchor changes detected yet — watching for drift…"
                  : "Initialising scene snapshot…"}
              </div>
            ) : (
              changeLog.map((c, i) => {
                const isNew  = c.prev === "(new)";
                const isGone = c.curr === "(removed)";
                const col    = isGone ? RD : isNew ? GN : AM;
                const sym    = isGone ? "−" : isNew ? "+" : "~";
                return (
                  <div key={i} style={{
                    display: "flex", gap: 8, padding: "5px 0",
                    borderBottom: `1px solid ${DIM}18`, alignItems: "flex-start",
                  }}>
                    <span style={{ color: col, fontSize: 10, width: 10, flexShrink: 0, marginTop: 1 }}>
                      {sym}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ color: CY, fontSize: 7, letterSpacing: 1 }}>{c.scene}</span>
                        <span style={{ color: DIM, fontSize: 7 }}>·</span>
                        <span style={{ color: "#DCEBF5", fontSize: 8 }}>{c.key}</span>
                        <span style={{ color: DIM, fontSize: 6, marginLeft: "auto" }}>{c.ts}</span>
                      </div>
                      <div style={{ fontSize: 7, display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{
                          color: DIM, textDecoration: "line-through",
                          maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{c.prev}</span>
                        <span style={{ color: DIM }}>→</span>
                        <span style={{
                          color: col,
                          maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>{c.curr}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 14px", borderTop: `1px solid ${CY}11`,
            flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
              {changeLog.length} change{changeLog.length !== 1 ? "s" : ""} logged (max {MAX_LOG})
            </span>
            {changeLog.length > 0 && (
              <button
                onClick={() => setChangeLog([])}
                style={{
                  background: "none", border: `1px solid ${DIM}44`, color: DIM,
                  fontSize: 6, padding: "1px 6px", borderRadius: 3, cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: 1,
                }}
              >CLEAR</button>
            )}
          </div>
        </div>
      )}

      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Scene Anchor Diff — live change tracker"
        style={{
          position: "fixed", left: 5200, bottom: 18, zIndex: 68,
          background: open ? accent : "rgba(5,8,13,0.75)",
          color: open ? "#030509" : accent,
          border: `1px solid ${accent}`,
          borderRadius: 6, padding: "3px 8px",
          fontSize: 8, fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1.5, cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: open ? `0 0 12px ${accent}` : "none",
          animation: !open && badge > 0 ? "sddrift 1.5s ease-in-out infinite" : "none",
        }}
      >
        △ DIFF
        {badge > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#030509",
            borderRadius: 8, fontSize: 7, padding: "0 4px", fontWeight: 700,
          }}>{badge}</span>
        )}
      </button>

      <style>{`
        @keyframes sddrift {
          0%, 100% { box-shadow: 0 0 4px ${AM}; }
          50%       { box-shadow: 0 0 16px ${AM}; }
        }
      `}</style>
    </>
  );
}
