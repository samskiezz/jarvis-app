/**
 * PluginControlPlane — live service/endpoint control plane.
 *
 * Was a static plugin table; now a REAL ops view driven by:
 *   • /v1/metrics      — measured endpoint timers (count + latency) and counters.
 *   • /v1/health/deep  — core component health.
 * Each measured endpoint is a row with its live call count, average latency and
 * derived status. Filter by category (inferred from the route prefix). No fake
 * health — a service only shows here once it has actually been exercised.
 * Apex pages use the orange accent.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import { apiGet, useAsync } from "@/lib/wave1";

const ACCENT = C.orange;

// Infer a capability category from an endpoint/timer name.
function categoryOf(name = "") {
  const n = name.toLowerCase();
  if (n.includes("predict") || n.includes("forecast") || n.includes("oracle")) return "Prediction";
  if (n.includes("science") || n.includes("labs") || n.includes("method")) return "Science";
  if (n.includes("ontology") || n.includes("entit") || n.includes("graph") || n.includes("search") || n.includes("semantic")) return "Ontology";
  if (n.includes("geo") || n.includes("temporal") || n.includes("scenario")) return "Analysis";
  if (n.includes("alert") || n.includes("case") || n.includes("collab") || n.includes("report")) return "Operations";
  if (n.includes("admin") || n.includes("metric") || n.includes("health") || n.includes("tenant")) return "Platform";
  return "Other";
}

const latColor = (ms) => (ms == null ? C.text : ms < 50 ? C.neon : ms < 300 ? C.gold : C.red);

export default function PluginControlPlane() {
  const [metrics, setMetrics] = useState(null);
  const [health, setHealth] = useState(null);
  const [cat, setCat] = useState("all");
  const a = useAsync();

  const load = useCallback(async () => {
    const m = await a.run(() => apiGet("/v1/metrics"));
    if (m) setMetrics(m);
    const h = await apiGet("/v1/health/deep").catch(() => null);
    if (h) setHealth(h);
  }, [a]);

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);

  const timers = metrics?.metrics?.timers || [];
  const rows = useMemo(() => timers.map((t) => {
    const avg = t.avg_ms ?? t.mean_ms ?? t.avg ?? (t.total_ms && t.count ? t.total_ms / t.count : null);
    return {
      name: t.name || t.key,
      category: categoryOf(t.name || t.key),
      count: t.count ?? t.n ?? 0,
      avg_ms: typeof avg === "number" ? avg : null,
      p95: t.p95_ms ?? t.p95 ?? null,
      status: (t.count ?? 0) > 0 ? "active" : "idle",
    };
  }), [timers]);

  const categories = useMemo(() => ["all", ...Array.from(new Set(rows.map((r) => r.category)))], [rows]);
  const filtered = cat === "all" ? rows : rows.filter((r) => r.category === cat);
  const components = health?.components || {};
  const totalCalls = rows.reduce((s, r) => s + (r.count || 0), 0);

  return (
    <PageShell title="PLUGIN CONTROL PLANE" subtitle="live endpoint telemetry · measured latency · component health" accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={load}>↻ REFRESH</Btn>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="measured services" value={rows.length} accent={ACCENT} />
        <StatTile label="total calls" value={totalCalls} accent={C.neon} />
        <StatTile label="active" value={rows.filter((r) => r.status === "active").length} accent={C.neon} />
        <StatTile label="core components up" value={`${Object.values(components).filter(Boolean).length}/${Object.keys(components).length || "—"}`} accent={C.gold} />
      </Grid>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {categories.map((cc) => (
          <Btn key={cc} accent={cc === cat ? ACCENT : C.text} style={cc === cat ? {} : { opacity: 0.55 }}
            onClick={() => setCat(cc)}>{cc.toUpperCase()}</Btn>
        ))}
      </div>

      <PanelCard title="SERVICES" accent={ACCENT}>
        <DataState loading={a.loading} error={a.error} empty={!rows.length}
          emptyLabel="No endpoint timers yet — exercise the API (open other pages) and they appear here live.">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.8fr", gap: 8, fontSize: 8,
              color: C.text, letterSpacing: 1, padding: "4px 8px", borderBottom: `1px solid ${C.border}` }}>
              <span>ENDPOINT</span><span>CATEGORY</span><span>CALLS</span><span>AVG LATENCY</span><span>STATUS</span>
            </div>
            {filtered.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.8fr", gap: 8,
                fontSize: 10, padding: "7px 8px", borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
                <span style={{ color: C.textB, fontWeight: 600 }}>{r.name}</span>
                <span><Badge color={C.gold}>{r.category}</Badge></span>
                <span style={{ color: C.neon }}>{r.count}</span>
                <span style={{ color: latColor(r.avg_ms) }}>{r.avg_ms != null ? `${r.avg_ms.toFixed(1)}ms` : "—"}</span>
                <span><Badge color={r.status === "active" ? C.neon : C.text}>{r.status}</Badge></span>
              </div>
            ))}
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
