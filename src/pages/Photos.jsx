/**
 * Photos — a little gallery page built around the reusable PhotoWidget.
 *
 * Two widgets side by side so the page reads as more than one frame: a primary
 * slideshow plus a faster-cycling "recent" frame. Drop image files onto either
 * one (or use the ＋ button) to add your own; they persist via localStorage.
 */
import PhotoWidget from "@/components/PhotoWidget";
import { COLORS as C } from "@/domain/colors";

export default function Photos() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", overflow: "auto", padding: 4 }}>
      <div>
        <div style={{ fontSize: 13, letterSpacing: 2, color: C.textB, fontFamily: "'JetBrains Mono',monospace" }}>
          PHOTOS
        </div>
        <div style={{ fontSize: 10, color: C.text, marginTop: 4 }}>
          Drag image files onto a frame (or use ＋) to add your own · ← → to navigate · space to play/pause
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <PhotoWidget title="Gallery" height={300} interval={5000} accent={C.neon} />
        <PhotoWidget title="Recent" height={300} interval={3500} accent={C.gold} />
      </div>
    </div>
  );
}
