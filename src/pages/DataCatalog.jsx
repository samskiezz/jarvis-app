/**
 * DataCatalog — front end for the Wave-7 dataset catalog / lineage / health
 * service (Palantir-Foundry P1 #3/#4/#5/#7/#8). Lists registered datasets with
 * owner/kind/freshness/row-count, shows per-dataset data-health checks, and
 * renders the lineage/provenance graph (source→transform→dataset edges).
 * SEED pulls one dataset per History-Lake series so the catalog isn't empty.
 * Backed by /v1/datasets[, /lineage, /{id}/health, /seed].
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold;
const statusColor = (s) => (s === "ok" || s === "healthy" ? C.neon : s === "warn" || s === "degraded" ? C.gold : C.red);

function LineageGraph({ nodes = [], edges = [] }) {
  if (!nodes.length) return <div style={{ color: C.text, fontSize: 10, padding: 16 }}>No lineage edges yet</div>;
  const W = 640, H = Math.max(180, nodes.length * 26);
  // simple layered layout by node kind
  const kinds = Array.from(new Set(nodes.map((n) => n.kind || n.type || "node")));
  const col = (k) => (kinds.indexOf(k) / Math.max(1, kinds.length - 1)) * (W - 140) + 70;
  const idxInKind = {};
  const pos = {};
  nodes.forEach((n) => {
    const k = n.kind || n.type || "node";
    idxInKind[k] = (idxInKind[k] || 0) + 1;
    pos[n.id] = { x: col(k), y: 30 + (idxInKind[k] - 1) * 40 };
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "#04080c", borderRadius: 4 }}>
      {edges.map((e, i) => {
        const a = pos[e.src], b = pos[e.dst];
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={`${ACCENT}66`} strokeWidth="1" />;
      })}
      {nodes.map((n, i) => { const p = pos[n.id]; if (!p) return null;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="6" fill={ACCENT} stroke="#000" strokeWidth="0.5" />
            <text x={p.x + 9} y={p.y + 3} fill={C.textB} fontSize="8" fontFamily="monospace">{(n.label || n.id || "").slice(0, 22)}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function DataCatalog() {
  const [datasets, setDatasets] = useState([]);
  const [sel, setSel] = useState(null);
  const [health, setHealth] = useState(null);
  const [lineage, setLineage] = useState({ nodes: [], edges: [] });
  const [seedMsg, setSeedMsg] = useState(null);
  const listAsync = useAsync();
  const healthAsync = useAsync();
  const seedAsync = useAsync();

  const load = useCallback(async () => {
    const body = await listAsync.run(() => apiGet("/v1/datasets"));
    setDatasets(asList(body, "items"));
    const lg = await apiGet("/v1/datasets/lineage").catch(() => null);
    if (lg) setLineage({ nodes: asList(lg, "nodes"), edges: asList(lg, "edges") });
  }, [listAsync]);
  useEffect(() => { load(); }, [load]);

  const inspect = async (d) => {
    setSel(d); setHealth(null);
    const id = d.id;
    const h = await healthAsync.run(() => apiGet(`/v1/datasets/${encodeURIComponent(id)}/health`));
    setHealth(h);
  };

  const seed = async () => {
    setSeedMsg(null);
    const r = await seedAsync.run(() => apiPost("/v1/datasets/seed", {}));
    setSeedMsg(r ? `seeded ${r.count ?? r.registered ?? "?"} datasets` : "seed failed");
    load();
  };

  const checks = asList(health, "checks");

  return (
    <PageShell title="DATA CATALOG" subtitle="datasets · schemas · versions · lineage · data-health" accent={ACCENT}
      actions={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {seedMsg && <Badge color={C.neon}>{seedMsg}</Badge>}
        <Btn accent={ACCENT} onClick={seed}>{seedAsync.loading ? "…" : "SEED FROM HISTORY LAKE"}</Btn>
      </span>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="datasets" value={datasets.length} accent={ACCENT} />
        <StatTile label="lineage nodes" value={lineage.nodes.length} accent={C.neon} />
        <StatTile label="lineage edges" value={lineage.edges.length} accent={C.neon} />
        <StatTile label="selected" value={sel?.name || "—"} accent={C.gold} />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12 }}>
        <PanelCard title="DATASETS" accent={ACCENT}>
          <DataState loading={listAsync.loading} error={listAsync.error} empty={!datasets.length}
            emptyLabel="No datasets — click SEED FROM HISTORY LAKE to register your live series.">
            <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 360, overflowY: "auto" }}>
              {datasets.map((d, i) => (
                <button key={i} onClick={() => inspect(d)}
                  style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 10,
                    padding: "8px 10px", borderRadius: 4, border: `1px solid ${sel?.id === d.id ? ACCENT : C.border}`,
                    background: sel?.id === d.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB,
                    display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{d.name}</div>
                    <div style={{ fontSize: 8, color: C.text }}>{d.kind} · owner {d.owner || "—"} · {d.row_count ?? "?"} rows</div>
                  </div>
                  <Badge color={C.gold}>v{d.version ?? 1}</Badge>
                </button>
              ))}
            </div>
          </DataState>
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PanelCard title="DATA HEALTH" accent={C.neon}>
            <DataState loading={healthAsync.loading} empty={!sel} emptyLabel="Select a dataset to run health checks">
              {sel && (
                <>
                  <div style={{ marginBottom: 8 }}><Badge color={statusColor(health?.status)}>{health?.status || "—"}</Badge></div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {checks.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10,
                        padding: "5px 7px", borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ color: C.text }}>{c.name}</span>
                        <span style={{ color: statusColor(c.status) }}>
                          {c.status} {c.value != null ? `· ${c.value}` : ""}{c.threshold != null ? ` / ${c.threshold}` : ""}
                        </span>
                      </div>
                    ))}
                    {!checks.length && <div style={{ color: C.text, fontSize: 9 }}>no checks returned</div>}
                  </div>
                </>
              )}
            </DataState>
          </PanelCard>
          <PanelCard title="LINEAGE GRAPH" accent={C.gold}>
            <LineageGraph nodes={lineage.nodes} edges={lineage.edges} />
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
