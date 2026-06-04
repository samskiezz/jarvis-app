/**
 * KeyboardShortcuts — power-user, keyboard-first navigation (parity P15 #108).
 *
 * Global, self-contained layer (mounted once in Layout) that adds shortcuts on
 * top of the existing ⌘K command palette:
 *   • "/"            → open the command palette (alias of ⌘K)
 *   • "[" / "]"      → previous / next APEX page (flat order)
 *   • "g" then a key → jump to a group's first page (i=intel, c=command,
 *                      o=cognition, s=sensors, a=apex, k=knowledge, p=platform,
 *                      w=war, $=wealth)
 *   • "?"            → toggle this shortcuts help overlay
 *   • "Esc"          → close the overlay
 *
 * All shortcuts are suppressed while typing in an input/textarea/contentEditable
 * or when a modifier (⌘/Ctrl/Alt) is held, so they never fight real typing.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { COLORS as C, SHELL as S } from "@/domain/colors";
import { PAGES } from "@/lib/pageRegistry";
import { createPageUrl } from "@/utils";

const apexUrl = (name) => `/apex${createPageUrl(name)}`;

// group → mnemonic key (first letter, with collisions disambiguated).
const GROUP_KEYS = {
  intel: "i", command: "c", cognition: "o", sensors: "s",
  apex: "a", knowledge: "k", platform: "p", war: "w", wealth: "$",
};

export default function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);
  const gPending = useRef(false);
  const gTimer = useRef(null);

  // Flat, dock-visible APEX page order (mirrors the palette / rail ordering).
  const flat = useMemo(() => PAGES.filter((p) => p.dest !== "underworld"), []);

  const currentIndex = useCallback(() => {
    const path = window.location.pathname;
    return flat.findIndex((p) => path.endsWith(createPageUrl(p.name)));
  }, [flat]);

  const goRelative = useCallback((delta) => {
    if (!flat.length) return;
    const i = currentIndex();
    const next = flat[((i < 0 ? 0 : i) + delta + flat.length) % flat.length];
    if (next) navigate(apexUrl(next.name));
  }, [flat, currentIndex, navigate]);

  const goGroup = useCallback((groupId) => {
    const first = flat.find((p) => p.group === groupId);
    if (first) navigate(apexUrl(first.name));
  }, [flat, navigate]);

  useEffect(() => {
    const typing = (el) =>
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable ||
        el.getAttribute?.("role") === "textbox");

    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target)) return;

      // "g" chord: arm, then the next key selects a group.
      if (gPending.current) {
        gPending.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        const entry = Object.entries(GROUP_KEYS).find(([, k]) => k === e.key);
        if (entry) { e.preventDefault(); goGroup(entry[0]); }
        return;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("jarvis:open-palette"));
          break;
        case "[":
          e.preventDefault(); goRelative(-1); break;
        case "]":
          e.preventDefault(); goRelative(1); break;
        case "g":
          gPending.current = true;
          gTimer.current = setTimeout(() => { gPending.current = false; }, 1200);
          break;
        case "?":
          e.preventDefault(); setShowHelp((v) => !v); break;
        case "Escape":
          setShowHelp(false); break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (gTimer.current) clearTimeout(gTimer.current); };
  }, [goRelative, goGroup]);

  if (!showHelp) return null;

  const rows = [
    ["⌘K  /  /", "Open command palette"],
    ["[   ]", "Previous / next page"],
    ["g then i/c/o/s/a/k/p/w/$", "Jump to group (intel/command/cognition/sensors/apex/knowledge/platform/war/wealth)"],
    ["?", "Toggle this help"],
    ["Esc", "Close"],
  ];

  return (
    <div onClick={() => setShowHelp(false)}
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center",
        justifyContent: "center", background: "rgba(2,6,10,0.6)", backdropFilter: "blur(3px)" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 92vw)", background: S.glass, backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur, border: `1px solid ${S.border}`, borderRadius: 10,
          boxShadow: "0 20px 60px -20px rgba(0,0,0,0.8)", padding: 20, fontFamily: S.mono, color: C.textB }}>
        <div style={{ fontSize: 13, letterSpacing: 3, color: C.neon, fontWeight: 700, marginBottom: 14 }}>KEYBOARD SHORTCUTS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(([k, d], i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
              <kbd style={{ minWidth: 200, fontSize: 11, color: C.gold, fontWeight: 700 }}>{k}</kbd>
              <span style={{ fontSize: 10, color: C.text }}>{d}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: 8, color: C.text, letterSpacing: 1 }}>Shortcuts are ignored while typing in a field.</div>
      </div>
    </div>
  );
}
