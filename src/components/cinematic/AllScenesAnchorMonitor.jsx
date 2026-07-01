/**
 * AllScenesAnchorMonitor — F60
 * Polls all 10 /v1/cinematic/scene/{id} endpoints in parallel every 60 s.
 * Shows real anchor data per scene in a unified feed.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene-health brief + TTS.
 *
 * Voice: "scene anchors" | "anchor monitor" | "all scene data" | "sacm" | "scene anchor feed"
 * Event: jarvis:sacm-toggle
 * Button: ◈ SACM at bottom:8 left:12700
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const OR  = "#FF8C00";
const GLD = "#FFD700";
const DIM = "#4A6070";

const POLL_MS  = 60_000;
const BTN_LEFT = 12700;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── regex for voice matching ─────────────────────────────────────────────────

const SACM_RE =
  /\b(scene[\s-]?anchor|anchor[\s-]?monitor|all[\s-]?scene[\s-]?data|sacm|scene[\s-]?anchor[\s-]?feed|scene[\s-]?data[\s-]?feed|anchor[\s-]?feed)\b/i;

export function isSceneAnchorMonitorQuery(text) {
  return SACM_RE.test(text || "");
}

// ── helpers ──────────────────────────────────────────────────────────────────

function extractAnchors(d) {
  if (Array.isArray(d?.anchors)) return d.anchors;
  if (Array.isArray(d?.data?.anchors)) return d.data.anchors;
  if (d?.anchors && typeof d.anchors === "object") {
    return Object.entries(d.anchors).map(([key, value]) => ({ key, value }));
  }
  if (d?.data && typeof d.data === "object" && !Array.isArray(d.data)) {
    return Object.entries(d.data)
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([key, value]) => ({ key, value }));
  }
  return [];
}

function fmt(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "YES" : "NO";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

// ── fetch all scenes ─────────────────────────────────────────────────────────

async function fetchScene(scene) {
  try {
    const r = await fetch(`${apiBase()}/v1/cinematic/scene/${scene.id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return { scene, anchors: [], ok: false };
    const d = await r.json();
    return { scene, anchors: extractAnchors(d), ok: true };
  } catch (_) {
    return { scene, anchors: [], ok: false };
  }
}

async function fetchAll() {
  const results = await Promise.all(CINEMATIC_SCENES.map(fetchScene));
  return results;
}

// ── TTS brief ─────────────────────────────────────────────────────────────────

export async function buildSceneAnchorMonitorScript() {
  try {
    const results = await fetchAll();
    const total = results.reduce((s, r) => s + r.anchors.length, 0);
    const populated = results.filter((r) => r.anchors.length > 0).length;
    const down = results.filter((r) => !r.ok).length;
    if (total === 0) {
      return "Scene anchor monitor is online, sir. All ten scenes are being polled but anchor data is not yet available — the backend may still be warming up.";
    }
    const top = results
      .filter((r) => r.anchors.length > 0)
      .sort((a, b) => b.anchors.length - a.anchors.length)
      .slice(0, 3)
      .map((r) => `${r.scene.label} (${r.anchors.length} anchors)`)
      .join(", ");
    return (
      `Scene anchor monitor: ${total} live anchors across ${populated} of 10 scenes. ` +
      (down > 0 ? `${down} scene${down > 1 ? "s" : ""} unreachable. ` : "") +
      `Most anchors: ${top}. Displaying full scene anchor feed now, sir.`
    );
  } catch (_) {
    return "Scene anchor monitor is online. Opening the panel now, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AllScenesAnchorMonitor() {
  const [open, setOpen]           = useState(false);
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const [lastFetch, setLastFetch] = useState(null);
  const [expanded, setExpanded]   = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll();
      setResults(data);
      setLastFetch(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !lastFetch) refresh();
  }, [open, lastFetch, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:sacm-toggle", h);
    return () => window.removeEventListener("jarvis:sacm-toggle", h);
  }, []);

  const totalAnchors = results.reduce((s, r) => s + r.anchors.length, 0);
  const downCount    = results.filter((r) => !r.ok).length;

  const assess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const total = totalAnchors;
      const populated = results.filter((r) => r.anchors.length > 0).length;
      const down = results.filter((r) => !r.ok).length;
      const top = results
        .filter((r) => r.anchors.length > 0)
        .sort((a, b) => b.anchors.length - a.anchors.length)
        .slice(0, 5)
        .map((r) => `${r.scene.label}: ${r.anchors.slice(0, 3).map((a) => `${a.key}=${fmt(a.value)}`).join(", ")}`)
        .join("; ");

      const prompt =
        `You are JARVIS. In 2 sentences, assess the operational health of the scene anchor feed. ` +
        `Total anchors: ${total}. Scenes reporting: ${populated}/10. Unreachable: ${down}. ` +
        `Top scene data: ${top || "none available"}. Be concise and speak directly to the operator.`;

      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || d?.text || d?.reply || "Assessment unavailable.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setAssessment("Scene anchor assessment unavailable.");
    }
    setAssessing(false);
  }, [results, totalAnchors]);

  return (
    <>
      {/* Bottom-strip toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="All-Scenes Anchor Monitor (F60)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ◈ SACM
        {totalAnchors > 0 && (
          <span style={{ marginLeft: 4, color: GRN, fontWeight: "bold" }}>
            {totalAnchors}
          </span>
        )}
        {downCount > 0 && (
          <span style={{ marginLeft: 4, color: OR, fontWeight: "bold" }}>
            !{downCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 380,
          width: "min(480px, 92vw)",
          maxHeight: "72vh",
          display: "flex", flexDirection: "column",
          background: "rgba(8,12,20,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 60px ${CY}14`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 69,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ◈ SCENE ANCHOR MONITOR
            </span>
            <span style={{
              marginLeft: "auto", fontSize: 9, color: DIM,
              border: `1px solid ${CY}22`, borderRadius: 4, padding: "1px 6px",
            }}>
              {totalAnchors} anchors / 10 scenes
            </span>
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                background: "transparent", border: `1px solid ${CY}33`, color: CY,
                borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "…" : "↺"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none", color: DIM,
                fontSize: 12, cursor: "pointer", padding: "0 2px",
              }}
            >✕</button>
          </div>

          {/* Stat strip */}
          {results.length > 0 && (
            <div style={{
              display: "flex", gap: 6, padding: "8px 14px 0",
              flexShrink: 0,
            }}>
              {[
                { label: "SCENES",  val: `${results.filter((r) => r.ok).length}/10`, col: GRN },
                { label: "ANCHORS", val: totalAnchors,                                col: CY  },
                { label: "DOWN",    val: downCount,                                   col: downCount > 0 ? OR : DIM },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  flex: 1, padding: "6px 8px", background: `${col}0A`,
                  border: `1px solid ${col}33`, borderRadius: 6, textAlign: "center",
                }}>
                  <div style={{ fontSize: 8, color: DIM, letterSpacing: 1.5 }}>{label}</div>
                  <div style={{ fontSize: 13, color: col, fontWeight: "bold", marginTop: 2 }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Assess button */}
          <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
            <button
              onClick={assess}
              disabled={assessing || loading || results.length === 0}
              style={{
                width: "100%", background: `${CY}11`,
                border: `1px solid ${CY}44`, borderRadius: 6,
                color: CY, fontSize: 10, padding: "6px 0", cursor: "pointer",
                letterSpacing: 1, opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▸ JARVIS ASSESSING…" : "▶ JARVIS ASSESS SCENE HEALTH"}
            </button>
          </div>

          {/* Assessment text */}
          {assessment && (
            <div style={{
              margin: "8px 14px 0",
              padding: "8px 10px",
              background: `${CY}08`,
              border: `1px solid ${CY}22`,
              borderRadius: 6,
              fontSize: 10,
              color: "#DCEBF5",
              lineHeight: 1.5,
              flexShrink: 0,
            }}>
              {assessment}
            </div>
          )}

          {/* Scene list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px 12px" }}>
            {loading && !results.length ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 20 }}>
                polling all scenes…
              </div>
            ) : results.length === 0 ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 20 }}>
                no data yet
              </div>
            ) : (
              results.map((r, idx) => {
                const isExp = expanded === r.scene.id;
                const statusCol = !r.ok ? OR : r.anchors.length === 0 ? GLD : GRN;
                return (
                  <div
                    key={r.scene.id}
                    style={{
                      borderBottom: idx < results.length - 1 ? `1px solid ${CY}0F` : "none",
                      paddingBottom: 8, marginBottom: 8,
                    }}
                  >
                    {/* Scene header row */}
                    <div
                      onClick={() => setExpanded(isExp ? null : r.scene.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        cursor: "pointer",
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: statusCol, flexShrink: 0,
                        boxShadow: `0 0 6px ${statusCol}88`,
                      }} />
                      <span style={{ fontSize: 8, color: DIM, letterSpacing: 1, flexShrink: 0, width: 20 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span style={{
                        fontSize: 10, color: "#DCEBF5", fontWeight: "bold",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        flex: 1,
                      }}>
                        {r.scene.label}
                      </span>
                      <span style={{
                        fontSize: 8, color: statusCol,
                        border: `1px solid ${statusCol}44`, borderRadius: 4,
                        padding: "1px 5px", flexShrink: 0,
                      }}>
                        {!r.ok ? "UNREACHABLE" : r.anchors.length === 0 ? "NO DATA" : `${r.anchors.length} ANCHORS`}
                      </span>
                      <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
                        {isExp ? "▲" : "▼"}
                      </span>
                    </div>

                    {/* Expanded anchor list */}
                    {isExp && r.anchors.length > 0 && (
                      <div style={{
                        marginTop: 6, paddingLeft: 22,
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        gap: "3px 10px",
                      }}>
                        {r.anchors.map((a, ai) => (
                          <div key={ai} style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                            <span style={{
                              fontSize: 8, color: CY,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              maxWidth: "45%",
                            }}>
                              {a.key || `field_${ai}`}
                            </span>
                            <span style={{ fontSize: 8, color: DIM }}>→</span>
                            <span style={{
                              fontSize: 8, color: "#DCEBF5",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>
                              {fmt(a.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {isExp && r.anchors.length === 0 && (
                      <div style={{
                        marginTop: 4, paddingLeft: 22,
                        fontSize: 8, color: DIM,
                      }}>
                        {r.ok ? "scene returned no anchor fields" : "endpoint unreachable"}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {lastFetch && (
            <div style={{
              padding: "5px 14px 8px", fontSize: 9, color: DIM,
              borderTop: `1px solid ${CY}11`, flexShrink: 0,
            }}>
              updated {lastFetch.toLocaleTimeString()} · auto-refresh 60s
            </div>
          )}
        </div>
      )}
    </>
  );
}
