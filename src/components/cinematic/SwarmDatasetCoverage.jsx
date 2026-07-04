/**
 * SwarmDatasetCoverage — F140.
 *
 * Parallel-fetches /entities/SwarmJob + /v1/datasets then keyword-correlates
 * each swarm job (name/objective/type) against the dataset catalog to surface
 * DATA-BACKED jobs (at least one empirical dataset found — intelligence support
 * exists) vs DATA-DARK jobs (no dataset coverage — operating on inference alone).
 *
 * Stat tiles: jobs / datasets / backed / dark
 * Filter tabs: ALL / DATA-BACKED / DATA-DARK
 * Expand job → matched datasets with row-count badge + type badge + score.
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI swarm-data brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "swarm dataset" / "job data" / "data-backed swarm" /
 *         "swarm data coverage" / "swjds"
 *   → jarvis:swjds-toggle + TTS brief via buildSwjdsScript()
 *
 * Toggle: ◈ SWJDS at left:45240, bottom:8, zIndex 92.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 45240;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseJobs(raw) {
  return normaliseArray(raw).map((j) => ({
    id:        j.id || j.job_id || String(Math.random()),
    name:      j.name || j.title || j.job_name || "Unnamed Job",
    objective: j.objective || j.description || j.goal || j.task || "",
    type:      j.type || j.job_type || j.category || "",
    status:    j.status || j.state || "",
    tags:      [...(j.tags || []), ...(j.labels || [])].map(String),
  }));
}

function normaliseDatasets(raw) {
  return normaliseArray(raw).map((d) => ({
    id:       d.id || d.dataset_id || String(Math.random()),
    name:     d.name || d.title || d.dataset_name || "Unnamed Dataset",
    description: d.description || d.summary || d.overview || "",
    type:     d.type || d.category || d.dataset_type || "",
    rowCount: d.row_count ?? d.rows ?? d.count ?? d.records ?? null,
    tags:     [...(d.tags || []), ...(d.keywords || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(job, ds) {
  const dsText = `${ds.name} ${ds.description} ${ds.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(job.name),
    ...tokens(job.objective),
    ...tokens(job.type),
    ...job.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (dsText.includes(w) ? 1 : 0), 0);
}

function correlate(jobs, datasets) {
  return jobs.map((j) => {
    const matched = datasets
      .map((d) => ({ ...d, _score: matchScore(j, d) }))
      .filter((d) => d._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...j, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const SWJDS_RE =
  /swarm[\s-]?dataset|job[\s-]?data(?:set)?|data[\s-]?backed[\s-]?swarm|swarm[\s-]?data[\s-]?coverage|swjds\b/i;

export function isSwjdsQuery(q) {
  return SWJDS_RE.test(q || "");
}

export async function buildSwjdsScript() {
  try {
    const [jobRaw, dsRaw] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/datasets?limit=100`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const jobs     = normaliseJobs(jobRaw);
    const datasets = normaliseDatasets(dsRaw);
    const corr     = correlate(jobs, datasets);
    const backed   = corr.filter((j) => j.matched.length > 0);
    const dark     = corr.filter((j) => j.matched.length === 0);
    return `Swarm dataset coverage active, sir. ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""} cross-referenced against ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}. ${backed.length} job${backed.length !== 1 ? "s have" : " has"} empirical dataset backing. ${dark.length} job${dark.length !== 1 ? "s have" : " has"} no dataset coverage — operating on inference alone. Select any job to review matched datasets and request an AI swarm-data assessment.`;
  } catch (_) {
    return "Swarm dataset coverage correlator is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SwarmDatasetCoverage() {
  const [visible, setVisible]     = useState(false);
  const [jobs, setJobs]           = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [jobRaw, dsRaw] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/datasets?limit=100`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setJobs(normaliseJobs(jobRaw));
      setDatasets(normaliseDatasets(dsRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:swjds-toggle", onToggle);
    return () => window.removeEventListener("jarvis:swjds-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessJob(j) {
    setAssessing(j.id);
    const dsTitles = j.matched.map((d) => `"${d.name}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence swarm-data assessment for the swarm job "${j.name}" (type: ${j.type || "unknown"}, objective: ${j.objective || "unspecified"}). Datasets found: ${dsTitles || "none"}. Assess the empirical data backing for this swarm job and whether the dataset coverage is adequate for reliable automated operation.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data coverage to assess this swarm job, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated = correlate(jobs, datasets);
  const backed     = correlated.filter((j) => j.matched.length > 0);
  const dark       = correlated.filter((j) => j.matched.length === 0);

  const base =
    tab === "DATA-BACKED" ? backed :
    tab === "DATA-DARK"   ? dark   : correlated;

  const displayed = search
    ? base.filter((j) =>
        `${j.name} ${j.type} ${j.objective}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  const statusColour = (s) => {
    const sl = (s || "").toLowerCase();
    if (sl === "running")   return "#29E7FF";
    if (sl === "failed")    return "#FF4444";
    if (sl === "completed") return "#00c878";
    if (sl === "queued")    return "#F5A623";
    return "#445566";
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Swarm Job × Dataset Intelligence Coverage (F140)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 92,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ SWJDS
        {dark.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{dark.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 92,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ SWARM JOB × DATASET COVERAGE</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["JOBS",       jobs.length,     CY],
              ["DATASETS",   datasets.length,  PURPLE],
              ["DATA-BACKED", backed.length,   GREEN],
              ["DATA-DARK",  dark.length,      dark.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "DATA-BACKED", "DATA-DARK"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search swarm jobs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Job rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating swarm jobs against dataset catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "DATA-DARK"
                ? "All swarm jobs appear to have dataset coverage."
                : "No swarm jobs in this filter."}
            </div>
          ) : (
            displayed.map((j) => {
              const isOpen  = expanded === j.id;
              const hasData = j.matched.length > 0;
              const sc      = statusColour(j.status);
              return (
                <div key={j.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${hasData ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : j.id)}>
                  {/* Job header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{j.name}</span>
                        {j.status && (
                          <span style={{
                            fontSize: 7, color: sc,
                            border: `1px solid ${sc}44`,
                            borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                            textTransform: "uppercase",
                          }}>{j.status}</span>
                        )}
                      </div>
                      {(j.type || j.objective) && (
                        <div style={{ color: "#556677", fontSize: 8 }}>
                          {[j.type, j.objective].filter(Boolean).join(" · ").slice(0, 80)}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: hasData ? GREEN : AMBER,
                      border: `1px solid ${hasData ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {hasData
                        ? `${j.matched.length} dataset${j.matched.length !== 1 ? "s" : ""}`
                        : "DATA-DARK"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessJob(j); }}
                      disabled={assessing === j.id}
                      style={{
                        background: assessing === j.id ? "#1a2530" : `${CY}18`,
                        color: assessing === j.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === j.id ? "default" : "pointer",
                      }}
                    >{assessing === j.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded dataset list */}
                  {isOpen && hasData && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {j.matched.map((d) => (
                        <div key={d.id} style={{
                          background: "rgba(255,255,255,0.02)",
                          border: "1px solid #1e3040",
                          borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}>
                          {d.type && (
                            <span style={{
                              fontSize: 7, color: PURPLE, border: "1px solid #A78BFA44",
                              borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                              whiteSpace: "nowrap", flexShrink: 0, textTransform: "uppercase",
                            }}>{d.type}</span>
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ color: "#a0b8cc", fontSize: 10 }}>{d.name}</div>
                            {d.rowCount != null && (
                              <div style={{ color: "#334455", fontSize: 7, marginTop: 2 }}>
                                {d.rowCount.toLocaleString()} rows
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                            score {d._score}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOpen && !hasData && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No datasets cover this swarm job. Consider sourcing empirical data to improve automation reliability.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/SwarmJob + /v1/datasets · 90 s auto-refresh · ▶ ASSESS for AI swarm-data brief
          </div>
        </div>
      )}
    </>
  );
}
