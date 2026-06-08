import { COLORS as C, SHELL as S } from "@/domain/colors";

/**
 * WakeWordToggle — always-visible pill button next to the JARVIS orb.
 * Click to arm the wake word ("JARVIS, …") without opening the full panel;
 * click again to disarm.  When armed the orb stays armed even while closed.
 */
export default function WakeWordToggle({ armed, onArm, onDisarm }) {
  return (
    <button
      onClick={armed ? onDisarm : onArm}
      title={
        armed
          ? "Wake word armed — say \"JARVIS\" to open (click to disarm)"
          : "Arm always-listening wake word"
      }
      style={{
        position: "fixed", right: 82, bottom: 46, zIndex: 10000,
        height: 22, padding: "0 8px", borderRadius: 11,
        background: armed ? `${C.neon}18` : "rgba(2,8,12,0.88)",
        border: `1px solid ${armed ? C.neon + "88" : "#2a3a4a"}`,
        color: armed ? C.neon : "#3d5060",
        fontSize: 9, letterSpacing: 2, cursor: "pointer",
        fontFamily: S.mono, transition: "all 0.25s",
        boxShadow: armed ? `0 0 10px ${C.neon}44` : "none",
        userSelect: "none",
      }}
    >
      {armed ? "◉ WAKE" : "○ WAKE"}
    </button>
  );
}
