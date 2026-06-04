/**
 * Wave1Kit — small presentational primitives shared by the Wave-1 platform
 * pages. These compose the existing PageKit/colors house style so the new pages
 * stay visually identical to ScienceConsole while avoiding copy-pasted inline
 * styles for the handful of patterns they all need (inputs, buttons, key/value
 * rows, a raw-JSON viewer, and a tab strip).
 */
import { COLORS as C } from "@/domain/colors";

export const inputStyle = {
  background: "rgba(0,0,0,0.4)",
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  color: C.textB,
  padding: "7px 9px",
  fontSize: 10,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export function Btn({ accent = C.neon, children, style, ...rest }) {
  return (
    <button
      {...rest}
      style={{
        ...inputStyle,
        width: "auto",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        color: accent,
        borderColor: accent + "66",
        background: accent + "1a",
        fontWeight: 700,
        letterSpacing: 1,
        opacity: rest.disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// A simple label : value row for object/property panels.
export function KV({ k, v, accent = C.textB }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
      <span style={{ fontSize: 8, color: C.text, letterSpacing: 0.5, minWidth: 110,
        textTransform: "uppercase", flexShrink: 0 }}>{k}</span>
      <span style={{ fontSize: 10, color: accent, wordBreak: "break-word", flex: 1 }}>
        {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
      </span>
    </div>
  );
}

// The shared raw-JSON viewer used across every Wave-1 result panel.
export function JsonView({ data, max = 320 }) {
  return (
    <pre style={{ margin: 0, maxHeight: max, overflow: "auto", fontSize: 9, lineHeight: 1.5,
      color: C.textB, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`,
      borderRadius: 5, padding: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {typeof data === "string" ? data : JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function Tabs({ tabs, active, onChange, accent = C.neon }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button key={t.id} onClick={() => onChange(t.id)}
            style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 10, letterSpacing: 1.5,
              fontWeight: 700, padding: "7px 16px", borderRadius: 5,
              border: `1px solid ${on ? accent + "88" : C.border}`,
              background: on ? accent + "1a" : "rgba(0,0,0,0.25)",
              color: on ? accent : C.text }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
