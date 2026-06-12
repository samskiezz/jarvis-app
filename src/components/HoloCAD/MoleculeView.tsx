// @ts-nocheck
import { useEffect, useRef } from "react";
import {
  THREE, createRenderer, createCamera, createComposer, holoSolidMaterial,
} from "@/three/holoCore";

const CPK_COLORS: Record<string, string> = {
  H: "#ffffff", He: "#d9ffff", Li: "#cc80ff", Be: "#c2ff00", B: "#ffb5b5",
  C: "#909090", N: "#3050f8", O: "#ff0d0d", F: "#90e050", Ne: "#b3e3f5",
  Na: "#ab5cf2", Mg: "#8aff00", Al: "#bfa6a6", Si: "#f0c8a0", P: "#ff8000",
  S: "#ffff30", Cl: "#1ff01f", Ar: "#80d1e3", K: "#8f40d4", Ca: "#3dff00",
  Fe: "#e06633", Cu: "#c78033", Zn: "#7d80b0", Br: "#a62929", I: "#940094",
};

function getElementColor(el: string): string {
  return CPK_COLORS[el] || CPK_COLORS.C;
}

interface Atom {
  element?: string;
  x: number;
  y: number;
  z: number;
}

interface MoleculeViewProps {
  data: {
    points: Atom[];
    bonds?: number[][];
  };
  autoRotate?: boolean;
  height?: number;
}

export default function MoleculeView({ data, autoRotate = true, height = 480 }: MoleculeViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas || !data?.points) return;
    let W = Math.max(280, wrap.clientWidth), H = Math.max(220, height);

    const renderer = createRenderer(canvas, { width: W, height: H });
    const scene = new THREE.Scene();
    const { camera, controls } = createCamera(renderer, { width: W, height: H, fov: 45, z: 12 });
    controls.autoRotate = autoRotate;
    const { composer, fxaa } = createComposer(renderer, scene, camera, { width: W, height: H });

    const group = new THREE.Group();
    scene.add(group);

    // Atoms
    const atoms = data.points;
    const atomMeshes: THREE.Mesh[] = [];
    atoms.forEach((atom) => {
      const el = atom.element || "C";
      const color = getElementColor(el);
      const radius = el === "H" ? 0.3 : el === "O" ? 0.4 : el === "N" ? 0.4 : 0.5;
      const geo = new THREE.SphereGeometry(radius, 24, 24);
      const mat = holoSolidMaterial({ color, emissive: 0.8, opacity: 0.95 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(atom.x, atom.y, atom.z);
      group.add(mesh);
      atomMeshes.push(mesh);
    });

    // Bonds
    const bonds = data.bonds || [];
    bonds.forEach(([i, j]) => {
      if (i >= atomMeshes.length || j >= atomMeshes.length) return;
      const a = atomMeshes[i].position;
      const b = atomMeshes[j].position;
      const dist = a.distanceTo(b);
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const geo = new THREE.CylinderGeometry(0.08, 0.08, dist, 12);
      const mat = holoSolidMaterial({ color: "#a8bcc8", emissive: 0.4, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3().subVectors(b, a).normalize()
      );
      group.add(mesh);
    });

    // Center the molecule
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    // Lighting
    scene.add(new THREE.AmbientLight(0x404040, 2));
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(5, 5, 5);
    scene.add(dir);

    let raf = 0, alive = true;
    const loop = () => {
      if (!alive) return;
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
  }, [data, autoRotate, height]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height }} />
    </div>
  );
}

export { getElementColor, CPK_COLORS };
