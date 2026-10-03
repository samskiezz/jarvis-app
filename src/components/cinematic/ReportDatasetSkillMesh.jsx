/**
 * F436 — Report × Dataset × Skill Intelligence Mesh (RDSIM)
 *
 * Parallel-fetches /v1/reports + /v1/datasets + /v1/aip/skill every 90 s,
 * then keyword-correlates each report title/description against datasets AND
 * skills to classify:
 *
 *   FULLY_SUPPORTED — report has ≥1 matching dataset AND ≥1 matching skill
 *   DATA_GAP        — has skill coverage but no dataset match
 *   SKILL_GAP       — has dataset coverage but no skill match
 *   DARK            — no dataset AND no skill support at all
 *
 * Stat tiles: reports / datasets / skills / dark
 * Filter tabs: ALL | FULLY_SUPPORTED | DATA_GAP | SKILL_GAP | DARK
 * Expand row → matched datasets + matched skills with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence report-intelligence brief
 *   + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RDSIM  at left:881760, bottom:8, zIndex:583
 * Event:   jarvis:rdsim-toggle
 * Voice:   "report dataset skill / rdsim / dark reports / unsupported reports /
 *           report intelligence mesh / skill dataset report"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useState } from "react";

const BTN_LEFT = 881760;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const GRN      = "#22c55e";
const AMB      = "#f59e0b";
const RED      = "#ef4444";
const PU       = "#a855f7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const RDSIM_RE =
  /\b(report\s+dataset\s+skill|rdsim|dark\s+reports?|unsupported\s+reports?|report\s+intelligence\s+mesh|skill\s+dataset\s+report|report\s+skill\s+gap|report\s+data\s+gap|rdsim\s+panel)\b/i;

export function isRdsimQuery(q) { return RDSIM_RE.test(q || ""); }

export async function buildRdsimScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [repRes, dsRes, skRes] = await Promise.all([
      fetch(`${base}/v1/reports`,    { headers: hdr }),
      fetch(`${base}/v1/datasets`,   { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,  { headers: hdr }),
    ]);
    const repRaw = await repRes.json();
    const dsRaw  = await dsRes.json();
    const skRaw  = await skRes.json();
    const reports  = normaliseReports(repRaw);
    const datasets = normaliseDatasets(dsRaw);
    const skills   = normaliseSkills(skRaw);
    let dark = 0, full = 0;
    for (const r of reports) {
      const dsHit = datasets.some((d) => relevance(r, d) > 0);
      const skHit = skills.some((s)   => relevance(r, s) > 0);
      if (!dsHit && !skHit) dark++;
      if (dsHit && skHit) full++;
    }
    return (
      `Report × Dataset × Skill Mesh: ${reports.length} reports analysed across ` +
      `${datasets.length} datasets and ${skills.length} skills. ` +
      `${full} reports are fully supported; ${dark} are completely dark with no data or skill coverage. ` +
      `Give a 2-sentence intelligence-readiness brief.`
    );
  } catch {
    return "Report dataset skill mesh online — opening panel now, sir.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseReports(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.reports) ? raw.reports
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.items) ? raw.items
    : Object.values(raw || {}).find(Array.isArray) || [];
  return arr.map((r) => ({
    id:    r.id || r._id || r.report_id || String(Math.random()),
    title: r.title || r.name || r.report_name || "Untitled Report",
    desc:  [r.description, r.summary, r.content, r.tags?.join(" ")].filter(Boolean).join(" "),
    type:  r.type || r.report_type || "",
    status: r.status || r.state || "",
  }));
}

function normaliseDatasets(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.datasets) ? raw.datasets
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.items) ? raw.items
    : Object.values(raw || {}).find(Array.isArray) || [];
  return arr.map((d) => ({
    id:    d.id || d._id || d.dataset_id || String(Math.random()),
    title: d.name || d.title || d.dataset_name || "Unnamed Dataset",
    desc:  [d.description, d.category, d.tags?.join(" ")].filter(Boolean).join(" "),
    rows:  d.row_count || d.rows || d.count || null,
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.skills) ? raw.skills
    : Array.isArray(raw?.data) ? raw.data
    : Array.isArray(raw?.items) ? raw.items
    : Object.values(raw || {}).find(Array.isArray) || [];
  return arr.map((s) => ({
    id:    s.id || s._id || s.skill_id || String(Math.random()),
    title: s.name || s.title || s.skill_name || "Unnamed Skill",
    desc:  [s.description, s.category, s.tags?.join(" ")].filter(Boolean).join(" "),
    score: s.score ?? s.proficiency ?? s.level ?? null,
  }));
}

function tokens(item) {
  return (item.title + " " + item.desc).toLowerCase().split(/\W+/).filter((t) => t.length > 3);
}

function relevance(report, item) {
  const rToks = tokens(report);
  const iToks = tokens(item);
  return rToks.filter((t) => iToks.includes(t)).length;
}

function classify(dsHit, skHit) {
  if (dsHit && skHit) return "FULLY_SUPPORTED";
  if (!dsHit && skHit) return "DATA_GAP";
  if (dsHit && !skHit) return "SKILL_GAP";
  return "DARK";
}

const STATUS_COLOR = {
  FULLY_SUPPORTED: GRN,
  DATA_GAP:        AMB,
  SKILL_GAP:       PU,
  DARK:            RED,
};

// ── component ─────────────────────────────────────────────────────────────────

export default function ReportDatasetSkillMesh() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [reports, setReports]   = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [skills, setSkills]     = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [repRes, dsRes, skRes] = await Promise.all([
        fetch(`${base}/v1/reports`,   { headers: hdr }),
        fetch(`${base}/v1/datasets`,  { headers: hdr }),
        fetch(`${base}/v1/aip/skill`, { headers: hdr }),
      ]);
      const repRaw = await repRes.json();
      const dsRaw  = await dsRes.json();
      const skRaw  = await skRes.json();
      const reps = normaliseReports(repRaw);
      const dss  = normaliseDatasets(dsRaw);
      const sks  = normaliseSkills(skRaw);
      setReports(reps);
      setDatasets(dss);
      setSkills(sks);

      const enc = reps.map((r) => {
        const matchedDs = dss.filter((d) => relevance(r, d) > 0)
          .map((d) => ({ ...d, score: relevance(r, d) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const matchedSk = sks.filter((s) => relevance(r, s) > 0)
          .map((s) => ({ ...s, score: relevance(r, s) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const dsHit = matchedDs.length > 0;
        const skHit = matchedSk.length > 0;
        return { ...r, matchedDs, matchedSk, status: classify(dsHit, skHit) };
      });
      setEnriched(enc);
      setLastFetch(new Date());
    } catch {
      // silently keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((o) => { if (!o) fetchData(); return !o; });
    window.addEventListener("jarvis:rdsim-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rdsim-toggle", onToggle);
  }, [fetchData]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [open, fetchData]);

  const dark = enriched.filter((r) => r.status === "DARK").length;

  const visible = enriched.filter((r) => {
    if (filter !== "ALL" && r.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
    }
    return true;
  });

  const maxDs = Math.max(...enriched.flatMap((r) => r.matchedDs.map((d) => d.score)), 1);
  const maxSk = Math.max(...enriched.flatMap((r) => r.matchedSk.map((s) => s.score)), 1);

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    try {
      const base   = apiBase();
      const script = await buildRdsimScript();
      await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      }).then((r) => r.json().catch(() => ({})));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      // ignore
    } finally {
      setAssessing(false);
    }
  }, []);

  const TABS = ["ALL", "FULLY_SUPPORTED", "DATA_GAP", "SKILL_GAP", "DARK"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen((o) => { if (!o) fetchData(); return !o; }); }}
        title="F436 Report × Dataset × Skill Intelligence Mesh"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 583,
          background: open ? CY : "rgba(0,4,10,0.82)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}55`,
          borderRadius: 6,
          padding: "3px 10px",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          whiteSpace: "nowrap",
        }}
      >
        ◈ RDSIM
        {dark > 0 && !open && (
          <span style={{
            background: RED, color: "#fff", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>
            {dark}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          right: 20, top: 60,
          width: 540,
          maxHeight: "80vh",
          background: "rgba(5,10,20,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 14,
          zIndex: 584,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: `0 0 60px ${CY}14`,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 8px",
            borderBottom: `1px solid rgba(255,255,255,0.07)`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>
                ◈ REPORT × DATASET × SKILL MESH
              </span>
              <span style={{ color: "#475569", fontSize: 10, marginLeft: 8 }}>F436 RDSIM</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={handleAssess}
                disabled={assessing || enriched.length === 0}
                style={{
                  background: "transparent", color: CY,
                  border: `1px solid ${CY}55`, borderRadius: 4,
                  padding: "2px 8px", fontSize: 10, cursor: "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "transparent", color: "#64748b",
                  border: "none", fontSize: 16, cursor: "pointer", lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 8, padding: "10px 16px",
            borderBottom: `1px solid rgba(255,255,255,0.07)`,
          }}>
            {[
              { label: "REPORTS",    value: enriched.length,                               color: CY  },
              { label: "DATASETS",   value: datasets.length,                               color: CY  },
              { label: "SKILLS",     value: skills.length,                                 color: CY  },
              { label: "DARK",       value: dark,                                          color: RED },
            ].map((t) => (
              <div key={t.label} style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: 8, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: t.color, fontSize: 18, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: "#475569", fontSize: 9 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 16px",
            borderBottom: `1px solid rgba(255,255,255,0.07)`,
            overflowX: "auto",
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? CY : "rgba(255,255,255,0.04)",
                  color: filter === t ? "#000" : "#94a3b8",
                  border: "none", borderRadius: 4,
                  padding: "3px 8px", fontSize: 9,
                  cursor: "pointer", whiteSpace: "nowrap",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "6px 16px", borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                width: "100%", background: "rgba(255,255,255,0.05)",
                border: `1px solid ${CY}33`, borderRadius: 6,
                color: CY, fontSize: 11, padding: "4px 10px",
                fontFamily: "'JetBrains Mono', monospace", boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && enriched.length === 0 ? (
              <div style={{ color: "#475569", fontSize: 12, padding: 20, textAlign: "center" }}>
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div style={{ color: "#475569", fontSize: 11, padding: 20, textAlign: "center" }}>
                No reports match this filter.
              </div>
            ) : visible.map((r) => (
              <div key={r.id}>
                <div
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  style={{
                    padding: "8px 16px",
                    borderBottom: `1px solid rgba(255,255,255,0.04)`,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: expanded === r.id ? "rgba(41,231,255,0.04)" : "transparent",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      color: "#e2e8f0", fontSize: 11,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.title}
                    </div>
                    {r.type && (
                      <div style={{ color: "#475569", fontSize: 9, marginTop: 2 }}>
                        {r.type}{r.status ? ` · ${r.status}` : ""}
                      </div>
                    )}
                  </div>
                  <span style={{
                    color: STATUS_COLOR[r.status],
                    fontSize: 9, fontWeight: 700,
                    marginLeft: 8, whiteSpace: "nowrap",
                    border: `1px solid ${STATUS_COLOR[r.status]}44`,
                    borderRadius: 4, padding: "1px 5px",
                    flexShrink: 0,
                  }}>
                    {r.status.replace(/_/g, " ")}
                  </span>
                </div>

                {expanded === r.id && (
                  <div style={{
                    padding: "8px 20px 12px",
                    background: "rgba(0,0,0,0.3)",
                    borderBottom: `1px solid rgba(255,255,255,0.06)`,
                  }}>
                    {/* Matched datasets */}
                    <div style={{ color: CY, fontSize: 9, fontWeight: 700, marginBottom: 6 }}>
                      DATASETS ({r.matchedDs.length})
                    </div>
                    {r.matchedDs.length === 0 ? (
                      <div style={{ color: "#475569", fontSize: 10, marginBottom: 8 }}>
                        No dataset match — data gap.
                      </div>
                    ) : r.matchedDs.map((d) => (
                      <div key={d.id} style={{ marginBottom: 5 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", marginBottom: 2,
                        }}>
                          <span style={{ color: "#cbd5e1", fontSize: 10 }}>{d.title}</span>
                          <span style={{ color: "#475569", fontSize: 9 }}>
                            {d.rows != null ? `${d.rows.toLocaleString()} rows` : ""}
                          </span>
                        </div>
                        <div style={{
                          height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2,
                        }}>
                          <div style={{
                            height: "100%", width: `${Math.round((d.score / maxDs) * 100)}%`,
                            background: CY, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}

                    {/* Matched skills */}
                    <div style={{
                      color: PU, fontSize: 9, fontWeight: 700, marginTop: 10, marginBottom: 6,
                    }}>
                      SKILLS ({r.matchedSk.length})
                    </div>
                    {r.matchedSk.length === 0 ? (
                      <div style={{ color: "#475569", fontSize: 10 }}>
                        No skill match — skill gap.
                      </div>
                    ) : r.matchedSk.map((s) => (
                      <div key={s.id} style={{ marginBottom: 5 }}>
                        <div style={{
                          display: "flex", justifyContent: "space-between", marginBottom: 2,
                        }}>
                          <span style={{ color: "#cbd5e1", fontSize: 10 }}>{s.title}</span>
                          {s.score != null && (
                            <span style={{ color: "#475569", fontSize: 9 }}>
                              score {s.score}
                            </span>
                          )}
                        </div>
                        <div style={{
                          height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2,
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.round((s.score / maxSk) * 100)}%`,
                            background: PU, borderRadius: 2,
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 16px",
            borderTop: `1px solid rgba(255,255,255,0.06)`,
            color: "#475569", fontSize: 10,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>
              {visible.length} of {enriched.length} reports · {datasets.length} ds · {skills.length} sk
            </span>
            <span>
              {lastFetch
                ? `updated ${lastFetch.toLocaleTimeString("en-GB")} · 90s`
                : "auto-refresh 90s"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
