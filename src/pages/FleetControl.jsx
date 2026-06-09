/**
 * FleetControl — the operator's "manage everything while I sleep" panel.
 *
 * Live pm2 fleet: every process (backend, frontend, underworld, sim, …) with status, CPU, memory,
 * uptime and restart count, polled from the backend's `/v1/pm2`. Each row has a toggle (Stop/Start)
 * and Restart, routed through `/v1/pm2/{name}/{action}` (bearer-auth). The process that serves this
 * API is guarded so you can't lock yourself out.
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;
const VIOLET = "#7A5CFF";
const POLL_MS = 4000;
const API = () => appParams.apiBaseUrl;

const fmtMem = (b) => (b == null ? "—" : `${(b / 1048576).toFixed(0)} MB`);
const fmtUptime = (startMs) => {
  if (!startMs) return "—";
  const s = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
};
const statusColor = (st) =>
  st === "online" ? C.neon : st === "stopped" ? C.gold : st === "errored" ? C.red : C.text;

export default function FleetControl() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState({});       // name -> true while an action is in flight
  const [flash, setFlash] = useState(null);    // last action result message
  const [pipe, setPipe] = useState(null);      // UE5 render pipeline status
  const [pipeOpen, setPipeOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API()}/v1/pm2`, { headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {} }),
        fetch(`${API()}/v1/pipeline`, { headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {} }).catch(() => null),
      ]);
      if (!r1.ok) throw new Error(`HTTP ${r1.status}`);
      const data = await r1.json();
      setAvailable(data.available !== false);
      setRows(Array.isArray(data.processes) ? data.processes : []);
      setError(null);
      if (r2 && r2.ok) setPipe(await r2.json().catch(() => null));
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const startPipeline = useCallback(async () => {
    setFlash("launching UE5 render pipeline…");
    try {
      const res = await fetch(`${API()}/v1/pipeline/start`, {
        method: "POST",
        headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      setFlash(d.already_running ? "pipeline already running" : d.ok ? "✓ pipeline launched" : "✗ launch failed");
      setTimeout(load, 800);
    } catch (e) { setFlash(`✗ ${e}`); }
  }, [load]);

  // The gated tail (ship → free VRAM → stream) touches the SHARED Vast 4090 box and pauses the live
  // LLM — confirm before firing, and only after the local build (package) is done.
  const deployToGpu = useCallback(async () => {
    if (!window.confirm("Deploy to the Vast 2×4090 box?\n\nThis ships the packaged build, PAUSES the LLM to free VRAM, and starts Pixel Streaming on the GPU.")) return;
    setFlash("deploying to GPU (Vast 2×4090)…");
    try {
      const res = await fetch(`${API()}/v1/pipeline/deploy`, {
        method: "POST",
        headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {},
      });
      const d = await res.json().catch(() => ({}));
      setFlash(d.ok ? "✓ GPU deploy started" : `✗ ${d.error || d.detail || "deploy failed"}`);
      setTimeout(load, 800);
    } catch (e) { setFlash(`✗ ${e}`); }
  }, [load]);

  const act = useCallback(async (name, action) => {
    setBusy((b) => ({ ...b, [name]: true }));
    setFlash(`${action} ${name}…`);
    try {
      const res = await fetch(`${API()}/v1/pm2/${encodeURIComponent(name)}/${action}`, {
        method: "POST",
        headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      setFlash(data.ok ? `✓ ${action} ${name}` : `✗ ${name}: ${data.error || data.detail || "failed"}`);
    } catch (e) {
      setFlash(`✗ ${name}: ${String(e)}`);
    } finally {
      setBusy((b) => ({ ...b, [name]: false }));
      setTimeout(load, 800);   // refresh after the action settles
    }
  }, [load]);

  const list = rows || [];
  const online = list.filter((r) => r.status === "online").length;
  const totMem = list.reduce((a, r) => a + (r.memory || 0), 0);
  const totCpu = list.reduce((a, r) => a + (r.cpu || 0), 0);
  const empty = !error && rows && rows.length === 0;

  const btn = (label, color, onClick, disabled) => (
    <button onClick={onClick} disabled={disabled}
      style={{ background: color + "1a", border: `1px solid ${color}66`, color, fontFamily: "inherit",
        fontSize: 9, letterSpacing: 1.5, padding: "6px 12px", borderRadius: 5, fontWeight: 700,
        cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  );

  return (
    <PageShell
      title="FLEET CONTROL"
      subtitle={`PM2 PROCESS MANAGER · ${POLL_MS / 1000}s POLL · ${API()}`}
      accent={ACCENT}
      actions={<button onClick={load}
        style={{ background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
          fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px", borderRadius: 5,
          cursor: "pointer", fontWeight: 700 }}>↻ REFRESH</button>}
    >
      {flash && (
        <div style={{ marginBottom: 10, fontSize: 10, color: flash.startsWith("✓") ? C.neon : flash.startsWith("✗") ? C.red : C.gold,
          letterSpacing: 1 }}>{flash}</div>
      )}

      {/* ── UE5 RENDER PIPELINE — rendered OUTSIDE <DataState> so a pm2 fetch hiccup can't blank it ── */}
      {(() => {
        const fmtEta = (s) => {
          if (s == null) return "—";
          s = Math.max(0, Math.round(s));
          const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
          return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`;
        };
        const stCol = (st) => st === "done" ? C.neon : st === "running" ? C.blue
          : st === "failed" ? C.red : st === "stalled" ? C.gold : C.text;
        const steps = (pipe && pipe.steps) || [];
        const pct = pipe ? (pipe.overall_pct || 0) : 0;
        const pColor = (pipe?.status === "failed" || pipe?.status === "stalled") ? C.red
          : pipe?.status === "done" ? C.neon : VIOLET;
        // GPU-deploy gate: the local build (package) must be done before the Vast tail can fire.
        const pkgDone = steps.find((s) => s.id === "package")?.status === "done";
        // 'active' = deploy tail in-flight (disable button); 'live' = stream up (offer RE-DEPLOY, not a dead button)
        const gpuActive = steps.some((s) => ["transfer", "vram", "stream"].includes(s.id) && s.status === "running");
        const gpuLive = steps.find((s) => s.id === "stream")?.status === "done";
        return (
          <PanelCard
            title="UE5 RENDER PIPELINE"
            accent={VIOLET}
            right={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 9, color: pColor, fontWeight: 700, letterSpacing: 1 }}>
                  {(pipe?.status || "idle").toUpperCase()}{pipe?.eta_s ? ` · ETA ${fmtEta(pipe.eta_s)}` : ""}
                </span>
                {btn("▶ LAUNCH", VIOLET, startPipeline, pipe?.status === "running")}
                {pkgDone && btn(gpuActive ? "⛁ DEPLOYING…" : gpuLive ? "⛁ RE-DEPLOY" : "⛁ DEPLOY TO GPU",
                  C.gold, deployToGpu, gpuActive)}
                <span onClick={() => setPipeOpen((o) => !o)} style={{ cursor: "pointer", color: C.textB, fontSize: 12 }}>
                  {pipeOpen ? "▾" : "▸"}
                </span>
              </div>
            }
          >
            {pipeOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {/* overall bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.textB, marginBottom: 4 }}>
                    <span>{pipe ? `${pct}% complete` : "no run yet — press LAUNCH"}</span>
                    <span>{pipe?.eta_s ? `~${fmtEta(pipe.eta_s)} remaining` : ""}</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "rgba(0,0,0,0.5)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pColor, boxShadow: `0 0 10px ${pColor}`,
                      transition: "width .5s ease" }} />
                  </div>
                </div>
                {/* per-step */}
                {steps.map((s, i) => {
                  const el = s.started ? ((s.ended || Date.now() / 1000) - s.started) : 0;
                  return (
                    <div key={s.id} style={{ display: "grid", gridTemplateColumns: "26px 1fr 90px 80px",
                      gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 5,
                      background: s.status === "running" ? VIOLET + "12" : "rgba(0,0,0,0.25)",
                      border: `1px solid ${s.status === "running" ? VIOLET + "55" : C.border}` }}>
                      <span style={{ color: stCol(s.status), fontWeight: 700, fontSize: 11 }}>
                        {s.status === "done" ? "✓" : s.status === "failed" ? "✗" : s.status === "running" ? "◔"
                          : s.status === "stalled" ? "⚠" : (i + 1)}
                      </span>
                      <span style={{ fontSize: 10, color: s.status === "pending" ? C.text : C.textB }}>{s.label}</span>
                      <span style={{ fontSize: 9, color: stCol(s.status), fontWeight: 700, letterSpacing: 1 }}>
                        {(s.status || "pending").toUpperCase()}
                      </span>
                      <span style={{ fontSize: 9, color: C.text, textAlign: "right" }}>
                        {s.status === "running" ? `${fmtEta(el)} / ~${fmtEta(s.est_s)}`
                          : s.status === "done" ? fmtEta(el)
                          : s.status === "pending" ? `~${fmtEta(s.est_s)}` : "—"}
                      </span>
                    </div>
                  );
                })}
                {pipe?.steps?.some((s) => s.status === "failed" || s.status === "stalled") && (
                  <div style={{ fontSize: 9, color: C.red }}>
                    {pipe.steps.find((s) => s.status === "failed" || s.status === "stalled")?.detail}
                  </div>
                )}
              </div>
            )}
          </PanelCard>
        );
      })()}

      <DataState loading={rows === null && !error} error={error} empty={empty}
        emptyLabel={available ? "No pm2 processes." : "pm2 not found on the backend host."}>
        <Grid min={170} style={{ marginBottom: 14 }}>
          <StatTile label="Processes" value={list.length} accent={ACCENT} />
          <StatTile label="Online" value={online} accent={C.neon} sub={`${list.length - online} not running`} />
          <StatTile label="Total Memory" value={fmtMem(totMem)} accent={C.gold} />
          <StatTile label="Total CPU" value={`${totCpu.toFixed(0)}%`} accent={C.blue} />
        </Grid>

        <PanelCard title="PROCESSES" accent={ACCENT} right={<Badge color={ACCENT}>{list.length}</Badge>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.map((r) => {
              const sc = statusColor(r.status);
              const isOnline = r.status === "online";
              return (
                <div key={r.name} style={{ display: "grid",
                  gridTemplateColumns: "minmax(140px,1.4fr) 80px 70px 70px 70px 70px auto",
                  gap: 8, alignItems: "center", padding: "9px 10px", borderRadius: 6,
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 11, color: C.textB, fontWeight: 600, letterSpacing: 0.5 }}>
                    <span style={{ color: sc }}>●</span> {r.name}
                  </div>
                  <div style={{ fontSize: 9, color: sc, fontWeight: 700, letterSpacing: 1 }}>{(r.status || "?").toUpperCase()}</div>
                  <div style={{ fontSize: 10, color: C.text }}>{r.cpu != null ? `${r.cpu}%` : "—"}</div>
                  <div style={{ fontSize: 10, color: C.text }}>{fmtMem(r.memory)}</div>
                  <div style={{ fontSize: 10, color: C.text }}>{fmtUptime(r.uptime)}</div>
                  <div style={{ fontSize: 10, color: r.restarts > 5 ? C.gold : C.text }}>↺{r.restarts ?? 0}</div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {isOnline
                      ? btn("STOP", C.red, () => act(r.name, "stop"), busy[r.name])
                      : btn("START", C.neon, () => act(r.name, "start"), busy[r.name])}
                    {btn("RESTART", C.gold, () => act(r.name, "restart"), busy[r.name])}
                  </div>
                </div>
              );
            })}
          </div>
        </PanelCard>
      </DataState>
    </PageShell>
  );
}
