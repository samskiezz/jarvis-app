/**
 * ImageBlast — client-side image effect tool.
 *
 * Load an image from a file or URL, render it to a canvas, and apply toggleable
 * pixel-manipulation effects (RGB-split, scanlines, glitch blocks, pixel-sort).
 * Effects re-render from the original ImageData each time so they compose
 * cleanly. The result canvas can be downloaded as a PNG. SSR-guarded.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.red;

const EFFECTS = [
  { key: "rgbSplit", label: "RGB SPLIT" },
  { key: "scanlines", label: "SCANLINES" },
  { key: "glitch", label: "GLITCH BLOCKS" },
  { key: "pixelSort", label: "PIXEL SORT" },
  { key: "invert", label: "INVERT" },
];

// A small placeholder source-image so the canvas is meaningful before upload.
function drawPlaceholder(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#0096d4");
  grad.addColorStop(0.5, "#a855f7");
  grad.addColorStop(1, "#e8203c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(2,5,9,0.55)";
  for (let i = 0; i < 40; i++) {
    ctx.fillRect((i * 53) % w, (i * 71) % h, 30 + (i % 5) * 14, 8);
  }
  ctx.fillStyle = "#e6f2ff";
  ctx.font = "bold 26px monospace";
  ctx.fillText("IMAGE BLAST", w / 2 - 90, h / 2);
  ctx.font = "11px monospace";
  ctx.fillText("load an image to begin", w / 2 - 80, h / 2 + 22);
}

// ── effect implementations (operate on ImageData in place) ──────────────────
function applyInvert(d) {
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

function applyRgbSplit(src, dst, w, h) {
  const off = Math.max(2, Math.round(w * 0.012));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const rx = Math.min(w - 1, x + off);
      const bx = Math.max(0, x - off);
      dst[i] = src[(y * w + rx) * 4];         // R shifted right
      dst[i + 1] = src[i + 1];                 // G stays
      dst[i + 2] = src[(y * w + bx) * 4 + 2];  // B shifted left
      dst[i + 3] = src[i + 3];
    }
  }
}

function applyScanlines(d, w, h) {
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      d[i] *= 0.45;
      d[i + 1] *= 0.45;
      d[i + 2] *= 0.45;
    }
  }
}

function applyGlitch(d, w, h) {
  const bands = 14;
  for (let b = 0; b < bands; b++) {
    const by = ((b * 9301 + 49297) % h);
    const bh = 4 + ((b * 233) % 18);
    const shift = (((b * 65537) % (w / 4)) | 0) - (w / 8);
    for (let y = by; y < Math.min(h, by + bh); y++) {
      const rowStart = y * w * 4;
      const row = d.slice(rowStart, rowStart + w * 4);
      for (let x = 0; x < w; x++) {
        const sx = (x + shift + w) % w;
        const di = rowStart + x * 4;
        const si = sx * 4;
        d[di] = row[si];
        d[di + 1] = row[si + 1];
        d[di + 2] = row[si + 2];
      }
    }
  }
}

function applyPixelSort(d, w, h) {
  // Sort horizontal runs of bright pixels by luminance for a melted-glass look.
  const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const threshold = 110;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const start = x;
      while (x < w && lum((y * w + x) * 4) > threshold) x++;
      const len = x - start;
      if (len > 2) {
        const seg = [];
        for (let k = 0; k < len; k++) {
          const i = (y * w + start + k) * 4;
          seg.push([d[i], d[i + 1], d[i + 2], d[i + 3], 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]]);
        }
        seg.sort((a, b) => a[4] - b[4]);
        for (let k = 0; k < len; k++) {
          const i = (y * w + start + k) * 4;
          d[i] = seg[k][0];
          d[i + 1] = seg[k][1];
          d[i + 2] = seg[k][2];
          d[i + 3] = seg[k][3];
        }
      }
      x++;
    }
  }
}

export default function ImageBlast() {
  const canvasRef = useRef(null);
  const originalRef = useRef(null); // ImageData of the loaded source
  const fileInputRef = useRef(null);
  const [active, setActive] = useState({});
  const [urlInput, setUrlInput] = useState("");
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("");

  // (Re)draw the current effect stack from the original ImageData.
  const render = useCallback(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    const orig = originalRef.current;
    if (!canvas || !orig) return;
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = orig;

    // start from a fresh copy of the original pixels
    const work = new ImageData(new Uint8ClampedArray(orig.data), w, h);
    const d = work.data;

    if (active.rgbSplit) {
      const dst = new Uint8ClampedArray(d.length);
      applyRgbSplit(d, dst, w, h);
      work.data.set(dst);
    }
    if (active.pixelSort) applyPixelSort(d, w, h);
    if (active.glitch) applyGlitch(d, w, h);
    if (active.invert) applyInvert(d);
    if (active.scanlines) applyScanlines(d, w, h);

    ctx.putImageData(work, 0, 0);
  }, [active]);

  // load an HTMLImageElement onto the canvas and capture its ImageData
  const loadImage = useCallback((img) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maxW = 720;
    const scale = Math.min(1, maxW / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    originalRef.current = ctx.getImageData(0, 0, w, h);
    setDims({ w, h });
    setLoaded(true);
    setStatus(`Loaded ${w}×${h}`);
  }, []);

  // initialise with a placeholder so the canvas is never blank
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    drawPlaceholder(ctx, 640, 360);
    originalRef.current = ctx.getImageData(0, 0, 640, 360);
    setDims({ w: 640, h: 360 });
  }, []);

  // re-render whenever the active effects change
  useEffect(() => { render(); }, [render]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("Reading file…");
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => loadImage(img);
      img.onerror = () => setStatus("Could not decode image.");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const onLoadUrl = () => {
    if (!urlInput.trim()) return;
    setStatus("Fetching URL…");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => loadImage(img);
    img.onerror = () => setStatus("Could not load URL (CORS or 404). Try a file upload.");
    img.src = urlInput.trim();
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const a = document.createElement("a");
      a.download = "image-blast.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    } catch {
      setStatus("Download blocked — image is cross-origin tainted. Upload a local file instead.");
    }
  };

  const toggle = (key) => setActive((a) => ({ ...a, [key]: !a[key] }));
  const reset = () => setActive({});
  const activeCount = Object.values(active).filter(Boolean).length;

  const btn = (on, col = ACCENT) => ({
    background: on ? col + "22" : "rgba(0,0,0,0.4)",
    border: `1px solid ${on ? col + "88" : C.border}`,
    color: on ? col : C.textB, fontFamily: "inherit", fontSize: 9, letterSpacing: 1,
    padding: "6px 11px", borderRadius: 4, cursor: "pointer", fontWeight: on ? 700 : 400,
  });

  return (
    <PageShell
      title="IMAGE BLAST"
      subtitle="CLIENT-SIDE IMAGE EFFECT TOOL · CANVAS PIXEL PROCESSING"
      accent={ACCENT}
      actions={
        <button onClick={download} disabled={!loaded && !originalRef.current} style={btn(true, C.neon)}>
          ⬇ DOWNLOAD PNG
        </button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Source" value={loaded ? "LOADED" : "PLACEHOLDER"} accent={loaded ? C.neon : C.gold} />
        <StatTile label="Dimensions" value={dims.w ? `${dims.w}×${dims.h}` : "—"} accent={ACCENT} />
        <StatTile label="Effects On" value={activeCount} accent={C.blue} sub={`${EFFECTS.length} available`} />
        <StatTile label="Pipeline" value="CANVAS 2D" accent={C.purple} sub="getImageData" />
      </Grid>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 14, alignItems: "start" }}>
        <PanelCard title="CANVAS" accent={ACCENT} right={<Badge color={C.blue}>{dims.w}×{dims.h}</Badge>}>
          <div style={{ width: "100%", display: "flex", justifyContent: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: 8, overflow: "auto" }}>
            <canvas ref={canvasRef} style={{ maxWidth: "100%", display: "block", imageRendering: "pixelated" }} />
          </div>
          {status && <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>{status}</div>}
        </PanelCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <PanelCard title="SOURCE" accent={ACCENT}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              style={{ display: "none" }}
            />
            <button onClick={() => fileInputRef.current?.click()} style={{ ...btn(true), width: "100%", marginBottom: 8 }}>
              📁 CHOOSE FILE
            </button>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://image.url/x.png"
                style={{
                  flex: 1, minWidth: 0, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`,
                  borderRadius: 4, color: C.textB, padding: "6px 8px", fontSize: 9, fontFamily: "inherit", outline: "none",
                }}
              />
              <button onClick={onLoadUrl} style={btn(true, C.blue)}>LOAD</button>
            </div>
          </PanelCard>

          <PanelCard
            title="EFFECTS"
            accent={ACCENT}
            right={<button onClick={reset} style={{ ...btn(false), fontSize: 8, padding: "3px 8px" }}>RESET</button>}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {EFFECTS.map((fx) => (
                <button key={fx.key} onClick={() => toggle(fx.key)} style={{ ...btn(!!active[fx.key]), textAlign: "left" }}>
                  {active[fx.key] ? "◉ " : "○ "}{fx.label}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>
              Effects compose top-to-bottom and re-render from the original pixels each toggle.
            </div>
          </PanelCard>
        </div>
      </div>
    </PageShell>
  );
}
