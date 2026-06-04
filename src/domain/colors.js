// Canonical platform brand tokens live in /design-tokens.json and are mirrored
// here (APEX runtime) and in underworld/web/tailwind.config.js (`brand.*`) so
// both surfaces share one identity (parity P15 #109). Keep the brand hexes below
// in sync with design-tokens.json.
export const COLORS = {
  bg: "#020608",
  panel: "rgba(4,10,16,0.95)",
  border: "rgba(0,200,120,0.14)",
  borderB: "rgba(0,200,120,0.06)",
  neon: "#00c878",
  neonD: "rgba(0,200,120,0.1)",
  blue: "#0096d4",
  blueD: "rgba(0,150,212,0.12)",
  gold: "#e8a800",
  goldD: "rgba(232,168,0,0.12)",
  red: "#e8203c",
  redD: "rgba(232,32,60,0.12)",
  purple: "#a855f7",
  purpleD: "rgba(168,85,247,0.12)",
  orange: "#f07820",
  text: "#566878",
  textB: "#a8bcc8",
  glass: "rgba(4,10,18,0.82)",
  mark: {
    INTERNAL: "#00c878",
    FINANCIAL: "#e8a800",
    PII: "#e8203c",
    LEGAL: "#a855f7",
    RESTRICTED: "#f07820",
  },
  type: {
    person: "#00c878",
    org: "#0096d4",
    invest: "#e8a800",
    asset: "#f07820",
    property: "#0096d4",
    creative: "#a855f7",
    client: "#e8203c",
    target: "#e8203c",
  },
};

/**
 * SHELL — the single token set the APEX chrome shares.
 *
 * Launcher, DomainRail, CommandPalette and the AppLayout top strip all read from
 * here so spacing, borders, glass blur, glow and typography stay identical. This
 * is additive: the legacy COLORS exports above are untouched.
 */
export const SHELL = {
  // Surfaces — near-black base + translucent glass intended for backdrop-blur.
  bg: "#020608",
  glass: "rgba(4,10,18,0.82)",      // panels / tiles / palette
  glassRail: "rgba(2,6,10,0.86)",   // the persistent rail + top strip
  blur: "blur(12px)",
  // Hairline borders.
  border: "rgba(140,170,190,0.12)",
  borderHover: "rgba(140,170,190,0.26)",
  // Neutral text (chrome stays neutral; accent is load-bearing, used sparingly).
  text: "#5e7180",        // dim / machine voice
  textHi: "#adc1cd",      // primary label
  // Geometry.
  radius: 5,
  // Type scale (px) + font stacks. Inter for UI labels, JetBrains Mono for the
  // breadcrumb / telemetry / IDs "machine voice".
  fs: { xxs: 7, xs: 8, sm: 9.5, md: 11, lg: 13, xl: 18 },
  ui: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
  mono: "'JetBrains Mono','SF Mono',ui-monospace,monospace",
};

// The six domain accents (mirrors pageRegistry GROUPS so colors.js stays
// self-contained / free of an import cycle).
export const DOMAIN_ACCENTS = {
  intel: "#00c878",
  command: "#0096d4",
  cognition: "#a855f7",
  apex: "#f07820",
  knowledge: "#e8a800",
  wealth: "#566878",
};

// Resolve a domain group id to its accent (falls back to the INTEL green).
export const domainAccent = (groupId) => DOMAIN_ACCENTS[groupId] || DOMAIN_ACCENTS.intel;

// Glow recipe — applied only on focus / active / live, never at rest.
export const glow = (accent) => `0 0 0 1px ${accent}33, 0 8px 30px -12px ${accent}`;

export const riskColor = (risk) =>
  ({ LOW: COLORS.neon, MEDIUM: COLORS.gold, HIGH: COLORS.red }[risk] || COLORS.text);

export const earthquakeColor = (mag) =>
  mag >= 6 ? "#ff2200" : mag >= 5 ? "#ff8800" : mag >= 4.5 ? "#ffcc00" : "#88ff88";
