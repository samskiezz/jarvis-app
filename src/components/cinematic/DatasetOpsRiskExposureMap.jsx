/**
 * F182 — Dataset × Ops Event × RiskSignal Operational Data Risk Exposure Map (ODREM)
 *
 * Parallel-fetches /v1/datasets + /v1/ops/events + /entities/RiskSignal
 * and keyword-correlates each dataset against ops events AND risk signals to classify:
 *
 *   FULLY_EXPOSED   — matched ops event + risk signal (active operational data risk)
 *   OPS_ONLY        — ops event match, no risk signal
 *   RISK_FLAGGED    — risk signal match, no ops event
 *   UNMONITORED     — no matches (data risk blind spot)
 *
 * Stat tiles: DATASETS / OPS EVENTS / RISK SIGNALS + four class counts + MONITORED%.
 * Red badge on unmonitored count.
 * Filter tabs ALL / FULLY_EXPOSED / OPS_ONLY / RISK_FLAGGED / UNMONITORED + text search.
 * Expand dataset → matched ops event cards (blue, type badge) + risk signal cards (red, severity badge)
 *                with relevance bars.
 * ▶ ASSESS DATA RISK → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:odrem-toggle event.
 *
 * Voice triggers:
 *   "odrem / data risk / dataset risk / operational data risk / unmonitored dataset /
 *    dataset ops / data exposure / ops dataset risk"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_044_280;
const Z_INDEX  = 243;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ODREM_RE = /\b(odrem|data[\s-]risk(?:[\s-]exposure)?|dataset[\s-]risk|operational[\s-]data[\s-]risk|unmonitored[\s-]dataset|dataset[\s-]ops|data[\s-]exposure|ops[\s-]dataset[\s-]risk)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_EXPOSED: RD,
  OPS_ONLY:      BL,
  RISK_FLAGGED:  OR,
  UNMONITORED:   AM,
};

const TABS = ["ALL", "FULLY_EXPOSED", "OPS_ONLY", "RISK_FLAGGED", "UNMONITORED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function datasetText(d) {
  return `${d.name || d.title || ""} ${d.description || d.summary || ""} ${d.type || d.format || ""} ${d.source || ""} ${(d.tags || []).join(" ")}`;
}
function opsText(e) {
  return `${e.title || e.name || ""} ${e.description || e.summary || ""} ${e.type || e.event_type || ""} ${(e.tags || []).join(" ")}`;
}
function riskText(r) {
  return `${r.title || r.name || ""} ${r.description || r.summary || ""} ${r.severity || ""} ${r.category || r.type || ""} ${(r.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [datasetsRes, opsRes, riskRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/datasets`,          { headers }),
    fetch(`${apiBase}/v1/ops/events`,        { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const datasets = datasetsRes.status === "fulfilled" && datasetsRes.value.ok
    ? normaliseArray(await datasetsRes.value.json(), ["datasets", "items"]) : [];
  const ops = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events", "items"]) : [];
  const risks = riskRes.status === "fulfilled" && riskRes.value.ok
    ? normaliseArray(await riskRes.value.json(), ["risks", "risk_signals", "items"]) : [];
  return { datasets, ops, risks };
}

function correlate(datasets, ops, risks) {
  return datasets.map(ds => {
    const kws = keywords(datasetText(ds));
    const matchedOps = ops
      .map(e => ({ ...e, _score: score(opsText(e), kws) }))
      .filter(e => e._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedRisks = risks
      .map(r => ({ ...r, _score: score(riskText(r), kws) }))
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasOps  = matchedOps.length > 0;
    const hasRisk = matchedRisks.length > 0;
    let cls;
    if (hasOps && hasRisk)       cls = "FULLY_EXPOSED";
    else if (hasOps && !hasRisk) cls = "OPS_ONLY";
    else if (!hasOps && hasRisk) cls = "RISK_FLAGGED";
    else                         cls = "UNMONITORED";
    return { ...ds, _cls: cls, _ops: matchedOps, _risks: matchedRisks };
  });
}

export async function buildOdremScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { datasets, ops, risks } = await loadAll();
  const corr        = correlate(datasets, ops, risks);
  const unmonitored = corr.filter(d => d._cls === "UNMONITORED").length;
  const fully       = corr.filter(d => d._cls === "FULLY_EXPOSED").length;
  const context     = `Datasets: ${datasets.length}, ops events: ${ops.length}, risk signals: ${risks.length}. Fully exposed (ops event + risk signal): ${fully}. Unmonitored (no coverage): ${unmonitored}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      message: `Assess JARVIS operational data risk exposure across datasets, ops events, and risk signals. ${context} Give a 2-sentence brief focusing on unmonitored datasets and data risk blind spots.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${unmonitored} datasets lack both ops event and risk signal linkage — these represent data risk blind spots in JARVIS operational coverage. ${fully} datasets are fully exposed with active ops events and risk signals correlated.`;
}

export function isOdremQuery(q) { return ODREM_RE.test(q); }

export default function DatasetOpsRiskExposureMap() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [datasets,  setDatasets]  = useState([]);
  const [ops,       setOps]       = useState([]);
  const [risks,     setRisks]     = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { datasets: ds, ops: ev, risks: rs } = await loadAll();
      setDatasets(ds); setOps(ev); setRisks(rs);
      setCorrelated(correlate(ds, ev, rs));
    } catch (e) {
      setError(e?.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) setBrief(""); return !o; });
    window.addEventListener("jarvis:odrem-toggle", onToggle);
    return () => window.removeEventListener("jarvis:odrem-toggle", onToggle);
  }, []);

  const unmonitored = correlated.filter(d => d._cls === "UNMONITORED").length;
  const fully       = correlated.filter(d => d._cls === "FULLY_EXPOSED").length;
  const opsOnly     = correlated.filter(d => d._cls === "OPS_ONLY").length;
  const riskFlagged = correlated.filter(d => d._cls === "RISK_FLAGGED").length;
  const monPct      = correlated.length
    ? Math.round(((fully + opsOnly + riskFlagged) / correlated.length) * 100)
    : 0;

  const visible = correlated.filter(d =>
    (tab === "ALL" || d._cls === tab) &&
    (!search || datasetText(d).toLowerCase().includes(search.toLowerCase()))
  );

  async function assess() {
    setAssessing(true);
    try { setBrief(await buildOdremScript()); } catch { setBrief("Unable to assess data risk exposure at this time."); }
    setAssessing(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => { if (!o) setBrief(""); return !o; })}
        title="F182 — Dataset × Ops Event × RiskSignal Operational Data Risk Exposure Map"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? RD : "rgba(6,11,22,0.85)",
          border: `1px solid ${RD}`,
          color: RD, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ ODREM{unmonitored > 0 && (
          <span style={{ marginLeft: 4, background: RD, color: "#fff", borderRadius: 2, padding: "0 3px", fontSize: 8 }}>
            {unmonitored}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 780, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, letterSpacing: 2 }}>ODREM</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Dataset × Ops Event × RiskSignal — Operational Data Risk Exposure Map</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "DATASETS",     val: datasets.length,  clr: CY },
              { label: "OPS EVENTS",   val: ops.length,       clr: BL },
              { label: "RISK SIGNALS", val: risks.length,     clr: RD },
              { label: "FULLY EXP.",   val: fully,            clr: RD },
              { label: "OPS ONLY",     val: opsOnly,          clr: BL },
              { label: "RISK FLAG.",   val: riskFlagged,      clr: OR },
              { label: "UNMONITORED",  val: unmonitored,      clr: AM },
              { label: "MONITORED%",   val: `${monPct}%`,     clr: GR },
            ].map(t => (
              <div key={t.label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
                <div style={{ color: t.clr, fontWeight: 700, fontSize: 13 }}>{t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, marginTop: 2 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#6B7280", marginBottom: 3 }}>
              <span>DATA RISK COVERAGE</span><span>{monPct}%</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${monPct}%`, background: monPct >= 70 ? GR : monPct >= 40 ? AM : RD, borderRadius: 3 }} />
            </div>
          </div>

          {/* Filter tabs + search */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? (CLASS_COLOR[t] || CY) : "rgba(255,255,255,0.04)",
                  border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : BORDER}`,
                  color: tab === t ? "#04060A" : "#9CA3AF",
                  padding: "2px 8px", borderRadius: 3, cursor: "pointer", fontSize: 9, letterSpacing: 0.5,
                }}
              >{t}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 8px", borderRadius: 3, fontSize: 9, fontFamily: FONT, width: 160 }}
            />
          </div>

          {/* Dataset list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
            {loading && <div style={{ color: "#6B7280", textAlign: "center", padding: 20 }}>Loading…</div>}
            {error   && <div style={{ color: RD, textAlign: "center", padding: 20 }}>{error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", textAlign: "center", padding: 20 }}>No datasets match current filter.</div>
            )}
            {visible.map((ds, i) => {
              const id    = ds.id || ds.dataset_id || i;
              const isExp = expanded === id;
              const clr   = CLASS_COLOR[ds._cls] || AM;
              return (
                <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
                  >
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{ds._cls}</span>
                      <span style={{ color: CY }}>{ds.name || ds.title || `Dataset ${id}`}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                      {ds._ops.length   > 0 && <span style={{ color: BL }}>OPS:{ds._ops.length}</span>}
                      {ds._risks.length > 0 && <span style={{ color: RD }}>RSK:{ds._risks.length}</span>}
                      <span>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {(ds.type || ds.format || ds.source) && (
                    <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>
                      {ds.type || ds.format}{(ds.type || ds.format) && ds.source ? " · " : ""}{ds.source || ""}
                    </div>
                  )}
                  {isExp && (
                    <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                      {ds._ops.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: BL, fontSize: 9, marginBottom: 3 }}>MATCHED OPS EVENTS</div>
                          {ds._ops.map((e, ei) => (
                            <div key={ei} style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: BL, fontSize: 10 }}>{e.title || e.name || "Event"}</span>
                                {(e.type || e.event_type) && <span style={{ background: "rgba(59,130,246,0.15)", color: BL, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{(e.type || e.event_type).toUpperCase()}</span>}
                              </div>
                              <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (e._score / 5) * 100)}%`, background: BL, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ds._risks.length > 0 && (
                        <div>
                          <div style={{ color: RD, fontSize: 9, marginBottom: 3 }}>MATCHED RISK SIGNALS</div>
                          {ds._risks.map((r, ri) => (
                            <div key={ri} style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ color: RD, fontSize: 10 }}>{r.title || r.name || "Risk Signal"}</span>
                                {r.severity && <span style={{ background: "rgba(239,68,68,0.15)", color: RD, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{r.severity.toUpperCase()}</span>}
                              </div>
                              <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: RD, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {ds._ops.length === 0 && ds._risks.length === 0 && (
                        <div style={{ color: AM, fontSize: 9, padding: "4px 0" }}>No ops event or risk signal coverage found for this dataset.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess button */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
            <button
              onClick={assess} disabled={assessing}
              style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, cursor: assessing ? "wait" : "pointer", padding: "5px 14px", borderRadius: 4, fontFamily: FONT, fontSize: 10, width: "100%" }}
            >
              {assessing ? "⟳ Assessing…" : "▶ ASSESS DATA RISK EXPOSURE"}
            </button>
            {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
          </div>
        </div>
      )}
    </>
  );
}
