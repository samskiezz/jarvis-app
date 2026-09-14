/**
 * F67 — SwarmJob × Dataset Ingestion Monitor (SDJIC)
 *
 * Answers: "Which datasets have active swarm jobs running against them?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob  → registered swarm jobs
 *   GET /v1/datasets        → dataset catalog
 *
 * Each dataset's name/description/tags are keyword-matched against each swarm
 * job's name/description/target/status to produce:
 *   ATTENDED — at least one swarm job references this dataset
 *   IDLE     — no swarm job is correlated to this dataset
 *
 * Stat tiles:  datasets / jobs / attended / idle
 * Amber badge: idle count on button (unmonitored datasets are the gap).
 * Expand row:  matched swarm jobs with status badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SDJIC  at left:1560 bottom:18, zIndex:68.
 * Event:   jarvis:sdjic-toggle
 * Voice:   "swarm dataset / dataset jobs / sdjic / attended datasets /
 *           idle datasets / swarm coverage / which datasets have swarm jobs /
 *           dataset swarm / dataset ingestion"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1560;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ───────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normDatasets(raw) {
  return normArr(raw).map((r, i) => ({
    id:          String(r.id ?? r.dataset_id ?? i),
    name:        r.name ?? r.title ?? r.label ?? `Dataset ${i + 1}`,
    description: r.description ?? r.summary ?? r.schema ?? "",
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags ?? ""),
    rows:        r.row_count ?? r.rows ?? r.count ?? null,
    source:      r.source ?? r.format ?? r.type ?? "",
  }));
}

function normJobs(raw) {
  return normArr(raw).map((r, i) => ({
    id:          String(r.id ?? r.job_id ?? i),
    name:        r.name ?? r.title ?? r.label ?? `Job ${i + 1}`,
    description: r.description ?? r.objective ?? r.query ?? "",
    target:      r.target ?? r.dataset ?? r.source ?? r.entity ?? "",
    status:      (r.status ?? r.state ?? "UNKNOWN").toUpperCase(),
    progress:    r.progress ?? r.completion_pct ?? null,
  }));
}

// ─── correlation ─────────────────────────────────────────────────────────────

function tokenise(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function relevance(dataset, job) {
  const needle = new Set([
    ...tokenise(dataset.name),
    ...tokenise(dataset.description),
    ...tokenise(dataset.tags),
    ...tokenise(dataset.source),
  ]);
  const hay = [
    ...tokenise(job.name),
    ...tokenise(job.description),
    ...tokenise(job.target),
  ];
  let hits = 0;
  for (const t of hay) if (needle.has(t)) hits++;
  return hits;
}

function correlate(datasets, jobs) {
  return datasets.map(dataset => {
    const matches = jobs
      .map(job => ({ ...job, score: relevance(dataset, job) }))
      .filter(job => job.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return {
      ...dataset,
      matches,
      coverage: matches.length > 0 ? "ATTENDED" : "IDLE",
    };
  });
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [dsRes, sjRes] = await Promise.all([
    fetch(`${base}/v1/datasets`,        { headers: hdr }),
    fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
  ]);
  const datasets = normDatasets(await dsRes.json());
  const jobs     = normJobs(await sjRes.json());
  return { datasets, jobs, correlated: correlate(datasets, jobs) };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isSdjicQuery(q) {
  return /swarm.?dataset|dataset.?job|sdjic|attended.?dataset|idle.?dataset|swarm.?coverage|which.?dataset.?have.?swarm|dataset.?swarm|dataset.?ingestion/i.test(q);
}

export async function buildSdjicScript() {
  try {
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const { correlated, jobs } = await fetchAll();
    const attended = correlated.filter(d => d.coverage === "ATTENDED");
    const idle     = correlated.filter(d => d.coverage === "IDLE");
    const topIdle  = idle.slice(0, 3).map(d => d.name).join(", ");

    const msg = `JARVIS, assess dataset ingestion coverage by swarm jobs. Out of ${correlated.length} datasets, ${attended.length} are ATTENDED by active swarm jobs and ${idle.length} are IDLE with no swarm coverage. There are ${jobs.length} total swarm jobs registered. Unmonitored datasets: ${topIdle || "none"}. Give a 2-sentence data coverage assessment.`;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const j = await res.json();
    return j.response ?? j.message ?? j.text ?? j.content ?? `${attended.length} of ${correlated.length} datasets attended by swarm jobs; ${idle.length} idle.`;
  } catch {
    return "Unable to assess swarm-dataset coverage — backend unavailable.";
  }
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 64 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? CY, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const isRunning  = status === "RUNNING";
  const isComplete = status === "COMPLETED" || status === "DONE";
  const c = isRunning ? GREEN : isComplete ? CY : MUTED;
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      letterSpacing: 1, textTransform: "uppercase",
    }}>
      {status}
    </span>
  );
}

// ─── DatasetRow ───────────────────────────────────────────────────────────────

function DatasetRow({ row }) {
  const [exp, setExp] = useState(false);
  const isAttended = row.coverage === "ATTENDED";
  const accent     = isAttended ? GREEN : MUTED;

  return (
    <div style={{
      borderBottom: `1px solid rgba(255,255,255,0.05)`,
      paddingBottom: 6, marginBottom: 6,
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={() => setExp(v => !v)}
      >
        <span style={{ fontSize: 10, color: MUTED }}>{exp ? "▾" : "▸"}</span>
        <span style={{
          fontSize: 11,
          color: isAttended ? CY : MUTED,
          flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {row.name}
        </span>
        {row.rows != null && (
          <span style={{ fontSize: 9, color: MUTED }}>{Number(row.rows).toLocaleString()}r</span>
        )}
        <span style={{
          fontSize: 9, padding: "1px 6px", borderRadius: 3,
          background: `${accent}22`, border: `1px solid ${accent}55`, color: accent,
          letterSpacing: 1,
        }}>
          {row.coverage}
        </span>
        {isAttended && (
          <span style={{ fontSize: 9, color: GREEN }}>{row.matches.length} job{row.matches.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {exp && (
        <div style={{ marginTop: 6, paddingLeft: 16 }}>
          {row.description && (
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>
              {row.description.slice(0, 120)}{row.description.length > 120 ? "…" : ""}
            </div>
          )}
          {row.source && (
            <div style={{ fontSize: 9, color: MUTED, marginBottom: 6 }}>
              Source: <span style={{ color: "#7EB8D4" }}>{row.source}</span>
            </div>
          )}
          {row.matches.length === 0 ? (
            <div style={{ fontSize: 10, color: MUTED, fontStyle: "italic" }}>
              No swarm jobs correlated to this dataset.
            </div>
          ) : (
            row.matches.map(job => (
              <div key={job.id} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <StatusBadge status={job.status} />
                  <span style={{ fontSize: 10, color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.name}
                  </span>
                  <span style={{ fontSize: 9, color: MUTED }}>score:{job.score}</span>
                </div>
                {job.target && (
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 2 }}>
                    target: <span style={{ color: "#7EB8D4" }}>{job.target.slice(0, 60)}</span>
                  </div>
                )}
                {job.progress != null && (
                  <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>
                    progress: {job.progress}%
                  </div>
                )}
                <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, job.score * 12)}%`,
                    background: GREEN, borderRadius: 2,
                  }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "ATTENDED", "IDLE"];

export default function SwarmDatasetMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAll();
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:sdjic-toggle", handler);
    return () => window.removeEventListener("jarvis:sdjic-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildSdjicScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const rows     = data?.correlated ?? [];
  const jobs     = data?.jobs ?? [];
  const attended = rows.filter(r => r.coverage === "ATTENDED").length;
  const idle     = rows.filter(r => r.coverage === "IDLE").length;

  const visible = rows
    .filter(r => tab === "ALL" || r.coverage === tab)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    });

  const btnStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
    background: "rgba(8,14,22,0.85)", border: `1px solid ${AMBER}55`,
    borderRadius: 8, padding: "5px 10px", cursor: "pointer",
    fontFamily: MONO, fontSize: 11, color: AMBER,
    display: "flex", alignItems: "center", gap: 6,
  };

  const panelStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: 68,
    width: 360, maxHeight: 520, background: BG,
    border: `1px solid ${AMBER}44`, borderRadius: 12,
    padding: 16, fontFamily: MONO, color: "#DCEBF5",
    backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${AMBER}18`,
    display: "flex", flexDirection: "column",
  };

  return (
    <>
      {/* Toggle button */}
      <button style={btnStyle} onClick={() => setOpen(v => !v)} title="SwarmJob × Dataset Ingestion Monitor">
        <span>◈</span>
        <span>SDJIC</span>
        {data && idle > 0 && (
          <span style={{
            background: `${AMBER}22`, border: `1px solid ${AMBER}`,
            borderRadius: 4, padding: "1px 5px", fontSize: 10, color: AMBER,
          }}>
            {idle}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: AMBER, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
              SWARM × DATASET MONITOR
            </span>
            {loading && <span style={{ fontSize: 9, color: MUTED }}>POLLING…</span>}
            <button
              onClick={assess}
              disabled={assessing || !data}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}55`, borderRadius: 4,
                padding: "2px 8px", color: CY, cursor: "pointer",
                fontSize: 10, fontFamily: MONO, opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {err && (
            <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>⚠ {err}</div>
          )}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Tile label="DATASETS"  value={rows.length}  color={CY}    />
            <Tile label="JOBS"      value={jobs.length}  color={MUTED} />
            <Tile label="ATTENDED"  value={attended}     color={GREEN} />
            <Tile label="IDLE"      value={idle}         color={AMBER} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "4px 0", fontSize: 9, fontFamily: MONO,
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 4, color: tab === t ? AMBER : MUTED, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search datasets…"
            style={{
              width: "100%", marginBottom: 10, padding: "5px 8px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, color: "#DCEBF5", fontFamily: MONO, fontSize: 11,
              outline: "none", boxSizing: "border-box",
            }}
          />

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!data && !err && (
              <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading swarm-dataset data…
              </div>
            )}
            {data && visible.length === 0 && (
              <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 20 }}>
                No datasets match current filter.
              </div>
            )}
            {visible.map(row => (
              <DatasetRow key={row.id} row={row} />
            ))}
          </div>

          {/* Footer */}
          {data && (
            <div style={{
              marginTop: 8, borderTop: `1px solid rgba(255,255,255,0.07)`,
              paddingTop: 8, fontSize: 9, color: MUTED, textAlign: "center",
            }}>
              {attended} attended · {idle} idle · {jobs.length} swarm jobs · 60 s refresh
            </div>
          )}
        </div>
      )}
    </>
  );
}
