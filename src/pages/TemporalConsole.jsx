/**
 * TemporalConsole — front end for the Wave-6 Temporal Analysis service
 * (Palantir-Gotham temporal pillar). Pick a History-Lake series and:
 *   • range-query it with summary stats,
 *   • detect threshold-crossing EVENTS,
 *   • scan for anomalies / volatility (pattern scan),
 *   • scrub a REPLAY timeline (frame slider over cumulative state),
 *   • inspect an ontology object's temporal VERSION trail.
 *
 * Everything degrades gracefully — an empty store just shows "no data" rather
 * than throwing. Backed by /v1/temporal/* (range, events, patterns, replay,
 * object/{id}/versions, timeline).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, DataState, Badge } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

// Tiny inline sparkline so a series reads at a glance without a chart lib.
function Spark({ points, width = 520, height = 90, color = ACCENT, marks = [] }) {
  const vals = points.map((p) => (typeof p === "number" ? p : p.v ?? p.value));
  if (!vals.length) return <div style={{ color: C.text, fontSize: 10, padding: 20 }}>—</div>;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const x = (i) => (i / Math.max(1, vals.length - 1)) * width;
  const y = (v) => height - ((v - min) / span) * (height - 8) - 4;
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={`${color}14`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" />
      {marks.map((m, i) => {
        const idx = typeof m === "number" ? m : m.idx;
        if (idx == null || idx < 0 || idx >= vals.length) return null;
        return <circle key={i} cx={x(idx)} cy={y(vals[idx])} r="3" fill={C.gold} stroke="#000" strokeWidth="0.5" />;
      })}
    </svg>
  );
}

export default function TemporalConsole() {
  const [series, setSeries] = useState([]);
  const [sid, setSid] = useState("");
  const [objectId, setObjectId] = useState("");
  const seriesAsync = useAsync();
  const rangeAsync = useAsync();
  const eventsAsync = useAsync();
  const patternAsync = useAsync();
  const replayAsync = useAsync();
  const versionAsync = useAsync();

  const [range, setRange] = useState(null);
  const [events, setEvents] = useState([]);
  const [pattern, setPattern] = useState(null);
  const [replay, setReplay] = useState([]);
  const [frame, setFrame] = useState(0);
  const [versions, setVersions] = useState([]);

  // Load the series catalog (reuses the History-Lake catalog surfaced elsewhere).
  useEffect(() => {
    (async () => {
      // Try the temporal timeline's source of series via the history route first,
      // then fall back to a bare timeline POST that returns series ids.
      const body = await seriesAsync.run(() => apiGet("/v1/history/series").catch(() => apiGet("/history/series")));
      const list = asList(body, "series");
      setSeries(list);
      if (list.length && !sid) setSid(list[0].series_id || list[0].id || "");
    })();
  }, []);

  const loadSeries = useCallback(async (id) => {
    if (!id) return;
    const [r, e, p, rep] = await Promise.all([
      rangeAsync.run(() => apiGet(`/v1/temporal/range${qs({ series_id: id })}`)),
      eventsAsync.run(() => apiGet(`/v1/temporal/events${qs({ series_id: id })}`)),
      patternAsync.run(() => apiGet(`/v1/temporal/patterns${qs({ series_id: id })}`)),
      replayAsync.run(() => apiGet(`/v1/temporal/replay${qs({ series_id: id, n_frames: 60 })}`)),
    ]);
    setRange(r || null);
    setEvents(asList(e, "events"));
    setPattern(p || null);
    const frames = asList(rep, "frames");
    setReplay(frames);
    setFrame(Math.max(0, frames.length - 1));
  }, [rangeAsync, eventsAsync, patternAsync, replayAsync]);

  useEffect(() => { if (sid) loadSeries(sid); }, [sid, loadSeries]);

  const loadVersions = async () => {
    if (!objectId.trim()) return;
    const body = await versionAsync.run(() => apiGet(`/v1/temporal/object/${encodeURIComponent(objectId.trim())}/versions`));
    setVersions(asList(body, "versions", "timeline"));
  };

  const rangePoints = useMemo(() => asList(range, "observations", "points"), [range]);
  const stats = range?.stats || range || {};
  const eventMarks = useMemo(() => {
    if (!rangePoints.length || !events.length) return [];
    const ts = rangePoints.map((p) => p.t ?? p.ts);
    return events.map((ev) => ({ idx: ts.indexOf(ev.t ?? ev.ts) })).filter((m) => m.idx >= 0);
  }, [rangePoints, events]);

  const fmt = (n, d = 2) => (typeof n === "number" && isFinite(n) ? n.toFixed(d) : "—");
  const curFrame = replay[frame] || {};

  return (
    <PageShell title="TEMPORAL CONSOLE" subtitle="time-series range · events · anomalies · replay scrubber · object versions" accent={ACCENT}
      actions={<Badge color={ACCENT}>{series.length} SERIES</Badge>}>
      <Grid min={140} style={{ marginBottom: 14 }}>
        <StatTile label="observations" value={stats.n ?? "—"} accent={ACCENT} />
        <StatTile label="mean" value={fmt(stats.mean)} accent={C.gold} />
        <StatTile label="min / max" value={`${fmt(stats.min)} / ${fmt(stats.max)}`} accent={ACCENT} />
        <StatTile label="slope" value={fmt(stats.slope, 4)} accent={C.gold} sub="trend" />
        <StatTile label="events" value={events.length} accent={C.red} sub="threshold crossings" />
        <StatTile label="anomalies" value={pattern?.n_anomalies ?? asList(pattern, "anomalies").length} accent={C.red} sub="|z|>2.5" />
      </Grid>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: C.text }}>SERIES</span>
        <select value={sid} onChange={(e) => setSid(e.target.value)} style={{ ...inputStyle, minWidth: 280 }}>
          {!series.length && <option value="">(no series in History Lake)</option>}
          {series.map((s) => {
            const id = s.series_id || s.id;
            return <option key={id} value={id}>{(s.entity || "") + " · " + (s.metric || id)} ({s.n_obs ?? "?"})</option>;
          })}
        </select>
        <Btn accent={ACCENT} onClick={() => loadSeries(sid)}>RELOAD</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <PanelCard title="SERIES + EVENTS" accent={ACCENT} right={<Badge color={C.gold}>{eventMarks.length} marked</Badge>}>
          <DataState loading={rangeAsync.loading} error={rangeAsync.error}
            empty={!rangePoints.length} emptyLabel="No observations — ingest data into the History Lake first.">
            <Spark points={rangePoints} marks={eventMarks} />
          </DataState>
        </PanelCard>

        <PanelCard title="REPLAY SCRUBBER" accent={C.gold}>
          <DataState loading={replayAsync.loading} empty={!replay.length} emptyLabel="No frames">
            <div style={{ fontSize: 11, color: C.textB, marginBottom: 8 }}>
              frame <b style={{ color: C.gold }}>{frame + 1}</b> / {replay.length}
            </div>
            <input type="range" min={0} max={Math.max(0, replay.length - 1)} value={frame}
              onChange={(e) => setFrame(Number(e.target.value))} style={{ width: "100%" }} />
            <Grid min={90} style={{ marginTop: 10 }}>
              <StatTile label="t" value={curFrame.t ? new Date(curFrame.t).toLocaleString() : "—"} accent={C.gold} />
              <StatTile label="value" value={fmt(curFrame.value)} accent={ACCENT} />
              <StatTile label="cum mean" value={fmt(curFrame.cum_mean)} accent={C.gold} />
            </Grid>
          </DataState>
        </PanelCard>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <PanelCard title="THRESHOLD EVENTS" accent={C.red}>
          <DataState loading={eventsAsync.loading} empty={!events.length} emptyLabel="No threshold crossings">
            <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {events.slice(0, 60).map((ev, i) => (
                <div key={i} style={{ display: "flex", gap: 8, fontSize: 10, padding: "4px 6px",
                  borderBottom: `1px solid ${C.border}` }}>
                  <Badge color={ev.kind === "down" || ev.direction === "down" ? C.red : ACCENT}>{ev.kind || ev.direction || "x"}</Badge>
                  <span style={{ color: C.text }}>{ev.t ? new Date(ev.t).toLocaleString() : ev.ts}</span>
                  <span style={{ marginLeft: "auto", color: C.textB }}>{fmt(ev.value ?? ev.v)}</span>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>

        <PanelCard title="OBJECT VERSION TRAIL" accent={C.gold}
          right={<span style={{ display: "flex", gap: 6 }}>
            <input value={objectId} onChange={(e) => setObjectId(e.target.value)} placeholder="object id"
              style={{ ...inputStyle, width: 130 }} onKeyDown={(e) => e.key === "Enter" && loadVersions()} />
            <Btn accent={C.gold} onClick={loadVersions}>TRACE</Btn>
          </span>}>
          <DataState loading={versionAsync.loading} error={versionAsync.error}
            empty={!versions.length} emptyLabel="Enter an ontology object id to see its change timeline">
            <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {versions.map((v, i) => (
                <div key={i} style={{ fontSize: 10, padding: "4px 6px", borderLeft: `2px solid ${C.gold}`,
                  background: `${C.gold}0a`, marginBottom: 2 }}>
                  <span style={{ color: C.gold }}>{v.kind || "change"}</span>
                  <span style={{ color: C.text, marginLeft: 8 }}>{v.ts ? new Date(v.ts).toLocaleString() : ""}</span>
                  {v.detail && <div style={{ color: C.textB, marginTop: 2 }}>{typeof v.detail === "string" ? v.detail : JSON.stringify(v.detail)}</div>}
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
