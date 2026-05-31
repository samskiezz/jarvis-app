/**
 * PipelineMonitor — pipeline run monitor.
 * Lists SwarmJob + OmegaScanProgress entities as in-flight pipeline stages with
 * status badges and progress bars, and WorkflowMapping entities as the set of
 * configured pipelines. Empty-state friendly with a "no runs yet" message.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { SwarmJob, OmegaScanProgress, WorkflowMapping } from "@/api/entities";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;

const STATUS_COLOR = {
  queued: C.text,
  pending: C.text,
  running: C.blue,
  in_progress: C.blue,
  active: C.blue,
  completed: C.neon,
  complete: C.neon,
  done: C.neon,
  succeeded: C.neon,
  failed: C.red,
  error: C.red,
  cancelled: C.gold,
  paused: C.gold,
};

const statusColor = (s) => STATUS_COLOR[String(s || "").toLowerCase()] || C.text;

// Best-effort progress (0–100) from a record's fields.
function pctOf(r) {
  const raw = r.progress ?? r.percent ?? r.pct;
  if (typeof raw === "number") return Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
  if (Number.isFinite(Number(r.processed)) && Number.isFinite(Number(r.total)) && Number(r.total) > 0) {
    return Math.max(0, Math.min(100, (Number(r.processed) / Number(r.total)) * 100));
  }
  const s = String(r.status || "").toLowerCase();
  if (["completed", "complete", "done", "succeeded"].includes(s)) return 100;
  return 0;
}

function StageRow({ stage }) {
  const col = statusColor(stage.status);
  const pct = Math.round(pctOf(stage));
  return (
    <div style={{
      background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.textB, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {stage.label}
        </span>
        <Badge color={stage.kindColor}>{stage.kind}</Badge>
        <Badge color={col}>{String(stage.status || "queued").toUpperCase()}</Badge>
        <span style={{ fontSize: 10, color: col, fontWeight: 700, width: 38, textAlign: "right" }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

export default function PipelineMonitor() {
  const [jobs, setJobs] = useState([]);
  const [scans, setScans] = useState([]);
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [j, s, w] = await Promise.all([
        SwarmJob.list().catch(() => []),
        OmegaScanProgress.list().catch(() => []),
        WorkflowMapping.list().catch(() => []),
      ]);
      setJobs(Array.isArray(j) ? j : []);
      setScans(Array.isArray(s) ? s : []);
      setFlows(Array.isArray(w) ? w : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Unify both run sources into a single list of pipeline stages.
  const stages = useMemo(() => {
    const fromJobs = jobs.map((j, i) => ({
      id: `job-${j.id ?? i}`,
      label: j.model || j.name || j.type || `Swarm job ${j.id ?? i}`,
      status: j.status,
      progress: j.progress,
      kind: "SWARM",
      kindColor: C.purple,
    }));
    const fromScans = scans.map((s, i) => ({
      id: `scan-${s.id ?? i}`,
      label: s.label || s.name || s.target || `Omega scan ${s.id ?? i}`,
      status: s.status,
      progress: s.progress,
      processed: s.processed,
      total: s.total,
      kind: "OMEGA",
      kindColor: C.orange,
    }));
    return [...fromScans, ...fromJobs];
  }, [jobs, scans]);

  const running = stages.filter((s) => statusColor(s.status) === C.blue).length;
  const done = stages.filter((s) => statusColor(s.status) === C.neon).length;
  const noRuns = !loading && !error && stages.length === 0;

  return (
    <PageShell
      title="PIPELINE MONITOR"
      subtitle="SWARM JOBS · OMEGA SCANS · CONFIGURED WORKFLOWS"
      accent={ACCENT}
      actions={
        <button
          onClick={load}
          disabled={loading}
          style={{
            background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
            fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
            borderRadius: 5, cursor: loading ? "wait" : "pointer", fontWeight: 700,
          }}
        >{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Active Runs" value={running} accent={C.blue} />
        <StatTile label="Completed" value={done} accent={C.neon} />
        <StatTile label="Total Stages" value={stages.length} accent={ACCENT} sub="swarm + omega" />
        <StatTile label="Configured" value={flows.length} accent={C.gold} sub="workflow mappings" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>
        <PanelCard title="PIPELINE STAGES" accent={ACCENT} right={<Badge color={ACCENT}>{stages.length}</Badge>}>
          <DataState
            loading={loading}
            error={error}
            empty={noRuns}
            emptyLabel="No runs yet — launch a swarm job or omega scan to populate the monitor."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stages.map((s) => <StageRow key={s.id} stage={s} />)}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="CONFIGURED PIPELINES" accent={C.gold} right={<Badge color={C.gold}>{flows.length}</Badge>}>
          {flows.length === 0 ? (
            <div style={{ color: C.text, fontSize: 10, padding: 8 }}>
              {loading ? "◌ loading…" : "No workflow mappings configured."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flows.map((w, i) => (
                <div key={w.id ?? i} style={{
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px",
                }}>
                  <div style={{ fontSize: 11, color: C.textB, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.name || w.label || w.workflow || `Pipeline ${w.id ?? i}`}
                  </div>
                  {(w.source || w.target || w.trigger) && (
                    <div style={{ fontSize: 9, color: C.text, marginTop: 4 }}>
                      {[w.source, w.target].filter(Boolean).join(" → ") || w.trigger}
                    </div>
                  )}
                  {w.enabled != null && (
                    <div style={{ marginTop: 6 }}>
                      <Badge color={w.enabled ? C.neon : C.text}>{w.enabled ? "ENABLED" : "DISABLED"}</Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </PageShell>
  );
}
