/**
 * ForgeConsole — read-only APEX view of the Forge code-improvement agent
 * (your in-repo analog to obsidian-mind/obsidian-skills, but test-gated and
 * safe). Forge scans the codebase, researches improvements, asks a local Ollama
 * model to improve files, and lands changes through a reviewable approval queue
 * (never touches main). This page shows its config/status + the pending approval
 * queue + diffs. Triggering a cycle stays with the Forge job by design — the web
 * tier is read-only. Backed by /v1/forge/{status,approvals,approvals/{id}}.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { Btn } from "@/components/Wave1Kit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.orange;
const statusColor = (s) => (s === "approved" ? C.neon : s === "rejected" ? C.red : C.gold);

export default function ForgeConsole() {
  const [status, setStatus] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [sel, setSel] = useState(null);
  const sAsync = useAsync(); const aAsync = useAsync(); const dAsync = useAsync();

  const load = useCallback(async () => {
    const s = await sAsync.run(() => apiGet("/v1/forge/status")); if (s) setStatus(s);
    const a = await aAsync.run(() => apiGet("/v1/forge/approvals")); setApprovals(asList(a, "items"));
  }, [sAsync, aAsync]);
  useEffect(() => { load(); }, [load]);

  const open = async (c) => { const d = await dAsync.run(() => apiGet(`/v1/forge/approvals/${encodeURIComponent(c.id)}`)); setSel(d || c); };

  const cfg = status?.config || {};
  const pending = approvals.filter((c) => (c.status || "pending") === "pending");

  return (
    <PageShell title="FORGE" subtitle="autonomous code-improvement agent · test-gated · reviewable (read-only view)" accent={ACCENT}
      actions={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Badge color={status?.available ? C.neon : C.text}>{status?.available ? "● AVAILABLE" : "○ NOT INSTALLED"}</Badge>
        <Btn accent={ACCENT} onClick={load}>↻</Btn>
      </span>}>
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="model" value={cfg.model || "—"} accent={ACCENT} sub="local Ollama" />
        <StatTile label="candidate files" value={status?.candidate_files ?? "—"} accent={C.neon} />
        <StatTile label="pending approvals" value={pending.length} accent={C.gold} />
        <StatTile label="branch policy" value="never main" accent={C.red} sub="reviewable PR" />
      </Grid>

      <div style={{ marginBottom: 12, fontSize: 10, color: C.text, padding: "8px 12px", border: `1px solid ${C.border}`,
        borderRadius: 4, background: `${ACCENT}0a` }}>
        {status?.note || "Forge improves the codebase autonomously but test-gated: it applies only on forge/* branches, reverts a batch if lint/tests fail, and lands via reviewable PR. This web view is read-only."}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 12 }}>
        <PanelCard title="APPROVAL QUEUE" accent={ACCENT} right={<Badge color={ACCENT}>{approvals.length}</Badge>}>
          <DataState loading={aAsync.loading} error={aAsync.error} empty={!approvals.length}
            emptyLabel={status?.available ? "No proposed changes in the queue." : "Forge package not installed in this environment."}>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {approvals.map((c, i) => (
                <button key={i} onClick={() => open(c)} style={{ textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 10, padding: "7px 9px", borderRadius: 4, border: `1px solid ${sel?.id === c.id ? ACCENT : C.border}`,
                  background: sel?.id === c.id ? `${ACCENT}14` : "rgba(0,0,0,0.2)", color: C.textB }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Badge color={statusColor(c.status)}>{c.status}</Badge>
                    <span style={{ flex: 1, color: C.textB }}>{c.path}</span>
                    <span style={{ color: C.text }}>{c.diff_lines ?? 0} Δ</span>
                  </div>
                </button>
              ))}
            </div>
          </DataState>
        </PanelCard>
        <PanelCard title={sel ? `DIFF · ${sel.path}` : "DIFF"} accent={C.neon}>
          {sel ? (
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 9, lineHeight: 1.5, maxHeight: 420, overflow: "auto",
              color: C.textB, fontFamily: "monospace" }}>
              {(sel.diff || "(no diff)").split("\n").map((ln, i) => (
                <div key={i} style={{ color: ln.startsWith("+") ? C.neon : ln.startsWith("-") ? C.red : C.text }}>{ln}</div>
              ))}
            </pre>
          ) : <div style={{ color: C.text, fontSize: 10, padding: 10 }}>Select a proposed change to view its diff</div>}
        </PanelCard>
      </div>
    </PageShell>
  );
}
