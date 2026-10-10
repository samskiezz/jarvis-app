/**
 * F735 — Graph Node × Risk Signal × SwarmJob Triple Nexus (GRNRSTRI)
 *
 * Cross-references /v1/graph/centrality × /entities/RiskSignal × /entities/SwarmJob.
 * Keyword-matches each high-centrality node against live risk signals and swarm jobs.
 *
 *   FULLY_COVERED — node matches ≥1 risk signal AND ≥1 swarm job
 *   RISK_ONLY     — matches a risk signal, no swarm job backing
 *   SWARM_ONLY    — backed by a swarm job, no risk signal
 *   DARK          — no risk signal or swarm job matches this node
 *
 * Stat tiles: NODES | FULLY COVERED | RISK ONLY | SWARM ONLY | DARK | COVERAGE %
 * Filter tabs: ALL | FULLY_COVERED | RISK_ONLY | SWARM_ONLY | DARK + search
 * Expand node → matched risk signals (severity badge + hits) + matched swarm jobs (status + hits)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence graph-coverage brief + TTS
 *
 * Button: ◈ GRNRSTRI  left:904680 bottom:8 zIndex:594
 * Event:  jarvis:grnrstri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "grnrstri / graph node risk swarm / node risk coverage / dark nodes /
 *          graph coverage triple / node swarm coverage / graph triple nexus /
 *          covered nodes / uncovered graph / node monitoring"
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";
const DK  = "#556677";

const BTN_LEFT = 904680;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GRNRSTRI_RE =
  /\b(grnrstri|graph[\s._-]?node[\s._-]?risk[\s._-]?swarm|node[\s._-]?risk[\s._-]?coverage|dark[\s._-]?nodes|graph[\s._-]?coverage[\s._-]?triple|node[\s._-]?swarm[\s._-]?coverage|graph[\s._-]?triple[\s._-]?nexus|covered[\s._-]?nodes|uncovered[\s._-]?graph|node[\s._-]?monitoring)\b/i;

export function isGrnrstriQuery(t) {
  return GRNRSTRI_RE.test(t || "");
}

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return (env.VITE_API_BASE_URL || "").replace(/\/$/, "") || "http://localhost:8000";
}

function normaliseCentrality(data) {
  if (!data) return [];
  const raw = data.nodes || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.slice(0, 60).map((n, i) => ({
    id:    n.id    || n.node_id || `node-${i}`,
    label: (n.label || n.name  || n.entity || n.title || `Node ${i + 1}`).trim(),
    type:  n.type  || n.entity_type || n.kind || "",
    score: typeof n.score === "number" ? n.score : (n.centrality_score || n.value || 0),
    tags:  [n.label, n.name, n.type, n.entity_type, ...(n.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw = data.signals || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:       s.id       || `sig-${i}`,
    title:    s.title    || s.name || s.signal_name || `Signal ${i + 1}`,
    severity: (s.severity || s.level || s.priority || "MEDIUM").toUpperCase(),
    source:   s.source   || s.origin || "",
    tags:     [s.title, s.name, s.source, s.category, ...(s.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseJobs(data) {
  if (!data) return [];
  const raw = data.jobs || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((j, i) => ({
    id:     j.id     || `job-${i}`,
    name:   j.name   || j.title || j.job_name || `Job ${i + 1}`,
    status: (j.status || j.state || "UNKNOWN").toUpperCase(),
    kind:   j.kind   || j.type  || "",
    tags:   [j.name, j.title, j.kind, j.type, ...(j.tags || [])].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function kw(obj) {
  return [obj.label || obj.title || obj.name, ...(obj.tags || [])].filter(Boolean).join(" ").toLowerCase();
}

function score(aKw, bKw) {
  const words = aKw.split(/\s+/).filter(w => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classify(status) {
  if (status === "FULLY_COVERED") return "FULLY_COVERED";
  if (status === "RISK_ONLY")     return "RISK_ONLY";
  if (status === "SWARM_ONLY")    return "SWARM_ONLY";
  return "DARK";
}

function buildTriple(nodes, signals, jobs) {
  return nodes.map(node => {
    const nKw = kw(node);
    const matchedSignals = signals
      .map(s => ({ ...s, hits: score(nKw, kw(s)) }))
      .filter(s => s.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);
    const matchedJobs = jobs
      .map(j => ({ ...j, hits: score(nKw, kw(j)) }))
      .filter(j => j.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 4);
    const hasRisk  = matchedSignals.length > 0;
    const hasSwarm = matchedJobs.length > 0;
    let status;
    if (hasRisk && hasSwarm) status = "FULLY_COVERED";
    else if (hasRisk)        status = "RISK_ONLY";
    else if (hasSwarm)       status = "SWARM_ONLY";
    else                     status = "DARK";
    return { ...node, status, matchedSignals, matchedJobs };
  });
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [cR, sR, jR] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`, { headers }),
    fetch(`${base}/entities/RiskSignal`,  { headers }),
    fetch(`${base}/entities/SwarmJob`,    { headers }),
  ]);
  const cJ = cR.ok ? await cR.json() : [];
  const sJ = sR.ok ? await sR.json() : [];
  const jJ = jR.ok ? await jR.json() : [];
  return {
    nodes:   normaliseCentrality(cJ),
    signals: normaliseSignals(sJ),
    jobs:    normaliseJobs(jJ),
  };
}

export async function buildGrnrstriScript() {
  try {
    const { nodes, signals, jobs } = await fetchAll();
    const rows = buildTriple(nodes, signals, jobs);
    const fc   = rows.filter(r => r.status === "FULLY_COVERED").length;
    const dark = rows.filter(r => r.status === "DARK").length;
    const covPct = rows.length ? Math.round((fc / rows.length) * 100) : 0;
    const topDark = rows.filter(r => r.status === "DARK").slice(0, 3).map(r => r.label).join(", ");
    return (
      `Graph-node triple nexus: ${nodes.length} high-centrality nodes assessed against ` +
      `${signals.length} risk signals and ${jobs.length} swarm jobs. ` +
      `${fc} nodes fully covered (${covPct}%), ${dark} nodes dark with no risk or swarm backing.` +
      (topDark ? ` Unmonitored nodes include: ${topDark}.` : " All nodes have at least one signal or swarm match.")
    );
  } catch (e) {
    return `Graph-node triple nexus error: ${e.message}`;
  }
}

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GN };
const STATUS_COLOR = {
  FULLY_COVERED: GN,
  RISK_ONLY:     AM,
  SWARM_ONLY:    CY,
  DARK:          DK,
};
const JOB_STATUS_COLOR = {
  RUNNING:   GN,
  COMPLETED: CY,
  FAILED:    RD,
  PENDING:   AM,
  PAUSED:    PR,
};

const TABS = ["ALL", "FULLY_COVERED", "RISK_ONLY", "SWARM_ONLY", "DARK"];

export default function GraphNodeRiskSwarmTriple() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { nodes, signals, jobs } = await fetchAll();
      setRows(buildTriple(nodes, signals, jobs));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); if (!rows.length) load(); };
    window.addEventListener("jarvis:grnrstri-toggle", toggle);
    return () => window.removeEventListener("jarvis:grnrstri-toggle", toggle);
  }, [load, rows.length]);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return r.label.toLowerCase().includes(q) || r.type.toLowerCase().includes(q);
  });

  const fc    = rows.filter(r => r.status === "FULLY_COVERED").length;
  const ro    = rows.filter(r => r.status === "RISK_ONLY").length;
  const so    = rows.filter(r => r.status === "SWARM_ONLY").length;
  const dark  = rows.filter(r => r.status === "DARK").length;
  const covPct = rows.length ? Math.round((fc / rows.length) * 100) : 0;

  async function assess() {
    setAssessing(true);
    try {
      const brief = await buildGrnrstriScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Graph node triple-nexus assessment. Context: ${brief}. Provide a 2-sentence strategic recommendation on graph monitoring gaps.`,
        }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); if (!rows.length) load(); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 594,
          background: "rgba(0,229,160,0.12)", border: "1px solid #00E5A0",
          color: "#00E5A0", fontFamily: "monospace", fontSize: 11,
          padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          whiteSpace: "nowrap",
        }}
      >
        ◈ GRNRSTRI
        {dark > 0 && (
          <span style={{
            marginLeft: 4, background: DK, color: "#fff",
            borderRadius: 2, padding: "1px 5px", fontWeight: 700,
          }}>{dark}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 0, top: 0, width: "100vw", height: "100vh",
      background: "rgba(0,0,0,0.85)", zIndex: 9200,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "monospace",
    }}>
      <div style={{
        background: "#0A0F1A", border: "1px solid #00E5A0",
        borderRadius: 8, width: "min(900px,96vw)", maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px", borderBottom: "1px solid #1A2535",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "#00E5A0", fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
            ◈ GRAPH NODE × RISK SIGNAL × SWARM TRIPLE NEXUS
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={assess} disabled={assessing}
              style={{
                background: "rgba(0,229,160,0.15)", border: "1px solid #00E5A0",
                color: "#00E5A0", padding: "3px 10px", borderRadius: 3,
                cursor: "pointer", fontSize: 11,
              }}
            >
              {assessing ? "..." : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              style={{
                background: "transparent", border: "1px solid #334",
                color: DIM, padding: "3px 8px", borderRadius: 3,
                cursor: "pointer", fontSize: 11,
              }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "transparent", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: "1px solid #1A2535" }}>
          {[
            { label: "NODES",         val: rows.length, col: CY },
            { label: "FULLY COVERED", val: fc,          col: GN },
            { label: "RISK ONLY",     val: ro,          col: AM },
            { label: "SWARM ONLY",    val: so,          col: PR },
            { label: "DARK",          val: dark,        col: DK },
            { label: "COVERAGE",      val: `${covPct}%`, col: CY },
          ].map(({ label, val, col }) => (
            <div key={label} style={{
              flex: 1, background: "rgba(255,255,255,0.04)",
              borderRadius: 4, padding: "8px 6px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Tabs + search */}
        <div style={{
          display: "flex", gap: 4, padding: "8px 16px",
          borderBottom: "1px solid #1A2535", alignItems: "center", flexWrap: "wrap",
        }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(0,229,160,0.18)" : "transparent",
              border: `1px solid ${tab === t ? "#00E5A0" : "#334"}`,
              color: tab === t ? "#00E5A0" : DIM,
              borderRadius: 3, padding: "3px 8px", cursor: "pointer", fontSize: 10,
            }}>{t}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search nodes…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.05)",
              border: "1px solid #334", color: "#ccc",
              borderRadius: 3, padding: "3px 8px", fontSize: 11, width: 150,
            }}
          />
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading && (
            <div style={{ color: DIM, padding: 16, textAlign: "center", fontSize: 12 }}>Loading…</div>
          )}
          {err && (
            <div style={{ color: RD, padding: 16, textAlign: "center", fontSize: 12 }}>Error: {err}</div>
          )}
          {!loading && !err && filtered.length === 0 && (
            <div style={{ color: DIM, padding: 16, textAlign: "center", fontSize: 12 }}>
              No nodes match.
            </div>
          )}
          {filtered.map(row => (
            <div key={row.id}>
              <div
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 16px", borderBottom: "1px solid #111820",
                  cursor: "pointer",
                  background: expanded === row.id ? "rgba(0,229,160,0.05)" : "transparent",
                }}
              >
                <span style={{
                  color: STATUS_COLOR[row.status] || DIM,
                  fontSize: 10, fontWeight: 700, minWidth: 100,
                }}>{row.status}</span>
                <span style={{ color: "#ddd", fontSize: 12, flex: 1 }}>{row.label}</span>
                {row.type && (
                  <span style={{
                    color: "#000", background: CY, fontSize: 9,
                    borderRadius: 2, padding: "1px 5px", fontWeight: 700,
                  }}>{row.type}</span>
                )}
                <span style={{ color: DIM, fontSize: 10 }}>
                  {row.matchedSignals.length}R · {row.matchedJobs.length}S
                </span>
                <span style={{ color: DIM, fontSize: 11 }}>
                  {expanded === row.id ? "▲" : "▼"}
                </span>
              </div>

              {expanded === row.id && (
                <div style={{
                  padding: "8px 24px 12px",
                  background: "rgba(0,0,0,0.3)",
                  borderBottom: "1px solid #111820",
                  display: "flex", gap: 24, flexWrap: "wrap",
                }}>
                  {/* Risk signals column */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: AM, fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>
                      RISK SIGNALS ({row.matchedSignals.length})
                    </div>
                    {row.matchedSignals.length === 0 ? (
                      <div style={{ color: DIM, fontSize: 11 }}>No signal matches.</div>
                    ) : row.matchedSignals.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                        <span style={{
                          color: "#000", background: SEV_COLOR[s.severity] || DIM,
                          fontSize: 9, fontWeight: 700, borderRadius: 2,
                          padding: "1px 5px", minWidth: 52, textAlign: "center",
                        }}>{s.severity}</span>
                        <div>
                          <div style={{ color: CY, fontSize: 11 }}>{s.title}</div>
                          <div style={{ color: AM, fontSize: 9, marginTop: 1 }}>
                            {s.hits} hit{s.hits !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Swarm jobs column */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ color: PR, fontSize: 10, marginBottom: 6, letterSpacing: 1 }}>
                      SWARM JOBS ({row.matchedJobs.length})
                    </div>
                    {row.matchedJobs.length === 0 ? (
                      <div style={{ color: DIM, fontSize: 11 }}>No swarm matches.</div>
                    ) : row.matchedJobs.map(j => (
                      <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                        <span style={{
                          color: "#000", background: JOB_STATUS_COLOR[j.status] || DIM,
                          fontSize: 9, fontWeight: 700, borderRadius: 2,
                          padding: "1px 5px", minWidth: 60, textAlign: "center",
                        }}>{j.status}</span>
                        <div>
                          <div style={{ color: CY, fontSize: 11 }}>{j.name}</div>
                          <div style={{ color: AM, fontSize: 9, marginTop: 1 }}>
                            {j.hits} hit{j.hits !== 1 ? "s" : ""}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 16px", borderTop: "1px solid #1A2535",
          color: DIM, fontSize: 10,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{filtered.length} of {rows.length} nodes</span>
          <span>auto-refresh 90 s</span>
        </div>
      </div>
    </div>
  );
}
