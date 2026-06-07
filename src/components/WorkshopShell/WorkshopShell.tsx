import { useState, useCallback } from "react";
import Header from "./Header";
import WidgetPalette from "./WidgetPalette";
import Canvas from "./Canvas";
import PropertyPanel from "./PropertyPanel";
import { apiGet, apiPost, apiPut } from "@/lib/wave1";

let _idCounter = 0;
const mkId = () => `w-${Date.now()}-${++_idCounter}`;

const DEFAULT_CONFIG: Record<string, any> = {
  objectTable: { title: "Object Table", dataSource: "/v1/ontology/objects", grid: { w: 6 } },
  metricCard: { title: "Metric", dataSource: "/v1/ontology/objects", grid: { w: 3 } },
  filterList: { title: "Filters", dataSource: "/v1/ontology/objects", field: "type", grid: { w: 3 } },
  chartXY: { title: "Chart", dataSource: "/v1/ontology/objects", chartType: "line", grid: { w: 6 } },
  mapWidget: { title: "Map", dataSource: "/v1/geo/objects", grid: { w: 6 } },
};

export default function WorkshopShell({ appId }: { appId?: string }) {
  const [appName, setAppName] = useState("Untitled App");
  const [widgets, setWidgets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const addWidget = useCallback((type: string) => {
    const id = mkId();
    const config = { ...DEFAULT_CONFIG[type], id };
    setWidgets((prev) => [...prev, { id, type, config }]);
    setSelectedId(id);
  }, []);

  const reorderWidgets = useCallback((fromIndex: number, toIndex: number) => {
    setWidgets((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const updateWidgetConfig = useCallback((cfg: any) => {
    setWidgets((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, config: cfg } : w))
    );
  }, [selectedId]);

  const selectedWidget = widgets.find((w) => w.id === selectedId) || null;

  const handleSave = useCallback(async () => {
    try {
      const layout = { name: appName, widgets };
      if (appId) {
        await apiPut(`/v1/workshop/apps/${appId}`, layout);
      } else {
        const res = await apiPost("/v1/workshop/apps", layout);
        if (res?.id) {
          window.history.replaceState(null, "", `/apex/WorkshopBuilder/${res.id}`);
        }
      }
    } catch (e) {
      console.error("Save failed", e);
    }
  }, [appName, widgets, appId]);

  const handleLoad = useCallback(async () => {
    try {
      const res = await apiGet("/v1/workshop/apps");
      const apps = res?.apps || [];
      if (apps.length === 0) return;
      const first = apps[0];
      setAppName(first.name);
      setWidgets(first.layout?.widgets || []);
    } catch (e) {
      console.error("Load failed", e);
    }
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Header
        title={appName}
        onTitleChange={setAppName}
        onSave={handleSave}
        onLoad={handleLoad}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode((p) => !p)}
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!previewMode && <WidgetPalette onAdd={addWidget} />}
        <Canvas
          widgets={widgets}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onDrop={addWidget}
          onReorder={reorderWidgets}
          previewMode={previewMode}
        />
        {!previewMode && (
          <PropertyPanel widget={selectedWidget} onChange={updateWidgetConfig} />
        )}
      </div>
    </div>
  );
}
