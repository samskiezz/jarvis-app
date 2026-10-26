/**
 * DatasetSkillSwarmScenarioReportProductionReadiness — F204
 * ◈ DPSCM  (left:162040, bottom:8, zIndex:300)
 *
 * Fetches 5 real sources in parallel:
 *   /v1/datasets          → datasets (the primary dimension)
 *   /v1/aip/skill         → skills
 *   /entities/SwarmJob    → swarm jobs
 *   /v1/scenario/list     → scenarios
 *   /v1/reports           → reports
 *
 * Keyword-cross-references each dataset against all 4 other sources
 * to classify:
 *   ARMED    – matched items from 3-4 sources  (fully production-ready)
 *   CAPABLE  – matched items from 2 sources
 *   PARTIAL  – matched item from 1 source
 *   UNARMED  – zero matches in any source (blind-spot datasets — no skill, no swarm, no scenario, no report)
 *
 * Red pulse on UNARMED count.
 * Expandable rows: matched skills (score badge) + swarm jobs (status badge) +
 *   scenarios (status badge) + reports (date badge).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "dataset production"/"dpscm"/"production readiness"/
 *   "dataset command"/"armed datasets"/"unarmed datasets"/"production map"
 * Additive only — mounted via App.jsx; query intent exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#4A5568";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DPSCM_RE =
  /\b(dataset\.production|dpscm|production\.readiness|dataset\.command|armed\.datasets|unarmed\.datasets|production\.map)\b/i;

export function isDpscmQuery(t) { return DPSCM_RE.test(t || ""); }

export function buildDpscmScript(unarmedCount, totalCount) {
  if (unarmedCount === 0) {
    return `You are JARVIS. The Dataset Production Readiness Command Map shows ${totalCount} datasets — all datasets have at least one skill, swarm job, scenario, or report match. Provide a one-sentence operational production status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((unarmedCount / totalCount) * 100) : 0;
  return `You are JARVIS. The Dataset Production Readiness Command Map shows ${unarmedCount} of ${totalCount} datasets (${pct}%) are UNARMED — no skill coverage, no swarm job processing, no scenario using them, and no report derived from them. Provide a 2-sentence advisory: identify the operational risk of these production blind spots, and recommend the single most impactful action to activate these datasets. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchDatasets() {
  const d = await safeFetch(`${apiBase()}/v1/datasets`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchSkills() {
  const d = await safeFetch(`${apiBase()}/v1/aip/skill`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchSwarmJobs() {
  const d = await safeFetch(`${apiBase()}/entities/SwarmJob`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.jobs) ? d.jobs :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchScenarios() {
  const d = await safeFetch(`${apiBase()}/v1/scenario/list`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.scenarios) ? d.scenarios :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

async function fetchReports() {
  const d = await safeFetch(`${apiBase()}/v1/reports`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.reports) ? d.reports :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
}

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic,
    obj.dataset, obj.source,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(datasetKws, items) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return datasetKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => datasetKws.includes(k));
  }).slice(0, 4);
}

function classify(sourceCount) {
  if (sourceCount >= 3) return "ARMED";
  if (sourceCount === 2) return "CAPABLE";
  if (sourceCount === 1) return "PARTIAL";
  return "UNARMED";
}

function statusColor(cls) {
  if (cls === "ARMED")   return GRN;
  if (cls === "CAPABLE") return CY;
  if (cls === "PARTIAL") return AMB;
  return RED;
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { ...hdrs, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: "onyx" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  } catch { /* silent */ }
}

export default function DatasetSkillSwarmScenarioReportProductionReadiness() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [advisory, setAdvisory]   = useState("");
  const [expanded, setExpanded]   = useState({});
  const timerRef                  = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [datasets, skills, swarmJobs, scenarios, reports] = await Promise.all([
        fetchDatasets(), fetchSkills(), fetchSwarmJobs(), fetchScenarios(), fetchReports(),
      ]);

      const built = datasets.map(ds => {
        const dkws   = keywords(ds);
        const mSkill = matches(dkws, skills);
        const mSwarm = matches(dkws, swarmJobs);
        const mScene = matches(dkws, scenarios);
        const mRep   = matches(dkws, reports);
        const sourceCount = [mSkill, mSwarm, mScene, mRep].filter(m => m.length > 0).length;
        return {
          ds,
          label: ds.name || ds.title || ds.id || "dataset",
          rows_count: ds.row_count ?? ds.rows ?? ds.count ?? null,
          cls: classify(sourceCount),
          mSkill, mSwarm, mScene, mRep,
        };
      });

      built.sort((a, b) => {
        const order = { UNARMED: 0, PARTIAL: 1, CAPABLE: 2, ARMED: 3 };
        return (order[a.cls] ?? 99) - (order[b.cls] ?? 99);
      });

      setRows(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:dpscm-toggle", handler);
    return () => window.removeEventListener("jarvis:dpscm-toggle", handler);
  }, []);

  const unarmedCount = rows.filter(r => r.cls === "UNARMED").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildDpscmScript(unarmedCount, rows.length);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d = await r.json();
      const text = d.response || d.message || d.reply || d.content ||
        (typeof d === "string" ? d : JSON.stringify(d));
      setAdvisory(text);
      tts(text);
    } catch (e) {
      setAdvisory(`Advisory failed: ${e.message}`);
    } finally {
      setAssessing(false);
    }
  }

  function toggleRow(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }));
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: 162040,
    zIndex: 300,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: unarmedCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="Dataset Production Readiness Command Map">
        ◈ DPSCM {unarmedCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{unarmedCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 161760,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 300, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { ARMED: 0, CAPABLE: 0, PARTIAL: 0, UNARMED: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)} title="Close">◈ DPSCM ✕</button>
      <div style={panelStyle}>
        <div style={hdrStyle}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>DATASET PRODUCTION READINESS</span>
          {loading && <span style={{ color: AMB, fontSize: 10 }}>loading…</span>}
          <span style={{ marginLeft: "auto", color: RED, fontWeight: 700 }}>
            UNARMED: {unarmedCount}
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${DIM}` }}>
          {[
            { label: "ARMED",   color: GRN, count: clsCounts.ARMED },
            { label: "CAPABLE", color: CY,  count: clsCounts.CAPABLE },
            { label: "PARTIAL", color: AMB, count: clsCounts.PARTIAL },
            { label: "UNARMED", color: RED, count: clsCounts.UNARMED },
          ].map(t => (
            <div key={t.label} style={{
              flex: 1, textAlign: "center", padding: "4px 2px",
              border: `1px solid ${t.color}33`, borderRadius: 3,
              background: `${t.color}0f`,
            }}>
              <div style={{ color: t.color, fontWeight: 700, fontSize: 14 }}>{t.count}</div>
              <div style={{ color: "#718096", fontSize: 9 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {rows.map((r, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${DIM}22` }}>
            <div
              onClick={() => toggleRow(i)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 10px", cursor: "pointer",
                background: expanded[i] ? "rgba(41,231,255,0.04)" : "transparent",
              }}
            >
              <span style={{ color: statusColor(r.cls), fontWeight: 700, fontSize: 10, minWidth: 58 }}>
                {r.cls}
              </span>
              <span style={{ flex: 1, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
              {r.rows_count !== null && (
                <span style={{ color: "#718096", fontSize: 9 }}>
                  rows:{r.rows_count}
                </span>
              )}
              <span style={{ color: CY, fontSize: 9 }}>
                {expanded[i] ? "▲" : "▼"}
              </span>
            </div>

            {expanded[i] && (
              <div style={{ padding: "4px 10px 8px 20px", color: "#a0aec0", fontSize: 10 }}>
                {/* Skills */}
                {r.mSkill.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>SKILLS:</span>{" "}
                    {r.mSkill.map((s, j) => {
                      const score = s.score ?? s.value ?? s.level ?? null;
                      return (
                        <span key={j} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#0a2a1a", border: `1px solid ${GRN}44`,
                          color: "#68d391", fontSize: 9,
                        }}>
                          {s.name || s.title || s.id}
                          {score !== null ? ` · ${typeof score === "number" ? score.toFixed(0) : score}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>SKILLS: —</div>
                )}

                {/* Swarm Jobs */}
                {r.mSwarm.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>SWARM JOBS:</span>{" "}
                    {r.mSwarm.map((j, ji) => {
                      const st = (j.status || j.state || "").toUpperCase();
                      return (
                        <span key={ji} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a2a4a", border: `1px solid ${CY}44`,
                          color: "#90cdf4", fontSize: 9,
                        }}>
                          {j.name || j.title || j.id}{st ? ` · ${st}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>SWARM JOBS: —</div>
                )}

                {/* Scenarios */}
                {r.mScene.length > 0 ? (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>SCENARIOS:</span>{" "}
                    {r.mScene.map((s, si) => {
                      const st = (s.status || s.state || "").toUpperCase();
                      return (
                        <span key={si} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a1a2a", border: `1px solid ${AMB}44`,
                          color: "#fbb040", fontSize: 9,
                        }}>
                          {s.name || s.title || s.id}{st ? ` · ${st}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568", marginBottom: 2 }}>SCENARIOS: —</div>
                )}

                {/* Reports */}
                {r.mRep.length > 0 ? (
                  <div>
                    <span style={{ color: "#c084fc" }}>REPORTS:</span>{" "}
                    {r.mRep.map((rp, ri) => {
                      const dt = rp.date || rp.created_at || rp.updated_at || "";
                      const dateStr = dt ? new Date(dt).toLocaleDateString() : "";
                      return (
                        <span key={ri} style={{
                          display: "inline-block", margin: "1px 2px",
                          padding: "1px 5px", borderRadius: 2,
                          background: "#1a0a2a", border: "1px solid #c084fc44",
                          color: "#c084fc", fontSize: 9,
                        }}>
                          {rp.title || rp.name || rp.id}{dateStr ? ` · ${dateStr}` : ""}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#4a5568" }}>REPORTS: —</div>
                )}
              </div>
            )}
          </div>
        ))}

        {rows.length === 0 && !loading && (
          <div style={{ padding: "16px 10px", color: "#4a5568", textAlign: "center" }}>
            No dataset data returned.
          </div>
        )}

        {/* Assess */}
        <div style={{ padding: "8px 10px", borderTop: `1px solid ${DIM}`, position: "sticky", bottom: 0, background: "rgba(6,10,22,0.98)" }}>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              width: "100%", padding: "5px 0", fontSize: 11,
              background: assessing ? "#1a2a4a" : `${CY}1a`,
              color: CY, border: `1px solid ${CY}`,
              borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: "monospace",
            }}
          >
            {assessing ? "▶ ASSESSING…" : `▶ ASSESS (${unarmedCount} UNARMED of ${rows.length} datasets)`}
          </button>
          {advisory && (
            <div style={{
              marginTop: 6, padding: "6px 8px",
              background: "rgba(41,231,255,0.05)", border: `1px solid ${CY}33`,
              borderRadius: 3, color: "#e2e8f0", lineHeight: 1.5,
              fontSize: 10, whiteSpace: "pre-wrap",
            }}>
              {advisory}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
