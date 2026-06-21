/**
 * GlobalCommandPalette — makes ⌘K available on every route.
 *
 * The full CommandPalette component is already mounted inside AppLayout for
 * /apex/* routes. This wrapper renders it on all other routes (cinematic home,
 * cinematic scenes, portal) so ⌘K and the "jarvis:open-palette" event work
 * everywhere without double-mounting on the /apex sub-tree.
 */
import { useLocation } from "react-router-dom";
import CommandPalette from "@/components/CommandPalette";

export default function GlobalCommandPalette() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/apex")) return null;
  return <CommandPalette />;
}
