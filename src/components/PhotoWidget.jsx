/**
 * PhotoWidget — a little self-contained photo frame / slideshow.
 *
 * Drop it anywhere: <PhotoWidget /> works with zero props (it seeds a few
 * themed placeholder frames so it never renders empty). Pass your own photos
 * with `photos={[{ src, caption }]}`, or just drag image files onto it / use
 * the + button — added photos are kept in localStorage as data URLs so they
 * survive a reload.
 *
 *   <PhotoWidget />
 *   <PhotoWidget title="Recon" interval={6000} height={260}
 *                photos={[{ src: "/x.jpg", caption: "Sector 7" }]} />
 *
 * No backend, no extra deps — matches the APEX HUD look (corner brackets,
 * neon accent, mono telemetry) via @/domain/colors.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";

const STORAGE_KEY = "jarvis.photoWidget.v1";
const MAX_STORED = 12;            // cap persisted photos so we stay under quota
const MAX_BYTES = 3_500_000;      // ~3.5MB of data-URL payload, then stop persisting

// A couple of themed SVG-gradient frames so the widget looks alive on first run.
const seedFrame = (label, a, b) =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>
       <defs>
         <radialGradient id='g' cx='50%' cy='42%' r='70%'>
           <stop offset='0%' stop-color='${a}'/>
           <stop offset='100%' stop-color='${b}'/>
         </radialGradient>
       </defs>
       <rect width='800' height='500' fill='${C.bg}'/>
       <rect width='800' height='500' fill='url(#g)' opacity='0.55'/>
       <circle cx='400' cy='210' r='120' fill='none' stroke='${a}' stroke-width='2' opacity='0.6'/>
       <circle cx='400' cy='210' r='78' fill='none' stroke='${a}' stroke-width='1' opacity='0.4'/>
       <text x='50%' y='440' text-anchor='middle'
             font-family='monospace' font-size='26' letter-spacing='6'
             fill='${a}' opacity='0.85'>${label}</text>
     </svg>`
  );

const DEFAULT_PHOTOS = [
  { src: seedFrame("ARC REACTOR", C.neon, C.bg), caption: "Arc Reactor · idle" },
  { src: seedFrame("ORBITAL", C.blue, C.bg), caption: "Orbital view · 04:22Z" },
  { src: seedFrame("WORKSHOP", C.gold, C.bg), caption: "Workshop · bay 2" },
];

const loadStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) && arr.length ? arr : null;
  } catch {
    return null;
  }
};

const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });

export default function PhotoWidget({
  title = "Photos",
  photos,
  interval = 5000,
  height = 220,
  accent = C.neon,
}) {
  // Source of truth: explicit prop > localStorage > seeded defaults.
  const [items, setItems] = useState(
    () => photos?.length ? photos : loadStored() || DEFAULT_PHOTOS
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const count = items.length;
  const safeIdx = count ? ((idx % count) + count) % count : 0;
  const current = items[safeIdx];

  const go = useCallback((d) => setIdx((i) => i + d), []);
  const jump = useCallback((i) => setIdx(i), []);

  // Only persist user-managed sets (not a controlled `photos` prop, not the seed).
  const controlled = !!photos?.length;
  useEffect(() => {
    if (controlled || items === DEFAULT_PHOTOS) return;
    try {
      const slice = items.slice(0, MAX_STORED);
      const payload = JSON.stringify(slice);
      if (payload.length <= MAX_BYTES) localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      /* quota or serialization issue — widget still works in-memory */
    }
  }, [items, controlled]);

  // Auto-advance.
  useEffect(() => {
    if (!playing || count < 2) return;
    const t = setInterval(() => setIdx((i) => i + 1), Math.max(1500, interval));
    return () => clearInterval(t);
  }, [playing, count, interval]);

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const added = await Promise.all(
      files.map(async (f) => ({ src: await readFileAsDataURL(f), caption: f.name }))
    );
    setItems((prev) => {
      // First real upload replaces the seed set; afterwards we append.
      const base = prev === DEFAULT_PHOTOS ? [] : prev;
      const next = [...base, ...added];
      setIdx(base.length); // jump to the first newly added photo
      return next;
    });
  }, []);

  const removeCurrent = useCallback(() => {
    setItems((prev) => {
      if (prev.length <= 1) {
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        return DEFAULT_PHOTOS;
      }
      const next = prev.filter((_, i) => i !== safeIdx);
      setIdx((i) => Math.min(i, next.length - 1));
      return next;
    });
  }, [safeIdx]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  }, [addFiles]);

  const btn = useMemo(
    () => ({
      background: "rgba(0,0,0,0.45)",
      border: `1px solid ${C.border}`,
      color: C.textB,
      borderRadius: 4,
      cursor: "pointer",
      font: "inherit",
      fontSize: 11,
      lineHeight: 1,
      padding: "5px 8px",
      backdropFilter: "blur(6px)",
    }),
    []
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
        else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        position: "relative",
        width: "100%",
        background: C.panel,
        border: `1px solid ${dragOver ? accent : C.border}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: "'JetBrains Mono','SF Mono',ui-monospace,monospace",
        outline: "none",
        boxShadow: dragOver ? `0 0 0 1px ${accent}55, 0 8px 30px -12px ${accent}` : "none",
        transition: "box-shadow .2s, border-color .2s",
      }}
    >
      {/* header strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: accent }}>
          {title}
        </span>
        <span style={{ fontSize: 8, color: C.text, fontVariantNumeric: "tabular-nums" }}>
          {count ? `${safeIdx + 1} / ${count}` : "0 / 0"}
        </span>
      </div>

      {/* stage */}
      <div style={{ position: "relative", height, background: C.bg }}>
        {items.map((p, i) => (
          <img
            key={`${i}-${typeof p.src === "string" ? p.src.slice(0, 24) : i}`}
            src={p.src}
            alt={p.caption || `photo ${i + 1}`}
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: i === safeIdx ? 1 : 0,
              transition: "opacity .5s ease",
              pointerEvents: "none",
            }}
          />
        ))}

        {/* corner brackets — HUD flourish */}
        {[
          { top: 8, left: 8, bt: 1, bl: 1 },
          { top: 8, right: 8, bt: 1, br: 1 },
          { bottom: 8, left: 8, bb: 1, bl: 1 },
          { bottom: 8, right: 8, bb: 1, br: 1 },
        ].map((c, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              top: c.top,
              left: c.left,
              right: c.right,
              bottom: c.bottom,
              borderTop: c.bt ? `1px solid ${accent}` : "none",
              borderBottom: c.bb ? `1px solid ${accent}` : "none",
              borderLeft: c.bl ? `1px solid ${accent}` : "none",
              borderRight: c.br ? `1px solid ${accent}` : "none",
              opacity: 0.6,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* prev / next */}
        {count > 1 && (
          <>
            <button aria-label="Previous photo" onClick={() => go(-1)}
              style={{ ...btn, position: "absolute", top: "50%", left: 8, transform: "translateY(-50%)", padding: "8px 10px" }}>
              ‹
            </button>
            <button aria-label="Next photo" onClick={() => go(1)}
              style={{ ...btn, position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", padding: "8px 10px" }}>
              ›
            </button>
          </>
        )}

        {/* caption */}
        {current?.caption && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "18px 12px 8px",
              fontSize: 10,
              color: C.textB,
              background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {current.caption}
          </div>
        )}

        {dragOver && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              letterSpacing: 1,
              color: accent,
              background: "rgba(0,0,0,0.55)",
            }}
          >
            ＋ drop image to add
          </div>
        )}
      </div>

      {/* controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 10px",
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <button aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)} style={btn}>
          {playing ? "❚❚" : "►"}
        </button>

        {/* dot indicators */}
        <div style={{ display: "flex", gap: 5, flex: 1, justifyContent: "center", flexWrap: "wrap" }}>
          {items.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to photo ${i + 1}`}
              onClick={() => jump(i)}
              style={{
                width: i === safeIdx ? 16 : 6,
                height: 6,
                padding: 0,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                background: i === safeIdx ? accent : C.border,
                transition: "width .2s, background .2s",
              }}
            />
          ))}
        </div>

        <button aria-label="Add photos" onClick={() => fileRef.current?.click()} style={btn}>＋</button>
        <button aria-label="Remove current photo" onClick={removeCurrent} style={btn}>✕</button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          style={{ display: "none" }}
        />
      </div>
    </div>
  );
}
