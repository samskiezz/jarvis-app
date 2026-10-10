/**
 * F141 — Scenario × Graph Community × Ops Event × Dataset Intelligence Saturation Map (SGODSAT)
 *
 * Parallel-fetches /v1/scenario/list + /v1/graph/communities + /v1/ops/events + /v1/datasets
 * Keyword-correlates each scenario against graph communities AND ops events AND datasets:
 *   FULLY_SATURATED — scenario matched all three sources
 *   DUAL_LINKED     — scenario matched any two sources
 *   SINGLE_LINKED   — scenario matched exactly one source
 *   UNSATURATED     — no matches (intelligence gap)
 *
 * Stat tiles: SCENARIOS / COMMUNITIES / OPS EVENTS / DATASETS + all four class counts + SAT%.
 * Amber badge on unsaturated count.
 * Filter tabs ALL / FULLY_SATURATED / DUAL_LINKED / SINGLE_LINKED / UNSATURATED + text search.
 * Expand scenario → matched community cards (purple) + ops event cards (blue) + dataset cards (green).
 * ▶ ASSESS SATURATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:sgodsat-toggle event.
 *
 * Voice triggers: "sgodsat / scenario saturation / community scenario /
 *                  unsaturated scenario / scenario intelligence saturation".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_021_880;
const Z_INDEX  = 203;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const SGODSAT_RE = /\b(sgodsat|scenario[\s-]saturation|community[\s-]scenario|unsaturated[\s-]scenarios?|scenario[\s-]intelligence[\s-]saturation)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RE     = "#EF4444";
const PU     = "#A855F7";
const BL     = "#3B82F6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_SATURATED: GR,
  DUAL_LINKED:     CY,
  SINGLE_LINKED:   AM,
  UNSATURATED:     RE,
};
const TABS = ["ALL", "FULLY_SATURATED", "DUAL_LINKED", "SINGLE_LINKED", "UNSATURATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function scenarioText(sc) {
  return `${sc.name || sc.title || ""} ${sc.description || ""} ${sc.type || ""} ${(sc.tags || []).join(" ")}`.toLowerCase();
}
function communityText(c) {
  return `${c.name || c.label || c.id || ""} ${c.description || ""} ${(c.members || []).join(" ")}`.toLowerCase();
}
function opsText(e) {
  return `${e.title || e.name || e.event_type || ""} ${e.description || ""} ${e.source || ""}`.toLowerCase();
}
function datasetText(d) {
  return `${d.name || d.title || ""} ${d.description || ""} ${d.type || ""}`.toLowerCase();
}

async function loadAll() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [scRes, cmRes, oeRes, dsRes] = await Promise.all([
    fetch(`${apiBase}/v1/scenario/list`,       { headers }),
    fetch(`${apiBase}/v1/graph/communities`,   { headers }),
    fetch(`${apiBase}/v1/ops/events`,          { headers }),
    fetch(`${apiBase}/v1/datasets`,            { headers }),
  ]);
  const scJson = await scRes.json().catch(() => ({}));
  const cmJson = await cmRes.json().catch(() => ({}));
  const oeJson = await oeRes.json().catch(() => ({}));
  const dsJson = await dsRes.json().catch(() => ({}));
  const scenarios   = Array.isArray(scJson) ? scJson : scJson.scenarios  || scJson.data  || scJson.items || [];
  const communities = Array.isArray(cmJson) ? cmJson : cmJson.communities|| cmJson.data  || cmJson.items || [];
  const opsEvents   = Array.isArray(oeJson) ? oeJson : oeJson.events     || oeJson.data  || oeJson.items || [];
  const datasets    = Array.isArray(dsJson) ? dsJson : dsJson.datasets   || dsJson.data  || dsJson.items || [];
  return { scenarios, communities, opsEvents, datasets };
}

function correlate({ scenarios, communities, opsEvents, datasets }) {
  return scenarios.map(sc => {
    const kws          = keywords(scenarioText(sc));
    const matchedComm  = communities.filter(c => score(communityText(c), kws) > 0);
    const matchedOps   = opsEvents.filter(e   => score(opsText(e), kws)       > 0);
    const matchedData  = datasets.filter(d    => score(datasetText(d), kws)   > 0);
    const hits = (matchedComm.length > 0 ? 1 : 0) + (matchedOps.length > 0 ? 1 : 0) + (matchedData.length > 0 ? 1 : 0);
    const cls = hits === 3 ? "FULLY_SATURATED"
              : hits === 2 ? "DUAL_LINKED"
              : hits === 1 ? "SINGLE_LINKED"
              :               "UNSATURATED";
    return { ...sc, cls, matchedComm, matchedOps, matchedData };
  });
}

function StatTile({ label, value, color }) {
  return (
    <div style={{ flex: "1 1 80px", background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`,
      borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || CY }}>{value}</div>
      <div style={{ fontSize: 9, color: "#5A7A9A", letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RelevanceBar({ score: s, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((s / max) * 100)) : 0;
  return (
    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 3 }}>
      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color || CY, transition: "width 0.4s" }} />
    </div>
  );
}

export async function buildSgodsatScript() {
  const { scenarios, communities, opsEvents, datasets } = await loadAll();
  const rows        = correlate({ scenarios, communities, opsEvents, datasets });
  const saturated   = rows.filter(r => r.cls === "FULLY_SATURATED").length;
  const unsaturated = rows.filter(r => r.cls === "UNSATURATED").length;
  const ctx = `Scenarios: ${scenarios.length}. Graph communities: ${communities.length}. Ops events: ${opsEvents.length}. Datasets: ${datasets.length}. Fully saturated: ${saturated}. Unsaturated: ${unsaturated}.`;
  const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
    body: JSON.stringify({ message: `Scenario Intelligence Saturation: ${ctx}. Write exactly 2 sentences assessing which scenarios lack graph community, ops event, or dataset backing and what that means for operational planning.` }),
  });
  const j = await res.json().catch(() => ({}));
  return j.response || j.message || j.content
    || `SGODSAT online, sir. ${unsaturated} scenarios have no graph community, ops event, or dataset coverage — immediate intelligence gaps identified.`;
}

export function isSgodsatQuery(q) { return SGODSAT_RE.test(q); }

export default function ScenarioCommOpsDataSaturation() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [counts, setCounts]     = useState({ sc: 0, cm: 0, oe: 0, ds: 0 });
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [error, setError]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const { scenarios, communities, opsEvents, datasets } = await loadAll();
      setCounts({ sc: scenarios.length, cm: communities.length, oe: opsEvents.length, ds: datasets.length });
      setRows(correlate({ scenarios, communities, opsEvents, datasets }));
    } catch (e) {
      setError("Load failed: " + (e.message || String(e)));
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:sgodsat-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sgodsat-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try { setBrief(await buildSgodsatScript()); } catch { setBrief("SGODSAT assessment complete, sir."); }
    setAssessing(false);
  }, []);

  const classified = rows.filter(r =>
    (tab === "ALL" || r.cls === tab) &&
    (!search ||
      (r.name || r.title || "").toLowerCase().includes(search.toLowerCase()) ||
      (r.description || "").toLowerCase().includes(search.toLowerCase()))
  );

  const saturated   = rows.filter(r => r.cls === "FULLY_SATURATED").length;
  const dual        = rows.filter(r => r.cls === "DUAL_LINKED").length;
  const single      = rows.filter(r => r.cls === "SINGLE_LINKED").length;
  const unsaturated = rows.filter(r => r.cls === "UNSATURATED").length;
  const satPct      = rows.length > 0 ? Math.round(((saturated + dual) / rows.length) * 100) : 0;

  const maxCm = Math.max(1, ...rows.map(r => r.matchedComm?.length  || 0));
  const maxOe = Math.max(1, ...rows.map(r => r.matchedOps?.length   || 0));
  const maxDs = Math.max(1, ...rows.map(r => r.matchedData?.length  || 0));

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.90)",
          border: `1px solid ${unsaturated > 0 ? AM : GR}66`,
          color: unsaturated > 0 ? AM : GR,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1.5,
          padding: "4px 8px", borderRadius: 5, cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: unsaturated > 0 ? `0 0 10px ${AM}44` : "none",
        }}
        title="Scenario × Graph Community × Ops Event × Dataset Intelligence Saturation Map"
      >
        {unsaturated > 0 && (
          <span style={{
            background: AM, color: "#04060A", borderRadius: "50%",
            padding: "0 4px", marginRight: 4, fontSize: 8,
          }}>
            {unsaturated}
          </span>
        )}
        ◈ SGODSAT
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 40, top: 40, width: "min(720px,92vw)", maxHeight: "86vh",
          overflowY: "auto", background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
          padding: "16px 18px", zIndex: Z_INDEX + 1, fontFamily: FONT, color: "#DCEBF5",
          boxShadow: `0 0 40px ${CY}18`,
        }}>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: GR, fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>
              ◈ SGODSAT — SCENARIO INTELLIGENCE SATURATION MAP
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none",
              color: "#5A7A9A", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>

          {error && <div style={{ color: RE, fontSize: 11, marginBottom: 8 }}>{error}</div>}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <StatTile label="SCENARIOS"     value={counts.sc} />
            <StatTile label="COMMUNITIES"   value={counts.cm} color={PU} />
            <StatTile label="OPS EVENTS"    value={counts.oe} color={BL} />
            <StatTile label="DATASETS"      value={counts.ds} color={GR} />
            <StatTile label="FULLY SAT."    value={saturated}   color={GR} />
            <StatTile label="DUAL LINKED"   value={dual}        color={CY} />
            <StatTile label="SINGLE LINKED" value={single}      color={AM} />
            <StatTile label="UNSATURATED"   value={unsaturated} color={RE} />
            <StatTile label="SAT%"          value={`${satPct}%`}
              color={satPct >= 60 ? GR : satPct >= 30 ? AM : RE} />
          </div>

          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.07)", marginBottom: 12 }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${satPct}%`,
              background: satPct >= 60 ? GR : satPct >= 30 ? AM : RE, transition: "width 0.5s" }} />
          </div>

          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{
                  fontSize: 9, padding: "2px 8px", borderRadius: 4, cursor: "pointer",
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(0,207,255,0.07)",
                  color: tab === t ? "#04060A" : "#8AAEC8",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : BORDER}`,
                }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4,
                background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`,
                color: "#DCEBF5", outline: "none", width: 160,
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {classified.map((sc, i) => (
              <div key={sc.id || sc.name || i}
                style={{ border: `1px solid ${CLASS_COLOR[sc.cls]}33`, borderRadius: 7,
                  background: "rgba(0,207,255,0.03)", padding: "7px 10px" }}>

                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === i ? null : i)}>
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 3,
                    background: `${CLASS_COLOR[sc.cls]}22`, color: CLASS_COLOR[sc.cls],
                    border: `1px solid ${CLASS_COLOR[sc.cls]}55`, whiteSpace: "nowrap",
                  }}>
                    {sc.cls.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, flex: 1 }}>
                    {sc.name || sc.title || sc.id || "Unnamed Scenario"}
                  </span>
                  <span style={{ fontSize: 9, color: "#5A7A9A" }}>
                    CM:{sc.matchedComm.length} OE:{sc.matchedOps.length} DS:{sc.matchedData.length}
                  </span>
                  <span style={{ fontSize: 10, color: "#5A7A9A" }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {expanded === i && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>

                    {sc.matchedComm.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: PU, marginBottom: 3, letterSpacing: 1 }}>
                          GRAPH COMMUNITIES ({sc.matchedComm.length})
                        </div>
                        {sc.matchedComm.slice(0, 5).map((c, ci) => (
                          <div key={c.id || ci} style={{ background: `${PU}11`, border: `1px solid ${PU}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{c.name || c.label || c.id || "Community"}</span>
                            <RelevanceBar score={score(communityText(c), keywords(scenarioText(sc)))} max={maxCm} color={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedOps.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: BL, marginBottom: 3, letterSpacing: 1 }}>
                          OPS EVENTS ({sc.matchedOps.length})
                        </div>
                        {sc.matchedOps.slice(0, 5).map((e, ei) => (
                          <div key={e.id || ei} style={{ background: `${BL}11`, border: `1px solid ${BL}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{e.title || e.name || e.event_type || "Event"}</span>
                            <RelevanceBar score={score(opsText(e), keywords(scenarioText(sc)))} max={maxOe} color={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedData.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: GR, marginBottom: 3, letterSpacing: 1 }}>
                          DATASETS ({sc.matchedData.length})
                        </div>
                        {sc.matchedData.slice(0, 5).map((d, di) => (
                          <div key={d.id || di} style={{ background: `${GR}11`, border: `1px solid ${GR}33`,
                            borderRadius: 5, padding: "4px 7px", marginBottom: 3 }}>
                            <span style={{ fontSize: 10 }}>{d.name || d.title || d.id || "Dataset"}</span>
                            <RelevanceBar score={score(datasetText(d), keywords(scenarioText(sc)))} max={maxDs} color={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {sc.matchedComm.length === 0 && sc.matchedOps.length === 0 && sc.matchedData.length === 0 && (
                      <div style={{ fontSize: 10, color: "#5A7A9A", fontStyle: "italic" }}>
                        No graph community, ops event, or dataset correlated — scenario is unsaturated.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {classified.length === 0 && !error && (
            <div style={{ color: "#5A7A9A", fontSize: 11, textAlign: "center", padding: 20 }}>
              Loading scenario saturation data…
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={assess} disabled={assessing}
              style={{ fontSize: 10, padding: "4px 12px", borderRadius: 5, cursor: "pointer",
                background: assessing ? "rgba(0,207,255,0.1)" : `${CY}22`,
                color: CY, border: `1px solid ${CY}55` }}>
              {assessing ? "Assessing…" : "▶ ASSESS SATURATION"}
            </button>
            <button onClick={load} style={{ fontSize: 9, padding: "3px 8px", borderRadius: 5,
              cursor: "pointer", background: "rgba(0,207,255,0.05)",
              color: "#5A7A9A", border: `1px solid ${BORDER}` }}>↺</button>
          </div>
          {brief && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: `${CY}09`, border: `1px solid ${CY}22`, borderRadius: 6,
              padding: "8px 10px" }}>{brief}</div>
          )}
        </div>
      )}
    </>
  );
}
