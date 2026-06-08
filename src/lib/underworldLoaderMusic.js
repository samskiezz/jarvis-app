// Stub for the Underworld loader music module.
// The real WebAudio implementation lives in the UE5/Pixel-Streaming build;
// this stub keeps the APEX frontend compiling and silently no-ops on platforms
// where the audio assets aren't bundled (CI, dev without media files, etc.).

let ctx = null;
let gainNode = null;
let source = null;
let tollTimer = null;
let noteTimer = null;

function getCtx() {
  if (!ctx && typeof AudioContext !== "undefined") {
    try { ctx = new AudioContext(); } catch (_) { /* blocked */ }
  }
  return ctx;
}

export function start(volume = 1, { onToll, onNote } = {}) {
  const ac = getCtx();
  if (!ac) return;
  try {
    gainNode = ac.createGain();
    gainNode.gain.setValueAtTime(volume, ac.currentTime);
    gainNode.connect(ac.destination);

    // Synthetic timing stand-in — fire onToll once at ~1s, onNote every ~1.8s.
    if (onToll) tollTimer = setTimeout(onToll, 1000);
    if (onNote) {
      const fire = () => { onNote(); noteTimer = setTimeout(fire, 1800); };
      noteTimer = setTimeout(fire, 1800);
    }
  } catch (_) { /* no-op in restricted contexts */ }
}

export function stop(fadeMs = 300) {
  clearTimeout(tollTimer);
  clearTimeout(noteTimer);
  if (gainNode && ctx) {
    try {
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
      setTimeout(() => { try { gainNode.disconnect(); } catch (_) {} }, fadeMs + 50);
    } catch (_) { /* no-op */ }
  }
  gainNode = null;
  source = null;
}
