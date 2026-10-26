/**
 * JarvisIntelligenceProductionIndex — F202
 * Fetches 6 real sources in parallel:
 *   /v1/jarvis/system/status  → service health %
 *   /v1/cinematic/brain       → brain size (nodes + synapses)
 *   /v1/datasets              → data volume (dataset count + total rows)
 *   /v1/reports               → intelligence output (report count)
 *   /v1/investigations        → case load (investigation count)
 *   /v1/aip/skill             → capability score (mean skill score)
 *
 * Computes a composite PRODUCTION HEALTH score (0-100).
 * Status: GREEN ≥80, AMBER 50-79, RED <50.
 * ASSESS → /v1/jarvis/agent/chat advisory + TTS.
 * Voice triggers: "production index"/"jiprod"/"intelligence production"/
 *   "production score"/"system production"/"jarvis production"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const POLL = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const JIPROD_RE =
  /\b(production\.index|jiprod|intelligence\.production|production\.score|system\.production|jarvis\.production|production\.health|jarvis\.health\.score|intel\.production|jiprod\.toggle)\b/i;

export function isJiprodQuery(t) { return JIPROD_RE.test(t || ""); }

export function buildJiprodScript(dims, composite) {
  const weak = dims.filter(d => d.score < 50);
  if (composite >= 80) {
    return `You are JARVIS. The Intelligence Production Index is ${composite}/100 — HEALTHY across all 6 dimensions. Provide a one-sentence operational status confirmation. Be direct and brief.`;
  }
  const weakList = weak.map(d => `${d.label} (${d.score}/100)`).join(", ");
  return `You are JARVIS. The Intelligence Production Index is ${composite}/100 — ${composite >= 50 ? "DEGRADED" : "CRITICAL"}. The following dimensions are under-performing: ${weakList || "multiple dimensions"}. Provide a 2-sentence operational advisory: identify the weakest dimension and recommend the single most impactful action to improve the production health score. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchSystemStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, { headers: hdrs });
  if (!r.ok) return null;
  return r.json();
}

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, { headers: hdrs });
  if (!r.ok) return null;
  return r.json();
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items;
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.reports) ? d.reports :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items;
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.investigations) ? d.investigations :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items;
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function computeDimensions(sysStatus, brain, datasets, reports, investigations, skills) {
  // 1. Service health: % healthy services
  let serviceScore = 0;
  let serviceDetail = "N/A";
  if (sysStatus) {
    const services = sysStatus.services || sysStatus.components || [];
    if (Array.isArray(services) && services.length > 0) {
      const healthy = services.filter(s => {
        const st = (s.status || s.state || s.health || "").toLowerCase();
        return st === "healthy" || st === "ok" || st === "up" || st === "running";
      }).length;
      serviceScore = Math.round((healthy / services.length) * 100);
      serviceDetail = `${healthy}/${services.length} healthy`;
    } else {
      // flat status object
      const st = (sysStatus.status || sysStatus.state || "").toLowerCase();
      serviceScore = (st === "healthy" || st === "ok" || st === "up") ? 100 : 40;
      serviceDetail = sysStatus.status || sysStatus.state || "unknown";
    }
  }

  // 2. Brain size score (nodes + synapses; cap at 500 nodes = 100)
  let brainScore = 0;
  let brainDetail = "N/A";
  if (brain) {
    const nodes = brain.nodes || brain.node_count || brain.total_nodes || 0;
    const synapses = brain.synapses || brain.synapse_count || brain.edges || brain.total_edges || 0;
    brainScore = clamp(Math.round((nodes / 500) * 70 + (synapses / 2000) * 30), 0, 100);
    if (brainScore === 0 && (nodes > 0 || synapses > 0)) brainScore = 20;
    brainDetail = `${nodes} nodes · ${synapses} synapses`;
  }

  // 3. Data volume score (dataset count; cap at 20 = 100; bonus for rows)
  let dataScore = 0;
  let dataDetail = "N/A";
  if (datasets !== null) {
    const count = datasets.length;
    const totalRows = datasets.reduce((s, ds) => {
      const r = ds.row_count || ds.rows || ds.count || 0;
      return s + (typeof r === "number" ? r : 0);
    }, 0);
    dataScore = clamp(Math.round((count / 20) * 70 + (totalRows / 100000) * 30), 0, 100);
    if (dataScore === 0 && count > 0) dataScore = 15;
    dataDetail = `${count} datasets · ${totalRows.toLocaleString()} rows`;
  }

  // 4. Intelligence output score (report count; cap at 50 = 100)
  let reportScore = 0;
  let reportDetail = "N/A";
  if (reports !== null) {
    const count = reports.length;
    reportScore = clamp(Math.round((count / 50) * 100), 0, 100);
    if (reportScore === 0 && count > 0) reportScore = 10;
    reportDetail = `${count} report${count !== 1 ? "s" : ""}`;
  }

  // 5. Case load score (investigation count; active/closed are both signs of activity)
  let caseScore = 0;
  let caseDetail = "N/A";
  if (investigations !== null) {
    const total = investigations.length;
    const active = investigations.filter(i => {
      const st = (i.status || i.state || "").toLowerCase();
      return st === "active" || st === "open" || st === "in_progress";
    }).length;
    const closed = total - active;
    caseScore = clamp(
      Math.round((total / 30) * 50 + (closed / Math.max(total, 1)) * 50),
      0, 100
    );
    if (caseScore === 0 && total > 0) caseScore = 15;
    caseDetail = `${total} total · ${active} active · ${closed} closed`;
  }

  // 6. Capability score (mean skill score, normalised 0-100)
  let capScore = 0;
  let capDetail = "N/A";
  if (skills !== null && skills.length > 0) {
    const scored = skills.filter(s => typeof s.score === "number" || typeof s.proficiency === "number");
    if (scored.length > 0) {
      const mean = scored.reduce((s, sk) => s + (sk.score ?? sk.proficiency), 0) / scored.length;
      capScore = clamp(Math.round(mean), 0, 100);
      capDetail = `${scored.length} skills · avg ${capScore}`;
    } else {
      capScore = 50;
      capDetail = `${skills.length} skills (no scores)`;
    }
  }

  const dims = [
    { key: "service",  label: "Services",   score: serviceScore, detail: serviceDetail, color: PRP },
    { key: "brain",    label: "Brain",       score: brainScore,   detail: brainDetail,  color: CY  },
    { key: "data",     label: "Data Volume", score: dataScore,    detail: dataDetail,   color: AMB },
    { key: "report",   label: "Intel Output",score: reportScore,  detail: reportDetail, color: GRN },
    { key: "case",     label: "Cases",       score: caseScore,    detail: caseDetail,   color: CY  },
    { key: "cap",      label: "Capability",  score: capScore,     detail: capDetail,    color: PRP },
  ];

  const weights = [0.20, 0.20, 0.15, 0.15, 0.15, 0.15];
  const composite = Math.round(dims.reduce((s, d, i) => s + d.score * weights[i], 0));

  return { dims, composite };
}

function scoreColor(s) {
  if (s >= 80) return GRN;
  if (s >= 50) return AMB;
  return RED;
}

function ScoreBar({ score }) {
  const color = scoreColor(score);
  return (
    <div style={{ height: 4, background: "#ffffff11", borderRadius: 2, overflow: "hidden", marginTop: 3 }}>
      <div style={{
        height: "100%",
        width: `${score}%`,
        background: color,
        borderRadius: 2,
        transition: "width 0.6s ease",
        boxShadow: `0 0 4px ${color}88`,
      }} />
    </div>
  );
}

export default function JarvisIntelligenceProductionIndex() {
  const [open, setOpen]       = useState(false);
  const [dims, setDims]       = useState([]);
  const [composite, setComp]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sysStatus, brain, datasets, reports, investigations, skills] = await Promise.all([
        fetchSystemStatus(),
        fetchBrain(),
        fetchDatasets(),
        fetchReports(),
        fetchInvestigations(),
        fetchSkills(),
      ]);
      const result = computeDimensions(sysStatus, brain, datasets, reports, investigations, skills);
      setDims(result.dims);
      setComp(result.composite);
    } catch (e) {
      setError(e.message || "Fetch error");
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
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:jiprod-toggle", h);
    return () => window.removeEventListener("jarvis:jiprod-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (!dims.length || composite === null) return;
    const script = buildJiprodScript(dims, composite);
    const base = apiBase();
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || d.text || "";
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { ...hdrs, "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch (_) { /* TTS best-effort */ }
  }, [dims, composite]);

  const compColor = composite !== null ? scoreColor(composite) : CY;
  const compLabel = composite === null ? "—" :
    composite >= 80 ? "HEALTHY" :
    composite >= 50 ? "DEGRADED" : "CRITICAL";

  if (!open) {
    const showAlert = composite !== null && composite < 50;
    return (
      <div style={{ position: "fixed", left: 160920, bottom: 8, zIndex: 298,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        {showAlert && (
          <div style={{ background: RED, color: "#000", fontSize: 9, fontWeight: 700,
            borderRadius: 6, padding: "1px 5px", animation: "pulse 1.5s infinite",
            boxShadow: `0 0 6px ${RED}` }}>
            {composite}
          </div>
        )}
        <button onClick={() => setOpen(true)} style={{
          background: "transparent", border: `1px solid ${CY}`, color: CY,
          fontSize: 10, fontFamily: "monospace", padding: "3px 7px",
          cursor: "pointer", borderRadius: 4, letterSpacing: 1,
          boxShadow: `0 0 6px ${CY}44`, whiteSpace: "nowrap",
        }}>◈ JIPROD</button>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", left: 160920, bottom: 8, zIndex: 298,
      width: 400, background: "#0A0F1A", border: `1px solid ${CY}55`,
      borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: CY,
      boxShadow: `0 0 18px ${CY}22`, maxHeight: 500, display: "flex",
      flexDirection: "column" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 10px", borderBottom: `1px solid ${CY}33`, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, letterSpacing: 1 }}>◈ JIPROD</span>
        <span style={{ fontSize: 9, color: "#ffffff66" }}>Intelligence Production Index</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={assess} style={{ background: `${CY}22`, border: `1px solid ${CY}`,
            color: CY, fontSize: 9, padding: "2px 7px", cursor: "pointer",
            borderRadius: 3, letterSpacing: 1 }}>▶ ASSESS</button>
          <button onClick={() => setOpen(false)} style={{ background: "transparent",
            border: `1px solid ${CY}44`, color: CY, fontSize: 10,
            padding: "1px 6px", cursor: "pointer", borderRadius: 3 }}>✕</button>
        </div>
      </div>

      {/* Composite score */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
        flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 60, height: 60, borderRadius: "50%",
          border: `3px solid ${compColor}`,
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", flexShrink: 0,
          boxShadow: `0 0 12px ${compColor}44`,
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: compColor, lineHeight: 1 }}>
            {composite !== null ? composite : "—"}
          </span>
          <span style={{ fontSize: 7, color: `${compColor}aa`, letterSpacing: 0.5 }}>/100</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: compColor, letterSpacing: 1 }}>
            {compLabel}
          </div>
          <div style={{ fontSize: 9, color: "#ffffff55", marginTop: 2 }}>
            composite production health score
          </div>
          <div style={{ height: 6, background: "#ffffff11", borderRadius: 3,
            overflow: "hidden", marginTop: 5 }}>
            <div style={{
              height: "100%",
              width: `${composite ?? 0}%`,
              background: compColor,
              borderRadius: 3,
              transition: "width 0.8s ease",
              boxShadow: `0 0 6px ${compColor}`,
            }} />
          </div>
        </div>
        <button onClick={load} disabled={loading}
          style={{ background: "transparent", border: `1px solid ${CY}44`,
            color: CY, fontSize: 9, padding: "2px 6px", cursor: "pointer",
            borderRadius: 3, alignSelf: "flex-start" }}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      {/* Dimension tiles */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 10px" }}>
        {error && (
          <div style={{ color: RED, fontSize: 10, marginBottom: 6 }}>{error}</div>
        )}
        {dims.length === 0 && !loading && !error && (
          <div style={{ color: "#ffffff44", textAlign: "center", padding: 10 }}>Loading…</div>
        )}
        {dims.map(d => (
          <div key={d.key} style={{
            marginBottom: 8, padding: "7px 10px",
            background: "#ffffff07", borderRadius: 5,
            border: `1px solid ${d.color}22`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 2 }}>
              <span style={{ fontSize: 10, color: d.color, letterSpacing: 0.5 }}>
                {d.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(d.score) }}>
                {d.score}<span style={{ fontSize: 8, color: "#ffffff44" }}>/100</span>
              </span>
            </div>
            <ScoreBar score={d.score} />
            <div style={{ fontSize: 8, color: "#ffffff44", marginTop: 3 }}>
              {d.detail}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "4px 10px", borderTop: `1px solid ${CY}22`,
        fontSize: 9, color: "#ffffff44", flexShrink: 0, display: "flex",
        justifyContent: "space-between" }}>
        <span>System · Brain · Data · Reports · Cases · Skills</span>
        <span>60s auto-refresh</span>
      </div>
    </div>
  );
}
