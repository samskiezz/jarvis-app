/**
 * PipelineMonitor — data-integration pipeline monitor.
 *
 * Wired to the REAL Foundry-style pipelines engine (server/routes/pipelines.py +
 * server/services/pipelines.py) over the History Lake:
 *   - GET  /v1/connectors                 → available source connectors + transforms
 *   - GET  /v1/datasets                   → the dataset catalog (configured pipelines)
 *   - GET  /v1/datasets/{name}/lineage    → provenance graph for a dataset
 *   - POST /v1/pipelines/run              → ingest from a connector (live result)
 *   - POST /v1/pipelines/transform        → derive a series from a dataset (live result)
 *
 * Run/transform responses are surfaced as live "recent runs" with real status,
 * row counts and the dataset/series they produced. Keeps the cyberpunk-glass
 * identity (status badges, progress bars, stat tiles).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";

const ACCENT = C.blue;

const STATUS_COLOR = {
  running: C.blue,
  ok: C.neon,
  partial: C.gold,
  error: C.red,
};

const statusColor = (s) => STATUS_COLOR[String(s || "").toLowerCase()] || C.text;

function StageRow({ run }) {
  const col = statusColor(run.status);
  const done = ["ok", "error", "partial"].includes(String(run.status || "").toLowerCase());
  const pct = done ? 100 : 60; // ingest is synchronous server-side; show settled vs in-flight
  return (
    <div style={{
      background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.textB, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {run.label}
        </span>
        <Badge color={run.kindColor}>{run.kind}</Badge>
        <Badge color={col}>{String(run.status || "queued").toUpperCase()}</Badge>
        <span style={{ fontSize: 10, color: col, fontWeight: 700, width: 64, textAlign: "right" }}>
          {Number.isFinite(run.n_rows) ? `${run.n_rows} rows` : ""}
        </span>
      </div>
      {run.detail && (
        <div style={{ fontSize: 9, color: C.text, marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {run.detail}
        </div>
      )}
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

const inputStyle = {
  background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.textB, padding: "7px 9px", fontSize: 10, fontFamily: "inherit", outline: "none",
};

export default function PipelineMonitor() {
  const [connectors, setConnectors] = useState([]);
  const [transforms, setTransforms] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [runs, setRuns] = useState([]); // live results from run/transform this session
  const [lineage, setLineage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [connForm, setConnForm] = useState("");
  const [xfDataset, setXfDataset] = useState("");
  const [xfOp, setXfOp] = useState("");
  const { loading: acting, error: actError, run: act } = useAsync();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [conn, ds] = await Promise.all([
        apiGet("/v1/connectors").catch(() => ({})),
        apiGet("/v1/datasets").catch(() => ({})),
      ]);
      const cs = asList(conn, "connectors");
      const ts = asList(conn, "transforms");
      const dss = asList(ds, "items");
      setConnectors(cs);
      setTransforms(ts);
      setDatasets(dss);
      setConnForm((v) => v || (cs[0]?.connector ?? ""));
      setXfDataset((v) => v || (dss[0]?.name ?? ""));
      setXfOp((v) => v || (ts[0]?.op ?? ""));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pushRun = (entry) => setRuns((prev) => [{ ...entry, at: Date.now() }, ...prev].slice(0, 25));

  const runConnector = async () => {
    if (!connForm) return;
    const res = await act(() => apiPost("/v1/pipelines/run", { connector: connForm, params: {} }));
    if (res) {
      pushRun({
        id: `run-${connForm}-${Date.now()}`,
        label: `ingest · ${connForm}`,
        kind: "INGEST",
        kindColor: C.blue,
        status: res.status,
        n_rows: res.n_rows,
        detail: res.dataset
          ? `→ ${res.dataset}${res.note ? ` · ${res.note}` : ""}`
          : (res.note || `${res.n_series ?? 0} series`),
      });
      load(); // refresh the catalog (a successful ingest auto-registers a dataset)
    }
  };

  const runTransform = async () => {
    if (!xfDataset || !xfOp) return;
    const spec = transforms.find((t) => t.op === xfOp);
    // Supply a sensible default for each transform's required param so the action
    // is one-click; the engine validates and reports honestly on bad input.
    const defaults = { rolling_mean: { window: 7 }, pct_change: { periods: 1 }, resample: { period_ms: 86400000 } };
    const op = { op: xfOp, ...(defaults[xfOp] || {}) };
    const res = await act(() => apiPost("/v1/pipelines/transform", { dataset: xfDataset, op }));
    if (res) {
      pushRun({
        id: `xf-${xfDataset}-${Date.now()}`,
        label: `transform · ${spec?.op || xfOp}`,
        kind: "TRANSFORM",
        kindColor: C.purple,
        status: res.ok ? "ok" : "error",
        n_rows: res.n_rows,
        detail: res.ok ? `${xfDataset} → ${res.dataset}` : `${xfDataset}: ${res.error || res.reason || "failed"}`,
      });
      load();
    }
  };

  const showLineage = async (name) => {
    const res = await act(() => apiGet(`/v1/datasets/${encodeURIComponent(name)}/lineage`));
    if (res) setLineage(res);
  };

  const okRuns = runs.filter((r) => r.status === "ok").length;
  const totalRows = useMemo(() => runs.reduce((a, r) => a + (Number(r.n_rows) || 0), 0), [runs]);
  const noRuns = !loading && !error && runs.length === 0;

  return (
    <PageShell
      title="PIPELINE MONITOR"
      subtitle="CONNECTORS · DATASET CATALOG · INGEST / TRANSFORM RUNS · LINEAGE"
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
        >{loading ? "◌ SYNC" : "↻ REFRESH"}</button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Connectors" value={connectors.length} accent={C.blue} sub="source adapters" />
        <StatTile label="Datasets" value={datasets.length} accent={C.gold} sub="catalog entries" />
        <StatTile label="Runs (session)" value={runs.length} accent={ACCENT} sub={`${okRuns} ok`} />
        <StatTile label="Rows Moved" value={totalRows} accent={C.neon} sub="this session" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, alignItems: "start" }}>
        <PanelCard title="RECENT RUNS" accent={ACCENT} right={<Badge color={ACCENT}>{runs.length}</Badge>}>
          <DataState
            loading={loading}
            error={error || actError}
            empty={noRuns}
            emptyLabel="No runs yet — run a connector or transform below to ingest/derive real data."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {runs.map((r) => <StageRow key={r.id} run={r} />)}
            </div>
          </DataState>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="RUN PIPELINE" accent={C.blue}>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>CONNECTOR</label>
              <select value={connForm} onChange={(e) => setConnForm(e.target.value)} style={inputStyle}>
                {connectors.length === 0 && <option value="">— none —</option>}
                {connectors.map((c) => (
                  <option key={c.connector} value={c.connector}>{c.connector} · {c.kind}</option>
                ))}
              </select>
              <button onClick={runConnector} disabled={acting || !connForm}
                style={{ ...inputStyle, cursor: acting ? "wait" : "pointer", color: C.blue, borderColor: C.blue + "66",
                  background: C.blue + "1a", fontWeight: 700, letterSpacing: 1 }}>
                {acting ? "…" : "▶ RUN INGEST"}
              </button>

              <div style={{ height: 1, background: C.border, margin: "4px 0" }} />

              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>TRANSFORM DATASET</label>
              <select value={xfDataset} onChange={(e) => setXfDataset(e.target.value)} style={inputStyle}>
                {datasets.length === 0 && <option value="">— no datasets yet —</option>}
                {datasets.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
              <label style={{ fontSize: 8, color: C.text, letterSpacing: 1 }}>OP</label>
              <select value={xfOp} onChange={(e) => setXfOp(e.target.value)} style={inputStyle}>
                {transforms.length === 0 && <option value="">— none —</option>}
                {transforms.map((t) => <option key={t.op} value={t.op}>{t.op}</option>)}
              </select>
              <button onClick={runTransform} disabled={acting || !xfDataset || !xfOp}
                style={{ ...inputStyle, cursor: acting ? "wait" : "pointer", color: C.purple, borderColor: C.purple + "66",
                  background: C.purple + "1a", fontWeight: 700, letterSpacing: 1 }}>
                {acting ? "…" : "▶ RUN TRANSFORM"}
              </button>
            </div>
          </PanelCard>

          <PanelCard title="DATASET CATALOG" accent={C.gold} right={<Badge color={C.gold}>{datasets.length}</Badge>}>
            {datasets.length === 0 ? (
              <div style={{ color: C.text, fontSize: 10, padding: 8 }}>
                {loading ? "◌ loading…" : "No datasets registered — run a connector to populate the catalog."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {datasets.slice(0, 12).map((d) => (
                  <div key={d.name} style={{
                    background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "9px 11px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.textB, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {d.name}
                      </span>
                      <Badge color={C.gold}>{d.source}</Badge>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", marginTop: 6, gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 9, color: C.text }}>{d.owner || "—"}</span>
                      <button onClick={() => showLineage(d.name)} disabled={acting}
                        style={{ ...inputStyle, padding: "3px 8px", fontSize: 8, cursor: "pointer", color: C.blue, borderColor: C.blue + "44" }}>
                        LINEAGE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          {lineage && (
            <PanelCard title={`LINEAGE · ${lineage.dataset}`} accent={C.purple}
              right={<button onClick={() => setLineage(null)} style={{ ...inputStyle, padding: "2px 7px", fontSize: 8, cursor: "pointer", color: C.text }}>✕</button>}>
              <div style={{ fontSize: 9, color: C.text, marginBottom: 6 }}>
                {lineage.nodes?.length || 0} nodes · {lineage.edges?.length || 0} edges
              </div>
              {(!lineage.edges || lineage.edges.length === 0) ? (
                <div style={{ fontSize: 10, color: C.text, padding: 4 }}>No derivation edges (source dataset).</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {lineage.edges.map((e, i) => (
                    <div key={i} style={{ fontSize: 9, color: C.textB }}>
                      <span style={{ color: C.text }}>{e.input}</span>
                      {" → "}
                      <Badge color={C.purple}>{e.op}</Badge>
                      {" → "}
                      <span style={{ color: C.textB }}>{e.output}</span>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
