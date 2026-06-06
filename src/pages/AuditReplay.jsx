/**
 * AuditReplay — Audit plane operator view of the tamper-evident audit chain.
 * Shows a tamper-evidence banner (CHAIN INTACT / broken_at) plus a scrollable
 * replay of recent audit entries (time, actor, action, target). Backed by
 * /v1/jarvis/audit and /v1/jarvis/audit/verify.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.gold || C.neon;

const fmtTs = (ts) => {
  if (ts == null) return "—";
  const d = new Date(Number(ts));
  return Number.isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
};

export default function AuditReplay() {
  const [entries, setEntries] = useState([]);
  const [verify, setVerify] = useState(null);
  const auAsync = useAsync();
  const vfAsync = useAsync();

  const loadEntries = useCallback(async () => {
    const b = await auAsync.run(() => apiGet("/v1/jarvis/audit?limit=100"));
    setEntries(asList(b, "entries"));
  }, [auAsync]);
  const loadVerify = useCallback(async () => {
    const b = await vfAsync.run(() => apiGet("/v1/jarvis/audit/verify"));
    setVerify(b);
  }, [vfAsync]);
  useEffect(() => { loadEntries(); loadVerify(); }, [loadEntries, loadVerify]);

  const intact = !!verify?.intact;
  const bannerColor = intact ? (C.green || C.neon) : C.red;

  return (
    <PageShell title="Audit Replay" subtitle="Tamper-evident chain" accent={ACCENT}
      actions={<Badge color={bannerColor}>
        {intact ? "CHAIN INTACT" : "CHAIN BROKEN"}
      </Badge>}>

      <PanelCard title="Tamper evidence" accent={bannerColor}>
        <DataState loading={vfAsync.loading} error={vfAsync.error} empty={!verify}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px" }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: "50%", background: bannerColor,
              boxShadow: `0 0 10px ${bannerColor}` }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 2, color: bannerColor,
                textShadow: `0 0 18px ${bannerColor}55` }}>
                {intact ? "CHAIN INTACT" : "CHAIN BROKEN"}
              </div>
              <div style={{ fontSize: 9, color: C.text, marginTop: 4, letterSpacing: 1 }}>
                {(verify?.checked || 0).toLocaleString()} entries verified
                {!intact && verify?.broken_at != null ? ` · broken at ${verify.broken_at}` : ""}
              </div>
            </div>
          </div>
        </DataState>
      </PanelCard>

      <PanelCard title="Audit entries (last 100)" accent={ACCENT}
        right={<Badge color={ACCENT}>{entries.length} shown</Badge>}
        style={{ marginTop: 12 }}>
        <DataState loading={auAsync.loading} error={auAsync.error} empty={!entries.length}>
          <div style={{ overflowX: "auto", maxHeight: 420 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.dim || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Time</th>
                  <th style={{ padding: "6px 8px" }}>Actor</th>
                  <th style={{ padding: "6px 8px" }}>Action</th>
                  <th style={{ padding: "6px 8px" }}>Target</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e?.hash || i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ padding: "6px 8px", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtTs(e?.ts)}</td>
                    <td style={{ padding: "6px 8px" }}>{e?.actor || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>{e?.action || "—"}</td>
                    <td style={{ padding: "6px 8px", maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e?.target || "—"}</td>
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
