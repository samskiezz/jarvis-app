/**
 * InvestmentReportRiskSkillGraphCoverage — F207
 * ◈ WRIMAP  (left:163720, bottom:8, zIndex:303)
 *
 * Fetches 5 real sources in parallel:
 *   /entities/Investment    → investments (primary dimension)
 *   /v1/reports             → reports
 *   /entities/RiskSignal    → risk signals
 *   /v1/aip/skill           → skills
 *   /v1/graph/centrality    → graph nodes
 *
 * Keyword-cross-references each investment against all 4 other sources
 * to classify:
 *   SECURED  – matched items from 3–4 sources  (fully protected financial asset)
 *   ASSESSED – matched items from 2 sources
 *   PARTIAL  – matched item from 1 source
 *   EXPOSED  – zero matches in any source (investments with no risk signal, no report,
 *               no skill match, no graph trace — fully unprotected financial assets)
 *
 * Red pulse on EXPOSED count.
 * Expandable rows: matched risk signals (severity badge) + matched reports (date badge) +
 *   matched skills (score badge) + matched graph nodes (centrality score badge).
 * ▶ ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "wealth risk"/"wrimap"/"investment coverage"/"exposed investments"/
 *   "investment risk"/"financial coverage"/"investment intelligence"
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

const WRIMAP_RE =
  /\b(wealth\.risk|wrimap|investment\.coverage|exposed\.investments|investment\.risk|financial\.coverage|investment\.intelligence)\b/i;

export function isWrimapQuery(t) { return WRIMAP_RE.test(t || ""); }

export function buildWrimapScript(exposedCount, totalCount) {
  if (exposedCount === 0) {
    return `You are JARVIS. The Investment Wealth Risk Intelligence Coverage Map shows ${totalCount} investments — all investments have at least one risk signal, report, skill match, or graph trace. Provide a one-sentence financial coverage status confirmation. Be direct and brief.`;
  }
  const pct = totalCount > 0 ? Math.round((exposedCount / totalCount) * 100) : 0;
  return `You are JARVIS. The Investment Wealth Risk Intelligence Coverage Map shows ${exposedCount} of ${totalCount} investments (${pct}%) are EXPOSED — no risk signal, no filed report, no skill match, and no graph trace. Provide a 2-sentence advisory: identify the financial risk of these fully unprotected assets, and recommend the single most impactful action to secure the most critical ones. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function safeFetch(url) {
  try {
    const r = await fetch(url, { headers: hdrs });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

async function fetchInvestments() {
  const d = await safeFetch(`${apiBase()}/entities/Investment`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.investments) ? d.investments :
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

async function fetchRiskSignals() {
  const d = await safeFetch(`${apiBase()}/entities/RiskSignal`);
  if (!d) return [];
  return Array.isArray(d) ? d :
    Array.isArray(d?.signals) ? d.signals :
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

async function fetchGraph() {
  const d = await safeFetch(`${apiBase()}/v1/graph/centrality`);
  if (!d) return [];
  const arr = Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return arr.slice(0, 200);
}

function keywords(obj) {
  const text = [
    obj.label, obj.name, obj.id, obj.title, obj.type,
    obj.category, obj.description, obj.subject, obj.topic,
    obj.service, obj.source, obj.message, obj.asset_type,
    obj.status, obj.entity_type, obj.ticker, obj.sector,
  ].filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 2);
}

function matches(invKws, items) {
  return items.filter(item => {
    const itemKws = keywords(item);
    return invKws.some(k => itemKws.includes(k)) ||
      itemKws.some(k => invKws.includes(k));
  }).slice(0, 4);
}

function classify(sourceCount) {
  if (sourceCount >= 3) return "SECURED";
  if (sourceCount === 2) return "ASSESSED";
  if (sourceCount === 1) return "PARTIAL";
  return "EXPOSED";
}

function statusColor(cls) {
  if (cls === "SECURED")  return GRN;
  if (cls === "ASSESSED") return CY;
  if (cls === "PARTIAL")  return AMB;
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

export default function InvestmentReportRiskSkillGraphCoverage() {
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
      const [investments, reports, risks, skills, graph] = await Promise.all([
        fetchInvestments(), fetchReports(), fetchRiskSignals(), fetchSkills(), fetchGraph(),
      ]);

      const built = investments.map(inv => {
        const ikws   = keywords(inv);
        const mRisk  = matches(ikws, risks);
        const mRep   = matches(ikws, reports);
        const mSkill = matches(ikws, skills);
        const mGraph = matches(ikws, graph);
        const sourceCount = [mRisk, mRep, mSkill, mGraph].filter(m => m.length > 0).length;
        return {
          inv,
          label: inv.title || inv.name || inv.id || "investment",
          status: inv.status || inv.state || null,
          cls: classify(sourceCount),
          mRisk, mRep, mSkill, mGraph,
        };
      });

      built.sort((a, b) => {
        const order = { EXPOSED: 0, PARTIAL: 1, ASSESSED: 2, SECURED: 3 };
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
    window.addEventListener("jarvis:wrimap-toggle", handler);
    return () => window.removeEventListener("jarvis:wrimap-toggle", handler);
  }, []);

  const exposedCount = rows.filter(r => r.cls === "EXPOSED").length;

  async function assess() {
    setAssessing(true);
    setAdvisory("");
    try {
      const script = buildWrimapScript(exposedCount, rows.length);
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
    position: "fixed", bottom: 8, left: 163720,
    zIndex: 303,
    padding: "3px 7px", fontSize: 10, fontFamily: "monospace",
    background: open ? CY : "#0a1628",
    color: open ? "#000" : CY,
    border: `1px solid ${CY}`,
    borderRadius: 3, cursor: "pointer", userSelect: "none",
    boxShadow: exposedCount > 0 ? `0 0 6px ${RED}` : "none",
    transition: "box-shadow 0.4s",
  };

  if (!open) {
    return (
      <button style={btnStyle} onClick={() => setOpen(true)} title="Investment Wealth Risk Intelligence Coverage Map">
        ◈ WRIMAP {exposedCount > 0 && (
          <span style={{ color: RED, fontWeight: 700 }}> [{exposedCount}]</span>
        )}
      </button>
    );
  }

  const panelStyle = {
    position: "fixed", bottom: 32, left: 163440,
    width: 540, maxHeight: 480,
    background: "rgba(6,10,22,0.97)", border: `1px solid ${CY}`,
    borderRadius: 6, zIndex: 303, overflowY: "auto",
    fontFamily: "monospace", fontSize: 11, color: "#cbd5e0",
    boxShadow: `0 0 20px rgba(41,231,255,0.15)`,
  };

  const hdrStyle = {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", borderBottom: `1px solid ${DIM}`,
    position: "sticky", top: 0, background: "rgba(6,10,22,0.98)", zIndex: 1,
  };

  const clsCounts = { SECURED: 0, ASSESSED: 0, PARTIAL: 0, EXPOSED: 0 };
  rows.forEach(r => { clsCounts[r.cls] = (clsCounts[r.cls] || 0) + 1; });

  return (
    <div style={panelStyle}>
      <div style={hdrStyle}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>◈ WRIMAP</span>
        <span style={{ color: "#718096", fontSize: 10 }}>Investment Wealth Risk Intelligence Coverage</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {loading && <span style={{ color: AMB, fontSize: 9 }}>loading…</span>}
          <span style={{ color: GRN,  fontSize: 9 }}>SECURED:{clsCounts.SECURED}</span>
          <span style={{ color: CY,   fontSize: 9 }}>ASSESSED:{clsCounts.ASSESSED}</span>
          <span style={{ color: AMB,  fontSize: 9 }}>PARTIAL:{clsCounts.PARTIAL}</span>
          <span style={{ color: RED,  fontSize: 9, fontWeight: 700 }}>EXPOSED:{clsCounts.EXPOSED}</span>
          <button
            onClick={assess}
            disabled={assessing || rows.length === 0}
            style={{
              padding: "2px 6px", fontSize: 9, fontFamily: "monospace",
              background: "#0a1628", color: CY, border: `1px solid ${CY}`,
              borderRadius: 2, cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              padding: "2px 5px", fontSize: 9, fontFamily: "monospace",
              background: "transparent", color: "#718096", border: `1px solid ${DIM}`,
              borderRadius: 2, cursor: "pointer",
            }}
          >✕</button>
        </span>
      </div>

      {advisory && (
        <div style={{
          margin: "6px 10px", padding: "6px 8px",
          background: "rgba(41,231,255,0.06)", border: `1px solid ${DIM}`,
          borderRadius: 4, fontSize: 10, color: "#e2e8f0", lineHeight: 1.5,
        }}>
          {advisory}
        </div>
      )}

      {rows.length === 0 && !loading && (
        <div style={{ padding: "12px 10px", color: "#718096", fontSize: 10 }}>
          No investments found. Verify /entities/Investment endpoint.
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} style={{ borderBottom: `1px solid ${DIM}` }}>
          <div
            onClick={() => toggleRow(i)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px", cursor: "pointer",
              background: expanded[i] ? "rgba(41,231,255,0.04)" : "transparent",
            }}
          >
            <span style={{
              width: 70, flexShrink: 0,
              color: statusColor(row.cls), fontWeight: 700, fontSize: 10,
            }}>
              {row.cls}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.label}
            </span>
            {row.status && (
              <span style={{
                padding: "1px 4px", borderRadius: 2, fontSize: 9,
                background: "rgba(255,255,255,0.06)", color: "#a0aec0",
              }}>
                {row.status}
              </span>
            )}
            <span style={{ color: DIM, fontSize: 9 }}>{expanded[i] ? "▲" : "▼"}</span>
          </div>

          {expanded[i] && (
            <div style={{ padding: "4px 10px 8px 20px", fontSize: 10, color: "#a0aec0" }}>
              {/* Risk Signals */}
              {row.mRisk.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: RED, marginRight: 4 }}>▸ Risk Signals:</span>
                  {row.mRisk.map((rs, j) => (
                    <span key={j} style={{
                      marginRight: 4, padding: "1px 4px", borderRadius: 2, fontSize: 9,
                      background: "rgba(255,77,109,0.12)", color: "#FC8181",
                    }}>
                      {rs.title || rs.name || rs.id}
                      {rs.severity && <span style={{ marginLeft: 3, opacity: 0.7 }}>[{rs.severity}]</span>}
                    </span>
                  ))}
                </div>
              )}
              {/* Reports */}
              {row.mRep.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: AMB, marginRight: 4 }}>▸ Reports:</span>
                  {row.mRep.map((rp, j) => (
                    <span key={j} style={{
                      marginRight: 4, padding: "1px 4px", borderRadius: 2, fontSize: 9,
                      background: "rgba(255,215,0,0.12)", color: "#F6E05E",
                    }}>
                      {rp.title || rp.name || rp.id}
                      {(rp.created_at || rp.date) && (
                        <span style={{ marginLeft: 3, opacity: 0.7 }}>
                          [{(rp.created_at || rp.date || "").toString().slice(0, 10)}]
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {/* Skills */}
              {row.mSkill.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: GRN, marginRight: 4 }}>▸ Skills:</span>
                  {row.mSkill.map((sk, j) => (
                    <span key={j} style={{
                      marginRight: 4, padding: "1px 4px", borderRadius: 2, fontSize: 9,
                      background: "rgba(0,229,160,0.12)", color: "#68D391",
                    }}>
                      {sk.title || sk.name || sk.id}
                      {sk.score != null && (
                        <span style={{ marginLeft: 3, opacity: 0.7 }}>[{Math.round(sk.score)}]</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {/* Graph nodes */}
              {row.mGraph.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: CY, marginRight: 4 }}>▸ Graph:</span>
                  {row.mGraph.map((gn, j) => (
                    <span key={j} style={{
                      marginRight: 4, padding: "1px 4px", borderRadius: 2, fontSize: 9,
                      background: "rgba(41,231,255,0.12)", color: "#76E4F7",
                    }}>
                      {gn.label || gn.name || gn.id}
                      {gn.centrality != null && (
                        <span style={{ marginLeft: 3, opacity: 0.7 }}>
                          [{typeof gn.centrality === "number" ? gn.centrality.toFixed(3) : gn.centrality}]
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {row.mRisk.length === 0 && row.mRep.length === 0 &&
               row.mSkill.length === 0 && row.mGraph.length === 0 && (
                <span style={{ color: RED, fontSize: 9 }}>
                  No cross-references found — investment is fully EXPOSED.
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
