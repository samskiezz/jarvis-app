/**
 * GameArena — live match board for the simulation arena.
 *
 * Matches are derived from SwarmJob entities tagged as games (type/tag === "game"
 * or model containing a known map), falling back to a seeded sample set so the
 * board is always populated for demos. The right rail is a CounterStrike3D
 * stream monitor that reuses the standalone LiveTactical3D renderer driven by an
 * EventSource feed at `${apiBaseUrl}/streams/counterstrike`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { SwarmJob } from "@/api/entities";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import LiveTactical3D from "@/components/LiveTactical3D";

const ACCENT = C.red;
const STREAM_URL = `${appParams.apiBaseUrl}/streams/counterstrike`;
const CHANNELS = ["sim.tick", "players.state", "round.events", "ml.policy.actions"];
const MAPS = ["de_dust2", "de_mirage", "de_inferno", "de_nuke"];

const SAMPLE_MATCHES = [
  { id: "m1", name: "Alpha Swarm vs Bravo Net", map: "de_dust2", teamA: "Alpha Swarm", teamB: "Bravo Net", scoreA: 13, scoreB: 9, round: 22, status: "running" },
  { id: "m2", name: "Cobra vs Delta Mind", map: "de_mirage", teamA: "Cobra", teamB: "Delta Mind", scoreA: 7, scoreB: 7, round: 14, status: "running" },
  { id: "m3", name: "Echo vs Foxtrot AI", map: "de_inferno", teamA: "Echo", teamB: "Foxtrot AI", scoreA: 16, scoreB: 11, round: 27, status: "completed" },
  { id: "m4", name: "Ghost vs Hydra", map: "de_nuke", teamA: "Ghost", teamB: "Hydra", scoreA: 0, scoreB: 0, round: 0, status: "queued" },
];

// Project a SwarmJob row into a "match" shape if it looks like a game.
function jobToMatch(job, idx) {
  const tag = String(job.tag || job.type || "").toLowerCase();
  const model = String(job.model || "").toLowerCase();
  const looksLikeGame = tag.includes("game") || tag.includes("arena") || MAPS.some((m) => model.includes(m));
  if (!looksLikeGame) return null;
  const map = MAPS.find((m) => model.includes(m)) || MAPS[idx % MAPS.length];
  return {
    id: job.id || `job-${idx}`,
    name: job.model || job.type || `Match ${idx + 1}`,
    map,
    teamA: job.teamA || "CT Swarm",
    teamB: job.teamB || "T Swarm",
    scoreA: Number(job.scoreA ?? Math.round((job.progress || 0) / 6)) || 0,
    scoreB: Number(job.scoreB ?? 0) || 0,
    round: Number(job.round ?? 0) || 0,
    status: job.status || "queued",
  };
}

const statusColor = (s) =>
  s === "running" ? C.neon : s === "completed" ? C.blue : s === "failed" || s === "cancelled" ? C.red : C.gold;

function seedUnits(map) {
  return Array.from({ length: 10 }).map((_, i) => ({
    id: `${map.slice(0, 3)}-u${i}`,
    team: i % 2 === 0 ? "CT" : "T",
    worldX: ((i * 211) % 4000) - 2000,
    worldY: ((i * 367) % 3200) - 1600,
    hp: 100 - ((i * 9) % 60),
  }));
}

export default function GameArena() {
  const [matches, setMatches] = useState([]);
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await SwarmJob.list();
      const derived = (Array.isArray(rows) ? rows : [])
        .map(jobToMatch)
        .filter(Boolean);
      if (derived.length) {
        setMatches(derived);
        setUsingSample(false);
      } else {
        setMatches(SAMPLE_MATCHES);
        setUsingSample(true);
      }
    } catch (e) {
      setError(e);
      setMatches(SAMPLE_MATCHES);
      setUsingSample(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selectedId && matches.length) setSelectedId(matches[0].id);
  }, [matches, selectedId]);

  const selected = matches.find((m) => m.id === selectedId) || matches[0] || null;
  const live = matches.filter((m) => m.status === "running").length;

  return (
    <PageShell
      title="GAME ARENA"
      subtitle="LIVE MATCH BOARD · COUNTERSTRIKE3D SIMULATION"
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
      <Grid min={170} style={{ marginBottom: 14 }}>
        <StatTile label="Matches" value={matches.length} accent={ACCENT} />
        <StatTile label="Live Now" value={live} accent={C.neon} sub="status: running" />
        <StatTile label="Active Map" value={selected?.map || "—"} accent={C.blue} />
        <StatTile label="Selected Round" value={selected?.round ?? "—"} accent={C.gold} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 14, alignItems: "start" }}>
        <PanelCard title="MATCH BOARD" accent={ACCENT} right={<Badge color={ACCENT}>{matches.length}</Badge>}>
          <DataState loading={loading} error={error} empty={matches.length === 0} emptyLabel="No matches.">
            {usingSample && (
              <div style={{ fontSize: 8, color: C.gold, marginBottom: 8 }}>
                No game-tagged SwarmJob records — showing seeded sample matches.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {matches.map((m) => {
                const active = m.id === selectedId;
                const sc = statusColor(m.status);
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    style={{
                      textAlign: "left", padding: "10px 12px", borderRadius: 5, cursor: "pointer",
                      fontFamily: "inherit", background: active ? ACCENT + "18" : "rgba(0,0,0,0.3)",
                      border: `1px solid ${active ? ACCENT + "88" : C.border}`,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 10, color: C.textB, fontWeight: 700 }}>{m.name}</span>
                      <Badge color={sc}>{String(m.status).toUpperCase()}</Badge>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                      <span style={{ fontSize: 9, color: C.blue, flex: 1 }}>{m.teamA}</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: m.scoreA >= m.scoreB ? C.neon : C.text }}>{m.scoreA}</span>
                      <span style={{ fontSize: 9, color: C.text }}>:</span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: m.scoreB > m.scoreA ? C.neon : C.text }}>{m.scoreB}</span>
                      <span style={{ fontSize: 9, color: C.orange, flex: 1, textAlign: "right" }}>{m.teamB}</span>
                    </div>
                    <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>map {m.map} · round {m.round}</div>
                  </button>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        <StreamMonitor mapName={selected?.map || MAPS[0]} />
      </div>
    </PageShell>
  );
}

function StreamMonitor({ mapName }) {
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const [events, setEvents] = useState(0);
  const [units, setUnits] = useState(() => seedUnits(mapName));

  useEffect(() => { setUnits(seedUnits(mapName)); }, [mapName]);

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
      es.onmessage = (e) => {
        setConnected(true);
        setStale(false);
        setEvents((v) => v + 1);
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => setStale(true), 15000);
        try {
          const data = JSON.parse(e.data);
          const raw = data.units || data.players || data.agents || [];
          if (Array.isArray(raw) && raw.length) {
            setUnits(raw.map((u, idx) => ({
              id: u.id || u.playerId || `u${idx}`,
              team: u.team || u.side || (idx % 2 === 0 ? "CT" : "T"),
              worldX: u.worldX ?? u.position?.x ?? u.x ?? 0,
              worldY: u.worldY ?? u.position?.y ?? u.y ?? 0,
              hp: u.hp ?? u.health ?? 100,
            })));
          }
        } catch {
          // ignore malformed frames; keep last good state
        }
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

  const status = connected ? (stale ? "STALE" : "LIVE") : "OFFLINE";
  const sc = connected ? (stale ? C.gold : C.neon) : C.red;

  return (
    <PanelCard
      title="COUNTERSTRIKE3D STREAM"
      accent={ACCENT}
      right={<span style={{ fontSize: 8, color: sc, fontWeight: 700 }}>{status} · EVT {events}</span>}
    >
      <div style={{ width: "100%", height: 300, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
        <LiveTactical3D gameKey="counterstrike" mapName={mapName} units={units} />
      </div>
      <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>Endpoint: {STREAM_URL}</div>
      <div style={{ marginTop: 6, fontSize: 8, color: C.textB }}>Channels</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
        {CHANNELS.map((ch) => (
          <span key={ch} style={{ fontSize: 7, padding: "2px 6px", border: `1px solid ${C.borderB}`, borderRadius: 3, color: C.blue }}>{ch}</span>
        ))}
      </div>
      {status === "OFFLINE" && (
        <div style={{ marginTop: 6, fontSize: 8, color: C.gold }}>
          Stream offline — rendering seeded units. Configure the backend feed at {STREAM_URL}.
        </div>
      )}
    </PanelCard>
  );
}
