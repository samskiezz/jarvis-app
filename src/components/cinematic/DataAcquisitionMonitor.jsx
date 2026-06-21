/**
 * DataAcquisitionMonitor — F38
 * Sources from /v1/cinematic/acquire/status — live data-acquisition / scrape jobs.
 * "JARVIS, acquisition" / "JARVIS, scrape status" opens panel + TTS brief.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GRN  = "#00E5A0";
const YLW  = "#FFD700";
const RED  = "#FF3B3B";
const PRP  = "#A855F7";
const POLL_MS = 30_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ACQ_RE = /\bacquisition\b|\bacquire\b|\bscrape?\s*status\b|\bscraping\b|\bdata\s*acqui|\bingest\s*status\b|\bingest\s*job/i;
export function isAcquisitionQuery(text) { return ACQ_RE.test(text || ""); }

export async function buildAcquisitionScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/cinematic/acquire/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const data = await r.json();
    const jobs = Array.isArray(data) ? data
      : Array.isArray(data?.jobs) ? data.jobs
      : Array.isArray(data?.tasks) ? data.tasks
      : Array.isArray(data?.items) ? data.items
      : [];
    const running = jobs.filter(j => getStatus(j) === "running").length;
    const failed  = jobs.filter(j => getStatus(j) === "failed").length;
    const done    = jobs.filter(j => getStatus(j) === "done" || getStatus(j) === "completed").length;
    if (failed > 0)
      return `Data acquisition monitor: ${jobs.length} jobs tracked — ${running} running, ${done} complete, ${failed} failed. Recommend reviewing failures, sir.`;
    return `Data acquisition: ${jobs.length} jobs — ${running} currently running, ${done} completed. All pipelines nominal, sir.`;
  } catch {
    return "Data acquisition monitor is online. Opening status panel now, sir.";
  }
}

function getStatus(job) {
  const s = (job.status || job.state || job.phase || "").toLowerCase();
  if (s.includes("run") || s.includes("active") || s.includes("progress")) return "running";
  if (s.includes("fail") || s.includes("error")) return "failed";
  if (s.includes("done") || s.includes("complet") || s.includes("finish")) return "done";
  if (s.includes("queue") || s.includes("pend") || s.includes("wait")) return "queued";
  return s || "unknown";
}

function getStatusMeta(st) {
  if (st === "running")  return { label: "RUNNING",   color: CY,  pulse: true  };
  if (st === "failed")   return { label: "FAILED",    color: RED, pulse: false };
  if (st === "done")     return { label: "DONE",      color: GRN, pulse: false };
  if (st === "queued")   return { label: "QUEUED",    color: YLW, pulse: false };
  return                        { label: st.toUpperCase() || "UNKNOWN", color: "#6E8AA0", pulse: false };
}

function getJobLabel(job) {
  return job.name || job.title || job.url || job.source || job.target || `Job #${job.id || "?"}`;
}

function getJobType(job) {
  return job.type || job.kind || job.source_type || "ACQUIRE";
}

function getJobProgress(job) {
  const p = job.progress ?? job.percent ?? job.completion ?? null;
  if (p === null || p === undefined) return null;
  return Math.min(100, Math.max(0, Number(p)));
}

function fmtTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

const FILTERS = ["ALL", "RUNNING", "QUEUED", "DONE", "FAILED"];

function matchFilter(job, f) {
  if (f === "ALL") return true;
  return getStatus(job) === f.toLowerCase();
}

export default function DataAcquisitionMonitor() {
  const [open, setOpen]     = useState(false);
  const [jobs, setJobs]     = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const pollRef = useRef(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase()}/v1/cinematic/acquire/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const list = Array.isArray(data) ? data
        : Array.isArray(data?.jobs)  ? data.jobs
        : Array.isArray(data?.tasks) ? data.tasks
        : Array.isArray(data?.items) ? data.items
        : [];
      setJobs(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchJobs();
    pollRef.current = setInterval(fetchJobs, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, fetchJobs]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:acquisition-toggle", handler);
    return () => window.removeEventListener("jarvis:acquisition-toggle", handler);
  }, []);

  const running = jobs.filter(j => getStatus(j) === "running").length;
  const failed  = jobs.filter(j => getStatus(j) === "failed").length;
  const done    = jobs.filter(j => getStatus(j) === "done" || getStatus(j) === "completed").length;
  const queued  = jobs.filter(j => getStatus(j) === "queued").length;
  const visible = jobs.filter(j => matchFilter(j, filter));

  const btnStyle = (active) => ({
    background: "none", border: `1px solid ${active ? CY : "#1a3040"}`,
    color: active ? CY : "#6E8AA0", borderRadius: 4, padding: "2px 10px",
    cursor: "pointer", fontSize: 10, letterSpacing: 1,
  });

  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        title="Data Acquisition Monitor (JARVIS, acquisition)"
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", bottom: 0, left: 2676, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.82)", color: open ? "#04060A" : CY,
          border: `1px solid ${CY}55`, borderRadius: "4px 4px 0 0",
          padding: "3px 10px", fontSize: 10, letterSpacing: 1.5, cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: failed > 0 ? `0 0 14px ${RED}` : `0 0 8px ${CY}33`,
        }}
      >
        {failed > 0 && (
          <span style={{
            marginRight: 5, background: RED, color: "#fff", borderRadius: "50%",
            fontSize: 9, padding: "0 4px", fontWeight: 700,
          }}>{failed}</span>
        )}
        ⟳ ACQ
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 26, left: 2580, zIndex: 61,
          width: 480, maxHeight: "72vh",
          background: "rgba(5,8,16,0.96)", border: `1px solid ${CY}44`,
          borderRadius: 10, fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 60px ${CY}18`, display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${CY}22`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
                ⟳ DATA ACQUISITION
              </span>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 16, lineHeight: 1,
              }}>×</button>
            </div>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[
                { label: "RUNNING", value: running, color: CY },
                { label: "QUEUED",  value: queued,  color: YLW },
                { label: "DONE",    value: done,    color: GRN },
                { label: "FAILED",  value: failed,  color: RED },
              ].map(t => (
                <div key={t.label} style={{
                  flex: 1, background: `${t.color}11`, border: `1px solid ${t.color}33`,
                  borderRadius: 6, padding: "4px 0", textAlign: "center",
                }}>
                  <div style={{ color: t.color, fontSize: 16, fontWeight: 700 }}>{t.value}</div>
                  <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "6px 14px", borderBottom: `1px solid ${CY}18`, flexShrink: 0 }}>
            {FILTERS.map(f => (
              <button key={f} style={btnStyle(filter === f)} onClick={() => setFilter(f)}>{f}</button>
            ))}
            <button onClick={fetchJobs} style={{
              ...btnStyle(false), marginLeft: "auto", color: CY, borderColor: `${CY}66`,
            }}>↺</button>
          </div>

          {/* Job list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && !jobs.length && (
              <div style={{ padding: 20, color: "#6E8AA0", fontSize: 11, textAlign: "center" }}>
                ◌ fetching acquisition status…
              </div>
            )}
            {error && (
              <div style={{ padding: 14, color: RED, fontSize: 11 }}>⚠ {error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, color: "#6E8AA0", fontSize: 11, textAlign: "center" }}>
                No jobs match this filter.
              </div>
            )}
            {visible.map((job, idx) => {
              const st   = getStatus(job);
              const meta = getStatusMeta(st);
              const pct  = getJobProgress(job);
              const ts   = fmtTime(job.updated_at || job.started_at || job.created_at || job.timestamp);
              return (
                <div key={job.id || idx} style={{
                  padding: "8px 14px",
                  borderBottom: `1px solid ${CY}11`,
                  background: st === "failed" ? `${RED}08` : st === "running" ? `${CY}06` : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: pct !== null ? 4 : 0 }}>
                    {/* Status badge */}
                    <span style={{
                      fontSize: 9, letterSpacing: 1, color: meta.color,
                      border: `1px solid ${meta.color}66`, borderRadius: 3,
                      padding: "1px 5px", flexShrink: 0,
                      animation: meta.pulse ? "jpulse 1.2s ease-in-out infinite" : "none",
                    }}>{meta.label}</span>
                    {/* Type chip */}
                    <span style={{ fontSize: 9, color: PRP, border: `1px solid ${PRP}44`, borderRadius: 3, padding: "1px 5px", flexShrink: 0 }}>
                      {getJobType(job)}
                    </span>
                    {/* Label */}
                    <span style={{ color: "#DCEBF5", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {getJobLabel(job)}
                    </span>
                    {/* Timestamp */}
                    {ts && <span style={{ color: "#6E8AA0", fontSize: 9, flexShrink: 0 }}>{ts}</span>}
                  </div>
                  {/* Progress bar */}
                  {pct !== null && (
                    <div style={{ height: 3, background: "#0d1f2d", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: pct === 100 ? GRN : meta.color,
                        borderRadius: 2, transition: "width 0.4s ease",
                      }} />
                    </div>
                  )}
                  {/* Error message */}
                  {st === "failed" && job.error && (
                    <div style={{ color: RED, fontSize: 9, marginTop: 3, opacity: 0.8 }}>
                      ↳ {job.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 14px", borderTop: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", flexShrink: 0,
          }}>
            <span style={{ color: "#6E8AA0", fontSize: 9 }}>
              {jobs.length} jobs total · refreshes every {POLL_MS / 1000}s
            </span>
            <span style={{ color: running > 0 ? CY : "#6E8AA0", fontSize: 9 }}>
              {running > 0 ? `${running} active` : "idle"}
            </span>
          </div>
        </div>
      )}
      <style>{`@keyframes jpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}`}</style>
    </>
  );
}
