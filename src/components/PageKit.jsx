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
import AskJarvisButton from "@/components/Jarvis/AskJarvisButton";

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
        <div className="apex-fade" style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 18,
          borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "stretch", gap: 12, flex: 1 }}>
            <span aria-hidden style={{ width: 3, borderRadius: 2, background: accent,
              boxShadow: `0 0 10px ${accent}`, alignSelf: "stretch", minHeight: 30 }} />
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: 0, fontSize: 19, letterSpacing: 3.5, color: accent, fontWeight: 700,
                textShadow: `0 0 24px ${accent}44` }}>{title}</h1>
              {subtitle && <div style={{ fontSize: 9, color: C.text, letterSpacing: 1, marginTop: 5 }}>{subtitle}</div>}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {actions}
            <AskJarvisButton query={title ? `Tell me about the ${title} page.` : ""} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PanelCard({ title, accent = C.neon, right, style, children }) {
  return (
    <section className="apex-panel apex-rise" style={{ ...GLASS, borderRadius: 8, overflow: "hidden", ...style }}>
      {title && (
        <header style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: "9px 13px",
          borderBottom: `1px solid ${S.border}`,
          background: `linear-gradient(180deg, ${accent}14, ${accent}05)` }}>
          <span aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.55 }} />
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent,
            boxShadow: `0 0 8px ${accent}` }} />
          <span style={{ fontSize: 10, letterSpacing: 2.2, color: accent, fontWeight: 700, flex: 1 }}>{title}</span>
          {right}
        </header>
      )}
      <div style={{ padding: 13 }}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, accent = C.neon, sub }) {
  return (
    <div className="apex-tile" style={{ ...GLASS, position: "relative", borderRadius: 7, padding: "11px 13px", overflow: "hidden" }}>
      <span aria-hidden style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 2,
        background: `linear-gradient(180deg, ${accent}, transparent)`, opacity: 0.7 }} />
      <div style={{ fontSize: 8, letterSpacing: 1.6, color: C.text, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, marginTop: 5, lineHeight: 1,
        fontVariantNumeric: "tabular-nums", textShadow: `0 0 18px ${accent}55` }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.text, marginTop: 4 }}>{sub}</div>}
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
