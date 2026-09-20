/**
 * SceneIntelligenceOverlay — F612 (SCINTEL)
 * "JARVIS, scene intel / scene intelligence / scintel / scene risk / active scenes"
 * Cross-references all 10 /v1/cinematic/scene/{id} anchor texts against
 * /entities/RiskSignal and /entities/Task using keyword overlap.
 * ACTIVE scenes (≥1 entity match) vs QUIET (no backing).
 * Coverage % tile; ALL/ACTIVE/QUIET filter tabs + search; click-to-expand matched signals/tasks.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PRP = "#AA88FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS   = 60_000;
const SCENE_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const SCINTEL_RE =
  /\bscintel\b|\bscene.?intel(?:ligence)?\b|\bscene.?risk\b|\bscene.?overlay\b|\bactive.?scenes?\b|\bcinematic.?intel\b|\bscene.?signal\b|\bscene.?threat\b|\bwhich.?scenes?.?have.?(?:risk|threat|task)\b/i;

export function isScintelQuery(text) {
  return SCINTEL_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseScene(data, id) {
  if (!data) return { id, title: `Scene ${id}`, anchors: [] };
  const anchors = (data.anchors || data.anchor_list || data.items || []).map(
    (a) => a.label || a.title || a.name || a.text || String(a)
  );
  return {
    id,
    title: data.title || data.name || data.scene_name || `Scene ${id}`,
    anchors,
  };
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw = data.signals || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:       s.id || `sig-${i}`,
    title:    s.title || s.signal || s.name || `Signal ${i + 1}`,
    severity: (s.severity || s.level || "MEDIUM").toUpperCase(),
    source:   s.source || s.origin || "",
    tags:     s.tags || [],
  }));
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw = data.tasks || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:     t.id || `task-${i}`,
    title:  t.title || t.name || t.task || `Task ${i + 1}`,
    status: (t.status || "PENDING").toUpperCase(),
    tags:   t.tags || [],
  }));
}

function crossRefScene(scene, signals, tasks) {
  const haystack = [scene.title, ...scene.anchors].join(" ");
  const matchedSignals = signals
    .map((s) => {
      const hits = overlap(haystack, `${s.title} ${(s.tags || []).join(" ")}`);
      return hits > 0 ? { ...s, hits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4);
  const matchedTasks = tasks
    .map((t) => {
      const hits = overlap(haystack, `${t.title} ${(t.tags || []).join(" ")}`);
      return hits > 0 ? { ...t, hits } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 4);
  const active = matchedSignals.length > 0 || matchedTasks.length > 0;
  return { ...scene, matchedSignals, matchedTasks, active, totalMatches: matchedSignals.length + matchedTasks.length };
}

export async function buildScintelScript() {
  try {
    const base = apiBase();
    const [sceneResults, sigRes, taskRes] = await Promise.all([
      Promise.all(
        SCENE_IDS.map((id) =>
          fetch(`${base}/v1/cinematic/scene/${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        )
      ),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [sigData, taskData] = await Promise.all([sigRes.json(), taskRes.json()]);
    const signals = normaliseSignals(sigData);
    const tasks   = normaliseTasks(taskData);
    const scenes  = sceneResults.map((d, i) => crossRefScene(normaliseScene(d, SCENE_IDS[i]), signals, tasks));
    const active  = scenes.filter((s) => s.active).length;
    const quiet   = scenes.length - active;
    const topActive = scenes.filter((s) => s.active).sort((a, b) => b.totalMatches - a.totalMatches).slice(0, 2).map((s) => s.title).join(", ");
    if (!scenes.length) return "No scene data available, sir.";
    return (
      `${active} of ${scenes.length} cinematic scenes have live entity signals ` +
      `(${signals.length} risk signal${signals.length !== 1 ? "s" : ""}, ${tasks.length} task${tasks.length !== 1 ? "s" : ""} cross-referenced). ` +
      (active > 0
        ? `Most active: ${topActive || "unknown"}. ${quiet} scene${quiet !== 1 ? "s" : ""} currently quiet.`
        : "All scenes are currently quiet — no entity keyword overlap detected.")
    );
  } catch {
    return "Unable to reach scene or entity endpoints, sir.";
  }
}

const SEV_COLOR = { CRITICAL: RED, HIGH: "#FF8844", MEDIUM: AMB, LOW: GRN, INFO: CY };
const STATUS_COLOR = { DONE: GRN, COMPLETE: GRN, COMPLETED: GRN, PENDING: AMB, IN_PROGRESS: CY, BLOCKED: RED };

export default function SceneIntelligenceOverlay() {
  const [open,      setOpen]      = useState(false);
  const [scenes,    setScenes]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [sceneResults, sigRes, taskRes] = await Promise.all([
        Promise.all(
          SCENE_IDS.map((id) =>
            fetch(`${base}/v1/cinematic/scene/${id}`, { headers: { Authorization: `Bearer ${API_KEY}` } })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
        ),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [sigData, taskData] = await Promise.all([sigRes.json(), taskRes.json()]);
      const signals = normaliseSignals(sigData);
      const tasks   = normaliseTasks(taskData);
      setScenes(sceneResults.map((d, i) => crossRefScene(normaliseScene(d, SCENE_IDS[i]), signals, tasks)));
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:scintel-toggle", toggle);
    return () => window.removeEventListener("jarvis:scintel-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const active  = scenes.filter((s) => s.active);
      const quiet   = scenes.filter((s) => !s.active);
      const topSigs = active.flatMap((s) => s.matchedSignals).slice(0, 3).map((s) => s.title).join("; ");
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Scene intelligence overlay: ${scenes.length} cinematic scenes scanned. ` +
            `${active.length} are ACTIVE with live entity overlays; ` +
            `${quiet.length} are QUIET. ` +
            `Top active risk signals across scenes: ${topSigs || "none"}. ` +
            "Give a 2-sentence operational situational-awareness assessment and recommended action.",
        }),
      });
      const d    = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [scenes]);

  const active = scenes.filter((s) => s.active).length;
  const quiet  = scenes.length - active;
  const pct    = scenes.length ? Math.round((active / scenes.length) * 100) : 0;

  const visible = scenes
    .filter((s) => {
      if (tab === "ACTIVE") return s.active;
      if (tab === "QUIET")  return !s.active;
      return true;
    })
    .filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q);
    })
    .sort((a, b) => b.totalMatches - a.totalMatches);

  const BTN_LEFT = 91_620;

  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 165,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${active > 0 ? RED : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 165,
    width: 420,
    maxHeight: "72vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Scene Intelligence Overlay (SCINTEL)"
      >
        ◈ SCINTEL
        {active > 0 && (
          <span style={{ background: RED, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {active}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>SCENE INTELLIGENCE OVERLAY</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "SCENES",  value: scenes.length, color: CY },
              { label: "ACTIVE",  value: active,         color: active > 0 ? RED : DIM },
              { label: "QUIET",   value: quiet,          color: quiet === scenes.length ? GRN : DIM },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>SCENE INTEL COVERAGE</span>
              <span style={{ color: pct >= 60 ? RED : pct >= 30 ? AMB : GRN, fontSize: 10, fontWeight: "bold" }}>{pct}% ACTIVE</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 60 ? RED : pct >= 30 ? AMB : GRN, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "ACTIVE", "QUIET"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search scenes…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* scene list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No scenes match.</div>
            )}
            {visible.map((scene) => (
              <div
                key={scene.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${scene.active ? RED : CY}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === scene.id ? null : scene.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: scene.active ? RED : DIM, fontSize: 12 }}>{scene.active ? "●" : "○"}</span>
                  <span style={{ color: PRP, fontSize: 9, border: `1px solid ${PRP}44`, borderRadius: 3, padding: "1px 4px" }}>SCENE {scene.id}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{scene.title}</span>
                  <span style={{ color: scene.active ? RED : DIM, fontSize: 9 }}>
                    {scene.active ? `${scene.totalMatches} hit${scene.totalMatches !== 1 ? "s" : ""}` : "QUIET"}
                  </span>
                </div>

                {expanded === scene.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {scene.active ? (
                      <>
                        {scene.matchedSignals.length > 0 && (
                          <div style={{ marginBottom: 5 }}>
                            <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {scene.matchedSignals.map((s) => (
                                <div key={s.id} style={{ background: "rgba(255,68,68,0.06)", border: `1px solid ${SEV_COLOR[s.severity] || AMB}33`, borderRadius: 4, padding: "4px 7px", display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ color: SEV_COLOR[s.severity] || AMB, fontSize: 9, border: `1px solid ${(SEV_COLOR[s.severity] || AMB)}44`, borderRadius: 3, padding: "1px 4px" }}>{s.severity}</span>
                                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.title}</span>
                                  <span style={{ color: DIM, fontSize: 9 }}>hits: {s.hits}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {scene.matchedTasks.length > 0 && (
                          <div>
                            <div style={{ color: DIM, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>TASKS</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {scene.matchedTasks.map((t) => (
                                <div key={t.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "4px 7px", display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ color: STATUS_COLOR[t.status] || CY, fontSize: 9, border: `1px solid ${(STATUS_COLOR[t.status] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{t.status}</span>
                                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{t.title}</span>
                                  <span style={{ color: DIM, fontSize: 9 }}>hits: {t.hits}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>
                        No entity signals match this scene&apos;s anchors — scene is operationally quiet.
                        {scene.anchors.length > 0 && (
                          <div style={{ marginTop: 4, color: DIM, fontSize: 9 }}>
                            Anchors: {scene.anchors.slice(0, 4).join(", ")}{scene.anchors.length > 4 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || scenes.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
