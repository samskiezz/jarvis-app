import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// Returns true when the OS "reduce motion" accessibility setting is on.
// CSS can shorten an animation but cannot stop a <video autoPlay loop> from
// playing or a JS flash loop from firing — components use this to NOT start them.
// Mirrors src/hooks/use-mobile.jsx so it matches existing conventions.
export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(QUERY).matches
        : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener("change", onChange);
    setReduced(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
