/**
 * Launcher — the root destination picker.
 *
 * The product collapses to exactly two top-level destinations: APEX (the hi-tech
 * HUD that holds every feature page) and UNDERWORLD (the standalone sim, reached
 * as a peer). This is a clean, minimal full-screen launcher with two glass tiles
 * that route to each. It uses the app's existing theme colors from domain/colors.
 */
import { useNavigate } from "react-router-dom";
import { COLORS as C, SHELL as S, glow } from "@/domain/colors";
import { HOME_PAGE } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const APEX_ROUTE = `/apex${createPageUrl(HOME_PAGE.name)}`;
const UNDERWORLD_ROUTE = `/apex${createPageUrl("Underworld")}`;

// Per-destination signature: APEX wears its neon-green / orange core identity,
// UNDERWORLD wears its violet identity.
const SIG = {
  apex: { accent: C.neon, mark: C.orange },
  underworld: { accent: C.purple, mark: C.purple },
};

function Tile({ title, sub, sig, glyph, onClick }) {
  const { accent, mark } = sig;
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 340px",
        maxWidth: 440,
        minHeight: 380,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "32px 30px",
        background: S.glass,
        border: `1px solid ${S.border}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: S.radius,
        color: S.textHi,
        fontFamily: S.ui,
        backdropFilter: S.blur,
        WebkitBackdropFilter: S.blur,
        transition: "border-color 0.16s, transform 0.16s, box-shadow 0.16s",
        boxShadow: "none",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = glow(accent);
        e.currentTarget.style.borderColor = S.borderHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = S.border;
      }}
    >
      <div style={{ fontSize: 60, lineHeight: 1, color: mark }}>{glyph}</div>
      <div>
        <div style={{ fontFamily: S.mono, fontSize: 26, letterSpacing: 6, fontWeight: 700, color: accent }}>{title}</div>
        <div style={{ marginTop: 12, fontSize: 12, color: S.text, lineHeight: 1.65 }}>{sub}</div>
        <div style={{ marginTop: 20, fontFamily: S.mono, fontSize: S.fs.sm, letterSpacing: 3, color: accent, opacity: 0.85 }}>
          ENTER ▸
        </div>
      </div>
    </button>
  );
}

export default function Launcher() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: S.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 44,
        padding: 24,
        fontFamily: S.ui,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width={26} height={26} viewBox="0 0 24 24">
          <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none" />
          <circle cx={12} cy={12} r={2.5} fill={C.neon} />
        </svg>
        <span style={{ fontFamily: S.mono, color: C.neon, fontSize: S.fs.lg, letterSpacing: 6, fontWeight: 700 }}>JARVIS</span>
        <span style={{ fontFamily: S.mono, color: S.text, fontSize: S.fs.sm, letterSpacing: 3 }}>SELECT DESTINATION</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          justifyContent: "center",
          width: "100%",
          maxWidth: 940,
        }}
      >
        <Tile
          title="APEX"
          sub="Command HUD — intel, command, cognition, knowledge, wealth & system."
          sig={SIG.apex}
          glyph="◆"
          onClick={() => navigate(APEX_ROUTE)}
        />
        <Tile
          title="UNDERWORLD"
          sub="Standalone 3D city simulation — agents, war environment, arena."
          sig={SIG.underworld}
          glyph="🏙"
          onClick={() => navigate(UNDERWORLD_ROUTE)}
        />
      </div>
    </div>
  );
}
