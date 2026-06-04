/**
 * ApexCore — the live platform core overview.
 *
 * Was a static plugin grid; now wired to REAL backend telemetry:
 *   • /v1/health/deep   — per-component health (history_lake, ontology,
 *     science_bridge, gpu_configured) with live status dots.
 *   • /v1/metrics       — counters / timers + process/system facts.
 *   • /v1/admin/summary — platform object counts (bearer; degrades if absent).
 * Auto-refreshes every 10s. Apex pages use the orange accent.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, useAsync } from "@/lib/wave1";

const ACCENT = C.orange;
const DOT = { true: C.neon, false: C.red };

const COMPONENT_LABELS = {
  history_lake: "History Lake",
  ontology: "Ontology Store",
  science_bridge: "Science Engine Bridge",
  gpu_configured: "GPU Tier (vast.ai)",
};

export default function ApexCore() {
  const [health, setHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [summary, setSummary] = useState(null);
  const healthAsync = useAsync();

  const load = useCallback(async () => {
    const [h, m, s] = await Promise.all([
      healthAsync.run(() => apiGet("/v1/health/deep")),
      apiGet("/v1/metrics").catch(() => null),
      apiGet("/v1/admin/summary").catch(() => null), // bearer-gated; ok if null
    ]);
    if (h) setHealth(h);
    if (m) setMetrics(m);
    if (s) setSummary(s);
  }, [healthAsync]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const components = health?.components || {};
  const compEntries = Object.entries(components);
  const upCount = compEntries.filter(([, v]) => v).length;
  const counters = metrics?.metrics?.counters || [];
  const system = metrics?.system || {};
  const sum = summary?.summary || {};

  return (
    <PageShell title="APEX CORE" subtitle="live platform telemetry · component health · metrics" accent={ACCENT}
      actions={<Badge color={health?.ok ? C.neon : C.red}>{health?.ok ? "● CORE OK" : "● DEGRADED"}</Badge>}>
      <Grid min={150} style={{ marginBottom: 16 }}>
        <StatTile label="components up" value={`${upCount}/${compEntries.length || "—"}`} accent={ACCENT} />
        <StatTile label="counters tracked" value={counters.length} accent={C.neon} />
        <StatTile label="ontology objects" value={sum.objects ?? sum.ontology_objects ?? "—"} accent={C.gold} sub="from admin summary" />
        <StatTile label="audit entries" value={sum.audit ?? sum.audit_entries ?? "—"} accent={C.gold} />
        <StatTile label="uptime" value={system.uptime_s ? `${Math.floor(system.uptime_s / 60)}m` : "—"} accent={C.neon} />
        <StatTile label="rss" value={system.rss_mb ? `${Math.round(system.rss_mb)}MB` : (system.memory_mb ? `${Math.round(system.memory_mb)}MB` : "—")} accent={ACCENT} />
      </Grid>

      <PanelCard title="COMPONENT HEALTH" accent={ACCENT}>
        <DataState loading={healthAsync.loading} error={healthAsync.error}
          empty={!compEntries.length} emptyLabel="Backend unreachable — start the APEX server on :8000">
          <Grid min={220}>
            {compEntries.map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                border: `1px solid ${C.border}`, borderRadius: 6, background: `${DOT[v]}0d` }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: DOT[v],
                  boxShadow: `0 0 8px ${DOT[v]}` }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: C.textB, fontWeight: 700 }}>{COMPONENT_LABELS[k] || k}</div>
                  <div style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>
                    {v ? "OPERATIONAL" : (k === "gpu_configured" ? "NOT CONFIGURED (optional)" : "UNREACHABLE")}
                  </div>
                </div>
                <Badge color={DOT[v]}>{v ? "UP" : (k === "gpu_configured" ? "OFF" : "DOWN")}</Badge>
              </div>
            ))}
          </Grid>
        </DataState>
      </PanelCard>

      <div style={{ marginTop: 12 }}>
        <PanelCard title="LIVE COUNTERS" accent={C.neon}>
          <DataState empty={!counters.length} emptyLabel="No counters recorded yet — exercise the API to populate metrics">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
              {counters.slice(0, 24).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10,
                  padding: "5px 8px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: C.text }}>{c.name || c.key}</span>
                  <span style={{ color: C.neon, fontWeight: 700 }}>{c.value ?? c.count}</span>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
