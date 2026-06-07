import { useEffect, useRef, useState } from "react";
import {
  THREE, createRenderer, createCamera, createComposer, holoSolidMaterial,
} from "@/three/holoCore";
import { COLORS as C } from "@/domain/colors";

interface TrajectoryViewProps {
  data: {
    points: number[][];
  };
  autoRotate?: boolean;
  height?: number;
}

export default function TrajectoryView({ data, autoRotate = true, height = 480 }: TrajectoryViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeIndex, setTimeIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const animRef = useRef({ isPlaying: true, timeIndex: 0, total: 0 });

  useEffect(() => {
    animRef.current.isPlaying = isPlaying;
    animRef.current.timeIndex = timeIndex;
  }, [isPlaying, timeIndex]);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas || !data?.points || data.points.length < 2) return;
    let W = Math.max(280, wrap.clientWidth), H = Math.max(220, height);
    animRef.current.total = data.points.length;

    const renderer = createRenderer(canvas, { width: W, height: H });
    const scene = new THREE.Scene();
    const { camera, controls } = createCamera(renderer, { width: W, height: H, fov: 50, z: 15 });
    controls.autoRotate = autoRotate;
    const { composer, fxaa } = createComposer(renderer, scene, camera, { width: W, height: H });

    const group = new THREE.Group();
    scene.add(group);

    const pts = data.points.map((p) => new THREE.Vector3(p[0], p[1], p[2] || 0));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, Math.max(pts.length * 4, 64), 0.06, 8, false);
    const tubeMat = holoSolidMaterial({ color: C.neon, emissive: 1.2, opacity: 0.9 });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tube);

    // Start marker
    const startGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const startMat = holoSolidMaterial({ color: "#00ff00", emissive: 1.0, opacity: 0.95 });
    const startMesh = new THREE.Mesh(startGeo, startMat);
    startMesh.position.copy(pts[0]);
    group.add(startMesh);

    // End marker
    const endGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const endMat = holoSolidMaterial({ color: "#ff0000", emissive: 1.0, opacity: 0.95 });
    const endMesh = new THREE.Mesh(endGeo, endMat);
    endMesh.position.copy(pts[pts.length - 1]);
    group.add(endMesh);

    // Moving marker
    const markerGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const markerMat = holoSolidMaterial({ color: C.gold, emissive: 1.2, opacity: 0.95 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    group.add(marker);

    // Center the trajectory
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    scene.add(new THREE.AmbientLight(0x404040, 2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    let raf = 0, alive = true, t0 = performance.now();

    const loop = () => {
      if (!alive) return;
      const elapsed = (performance.now() - t0) / 1000;
      controls.update();

      const anim = animRef.current;
      if (anim.isPlaying) {
        const progress = (elapsed * 0.15) % 1;
        const idx = Math.floor(progress * (anim.total - 1));
        if (idx !== anim.timeIndex) {
          anim.timeIndex = idx;
          setTimeIndex(idx);
        }
        const point = curve.getPointAt(progress);
        marker.position.copy(point).sub(center);
      } else {
        const progress = Math.min(anim.timeIndex / (anim.total - 1), 0.999);
        const point = curve.getPointAt(progress);
        marker.position.copy(point).sub(center);
      }

      composer.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => {
      W = Math.max(280, wrap.clientWidth); H = Math.max(220, height);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      renderer.setSize(W, H, false); composer.setSize(W, H);
      const dpr = renderer.getPixelRatio();
      fxaa.material.uniforms.resolution.value.set(1 / (W * dpr), 1 / (H * dpr));
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(wrap);

    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      controls.dispose(); composer.dispose(); renderer.dispose();
    };
  }, [data, autoRotate, height]);

  const total = data?.points?.length || 0;

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height }} />
      {/* Time scrubber overlay */}
      <div style={{
        position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
        background: "rgba(4,10,18,0.9)", border: `1px solid ${C.border}`, borderRadius: 6,
        padding: "8px 14px", display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={() => setIsPlaying((p) => !p)}
          style={{
            background: "none", border: `1px solid ${C.neon}55`, color: C.neon,
            borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {isPlaying ? "⏸" : "▶"}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(total - 1, 0)}
          value={timeIndex}
          onChange={(e) => { setIsPlaying(false); setTimeIndex(Number(e.target.value)); }}
          style={{ width: 160, accentColor: C.neon }}
        />
        <span style={{ fontSize: 9, color: C.textB, minWidth: 50, textAlign: "right", fontFamily: "inherit" }}>
          {timeIndex + 1} / {total}
        </span>
      </div>
    </div>
  );
}
