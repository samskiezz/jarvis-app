// Underworld loader theme — a generative, looping, CAVERNOUS ambient bed synthesised live with the
// Web Audio API (no audio file, zero licensing). Where the Jarvis loader is bright cyan tech, this
// is the Underworld: deep, mysterious, a buried civilisation stirring awake. A sub drone + a slow
// minor pad, a sparse haunting bell melody, and a distant low "toll" that swells as the world loads.
// Browsers block autoplay until a gesture, so call start() from the portal click.

let ctx = null;
let master = null;
let stopFns = [];
let timers = [];
let started = false;

// A natural-minor (Aeolian) palette rooted on A2=110Hz — wistful, deep, "underworld".
const ROOT = 110;
const hz = (semi) => ROOT * Math.pow(2, semi / 12);
// haunting melody (semitone offsets, A minor pentatonic + a leading tone), sparse + slow.
const MELODY = [12, 15, 19, 15, 12, 10, 7, 10, 12, 19, 22, 19, 15, 12, 10, 7];
// the pad chord bed cycles through Am – F – C – Em (relative-minor colour).
const CHORDS = [
  [-12, 0, 3, 7],    // A minor
  [-16, -4, 0, 5],   // F
  [-9, 0, 4, 7],     // C
  [-5, 2, 7, 11],    // E minor-ish
];

function makeImpulse(c, seconds, decay) {
  const rate = c.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function isPlaying() {
  return !!(ctx && ctx.state === "running");
}

// hooks = { onToll(), onNote(semi), onChord(idx) } — fire ON each audio event so the loader's
// visual scene effects (flashes, glows, pulses) can be TIMED to the music, not just looped.
export async function start(volume = 0.4, hooks = {}) {
  if (started) return;
  started = true;
  const fire = (name, arg) => { try { hooks[name]?.(arg); } catch (_) {} };
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch (_) {} }

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 2.2); // slow fade-in

    // cavernous reverb (long tail = a vast underground space)
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 3.6, 2.6);
    const wet = ctx.createGain(); wet.gain.value = 0.6;
    const dry = ctx.createGain(); dry.gain.value = 0.8;
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(wet); wet.connect(reverb); reverb.connect(ctx.destination);

    // ── 1. SUB DRONE — the depth (two slightly-detuned low oscillators) ──
    [0, 0.12].forEach((detune, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = ROOT / 2;          // A1 ≈ 55Hz
      o.detune.value = detune * 100;
      const g = ctx.createGain(); g.gain.value = i === 0 ? 0.5 : 0.28;
      // slow breathing LFO on the drone gain (the world "breathing")
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.18;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o.connect(g); g.connect(master);
      o.start(); lfo.start();
      stopFns.push(() => { try { o.stop(); lfo.stop(); } catch (_) {} });
    });

    // ── 2. PAD CHORD BED — a slow, evolving minor pad ──
    let chordIdx = 0;
    const playChord = () => {
      if (!ctx) return;
      const chord = CHORDS[chordIdx % CHORDS.length];
      fire("onChord", chordIdx % CHORDS.length);
      chordIdx++;
      const t = ctx.currentTime;
      chord.forEach((semi) => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz(semi);
        const g = ctx.createGain(); g.gain.value = 0.0001;
        g.gain.exponentialRampToValueAtTime(0.08, t + 2.4);     // slow swell
        g.gain.exponentialRampToValueAtTime(0.0001, t + 7.5);   // slow fade
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + 8);
      });
    };
    playChord();
    const chordTimer = setInterval(playChord, 7000);
    timers.push(chordTimer);

    // ── 3. HAUNTING BELL MELODY — sparse sine plucks with long reverb tails ──
    let mi = 0;
    const playNote = () => {
      if (!ctx) return;
      const semi = MELODY[mi % MELODY.length];
      fire("onNote", semi);
      mi++;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(semi);
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.04);     // soft bell attack
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);    // long decay
      // a touch of shimmer one octave up
      const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = hz(semi + 12);
      const g2 = ctx.createGain(); g2.gain.value = 0.0001;
      g2.gain.exponentialRampToValueAtTime(0.05, t + 0.04);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(g); g.connect(master);
      o2.connect(g2); g2.connect(master);
      o.start(t); o.stop(t + 2.4);
      o2.start(t); o2.stop(t + 1.8);
    };
    const melodyTimer = setInterval(playNote, 1500);
    timers.push(melodyTimer);

    // ── 4. THE TOLL — a distant, deep bell that swells in every ~12s (the world waking) ──
    const playToll = () => {
      if (!ctx) return;
      fire("onToll");
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = ROOT / 2;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 6);
    };
    setTimeout(playToll, 1500);
    const tollTimer = setInterval(playToll, 12000);
    timers.push(tollTimer);
  } catch (_) {
    started = false;
  }
}

export function stop(fadeMs = 1000) {
  timers.forEach((t) => clearInterval(t));
  timers = [];
  if (master && ctx) {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fadeMs / 1000);
    } catch (_) {}
  }
  const c = ctx;
  setTimeout(() => {
    stopFns.forEach((fn) => fn());
    stopFns = [];
    try { c && c.close(); } catch (_) {}
  }, fadeMs + 120);
  ctx = null; master = null; started = false;
}
