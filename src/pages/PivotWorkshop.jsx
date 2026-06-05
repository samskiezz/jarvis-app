/**
 * PivotWorkshop — "PIVOT WORKSHOP": the Foundry-Workshop analysis surface.
 *
 * Pick an object type from the ontology, choose a group-by field (rows) and an
 * optional second field (columns), an aggregate (count/sum/avg/min/max) and a
 * value field, then RUN to materialise a pivot table over the live object model.
 * Results render three ways — a sortable PIVOT TABLE (rows × column aggregates),
 * an inline HISTOGRAM of the per-row totals, and a recharts BarChart of the
 * aggregated values. A SERIES STATS panel reports min/max/mean/quantiles for a
 * numeric value field over the selected objects.
 *
 * Backend (via wave1 apiGet/apiPost over kimiClient.request):
 *   POST /v1/workshop/groupby  {field, agg, value_field?, type?}
 *        → {field, agg, value_field, groups:{key:number}, n_groups}
 *   POST /v1/workshop/pivot    {rows_field, cols_field, agg, value_field?, type?}
 *        → {rows_field, cols_field, agg, value_field, row_keys[], col_keys[],
 *           table:{row_key:{col_key:number}}}
 *   POST /v1/workshop/histogram {field, bins, type?}
 *        → {field, bins, counts[], edges[], n}
 * Type list + candidate fields come from /v1/ontology/{types,objects}.
 *
 * Note: the backend aggregate vocabulary is count/sum/mean/min/max, so the UI
 * "avg" choice maps to "mean" on the wire (see AGG_WIRE).
 *
 * Themed dark/cyberpunk-glass via PageKit + Wave1Kit + COLORS; recharts gets a
 * dark tooltip + neon strokes. Every fetch degrades gracefully (DataState).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, qs, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;
// UI label → backend aggregate name ("avg" is "mean" on the wire).
const AGG_WIRE = { count: "count", sum: "sum", avg: "mean", min: "min", max: "max" };
const AGGS = Object.keys(AGG_WIRE);

// ── normalisers ──────────────────────────────────────────────────────────────

// groupby → sorted [{key, value}] from the {groups:{key:number}} map.
function toGroups(body) {
  const g = (body && body.groups) || {};
  if (Array.isArray(g)) {
    return g.map((r, i) => ({
      key: String(r.key ?? r.label ?? r.group ?? i),
      value: Number(r.value ?? r.count ?? r.agg ?? 0) || 0,
    }));
  }
  return Object.entries(g).map(([key, value]) => ({
    key: String(key),
    value: Number(value) || 0,
  }));
}

// histogram → [{label, count}] from parallel counts[]/edges[].
function toBuckets(body) {
  const counts = asList(body, "counts");
  const edges = (body && Array.isArray(body.edges) && body.edges) || [];
  return counts.map((c, i) => {
    const lo = edges[i];
    const hi = edges[i + 1];
    const label =
      lo != null && hi != null ? `${trim(lo)}–${trim(hi)}` : String(i);
    return { label, count: Number(c) || 0 };
  });
}

// pivot → {rowKeys, colKeys, table, totals} with per-row totals for charting.
function toPivot(body) {
  const rowKeys = asList(body, "row_keys").map(String);
  const colKeys = asList(body, "col_keys").map(String);
  const table = (body && body.table) || {};
  const totals = {};
  for (const rk of rowKeys) {
    let sum = 0;
    const row = table[rk] || {};
    for (const ck of colKeys) sum += Number(row[ck]) || 0;
    totals[rk] = sum;
  }
  return { rowKeys, colKeys, table, totals };
}

function trim(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function fmtNum(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
}

// Quantile of a sorted numeric array (linear interpolation).
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Per-field numeric stats over a sample of objects (min/max/mean/quantiles).
function seriesStats(objects, field) {
  const nums = [];
  for (const o of objects) {
    const v = readField(o, field);
    const f = Number(v);
    if (v != null && v !== "" && typeof v !== "boolean" && Number.isFinite(f)) nums.push(f);
  }
  if (!nums.length) return null;
  nums.sort((a, b) => a - b);
  const n = nums.length;
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return {
    n,
    min: nums[0],
    max: nums[n - 1],
    mean,
    std: Math.sqrt(variance),
    p25: quantile(nums, 0.25),
    p50: quantile(nums, 0.5),
    p75: quantile(nums, 0.75),
  };
}

// Read a field off an object — top-level column or a props/properties key.
function readField(o, field) {
  if (!o || typeof o !== "object") return undefined;
  if (o[field] != null) return o[field];
  const props = o.props || o.properties;
  if (props && typeof props === "object" && props[field] != null) return props[field];
  return undefined;
}

// ── inline SVG histogram (dependency-free) ───────────────────────────────────
function Histogram({ buckets, color = ACCENT }) {
  if (!buckets.length) return <div style={{ fontSize: 9, color: C.text, padding: 8 }}>no buckets</div>;
  const W = 520, H = 150, pad = 18;
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const bw = (W - pad) / buckets.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
      <line x1={pad} y1={H - pad} x2={W} y2={H - pad} stroke={C.border} strokeWidth="1" />
      {buckets.map((b, i) => {
        const h = (b.count / max) * (H - 2 * pad);
        const x = pad + i * bw;
        return (
          <g key={i}>
            <rect x={x + 1} y={H - pad - h} width={Math.max(1, bw - 2)} height={h} fill={color} opacity="0.8">
              <title>{`${b.label}: ${b.count}`}</title>
            </rect>
            {buckets.length <= 16 && (
              <text x={x + bw / 2} y={H - pad + 9} fontSize="6" fill={C.text} textAnchor="middle">
                {b.label.length > 8 ? b.label.slice(0, 7) + "…" : b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function PivotWorkshop() {
  const [types, setTypes] = useState([]);
  const [fields, setFields] = useState([]);
  const [sample, setSample] = useState([]); // sampled objects (for client-side series stats)

  // Config bar.
  const [typeFilter, setTypeFilter] = useState("");
  const [rowsField, setRowsField] = useState("");
  const [colsField, setColsField] = useState("");     // "" → no column split (group-by only)
  const [agg, setAgg] = useState("count");
  const [valueField, setValueField] = useState("");
  const [statField, setStatField] = useState("");

  // Results.
  const [pivot, setPivot] = useState(null);
  const [groups, setGroups] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [ran, setRan] = useState(false);
  const [sort, setSort] = useState({ key: "__total__", dir: "desc" });

  const { loading, error, run } = useAsync();

  // Bootstrap: types + a sample of objects → candidate fields.
  const bootstrap = useCallback(async () => {
    try {
      const t = await apiGet("/v1/ontology/types");
      setTypes(
        asList(t, "types")
          .map((x) => (typeof x === "string" ? x : (x.name || x.id || x.type)))
          .filter(Boolean),
      );
    } catch { setTypes([]); }
    try {
      const o = await apiGet(`/v1/ontology/objects${qs({ limit: 200 })}`);
      const objs = asList(o, "objects");
      setSample(objs);
      const keys = new Set();
      for (const ob of objs.slice(0, 200)) {
        const props = (ob && (ob.props || ob.properties)) || {};
        Object.keys(props).forEach((k) => keys.add(k));
        ["type", "label", "mark", "name"].forEach((k) => { if (ob && ob[k] != null) keys.add(k); });
      }
      const list = [...keys].sort();
      setFields(list);
      if (list.length) {
        setRowsField((f) => f || (list.includes("type") ? "type" : list[0]));
        setStatField((f) => f || list[0]);
      }
    } catch { setFields([]); setSample([]); }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const runPivot = useCallback(async () => {
    if (!rowsField) return;
    setRan(true);
    await run(async () => {
      const wire = AGG_WIRE[agg] || "count";
      const type = typeFilter || undefined;
      const vf = agg === "count" ? undefined : (valueField || undefined);

      if (colsField) {
        const body = await apiPost("/v1/workshop/pivot", {
          rows_field: rowsField, cols_field: colsField, agg: wire,
          value_field: vf, type,
        });
        const p = toPivot(body);
        setPivot(p);
        setGroups(p.rowKeys.map((rk) => ({ key: rk, value: p.totals[rk] })).sort((a, b) => b.value - a.value));
      } else {
        const body = await apiPost("/v1/workshop/groupby", {
          field: rowsField, agg: wire, value_field: vf, type,
        });
        const g = toGroups(body).sort((a, b) => b.value - a.value);
        setGroups(g);
        // Single-column pivot view so the table renderer is uniform.
        const table = {};
        g.forEach(({ key, value }) => { table[key] = { [agg]: value }; });
        setPivot({
          rowKeys: g.map((x) => x.key),
          colKeys: [agg],
          table,
          totals: Object.fromEntries(g.map((x) => [x.key, x.value])),
        });
      }

      // Histogram of the per-row aggregated values' distribution.
      try {
        const hb = await apiPost("/v1/workshop/histogram", {
          field: rowsField, bins: 12, type,
        });
        setBuckets(toBuckets(hb));
      } catch { setBuckets([]); }

      return true;
    });
  }, [rowsField, colsField, agg, valueField, typeFilter, run]);

  // Sorted rows for the pivot table.
  const sortedRows = useMemo(() => {
    if (!pivot) return [];
    const rows = [...pivot.rowKeys];
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (key === "__row__") return mul * a.localeCompare(b);
      if (key === "__total__") return mul * ((pivot.totals[a] || 0) - (pivot.totals[b] || 0));
      const va = Number(pivot.table[a]?.[key]) || 0;
      const vb = Number(pivot.table[b]?.[key]) || 0;
      return mul * (va - vb);
    });
    return rows;
  }, [pivot, sort]);

  const chartData = useMemo(
    () => groups.slice(0, 24).map((g) => ({ name: g.key, value: g.value })),
    [groups],
  );

  const stats = useMemo(() => {
    if (!statField) return null;
    const objs = typeFilter
      ? sample.filter((o) => String(readField(o, "type") ?? "") === typeFilter)
      : sample;
    return seriesStats(objs, statField);
  }, [sample, statField, typeFilter]);

  const fieldOptions = fields.length ? fields : ["type", "label", "mark"];
  const empty = ran && !loading && !error && groups.length === 0;

  const toggleSort = (key) =>
    setSort((s) => (s.key === key
      ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "desc" }));

  const sortArrow = (key) => (sort.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
  const thStyle = {
    fontSize: 8, letterSpacing: 1, color: C.text, textTransform: "uppercase",
    textAlign: "right", padding: "6px 8px", cursor: "pointer", userSelect: "none",
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };

  return (
    <PageShell
      title="PIVOT WORKSHOP"
      subtitle="WORKSHOP — OBJECT-SET AGGREGATION · PIVOT · HISTOGRAM · SERIES STATS"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={runPivot} disabled={loading || !rowsField}>{loading ? "…" : "▶ RUN"}</Btn>}
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Types" value={types.length} accent={C.blue} />
        <StatTile label="Fields" value={fields.length} accent={ACCENT} />
        <StatTile label="Rows" value={pivot ? pivot.rowKeys.length : 0} accent={C.gold} />
        <StatTile label="Cols" value={pivot ? pivot.colKeys.length : 0} accent={C.purple} />
      </Grid>

      {/* CONFIG BAR */}
      <PanelCard title="SOURCE · CONFIG" accent={C.blue} style={{ marginBottom: 14 }}
        right={<Badge color={C.blue}>{typeFilter || "all types"}</Badge>}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="OBJECT TYPE">
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 160 }}>
              <option value="">all types</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="GROUP BY (ROWS)">
            <select value={rowsField} onChange={(e) => setRowsField(e.target.value)} style={{ ...inputStyle, width: 150 }}>
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="SPLIT BY (COLS)">
            <select value={colsField} onChange={(e) => setColsField(e.target.value)} style={{ ...inputStyle, width: 150 }}>
              <option value="">— none —</option>
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Field label="AGGREGATE">
            <select value={agg} onChange={(e) => setAgg(e.target.value)} style={{ ...inputStyle, width: 100 }}>
              {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="VALUE FIELD">
            <select value={valueField} onChange={(e) => setValueField(e.target.value)}
              disabled={agg === "count"} style={{ ...inputStyle, width: 150, opacity: agg === "count" ? 0.5 : 1 }}>
              <option value="">— pick —</option>
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </Field>
          <Btn accent={ACCENT} onClick={runPivot} disabled={loading || !rowsField}>{loading ? "…" : "▶ RUN"}</Btn>
        </div>
        <div style={{ fontSize: 8, color: C.text, marginTop: 9 }}>
          {agg === "count"
            ? "Counts objects per group. Add SPLIT BY for a 2-D pivot."
            : `Aggregates "${valueField || "(value field)"}" with ${agg} per group${colsField ? " × column" : ""}.`}
        </div>
      </PanelCard>

      {/* SERIES STATS */}
      <PanelCard title="SERIES STATS" accent={C.gold} style={{ marginBottom: 14 }}
        right={
          <select value={statField} onChange={(e) => setStatField(e.target.value)}
            style={{ ...inputStyle, width: 150, fontSize: 8, padding: "4px 6px" }}>
            {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        }>
        {stats ? (
          <Grid min={110}>
            <StatTile label="n" value={stats.n} accent={C.gold} />
            <StatTile label="min" value={fmtNum(stats.min)} accent={C.blue} />
            <StatTile label="mean" value={fmtNum(stats.mean)} accent={ACCENT} />
            <StatTile label="max" value={fmtNum(stats.max)} accent={C.red} />
            <StatTile label="std" value={fmtNum(stats.std)} accent={C.purple} />
            <StatTile label="p25" value={fmtNum(stats.p25)} accent={C.text} />
            <StatTile label="median" value={fmtNum(stats.p50)} accent={ACCENT} />
            <StatTile label="p75" value={fmtNum(stats.p75)} accent={C.text} />
          </Grid>
        ) : (
          <div style={{ fontSize: 10, color: C.text, padding: 8 }}>
            Field <span style={{ color: C.textB }}>{statField || "—"}</span> has no numeric values in the sampled objects.
          </div>
        )}
      </PanelCard>

      {/* RESULTS */}
      <DataState loading={loading} error={error} empty={empty}
        emptyLabel="No aggregation returned for this configuration">
        {!ran ? (
          <PanelCard title="RESULTS" accent={ACCENT}>
            <div style={{ fontSize: 10, color: C.text, padding: 14 }}>
              Configure a group-by + aggregate above and press RUN to materialise the pivot.
            </div>
          </PanelCard>
        ) : pivot ? (
          <>
            {/* PIVOT TABLE */}
            <PanelCard title="PIVOT TABLE" accent={ACCENT} style={{ marginBottom: 14 }}
              right={<Badge color={ACCENT}>{agg}{colsField ? ` · ${rowsField} × ${colsField}` : ` · ${rowsField}`}</Badge>}>
              <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: "left", position: "sticky", top: 0,
                        background: C.panel, zIndex: 1 }}
                        onClick={() => toggleSort("__row__")}>
                        {rowsField}{sortArrow("__row__")}
                      </th>
                      {pivot.colKeys.map((ck) => (
                        <th key={ck} style={{ ...thStyle, position: "sticky", top: 0, background: C.panel, zIndex: 1 }}
                          onClick={() => toggleSort(ck)}>
                          {ck}{sortArrow(ck)}
                        </th>
                      ))}
                      {pivot.colKeys.length > 1 && (
                        <th style={{ ...thStyle, position: "sticky", top: 0, background: C.panel, zIndex: 1, color: ACCENT }}
                          onClick={() => toggleSort("__total__")}>
                          Σ TOTAL{sortArrow("__total__")}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((rk) => (
                      <tr key={rk} style={{ borderBottom: `1px solid ${C.borderB}` }}>
                        <td style={{ fontSize: 9, color: C.textB, padding: "5px 8px", whiteSpace: "nowrap",
                          maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={rk}>{rk}</td>
                        {pivot.colKeys.map((ck) => {
                          const v = pivot.table[rk]?.[ck];
                          return (
                            <td key={ck} style={{ fontSize: 9, color: v == null ? C.text : C.textB,
                              padding: "5px 8px", textAlign: "right" }}>
                              {v == null ? "·" : fmtNum(v)}
                            </td>
                          );
                        })}
                        {pivot.colKeys.length > 1 && (
                          <td style={{ fontSize: 9, color: ACCENT, padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>
                            {fmtNum(pivot.totals[rk])}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
              {/* HISTOGRAM */}
              <PanelCard title="HISTOGRAM" accent={C.purple} right={<Badge color={C.purple}>{rowsField}</Badge>}>
                {buckets.length ? (
                  <>
                    <Histogram buckets={buckets} color={C.purple} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                      {buckets.slice(0, 12).map((b, i) => (
                        <div key={i} style={{ fontSize: 8, color: C.textB, padding: "3px 7px",
                          background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 3 }}>
                          <span style={{ color: C.text }}>{b.label}: </span>{b.count}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 10, color: C.text, padding: 14 }}>
                    No numeric distribution for {rowsField} (non-numeric field).
                  </div>
                )}
              </PanelCard>

              {/* BARCHART */}
              <PanelCard title="AGGREGATE CHART" accent={ACCENT} right={<Badge color={ACCENT}>{agg}</Badge>}>
                {chartData.length ? (
                  <div style={{ width: "100%", height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
                        <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: C.text, fontSize: 8 }} stroke={C.border}
                          tickLine={false} interval={0} angle={-30} textAnchor="end" height={40} />
                        <YAxis tick={{ fill: C.text, fontSize: 8 }} stroke={C.border} tickLine={false} width={48} />
                        <Tooltip
                          cursor={{ fill: `${ACCENT}10` }}
                          contentStyle={{ background: C.panel, border: `1px solid ${ACCENT}55`, borderRadius: 5,
                            fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}
                          labelStyle={{ color: ACCENT }}
                          itemStyle={{ color: C.textB }}
                          formatter={(v) => [fmtNum(v), agg]}
                        />
                        <Bar dataKey="value" fill={ACCENT} fillOpacity={0.7} stroke={ACCENT}
                          strokeWidth={1} isAnimationActive={false} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: C.text, padding: 14 }}>No aggregated values to chart.</div>
                )}
              </PanelCard>
            </div>
          </>
        ) : null}
      </DataState>
    </PageShell>
  );
}

// Small labelled-control wrapper for the config bar.
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 8, letterSpacing: 1, color: C.text, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}
