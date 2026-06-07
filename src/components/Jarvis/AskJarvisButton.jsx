/**
 * AskJarvisButton — a small, shared launcher that hands a query to the global
 * JARVIS assistant orb. It dispatches the same `jarvis:ask` window CustomEvent the
 * command palette uses, so the (already-mounted) JarvisAssistant opens and runs the
 * page-aware Llama agent loop. Drop it anywhere; no wiring required.
 *
 * Props:
 *   query  — optional question to ask. If omitted, it just opens the assistant.
 *   label  — optional button text (default "Ask JARVIS").
 */
import { COLORS as C, SHELL as S } from "@/domain/colors";

export default function AskJarvisButton({ query, label = "Ask JARVIS", title, style }) {
  const ask = () =>
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { query: query || "" } }));

  return (
    <button
      type="button"
      onClick={ask}
      title={title || (query ? `Ask JARVIS: ${query}` : "Ask the JARVIS assistant")}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
        border: `1px solid ${S.border}`, borderRadius: S.radius, color: C.neon, cursor: "pointer",
        fontSize: S.fs?.xs ?? 9, letterSpacing: 1, padding: "4px 9px", fontFamily: S.mono,
        whiteSpace: "nowrap", ...style,
      }}
    >
      <span aria-hidden style={{ color: C.neon }}>◎</span>
      <span>{label}</span>
    </button>
  );
}
