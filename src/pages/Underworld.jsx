/**
 * Underworld — control / monitor surface for the Underworld 3D city simulation.
 *
 * The heavy 3D renderer lives in the separate `underworld/` web app and is not
 * importable here, so this page is a real monitor: it pulls the available maps
 * from getLiveIntel().counterstrike / panopticon, lets the operator pick one,
 * shows live sim status tiles and embeds an EventSource-backed stream panel
 * pointed at `${apiBaseUrl}/streams/panopticon`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.red;
const STREAM_URL = `${appParams.apiBaseUrl}/streams/panopticon`;
const CHANNELS = ["agents.position", "agents.intent", "panopticon.alerts", "ml.training.progress"];
const FALLBACK_MAPS = ["city_grid", "dockyard", "industrial_zone"];

export default function Underworld() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMap, setSelectedMap] = useState(null);

  // stream state
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const [events, setEvents] = useState(0);
  const [lastTick, setLastTick] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getLiveIntel({ type: "all" });
      setData(res || {});
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const panopticon = data?.panopticon || {};
  const counterstrike = data?.counterstrike || {};
  const maps = (Array.isArray(panopticon.maps) && panopticon.maps.length)
    ? panopticon.maps
    : (Array.isArray(counterstrike.maps) && counterstrike.maps.length)
      ? counterstrike.maps
      : FALLBACK_MAPS;

  useEffect(() => {
    if (!selectedMap && maps.length) setSelectedMap(maps[0]);
  }, [maps, selectedMap]);

  // live SSE monitor
  useEffect(() => {
    if (typeof window === "undefined" || !STREAM_URL) return undefined;
    let es;
    let reconnectTimer;
    let staleTimer;
    let tries = 0;
    const connect = () => {
      try {
        es = new EventSource(STREAM_URL);
      } catch {
        return;
      }
      es.onopen = () => { tries = 0; setConnected(true); setStale(false); };
      es.onmessage = () => {
        setConnected(true);
        setStale(false);
        setEvents((v) => v + 1);
        setLastTick(new Date());
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => setStale(true), 15000);
      };
      es.onerror = () => {
        setConnected(false);
        es?.close();
        clearTimeout(reconnectTimer);
        const delay = Math.min(10000, 1000 * (2 ** Math.min(tries, 4)));
        reconnectTimer = setTimeout(connect, delay);
        tries += 1;
      };
    };
    connect();
    return () => {
      clearTimeout(reconnectTimer);
      clearTimeout(staleTimer);
      es?.close();
    };
  }, []);

  const empty = !loading && !error && !maps.length;
  const status = connected ? (stale ? "STALE" : "LIVE") : "OFFLINE";
  const statusColor = connected ? (stale ? C.gold : C.neon) : C.red;

  return (
    <PageShell
      title="UNDERWORLD"
      subtitle="3D CITY SIMULATION · PANOPTICON CONTROL & MONITOR"
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
        >
          {loading ? "◌ SYNC" : "↻ REFRESH"}
        </button>
      }
    >
      <DataState loading={loading} error={error} empty={empty} emptyLabel="No simulation maps available from feed.">
        <Grid min={170} style={{ marginBottom: 14 }}>
          <StatTile label="Sim Status" value={status} accent={statusColor} sub={STREAM_URL} />
          <StatTile label="Maps Available" value={maps.length} accent={ACCENT} sub="panopticon grid" />
          <StatTile label="Active Map" value={selectedMap || "—"} accent={C.blue} />
          <StatTile label="Stream Events" value={events} accent={C.gold} sub={lastTick ? lastTick.toLocaleTimeString() : "awaiting frames"} />
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, alignItems: "start" }}>
          <PanelCard title="MAP SELECTOR" accent={ACCENT} right={<Badge color={ACCENT}>{maps.length}</Badge>}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {maps.map((m) => {
                const active = m === selectedMap;
                return (
                  <button
                    key={m}
                    onClick={() => setSelectedMap(m)}
                    style={{
                      textAlign: "left", padding: "8px 10px", borderRadius: 4, cursor: "pointer",
                      fontFamily: "inherit", fontSize: 10, letterSpacing: 1,
                      background: active ? ACCENT + "22" : "rgba(0,0,0,0.3)",
                      border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                      color: active ? ACCENT : C.textB, fontWeight: active ? 700 : 400,
                    }}
                  >
                    {active ? "▸ " : "  "}{m}
                  </button>
                );
              })}
            </div>
          </PanelCard>

          <StreamMonitor
            selectedMap={selectedMap}
            status={status}
            statusColor={statusColor}
            events={events}
            lastTick={lastTick}
          />
        </div>
      </DataState>
    </PageShell>
  );
}

function StreamMonitor({ selectedMap, status, statusColor, events, lastTick }) {
  const canvasRef = useRef(null);

  // Draw a synthetic city-grid frame so the panel is never blank while waiting
  // for live frames. Redraws when the selected map changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = "#060b11";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(232,32,60,0.10)";
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    // pseudo city blocks
    ctx.fillStyle = "rgba(0,150,212,0.10)";
    for (let i = 0; i < 18; i++) {
      const bx = (i * 97) % (w - 60) + 10;
      const by = (i * 53) % (h - 50) + 30;
      ctx.fillRect(bx, by, 24 + (i % 4) * 8, 18 + (i % 3) * 10);
    }
    ctx.fillStyle = "rgba(232,32,60,0.6)";
    ctx.font = "11px Courier New";
    ctx.fillText(`MAP: ${selectedMap || "—"}`, 10, 18);
  }, [selectedMap]);

  return (
    <PanelCard
      title="PANOPTICON STREAM MONITOR"
      accent={ACCENT}
      right={<span style={{ fontSize: 8, color: statusColor, fontWeight: 700 }}>{status} · EVT {events}</span>}
    >
      <canvas
        ref={canvasRef}
        width={640}
        height={300}
        style={{ width: "100%", height: 300, border: `1px solid ${C.border}`, borderRadius: 4, display: "block" }}
      />
      <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>Endpoint: {STREAM_URL}</div>
      <div style={{ fontSize: 8, color: C.text }}>
        Last frame: {lastTick ? lastTick.toISOString() : "no live events yet"}
      </div>
      <div style={{ marginTop: 6, fontSize: 8, color: C.textB }}>Channels</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
        {CHANNELS.map((ch) => (
          <span key={ch} style={{ fontSize: 7, padding: "2px 6px", border: `1px solid ${C.borderB}`, borderRadius: 3, color: C.blue }}>{ch}</span>
        ))}
      </div>
      {status === "OFFLINE" && (
        <div style={{ marginTop: 6, fontSize: 8, color: C.gold }}>
          The Underworld 3D renderer runs in the standalone underworld web app. Configure the backend
          stream at {STREAM_URL} to drive live agent telemetry into this monitor.
        </div>
      )}
    </PanelCard>
  );
}
