/**
 * LayerControl — COP sidebar for toggling map layer visibility.
 */
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { panelStyle, panelHeaderStyle } from "./CopDashboard";

interface Layer {
  id: string;
  label: string;
  kind?: string;
  visible?: boolean;
}

interface Props {
  layers: Layer[];
  onToggle: (layerId: string) => void;
}

export default function LayerControl({ layers, onToggle }: Props) {
  return (
    <div style={{ ...panelStyle, maxHeight: "50%" }}>
      <div style={panelHeaderStyle(C.blue)}>LAYERS</div>
      <div style={{ overflow: "auto", padding: "6px 8px" }}>
        {layers.length === 0 && (
          <div style={{ color: C.text, fontSize: 10, padding: 6 }}>No layers</div>
        )}
        {layers.map((layer) => (
          <button
            key={layer.id}
            onClick={() => onToggle(layer.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              background: layer.visible ? "rgba(0,200,120,0.08)" : "transparent",
              border: `1px solid ${layer.visible ? "rgba(0,200,120,0.25)" : S.border}`,
              borderRadius: 4,
              padding: "5px 7px",
              marginBottom: 5,
              cursor: "pointer",
              color: layer.visible ? C.textB : C.text,
              fontSize: 10,
              fontFamily: "inherit",
            }}
          >
            <span>{layer.label || layer.id}</span>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: layer.visible ? C.neon : "transparent",
                border: `1px solid ${layer.visible ? C.neon : C.text}`,
                display: "inline-block",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
