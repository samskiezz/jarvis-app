/**
 * SystemAdmin — "SYSTEM ADMIN": the platform operator's console.
 *
 * Four independent live panels, each degrading on its own so one failure never
 * blanks the page:
 *   GET /v1/admin/summary  → platform counts rendered as StatTiles
 *   GET /v1/health/deep    → per-component ok / down indicators
 *   GET /v1/metrics        → key counters
 *   GET /v1/labs/catalog   → list capabilities; POST /v1/labs/run {capability,
 *                            params} runs one and shows the result.
 *
 * DRY via Wave1Kit (Btn, inputStyle, JsonView) + PageKit + wave1 (apiGet/apiPost/
 * asList/useAsync). No new deps. Every fetch degrades gracefully.
 */
import { useCallback, useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.blue;

// Flatten an object's scalar entries into [label, value] pairs (one level deep,
// nested objects get prefixed) for tile / counter rendering.
function scalarPairs(obj, prefix = "") {
  if (!obj || typeof obj !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      out.push([prefix + k, v]);
    } else if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...scalarPairs(v, `${prefix}${k}.`));
    } else if (Array.isArray(v)) {
      out.push([prefix + k, v.length]);
    }
  }
  return out;
}

// Decide ok/down for a health component from assorted shapes.
function isOk(v) {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(ok|up|healthy|pass|green|true)$/i.test(v.trim());
  if (typeof v === "object") {
    const s = v.status ?? v.state ?? v.health ?? v.ok;
    return isOk(s);
  }
  return false;
}

function healthLabel(v) {
  if (typeof v === "object" && v) return v.status ?? v.state ?? v.health ?? (v.ok ? "ok" : "down");
  return String(v);
}

export default function SystemAdmin() {
  const [summary, setSummary] = useState({ data: null, error: null, loading: true });
  const [health, setHealth] = useState({ data: null, error: null, loading: true });
  const [metrics, setMetrics] = useState({ data: null, error: null, loading: true });

  // Labs.
  const [catalog, setCatalog] = useState([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [paramsText, setParamsText] = useState("");
  const [runResult, setRunResult] = useState(null);
  const runAsync = useAsync();

  const loadSummary = useCallback(async () => {
    setSummary((s) => ({ ...s, loading: true }));
    try { setSummary({ data: await apiGet("/v1/admin/summary"), error: null, loading: false }); }
    catch (e) { setSummary({ data: null, error: e, loading: false }); }
  }, []);
  const loadHealth = useCallback(async () => {
    setHealth((s) => ({ ...s, loading: true }));
    try { setHealth({ data: await apiGet("/v1/health/deep"), error: null, loading: false }); }
    catch (e) { setHealth({ data: null, error: e, loading: false }); }
  }, []);
  const loadMetrics = useCallback(async () => {
    setMetrics((s) => ({ ...s, loading: true }));
    try { setMetrics({ data: await apiGet("/v1/metrics"), error: null, loading: false }); }
    catch (e) { setMetrics({ data: null, error: e, loading: false }); }
  }, []);
  const loadCatalog = useCallback(async () => {
    setCatLoading(true); setCatError(null);
    try { setCatalog(asList(await apiGet("/v1/labs/catalog"), "catalog", "capabilities", "labs")); }
    catch (e) { setCatError(e); setCatalog([]); }
    finally { setCatLoading(false); }
  }, []);

  const loadAll = useCallback(() => {
    loadSummary(); loadHealth(); loadMetrics(); loadCatalog();
  }, [loadSummary, loadHealth, loadMetrics, loadCatalog]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const runCapability = async () => {
    if (!selected) return;
    setRunResult(null);
    const cap = selected.capability || selected.id || selected.name;
    let params = null;
    const raw = paramsText.trim();
    if (raw) {
      try { params = JSON.parse(raw); }
      catch { runAsync.setError(new Error('Params must be valid JSON, e.g. {"n": 10}')); return; }
    }
    const res = await runAsync.run(() => apiPost("/v1/labs/run", { capability: cap, params }));
    if (res) setRunResult(res);
  };

  // Components from health/deep: a {components|services|checks} map or array.
  const healthData = health.data && (health.data.components || health.data.services || health.data.checks || health.data);
  const components = Array.isArray(healthData)
    ? healthData.map((c, i) => [c.name || c.component || c.id || `component_${i}`, c])
    : Object.entries(healthData || {}).filter(([k]) => !["status", "ok", "version", "uptime"].includes(k));
  const okCount = components.filter(([, v]) => isOk(v)).length;

  const summaryPairs = scalarPairs(summary.data && (summary.data.summary || summary.data.counts || summary.data)).slice(0, 12);
  const metricPairs = scalarPairs(metrics.data && (metrics.data.metrics || metrics.data.counters || metrics.data)).slice(0, 16);

  return (
    <PageShell
      title="SYSTEM ADMIN"
      subtitle="PLATFORM SUMMARY · DEEP HEALTH · METRICS · LABS"
      accent={ACCENT}
      actions={<Btn accent={ACCENT} onClick={loadAll}>↻ REFRESH ALL</Btn>}
    >
      {/* SUMMARY */}
      <PanelCard title="PLATFORM SUMMARY" accent={ACCENT} style={{ marginBottom: 14 }}
        right={<Badge color={summary.error ? C.red : ACCENT}>{summary.error ? "DOWN" : summary.loading ? "…" : "LIVE"}</Badge>}>
        <DataState loading={summary.loading} error={summary.error} empty={summaryPairs.length === 0}
          emptyLabel="No summary counts">
          <Grid min={150}>
            {summaryPairs.map(([k, v], i) => (
              <StatTile key={k} label={k} value={typeof v === "boolean" ? (v ? "yes" : "no") : v}
                accent={[ACCENT, C.gold, C.neon, C.purple, C.orange][i % 5]} />
            ))}
          </Grid>
        </DataState>
      </PanelCard>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 14, alignItems: "start", marginBottom: 14 }}>
        {/* HEALTH */}
        <PanelCard title="DEEP HEALTH" accent={okCount === components.length && components.length ? C.neon : C.gold}
          right={<Badge color={health.error ? C.red : C.neon}>
            {health.error ? "DOWN" : components.length ? `${okCount}/${components.length} OK` : "—"}
          </Badge>}>
          <DataState loading={health.loading} error={health.error} empty={components.length === 0}
            emptyLabel="No components reported">
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 320, overflowY: "auto" }}>
              {components.map(([name, v]) => {
                const ok = isOk(v);
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 9px",
                    background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? C.neon : C.red,
                      boxShadow: `0 0 6px ${ok ? C.neon : C.red}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: C.textB, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                    <span style={{ fontSize: 8, color: ok ? C.neon : C.red, fontWeight: 700, letterSpacing: 1 }}>
                      {String(healthLabel(v)).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </DataState>
        </PanelCard>

        {/* METRICS */}
        <PanelCard title="METRICS" accent={C.gold}
          right={<Badge color={metrics.error ? C.red : C.gold}>{metrics.error ? "DOWN" : metricPairs.length}</Badge>}>
          <DataState loading={metrics.loading} error={metrics.error} empty={metricPairs.length === 0}
            emptyLabel="No counters">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {metricPairs.map(([k, v]) => (
                <div key={k} style={{ padding: "6px 9px", background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`,
                  borderRadius: 4 }}>
                  <div style={{ fontSize: 7.5, color: C.text, letterSpacing: 0.5, overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" }} title={k}>{k}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, fontVariantNumeric: "tabular-nums" }}>
                    {typeof v === "boolean" ? (v ? "yes" : "no") : v}
                  </div>
                </div>
              ))}
            </div>
          </DataState>
        </PanelCard>
      </div>

      {/* LABS */}
      <PanelCard title="LABS" accent={C.purple}
        right={<Badge color={catError ? C.red : C.purple}>{catError ? "DOWN" : `${catalog.length} CAPS`}</Badge>}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", gap: 14, alignItems: "start" }}>
          {/* catalog */}
          <DataState loading={catLoading} error={catError} empty={catalog.length === 0} emptyLabel="No capabilities">
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {catalog.map((cap, i) => {
                const id = cap.capability || cap.id || cap.name || (typeof cap === "string" ? cap : `cap_${i}`);
                const obj = typeof cap === "string" ? { capability: cap } : cap;
                const active = selected && (selected.capability || selected.id || selected.name) === (obj.capability || obj.id || obj.name);
                return (
                  <button key={id} onClick={() => { setSelected(obj); setRunResult(null); setParamsText(""); runAsync.setError(null); }}
                    style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      border: `1px solid ${active ? C.purple + "88" : C.border}`,
                      background: active ? C.purple + "1a" : "rgba(0,0,0,0.25)", borderRadius: 5, padding: "6px 9px", color: C.textB }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: active ? C.purple : C.textB }}>{id}</div>
                    {obj.description && <div style={{ fontSize: 8, color: C.text, marginTop: 2, lineHeight: 1.4 }}>{obj.description}</div>}
                  </button>
                );
              })}
            </div>
          </DataState>

          {/* runner */}
          <div>
            {!selected ? (
              <div style={{ padding: 18, fontSize: 10, color: C.text, letterSpacing: 1 }}>← Select a capability to run.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.purple }}>
                    {selected.capability || selected.id || selected.name}
                  </div>
                  {selected.description && <div style={{ fontSize: 9, color: C.textB, marginTop: 4, lineHeight: 1.5 }}>{selected.description}</div>}
                </div>
                <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>PARAMS (optional JSON)</label>
                <textarea value={paramsText} onChange={(e) => setParamsText(e.target.value)} placeholder='{"n": 10}'
                  rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                <Btn accent={C.purple} onClick={runCapability} disabled={runAsync.loading} style={{ alignSelf: "flex-start" }}>
                  {runAsync.loading ? "…" : "▶ RUN"}
                </Btn>
                {runAsync.error && <div style={{ fontSize: 9, color: C.red }}>⚠ {String(runAsync.error.message || runAsync.error)}</div>}
                {runResult && (
                  <div>
                    <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>RESULT</div>
                    <JsonView data={runResult} max={300} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PanelCard>
    </PageShell>
  );
}
