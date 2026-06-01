/**
 * MLDashboard — ML metrics dashboard.
 * Derives simple charts (no external lib) from SwarmJob + OmegaScanProgress data:
 *   - headline StatTiles
 *   - status distribution as horizontal div-bars
 *   - jobs-over-time as a vertical div-bar sparkline (bucketed by day)
 *   - scan progress gauges from OmegaScanProgress
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { SwarmJob, OmegaScanProgress } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, DataState } from "@/components/PageKit";

const ACCENT = C.purple;

const STATUS_COLOR = {
  queued: C.text,
  running: C.blue,
  completed: C.neon,
  failed: C.red,
  cancelled: C.gold,
};

function dayKey(d) {
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
}

export default function MLDashboard() {
  const [jobs, setJobs] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, s] = await Promise.all([
        SwarmJob.list().catch(() => []),
        OmegaScanProgress.list().catch(() => []),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setScans(Array.isArray(s) ? s : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Status distribution
  const statusCounts = jobs.reduce((acc, j) => {
    const k = j.status || "queued";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const maxStatus = Math.max(1, ...Object.values(statusCounts));

  // Jobs over time (last 10 day-buckets present in data)
  const byDay = {};
  jobs.forEach((j) => {
    const k = dayKey(j.created_date || j.createdAt || j.created_at);
    if (k) byDay[k] = (byDay[k] || 0) + 1;
  });
  const dayBuckets = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-10);
  const maxDay = Math.max(1, ...dayBuckets.map(([, v]) => v));

  // Completion rate
  const done = statusCounts.completed || 0;
  const completionRate = jobs.length ? Math.round((done / jobs.length) * 100) : 0;
  const running = statusCounts.running || 0;

  return (
    <PageShell title="ML DASHBOARD" subtitle="DERIVED METRICS FROM SWARM JOBS & OMEGA SCANS" accent={ACCENT}
      actions={
        <button onClick={load} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${ACCENT}55`, borderRadius: 4,
          color: ACCENT, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", cursor: "pointer" }}>↻ REFRESH</button>
      }>
      <DataState loading={loading} error={error} empty={false}>
        <Grid min={160} gap={10} style={{ marginBottom: 14 }}>
          <StatTile label="Total Jobs" value={jobs.length} accent={ACCENT} />
          <StatTile label="Active" value={running} accent={C.blue} sub="running now" />
          <StatTile label="Completion" value={`${completionRate}%`} accent={C.neon} sub={`${done} done`} />
          <StatTile label="Scans Tracked" value={scans.length} accent={C.gold} />
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14 }}>
          <PanelCard title="STATUS DISTRIBUTION" accent={ACCENT}>
            {Object.keys(statusCounts).length === 0 ? (
              <div style={{ fontSize: 10, color: C.text, padding: 12 }}>No job data.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {Object.entries(statusCounts).map(([status, n]) => (
                  <div key={status}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginBottom: 3 }}>
                      <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{status}</span>
                      <span>{n}</span>
                    </div>
                    <div style={{ height: 14, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(n / maxStatus) * 100}%`, height: "100%",
                        background: STATUS_COLOR[status] || C.text, transition: "width .4s" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          <PanelCard title="JOBS OVER TIME" accent={ACCENT}>
            {dayBuckets.length === 0 ? (
              <div style={{ fontSize: 10, color: C.text, padding: 12 }}>No dated jobs to chart.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, paddingTop: 6 }}>
                {dayBuckets.map(([day, n]) => (
                  <div key={day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div title={`${day}: ${n}`} style={{ width: "100%", height: `${(n / maxDay) * 100}%`,
                        background: ACCENT, borderRadius: "3px 3px 0 0", minHeight: 2 }} />
                    </div>
                    <span style={{ fontSize: 7, color: C.text, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </div>

        <PanelCard title="OMEGA SCAN PROGRESS" accent={ACCENT} style={{ marginTop: 14 }}>
          {scans.length === 0 ? (
            <div style={{ fontSize: 10, color: C.text, padding: 8 }}>No scan progress records.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {scans.slice(0, 12).map((s, i) => {
                const total = s.total || s.target || 0;
                const cur = s.processed ?? s.current ?? s.count ?? 0;
                const p = total ? Math.min(100, Math.round((cur / total) * 100)) : (s.progress || 0);
                return (
                  <div key={s.id || i}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.text, marginBottom: 3 }}>
                      <span>{s.name || s.scan_type || s.id || `scan ${i + 1}`}</span>
                      <span>{p}%{total ? ` (${cur}/${total})` : ""}</span>
                    </div>
                    <div style={{ height: 10, background: "rgba(255,255,255,0.04)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", background: C.gold }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>
      </DataState>
    </PageShell>
  );
}
