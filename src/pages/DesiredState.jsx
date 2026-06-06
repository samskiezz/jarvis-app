/**
 * DesiredState — Apollo environments view: each environment's desired (last
 * good) vs current version, rendered as cards, with a note that artifacts and
 * releases are governed. Backed by GET /v1/jarvis/apollo/fleet.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.orange || C.neon;

export default function DesiredState() {
  const [fleet, setFleet] = useState(null);
  const fleetAsync = useAsync();

  const loadFleet = useCallback(async () => {
    const b = await fleetAsync.run(() => apiGet("/v1/jarvis/apollo/fleet"));
    setFleet(b);
  }, [fleetAsync]);
  useEffect(() => { loadFleet(); }, [loadFleet]);

  const environments = asList(fleet, "environments");
  const artifacts = asList(fleet, "artifacts");
  const releases = asList(fleet, "releases");

  return (
    <PageShell title="Desired State" subtitle="Apollo · Environments" accent={ACCENT}
      actions={<Badge color={ACCENT}>{environments.length} envs</Badge>}>

      <PanelCard title="Desired vs current version" accent={ACCENT}
        right={<Badge color={C.neon}>{environments.length} envs</Badge>}>
        <DataState loading={fleetAsync.loading} error={fleetAsync.error} empty={!environments.length}>
          <Grid min={260} gap={12}>
            {environments.map((e, i) => {
              const drift = (e?.current_version || "") !== (e?.last_good_version || "");
              return (
                <PanelCard key={e?.name || i} title={`${e?.name || "(env)"} · ${e?.tier || "—"}`}
                  accent={drift ? (C.gold || C.neon) : C.green}
                  right={<Badge color={drift ? (C.gold || C.neon) : C.green}>{drift ? "drift" : "in sync"}</Badge>}>
                  <Grid min={120} gap={10}>
                    <StatTile label="Current version" value={e?.current_version || "—"} accent={ACCENT} />
                    <StatTile label="Desired (last good)" value={e?.last_good_version || "—"} accent={C.green} />
                  </Grid>
                </PanelCard>
              );
            })}
          </Grid>
        </DataState>
      </PanelCard>

      <PanelCard title="Governance" accent={C.gold || C.neon}>
        <div style={{ fontSize: 11, color: C.textB, lineHeight: 1.6 }}>
          Artifacts ({artifacts.length}) and releases ({releases.length}) are governed:
          environment versions advance only through approved, gated releases. Each
          environment's desired state is pinned to its last known-good version above.
        </div>
      </PanelCard>
    </PageShell>
  );
}
