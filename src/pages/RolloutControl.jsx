/**
 * RolloutControl — Apollo releases view: a table of the most recent releases
 * (artifact, version, env, strategy, status, ts) with a colour-coded status
 * badge. Backed by GET /v1/jarvis/apollo/releases?limit=50.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.orange || C.neon;

function statusColor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "deployed") return C.green;
  if (s === "rolled_back" || s === "gate_failed") return C.red;
  if (s === "pending") return C.gold || C.neon;
  return C.text;
}

export default function RolloutControl() {
  const [releases, setReleases] = useState([]);
  const relAsync = useAsync();

  const loadReleases = useCallback(async () => {
    const b = await relAsync.run(() => apiGet("/v1/jarvis/apollo/releases?limit=50"));
    setReleases(asList(b, "releases"));
  }, [relAsync]);
  useEffect(() => { loadReleases(); }, [loadReleases]);

  const deployed = releases.filter((r) => String(r?.status || "").toLowerCase() === "deployed").length;
  const failed = releases.filter((r) => ["rolled_back", "gate_failed"].includes(String(r?.status || "").toLowerCase())).length;
  const pending = releases.filter((r) => String(r?.status || "").toLowerCase() === "pending").length;

  return (
    <PageShell title="Rollout Control" subtitle="Apollo · Releases" accent={ACCENT}
      actions={<Badge color={ACCENT}>{releases.length} releases</Badge>}>

      <PanelCard title="Release summary" accent={ACCENT}>
        <Grid min={150} gap={10}>
          <StatTile label="Total" value={releases.length} accent={ACCENT} />
          <StatTile label="Deployed" value={deployed} accent={C.green} />
          <StatTile label="Pending" value={pending} accent={C.gold || C.neon} />
          <StatTile label="Failed / rolled back" value={failed} accent={C.red} />
        </Grid>
      </PanelCard>

      <PanelCard title="Recent releases" accent={ACCENT}
        right={<Badge color={C.neon}>{releases.length} shown</Badge>}>
        <DataState loading={relAsync.loading} error={relAsync.error} empty={!releases.length}>
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>ID</th>
                  <th style={{ padding: "6px 8px" }}>Artifact</th>
                  <th style={{ padding: "6px 8px" }}>Version</th>
                  <th style={{ padding: "6px 8px" }}>Env</th>
                  <th style={{ padding: "6px 8px" }}>Strategy</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r, i) => (
                  <tr key={r?.id || i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px" }}>{r?.id || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r?.artifact || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r?.version || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r?.env || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{r?.strategy || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <Badge color={statusColor(r?.status)}>{r?.status || "—"}</Badge>
                    </td>
                    <td style={{ padding: "6px 8px" }}>{r?.ts || "—"}</td>
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
