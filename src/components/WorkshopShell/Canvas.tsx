import { useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import ObjectTable from "@/components/WorkshopWidgets/ObjectTable";
import MetricCard from "@/components/WorkshopWidgets/MetricCard";
import FilterList from "@/components/WorkshopWidgets/FilterList";
import ChartXY from "@/components/WorkshopWidgets/ChartXY";
import MapWidget from "@/components/WorkshopWidgets/MapWidget";

const WIDGET_MAP: Record<string, React.FC<any>> = {
  objectTable: ObjectTable,
  metricCard: MetricCard,
  filterList: FilterList,
  chartXY: ChartXY,
  mapWidget: MapWidget,
};

export default function Canvas({
  widgets,
  selectedId,
  onSelect,
  onDrop,
  onReorder,
  previewMode,
}: {
  widgets: any[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDrop: (widgetType: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  previewMode: boolean;
}) {
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const widgetType = e.dataTransfer.getData("widgetType");
      if (widgetType) {
        onDrop(widgetType);
      }
    },
    [onDrop]
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        flex: 1,
        padding: 14,
        overflowY: "auto",
        background: "transparent",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
          gridAutoRows: "minmax(160px, auto)",
        }}
      >
        {widgets.map((w, idx) => {
          const Comp = WIDGET_MAP[w.type];
          if (!Comp) return null;
          const isSelected = w.id === selectedId;
          const span = Math.min(12, Math.max(1, w.config?.grid?.w || 4));
          return (
            <div
              key={w.id}
              draggable={!previewMode}
              onDragStart={(e) => {
                e.dataTransfer.setData("canvasIndex", String(idx));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                const fromIdx = Number(e.dataTransfer.getData("canvasIndex"));
                if (!Number.isNaN(fromIdx)) {
                  onReorder(fromIdx, idx);
                } else {
                  const widgetType = e.dataTransfer.getData("widgetType");
                  if (widgetType) onDrop(widgetType);
                }
              }}
              onClick={() => onSelect(w.id)}
              style={{
                gridColumn: `span ${span}`,
                position: "relative",
                borderRadius: 6,
                border: `1px solid ${isSelected ? C.neon : C.border}`,
                background: "rgba(4,10,16,0.6)",
                backdropFilter: "blur(6px)",
                padding: previewMode ? 0 : 8,
                cursor: previewMode ? "default" : "grab",
                boxShadow: isSelected ? `0 0 12px ${C.neon}33` : undefined,
              }}
            >
              {!previewMode && (
                <div
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 6,
                    fontSize: 8,
                    color: C.text,
                    pointerEvents: "none",
                  }}
                >
                  {w.type}
                </div>
              )}
              <div style={{ pointerEvents: previewMode ? "auto" : "auto" }}>
                <Comp config={w.config} />
              </div>
            </div>
          );
        })}
        {widgets.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              color: C.text,
              fontSize: 10,
              textAlign: "center",
              padding: 40,
              border: `1px dashed ${C.border}`,
              borderRadius: 6,
            }}
          >
            Drag widgets from the palette or click to add them.
          </div>
        )}
      </div>
    </div>
  );
}
