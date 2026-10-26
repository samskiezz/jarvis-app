/**
 * SwarmRiskContactDatasetGraphDefenseMap — F198
 * Fetches /entities/SwarmJob + /entities/RiskSignal + /entities/Contact +
 * /v1/datasets + /v1/graph/centrality and cross-references each swarm job
 * against all 4 other sources.
 * Classifies:
 *   COVERED — swarm job has matches across all 4 sources
 *   ACTIVE  — swarm job has 2–3 source matches
 *   PARTIAL — swarm job has 1 source match
 *   BLIND   — swarm job has 0 matches (no risk signal, no contact, no dataset, no graph trace)
 * Red pulse on BLIND count (fully unmonitored automation blind spots).
 * ASSESS → /v1/jarvis/agent/chat advisory for blind swarm jobs + TTS.
 * Voice triggers: "swarm defense"/"sdcmap"/"blind automation"/"swarm coverage"/
 *   "automated defense"/"unmonitored swarm"/"swarm graph"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const ORG = "#FF9A3C";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SDCMAP_RE =
  /\b(swarm.defense|sdcmap|blind.automation|swarm.coverage|automated.defense|unmonitored.swarm|swarm.graph|swarm.defense.map|swarm.risk.coverage|sdcmap.toggle)\b/i;

export function isSdcmapQuery(t) { return SDCMAP_RE.test(t || ""); }

export function buildSdcmapScript(rows) {
  const blind = rows.filter(r => r.cls === "BLIND");
  if (!blind.length) return "All swarm jobs have at least one supporting coverage source. No fully blind automation detected.";
  return `You are JARVIS. ${blind.length} swarm job(s) are BLIND — they have no matched risk signal, no contact owner, no dataset backing, and no graph trace. List each blind swarm job by name and status. Then provide a 2-sentence automated defense advisory: what risk signals, contacts, or datasets should be linked to each blind swarm job to bring it under operational coverage. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchSwarmJobs() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.swarmJobs) ? d.swarmJobs :
    Array.isArray(d?.jobs) ? d.jobs :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: (i.name || i.title || i.job || "").toString(),
    status: i.status || i.state || "",
    progress: typeof i.progress === "number" ? i.progress : null,
  }));
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.risks) ? d.risks :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(i => ({
    id: i.id || i._id || String(Math.random()),
    name: (i.name || i.title || i.signal || "").toString(),
    severity: i.severity || i.level || i.priority || "",
  }));
}

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.contacts) ? d.contacts :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(c => ({
    id: c.id || c._id || String(Math.random()),
    name: (c.name || c.full_name || "").toString(),
    role: c.role || c.title || "",
    org: c.org || c.organization || c.company || "",
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || ds.label || "").toString(),
    rows: typeof ds.row_count === "number" ? ds.row_count :
          typeof ds.rows === "number" ? ds.rows :
          typeof ds.count === "number" ? ds.count : null,
  }));
}

async function fetchGraph() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.name || n.label || n.entity || "").toString(),
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : null,
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matchPool(item, pool) {
  const ik = kw(item.name);
  return pool.filter(p => {
    const pk = kw(p.name);
    return ik.some(w => pk.includes(w)) || pk.some(w => ik.includes(w));
  });
}

function classify(job, risks, contacts, datasets, graph) {
  const mr = matchPool(job, risks);
  const mc = matchPool(job, contacts);
  const md = matchPool(job, datasets);
  const mg = matchPool(job, graph);
  const score = [mr.length > 0, mc.length > 0, md.length > 0, mg.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "COVERED" :
    score >= 2  ? "ACTIVE" :
    score === 1 ? "PARTIAL" : "BLIND";
  return { ...job, cls, matchedRisks: mr, matchedContacts: mc, matchedDatasets: md, matchedGraph: mg };
}

const clsColor = { COVERED: GRN, ACTIVE: CY, PARTIAL: AMB, BLIND: RED };
const clsOrder = { COVERED: 0, ACTIVE: 1, PARTIAL: 2, BLIND: 3 };

const StatusBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${AMB}`, color: AMB, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const SevBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${RED}`, color: RED, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const RowBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${ORG}`, color: ORG, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{v.toLocaleString()} rows</span> : null;

export default function SwarmRiskContactDatasetGraphDefenseMap() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [expanded, setExp]    = useState({});
  const [filter, setFilter]   = useState("ALL");
  const [assessing, setAss]   = useState(false);
  const [advice, setAdvice]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [jobs, risks, contacts, datasets, graph] = await Promise.all([
        fetchSwarmJobs(), fetchRiskSignals(), fetchContacts(),
        fetchDatasets(), fetchGraph(),
      ]);
      const classified = jobs
        .map(job => classify(job, risks, contacts, datasets, graph))
        .sort((a, b) => clsOrder[a.cls] - clsOrder[b.cls]);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:sdcmap-toggle", toggle);
    return () => window.removeEventListener("jarvis:sdcmap-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildSdcmapScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setAdvice(text);
      if (text) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 400) }),
          });
        } catch { /* TTS optional */ }
      }
    } catch (e) {
      setAdvice("Advisory unavailable: " + e.message);
    } finally {
      setAss(false);
    }
  }, [rows]);

  const blindCount = rows.filter(r => r.cls === "BLIND").length;
  const visible    = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="SwarmJob × RiskSignal × Contact × Dataset × Graph Automated Defense Coverage Map"
        style={{
          position: "fixed", bottom: 8, left: 158680, zIndex: 294,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${blindCount > 0 ? RED : ORG}`,
          color: blindCount > 0 ? RED : ORG, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: blindCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: blindCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ SDCMAP{blindCount > 0 ? ` ⚠${blindCount}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 560, maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, fontSize: 12,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${CY}33` }}>
        <span style={{ flex: 1, fontWeight: "bold", fontSize: 11 }}>
          ◈ SDCMAP — SWARM × RISK × CONTACT × DATASET × GRAPH
        </span>
        {blindCount > 0 && (
          <span style={{ color: RED, fontWeight: "bold", marginRight: 10,
            animation: "pulse-red 2s infinite" }}>
            ⚠ {blindCount} BLIND
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "COVERED", "ACTIVE", "PARTIAL", "BLIND"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${clsColor[f] || CY}22` : "transparent",
            border: `1px solid ${clsColor[f] || CY}55`,
            color: clsColor[f] || CY, borderRadius: 3, padding: "2px 7px",
            cursor: "pointer", fontSize: 10,
          }}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {f === "ALL" ? rows.length : rows.filter(r => r.cls === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ opacity: 0.5, padding: 8 }}>No swarm jobs to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 66 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.status && <StatusBadge s={row.status} />}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedRisks.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: RED }}>risk signals: </span>
                    {row.matchedRisks.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<SevBadge s={s.severity} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedContacts.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>contacts: </span>
                    {row.matchedContacts.slice(0, 3).map(c => (
                      <span key={c.id}>{c.name}
                        {c.role && <span style={{ fontSize: 10, color: AMB, marginLeft: 3 }}>{c.role}</span>}
                        {c.org && <span style={{ fontSize: 10, color: PRP, marginLeft: 3 }}>{c.org}</span>}
                        {" "}
                      </span>
                    ))}
                  </div>
                )}
                {row.matchedDatasets.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: ORG }}>datasets: </span>
                    {row.matchedDatasets.slice(0, 3).map(ds => (
                      <span key={ds.id}>{ds.name}<RowBadge v={ds.rows} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedGraph.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>graph nodes: </span>
                    {row.matchedGraph.slice(0, 3).map(n => (
                      <span key={n.id}>{n.name}<ScoreBadge v={n.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "BLIND" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No risk signal, contact owner, dataset, or graph trace — fully unmonitored automation blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}33` }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: `${RED}22`, border: `1px solid ${RED}88`,
            color: RED, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS BLIND SWARM JOBS"}
        </button>
        {advice && (
          <div style={{ marginTop: 8, color: CY, fontSize: 11, opacity: 0.9,
            maxHeight: 120, overflowY: "auto", borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}
