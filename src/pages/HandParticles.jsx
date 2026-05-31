/**
 * HandParticles — interactive neon particle field.
 *
 * A mouse/touch-driven particle simulation on an HTML canvas. Particles are
 * attracted toward (or repelled from) the pointer and trail with a fading
 * composite. The particle count is capped for performance and the rAF loop is
 * cancelled on unmount. SSR-guarded via `typeof window`.
 */
import { useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile, Grid, Badge } from "@/components/PageKit";

const ACCENT = C.red;
const NEON = ["#e8203c", "#a855f7", "#0096d4", "#00c878", "#f07820", "#e8a800"];
const MAX_PARTICLES = 900;

export default function HandParticles() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const stateRef = useRef({ particles: [], pointer: { x: 0, y: 0, active: false }, repel: false, fps: 0 });
  const [count, setCount] = useState(420);
  const [repel, setRepel] = useState(false);
  const [fps, setFps] = useState(0);

  // Keep mode toggle reachable inside the rAF loop without re-subscribing.
  useEffect(() => { stateRef.current.repel = repel; }, [repel]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    const st = stateRef.current;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    const resize = () => {
      W = Math.max(280, wrap.clientWidth);
      H = Math.max(320, wrap.clientHeight);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    st.pointer.x = W / 2;
    st.pointer.y = H / 2;

    const makeParticle = () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: 1 + Math.random() * 2.4,
      color: NEON[(Math.random() * NEON.length) | 0],
    });

    const syncCount = (n) => {
      const target = Math.max(0, Math.min(MAX_PARTICLES, n));
      const arr = st.particles;
      while (arr.length < target) arr.push(makeParticle());
      if (arr.length > target) arr.length = target;
    };
    syncCount(count);
    st.syncCount = syncCount;

    const onResize = () => resize();
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      st.pointer.x = t.clientX - rect.left;
      st.pointer.y = t.clientY - rect.top;
      st.pointer.active = true;
    };
    const onLeave = () => { st.pointer.active = false; };

    window.addEventListener("resize", onResize);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("touchmove", onMove, { passive: true });
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchend", onLeave);

    let raf;
    let frames = 0;
    let lastFpsT = performance.now();

    const step = () => {
      raf = requestAnimationFrame(step);
      // fading trail
      ctx.fillStyle = "rgba(2,5,9,0.22)";
      ctx.fillRect(0, 0, W, H);

      const { x: px, y: py, active } = st.pointer;
      const sign = st.repel ? -1 : 1;
      const arr = st.particles;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (active) {
          const dx = px - p.x;
          const dy = py - p.y;
          const d2 = dx * dx + dy * dy + 60;
          const force = (sign * 220) / d2;
          p.vx += dx * force;
          p.vy += dy * force;
        }
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.x += p.vx;
        p.y += p.vy;
        // wrap edges
        if (p.x < 0) p.x += W; else if (p.x > W) p.x -= W;
        if (p.y < 0) p.y += H; else if (p.y > H) p.y -= H;

        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 6);
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.5 + speed * 0.5;
        ctx.arc(p.x, p.y, p.r + speed * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // pointer glow
      if (active) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, 60);
        g.addColorStop(0, `${st.repel ? "#e8203c" : "#00c878"}55`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, 60, 0, Math.PI * 2);
        ctx.fill();
      }

      frames++;
      const now = performance.now();
      if (now - lastFpsT >= 500) {
        const val = Math.round((frames * 1000) / (now - lastFpsT));
        st.fps = val;
        setFps(val);
        frames = 0;
        lastFpsT = now;
      }
    };
    step();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("touchend", onLeave);
    };
  }, []);

  // Live-adjust particle count without rebuilding the loop.
  useEffect(() => {
    const st = stateRef.current;
    if (st.syncCount) st.syncCount(count);
  }, [count]);

  return (
    <PageShell
      title="HAND PARTICLES"
      subtitle="INTERACTIVE NEON PARTICLE FIELD · MOVE THE POINTER"
      accent={ACCENT}
      actions={
        <button
          onClick={() => setRepel((r) => !r)}
          style={{
            background: repel ? C.red + "22" : C.neon + "1a",
            border: `1px solid ${repel ? C.red + "88" : C.neon + "55"}`,
            color: repel ? C.red : C.neon, fontFamily: "inherit", fontSize: 10, letterSpacing: 1,
            padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontWeight: 700,
          }}
        >{repel ? "✦ REPEL" : "✦ ATTRACT"}</button>
      }
    >
      <Grid min={150} style={{ marginBottom: 14 }}>
        <StatTile label="Particles" value={count} accent={ACCENT} sub={`cap ${MAX_PARTICLES}`} />
        <StatTile label="Mode" value={repel ? "REPEL" : "ATTRACT"} accent={repel ? C.red : C.neon} />
        <StatTile label="FPS" value={fps} accent={fps >= 50 ? C.neon : fps >= 30 ? C.gold : C.red} />
        <StatTile label="Engine" value="CANVAS 2D" accent={C.blue} sub="requestAnimationFrame" />
      </Grid>

      <PanelCard
        title="PARTICLE FIELD"
        accent={ACCENT}
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Badge color={C.blue}>{count} PTS</Badge>
            <input
              type="range"
              min={50}
              max={MAX_PARTICLES}
              step={10}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ width: 160, accentColor: C.red }}
              aria-label="Particle count"
            />
          </div>
        }
      >
        <div ref={wrapRef} style={{ width: "100%", height: 460, border: `1px solid ${C.border}`, borderRadius: 4, overflow: "hidden", background: C.bg }}>
          <canvas ref={canvasRef} style={{ display: "block", touchAction: "none", cursor: "crosshair" }} />
        </div>
        <div style={{ marginTop: 8, fontSize: 8, color: C.text }}>
          Move the pointer over the field to {repel ? "scatter" : "gather"} particles. Drag the slider to adjust density (capped at {MAX_PARTICLES} for performance).
        </div>
      </PanelCard>
    </PageShell>
  );
}
