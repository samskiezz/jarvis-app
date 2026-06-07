import { useState } from "react";
import { COLORS as C } from "@/domain/colors";

const WIDGET_TYPES = [
  { type: "objectTable", label: "Object Table", icon: "⊞" },
  { type: "metricCard", label: "Metric Card", icon: "◉" },
  { type: "filterList", label: "Filter List", icon: "☰" },
  { type: "chartXY", label: "Chart XY", icon: "📈" },
  { type: "mapWidget", label: "Map", icon: "🗺" },
];

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 5,
  cursor: "pointer",
  border: `1px solid ${C.border}`,
  background: "rgba(0,0,0,0.25)",
  color: C.textB,
  fontSize: 10,
  letterSpacing: 1,
};

export default function WidgetPalette({ onAdd }: { onAdd: (type: string) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);

  return (
    <div
      style={{
        width: 180,
        borderRight: `1px solid ${C.border}`,
        background: "rgba(4,10,16,0.85)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 9, color: C.text, letterSpacing: 2, marginBottom: 4 }}>
        WIDGETS
      </div>
      {WIDGET_TYPES.map((w) => (
        <div
          key={w.type}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("widgetType", w.type);
            setDragging(w.type);
          }}
          onDragEnd={() => setDragging(null)}
          onClick={() => onAdd(w.type)}
          style={{
            ...itemStyle,
            borderColor: dragging === w.type ? C.neon : C.border,
            opacity: dragging && dragging !== w.type ? 0.5 : 1,
          }}
        >
          <span style={{ fontSize: 14 }}>{w.icon}</span>
          <span>{w.label}</span>
        </div>
      ))}
    </div>
  );
}
