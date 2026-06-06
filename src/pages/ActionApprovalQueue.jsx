/**
 * ActionApprovalQueue — Gotham human-in-the-loop approvals. Lists pending
 * actions awaiting an operator decision and lets the operator approve/deny each.
 * Backed by /v1/jarvis/approvals (GET pending list) and POST /v1/jarvis/approvals/{id}.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.purple || C.neon;

const riskColor = (risk) =>
  ({ LOW: C.green || C.neon, MEDIUM: C.gold, HIGH: C.red }[String(risk || "").toUpperCase()] || C.text);

export default function ActionApprovalQueue() {
  const [approvals, setApprovals] = useState([]);
  const [deciding, setDeciding] = useState(null);
  const listAsync = useAsync();
  const decAsync = useAsync();

  const loadApprovals = useCallback(async () => {
    const b = await listAsync.run(() => apiGet("/v1/jarvis/approvals?status=pending"));
    setApprovals(asList(b, "approvals"));
  }, [listAsync]);
  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  const decide = useCallback(async (id, approve) => {
    setDeciding(id);
    await decAsync.run(() =>
      apiPost(`/v1/jarvis/approvals/${id}`, { approve, decided_by: "operator", reason: "" })
    );
    setDeciding(null);
    await loadApprovals();
  }, [decAsync, loadApprovals]);

  return (
    <PageShell title="Action Approval Queue" subtitle="Gotham · Human-in-the-loop" accent={ACCENT}
      actions={<Badge color={ACCENT}>{approvals.length} pending</Badge>}>

      <PanelCard title="Queue summary" accent={ACCENT}>
        <Grid min={150} gap={10}>
          <StatTile label="Pending" value={approvals.length} accent={ACCENT} />
          <StatTile label="High risk"
            value={approvals.filter((a) => String(a?.risk || "").toUpperCase() === "HIGH").length}
            accent={C.red} />
          <StatTile label="Medium risk"
            value={approvals.filter((a) => String(a?.risk || "").toUpperCase() === "MEDIUM").length}
            accent={C.gold} />
        </Grid>
      </PanelCard>

      <PanelCard title="Pending approvals" accent={ACCENT}
        right={<Badge color={ACCENT}>{approvals.length} shown</Badge>}>
        <DataState loading={listAsync.loading} error={listAsync.error} empty={!approvals.length}
          emptyLabel="No pending approvals">
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>ID</th>
                  <th style={{ padding: "6px 8px" }}>Action</th>
                  <th style={{ padding: "6px 8px" }}>Risk</th>
                  <th style={{ padding: "6px 8px" }}>Created</th>
                  <th style={{ padding: "6px 8px" }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((a, i) => {
                  const id = a?.id ?? i;
                  const busy = deciding === id || decAsync.loading;
                  return (
                    <tr key={id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <td style={{ padding: "6px 8px", fontVariantNumeric: "tabular-nums" }}>{a?.id ?? "—"}</td>
                      <td style={{ padding: "6px 8px", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a?.action ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>
                        <Badge color={riskColor(a?.risk)}>{String(a?.risk || "—").toUpperCase()}</Badge>
                      </td>
                      <td style={{ padding: "6px 8px" }}>{a?.created_at ?? "—"}</td>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        <button type="button" disabled={busy} onClick={() => decide(a?.id, true)}
                          style={{ fontSize: 9, letterSpacing: 1, fontWeight: 700, padding: "4px 10px", marginRight: 6,
                            borderRadius: 3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                            background: (C.green || C.neon) + "1a", color: C.green || C.neon,
                            border: `1px solid ${(C.green || C.neon)}44` }}>
                          APPROVE
                        </button>
                        <button type="button" disabled={busy} onClick={() => decide(a?.id, false)}
                          style={{ fontSize: 9, letterSpacing: 1, fontWeight: 700, padding: "4px 10px",
                            borderRadius: 3, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
                            background: C.red + "1a", color: C.red,
                            border: `1px solid ${C.red}44` }}>
                          DENY
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataState>
        {decAsync.error && (
          <div style={{ padding: "8px 4px 0", color: C.red, fontSize: 10 }}>
            ⚠ {String(decAsync.error.message || decAsync.error)}
          </div>
        )}
      </PanelCard>
    </PageShell>
  );
}
