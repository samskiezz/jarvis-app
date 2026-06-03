// Record a <canvas> (the live GPU loader) to a video file the user can download.
// Uses MediaRecorder on the canvas's captureStream — so it captures the REAL
// rendered output (true bloom, glow, full colours), not a CPU approximation.

export interface Recorder {
  stop: () => void;
  readonly mime: string;
}

function pickMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",   // Safari / some Chromium builds → real .mp4
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "video/webm";
}

/** Start recording `canvas`; returns a controller whose stop() finalises and
 *  downloads the file. Auto-stops after `maxMs` as a safety net. */
export function recordCanvas(canvas: HTMLCanvasElement, opts: { fps?: number; maxMs?: number } = {}): Recorder {
  const fps = opts.fps ?? 30;
  const maxMs = opts.maxMs ?? 30000;
  const mime = pickMime();
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `underworld_loader.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  rec.start();
  const timer = window.setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, maxMs);
  return {
    mime,
    stop: () => { window.clearTimeout(timer); if (rec.state !== "inactive") rec.stop(); },
  };
}
