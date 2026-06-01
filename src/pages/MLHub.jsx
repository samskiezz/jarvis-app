/**
 * MLHub — ML model/job hub.
 * Lists SwarmJob records as training/inference jobs with status + progress,
 * StatTiles for counts by status, and a real "launch job" form that creates a
 * SwarmJob via SwarmJob.create(...). Full CRUD (launch / cancel / remove).
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { SwarmJob } from "@/api/entities";
import {
  PageShell, PanelCard, StatTile, Grid, Badge, DataState,
} from "@/components/PageKit";

const ACCENT = C.purple;

const STATUS_COLOR = {
  queued: C.text,
  running: C.blue,
  completed: C.neon,
  failed: C.red,
  cancelled: C.gold,
};

const JOB_TYPES = ["training", "inference", "fine-tune", "embedding", "eval"];

function pct(job) {
  if (typeof job.progress === "number") return Math.max(0, Math.min(100, job.progress));
  if (job.status === "completed") return 100;
  if (job.status === "queued") return 0;
  return 0;
}

export default function MLHub() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ type: "training", model: "", priority: "normal" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await SwarmJob.list();
      setJobs(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const launch = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await SwarmJob.create({
        type: form.type,
        model: form.model || `${form.type}-model`,
        priority: form.priority,
        status: "queued",
        progress: 0,
        created_date: new Date().toISOString(),
      });
      setForm({ type: "training", model: "", priority: "normal" });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const cancelJob = async (job) => {
    setBusy(true);
    try {
      await SwarmJob.update(job.id, { status: "cancelled" });
      await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const removeJob = async (job) => {
    setBusy(true);
    try {
      await SwarmJob.remove(job.id);
      await load();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const counts = jobs.reduce((acc, j) => {
    const s = j.status || "queued";
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  const inputStyle = {
    background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.textB, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", outline: "none",
  };

  return (
    <PageShell
      title="ML HUB"
      subtitle="SWARM TRAINING & INFERENCE JOB ORCHESTRATION"
      accent={ACCENT}
      actions={
        <button
          onClick={load}
          style={{ ...inputStyle, cursor: "pointer", color: ACCENT, borderColor: ACCENT + "55" }}
        >↻ REFRESH</button>
      }
    >
      <Grid min={150} gap={10} style={{ marginBottom: 14 }}>
        <StatTile label="Total Jobs" value={jobs.length} accent={ACCENT} />
        <StatTile label="Queued" value={counts.queued || 0} accent={C.text} />
        <StatTile label="Running" value={counts.running || 0} accent={C.blue} />
        <StatTile label="Completed" value={counts.completed || 0} accent={C.neon} />
        <StatTile label="Failed" value={counts.failed || 0} accent={C.red} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 14, alignItems: "start" }}>
        <PanelCard title="JOB QUEUE" accent={ACCENT}>
          <DataState
            loading={loading}
            error={error}
            empty={jobs.length === 0}
            emptyLabel="No jobs yet — launch one with the form →"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {jobs.map((job) => {
                const p = pct(job);
                const sc = STATUS_COLOR[job.status] || C.text;
                return (
                  <div key={job.id} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px", background: "rgba(0,0,0,0.25)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: C.textB, fontWeight: 700, flex: 1 }}>
                        {job.model || job.name || job.type || "job"}
                      </span>
                      <Badge color={ACCENT}>{(job.type || "job").toUpperCase()}</Badge>
                      <Badge color={sc}>{(job.status || "queued").toUpperCase()}</Badge>
                    </div>
                    <div style={{ marginTop: 7, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", background: sc, transition: "width .3s" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: 6, gap: 10 }}>
                      <span style={{ fontSize: 8, color: C.text }}>{p}% • priority {job.priority || "normal"}</span>
                      <span style={{ flex: 1 }} />
                      {job.status !== "cancelled" && job.status !== "completed" && (
                        <button onClick={() => cancelJob(job)} disabled={busy}
                          style={{ ...inputStyle, padding: "3px 8px", fontSize: 8, cursor: "pointer", color: C.gold, borderColor: C.gold + "44" }}>CANCEL</button>
                      )}
                      <button onClick={() => removeJob(job)} disabled={busy}
                        style={{ ...inputStyle, padding: "3px 8px", fontSize: 8, cursor: "pointer", color: C.red, borderColor: C.red + "44" }}>DELETE</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="LAUNCH JOB" accent={ACCENT}>
          <form onSubmit={launch} style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>JOB TYPE</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>MODEL / TARGET</label>
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="e.g. jarvis-7b-rlhf" style={inputStyle} />

            <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>PRIORITY</label>
            <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} style={inputStyle}>
              {["low", "normal", "high", "critical"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>

            <button type="submit" disabled={busy}
              style={{ ...inputStyle, cursor: busy ? "wait" : "pointer", color: ACCENT, borderColor: ACCENT + "66",
                background: ACCENT + "1a", fontWeight: 700, letterSpacing: 1, marginTop: 4 }}>
              {busy ? "…" : "▶ LAUNCH JOB"}
            </button>
          </form>
        </PanelCard>
      </div>
    </PageShell>
  );
}
