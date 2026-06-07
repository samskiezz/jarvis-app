/**
 * CopDashboard — Gotham-class Common Operating Picture (COP) + Geospatial Fusion.
 *
 * Single-screen dashboard with synchronized panes:
 *   • MapPane      — live geo entities + layers
 *   • GraphPane    — node-link subgraph
 *   • TimelinePane — threshold events / temporal feed
 *   • MetricsPane  — metric cards for selection context
 *   • LayerControl — layer toggle sidebar
 *
 * Cross-filtering: click in Map → highlight in Graph + Timeline + Metrics.
 * All data is honest (fetched from /v1/cop/* and underlying services).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { PageShell, Grid, Badge } from "@/components/PageKit";
import { apiGet, apiPost, asList, useAsync } from "@/lib/wave1";
import MapPane from "./MapPane";
import GraphPane from "./GraphPane";
import TimelinePane from "./TimelinePane";
import MetricsPane from "./MetricsPane";
import LayerControl from "./LayerControl";

const ACCENT = C.neon;

export default function CopDashboard() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selection, setSelection] = useState<any>(null);
  const [highlight, setHighlight] = useState<any>(null);
  const [layers, setLayers] = useState<any[]>([]);
  const [syncToken, setSyncToken] = useState<string>("");
  const snapAsync = useAsync();
  const selAsync = useAsync();
  const pollRef = useRef<any>(null);

  const loadSnapshot = useCallback(async () => {
    const body = await snapAsync.run(() => apiGet("/v1/cop/snapshot"));
    if (body) {
      setSnapshot(body);
      setSyncToken(body.sync_token || "");
      setLayers(asList(body.geo, "layers"));
    }
  }, [snapAsync]);

  useEffect(() => {
    loadSnapshot();
    // Polling incremental sync every 8 s
    pollRef.current = setInterval(async () => {
      if (!syncToken) return;
      try {
        const res = await apiGet(`/v1/cop/sync?since_token=${encodeURIComponent(syncToken)}`);
        if (res && res.full_refresh) {
          setSnapshot(res.changes);
          setSyncToken(res.sync_token || syncToken);
        } else if (res && res.sync_token) {
          setSyncToken(res.sync_token);
        }
      } catch {
        // degrade silently on poll failure
      }
    }, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const selectObject = async (obj: any) => {
    setSelection(obj);
    const body = await selAsync.run(() =>
      apiPost("/v1/cop/selection", {
        object_id: obj?.id || obj?.object_id,
        type: obj?.type,
        source_pane: obj?.source_pane || "map",
      })
    );
    if (body?.highlight) setHighlight(body.highlight);
  };

  const toggleLayer = async (layerId: string) => {
    await apiPost("/v1/cop/layers/toggle", { layer_id: layerId });
    const body = await apiGet("/v1/cop/layers");
    setLayers(asList(body, "layers"));
  };

  const geoObjects = asList(snapshot?.geo, "objects");
  const graphNodes = asList(snapshot?.graph, "nodes");
  const graphEdges = asList(snapshot?.graph, "edges");
  const temporalEvents = asList(snapshot?.temporal, "events");
  const metricCards = asList(snapshot?.metrics, "cards");

  return (
    <PageShell
      title="COMMON OPERATING PICTURE"
      subtitle="fused geo · graph · temporal · metrics"
      accent={ACCENT}
      actions={<Badge color={ACCENT}>{geoObjects.length} ENTITIES</Badge>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, height: "calc(100vh - 140px)" }}>
        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <LayerControl layers={layers} onToggle={toggleLayer} />
          <MetricsPane
            cards={metricCards}
            selection={selection}
            highlightMetrics={highlight?.metrics}
          />
        </div>

        {/* Main panes */}
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gridTemplateColumns: "1fr 1fr", gap: 10, minHeight: 0 }}>
          <MapPane
            objects={geoObjects}
            selection={selection}
            onSelect={selectObject}
          />
          <GraphPane
            nodes={graphNodes}
            edges={graphEdges}
            highlightNodes={highlight?.graph?.nodes}
            highlightEdges={highlight?.graph?.edges}
            selection={selection}
            onSelect={selectObject}
          />
          <TimelinePane
            events={temporalEvents}
            selection={selection}
            highlightEvents={highlight?.temporal}
            onSelect={selectObject}
          />
          <div style={panelStyle}>
            <div style={panelHeaderStyle(ACCENT)}>CROSS-HIGHLIGHT</div>
            <div style={{ padding: 10, fontSize: 10, color: C.textB }}>
              {selection ? (
                <div>
                  <div style={{ color: ACCENT, marginBottom: 6 }}>Selected: {selection.id || selection.object_id}</div>
                  <div>Geo matches: {(highlight?.geo || []).length}</div>
                  <div>Graph neighbors: {(highlight?.graph?.nodes || []).length}</div>
                  <div>Temporal versions: {(highlight?.temporal || []).length}</div>
                  <div>Metric context: {(highlight?.metrics || []).length}</div>
                </div>
              ) : (
                <div style={{ color: C.text }}>Click an entity in any pane to cross-highlight.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export const panelStyle: React.CSSProperties = {
  background: S.glass,
  backdropFilter: S.blur,
  WebkitBackdropFilter: S.blur,
  border: `1px solid ${S.border}`,
  borderRadius: 6,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

export const panelHeaderStyle = (accent: string): React.CSSProperties => ({
  fontSize: 9,
  letterSpacing: 1.5,
  color: accent,
  padding: "8px 10px",
  borderBottom: `1px solid ${S.border}`,
  background: "rgba(4,10,16,0.6)",
  flexShrink: 0,
});
