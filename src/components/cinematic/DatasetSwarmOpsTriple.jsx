/**
 * F742 — Dataset × SwarmJob × Ops Events Triple Nexus (DSWEEVTRI)
 * Endpoints: /v1/datasets × /entities/SwarmJob × /v1/ops/events
 * Classification: FULLY_AUTOMATED / SWARM_ONLY / OPS_ONLY / UNMONITORED
 */
import { useState, useEffect, useRef, useCallback } from "react";

const CY = "#00CFFF";
const API_BASE = (typeof window !== "undefined" && window.__JARVIS_API_BASE__) || "";
const API_KEY  = (typeof window !== "undefined" && window.__JARVIS_API_KEY__)  || "dev-key";
const REFRESH_MS = 90_000;
const PANEL_ID   = "jarvis-dsweevtri-panel";

function apiBase() { return API_BASE || ""; }

function tokenise(str = "") {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
function overlap(a = "", b = "") {
  const ta = new Set(tokenise(a));
  const tb = tokenise(b);
  return tb.filter(t => ta.has(t)).length;
}

function classify(dataset, swarmMatches, opsMatches) {
  const hasSwarm = swarmMatches.length > 0;
  const hasOps   = opsMatches.length  > 0;
  if (hasSwarm && hasOps)  return "FULLY_AUTOMATED";
  if (hasSwarm)            return "SWARM_ONLY";
  if (hasOps)              return "OPS_ONLY";
  return "UNMONITORED";
}

const CLASS_COLOR = {
  FULLY_AUTOMATED: "#00FF88",
  SWARM_ONLY:      CY,
  OPS_ONLY:        "#FFB300",
  UNMONITORED:     "#FF4C4C",
};

const TABS = ["ALL", "FULLY_AUTOMATED", "SWARM_ONLY", "OPS_ONLY", "UNMONITORED"];

export function isDsweevtriQuery(q = "") {
  const lq = q.toLowerCase();
  return [
    "dsweevtri", "dataset swarm ops", "swarm job dataset", "ops event dataset",
    "monitored dataset", "fully automated dataset", "unmonitored dataset",
    "dataset triple nexus", "dataset automation coverage", "dataset ops coverage",
    "dataset swarm event", "swarm ops dataset",
  ].some(k => lq.includes(k));
}

export async function buildDsweevtriScript() {
  try {
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [dsR, swR, oeR] = await Promise.all([
      fetch(`${base}/v1/datasets`, { headers: h }),
      fetch(`${base}/entities/SwarmJob`, { headers: h }),
      fetch(`${base}/v1/ops/events`, { headers: h }),
    ]);
    const dsData  = await dsR.json();
    const swData  = await swR.json();
    const oeData  = await oeR.json();
    const datasets   = Array.isArray(dsData)  ? dsData  : (dsData.datasets  || dsData.items  || []);
    const swarmJobs  = Array.isArray(swData)  ? swData  : (swData.items     || swData.data   || []);
    const opsEvents  = Array.isArray(oeData)  ? oeData  : (oeData.events    || oeData.items  || []);

    let fullyAuto = 0, swarmOnly = 0, opsOnly = 0, unmonitored = 0;
    for (const ds of datasets) {
      const key = `${ds.name || ""} ${ds.title || ""} ${ds.description || ""} ${ds.tags?.join(" ") || ""}`;
      const swM = swarmJobs.filter(j => overlap(key, `${j.name||""} ${j.description||""} ${j.goal||""}`) > 0);
      const oeM = opsEvents.filter(e => overlap(key, `${e.title||""} ${e.description||""} ${e.type||""}`) > 0);
      const cl  = classify(ds, swM, oeM);
      if (cl === "FULLY_AUTOMATED") fullyAuto++;
      else if (cl === "SWARM_ONLY") swarmOnly++;
      else if (cl === "OPS_ONLY")   opsOnly++;
      else                          unmonitored++;
    }
    const coverage = datasets.length ? Math.round((fullyAuto / datasets.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        message: `Dataset automation coverage: ${datasets.length} datasets, ${fullyAuto} fully automated (swarm+ops), ${swarmOnly} swarm-only, ${opsOnly} ops-only, ${unmonitored} unmonitored, ${coverage}% full coverage. Using ${swarmJobs.length} swarm jobs and ${opsEvents.length} ops events. Provide a 2-sentence assessment of dataset monitoring coverage and priority gaps.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Dataset automation coverage assessed.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Dataset swarm-ops triple coverage check unavailable.";
  }
}

export default function DatasetSwarmOpsTriple() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [rows,     setRows]     = useState([]);
  const [swarmAll, setSwarmAll] = useState([]);
  const [opsAll,   setOpsAll]   = useState([]);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const base = apiBase();
      const [dsR, swR, oeR] = await Promise.all([
        fetch(`${base}/v1/datasets`, { headers: h }),
        fetch(`${base}/entities/SwarmJob`, { headers: h }),
        fetch(`${base}/v1/ops/events`, { headers: h }),
      ]);
      const dsData = await dsR.json();
      const swData = await swR.json();
      const oeData = await oeR.json();
      const datasets  = Array.isArray(dsData) ? dsData : (dsData.datasets || dsData.items || []);
      const swarmJobs = Array.isArray(swData) ? swData : (swData.items    || swData.data  || []);
      const opsEvents = Array.isArray(oeData) ? oeData : (oeData.events   || oeData.items || []);
      setSwarmAll(swarmJobs);
      setOpsAll(opsEvents);
      const built = datasets.map(ds => {
        const key = `${ds.name || ""} ${ds.title || ""} ${ds.description || ""} ${(ds.tags || []).join(" ")}`;
        const swM = swarmJobs.filter(j => overlap(key, `${j.name||""} ${j.description||""} ${j.goal||""}`) > 0)
          .map(j => ({ ...j, hits: overlap(key, `${j.name||""} ${j.description||""} ${j.goal||""}`) }));
        const oeM = opsEvents.filter(e => overlap(key, `${e.title||""} ${e.description||""} ${e.type||""}`) > 0)
          .map(e => ({ ...e, hits: overlap(key, `${e.title||""} ${e.description||""} ${e.type||""}`) }));
        return { ...ds, _swM: swM, _oeM: oeM, _cl: classify(ds, swM, oeM) };
      });
      setRows(built);
    } catch (err) {
      console.error("[DSWEEVTRI] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:dsweevtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:dsweevtri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  if (!open) {
    const unmonitored = rows.filter(r => r._cl === "UNMONITORED").length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dataset × SwarmJob × Ops Events Triple Nexus (DSWEEVTRI)"
        style={{
          position: "fixed", left: 910700, bottom: 8, zIndex: 601,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ DSWEEVTRI{unmonitored > 0 && (
          <span style={{ marginLeft: 4, background: "#FF4C4C", color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 8 }}>{unmonitored}</span>
        )}
      </button>
    );
  }

  const stats = {
    total:          rows.length,
    fullyAutomated: rows.filter(r => r._cl === "FULLY_AUTOMATED").length,
    swarmOnly:      rows.filter(r => r._cl === "SWARM_ONLY").length,
    opsOnly:        rows.filter(r => r._cl === "OPS_ONLY").length,
    unmonitored:    rows.filter(r => r._cl === "UNMONITORED").length,
    coverage:       rows.length ? Math.round((rows.filter(r => r._cl === "FULLY_AUTOMATED").length / rows.length) * 100) : 0,
  };

  const filtered = rows.filter(r => {
    const matchTab = tab === "ALL" || r._cl === tab;
    const s = search.toLowerCase();
    const matchSearch = !s || (r.name||"").toLowerCase().includes(s) || (r.title||"").toLowerCase().includes(s);
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    const answer = await buildDsweevtriScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    setAssessing(false);
  }

  const TILE_STYLE = { textAlign: "center", background: "rgba(0,207,255,0.04)",
    border: `1px solid ${CY}22`, borderRadius: 6, padding: "8px 4px" };
  const TILE_VAL = { fontSize: 20, fontWeight: 700, color: CY, display: "block" };
  const TILE_LBL = { fontSize: 8, letterSpacing: 1, color: "#6E8AA0", marginTop: 2, display: "block" };

  return (
    <div id={PANEL_ID} style={{
      position: "fixed", top: 60, right: 18, zIndex: 601,
      width: "min(640px,94vw)", maxHeight: "82vh",
      background: "rgba(5,10,18,0.96)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px", backdropFilter: "blur(14px)",
      boxShadow: `0 0 60px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
      color: "#DCEBF5", display: "flex", flexDirection: "column", gap: 10,
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ DSWEEVTRI</span>
        <span style={{ flex: 1, color: "#4A6070", fontSize: 10 }}>DATASET × SWARMJOB × OPS EVENTS</span>
        <span style={{ fontSize: 9, color: "#4A6070" }}>{swarmAll.length} JOBS · {opsAll.length} EVENTS</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
          color: "#4A6070", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
        <div style={TILE_STYLE}><span style={TILE_VAL}>{stats.total}</span><span style={TILE_LBL}>DATASETS</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#00FF88" }}>{stats.fullyAutomated}</span><span style={TILE_LBL}>FULLY AUT.</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: CY }}>{stats.swarmOnly}</span><span style={TILE_LBL}>SWARM ONLY</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#FFB300" }}>{stats.opsOnly}</span><span style={TILE_LBL}>OPS ONLY</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#FF4C4C" }}>{stats.unmonitored}</span><span style={TILE_LBL}>UNMONITORED</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: stats.coverage > 70 ? "#00FF88" : stats.coverage > 40 ? "#FFB300" : "#FF4C4C" }}>{stats.coverage}%</span><span style={TILE_LBL}>COVERAGE</span></div>
      </div>

      {/* Filter + search */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : "rgba(0,207,255,0.07)",
            color: tab === t ? "#04060A" : CY,
            border: `1px solid ${CY}44`, borderRadius: 4,
            padding: "2px 8px", fontSize: 9, cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft: "auto", background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            borderRadius: 4, color: CY, fontSize: 10, padding: "2px 8px", outline: "none", width: 140 }} />
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,207,255,0.15)" : "rgba(0,207,255,0.1)",
          border: `1px solid ${CY}55`, borderRadius: 4, color: CY,
          padding: "3px 10px", fontSize: 9, cursor: assessing ? "wait" : "pointer", letterSpacing: 1,
        }}>▶ {assessing ? "ASSESSING…" : "ASSESS"}</button>
      </div>

      {/* Loading */}
      {loading && <div style={{ color: "#6E8AA0", fontSize: 10, textAlign: "center", padding: 12 }}>
        loading dataset automation coverage…
      </div>}

      {/* Rows */}
      {!loading && filtered.length === 0 && (
        <div style={{ color: "#4A6070", fontSize: 10, textAlign: "center", padding: 12 }}>no datasets match</div>
      )}
      {!loading && filtered.map((row, i) => {
        const isExp = expanded === i;
        const clColor = CLASS_COLOR[row._cl] || "#6E8AA0";
        return (
          <div key={row.id || row.name || i}
            onClick={() => setExpanded(isExp ? null : i)}
            style={{ borderBottom: `1px solid ${CY}11`, paddingBottom: 8, cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9, letterSpacing: 1, fontWeight: 700, color: clColor,
                background: `${clColor}18`, border: `1px solid ${clColor}44`,
                borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>{row._cl}</span>
              <span style={{ fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name || row.title || `Dataset ${i + 1}`}
              </span>
              {row._swM.length > 0 && <span style={{ fontSize: 9, color: CY, letterSpacing: 1 }}>SWARM:{row._swM.length}</span>}
              {row._oeM.length > 0 && <span style={{ fontSize: 9, color: "#FFB300", letterSpacing: 1 }}>OPS:{row._oeM.length}</span>}
              <span style={{ fontSize: 10, color: "#4A6070" }}>{isExp ? "▲" : "▼"}</span>
            </div>
            {isExp && (
              <div style={{ marginTop: 8, paddingLeft: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {/* Swarm matches */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                    SWARM JOBS ({row._swM.length})
                  </div>
                  {row._swM.length === 0
                    ? <div style={{ fontSize: 9, color: "#4A6070" }}>no swarm job matches</div>
                    : row._swM.slice(0, 5).map((j, ji) => (
                      <div key={ji} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 8, background: `${CY}22`, border: `1px solid ${CY}44`,
                          color: CY, borderRadius: 3, padding: "1px 4px", letterSpacing: 1 }}>
                          {(j.status || "JOB").toUpperCase().slice(0, 8)}
                        </span>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j.name || j.id || "Swarm Job"}
                        </span>
                        <span style={{ fontSize: 8, color: "#6E8AA0" }}>{j.hits}h</span>
                      </div>
                    ))
                  }
                </div>
                {/* Ops event matches */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: "#FFB300", letterSpacing: 1, marginBottom: 4 }}>
                    OPS EVENTS ({row._oeM.length})
                  </div>
                  {row._oeM.length === 0
                    ? <div style={{ fontSize: 9, color: "#4A6070" }}>no ops event matches</div>
                    : row._oeM.slice(0, 5).map((e, ei) => {
                      const sev = (e.severity || e.level || "INFO").toUpperCase();
                      const sevColor = sev === "CRITICAL" ? "#FF4C4C" : sev === "HIGH" ? "#FFB300" : sev === "MEDIUM" ? CY : "#00FF88";
                      return (
                        <div key={ei} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, background: `${sevColor}22`, border: `1px solid ${sevColor}44`,
                            color: sevColor, borderRadius: 3, padding: "1px 4px", letterSpacing: 1 }}>{sev.slice(0, 4)}</span>
                          <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.title || e.description || e.type || "Ops Event"}
                          </span>
                          <span style={{ fontSize: 8, color: "#6E8AA0" }}>{e.hits}h</span>
                        </div>
                      );
                    })
                  }
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontSize: 8, color: "#2A3A4A", textAlign: "right", marginTop: 4 }}>
        AUTO-REFRESH 90s · {filtered.length}/{rows.length} shown
      </div>
    </div>
  );
}
