/**
 * TimelinePane — COP timeline pane showing threshold events / temporal feed.
 *
 * Displays a scrollable list of events with cross-highlight on click.
 */
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { panelStyle, panelHeaderStyle } from "./CopDashboard";

interface Event {
  t: number;
  value?: number;
  kind?: string;
  series_id?: string;
}

interface Props {
  events: Event[];
  selection?: any;
  highlightEvents?: Event[];
  onSelect: (ev: Event) => void;
}

const kindColor: Record<string, string> = {
  cross_up: C.neon,
  cross_down: C.red,
  spike_up: C.gold,
  spike_down: C.blue,
};

function fmtTs(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return String(ts);
  }
}

export default function TimelinePane({ events, selection, highlightEvents, onSelect }: Props) {
  const hlSet = new Set((highlightEvents || []).map((e) => e.t));
  const selectedId = selection?.id || selection?.object_id;

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle(C.blue)}>TIMELINE</div>
      <div style={{ overflow: "auto", padding: "6px 8px", flex: 1 }}>
        {events.length === 0 && (
          <div style={{ color: C.text, fontSize: 10, padding: 6 }}>No events</div>
        )}
        {events.map((ev, i) => {
          const isHl = hlSet.has(ev.t);
          return (
            <button
              key={i}
              onClick={() => onSelect({ ...ev, id: ev.series_id, source_pane: "timeline" })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                background: isHl ? "rgba(0,150,212,0.08)" : "transparent",
                border: `1px solid ${isHl ? "rgba(0,150,212,0.25)" : S.border}`,
                borderRadius: 4,
                padding: "4px 6px",
                marginBottom: 4,
                cursor: "pointer",
                color: C.textB,
                fontSize: 10,
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: kindColor[ev.kind || ""] || C.text,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: C.text, minWidth: 52 }}>{fmtTs(ev.t)}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ev.kind}
              </span>
              <span style={{ color: C.gold }}>{ev.value?.toFixed?.(2) ?? ev.value}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
