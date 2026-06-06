/**
 * HoloCore — a holographic JARVIS core rendered through the real holoCore engine
 * (ACES renderer + UnrealBloom + Fresnel holo shader + orbit camera). Procedural
 * arc-reactor geometry that genuinely BLOOMS like Iron Man's display; pass `glbUrl`
 * to drop a real .glb model (helmet / reactor / suit) in with the same holo skin.
 */
import { useEffect, useRef } from "react";
import {
  THREE, createRenderer, createCamera, createComposer, holoMaterial, loadGLB,
} from "@/three/holoCore";

export default function HoloCore({ color = "#3ad8ff", glbUrl = null, height = 320 }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    let W = Math.max(280, wrap.clientWidth), H = Math.max(220, height);

    const renderer = createRenderer(canvas, { width: W, height: H });
    const scene = new THREE.Scene();
    const { camera, controls } = createCamera(renderer, { width: W, height: H });
    const { composer, fxaa } = createComposer(renderer, scene, camera, { width: W, height: H });

    const holo = holoMaterial({ color });
    const group = new THREE.Group();
    scene.add(group);

    // wireframe icosahedron core
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.28 }));
    group.add(core);

    // holographic shell (Fresnel rim)
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 2), holo));

    // arc-reactor rings (emissive → bloom)
    const ringMat = new THREE.MeshBasicMaterial({ color });
    [[1.5, 0.012, Math.PI / 2], [1.85, 0.01, Math.PI / 3], [2.15, 0.008, -Math.PI / 4]]
      .forEach(([r, t, rot], i) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 120), ringMat);
        ring.rotation.x = rot; ring.userData.spin = 0.1 + i * 0.06;
        group.add(ring);
      });

    // bright reactor core (the bloom hotspot)
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    group.add(spark);

    // ambient particle field
    const N = 400, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 2.6 + Math.random() * 2.2, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(b) * Math.cos(a);
      pos[i * 3 + 1] = r * Math.sin(b) * Math.sin(a);
      pos[i * 3 + 2] = r * Math.cos(b);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(pg, new THREE.PointsMaterial({ color, size: 0.02, transparent: true, opacity: 0.5 })));

    scene.add(new THREE.AmbientLight(0x223344, 1.0));

    // optional real GLB model
    let glbRoot = null;
    if (glbUrl) {
      loadGLB(glbUrl, { holo: true, color }).then(({ root }) => {
        root.scale.setScalar(1.4); glbRoot = root; group.add(root);
      }).catch(() => {});
    }

    let raf = 0, t0 = performance.now(), alive = true;
    const loop = () => {
      if (!alive) return;
      const t = (performance.now() - t0) / 1000;
      holo.uniforms.uTime.value = t;
      core.rotation.y = t * 0.25; core.rotation.x = t * 0.12;
      group.children.forEach((c) => { if (c.userData.spin) c.rotation.z = t * c.userData.spin; });
      spark.scale.setScalar(1 + 0.08 * Math.sin(t * 3));
      if (glbRoot) glbRoot.rotation.y = t * 0.3;
      controls.update();
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
  }, [color, glbUrl, height]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height }} />
      <div style={{ position: "absolute", top: 8, left: 10, fontFamily: "'JetBrains Mono',monospace",
        fontSize: 8, letterSpacing: 2, color: color + "aa" }}>J.A.R.V.I.S · HOLO CORE · ACES+BLOOM</div>
    </div>
  );
}
