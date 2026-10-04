/**
 * F81 – Scene × RiskSignal × Task Active Threat Pinboard (ATPIN)
 * Correlates each of the 10 cinematic scenes with active risk signals AND tasks.
 * Classifies each scene by threat posture:
 *   CRITICAL_SCENE – matched by ≥1 critical/high risk signal AND ≥1 blocked/in-progress task
 *   RISK_ACTIVE    – risk signals present, no matching task coverage
 *   TASK_ACTIVE    – tasks present, no matching risk signal
 *   CLEAR          – no risk or task correlation for this scene
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 962200;
const Z          = 663;
const REFRESH_MS = 90_000;

const CY   = "#29E7FF";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const PU   = "#B57BFF";
const GR   = "#00c878";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const SCENE_IDS = [
  "01_command_atrium", "02_intel_nexus", "03_threat_matrix",
  "04_operations_hub", "05_deep_analysis", "06_global_network",
  "07_mission_control", "08_data_forge", "09_risk_observatory", "10_apex_command",
];

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function kw(item) {
  return [
    item.name, item.title, item.description,
    item.subject, item.topic, item.category,
    item.type, item.kind, item.tags, item.label,
    item.summary, item.notes, item.anchors,
    item.scene_id, item.id,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function overlap(a, b) {
  const wa = a.split(/\W+/).filter(w => w.length > 3);
  const wb = new Set(b.split(/\W+/).filter(w => w.length > 3));
  return wa.filter(w => wb.has(w)).length;
}

function sceneDisplayName(id) {
  return id.replace(/^\d+_/, "").replace(/_/g, " ").toUpperCase();
}

function classifyScene(scene, riskSignals, tasks) {
  const sk = kw(scene);

  const matchedRisks = riskSignals.filter(r => overlap(sk, kw(r)) >= 1);
  const matchedTasks = tasks.filter(t => overlap(sk, kw(t)) >= 1);

  const hasCriticalRisk = matchedRisks.some(r =>
    ["critical", "high"].includes((r.severity || r.level || "").toLowerCase())
  );
  const hasActiveTask = matchedTasks.some(t =>
    ["in_progress", "blocked", "pending"].includes((t.status || "").toLowerCase())
  );

  let cls;
  if (hasCriticalRisk && hasActiveTask)   cls = "CRITICAL_SCENE";
  else if (matchedRisks.length > 0)       cls = "RISK_ACTIVE";
  else if (matchedTasks.length > 0)       cls = "TASK_ACTIVE";
  else                                    cls = "CLEAR";

  return {
    id:    scene.scene_id || scene.id || scene.name || Math.random().toString(36).slice(2),
    scene,
    cls,
    matchedRisks: matchedRisks.slice(0, 5).map(r => ({
      name:     r.name || r.title || r.description || "?",
      severity: r.severity || r.level || "?",
      score:    overlap(sk, kw(r)),
    })),
    matchedTasks: matchedTasks.slice(0, 5).map(t => ({
      name:   t.name || t.title || t.description || "?",
      status: t.status || "?",
      score:  overlap(sk, kw(t)),
    })),
  };
}

async function loadAll(base) {
  const scenePromises = SCENE_IDS.map(id =>
    fetch(`${base}/v1/cinematic/scene/${id}`, { headers: authHdr() })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  );
  const [sceneResults, riskRes, taskRes] = await Promise.allSettled([
    Promise.all(scenePromises),
    fetch(`${base}/entities/RiskSignal`, { headers: authHdr() }),
    fetch(`${base}/entities/Task`,       { headers: authHdr() }),
  ]);

  const rawScenes = sceneResults.status === "fulfilled" ? sceneResults.value : [];
  const scenes = rawScenes
    .map((d, i) => d ? { ...d, scene_id: SCENE_IDS[i] } : { scene_id: SCENE_IDS[i], name: sceneDisplayName(SCENE_IDS[i]) })
    .filter(Boolean);

  const safe = async (r) => {
    if (r.status !== "fulfilled") return [];
    const resp = r.value;
    if (!resp.ok) return [];
    const d = await resp.json();
    return Array.isArray(d) ? d : (d.items || d.results || d.data || []);
  };
  const [riskSignals, tasks] = await Promise.all([safe(riskRes), safe(taskRes)]);
  return { scenes, riskSignals, tasks };
}

/* ── exported voice helpers ─────────────────────────────────────── */
export function isAtpinQuery(q) {
  const lq = q.toLowerCase();
  return (
    lq.includes("atpin") ||
    lq.includes("active threat") ||
    lq.includes("scene threat") ||
    lq.includes("threat pinboard") ||
    lq.includes("scene risk") ||
    lq.includes("scene task") ||
    lq.includes("threat scene") ||
    lq.includes("pinboard")
  );
}

export async function buildAtpinScript() {
  try {
    const base = apiBase();
    const { scenes, riskSignals, tasks } = await loadAll(base);
    const rows = scenes.map(s => classifyScene(s, riskSignals, tasks));
    const critical   = rows.filter(r => r.cls === "CRITICAL_SCENE").length;
    const riskActive = rows.filter(r => r.cls === "RISK_ACTIVE").length;
    const taskActive = rows.filter(r => r.cls === "TASK_ACTIVE").length;
    const clear      = rows.filter(r => r.cls === "CLEAR").length;
    const critNames  = rows
      .filter(r => r.cls === "CRITICAL_SCENE")
      .map(r => sceneDisplayName(r.id))
      .slice(0, 3)
      .join(", ");
    return (
      `Scene active threat pinboard analysis complete. ` +
      `${scenes.length} scenes evaluated against ${riskSignals.length} risk signals and ${tasks.length} tasks. ` +
      `${critical} scenes are in a critical posture — both an active risk signal and a blocking task are present.` +
      (critNames ? ` Critical scenes: ${critNames}.` : "") +
      ` ${riskActive} scenes have active risk signals with no task coverage — blind spots requiring immediate tasking. ` +
      `${taskActive} scenes have active tasks but no correlated risk signal — orphaned work items. ` +
      `${clear} scenes are clear. ` +
      (critical > 0
        ? `Recommend immediate triage of all critical scenes and assignment of response tasks.`
        : `No critical scene posture detected at this time, sir.`)
    );
  } catch {
    return "Unable to retrieve scene threat pinboard data at this time, sir.";
  }
}

/* ── component ──────────────────────────────────────────────────── */
export default function SceneActiveThreatPinboard() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const { scenes, riskSignals, tasks } = await loadAll(base);
      setRows(scenes.map(s => classifyScene(s, riskSignals, tasks)));
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => {
      if (!o) load();
      return !o;
    });
    window.addEventListener("jarvis:atpin-toggle", onToggle);
    return () => window.removeEventListener("jarvis:atpin-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildAtpinScript();
      const voice  = getActiveVoice();
      const base   = apiBase();
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ text: script, voice }),
      });
      await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHdr() },
        body: JSON.stringify({ message: script }),
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const critical   = rows.filter(r => r.cls === "CRITICAL_SCENE").length;
  const riskActive = rows.filter(r => r.cls === "RISK_ACTIVE").length;
  const taskActive = rows.filter(r => r.cls === "TASK_ACTIVE").length;
  const clear      = rows.filter(r => r.cls === "CLEAR").length;

  const CLS_ORDER = ["ALL", "CRITICAL_SCENE", "RISK_ACTIVE", "TASK_ACTIVE", "CLEAR"];
  const CLS_LABEL = {
    ALL: "ALL", CRITICAL_SCENE: "CRITICAL", RISK_ACTIVE: "RISK ACTIVE",
    TASK_ACTIVE: "TASK ACTIVE", CLEAR: "CLEAR",
  };
  const CLS_CLR = {
    CRITICAL_SCENE: RD, RISK_ACTIVE: AM, TASK_ACTIVE: PU, CLEAR: GR,
  };

  const visible = rows
    .filter(r => filter === "ALL" || r.cls === filter)
    .filter(r => {
      if (!search) return true;
      const lq = search.toLowerCase();
      return sceneDisplayName(r.id).toLowerCase().includes(lq) ||
        r.id.toLowerCase().includes(lq);
    });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Scene Active Threat Pinboard (ATPIN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${CY}66`,
          color: CY, fontFamily: MONO, fontSize: 11, padding: "4px 10px",
          borderRadius: 4, cursor: "pointer", letterSpacing: 1,
          boxShadow: critical > 0 ? `0 0 10px ${RD}44` : "none",
        }}
      >
        {critical > 0
          ? <span style={{ color: RD, animation: "atpin-pulse 1.4s ease-in-out infinite" }}>◈</span>
          : "◈"} ATPIN
        <style>{`@keyframes atpin-pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: Z + 10, width: "min(880px,95vw)", maxHeight: "82vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 12, display: "flex", flexDirection: "column",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${RD}22`,
      fontFamily: SANS, color: "#DCEBF5",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
        borderBottom: `1px solid ${CY}22`,
      }}>
        <span style={{ color: CY, fontFamily: MONO, fontSize: 13, letterSpacing: 2 }}>◈ ATPIN</span>
        <span style={{ color: "#6E8AA0", fontSize: 11, flex: 1 }}>
          Scene × RiskSignal × Task — Active Threat Pinboard
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>loading…</span>}
        <button onClick={assess} disabled={assessing} style={{
          background: "transparent", border: `1px solid ${GR}66`, color: GR,
          fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
        }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: "transparent", border: "none", color: "#6E8AA0",
          fontSize: 18, cursor: "pointer", lineHeight: 1,
        }}>×</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        {[
          ["SCENES",      rows.length,  CY],
          ["CRITICAL",    critical,     RD],
          ["RISK ACTIVE", riskActive,   AM],
          ["TASK ACTIVE", taskActive,   PU],
          ["CLEAR",       clear,        GR],
        ].map(([lbl, val, clr]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${clr}44`,
            borderRadius: 6, padding: "6px 14px", minWidth: 90, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontFamily: MONO, color: clr, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1, marginTop: 2 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {CLS_ORDER.map(cls => (
          <button key={cls} onClick={() => setFilter(cls)} style={{
            background: filter === cls ? `${CLS_CLR[cls] || CY}22` : "transparent",
            border: `1px solid ${filter === cls ? (CLS_CLR[cls] || CY) : DIM}`,
            color: filter === cls ? (CLS_CLR[cls] || CY) : "#6E8AA0",
            fontFamily: MONO, fontSize: 10, padding: "3px 10px", borderRadius: 4, cursor: "pointer",
          }}>
            {CLS_LABEL[cls]}
          </button>
        ))}
        <input
          placeholder="search scenes…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${DIM}`,
            color: "#DCEBF5", fontFamily: MONO, fontSize: 11,
            padding: "4px 10px", borderRadius: 4, marginLeft: "auto", width: 180,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 16px 12px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#6E8AA0", fontFamily: MONO, fontSize: 12, padding: "16px 0" }}>
            {loading ? "Loading…" : "No scenes match current filter."}
          </div>
        )}
        {visible.map(row => {
          const clr  = CLS_CLR[row.cls] || CY;
          const isExp = expanded === row.id;
          const displayName = sceneDisplayName(row.id);
          return (
            <div key={row.id} style={{ borderBottom: `1px solid ${CY}11`, padding: "8px 0" }}>
              <div
                onClick={() => setExpanded(isExp ? null : row.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                  background: row.cls === "CRITICAL_SCENE" ? `${RD}0a` : "transparent",
                  borderRadius: 4, padding: "4px 6px",
                }}
              >
                {row.cls === "CRITICAL_SCENE" && (
                  <span style={{
                    color: RD, fontSize: 9, fontFamily: MONO,
                    animation: "atpin-pulse 1.4s ease-in-out infinite",
                  }}>●</span>
                )}
                <span style={{
                  flex: 1, fontSize: 12, color: "#DCEBF5", fontFamily: MONO,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {displayName}
                </span>
                <span style={{ fontSize: 9, fontFamily: MONO, color: "#6E8AA0" }}>
                  {row.matchedRisks.length}R · {row.matchedTasks.length}T
                </span>
                <span style={{
                  fontSize: 9, fontFamily: MONO, color: clr, padding: "1px 8px",
                  border: `1px solid ${clr}44`, borderRadius: 3, minWidth: 92, textAlign: "center",
                }}>
                  {CLS_LABEL[row.cls]}
                </span>
                <span style={{ color: CY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{
                  display: "flex", gap: 12, padding: "8px 14px",
                  background: "rgba(0,0,0,0.2)", borderRadius: 6, margin: "4px 0",
                }}>
                  {/* risk signals */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: RD, fontFamily: MONO, marginBottom: 6, letterSpacing: 1 }}>
                      RISK SIGNALS ({row.matchedRisks.length})
                    </div>
                    {row.matchedRisks.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>none matched</div>
                    )}
                    {row.matchedRisks.map((r, i) => (
                      <div key={i} style={{ marginBottom: 5 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          fontSize: 11, color: "#DCEBF5", marginBottom: 2,
                        }}>
                          <span style={{
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                          }}>{r.name}</span>
                          <span style={{
                            fontSize: 9, color: RD, fontFamily: MONO, marginLeft: 6,
                            border: `1px solid ${RD}44`, borderRadius: 2, padding: "0 4px",
                          }}>{r.severity}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: DIM, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: RD,
                            width: `${Math.min(100, r.score * 20)}%`,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* tasks */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: PU, fontFamily: MONO, marginBottom: 6, letterSpacing: 1 }}>
                      TASKS ({row.matchedTasks.length})
                    </div>
                    {row.matchedTasks.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>none matched</div>
                    )}
                    {row.matchedTasks.map((t, i) => (
                      <div key={i} style={{ marginBottom: 5 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between",
                          fontSize: 11, color: "#DCEBF5", marginBottom: 2,
                        }}>
                          <span style={{
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                          }}>{t.name}</span>
                          <span style={{
                            fontSize: 9, color: PU, fontFamily: MONO, marginLeft: 6,
                            border: `1px solid ${PU}44`, borderRadius: 2, padding: "0 4px",
                          }}>{t.status}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: DIM, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 2, background: PU,
                            width: `${Math.min(100, t.score * 20)}%`,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
