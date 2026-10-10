/**
 * F743 — Risk Signal × Dataset × Investigation Triple Nexus (RSDTRI)
 * Endpoints: /entities/RiskSignal × /v1/datasets × /v1/investigations
 * Classification: FULLY_COVERED / DATASET_ONLY / CASE_ONLY / DARK
 */
import { useState, useEffect, useRef, useCallback } from "react";

const CY = "#00CFFF";
const API_BASE = (typeof window !== "undefined" && window.__JARVIS_API_BASE__) || "";
const API_KEY  = (typeof window !== "undefined" && window.__JARVIS_API_KEY__)  || "dev-key";
const REFRESH_MS = 90_000;
const PANEL_ID   = "jarvis-rsdtri-panel";

function apiBase() { return API_BASE || ""; }

function tokenise(str = "") {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}
function overlap(a = "", b = "") {
  const ta = new Set(tokenise(a));
  const tb = tokenise(b);
  return tb.filter(t => ta.has(t)).length;
}

function classify(signal, dsMatches, invMatches) {
  const hasDs  = dsMatches.length  > 0;
  const hasInv = invMatches.length > 0;
  if (hasDs && hasInv) return "FULLY_COVERED";
  if (hasDs)           return "DATASET_ONLY";
  if (hasInv)          return "CASE_ONLY";
  return "DARK";
}

const CLASS_COLOR = {
  FULLY_COVERED: "#00FF88",
  DATASET_ONLY:  CY,
  CASE_ONLY:     "#FFB300",
  DARK:          "#FF4C4C",
};

const TABS = ["ALL", "FULLY_COVERED", "DATASET_ONLY", "CASE_ONLY", "DARK"];

export function isRsdtriQuery(q = "") {
  const lq = q.toLowerCase();
  return [
    "rsdtri", "risk signal dataset investigation", "risk dataset case",
    "risk signal investigation", "uncovered risk signal", "dark risk signal",
    "risk dataset coverage", "risk investigation coverage", "risk signal nexus",
    "risk coverage triple", "signal coverage", "risk triple nexus",
  ].some(k => lq.includes(k));
}

export async function buildRsdtriScript() {
  try {
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [rsR, dsR, invR] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers: h }),
      fetch(`${base}/v1/datasets`, { headers: h }),
      fetch(`${base}/v1/investigations`, { headers: h }),
    ]);
    const rsData  = await rsR.json();
    const dsData  = await dsR.json();
    const invData = await invR.json();
    const signals      = Array.isArray(rsData)  ? rsData  : (rsData.items  || rsData.data         || []);
    const datasets     = Array.isArray(dsData)  ? dsData  : (dsData.datasets || dsData.items       || []);
    const investigations = Array.isArray(invData) ? invData : (invData.investigations || invData.items || []);

    let fullyCovered = 0, datasetOnly = 0, caseOnly = 0, dark = 0;
    for (const sig of signals) {
      const key = `${sig.name || ""} ${sig.title || ""} ${sig.description || ""} ${sig.type || ""} ${sig.category || ""}`;
      const dsM  = datasets.filter(d => overlap(key, `${d.name||""} ${d.title||""} ${d.description||""} ${(d.tags||[]).join(" ")}`) > 0);
      const invM = investigations.filter(i => overlap(key, `${i.name||""} ${i.title||""} ${i.description||""} ${i.status||""}`) > 0);
      const cl   = classify(sig, dsM, invM);
      if (cl === "FULLY_COVERED") fullyCovered++;
      else if (cl === "DATASET_ONLY") datasetOnly++;
      else if (cl === "CASE_ONLY")    caseOnly++;
      else                            dark++;
    }
    const coverage = signals.length ? Math.round((fullyCovered / signals.length) * 100) : 0;
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers: h,
      body: JSON.stringify({
        message: `Risk signal coverage: ${signals.length} signals total, ${fullyCovered} fully covered (dataset+investigation), ${datasetOnly} dataset-only, ${caseOnly} case-only, ${dark} dark/uncovered, ${coverage}% full coverage. Using ${datasets.length} datasets and ${investigations.length} investigations. Provide a 2-sentence assessment of risk signal coverage gaps and investigation priorities.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Risk signal coverage assessed.").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch {
    return "Risk signal dataset-investigation triple coverage check unavailable.";
  }
}

export default function RiskSignalDatasetInvestigationTriple() {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [rows,     setRows]     = useState([]);
  const [dsAll,    setDsAll]    = useState([]);
  const [invAll,   setInvAll]   = useState([]);
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
      const [rsR, dsR, invR] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers: h }),
        fetch(`${base}/v1/datasets`, { headers: h }),
        fetch(`${base}/v1/investigations`, { headers: h }),
      ]);
      const rsData  = await rsR.json();
      const dsData  = await dsR.json();
      const invData = await invR.json();
      const signals      = Array.isArray(rsData)  ? rsData  : (rsData.items  || rsData.data            || []);
      const datasets     = Array.isArray(dsData)  ? dsData  : (dsData.datasets || dsData.items          || []);
      const investigations = Array.isArray(invData) ? invData : (invData.investigations || invData.items || []);
      setDsAll(datasets);
      setInvAll(investigations);
      const built = signals.map(sig => {
        const key = `${sig.name || ""} ${sig.title || ""} ${sig.description || ""} ${sig.type || ""} ${sig.category || ""}`;
        const dsM = datasets.filter(d =>
          overlap(key, `${d.name||""} ${d.title||""} ${d.description||""} ${(d.tags||[]).join(" ")}`) > 0
        ).map(d => ({ ...d, hits: overlap(key, `${d.name||""} ${d.title||""} ${d.description||""} ${(d.tags||[]).join(" ")}`) }));
        const invM = investigations.filter(i =>
          overlap(key, `${i.name||""} ${i.title||""} ${i.description||""} ${i.status||""}`) > 0
        ).map(i => ({ ...i, hits: overlap(key, `${i.name||""} ${i.title||""} ${i.description||""} ${i.status||""}`) }));
        return { ...sig, _dsM: dsM, _invM: invM, _cl: classify(sig, dsM, invM) };
      });
      setRows(built);
    } catch (err) {
      console.error("[RSDTRI] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:rsdtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:rsdtri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [open, load]);

  if (!open) {
    const dark = rows.filter(r => r._cl === "DARK").length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Risk Signal × Dataset × Investigation Triple Nexus (RSDTRI)"
        style={{
          position: "fixed", left: 910800, bottom: 8, zIndex: 602,
          background: "rgba(5,8,13,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ RSDTRI{dark > 0 && (
          <span style={{ marginLeft: 4, background: "#FF4C4C", color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 8 }}>{dark}</span>
        )}
      </button>
    );
  }

  const stats = {
    total:         rows.length,
    fullyCovered:  rows.filter(r => r._cl === "FULLY_COVERED").length,
    datasetOnly:   rows.filter(r => r._cl === "DATASET_ONLY").length,
    caseOnly:      rows.filter(r => r._cl === "CASE_ONLY").length,
    dark:          rows.filter(r => r._cl === "DARK").length,
    coverage:      rows.length ? Math.round((rows.filter(r => r._cl === "FULLY_COVERED").length / rows.length) * 100) : 0,
  };

  const filtered = rows.filter(r => {
    const matchTab = tab === "ALL" || r._cl === tab;
    const s = search.toLowerCase();
    const matchSearch = !s ||
      (r.name || "").toLowerCase().includes(s) ||
      (r.title || "").toLowerCase().includes(s) ||
      (r.type || "").toLowerCase().includes(s);
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    const answer = await buildRsdtriScript();
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    setAssessing(false);
  }

  const TILE_STYLE = { textAlign: "center", background: "rgba(0,207,255,0.04)",
    border: `1px solid ${CY}22`, borderRadius: 6, padding: "8px 4px" };
  const TILE_VAL = { fontSize: 20, fontWeight: 700, color: CY, display: "block" };
  const TILE_LBL = { fontSize: 8, letterSpacing: 1, color: "#6E8AA0", marginTop: 2, display: "block" };

  return (
    <div id={PANEL_ID} style={{
      position: "fixed", top: 60, right: 18, zIndex: 602,
      width: "min(640px,94vw)", maxHeight: "82vh",
      background: "rgba(5,10,18,0.96)", border: `1px solid ${CY}44`,
      borderRadius: 12, padding: "14px 16px", backdropFilter: "blur(14px)",
      boxShadow: `0 0 60px ${CY}18`, fontFamily: "'JetBrains Mono',monospace",
      color: "#DCEBF5", display: "flex", flexDirection: "column", gap: 10,
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ RSDTRI</span>
        <span style={{ flex: 1, color: "#4A6070", fontSize: 10 }}>RISK SIGNAL × DATASET × INVESTIGATION</span>
        <span style={{ fontSize: 9, color: "#4A6070" }}>{dsAll.length} DATASETS · {invAll.length} CASES</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
          color: "#4A6070", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
        <div style={TILE_STYLE}><span style={TILE_VAL}>{stats.total}</span><span style={TILE_LBL}>SIGNALS</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#00FF88" }}>{stats.fullyCovered}</span><span style={TILE_LBL}>FULLY CVR</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: CY }}>{stats.datasetOnly}</span><span style={TILE_LBL}>DS ONLY</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#FFB300" }}>{stats.caseOnly}</span><span style={TILE_LBL}>CASE ONLY</span></div>
        <div style={TILE_STYLE}><span style={{ ...TILE_VAL, color: "#FF4C4C" }}>{stats.dark}</span><span style={TILE_LBL}>DARK</span></div>
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
          placeholder="search signals…"
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
        loading risk signal coverage…
      </div>}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ color: "#4A6070", fontSize: 10, textAlign: "center", padding: 12 }}>no signals match</div>
      )}

      {/* Rows */}
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
                {row.name || row.title || `Signal ${i + 1}`}
              </span>
              {row.type && <span style={{ fontSize: 8, color: "#6E8AA0", letterSpacing: 1 }}>{row.type.toUpperCase().slice(0, 10)}</span>}
              {row._dsM.length  > 0 && <span style={{ fontSize: 9, color: CY, letterSpacing: 1 }}>DS:{row._dsM.length}</span>}
              {row._invM.length > 0 && <span style={{ fontSize: 9, color: "#FFB300", letterSpacing: 1 }}>CASE:{row._invM.length}</span>}
              <span style={{ fontSize: 10, color: "#4A6070" }}>{isExp ? "▲" : "▼"}</span>
            </div>
            {isExp && (
              <div style={{ marginTop: 8, paddingLeft: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {/* Dataset matches */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: CY, letterSpacing: 1, marginBottom: 4 }}>
                    DATASETS ({row._dsM.length})
                  </div>
                  {row._dsM.length === 0
                    ? <div style={{ fontSize: 9, color: "#4A6070" }}>no dataset matches</div>
                    : row._dsM.slice(0, 5).map((d, di) => (
                      <div key={di} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 8, background: `${CY}22`, border: `1px solid ${CY}44`,
                          color: CY, borderRadius: 3, padding: "1px 4px", letterSpacing: 1 }}>
                          {(d.format || d.type || "DS").toUpperCase().slice(0, 6)}
                        </span>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.name || d.title || "Dataset"}
                        </span>
                        <span style={{ fontSize: 8, color: "#6E8AA0" }}>{d.hits}h</span>
                      </div>
                    ))
                  }
                </div>
                {/* Investigation matches */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 9, color: "#FFB300", letterSpacing: 1, marginBottom: 4 }}>
                    INVESTIGATIONS ({row._invM.length})
                  </div>
                  {row._invM.length === 0
                    ? <div style={{ fontSize: 9, color: "#4A6070" }}>no investigation matches</div>
                    : row._invM.slice(0, 5).map((inv, ii) => {
                      const st = (inv.status || "OPEN").toUpperCase();
                      const stColor = st === "CLOSED" ? "#00FF88" : st === "ACTIVE" ? CY : st === "CRITICAL" ? "#FF4C4C" : "#FFB300";
                      return (
                        <div key={ii} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{ fontSize: 8, background: `${stColor}22`, border: `1px solid ${stColor}44`,
                            color: stColor, borderRadius: 3, padding: "1px 4px", letterSpacing: 1 }}>{st.slice(0, 6)}</span>
                          <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {inv.name || inv.title || "Investigation"}
                          </span>
                          <span style={{ fontSize: 8, color: "#6E8AA0" }}>{inv.hits}h</span>
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
