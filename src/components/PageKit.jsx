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
import { COLORS as C, SHELL as S } from "@/domain/colors";

/**
 * GLASS — the shared frosted-glass surface recipe, derived from the SHELL chrome
 * tokens (Launcher / DomainRail / CommandPalette use the same blur + border).
 * Composing this on PanelCard / StatTile makes every feature page glassmorphic
 * from this one place. Each surface gets: a dark translucent base, backdrop-blur,
 * a hairline neon-neutral edge, and a soft inner glow (inset highlight + drop).
 */
const GLASS = {
  // Translucent dark base so text stays legible over the blur (≈ bg-white/5 dark).
  background: S.glass,
  backdropFilter: S.blur,
  WebkitBackdropFilter: S.blur,
  border: `1px solid ${S.border}`,
  // Outer drop for depth + inset highlight (top edge) and inner darkening = glass.
  boxShadow:
    "0 8px 30px -12px rgba(0,0,0,0.7), inset 0 1px 0 rgba(173,193,205,0.06), inset 0 0 24px rgba(0,0,0,0.25)",
};

// Fixed full-bleed backdrop: a subtle radial gradient + faint grid so the
// backdrop-blur on panels actually reads as glass (there's something to frost).
function GlassBackdrop() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
      background: [
        "radial-gradient(1200px 700px at 18% -10%, rgba(0,200,120,0.07), transparent 60%)",
        "radial-gradient(1000px 600px at 100% 0%, rgba(0,150,212,0.06), transparent 55%)",
        `linear-gradient(180deg, ${S.bg} 0%, #03080c 100%)`,
      ].join(","),
    }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.4,
        backgroundImage:
          "linear-gradient(rgba(140,170,190,0.05) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(140,170,190,0.05) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        maskImage: "radial-gradient(circle at 50% 30%, #000 0%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(circle at 50% 30%, #000 0%, transparent 80%)",
      }} />
    </div>
  );
}

export function PageShell({ title, subtitle, accent = C.neon, actions, children }) {
  return (
    <div style={{ position: "relative", minHeight: "100%", padding: "18px 22px 60px", color: C.textB,
      fontFamily: "'JetBrains Mono','SF Mono',Courier New,monospace" }}>
      <GlassBackdrop />
      <div style={{ position: "relative", zIndex: 1 }}>
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
    </div>
  );
}

export function PanelCard({ title, accent = C.neon, right, style, children }) {
  return (
    <section style={{ ...GLASS, borderRadius: 6, overflow: "hidden", ...style }}>
      {title && (
        <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          borderBottom: `1px solid ${S.border}`, background: `${accent}0d` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent,
            boxShadow: `0 0 6px ${accent}` }} />
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
    <div style={{ ...GLASS, borderRadius: 5, padding: "10px 12px" }}>
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
