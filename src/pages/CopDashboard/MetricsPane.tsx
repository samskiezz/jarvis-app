/**
 * MetricsPane — COP metric cards for selection context.
 */
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { panelStyle, panelHeaderStyle } from "./CopDashboard";

interface Card {
  name: string;
  value?: any;
  labels?: Record<string, any>;
}

interface Props {
  cards: Card[];
  selection?: any;
  highlightMetrics?: any[];
}

export default function MetricsPane({ cards, selection, highlightMetrics }: Props) {
  const display = [...(highlightMetrics || []), ...cards].slice(0, 8);

  return (
    <div style={{ ...panelStyle, flex: 1 }}>
      <div style={panelHeaderStyle(C.neon)}>METRICS</div>
      <div style={{ overflow: "auto", padding: "6px 8px" }}>
        {display.length === 0 && (
          <div style={{ color: C.text, fontSize: 10, padding: 6 }}>No metrics</div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {display.map((c, i) => (
            <div
              key={i}
              style={{
                background: "rgba(4,10,16,0.5)",
                border: `1px solid ${S.border}`,
                borderRadius: 4,
                padding: "6px 8px",
              }}
            >
              <div style={{ fontSize: 8, color: C.text, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>
                {c.name}
              </div>
              <div style={{ fontSize: 13, color: C.textB, fontWeight: 600 }}>
                {c.value != null ? String(c.value) : "—"}
              </div>
            </div>
          ))}
        </div>
        {selection && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 8px",
              borderRadius: 4,
              border: `1px solid ${C.neon}30`,
              background: "rgba(0,200,120,0.05)",
              fontSize: 9,
              color: C.textB,
            }}
          >
            <div style={{ color: C.neon, marginBottom: 3 }}>SELECTION CONTEXT</div>
            <div>ID: {selection.id || selection.object_id || "—"}</div>
            <div>Type: {selection.type || "—"}</div>
            <div>Source: {selection.source_pane || "—"}</div>
          </div>
        )}
      </div>
    </div>
  );
}
