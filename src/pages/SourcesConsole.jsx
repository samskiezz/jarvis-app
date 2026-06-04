/**
 * SourcesConsole — front end for the Wave-8 source-connector framework
 * (Foundry P1 #1/#10/#12). Register typed connectors (rest_json/csv_url/rss/
 * inline), PREVIEW rows without landing, RUN to land into a dataset, BACKFILL a
 * window, and inspect run history. Backed by /v1/sources[, /preview, /{id}/run,
 * /{id}/backfill, /{id}/runs]. Network-guarded — offline previews say so.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn, inputStyle, JsonView } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold;
const KINDS = ["inline", "rest_json", "csv_url", "rss"];

export default function SourcesConsole() {
  const [list, setList] = useState([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("inline");
  const [config, setConfig] = useState('{ "rows": [{ "id": 1, "v": 10 }] }');
  const [preview, setPreview] = useState(null);
  const [sel, setSel] = useState(null);
  const [runs, setRuns] = useState([]);
  const listAsync = useAsync(); const prevAsync = useAsync(); const regAsync = useAsync(); const runAsync = useAsync();

  const load = useCallback(async () => { const b = await listAsync.run(() => apiGet("/v1/sources")); setList(asList(b, "items", "connectors")); }, [listAsync]);
  useEffect(() => { load(); }, [load]);

  const parseCfg = () => { try { return JSON.parse(config); } catch { return null; } };
  const doPreview = async () => {
    const cfg = parseCfg(); if (!cfg) { prevAsync.setError(new Error("config must be JSON")); return; }
    const b = await prevAsync.run(() => apiPost("/v1/sources/preview", { kind, config: cfg })); setPreview(b);
  };
  const register = async () => {
    const cfg = parseCfg(); if (!cfg || !name.trim()) return;
    await regAsync.run(() => apiPost("/v1/sources", { name: name.trim(), kind, config: cfg })); setName(""); load();
  };
  const inspect = async (c) => { setSel(c); const b = await apiGet(`/v1/sources/${encodeURIComponent(c.id)}/runs`).catch(() => null); setRuns(asList(b, "runs", "items")); };
  const run = async (c) => { await runAsync.run(() => apiPost(`/v1/sources/${encodeURIComponent(c.id)}/run`, { dataset_name: `${c.name}_ds` })); inspect(c); load(); };
  const backfill = async (c) => { await runAsync.run(() => apiPost(`/v1/sources/${encodeURIComponent(c.id)}/backfill`, {})); inspect(c); };

  const prevRows = preview ? asList(preview, "rows") : [];

  return (
    <PageShell title="SOURCES" subtitle="connector registry · preview · land · backfill · run history" accent={ACCENT}
      actions={<Badge color={ACCENT}>{list.length} CONNECTORS</Badge>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="connectors" value={list.length} accent={ACCENT} />
        <StatTile label="preview rows" value={prevRows.length} accent={C.neon} />
        <StatTile label="selected" value={sel?.name || "—"} accent={C.gold} />
        <StatTile label="runs" value={runs.length} accent={C.neon} />
      </Grid>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <PanelCard title="REGISTER / PREVIEW" accent={ACCENT}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="connector name" style={{ ...inputStyle, flex: 1 }} />
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ ...inputStyle, width: 110 }}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <textarea value={config} onChange={(e) => setConfig(e.target.value)} rows={4}
            style={{ ...inputStyle, width: "100%", fontFamily: "monospace", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <Btn accent={C.neon} onClick={doPreview}>PREVIEW</Btn>
            <Btn accent={ACCENT} onClick={register}>REGISTER</Btn>
          </div>
          <DataState loading={prevAsync.loading} error={prevAsync.error} empty={!preview} emptyLabel="">
            {preview && (
              <div style={{ marginTop: 8 }}>
                {preview.note && <Badge color={C.red}>{preview.note}</Badge>}
                <div style={{ fontSize: 8, color: C.text, margin: "4px 0" }}>columns: {(asList(preview, "columns")).join(", ") || "—"}</div>
                <JsonView data={prevRows.slice(0, 5)} />
              </div>
            )}
          </DataState>
        </PanelCard>
        <PanelCard title="REGISTERED" accent={C.neon}>
          <DataState loading={listAsync.loading} empty={!list.length} emptyLabel="No connectors — register one (inline works offline).">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {list.map((c, i) => (
                <div key={i} style={{ padding: "8px 10px", border: `1px solid ${sel?.id === c.id ? ACCENT : C.border}`,
                  borderRadius: 4, background: sel?.id === c.id ? `${ACCENT}10` : "transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                    <button onClick={() => inspect(c)} style={{ background: "none", border: "none", color: C.textB, cursor: "pointer", fontWeight: 700, fontFamily: "inherit", flex: 1, textAlign: "left" }}>{c.name}</button>
                    <Badge color={C.gold}>{c.kind}</Badge>
                    <Btn accent={C.neon} onClick={() => run(c)}>RUN</Btn>
                    <Btn accent={C.gold} onClick={() => backfill(c)}>BACKFILL</Btn>
                  </div>
                </div>
              ))}
            </div>
            {sel && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 8, color: C.text, letterSpacing: 1, marginBottom: 4 }}>RUN HISTORY · {sel.name}</div>
                {runs.length ? runs.slice(0, 12).map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 9, padding: "3px 6px", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.text }}>{r.started_ts ? new Date(r.started_ts).toLocaleTimeString() : r.status}</span>
                    <span style={{ color: r.status === "ok" ? C.neon : C.gold }}>{r.status} · {r.n_rows ?? 0} rows</span>
                  </div>
                )) : <div style={{ fontSize: 9, color: C.text }}>no runs yet</div>}
              </div>
            )}
          </DataState>
        </PanelCard>
      </div>
    </PageShell>
  );
}
