/**
 * Quiver — a QUIVER-grade analytics dashboard builder (Palantir Foundry Quiver /
 * Workshop feel). A grid of live-bound WIDGETS the user can add / remove, each
 * binding a live data SOURCE to a CHART TYPE rendered with recharts.
 *
 * Data sources (all live, read-only):
 *   GET /v1/datasets                 → {items:[{id|name,kind,row_count,...}]}
 *   GET /v1/datasets/{id}/health     → {checks?|...}  (per-dataset facts)
 *   GET /v1/metrics                  → {metrics:{counters,timers}, system}
 *   GET /v1/history/series           → {items:[{series_id,entity,metric,n_obs}]}
 *   GET /v1/history/series/{id}       → {observations:[{t,value}]}  (time chart)
 *
 * Each source is fetched ONCE into a shared cache and every widget reads from it,
 * so one failing source degrades only the widgets bound to it (DataState per
 * widget), never the whole board. Layout (widgets + columns) persists to
 * localStorage under "apex.quiver.v1" so it survives reloads. Recharts is themed
 * to the cyberpunk-glass dark house style via COLORS.
 *
 * DRY: PageKit (PageShell/PanelCard/StatTile/Grid/Badge/DataState) + Wave1Kit
 * (Btn/inputStyle) + wave1 (apiGet/asList). recharts for the real charts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, asList } from "@/lib/wave1";

const ACCENT = C.blue;
const LS_KEY = "apex.quiver.v1";

// Theme palette cycled through for series / pie slices.
const PALETTE = [C.neon, C.blue, C.gold, C.purple, C.red, C.orange];

// ── data sources ─────────────────────────────────────────────────────────────
// Each source declares an async loader; the board fetches each once and caches.
const SOURCES = {
  datasets: {
    label: "Datasets",
    accent: C.neon,
    load: async () => asList(await apiGet("/v1/datasets"), "datasets"),
  },
  counters: {
    label: "Metric Counters",
    accent: C.gold,
    load: async () => {
      const body = await apiGet("/v1/metrics");
      return asList(body?.metrics?.counters || [], "counters");
    },
  },
  timers: {
    label: "Endpoint Timers",
    accent: C.purple,
    load: async () => {
      const body = await apiGet("/v1/metrics");
      return asList(body?.metrics?.timers || [], "timers");
    },
  },
  series: {
    label: "History Series",
    accent: C.blue,
    load: async () => {
      // The route lives at /v1/history/series; fall back to /history/series.
      let body;
      try { body = await apiGet("/v1/history/series"); }
      catch { body = await apiGet("/history/series"); }
      return asList(body, "series");
    },
  },
};

// Chart types each widget can render. `kinds` gates which are offered for a
// source (e.g. a pie of timer latencies makes less sense than a bar).
const CHART_TYPES = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "pie", label: "Pie" },
  { id: "stat", label: "Stat (big number)" },
  { id: "table", label: "Table" },
];

// ── source → {name,value} chart rows ──────────────────────────────────────────
// Normalize each source's raw rows into a uniform {name,value} shape charts use.
function rowsFor(sourceId, raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (sourceId === "datasets") {
    return list.map((d) => ({
      name: String(d.name || d.id || "—"),
      value: Number(d.row_count ?? d.rows ?? d.count ?? 0) || 0,
      meta: d.kind || d.source || "",
    }));
  }
  if (sourceId === "counters") {
    return list.map((c) => ({
      name: String(c.name || c.label || "—").replace(/^.*[:.]/, ""),
      value: Number(c.value ?? c.count ?? 0) || 0,
      meta: String(c.name || ""),
    }));
  }
  if (sourceId === "timers") {
    return list.map((t) => ({
      name: String(t.name || t.label || "—").replace(/^.*[:.]/, ""),
      value: Number(t.avg_ms ?? t.p50_ms ?? t.value ?? 0) || 0,
      meta: `${Number(t.count ?? 0) || 0} calls`,
    }));
  }
  if (sourceId === "series") {
    return list.map((s) => ({
      name: String(s.entity || s.series_id || "—"),
      value: Number(s.n_obs ?? s.n_points ?? s.count ?? 0) || 0,
      meta: String(s.metric || s.series_id || ""),
    }));
  }
  return [];
}

// ── recharts theme bits ───────────────────────────────────────────────────────
const axisProps = {
  tick: { fontSize: 8, fill: C.text, fontFamily: "'JetBrains Mono',monospace" },
  stroke: C.border,
  tickLine: false,
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "rgba(2,8,12,0.96)", border: `1px solid ${C.border}`,
      borderRadius: 4, padding: "6px 9px", fontFamily: "'JetBrains Mono',monospace",
      boxShadow: "0 6px 20px -8px rgba(0,0,0,0.8)" }}>
      <div style={{ fontSize: 9, color: C.textB, marginBottom: 3 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 9, color: p.color || p.fill || C.neon }}>
          {p.name}: {typeof p.value === "number" ? p.value.toLocaleString() : String(p.value)}
        </div>
      ))}
    </div>
  );
}

// Render the recharts chart for a widget given its already-normalized rows.
function WidgetChart({ widget, rows, seriesRows }) {
  const color = widget.color || PALETTE[0];
  const data = rows.slice(0, 16);

  if (widget.chart === "stat") {
    const total = rows.reduce((a, r) => a + (Number(r.value) || 0), 0);
    const top = rows[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center",
        height: "100%", minHeight: 120 }}>
        <div style={{ fontSize: 38, fontWeight: 700, color, lineHeight: 1 }}>
          {total.toLocaleString()}
        </div>
        <div style={{ fontSize: 9, color: C.text, marginTop: 6, letterSpacing: 1 }}>
          {rows.length} ROWS · TOTAL {widget.field || "value"}
        </div>
        {top && (
          <div style={{ fontSize: 9, color: C.textB, marginTop: 8 }}>
            top: <span style={{ color }}>{top.name}</span> ({Number(top.value).toLocaleString()})
          </div>
        )}
      </div>
    );
  }

  if (widget.chart === "table") {
    return (
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
          <thead>
            <tr style={{ color: C.text, textAlign: "left" }}>
              <th style={{ padding: "3px 6px", borderBottom: `1px solid ${C.border}` }}>NAME</th>
              <th style={{ padding: "3px 6px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} style={{ color: C.textB }}>
                <td style={{ padding: "3px 6px", borderBottom: `1px solid ${C.borderB}`,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}
                  title={r.meta || r.name}>{r.name}</td>
                <td style={{ padding: "3px 6px", borderBottom: `1px solid ${C.borderB}`,
                  textAlign: "right", color }}>{Number(r.value).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (widget.chart === "pie") {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius={72} innerRadius={36} stroke="rgba(2,8,12,0.9)" strokeWidth={1.5}
            paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.85} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // A history-series widget with a bound series id renders the live time series.
  const timeData = widget.source === "series" && seriesRows && seriesRows.length
    ? seriesRows : null;

  if (widget.chart === "line") {
    const d = timeData || data;
    const xKey = timeData ? "t" : "name";
    return (
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={d} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} hide={!!timeData} />
          <YAxis {...axisProps} width={38} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: color, strokeOpacity: 0.25 }} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.8}
            dot={false} activeDot={{ r: 3, fill: color }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (widget.chart === "area") {
    const d = timeData || data;
    const xKey = timeData ? "t" : "name";
    const gid = `qg-${widget.id}`;
    return (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={d} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} hide={!!timeData} />
          <YAxis {...axisProps} width={38} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: color, strokeOpacity: 0.25 }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.6}
            fill={`url(#${gid})`} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  // default: bar
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="name" {...axisProps} hide />
        <YAxis {...axisProps} width={38} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: color, fillOpacity: 0.06 }} />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── default seed board ────────────────────────────────────────────────────────
let _uid = 0;
const mkId = () => `w${Date.now().toString(36)}${(_uid++).toString(36)}`;
const DEFAULT_WIDGETS = () => [
  { id: mkId(), title: "Dataset Row Counts", source: "datasets", chart: "bar", color: C.neon },
  { id: mkId(), title: "Live Metric Counters", source: "counters", chart: "bar", color: C.gold },
  { id: mkId(), title: "Endpoint Timer Latency", source: "timers", chart: "area", color: C.purple },
];

function loadBoard() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.widgets)) return null;
    // Keep only widgets that reference a known source / chart.
    const widgets = parsed.widgets.filter(
      (w) => w && SOURCES[w.source] && CHART_TYPES.some((t) => t.id === w.chart),
    );
    return { widgets, cols: [1, 2, 3].includes(parsed.cols) ? parsed.cols : 2 };
  } catch { return null; }
}

export default function Quiver() {
  const initial = useRef(loadBoard());
  const [widgets, setWidgets] = useState(() => initial.current?.widgets?.length
    ? initial.current.widgets : DEFAULT_WIDGETS());
  const [cols, setCols] = useState(() => initial.current?.cols || 2);

  // Shared per-source cache: { [sourceId]: { rows, error, loading } }.
  const [cache, setCache] = useState({});
  // Per-widget bound time-series observations: { [widgetId]: [{t,value}] }.
  const [seriesObs, setSeriesObs] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  // Inline composer state.
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ source: "datasets", chart: "bar", seriesId: "" });

  // Persist the board whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ widgets, cols })); }
    catch { /* storage may be unavailable; non-fatal */ }
  }, [widgets, cols]);

  // Which sources are actually referenced by the current board (fetch only these).
  const activeSources = useMemo(
    () => [...new Set(widgets.map((w) => w.source))].filter((s) => SOURCES[s]),
    [widgets],
  );

  // Fetch one source into the cache, isolated so a failure only marks that source.
  const loadSource = useCallback(async (id) => {
    setCache((c) => ({ ...c, [id]: { ...(c[id] || {}), loading: true, error: null } }));
    try {
      const rows = await SOURCES[id].load();
      setCache((c) => ({ ...c, [id]: { rows: rowsFor(id, rows), raw: rows, loading: false, error: null } }));
    } catch (e) {
      setCache((c) => ({ ...c, [id]: { rows: [], loading: false, error: e } }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all(activeSources.map((id) => loadSource(id)));
    setRefreshing(false);
  }, [activeSources, loadSource]);

  // Initial + whenever a newly-referenced source appears, fetch any missing ones.
  useEffect(() => {
    const missing = activeSources.filter((id) => !cache[id]);
    if (missing.length) missing.forEach((id) => loadSource(id));
  }, [activeSources, cache, loadSource]);

  // Lazily load the observations for any widget bound to a specific series id.
  useEffect(() => {
    widgets.forEach((w) => {
      if (w.source !== "series" || !w.seriesId || seriesObs[w.id]) return;
      setSeriesObs((s) => ({ ...s, [w.id]: [] })); // mark in-flight
      (async () => {
        try {
          let body;
          try { body = await apiGet(`/v1/history/series/${encodeURIComponent(w.seriesId)}?limit=200`); }
          catch { body = await apiGet(`/history/series/${encodeURIComponent(w.seriesId)}?limit=200`); }
          const obs = asList(body, "observations", "points").map((o) => ({
            t: o.t ?? o.ts ?? o.time ?? "",
            value: Number(o.value ?? o.y ?? o.v ?? 0) || 0,
          }));
          setSeriesObs((s) => ({ ...s, [w.id]: obs }));
        } catch {
          setSeriesObs((s) => ({ ...s, [w.id]: [] }));
        }
      })();
    });
  }, [widgets, seriesObs]);

  const addWidget = () => {
    const src = SOURCES[draft.source];
    const title = `${src.label}${draft.seriesId ? ` · ${draft.seriesId}` : ""}`;
    const widget = {
      id: mkId(), title, source: draft.source, chart: draft.chart,
      color: src.accent,
      ...(draft.source === "series" && draft.seriesId ? { seriesId: draft.seriesId } : {}),
    };
    setWidgets((w) => [...w, widget]);
    setComposing(false);
    setDraft({ source: "datasets", chart: "bar", seriesId: "" });
  };

  const removeWidget = (id) => setWidgets((w) => w.filter((x) => x.id !== id));
  const setWidgetChart = (id, chart) =>
    setWidgets((w) => w.map((x) => (x.id === id ? { ...x, chart } : x)));
  const resetBoard = () => { setWidgets(DEFAULT_WIDGETS()); setSeriesObs({}); };

  // Series-catalog rows feed the composer's series-id picker.
  const seriesCatalog = cache.series?.raw || [];

  return (
    <PageShell
      title="QUIVER"
      subtitle="ANALYTICS DASHBOARD BUILDER · LIVE-BOUND WIDGETS · RECHARTS"
      accent={ACCENT}
      actions={
        <>
          <Btn accent={ACCENT} onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "◌ REFRESH" : "↻ REFRESH ALL"}
          </Btn>
          <Btn accent={C.text} onClick={resetBoard} style={{ marginLeft: 8 }}>⟲ RESET</Btn>
        </>
      }
    >
      {/* ── toolbar ── */}
      <PanelCard title="DASHBOARD" accent={ACCENT}
        right={
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge color={ACCENT}>{widgets.length} WIDGETS</Badge>
            <span style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3].map((n) => (
                <button key={n} onClick={() => setCols(n)} title={`${n} column${n > 1 ? "s" : ""}`}
                  style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 9, fontWeight: 700,
                    width: 24, height: 22, borderRadius: 4,
                    border: `1px solid ${cols === n ? ACCENT + "88" : C.border}`,
                    background: cols === n ? ACCENT + "1a" : "rgba(0,0,0,0.25)",
                    color: cols === n ? ACCENT : C.text }}>
                  {n}
                </button>
              ))}
            </span>
            <Btn accent={C.neon} onClick={() => setComposing((v) => !v)}>
              {composing ? "✕ CANCEL" : "+ ADD WIDGET"}
            </Btn>
          </span>
        }
      >
        {composing ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
              <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>SOURCE</span>
              <select value={draft.source} style={inputStyle}
                onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value, seriesId: "" }))}>
                {Object.entries(SOURCES).map(([id, s]) => (
                  <option key={id} value={id}>{s.label}</option>
                ))}
              </select>
            </label>
            {draft.source === "series" && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 200 }}>
                <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>SERIES (time chart)</span>
                <select value={draft.seriesId} style={inputStyle}
                  onChange={(e) => setDraft((d) => ({ ...d, seriesId: e.target.value }))}>
                  <option value="">— catalog summary —</option>
                  {seriesCatalog.map((s) => {
                    const sid = s.series_id || s.id;
                    return <option key={sid} value={sid}>{s.entity || sid} · {s.metric || ""}</option>;
                  })}
                </select>
              </label>
            )}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
              <span style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CHART TYPE</span>
              <select value={draft.chart} style={inputStyle}
                onChange={(e) => setDraft((d) => ({ ...d, chart: e.target.value }))}>
                {CHART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
            <Btn accent={C.neon} onClick={addWidget}>＋ ADD TO BOARD</Btn>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: C.text, letterSpacing: 0.5 }}>
            {activeSources.length} live source{activeSources.length === 1 ? "" : "s"} bound ·
            layout persisted to localStorage · pick a chart type per widget from its header
          </div>
        )}
      </PanelCard>

      {/* ── KPI strip across the active sources ── */}
      <Grid min={150} style={{ margin: "14px 0" }}>
        {activeSources.map((id) => {
          const s = cache[id];
          const total = (s?.rows || []).reduce((a, r) => a + (Number(r.value) || 0), 0);
          return (
            <StatTile key={id} label={SOURCES[id].label} accent={SOURCES[id].accent}
              value={s?.loading ? "◌" : s?.error ? "⚠" : (s?.rows?.length || 0)}
              sub={s?.error ? "source down" : `Σ ${total.toLocaleString()}`} />
          );
        })}
      </Grid>

      {/* ── the widget grid ── */}
      {widgets.length === 0 ? (
        <PanelCard accent={ACCENT}>
          <div style={{ padding: 30, textAlign: "center", fontSize: 10, color: C.text, letterSpacing: 1 }}>
            Empty board — use “+ ADD WIDGET” to bind a live source to a chart, or RESET for defaults.
          </div>
        </PanelCard>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 12 }}>
          {widgets.map((w) => {
            const s = cache[w.source];
            const color = w.color || PALETTE[0];
            const obs = w.source === "series" ? seriesObs[w.id] : null;
            const empty = !s?.loading && !s?.error && (s?.rows?.length || 0) === 0;
            return (
              <section key={w.id} style={{ borderRadius: 6, overflow: "hidden",
                border: `1px solid ${color}33`, background: "rgba(4,10,18,0.82)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                boxShadow: `0 8px 30px -12px rgba(0,0,0,0.7), inset 0 0 22px ${color}0a` }}>
                <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px",
                  borderBottom: `1px solid ${C.border}`, background: `${color}0d` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color,
                    boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 1, flex: 1,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    title={w.title}>{w.title}</span>
                  <Badge color={SOURCES[w.source]?.accent || color}>{SOURCES[w.source]?.label || w.source}</Badge>
                  <select value={w.chart} onChange={(e) => setWidgetChart(w.id, e.target.value)}
                    style={{ ...inputStyle, width: "auto", padding: "2px 4px", fontSize: 9 }}>
                    {CHART_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button onClick={() => removeWidget(w.id)} title="remove widget"
                    style={{ cursor: "pointer", background: "none", border: "none", color: C.text,
                      fontFamily: "inherit", fontSize: 12, lineHeight: 1 }}>✕</button>
                </header>
                <div style={{ padding: 10, minHeight: 150 }}>
                  <DataState loading={s?.loading} error={s?.error} empty={empty}
                    emptyLabel="No rows from this source">
                    <WidgetChart widget={w} rows={s?.rows || []} seriesRows={obs} />
                  </DataState>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
