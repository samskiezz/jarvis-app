/**
 * SourceCatalogue — the Foundry source catalogue over the ~92k catalogued
 * endpoints: the legal-gate summary (total / cleared / blocked) plus a
 * searchable browser of the loaded endpoint rows (source, official URL,
 * access method, recommended ingestion connector). Backed by
 * /v1/jarvis/world/endpoints, /v1/jarvis/system/gate, /v1/jarvis/world/summary.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge, DataState } from "@/components/PageKit";
import { apiGet, asList, useAsync } from "@/lib/wave1";

const ACCENT = C.neon;

export default function SourceCatalogue() {
  const [endpoints, setEndpoints] = useState([]);
  const [gate, setGate] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState("");
  const epAsync = useAsync();
  const gateAsync = useAsync();

  const loadEndpoints = useCallback(async () => {
    const b = await epAsync.run(() => apiGet("/v1/jarvis/world/endpoints?limit=100"));
    setEndpoints(asList(b, "endpoints"));
  }, [epAsync]);
  const loadGate = useCallback(async () => {
    const b = await gateAsync.run(() => apiGet("/v1/jarvis/system/gate"));
    setGate(b);
  }, [gateAsync]);
  const loadSummary = useCallback(async () => {
    const b = await apiGet("/v1/jarvis/world/summary").catch(() => null);
    setSummary(b);
  }, []);
  useEffect(() => { loadEndpoints(); loadGate(); loadSummary(); }, [loadEndpoints, loadGate, loadSummary]);

  const total = gate?.total ?? summary?.endpoints ?? endpoints.length;
  const cleared = gate?.cleared ?? 0;
  const blocked = gate?.blocked ?? 0;

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return endpoints;
    return endpoints.filter((e) => {
      const name = String(e.source_name || "").toLowerCase();
      const url = String(e.official_url || "").toLowerCase();
      return name.includes(q) || url.includes(q);
    });
  }, [endpoints, filter]);

  return (
    <PageShell title="Source Catalogue" subtitle="Foundry · 92k endpoints" accent={ACCENT}>

      <PanelCard title="Legal gate — clearance" accent={C.gold || C.neon}>
        <DataState loading={gateAsync.loading} error={gateAsync.error} empty={!gate && !summary}>
          <Grid min={150} gap={10}>
            <StatTile label="Total" value={(total || 0).toLocaleString()} accent={ACCENT} />
            <StatTile label="Cleared" value={(cleared || 0).toLocaleString()} accent={C.green} />
            <StatTile label="Blocked" value={(blocked || 0).toLocaleString()} accent={C.red} />
          </Grid>
        </DataState>
      </PanelCard>

      <PanelCard title="Endpoint catalogue" accent={ACCENT}
        right={<Badge color={ACCENT}>{rows.length} / {endpoints.length} shown</Badge>}>
        <div style={{ marginBottom: 10 }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter by source name or URL…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "8px 11px", fontSize: 12,
              color: C.textB, background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`,
              borderRadius: 6, outline: "none",
              fontFamily: "'JetBrains Mono','SF Mono',Courier New,monospace",
            }}
          />
        </div>
        <DataState loading={epAsync.loading} error={epAsync.error} empty={!endpoints.length}
          emptyLabel="No endpoints loaded">
          <div style={{ overflowX: "auto", maxHeight: 460 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", color: C.text || "#8aa", position: "sticky", top: 0 }}>
                  <th style={{ padding: "6px 8px" }}>Source</th>
                  <th style={{ padding: "6px 8px" }}>URL</th>
                  <th style={{ padding: "6px 8px" }}>Method</th>
                  <th style={{ padding: "6px 8px" }}>Connector</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
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
          {!rows.length && (
            <div style={{ padding: 18, color: C.text, fontSize: 10, letterSpacing: 1 }}>
              No endpoints match “{filter}”
            </div>
          )}
        </DataState>
      </PanelCard>
    </PageShell>
  );
}
