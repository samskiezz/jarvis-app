/**
 * CinematicPalette — makes the ⌘K command palette available on every JARVIS
 * cinematic route (/, /cinematic/*) without duplicating it on /apex routes
 * where AppLayout already mounts CommandPalette.
 *
 * Mounted once in App.jsx alongside JarvisBrain.
 */
import { useLocation } from "react-router-dom";
import CommandPalette from "@/components/CommandPalette";

export default function CinematicPalette() {
  const { pathname } = useLocation();
  // AppLayout already provides CommandPalette on /apex routes — skip there.
  if (pathname.startsWith("/apex")) return null;
  return <CommandPalette />;
}
