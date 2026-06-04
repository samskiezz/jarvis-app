/**
 * ObjectExplorer — "OBJECT EXPLORER" (Workshop): the Gotham
 * object-explorer-with-histograms idea. Pick a field on the ontology objects,
 * see its distribution as a histogram, and group-by a field (with an aggregate)
 * rendered as a ranked bar table — all narrowed by an optional type filter.
 *
 * Backend (via kimiClient.request, wrapped by wave1 apiGet/apiPost):
 *   POST /v1/workshop/histogram  {field, bins, type?}  → buckets
 *   POST /v1/workshop/groupby    {field, agg, type?}   → groups
 *   POST /v1/workshop/pivot      {...}                 → (offered as extra agg view)
 * Type list + a sample of fields come from /v1/ontology/{types,objects}.
 *
 * DRY via Wave1Kit (Btn, inputStyle) + PageKit + wave1 (apiGet/apiPost/asList/
 * useAsync). Inline SVG keeps the histogram dependency-free; every fetch
 * degrades gracefully.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList } from "@/lib/wave1";

const ACCENT = C.neon;
const AGGS = ["count", "sum", "avg", "min", "max"];

// Normalize a histogram response into [{label, count}] regardless of backend
// shape: {buckets|bins|histogram: [{label|bin|x, count|value|y|n}]}.
function toBuckets(body) {
  const rows = asList(body, "buckets", "bins", "histogram");
  return rows.map((r, i) => {
    if (typeof r === "number") return { label: String(i), count: r };
    const label = r.label ?? r.bin ?? r.x ?? r.range ?? r.key ?? `${r.lo ?? ""}–${r.hi ?? ""}` ?? String(i);
    const count = Number(r.count ?? r.value ?? r.y ?? r.n ?? r.frequency ?? 0);
    return { label: String(label), count: Number.isFinite(count) ? count : 0 };
  });
}

// Normalize a group-by response into [{label, value}].
function toGroups(body) {
  const rows = asList(body, "groups", "results", "rows", "buckets");
  return rows.map((r, i) => {
    const label = r.label ?? r.key ?? r.group ?? r.value_label ?? r.name ?? String(i);
    const value = Number(r.value ?? r.agg ?? r.count ?? r.total ?? r.y ?? 0);
    return { label: String(label), value: Number.isFinite(value) ? value : 0 };
  }).sort((a, b) => b.value - a.value);
}

// Inline SVG histogram from buckets (dependency-free).
function Histogram({ buckets, color = ACCENT }) {
  if (!buckets.length) return <div style={{ fontSize: 9, color: C.text, padding: 8 }}>no buckets</div>;
  const W = 520, H = 160, pad = 18;
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
                {b.label.length > 7 ? b.label.slice(0, 6) + "…" : b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function ObjectExplorer() {
  const [types, setTypes] = useState([]);
  const [fields, setFields] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");

  // Histogram controls + state.
  const [hField, setHField] = useState("");
  const [bins, setBins] = useState(12);
  const [buckets, setBuckets] = useState([]);
  const [hLoading, setHLoading] = useState(false);
  const [hError, setHError] = useState(null);
  const [hRan, setHRan] = useState(false);

  // Group-by controls + state.
  const [gField, setGField] = useState("");
  const [agg, setAgg] = useState("count");
  const [groups, setGroups] = useState([]);
  const [gLoading, setGLoading] = useState(false);
  const [gError, setGError] = useState(null);
  const [gRan, setGRan] = useState(false);

  // Bootstrap: ontology types + a sample of objects to derive candidate fields.
  const bootstrap = useCallback(async () => {
    try {
      const t = await apiGet("/v1/ontology/types");
      setTypes(asList(t, "types").map((x) => (typeof x === "string" ? x : (x.name || x.id || x.type))).filter(Boolean));
    } catch { setTypes([]); }
    try {
      const o = await apiGet("/v1/ontology/objects?limit=50");
      const objs = asList(o, "objects");
      const keys = new Set();
      for (const ob of objs.slice(0, 50)) {
        const props = (ob && (ob.properties || ob.props)) || {};
        Object.keys(props).forEach((k) => keys.add(k));
        ["type", "name", "created_at", "updated_at"].forEach((k) => { if (ob && ob[k] != null) keys.add(k); });
      }
      const list = [...keys].sort();
      setFields(list);
      if (list.length) {
        setHField((f) => f || list[0]);
        setGField((f) => f || (list.includes("type") ? "type" : list[0]));
      }
    } catch { setFields([]); }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  const runHistogram = useCallback(async () => {
    if (!hField) return;
    setHLoading(true); setHError(null); setHRan(true);
    try {
      const body = await apiPost("/v1/workshop/histogram", { field: hField, bins: Number(bins) || 10, type: typeFilter || undefined });
      setBuckets(toBuckets(body));
    } catch (e) { setHError(e); setBuckets([]); }
    finally { setHLoading(false); }
  }, [hField, bins, typeFilter]);

  const runGroupBy = useCallback(async () => {
    if (!gField) return;
    setGLoading(true); setGError(null); setGRan(true);
    try {
      const body = await apiPost("/v1/workshop/groupby", { field: gField, agg, type: typeFilter || undefined });
      setGroups(toGroups(body));
    } catch (e) { setGError(e); setGroups([]); }
    finally { setGLoading(false); }
  }, [gField, agg, typeFilter]);

  const gMax = useMemo(() => Math.max(...groups.map((g) => g.value), 1), [groups]);
  const fieldOptions = fields.length ? fields : ["type", "name"];

  return (
    <PageShell
      title="OBJECT EXPLORER"
      subtitle="WORKSHOP — DISTRIBUTIONS · HISTOGRAMS · GROUP-BY OVER THE ONTOLOGY"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={() => { runHistogram(); runGroupBy(); }}>↻ RUN BOTH</Btn>}
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Types" value={types.length} accent={C.blue} />
        <StatTile label="Fields" value={fields.length} accent={ACCENT} />
        <StatTile label="Buckets" value={buckets.length} accent={C.gold} />
        <StatTile label="Groups" value={groups.length} accent={C.purple} />
      </Grid>

      {/* Shared type filter */}
      <PanelCard title="TYPE FILTER" accent={C.blue} style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...inputStyle, width: 220 }}>
            <option value="">all types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span style={{ fontSize: 8, color: C.text }}>
            Narrows both the histogram and group-by to objects of this type.
          </span>
        </div>
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)", gap: 14, alignItems: "start" }}>
        {/* HISTOGRAM */}
        <PanelCard title="HISTOGRAM" accent={ACCENT}
          right={<Badge color={ACCENT}>{hField || "—"}</Badge>}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={hField} onChange={(e) => setHField(e.target.value)} style={{ ...inputStyle, width: 170 }}>
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <label style={{ fontSize: 8, color: C.text }}>BINS</label>
            <input type="number" min={2} max={50} value={bins} onChange={(e) => setBins(e.target.value)}
              style={{ ...inputStyle, width: 70 }} />
            <Btn accent={ACCENT} onClick={runHistogram} disabled={hLoading}>{hLoading ? "…" : "▶ PLOT"}</Btn>
          </div>
          <DataState loading={hLoading} error={hError} empty={hRan && buckets.length === 0}
            emptyLabel="No distribution returned">
            {hRan ? (
              <>
                <Histogram buckets={buckets} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {buckets.slice(0, 12).map((b, i) => (
                    <div key={i} style={{ fontSize: 8, color: C.textB, padding: "3px 7px", background: "rgba(0,0,0,0.3)",
                      border: `1px solid ${C.border}`, borderRadius: 3 }}>
                      <span style={{ color: C.text }}>{b.label}: </span>{b.count}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 10, color: C.text, padding: 14 }}>Pick a field and PLOT to see its distribution.</div>
            )}
          </DataState>
        </PanelCard>

        {/* GROUP-BY */}
        <PanelCard title="GROUP BY" accent={C.purple}
          right={<Badge color={C.purple}>{agg}</Badge>}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={gField} onChange={(e) => setGField(e.target.value)} style={{ ...inputStyle, width: 150 }}>
              {fieldOptions.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={agg} onChange={(e) => setAgg(e.target.value)} style={{ ...inputStyle, width: 90 }}>
              {AGGS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <Btn accent={C.purple} onClick={runGroupBy} disabled={gLoading}>{gLoading ? "…" : "▶ GROUP"}</Btn>
          </div>
          <DataState loading={gLoading} error={gError} empty={gRan && groups.length === 0}
            emptyLabel="No groups returned">
            {gRan ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto" }}>
                {groups.map((g, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, color: C.textB, width: 110, overflow: "hidden", textOverflow: "ellipsis",
                      whiteSpace: "nowrap" }} title={g.label}>{g.label}</span>
                    <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, (g.value / gMax) * 100)}%`, height: "100%", background: C.purple }} />
                    </div>
                    <span style={{ fontSize: 9, color: C.textB, width: 60, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {g.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: C.text, padding: 14 }}>Pick a field + aggregate, then GROUP.</div>
            )}
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
