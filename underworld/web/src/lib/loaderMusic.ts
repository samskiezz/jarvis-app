// Generative loader music — a calm, looping ambient theme synthesised live with
// the Web Audio API (no audio file needed, zero licensing risk). Evokes the old
// RuneScape login-screen vibe: a soft pad chord bed with a gentle, slow melody
// over it. If a real track exists at /music/login.(ogg|mp3) it is used instead.
//
// Browsers block autoplay until a user gesture, so call start() from a click.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopFns: Array<() => void> = [];
let htmlAudio: HTMLAudioElement | null = null;

// A pentatonic-ish melody (semitone offsets from A3=220Hz) — wistful, calm.
const MELODY = [0, 7, 5, 9, 12, 9, 7, 5, 4, 7, 0, 5, 7, 12, 9, 7];
const CHORDS: number[][] = [
  [-12, 0, 4, 7],   // A
  [-7, 0, 5, 9],    // D-ish
  [-5, 2, 7, 11],   // E-ish
  [-12, 0, 4, 7],   // A
];

const hz = (semi: number) => 220 * Math.pow(2, semi / 12);

export function isPlaying(): boolean {
  return !!(ctx && ctx.state === "running") || !!(htmlAudio && !htmlAudio.paused);
}

export async function start(volume = 0.35): Promise<void> {
  if (isPlaying()) return;

  // Prefer a real track if one was dropped in (looped, like a game theme).
  try {
    const probe = await fetch("/music/login.ogg", { method: "HEAD" });
    const url = probe.ok ? "/music/login.ogg" : "/music/login.mp3";
    const head2 = probe.ok ? probe : await fetch(url, { method: "HEAD" });
    if (head2.ok) {
      htmlAudio = new Audio(url);
      htmlAudio.loop = true;
      htmlAudio.volume = volume;
      await htmlAudio.play();
      return;
    }
  } catch {
    /* fall through to synthesis */
  }

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 2.6, 2.2);
  const wet = ctx.createGain(); wet.gain.value = 0.5;
  master.connect(ctx.destination);
  master.connect(wet); wet.connect(reverb); reverb.connect(ctx.destination);

  const beat = 0.5; // seconds per step (slow, ~120 half-time)
  let step = 0;
  const timer = setInterval(() => {
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    // pad chord every 4 steps
    if (step % 4 === 0) {
      const chord = CHORDS[(step / 4) % CHORDS.length];
      chord.forEach((semi) => pad(ctx!, master!, hz(semi), t, beat * 4));
    }
    // melody note
    const note = MELODY[step % MELODY.length];
    pluck(ctx, master, hz(note + 12), t, beat * 0.9);
    step++;
  }, beat * 1000);
  stopFns.push(() => clearInterval(timer));
}

export function stop(fadeMs = 800): void {
  if (htmlAudio) {
    const a = htmlAudio; htmlAudio = null;
    const t0 = a.volume; const start = performance.now();
    const fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / fadeMs);
      a.volume = t0 * (1 - k);
      if (k >= 1) { clearInterval(fade); a.pause(); }
    }, 40);
  }
  if (ctx && master) {
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + fadeMs / 1000);
    const c = ctx; setTimeout(() => c.close().catch(() => {}), fadeMs + 100);
  }
  stopFns.forEach((f) => f()); stopFns = []; ctx = null; master = null;
}

function pad(ac: AudioContext, out: GainNode, freq: number, t: number, dur: number) {
  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const o2 = ac.createOscillator(); o2.type = "triangle"; o2.frequency.value = freq * 1.005;
  const g = ac.createGain(); g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12, t + dur * 0.3);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); o2.connect(g); g.connect(out);
  o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
}

function pluck(ac: AudioContext, out: GainNode, freq: number, t: number, dur: number) {
  const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = freq;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + dur);
}

function makeImpulse(ac: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ac.sampleRate; const len = rate * seconds;
  const buf = ac.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
