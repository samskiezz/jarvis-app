import { useEffect, useRef, useState } from "react";

/**
 * F19 — Ambient reactor hum toggle.
 * Pure WebAudio synthesis: 60 Hz sawtooth + harmonics + bandpass noise + LFO tremolo.
 * Toggle button at bottom-left strip (left:1012). Voice: "JARVIS, ambient/hum on/off".
 * Listens for `jarvis:ambient-toggle` custom event from JarvisBrain.
 */

const CY = "#29E7FF";

export function isAmbientQuery(q) {
  return /ambient|reactor.?hum|hum.?(on|off)|toggle.?hum|sound.?(on|off)|background.?sound/i.test(q || "");
}

function buildHum(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Fade in smoothly to avoid click
  master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 280;
  lpf.Q.value = 1.4;
  lpf.connect(master);

  // LFO tremolo at 0.7 Hz
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.7;
  lfoGain.gain.value = 0.035;
  lfo.connect(lfoGain);
  lfo.start();

  // 60 Hz sawtooth drone
  const osc1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  osc1.type = "sawtooth";
  osc1.frequency.value = 60;
  g1.gain.value = 0.55;
  lfoGain.connect(g1.gain);
  osc1.connect(g1);
  g1.connect(lpf);
  osc1.start();

  // 120 Hz harmonic
  const osc2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.value = 120;
  g2.gain.value = 0.22;
  osc2.connect(g2);
  g2.connect(lpf);
  osc2.start();

  // 30 Hz sub-bass rumble
  const osc3 = ctx.createOscillator();
  const g3 = ctx.createGain();
  osc3.type = "sine";
  osc3.frequency.value = 30;
  g3.gain.value = 0.28;
  osc3.connect(g3);
  g3.connect(master);
  osc3.start();

  // Bandpass-filtered noise layer
  const bufLen = ctx.sampleRate * 3;
  const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;
  const nbpf = ctx.createBiquadFilter();
  nbpf.type = "bandpass";
  nbpf.frequency.value = 85;
  nbpf.Q.value = 0.9;
  const ng = ctx.createGain();
  ng.gain.value = 0.07;
  noiseSrc.connect(nbpf);
  nbpf.connect(ng);
  ng.connect(master);
  noiseSrc.start();

  return { master, osc1, osc2, osc3, lfo, noiseSrc };
}

export default function AmbientReactorHum() {
  const [active, setActive] = useState(false);
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);

  function teardown() {
    if (!ctxRef.current) return;
    const { master, osc1, osc2, osc3, lfo, noiseSrc } = nodesRef.current || {};
    try {
      // Fade out before stopping
      master?.gain.cancelScheduledValues(ctxRef.current.currentTime);
      master?.gain.linearRampToValueAtTime(0, ctxRef.current.currentTime + 0.6);
    } catch (_) {}
    setTimeout(() => {
      try { osc1?.stop(); osc2?.stop(); osc3?.stop(); lfo?.stop(); noiseSrc?.stop(); } catch (_) {}
      try { ctxRef.current?.close(); } catch (_) {}
      ctxRef.current = null;
      nodesRef.current = null;
    }, 700);
  }

  useEffect(() => {
    if (active) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;
        nodesRef.current = buildHum(ctx);
      } catch (_) {}
    } else {
      teardown();
    }
    return () => {
      if (ctxRef.current) {
        try {
          nodesRef.current?.osc1?.stop(); nodesRef.current?.osc2?.stop();
          nodesRef.current?.osc3?.stop(); nodesRef.current?.lfo?.stop();
          nodesRef.current?.noiseSrc?.stop();
        } catch (_) {}
        try { ctxRef.current.close(); } catch (_) {}
        ctxRef.current = null;
        nodesRef.current = null;
      }
    };
  }, [active]);

  function toggle() {
    setActive(v => !v);
  }

  useEffect(() => {
    const onToggle = () => toggle();
    window.addEventListener("jarvis:ambient-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ambient-toggle", onToggle);
  }, []);

  return (
    <button
      onClick={toggle}
      title={active ? "Ambient reactor hum: ON — click to mute" : "Ambient reactor hum: OFF — click to enable"}
      style={{
        position: "fixed", left: 1012, bottom: 18, zIndex: 68,
        background: active ? `${CY}1A` : "rgba(5,8,13,0.7)",
        border: `1px solid ${active ? CY : "#29E7FF44"}`,
        color: active ? CY : "#29E7FF55",
        borderRadius: 4, padding: "3px 8px", fontSize: 10, letterSpacing: 2,
        cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
        backdropFilter: "blur(6px)",
        boxShadow: active ? `0 0 18px ${CY}44` : "none",
        transition: "all 0.3s ease",
      }}
    >
      {active ? "◈ HUM" : "◇ HUM"}
    </button>
  );
}
