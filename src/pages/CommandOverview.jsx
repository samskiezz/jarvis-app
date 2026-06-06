/**
 * CommandOverview — the Jarvis landing cockpit: a single-screen read on global
 * platform health. Rolls up subsystem status (Foundry/Gotham/Apollo/AIP/Security),
 * the Foundry data points loaded (endpoints/subjects/flow_edges/ocr/benchmarks),
 * the Gotham ontology (objects/neurons), the legal ingestion gate (total/cleared/
 * review), and the AIP/Llama research backend. Backed by /v1/jarvis/system/status
 * and /v1/jarvis/research/status.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, useAsync } from "@/lib/wave1";

const ACCENT = C.blue || C.neon;

export default function CommandOverview() {
  const [status, setStatus] = useState(null);
  const [research, setResearch] = useState(null);
  const stAsync = useAsync();

  const loadStatus = useCallback(async () => {
    const b = await stAsync.run(() => apiGet("/v1/jarvis/system/status"));
    setStatus(b);
  }, [stAsync]);
  const loadResearch = useCallback(async () => {
    const b = await apiGet("/v1/jarvis/research/status").catch(() => null);
    setResearch(b);
  }, []);
  useEffect(() => { loadStatus(); loadResearch(); }, [loadStatus, loadResearch]);

  const up = status?.subsystems_up || {};
  const f = status?.foundry || {};
  const g = status?.gotham || {};
  const jobs = status?.ingestion_jobs || {};

  const upCount = Object.values(up).filter(Boolean).length;
  const upTotal = Object.keys(up).length;

  return (
    <PageShell title="Command Overview" subtitle="Jarvis · Global Health" accent={ACCENT}
      actions={<Badge color={research?.available ? C.green : C.red}>
        AIP: {research?.backend || "offline"}
      </Badge>}>

      <PanelCard title="Global health — subsystems" accent={ACCENT}
        right={<Badge color={upCount === upTotal && upTotal ? C.green : C.gold}>{upCount}/{upTotal} UP</Badge>}>
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
          <StatTile label="Endpoints" value={(f.endpoints || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Subjects" value={(f.subjects || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Flow edges" value={(f.flow_edges || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="OCR docs" value={(f.ocr_candidates || 0).toLocaleString()} accent={C.neon} />
          <StatTile label="Benchmarks" value={(f.benchmarks || 0).toLocaleString()} accent={C.neon} />
        </Grid>
      </PanelCard>

      <Grid min={300} gap={12}>
        <PanelCard title="Gotham — ontology" accent={C.purple || C.neon}>
          <Grid min={130} gap={10}>
            <StatTile label="Objects" value={(g.ontology_objects || 0).toLocaleString()} accent={C.purple || C.neon} />
            <StatTile label="Object types" value={g.object_types || 0} accent={C.purple || C.neon} />
            <StatTile label="Neurons" value={(g.neurons || 0).toLocaleString()} accent={C.purple || C.neon} />
          </Grid>
        </PanelCard>
        <PanelCard title="Ingestion jobs (legal gate)" accent={C.gold || C.neon}>
          <Grid min={130} gap={10}>
            <StatTile label="Total" value={(jobs.total || 0).toLocaleString()} accent={C.gold || C.neon} />
            <StatTile label="Cleared" value={(jobs.cleared || 0).toLocaleString()} accent={C.green} />
            <StatTile label="Review reqd" value={(jobs.review_required || 0).toLocaleString()} accent={C.red} />
          </Grid>
        </PanelCard>
      </Grid>

      <PanelCard title="AIP / Llama research backend" accent={ACCENT}
        right={<Badge color={research?.available ? C.green : C.red}>{research?.available ? "ONLINE" : "OFFLINE"}</Badge>}>
        <Grid min={150} gap={10}>
          <StatTile label="Backend" value={research?.backend || "—"} accent={ACCENT} />
          <StatTile label="Model" value={research?.model || "—"} accent={ACCENT} />
          <StatTile label="Available" value={research?.available ? "YES" : "NO"}
            accent={research?.available ? C.green : C.red} />
        </Grid>
      </PanelCard>
    </PageShell>
  );
}
