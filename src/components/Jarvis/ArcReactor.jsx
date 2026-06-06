/**
 * ArcReactor — the live JARVIS orb: a canvas-rendered arc reactor that breathes
 * and reacts to state, replacing the static SVG. Concentric rotating rings, a
 * glowing core, a radial tick gauge and a reactive pulse — the constant ambient
 * motion that makes the Iron Man interface feel alive (everything animates, always).
 *
 * Props: state ('idle'|'armed'|'listening'|'thinking'|'speaking'), size, level
 * (0..1 audio/ео reactivity), color.
 */
import { useEffect, useRef } from "react";

const STATE_COLOR = {
  idle: "#3aa0ff",
  armed: "#00e0c8",
  listening: "#ff3b6b",
  thinking: "#b18cff",
  speaking: "#ffd166",
};

export default function ArcReactor({ state = "idle", size = 54, level = 0, color }) {
  const ref = useRef(null);
  const stateRef = useRef(state);
  const levelRef = useRef(level);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { levelRef.current = level; }, [level]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = size * dpr;
    cv.width = px; cv.height = px;
    const ctx = cv.getContext("2d");
    let raf = 0, t = 0, alive = true;
    let pulse = 0;

    const draw = () => {
      if (!alive) return;
      t += 0.016;
      const st = stateRef.current;
      const col = color || STATE_COLOR[st] || STATE_COLOR.idle;
      const cx = px / 2, cy = px / 2;
      const R = px * 0.42;
      // breathing + state-driven energy
      const energy = st === "speaking" ? 0.9 : st === "listening" ? 0.8
        : st === "thinking" ? 0.6 : st === "armed" ? 0.4 : 0.22;
      const lvl = levelRef.current || 0;
      const breathe = 0.5 + 0.5 * Math.sin(t * (st === "idle" ? 1.2 : 2.4));
      pulse += (energy + lvl * 0.6 - pulse) * 0.1;

      ctx.clearRect(0, 0, px, px);
      ctx.save();
      ctx.translate(cx, cy);

      // outer glow
      const glow = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.15);
      glow.addColorStop(0, col + "22");
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2); ctx.fill();

      // rotating outer ring with tick gauge
      ctx.rotate(t * 0.3);
      ctx.strokeStyle = col + "cc";
      ctx.lineWidth = dpr;
      const ticks = 48;
      for (let i = 0; i < ticks; i++) {
        const a = (i / ticks) * Math.PI * 2;
        const on = i % 4 === 0;
        const r1 = R * (on ? 0.84 : 0.9), r2 = R * 1.0;
        ctx.globalAlpha = on ? 0.9 : 0.35 + 0.3 * breathe;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
        ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.rotate(-t * 0.3);

      // counter-rotating mid ring (segmented)
      ctx.rotate(-t * 0.5);
      ctx.lineWidth = dpr * 1.6;
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2 + 0.18;
        const a1 = a0 + Math.PI / 3 - 0.36;
        ctx.beginPath();
        ctx.strokeStyle = col + "aa";
        ctx.arc(0, 0, R * 0.7, a0, a1);
        ctx.stroke();
      }
      ctx.rotate(t * 0.5);

      // inner triangle reactor frame (the arc-reactor signature)
      ctx.rotate(t * 0.15);
      ctx.strokeStyle = col;
      ctx.lineWidth = dpr * 1.2;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const r = R * 0.5;
        i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.stroke();
      ctx.rotate(-t * 0.15);
      ctx.globalAlpha = 1;

      // pulsing core
      const coreR = R * (0.28 + 0.12 * pulse + 0.04 * breathe);
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.4, col);
      core.addColorStop(1, col + "00");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, coreR, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [size, color]);

  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />;
}
