/**
 * FleetHealth — Apollo delivery view of the fleet: each environment's tier,
 * current vs last-good version and status, plus a table of all environments.
 * Backed by GET /v1/jarvis/apollo/fleet.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.orange || C.neon;

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "healthy" || s === "ok" || s === "deployed") return C.green;
  if (s === "degraded" || s === "rolling_back" || s === "rolled_back" || s === "failed") return C.red;
  if (s === "pending" || s === "deploying") return C.gold || C.neon;
  return C.text;
}

export default function FleetHealth() {
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
    <PageShell title="Fleet Health" subtitle="Apollo · Delivery" accent={ACCENT}
      actions={<Badge color={ACCENT}>{environments.length} envs</Badge>}>

      <PanelCard title="Fleet overview" accent={ACCENT}>
        <Grid min={150} gap={10}>
          <StatTile label="Environments" value={environments.length} accent={ACCENT} />
          <StatTile label="Artifacts" value={artifacts.length} accent={C.neon} />
          <StatTile label="Releases" value={releases.length} accent={C.gold || C.neon} />
        </Grid>
      </PanelCard>

      <PanelCard title="Environments" accent={ACCENT}>
        <DataState loading={fleetAsync.loading} error={fleetAsync.error} empty={!environments.length}>
          <Grid min={180} gap={10}>
            {environments.map((e, i) => (
              <StatTile key={e?.name || i} label={`${e?.name || "(env)"} · ${e?.tier || "—"}`}
                value={e?.current_version || "—"}
                accent={statusColor(e?.status)}
                sub={`status: ${e?.status || "—"} · last good: ${e?.last_good_version || "—"}`} />
            ))}
          </Grid>
        </DataState>
      </PanelCard>

      <PanelCard title="Environment detail" accent={C.neon}
        right={<Badge color={C.neon}>{environments.length} shown</Badge>}>
        <DataState loading={fleetAsync.loading} error={fleetAsync.error} empty={!environments.length}>
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Name</th>
                  <th style={{ padding: "6px 8px" }}>Tier</th>
                  <th style={{ padding: "6px 8px" }}>Current version</th>
                  <th style={{ padding: "6px 8px" }}>Last good version</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {environments.map((e, i) => (
                  <tr key={e?.name || i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px" }}>{e?.name || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{e?.tier || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{e?.current_version || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{e?.last_good_version || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <Badge color={statusColor(e?.status)}>{e?.status || "—"}</Badge>
                    </td>
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
