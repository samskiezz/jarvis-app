/**
 * PageKit — shared building blocks so all 30 pages share one visual language
 * (the Palantir/Gotham terminal look already established in JarvisTerminal).
 *
 * Every rebuilt page composes these instead of re-styling from scratch:
 *   <PageShell> wraps content under the global Layout dock.
 *   <PanelCard>  a titled glass panel.
 *   <StatTile>   a labelled metric.
 *   <DataState>  loading / error / empty handling around fetched data.
 */
import { COLORS as C } from "@/domain/colors";

export function PageShell({ title, subtitle, accent = C.neon, actions, children }) {
  return (
    <div style={{ minHeight: "100%", padding: "18px 22px 60px", color: C.textB,
      fontFamily: "'JetBrains Mono','SF Mono',Courier New,monospace" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 18,
        borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 18, letterSpacing: 3, color: accent, fontWeight: 700 }}>{title}</h1>
          {subtitle && <div style={{ fontSize: 9, color: C.text, letterSpacing: 1, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function PanelCard({ title, accent = C.neon, right, style, children }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6,
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)", overflow: "hidden", ...style }}>
      {title && (
        <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          borderBottom: `1px solid ${C.border}`, background: "rgba(0,200,120,0.04)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
          <span style={{ fontSize: 10, letterSpacing: 2, color: accent, fontWeight: 700, flex: 1 }}>{title}</span>
          {right}
        </header>
      )}
      <div style={{ padding: 12 }}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, accent = C.neon, sub }) {
  return (
    <div style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "10px 12px" }}>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: C.text, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accent, marginTop: 4, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.text, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function Grid({ min = 220, gap = 12, children, style }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap, ...style }}>
      {children}
    </div>
  );
}

export function Badge({ children, color = C.neon }) {
  return (
    <span style={{ fontSize: 8, letterSpacing: 1, padding: "2px 7px", borderRadius: 3,
      background: color + "1a", color, border: `1px solid ${color}44`, fontWeight: 700 }}>{children}</span>
  );
}

export function DataState({ loading, error, empty, emptyLabel = "No data", children }) {
  if (loading) return <div style={{ padding: 24, color: C.text, fontSize: 10, letterSpacing: 1 }}>◌ LOADING…</div>;
  if (error) return <div style={{ padding: 24, color: C.red, fontSize: 10 }}>⚠ {String(error.message || error)}</div>;
  if (empty) return <div style={{ padding: 24, color: C.text, fontSize: 10, letterSpacing: 1 }}>{emptyLabel}</div>;
  return children;
}
