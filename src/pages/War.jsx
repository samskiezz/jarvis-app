/**
 * War — unified battle-sim theater.
 *
 * Merges the two battle sims into one page with a mode toggle:
 *   • PANOPTICON   — autonomous agents vs intruders on a 0..100 city grid.
 *   • COUNTERSTRIKE — CT vs T on de_* maps in Source-engine coordinates.
 *
 * Both share ONE engine and ONE SSE endpoint shape: `${apiBaseUrl}/streams/{key}`
 * with keys `panopticon` and `counterstrike`. A single generalized stream hook
 * (useTacticalStream) drives the shared, presentational LiveTactical3D renderer;
 * switching mode swaps the stream key, the map selector, the stat tiles and the
 * context side panel (MATCH BOARD vs THREAT BOARD).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C, riskColor } from "@/domain/colors";
import { SwarmJob, RiskSignal } from "@/api/entities";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import LiveTactical3D from "@/components/LiveTactical3D";
import LiveDataPanel from "@/components/LiveDataPanel";

const ACCENT = C.red;

const CS_MAPS = ["de_dust2", "de_mirage", "de_inferno", "de_nuke"];
const PAN_MAPS = ["city_grid"];

const CS_CHANNELS = ["sim.tick", "players.state", "round.events", "ml.policy.actions"];
const PAN_CHANNELS = ["sim.tick", "agents.state", "intruders.state", "ml.policy.actions"];

// ── COUNTERSTRIKE match board (lifted from GameArena) ──────────────────────
const SAMPLE_MATCHES = [
  { id: "m1", name: "Alpha Swarm vs Bravo Net", map: "de_dust2", teamA: "Alpha Swarm", teamB: "Bravo Net", scoreA: 13, scoreB: 9, round: 22, status: "running" },
  { id: "m2", name: "Cobra vs Delta Mind", map: "de_mirage", teamA: "Cobra", teamB: "Delta Mind", scoreA: 7, scoreB: 7, round: 14, status: "running" },
  { id: "m3", name: "Echo vs Foxtrot AI", map: "de_inferno", teamA: "Echo", teamB: "Foxtrot AI", scoreA: 16, scoreB: 11, round: 27, status: "completed" },
  { id: "m4", name: "Ghost vs Hydra", map: "de_nuke", teamA: "Ghost", teamB: "Hydra", scoreA: 0, scoreB: 0, round: 0, status: "queued" },
];

function jobToMatch(job, idx) {
  const tag = String(job.tag || job.type || "").toLowerCase();
  const model = String(job.model || "").toLowerCase();
  const looksLikeGame = tag.includes("game") || tag.includes("arena") || CS_MAPS.some((m) => model.includes(m));
  if (!looksLikeGame) return null;
  const map = CS_MAPS.find((m) => model.includes(m)) || CS_MAPS[idx % CS_MAPS.length];
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

// ── PANOPTICON threat board (lifted from WarEnvironment) ───────────────────
const SAMPLE_SIGNALS = [
  { _id: "s1", label: "Hostile movement — sector 4", severity: "HIGH", entity: "OPFOR squad" },
  { _id: "s2", label: "Supply line exposed — north gate", severity: "MEDIUM", entity: "Logistics" },
  { _id: "s3", label: "Recon drone overhead", severity: "MEDIUM", entity: "ISR" },
  { _id: "s4", label: "Perimeter sensor nominal", severity: "LOW", entity: "Sensors" },
];

const sevLabel = (s) => {
  const raw = s.severity ?? s.score;
  if (typeof raw === "number") return raw >= 7 ? "HIGH" : raw >= 4 ? "MEDIUM" : "LOW";
  const up = String(raw || "LOW").toUpperCase();
  return ["LOW", "MEDIUM", "HIGH"].includes(up) ? up : "MEDIUM";
};

// ── Tactical HUD helpers ────────────────────────────────────────────────────
// Frame teams: counterstrike = CT/T, panopticon = AGENT/INTRUDER.
const TEAM_HEX = { CT: "#0096d4", T: "#f07820", AGENT: "#00c878", INTRUDER: "#e8203c" };
const teamHex = (t) => TEAM_HEX[t] || C.textB;

const ALERT_META = {
  calm: { label: "CALM", color: C.neon },
  suspicious: { label: "SUSPICIOUS", color: C.gold },
  alarmed: { label: "ALARMED", color: C.red },
};

// Color-code the live event feed by kind.
const eventColor = (kind) => {
  const k = String(kind || "").toLowerCase();
  if (k.includes("kill") || k.includes("breach") || k.includes("explod")) return C.red;
  if (k.includes("plant") || k.includes("alarm")) return C.orange;
  if (k.includes("defus") || k.includes("secure") || k.includes("stop")) return C.blue;
  if (k.includes("detect") || k.includes("suspic")) return C.gold;
  if (k.includes("round") || k.includes("win")) return C.neon;
  return C.textB;
};

const mmss = (secs) => {
  const s = Math.max(0, Math.floor(Number(secs) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ── Per-mode seeding ───────────────────────────────────────────────────────
// counterstrike: CT/T on Source-engine coords; panopticon: agents/intruders on
// a 0..100 city grid (mapped to LiveTactical3D's "CT"/"T" team colors).
function seedUnits(mode, map) {
  if (mode === "panopticon") {
    return Array.from({ length: 10 }).map((_, i) => ({
      id: `pan-u${i}`,
      // even = agent (friendly), odd = intruder (hostile)
      team: i % 2 === 0 ? "CT" : "T",
      worldX: (i * 17) % 100,
      worldY: (i * 31) % 100,
      hp: 100 - ((i * 7) % 60),
    }));
  }
  return Array.from({ length: 10 }).map((_, i) => ({
    id: `${map.slice(0, 3)}-u${i}`,
    team: i % 2 === 0 ? "CT" : "T",
    worldX: ((i * 211) % 4000) - 2000,
    worldY: ((i * 367) % 3200) - 1600,
    hp: 100 - ((i * 9) % 60),
  }));
}

/**
 * useTacticalStream — generalized live EventSource feed (lifted from GameArena's
 * StreamMonitor). Opens `${apiBaseUrl}/streams/{streamKey}`, handles
 * reconnect/backoff + stale detection, parses `data.units||players||agents` and
 * maps to the LiveTactical3D unit shape. Falls back to seeded units when offline
 * or before the first valid frame.
 */
function useTacticalStream(mode, map) {
  const url = `${appParams.apiBaseUrl}/streams/${mode}`;
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const [events, setEvents] = useState(0);
  const [liveUnits, setLiveUnits] = useState(null); // null until a valid frame arrives
  const [frame, setFrame] = useState(null);         // latest FULL frame object
  const seed = useMemo(() => seedUnits(mode, map), [mode, map]);

  // Reset live frames whenever the stream key changes.
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; setLiveUnits(null); setFrame(null); setEvents(0); }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined" || !appParams.apiBaseUrl) return undefined;
    let es;
    let reconnectTimer;
    let staleTimer;
    let tries = 0;
    const connect = () => {
      try {
        es = new EventSource(url);
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
          // Keep the WHOLE frame so the HUD can read score/phase/events/bomb/etc.
          setFrame(data);
          const raw = data.units || data.players || data.agents || [];
          if (Array.isArray(raw) && raw.length) {
            setLiveUnits(raw.map((u, idx) => ({
              id: u.id || u.playerId || u.agentId || `u${idx}`,
              team: u.team || u.side || (idx % 2 === 0 ? "CT" : "T"),
              worldX: u.worldX ?? u.position?.x ?? u.x ?? 0,
              worldY: u.worldY ?? u.position?.y ?? u.y ?? 0,
              hp: u.hp ?? u.health ?? 100,
              state: u.state,
              weapon: u.weapon,
              kills: u.kills,
              deaths: u.deaths,
              aimX: u.aimX,
              aimY: u.aimY,
              firing: !!u.firing,
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
    // Reconnect when the stream key (mode) changes.
  }, [url]);

  const status = connected ? (stale ? "STALE" : "LIVE") : "OFFLINE";
  const statusColorVal = connected ? (stale ? C.gold : C.neon) : C.red;
  const units = liveUnits && liveUnits.length ? liveUnits : seed;

  return { units, frame, status, statusColor: statusColorVal, events, url, usingSeed: !(liveUnits && liveUnits.length) };
}

export default function War() {
  const [mode, setMode] = useState("panopticon");
  const maps = mode === "panopticon" ? PAN_MAPS : CS_MAPS;
  const [csMap, setCsMap] = useState(CS_MAPS[0]);
  const [panMap, setPanMap] = useState(PAN_MAPS[0]);
  const map = mode === "panopticon" ? panMap : csMap;
  const setMap = mode === "panopticon" ? setPanMap : setCsMap;

  const stream = useTacticalStream(mode, map);

  // ── COUNTERSTRIKE data (matches) ─────────────────────────────────────────
  const [matches, setMatches] = useState([]);
  const [matchSample, setMatchSample] = useState(false);
  const [matchLoading, setMatchLoading] = useState(true);
  const [matchError, setMatchError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const loadMatches = useCallback(async () => {
    setMatchLoading(true);
    setMatchError(null);
    try {
      const rows = await SwarmJob.list();
      const derived = (Array.isArray(rows) ? rows : []).map(jobToMatch).filter(Boolean);
      if (derived.length) { setMatches(derived); setMatchSample(false); }
      else { setMatches(SAMPLE_MATCHES); setMatchSample(true); }
    } catch (e) {
      setMatchError(e); setMatches(SAMPLE_MATCHES); setMatchSample(true);
    } finally { setMatchLoading(false); }
  }, []);

  // ── PANOPTICON data (threat signals) ─────────────────────────────────────
  const [signals, setSignals] = useState([]);
  const [signalSample, setSignalSample] = useState(false);
  const [signalLoading, setSignalLoading] = useState(true);
  const [signalError, setSignalError] = useState(null);

  const loadSignals = useCallback(async () => {
    setSignalLoading(true);
    setSignalError(null);
    try {
      const rows = await RiskSignal.list();
      const arr = Array.isArray(rows) ? rows : [];
      if (arr.length) { setSignals(arr); setSignalSample(false); }
      else { setSignals(SAMPLE_SIGNALS); setSignalSample(true); }
    } catch (e) {
      setSignalError(e); setSignals(SAMPLE_SIGNALS); setSignalSample(true);
    } finally { setSignalLoading(false); }
  }, []);

  const refresh = useCallback(() => {
    if (mode === "panopticon") loadSignals(); else loadMatches();
  }, [mode, loadMatches, loadSignals]);

  useEffect(() => { loadMatches(); }, [loadMatches]);
  useEffect(() => { loadSignals(); }, [loadSignals]);

  useEffect(() => {
    if (mode === "counterstrike" && !selectedId && matches.length) setSelectedId(matches[0].id);
  }, [mode, matches, selectedId]);

  // Keep the CS map synced to the selected match for context.
  const selectedMatch = matches.find((m) => m.id === selectedId) || matches[0] || null;
  useEffect(() => {
    if (mode === "counterstrike" && selectedMatch?.map) setCsMap(selectedMatch.map);
  }, [mode, selectedMatch]);

  const liveMatches = matches.filter((m) => m.status === "running").length;

  const threatLevel = useMemo(() => {
    if (signals.some((s) => sevLabel(s) === "HIGH")) return "HIGH";
    if (signals.some((s) => sevLabel(s) === "MEDIUM")) return "ELEVATED";
    return "NOMINAL";
  }, [signals]);
  const threatColor = threatLevel === "HIGH" ? C.red : threatLevel === "ELEVATED" ? C.gold : C.neon;

  const agentCount = stream.units.filter((u) => u.team === "CT" || u.team === "AGENT").length;
  const intruderCount = stream.units.filter((u) => u.team === "T" || u.team === "INTRUDER").length;

  const loading = mode === "panopticon" ? signalLoading : matchLoading;

  // ── Live frame fields (null when offline / pre-first-frame) ──────────────
  const frame = stream.frame;
  const frameScore = frame?.score || {};
  const teamNames = Object.keys(frameScore);
  const teamA = teamNames[0] || (mode === "panopticon" ? "AGENT" : "CT");
  const teamB = teamNames[1] || (mode === "panopticon" ? "INTRUDER" : "T");
  const frameEvents = Array.isArray(frame?.events) ? frame.events.slice(-8).reverse() : [];
  const alertMeta = ALERT_META[frame?.alert_level] || null;
  const bombState = frame?.bomb?.state;
  const bombLabel = bombState
    ? bombState === "planted"
      ? `PLANTED ${mmss(frame.bomb.timer)}${frame.bomb.site ? ` · ${frame.bomb.site}` : ""}`
      : bombState === "exploded"
        ? `EXPLODED${frame.bomb.site ? ` · ${frame.bomb.site}` : ""}`
        : bombState.toUpperCase()
    : null;
  const bombColor =
    bombState === "planted" ? C.red : bombState === "defused" ? C.blue : bombState === "exploded" ? C.orange : C.textB;

  // ── Styles ─────────────────────────────────────────────────────────────
  const modeBtn = (active) => ({
    flex: 1, padding: "14px 18px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
    fontSize: 12, letterSpacing: 2, fontWeight: 700, textAlign: "center",
    background: active ? ACCENT + "22" : "rgba(0,0,0,0.4)",
    border: `1px solid ${active ? ACCENT : C.border}`,
    color: active ? ACCENT : C.textB,
    boxShadow: active ? `0 0 0 1px ${ACCENT}55 inset` : "none",
    transition: "all 0.12s ease",
  });
  const ctrlBtn = (active) => ({
    background: active ? ACCENT + "22" : "rgba(0,0,0,0.4)",
    border: `1px solid ${active ? ACCENT + "88" : C.border}`,
    color: active ? ACCENT : C.textB, fontFamily: "inherit", fontSize: 8,
    letterSpacing: 1, padding: "4px 9px", borderRadius: 3, cursor: "pointer", fontWeight: active ? 700 : 400,
  });

  const viewHeight = "min(62vh, 560px)";

  return (
    <PageShell
      title="WAR"
      subtitle="TWO THEATERS · PANOPTICON AI SIM + COUNTERSTRIKE WAR · TOGGLE TO SWITCH"
      accent={ACCENT}
      actions={
        <button
          onClick={refresh}
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
      {/* ── MODE TOGGLE ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setMode("panopticon")} style={modeBtn(mode === "panopticon")}>
          PANOPTICON · AI SIM
        </button>
        <button onClick={() => setMode("counterstrike")} style={modeBtn(mode === "counterstrike")}>
          COUNTERSTRIKE · WAR
        </button>
      </div>

      {/* ── STAT TILES (per mode) ───────────────────────────────────────── */}
      <Grid min={170} style={{ marginBottom: 14 }}>
        {mode === "counterstrike" ? (
          <>
            <StatTile label="Matches" value={matches.length} accent={ACCENT} />
            <StatTile label="Live Now" value={liveMatches} accent={C.neon} sub="status: running" />
            <StatTile label="Active Map" value={selectedMatch?.map || "—"} accent={C.blue} />
            <StatTile label="Selected Round" value={selectedMatch?.round ?? "—"} accent={C.gold} />
          </>
        ) : (
          <>
            <StatTile label="Threat Level" value={threatLevel} accent={threatColor} sub={`${signals.length} signals`} />
            <StatTile label="Active Agents" value={agentCount} accent={C.blue} />
            <StatTile label="Intruders" value={intruderCount} accent={C.orange} />
            <StatTile label="Active Map" value={map} accent={ACCENT} />
          </>
        )}
      </Grid>

      {/* ── BIG 3D + CONTEXT PANEL ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 14, alignItems: "start" }}>
        <PanelCard
          title={mode === "panopticon" ? "PANOPTICON BATTLESPACE" : "COUNTERSTRIKE3D STREAM"}
          accent={ACCENT}
          right={<span style={{ fontSize: 8, color: stream.statusColor, fontWeight: 700 }}>{stream.status} · EVT {stream.events}</span>}
        >
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {maps.map((m) => (
              <button key={m} onClick={() => setMap(m)} style={ctrlBtn(map === m)}>{m}</button>
            ))}
          </div>
          <div style={{ position: "relative", width: "100%", height: viewHeight, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden" }}>
            <LiveTactical3D
              gameKey={mode}
              mapName={map}
              units={stream.units}
              bounds={frame?.bounds || null}
              bombsites={mode === "counterstrike" ? frame?.bombsites || null : null}
              bomb={mode === "counterstrike" ? frame?.bomb || null : null}
              objectives={mode === "panopticon" ? frame?.objectives || null : null}
              alertLevel={mode === "panopticon" ? frame?.alert_level || null : null}
            />

            {/* ── SCOREBOARD (top) ──────────────────────────────────────── */}
            {frame && (
              <div style={{
                position: "absolute", top: 8, left: 8, right: 8, display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 10, padding: "8px 12px", borderRadius: 5,
                background: "rgba(2,6,10,0.78)", backdropFilter: "blur(6px)", border: `1px solid ${C.border}`,
                pointerEvents: "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: teamHex(teamA), letterSpacing: 1, whiteSpace: "nowrap" }}>{teamA}</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: teamHex(teamA) }}>{frameScore[teamA] ?? 0}</span>
                  <span style={{ fontSize: 12, color: C.text }}>:</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: teamHex(teamB) }}>{frameScore[teamB] ?? 0}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: teamHex(teamB), letterSpacing: 1, whiteSpace: "nowrap" }}>{teamB}</span>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: C.textB, fontVariantNumeric: "tabular-nums" }}>{mmss(frame.round_time)}</div>
                  <div style={{ fontSize: 7, color: C.text, letterSpacing: 2 }}>
                    R{frame.round ?? 0} · {String(frame.phase || "").toUpperCase()}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {mode === "counterstrike" && bombLabel && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: bombColor, border: `1px solid ${bombColor}66`, background: `${bombColor}1a`, padding: "3px 8px", borderRadius: 4 }}>
                      ◈ {bombLabel}
                    </span>
                  )}
                  {mode === "panopticon" && alertMeta && (
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: alertMeta.color, border: `1px solid ${alertMeta.color}66`, background: `${alertMeta.color}1a`, padding: "3px 8px", borderRadius: 4 }}>
                      ⚠ {alertMeta.label}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── PANOPTICON status strip (counters + objectives) ───────── */}
            {frame && mode === "panopticon" && (
              <div style={{
                position: "absolute", bottom: 8, left: 8, display: "flex", gap: 6, flexWrap: "wrap",
                pointerEvents: "none",
              }}>
                <span style={{ fontSize: 8, color: C.neon, background: "rgba(2,6,10,0.78)", border: `1px solid ${C.neon}44`, padding: "3px 7px", borderRadius: 4 }}>
                  STOPPED {frame.intrusions_stopped ?? 0}
                </span>
                <span style={{ fontSize: 8, color: C.red, background: "rgba(2,6,10,0.78)", border: `1px solid ${C.red}44`, padding: "3px 7px", borderRadius: 4 }}>
                  BREACHES {frame.breaches ?? 0}
                </span>
                {(frame.objectives || []).map((o) => {
                  const oc = o.state === "secure" ? C.neon : o.state === "contested" ? C.gold : C.red;
                  return (
                    <span key={o.id} style={{ fontSize: 8, color: oc, background: "rgba(2,6,10,0.78)", border: `1px solid ${oc}44`, padding: "3px 7px", borderRadius: 4 }}>
                      {o.id} · {String(o.state).toUpperCase()}
                    </span>
                  );
                })}
              </div>
            )}

            {/* ── EVENT FEED (bottom-right) ─────────────────────────────── */}
            {frameEvents.length > 0 && (
              <div style={{
                position: "absolute", bottom: 8, right: 8, width: 230, maxHeight: 168, overflow: "hidden",
                display: "flex", flexDirection: "column", gap: 3, padding: "7px 9px", borderRadius: 5,
                background: "rgba(2,6,10,0.74)", backdropFilter: "blur(6px)", border: `1px solid ${C.border}`,
                pointerEvents: "none",
              }}>
                <div style={{ fontSize: 7, color: C.text, letterSpacing: 2, marginBottom: 2 }}>EVENT FEED</div>
                {frameEvents.map((ev, i) => {
                  const col = eventColor(ev.kind);
                  return (
                    <div key={`${ev.tick}-${i}`} style={{ display: "flex", gap: 6, alignItems: "baseline", opacity: 1 - i * 0.08 }}>
                      <span style={{ fontSize: 7, color: col, fontWeight: 700, letterSpacing: 0.5, minWidth: 44, textTransform: "uppercase" }}>{ev.kind}</span>
                      <span style={{ fontSize: 8, color: C.textB, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>Endpoint: {stream.url}</div>
          <div style={{ marginTop: 6, fontSize: 8, color: C.textB }}>Channels</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
            {(mode === "panopticon" ? PAN_CHANNELS : CS_CHANNELS).map((ch) => (
              <span key={ch} style={{ fontSize: 7, padding: "2px 6px", border: `1px solid ${C.borderB}`, borderRadius: 3, color: C.blue }}>{ch}</span>
            ))}
          </div>
          {stream.status === "OFFLINE" && (
            <div style={{ marginTop: 6, fontSize: 8, color: C.gold }}>
              Stream offline — rendering seeded {mode === "panopticon" ? "agents/intruders" : "CT/T units"}. Configure the backend feed at {stream.url}.
            </div>
          )}
        </PanelCard>

        {mode === "counterstrike" ? (
          <PanelCard title="MATCH BOARD" accent={ACCENT} right={<Badge color={ACCENT}>{matches.length}</Badge>}>
            <DataState loading={matchLoading} error={matchError} empty={matches.length === 0} emptyLabel="No matches.">
              {matchSample && (
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
        ) : (
          <PanelCard title="THREAT BOARD" accent={threatColor} right={<Badge color={threatColor}>{threatLevel}</Badge>}>
            <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 4, background: "rgba(0,0,0,0.3)", border: `1px solid ${C.blue}33`, borderLeft: `3px solid ${C.blue}` }}>
                <div style={{ fontSize: 8, color: C.textB, letterSpacing: 1 }}>AGENTS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.blue }}>{agentCount}</div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", borderRadius: 4, background: "rgba(0,0,0,0.3)", border: `1px solid ${C.orange}33`, borderLeft: `3px solid ${C.orange}` }}>
                <div style={{ fontSize: 8, color: C.textB, letterSpacing: 1 }}>INTRUDERS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.orange }}>{intruderCount}</div>
              </div>
            </div>
            <DataState loading={signalLoading} error={signalError} empty={false}>
              {signalSample && (
                <div style={{ fontSize: 8, color: C.gold, marginBottom: 8 }}>
                  No RiskSignal records — showing seeded tactical signals.
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {signals.map((s) => {
                  const lvl = sevLabel(s);
                  const col = riskColor(lvl);
                  return (
                    <div key={s._id || s.id || s.label} style={{
                      padding: "8px 10px", borderRadius: 4, background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${col}33`, borderLeft: `3px solid ${col}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 9, color: C.textB, fontWeight: 700 }}>
                          {s.label || s.title || s.summary || `Signal ${s._id || s.id}`}
                        </span>
                        <Badge color={col}>{lvl}</Badge>
                      </div>
                      {(s.detail || s.description || s.entity) && (
                        <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>
                          {s.detail || s.description || s.entity}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </DataState>
          </PanelCard>
        )}
      </div>
      <LiveDataPanel pageName="War" limit={40} refreshMs={30000} />
    </PageShell>
  );
}
