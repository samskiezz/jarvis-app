/**
 * Launcher — the root destination picker.
 *
 * The product collapses to exactly two top-level destinations: APEX (the hi-tech
 * HUD that holds every feature page) and UNDERWORLD (the standalone sim, reached
 * as a peer). This is a clean, minimal full-screen launcher with two glass tiles
 * that route to each. It uses the app's existing theme colors from domain/colors.
 */
import { useNavigate } from "react-router-dom";
import { COLORS as C } from "@/domain/colors";
import { HOME_PAGE } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const APEX_ROUTE = `/apex${createPageUrl(HOME_PAGE.name)}`;
const UNDERWORLD_ROUTE = `/apex${createPageUrl("Underworld")}`;

function Tile({ title, sub, accent, glyph, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "1 1 320px",
        maxWidth: 420,
        minHeight: 360,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "28px 26px",
        background: C.glass,
        border: `1px solid ${C.border}`,
        borderTop: `2px solid ${accent}`,
        borderRadius: 4,
        color: C.textB,
        fontFamily: "'JetBrains Mono',Courier New,monospace",
        backdropFilter: "blur(6px)",
        transition: "border-color 0.16s, transform 0.16s, box-shadow 0.16s",
        boxShadow: `0 0 0 0 ${accent}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = `0 14px 40px -16px ${accent}`;
        e.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = `0 0 0 0 ${accent}`;
        e.currentTarget.style.borderColor = C.border;
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1, color: accent }}>{glyph}</div>
      <div>
        <div style={{ fontSize: 26, letterSpacing: 6, fontWeight: 700, color: accent }}>{title}</div>
        <div style={{ marginTop: 10, fontSize: 10, letterSpacing: 1, color: C.text, lineHeight: 1.6 }}>{sub}</div>
        <div style={{ marginTop: 18, fontSize: 9, letterSpacing: 3, color: accent, opacity: 0.85 }}>
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
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        padding: 24,
        fontFamily: "'JetBrains Mono',Courier New,monospace",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width={26} height={26} viewBox="0 0 24 24">
          <polygon points="12,2 21,7 21,17 12,22 3,17 3,7" stroke={C.neon} strokeWidth="1.5" fill="none" />
          <circle cx={12} cy={12} r={2.5} fill={C.neon} />
        </svg>
        <span style={{ color: C.neon, fontSize: 14, letterSpacing: 6, fontWeight: 700 }}>JARVIS</span>
        <span style={{ color: C.text, fontSize: 9, letterSpacing: 3 }}>SELECT DESTINATION</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 28,
          justifyContent: "center",
          width: "100%",
          maxWidth: 920,
        }}
      >
        <Tile
          title="APEX"
          sub="Command HUD — intel, command, cognition, knowledge, wealth & system."
          accent={C.neon}
          glyph="◆"
          onClick={() => navigate(APEX_ROUTE)}
        />
        <Tile
          title="UNDERWORLD"
          sub="Standalone 3D city simulation — agents, war environment, arena."
          accent={C.red}
          glyph="🏙"
          onClick={() => navigate(UNDERWORLD_ROUTE)}
        />
      </div>
    </div>
  );
}
