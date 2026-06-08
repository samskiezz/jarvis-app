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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API()}/v1/pm2`, {
        headers: appParams.apiKey ? { Authorization: `Bearer ${appParams.apiKey}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAvailable(data.available !== false);
      setRows(Array.isArray(data.processes) ? data.processes : []);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
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
      <DataState loading={rows === null && !error} error={error} empty={empty}
        emptyLabel={available ? "No pm2 processes." : "pm2 not found on the backend host."}>
        <Grid min={170} style={{ marginBottom: 14 }}>
          <StatTile label="Processes" value={list.length} accent={ACCENT} />
          <StatTile label="Online" value={online} accent={C.neon} sub={`${list.length - online} not running`} />
          <StatTile label="Total Memory" value={fmtMem(totMem)} accent={C.gold} />
          <StatTile label="Total CPU" value={`${totCpu.toFixed(0)}%`} accent={C.blue} />
        </Grid>

        {flash && (
          <div style={{ marginBottom: 10, fontSize: 10, color: flash.startsWith("✓") ? C.neon : flash.startsWith("✗") ? C.red : C.gold,
            letterSpacing: 1 }}>{flash}</div>
        )}

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
