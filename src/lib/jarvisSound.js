/**
 * jarvisSound — the JARVIS sonic identity, synthesised at runtime (no audio files).
 *
 * The single biggest thing missing from the app: J.A.R.V.I.S. *sounds*. The Iron
 * Man interface lives on subtle electronic cues — a warm reactor hum, soft blips
 * on every interaction, a rising power-on, alert tones. We generate all of it
 * procedurally with the Web Audio API, so there are no assets to ship and it works
 * offline. Everything is gated behind a user gesture (browsers block audio before
 * one) via unlock().
 *
 * Palette: clean sine/triangle tones in the C–G register, short envelopes, a touch
 * of detune + lowpass for the "holographic" warmth. Tasteful, never annoying —
 * each sound has a function (Jayse Hansen's rule: nothing is mere decoration).
 */

let ctx = null;
let master = null;
let muted = false;
let hum = null; // { osc, gain } ambient reactor hum while "armed"

function ac() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Unlock audio on first user gesture; resumes a suspended context. */
export function unlock() {
  const c = ac();
  if (c && c.state === "suspended") c.resume().catch(() => {});
  return !!c;
}

export function setMuted(m) {
  muted = !!m;
  if (master) master.gain.value = muted ? 0 : 0.5;
}

// One shaped voice: oscillator → gain (ADSR-ish) → optional lowpass → master.
function tone({ freq = 440, type = "sine", t0 = 0, dur = 0.12, gain = 0.18,
                attack = 0.005, release = 0.08, detune = 0, glideTo = null,
                cutoff = 4000 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const start = c.currentTime + t0;
  const osc = c.createOscillator();
  const g = c.createGain();
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = cutoff;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur + release);
  osc.connect(g); g.connect(lp); lp.connect(master);
  osc.start(start);
  osc.stop(start + dur + release + 0.02);
}

// A soft noise burst (whoosh) via a short buffer of filtered noise.
function noise({ t0 = 0, dur = 0.25, gain = 0.06, cutoff = 1200 } = {}) {
  const c = ac();
  if (!c || muted) return;
  const start = c.currentTime + t0;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = gain;
  const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff;
  src.connect(g); g.connect(lp); lp.connect(master);
  src.start(start);
}

// ── the JARVIS sound set ─────────────────────────────────────────────────────────
const SOUNDS = {
  // crisp rising two-note confirm — "online"
  boot() {
    noise({ dur: 0.5, gain: 0.05, cutoff: 900 });
    tone({ freq: 261.6, glideTo: 523.2, dur: 0.5, type: "triangle", gain: 0.16, cutoff: 3000 });
    tone({ freq: 392.0, t0: 0.18, dur: 0.45, type: "sine", gain: 0.12 });
    tone({ freq: 784.0, t0: 0.36, dur: 0.4, type: "sine", gain: 0.1 });
  },
  activate() {
    tone({ freq: 523.2, dur: 0.1, gain: 0.14, type: "triangle" });
    tone({ freq: 784.0, t0: 0.07, dur: 0.12, gain: 0.12 });
  },
  listen() { // soft up-blip — mic open
    tone({ freq: 660, glideTo: 990, dur: 0.1, gain: 0.12, type: "sine" });
  },
  listenEnd() { // down-blip — mic closed
    tone({ freq: 660, glideTo: 440, dur: 0.1, gain: 0.1, type: "sine" });
  },
  think() { // gentle double pulse — processing
    tone({ freq: 587.3, dur: 0.07, gain: 0.08, type: "sine" });
    tone({ freq: 587.3, t0: 0.14, dur: 0.07, gain: 0.06, type: "sine" });
  },
  speak() { // very soft tick before speaking
    tone({ freq: 880, dur: 0.05, gain: 0.05, type: "sine" });
  },
  confirm() {
    tone({ freq: 523.2, dur: 0.08, gain: 0.12 });
    tone({ freq: 659.3, t0: 0.06, dur: 0.1, gain: 0.12 });
    tone({ freq: 784.0, t0: 0.12, dur: 0.12, gain: 0.1 });
  },
  alert() { // two-tone attention
    tone({ freq: 740, dur: 0.12, gain: 0.16, type: "triangle" });
    tone({ freq: 740, t0: 0.18, dur: 0.12, gain: 0.16, type: "triangle" });
  },
  error() {
    tone({ freq: 330, glideTo: 220, dur: 0.22, gain: 0.16, type: "sawtooth", cutoff: 1400 });
  },
  hover() {
    tone({ freq: 1320, dur: 0.03, gain: 0.04, type: "sine" });
  },
  tick() {
    tone({ freq: 1760, dur: 0.02, gain: 0.03, type: "sine" });
  },
};

/** Play a named JARVIS sound. Unknown names are ignored. */
export function play(name) {
  if (!ctx) return;
  const fn = SOUNDS[name];
  if (fn) try { fn(); } catch { /* audio best-effort */ }
}

/** Start/stop the ambient arc-reactor hum (while JARVIS is armed). */
export function setHum(on) {
  if (!on && !hum) return;
  const c = ac();
  if (!c) return;
  if (on && !hum && !muted) {
    const osc = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 280;
    osc.type = "sine"; osc.frequency.value = 60;
    const osc2 = c.createOscillator(); osc2.type = "sine"; osc2.frequency.value = 90; osc2.detune.value = 4;
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.03, c.currentTime + 1.2);
    osc.connect(g); osc2.connect(g); g.connect(lp); lp.connect(master);
    osc.start(); osc2.start();
    hum = { osc, osc2, g };
  } else if (!on && hum) {
    try {
      hum.g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.6);
      hum.osc.stop(c.currentTime + 0.7); hum.osc2.stop(c.currentTime + 0.7);
    } catch { /* noop */ }
    hum = null;
  }
}

export const jarvisSound = { unlock, play, setHum, setMuted };
export default jarvisSound;
