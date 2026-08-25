/**
 * ShowMeRouter — wires ShowMeNavigation into the live jarvis:ask event stream.
 *
 * Registers a capture-phase listener on `jarvis:ask` so it fires BEFORE
 * JarvisBrain and every panel handler (all of which use bubble phase).
 * When the query matches the "show|open|view X" pattern, it:
 *   1. Stops propagation so the raw query never reaches JarvisBrain's agent/chat
 *   2. Re-dispatches jarvis:ask with the normalized query that the target panel
 *      already knows how to handle — no additional endpoints, no mocked data.
 *
 * Additive-only: new file, mounted once in App.jsx. No edits to any existing component.
 */
import { useEffect } from "react";
import { isShowMeQuery, resolveShowMeQuery } from "./ShowMeNavigation";

export default function ShowMeRouter() {
  useEffect(() => {
    function handler(e) {
      const q = e?.detail?.text || e?.detail?.query;
      if (!q) return;
      if (!isShowMeQuery(q)) return;
      // Stop the original event so JarvisBrain doesn't send it to /v1/jarvis/agent/chat
      e.stopImmediatePropagation();
      const normalized = resolveShowMeQuery(q);
      // Guard: don't re-route if normalization returned the original unchanged
      if (!normalized || normalized === q) return;
      window.dispatchEvent(
        new CustomEvent("jarvis:ask", { detail: { text: normalized } })
      );
    }
    // Capture phase: fires before any bubble-phase listeners (JarvisBrain, panels)
    window.addEventListener("jarvis:ask", handler, true);
    return () => window.removeEventListener("jarvis:ask", handler, true);
  }, []);

  return null;
}
