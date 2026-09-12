/**
 * SceneRiskCoverageMap — F32.
 *
 * Parallel-fetches all 10 /v1/cinematic/scene/{id} anchor sets and
 * /entities/RiskSignal, then keyword-correlates each risk signal against
 * every scene's anchor texts to determine whether the risk is "CAPTURED"
 * (its keywords appear in at least one scene anchor) or "DARK" (no scene
 * represents it visually).
 *
 * Stat tiles: scenes / risks / captured / dark
 * Filter tabs: ALL / CAPTURED / DARK
 * Per-risk card shows severity, matched scene(s), and ASSESS button.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scene-risk alignment brief
 *   + TTS via jarvis:speak-dossier.
 * 120 s auto-refresh.
 *
 * Intent: "scene risk" / "risk scenes" / "dark risks" / "uncaptured risks" /
 *         "scene risk coverage" / "scrisk"
 *   → jarvis:scrisk-toggle + TTS brief via buildScriskScript()
 *
 * Toggle: ◈ SCRISK at left:8604, bottom:8, zIndex:65. Red badge on dark count.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const VIOLET = "#A78BFA";
const BTN_LEFT   = 8604;
const REFRESH_MS = 120_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

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

const SCENE_SHORT = {
  "01_command_atrium":              "CMD",
  "02_ai_core_chamber":            "AIC",
  "03_world_control_room":         "WCR",
  "04_intelligence_graph_space":   "IGS",
  "05_operations_war_room":        "OWR",
  "06_data_fusion_reactor":        "DFR",
  "07_document_intelligence_vault":"DIV",
  "08_simulation_theatre":         "SIM",
  "09_analytics_observatory":      "ANO",
  "10_system_security_core":       "SSC",
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function extractAnchorText(scene) {
  const anchors =
    scene?.anchors ?? scene?.anchor_data ?? scene?.nodes ??
    scene?.components ?? scene?.data?.anchors ?? [];
  const parts = [scene?.title || "", scene?.description || ""];
  for (const a of normaliseArray(anchors)) {
    parts.push(
      a.label ?? a.name ?? a.title ?? "",
      a.description ?? a.summary ?? a.text ?? "",
      a.type ?? "",
    );
  }
  return parts.join(" ");
}

function getRiskName(r) {
  return r.title || r.name || r.signal_name || r.label || `Risk #${r.id || "?"}`;
}

function getRiskDesc(r) {
  return r.description || r.summary || r.details || "";
}

function getRiskSeverity(r) {
  const v = r.severity ?? r.level ?? r.score ?? 0;
  if (typeof v === "number") return v;
  if (v === "critical") return 90;
  if (v === "high")     return 70;
  if (v === "medium")   return 50;
  return 20;
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length;
}

function matchedScenes(risk, sceneTexts) {
  const rWords = keywords(`${getRiskName(risk)} ${getRiskDesc(risk)} ${risk.type || ""}`);
  return sceneTexts.filter(({ text }) => overlap(rWords, keywords(text)) >= 1);
}

function sevColor(sev) {
  if (sev >= 90) return RED;
  if (sev >= 70) return AMBER;
  if (sev >= 40) return CY;
  return "#445566";
}

function sevLabel(sev) {
  if (sev >= 90) return "CRITICAL";
  if (sev >= 70) return "HIGH";
  if (sev >= 40) return "MEDIUM";
  return "LOW";
}

const authHeaders = { Authorization: `Bearer ${API_KEY}` };

async function fetchScene(id) {
  const r = await fetch(`${apiBase()}/v1/cinematic/scene/${id}`, { headers: authHeaders });
  return r.json();
}

async function fetchRisks() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: authHeaders });
  return r.json();
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const SCRISK_RE =
  /scene.{0,15}risk|risk.{0,15}scene|dark.{0,10}risk|uncaptured.{0,10}risk|scene.{0,15}coverage.{0,15}risk|risk.{0,15}coverage.{0,15}scene|\bscrisk\b/i;

export function isScriskQuery(q) {
  return SCRISK_RE.test(q || "");
}

export async function buildScriskScript() {
  try {
    const [sceneResults, riskRaw] = await Promise.all([
      Promise.allSettled(SCENE_IDS.map(fetchScene)),
      fetchRisks(),
    ]);
    const sceneTexts = sceneResults.map((r, i) => ({
      id: SCENE_IDS[i],
      text: r.status === "fulfilled" ? extractAnchorText(r.value) : "",
    }));
    const risks = normaliseArray(riskRaw);
    const dark = risks.filter((r) => matchedScenes(r, sceneTexts).length === 0);
    const captured = risks.length - dark.length;
    const critDark = dark.filter((r) => getRiskSeverity(r) >= 90).length;
    return (
      `Scene-risk coverage map complete, sir. ${risks.length} risk signal${risks.length !== 1 ? "s" : ""} analysed across all 10 cinematic scenes. ` +
      `${captured} risk${captured !== 1 ? "s" : ""} are represented in scene anchor data; ` +
      `${dark.length} are dark — not surfaced in any scene. ` +
      (critDark > 0
        ? `${critDark} critical risk${critDark !== 1 ? "s" : ""} have no scene representation and require immediate attention.`
        : "No critical dark risks at this time.") +
      " Opening the scene-risk coverage panel now."
    );
  } catch (_) {
    return "Scene-risk coverage map is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SceneRiskCoverageMap() {
  const [visible,    setVisible]    = useState(false);
  const [risks,      setRisks]      = useState([]);
  const [sceneTexts, setSceneTexts] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [sceneResults, riskRaw] = await Promise.all([
        Promise.allSettled(SCENE_IDS.map(fetchScene)),
        fetchRisks(),
      ]);
      setSceneTexts(
        sceneResults.map((r, i) => ({
          id:   SCENE_IDS[i],
          text: r.status === "fulfilled" ? extractAnchorText(r.value) : "",
        }))
      );
      setRisks(normaliseArray(riskRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:scrisk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scrisk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess(risk) {
    const rId = risk.id || getRiskName(risk);
    setAssessing(rId);
    const sev   = getRiskSeverity(risk);
    const name  = getRiskName(risk);
    const desc  = getRiskDesc(risk);
    const scenes = matchedScenes(risk, sceneTexts);
    const sceneCtx = scenes.length > 0
      ? `This risk appears in scenes: ${scenes.map((s) => SCENE_SHORT[s.id] || s.id).join(", ")}.`
      : "This risk has no representation in any of the 10 cinematic scenes.";
    const prompt =
      `As JARVIS, provide a concrete 2-sentence assessment of this risk signal in the context of operational scene coverage: ` +
      `"${name}" (severity ${sev}). ${desc ? `Details: ${desc}.` : ""} ${sceneCtx} ` +
      `Is the current scene layout adequate for monitoring this risk, and what immediate action is recommended?`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Scene-risk alignment assessment unavailable — manual review recommended, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Scene-risk assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  // Derived
  const enriched = risks.map((r) => ({
    ...r,
    _scenes: matchedScenes(r, sceneTexts),
    _captured: matchedScenes(r, sceneTexts).length > 0,
  }));

  const captured  = enriched.filter((r) => r._captured);
  const dark      = enriched.filter((r) => !r._captured);
  const critDark  = dark.filter((r) => getRiskSeverity(r) >= 90).length;

  function sortRisks(list) {
    return [...list].sort((a, b) => {
      const aDark = !a._captured ? 1 : 0;
      const bDark = !b._captured ? 1 : 0;
      if (aDark !== bDark) return bDark - aDark;
      return getRiskSeverity(b) - getRiskSeverity(a);
    });
  }

  const filtered = sortRisks(
    (tab === "CAPTURED" ? captured : tab === "DARK" ? dark : enriched).filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        getRiskName(r).toLowerCase().includes(q) ||
        getRiskDesc(r).toLowerCase().includes(q)
      );
    })
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Scene-Risk Coverage Map (F32)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${VIOLET}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? VIOLET : VIOLET}44`,
          color: visible ? VIOLET : `${VIOLET}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ SCRISK
        {critDark > 0 && (
          <span style={{
            marginLeft: 4,
            background: RED, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
            animation: "scrisk-pulse 1.4s ease-in-out infinite",
          }}>{critDark}</span>
        )}
        {critDark === 0 && dark.length > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMBER, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 34, left: Math.max(8, BTN_LEFT - 280), zIndex: 65,
          width: 580, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.95)",
          border: `1px solid ${VIOLET}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${VIOLET}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: VIOLET, fontSize: 11, letterSpacing: 2 }}>◈ SCENE–RISK COVERAGE</span>
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${VIOLET}33`, borderRadius: 3,
                color: `${VIOLET}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["SCENES",   sceneTexts.length || 10, VIOLET],
              ["RISKS",    enriched.length, CY],
              ["CAPTURED", captured.length, GREEN],
              ["DARK",     dark.length,     dark.length > 0 ? (critDark > 0 ? RED : AMBER) : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, alignItems: "center" }}>
            {[
              ["ALL",      enriched.length],
              ["CAPTURED", captured.length],
              ["DARK",     dark.length],
            ].map(([t, count]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${VIOLET}22` : "transparent",
                  border: `1px solid ${tab === t ? VIOLET : "#1e3040"}`,
                  color: tab === t ? VIOLET : "#445566",
                  borderRadius: 4, padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                  letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >{t} {count > 0 && <span style={{ opacity: 0.6 }}>({count})</span>}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="filter risks…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid #1e3040`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 120,
              }}
            />
          </div>

          {/* Risk cards */}
          {loading && filtered.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating risk signals across all 10 scenes…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DARK"
                ? "All risk signals are represented in scene anchors — excellent coverage, sir."
                : "No risks match this filter."}
            </div>
          ) : (
            filtered.map((risk) => {
              const sev      = getRiskSeverity(risk);
              const name     = getRiskName(risk);
              const desc     = getRiskDesc(risk);
              const captured = risk._captured;
              const scenes   = risk._scenes;
              const sevCol   = sevColor(sev);
              const rId      = risk.id || name;
              const isOpen   = expanded === rId;
              const isAssess = assessing === rId;

              return (
                <div
                  key={rId}
                  onClick={() => setExpanded(isOpen ? null : rId)}
                  style={{
                    background: captured ? "rgba(255,255,255,0.02)" : `${RED}08`,
                    border: `1px solid ${isOpen ? `${VIOLET}44` : captured ? "#1a2530" : `${RED}22`}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Risk header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      background: sevCol,
                      boxShadow: (!captured && sev >= 90) ? `0 0 8px ${RED}` : "none",
                      animation: (!captured && sev >= 90) ? "scrisk-pulse 1.4s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                      fontSize: 7, color: sevCol, border: `1px solid ${sevCol}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>{sevLabel(sev)}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, lineHeight: 1.3 }}>{name}</span>
                    <span style={{
                      fontSize: 7, fontWeight: "bold", whiteSpace: "nowrap",
                      color: captured ? GREEN : RED,
                      border: `1px solid ${captured ? GREEN : RED}33`,
                      borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                    }}>{captured ? "CAPTURED" : "DARK"}</span>
                  </div>

                  {/* Description */}
                  {desc && (
                    <div style={{ color: "#556677", fontSize: 8, lineHeight: 1.4, marginBottom: 4 }}>
                      {desc.slice(0, 100)}{desc.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Action row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 7, color: "#334455" }}>
                      {captured
                        ? `${scenes.length} scene${scenes.length !== 1 ? "s" : ""} matched`
                        : "no scene match"}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={(e) => { e.stopPropagation(); assess(risk); }}
                      disabled={isAssess}
                      style={{
                        background: isAssess ? "#1a2530" : captured ? `${VIOLET}18` : `${RED}18`,
                        color: isAssess ? "#445566" : captured ? VIOLET : RED,
                        border: `1px solid ${captured ? VIOLET : RED}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: isAssess ? "default" : "pointer",
                      }}
                    >{isAssess ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded: matched scenes */}
                  {isOpen && captured && scenes.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${VIOLET}18` }}>
                      <div style={{ color: VIOLET, fontSize: 7, letterSpacing: 1, marginBottom: 4 }}>PRESENT IN SCENES</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {scenes.map((s) => (
                          <span key={s.id} style={{
                            background: `${VIOLET}18`, border: `1px solid ${VIOLET}33`,
                            borderRadius: 3, padding: "2px 6px",
                            fontSize: 7, color: VIOLET, letterSpacing: 1,
                          }}>{SCENE_SHORT[s.id] || s.id}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {isOpen && !captured && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${RED}18`, color: "#884444", fontSize: 8 }}>
                      This risk has no keyword representation in any cinematic scene anchor — click ▶ ASSESS for AI coverage guidance.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/cinematic/scene/&#123;id&#125; × 10 + /entities/RiskSignal · 120s auto-refresh · ▶ ASSESS for AI guidance
          </div>
        </div>
      )}

      <style>{`
        @keyframes scrisk-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
