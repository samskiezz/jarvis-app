/**
 * WorkshopKit — the Palantir feature audit + the newly-implemented widgets live.
 * Shows what we have vs Palantir (from the scraped docs) and demonstrates the 4
 * gap-closing widgets (Gantt / Date-Time / Comments / Media Uploader) for real.
 */
import { useEffect, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";
import { apiGet } from "@/lib/wave1";
import { Gantt, DateTimePicker, Comments, MediaUploader } from "@/components/workshop/WorkshopWidgets";

const STAT_COLOR = { implemented: "#7cff7c", partial: "#e8a800", missing: "#ff3b6b" };

export default function WorkshopKit() {
  const [audit, setAudit] = useState(null);
  useEffect(() => { apiGet("/v1/jarvis/ui/features").then(setAudit).catch(() => {}); }, []);

  const demoTasks = [
    { label: "Integrate sources", start: "2026-06-01", end: "2026-06-03", status: "done", color: "#7cff7c" },
    { label: "Build ontology", start: "2026-06-03", end: "2026-06-06", status: "active", color: "#00d4ff" },
    { label: "Scrape + enrich", start: "2026-06-04", end: "2026-06-08", status: "active", color: "#b18cff" },
    { label: "Apollo rollout", start: "2026-06-08", end: "2026-06-10", status: "queued", color: "#ff3b6b" },
  ];

  return (
    <PageShell title="WORKSHOP KIT" subtitle="PALANTIR FEATURE AUDIT · GAP-CLOSING WIDGETS" accent="#00d4ff"
      actions={audit && <Badge color={STAT_COLOR.implemented}>{audit.summary.implemented}/{audit.total} implemented</Badge>}>

      {audit && (
        <Grid min={150} style={{ marginBottom: 14 }}>
          <StatTile label="Implemented" value={audit.summary.implemented} accent={STAT_COLOR.implemented} />
          <StatTile label="Partial" value={audit.summary.partial} accent={STAT_COLOR.partial} />
          <StatTile label="Missing" value={audit.summary.missing} accent={STAT_COLOR.missing} />
          <StatTile label="Total features" value={audit.total} accent="#00d4ff" />
        </Grid>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,1fr)", gap: 14, alignItems: "start" }}>
        <PanelCard title="GAP-CLOSING WIDGETS (now implemented)" accent="#00d4ff">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Section title="Gantt"><Gantt tasks={demoTasks} /></Section>
            <Section title="Date / Time Picker"><DateTimePicker /></Section>
            <Section title="Comments"><Comments initial={[{ author: "jarvis", text: "Build chain nominal, sir.", ts: Date.now() - 60000 }]} /></Section>
            <Section title="Media Uploader"><MediaUploader /></Section>
          </div>
        </PanelCard>

        <PanelCard title="PALANTIR FEATURE AUDIT" accent={C.gold}>
          <div style={{ maxHeight: 520, overflowY: "auto", fontSize: 10 }}>
            {(audit?.features || []).map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center",
                padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <div>
                  <span style={{ color: C.textB }}>{f.feature}</span>
                  <span style={{ color: C.text, fontSize: 8, marginLeft: 6 }}>[{f.plane}] ⬡ {f.render}</span>
                </div>
                <span style={{ color: STAT_COLOR[f.status], fontSize: 9, whiteSpace: "nowrap" }}>{f.status}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>
    </PageShell>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: 2, color: C.text, marginBottom: 5 }}>{title.toUpperCase()}</div>
      {children}
    </div>
  );
}
