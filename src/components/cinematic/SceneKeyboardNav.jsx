/**
 * SceneKeyboardNav — F04
 * Global keyboard shortcuts for the 10 cinematic scenes:
 *   1–9  → jump to scenes 01–09
 *   0    → jump to scene 10 (System Security Core)
 *   Esc  → return to home selector (/)
 * Ignored when an input, textarea, or select has focus.
 * Shows a brief HUD badge confirming the jump.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CINEMATIC_SCENES } from "@/lib/cinematicSceneRegistry";

const CY = "#29E7FF";
const BADGE_MS = 1600;

const SCENE_MAP = Object.fromEntries(
  CINEMATIC_SCENES.map((s, i) => [String((i + 1) % 10), s])
);

function isTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export default function SceneKeyboardNav() {
  const navigate = useNavigate();
  const [badge, setBadge] = useState(null);
  const timerRef = { current: null };

  const flash = useCallback((label) => {
    setBadge(label);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setBadge(null), BADGE_MS);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (isTyping()) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      if (e.key === "Escape") {
        e.preventDefault();
        flash("→ HOME");
        navigate("/");
        return;
      }

      const scene = SCENE_MAP[e.key];
      if (scene) {
        e.preventDefault();
        flash(`→ ${scene.label.toUpperCase()}`);
        navigate(`/cinematic/${scene.id}`);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, flash]);

  if (!badge) return null;

  return (
    <div style={{
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 9000, pointerEvents: "none",
      background: "rgba(5,8,13,0.88)",
      border: `1px solid ${CY}`,
      borderRadius: 10,
      padding: "14px 28px",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: `0 0 60px ${CY}33`,
      fontFamily: "'JetBrains Mono',monospace",
      fontSize: 14,
      letterSpacing: 3,
      color: CY,
      textShadow: `0 0 16px ${CY}`,
      whiteSpace: "nowrap",
      animation: "skn-fade 0.15s ease-out",
    }}>
      {badge}
      <style>{`
        @keyframes skn-fade {
          from { opacity: 0; transform: translate(-50%, -48%); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </div>
  );
}
