/**
 * WorldOps — live operator view of the world_os platform: subsystem status
 * (Foundry/Gotham/Apollo/AIP/Security), the loaded data points (92k endpoints,
 * 10k subjects, edges/OCR/benchmarks), the AIP/Llama backend, and a browser over
 * the catalogued endpoints. Backed by /v1/jarvis/system/* and /v1/jarvis/world/*.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.orange || C.neon;

export default function WorldOps() {
  const [status, setStatus] = useState(null);
  const [endpoints, setEndpoints] = useState([]);
  const [llm, setLlm] = useState(null);
  const stAsync = useAsync();
  const epAsync = useAsync();

  const loadStatus = useCallback(async () => {
    const b = await stAsync.run(() => apiGet("/v1/jarvis/system/status"));
    setStatus(b);
  }, [stAsync]);
  const loadEndpoints = useCallback(async () => {
    const b = await epAsync.run(() => apiGet("/v1/jarvis/world/endpoints?limit=50"));
    setEndpoints(asList(b, "endpoints"));
  }, [epAsync]);
  const loadLlm = useCallback(async () => {
    const b = await apiGet("/v1/jarvis/research/status").catch(() => null);
    setLlm(b);
  }, []);
  useEffect(() => { loadStatus(); loadEndpoints(); loadLlm(); }, [loadStatus, loadEndpoints, loadLlm]);

  const up = status?.subsystems_up || {};
  const f = status?.foundry || {};
  const g = status?.gotham || {};
  const jobs = status?.ingestion_jobs || {};
  const cap = status?.capacity || null;

  // Compact human formatting for the very large combinatorial figures.
  const big = (n) => {
    n = Number(n) || 0;
    if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
    return String(n);
  };

  return (
    <PageShell title="World OS" subtitle="Jarvis · Foundry · Gotham · Apollo · AIP" accent={ACCENT}
      actions={<Badge color={llm?.available ? C.green : C.red}>
        AIP: {llm?.backend || "offline"}
      </Badge>}>

      <PanelCard title="Subsystems" accent={ACCENT}>
        <DataState loading={stAsync.loading} error={stAsync.error} empty={!status}>
          <Grid min={180} gap={10}>
            {Object.entries(up).map(([name, ok]) => (
              <StatTile key={name} label={name} value={ok ? "UP" : "DOWN"}
                accent={ok ? C.green : C.red} />
            ))}
          </Grid>
        </DataState>
      </PanelCard>

      <PanelCard title="Foundry — data points loaded" accent={C.neon}>
        <Grid min={150} gap={10}>
          <StatTile label="Endpoints" value={(f.endpoints || 0).toLocaleString()} accent={ACCENT} />
          <StatTile label="Subjects" value={(f.subjects || 0).toLocaleString()} accent={ACCENT} />
          <StatTile label="Flow edges" value={(f.flow_edges || 0).toLocaleString()} accent={ACCENT} />
          <StatTile label="OCR docs" value={(f.ocr_candidates || 0).toLocaleString()} accent={ACCENT} />
          <StatTile label="Benchmarks" value={(f.benchmarks || 0).toLocaleString()} accent={ACCENT} />
        </Grid>
      </PanelCard>

      <Grid min={300} gap={12}>
        <PanelCard title="Gotham — ontology graph (projected from corpus)" accent={C.purple || C.neon}>
          <Grid min={115} gap={10}>
            <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent={C.purple || C.neon} />
            <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent={C.purple || C.neon} sub="subjects" />
            <StatTile label="Sources" value={(g.sources || 0).toLocaleString()} accent={C.purple || C.neon} />
            <StatTile label="Documents" value={(g.documents || 0).toLocaleString()} accent={C.purple || C.neon} />
            <StatTile label="Links" value={(g.links || 0).toLocaleString()} accent={C.purple || C.neon} />
          </Grid>
        </PanelCard>
        {cap && (
          <PanelCard title="Synaptic capacity (combinatorial potential)" accent={C.neon}
            right={<Badge color={C.neon}>{(cap.primitives?.total || 0).toLocaleString()} primitives</Badge>}>
            <Grid min={130} gap={10}>
              <StatTile label="Neural synapses" value={big(cap.capacity?.neural_synapses_total)} accent={C.neon}
                sub={`${big(cap.capacity?.neuron_input_synapses)} input`} />
              <StatTile label="Full mesh (undirected)" value={big(cap.capacity?.full_mesh_undirected)} accent={C.gold || C.neon} />
              <StatTile label="Full mesh (directed)" value={big(cap.capacity?.full_mesh_directed)} accent={C.gold || C.neon} />
              <StatTile label="Neuron↔neuron" value={big(cap.capacity?.neuron_to_neuron_synapses)} accent={C.purple || C.neon} />
              <StatTile label="Clusters (10/ea)" value={(cap.clusters?.per_10 || 0).toLocaleString()} accent={C.blue} />
            </Grid>
            <div style={{ fontSize: 8, color: C.text, marginTop: 8 }}>{cap.note}</div>
          </PanelCard>
        )}
        <PanelCard title="Ingestion jobs (legal gate)" accent={C.gold || C.neon}>
          <Grid min={130} gap={10}>
            <StatTile label="Total" value={(jobs.total || 0).toLocaleString()} accent={C.gold || C.neon} />
            <StatTile label="Cleared" value={(jobs.cleared || 0).toLocaleString()} accent={C.green} />
            <StatTile label="Review reqd" value={(jobs.review_required || 0).toLocaleString()} accent={C.red} />
          </Grid>
        </PanelCard>
      </Grid>

      <PanelCard title="Endpoint catalogue (sample of 50)" accent={C.neon}
        right={<Badge color={C.neon}>{endpoints.length} shown</Badge>}>
        <DataState loading={epAsync.loading} error={epAsync.error} empty={!endpoints.length}>
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Source</th>
                  <th style={{ padding: "6px 8px" }}>URL</th>
                  <th style={{ padding: "6px 8px" }}>Method</th>
                  <th style={{ padding: "6px 8px" }}>Connector</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((e, i) => (
                  <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px" }}>{e.source_name}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <a href={e.official_url} target="_blank" rel="noreferrer" style={{ color: C.neon }}>{e.official_url}</a>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{e.access_method}</td>
                    <td style={{ padding: "6px 8px" }}>{e.recommended_ingestion_connector}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
