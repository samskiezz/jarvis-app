import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";

// The Underworld hero logo loader: the model starts EXPLODED — every triangle
// scattered and spinning, glowing — and as real assets load (progress 0→100) the
// pieces fly back and "block themselves together" into the finished, textured,
// glowing logo. Driven by the live asset-load progress so it IS the loading bar.

const HERO_URL = "/models/hero/underworld_logo.glb";

/** Split a mesh into its separate PIECES (connected components: each letter,
 *  crystal, tube, minion is its own island) and tag every vertex with its
 *  piece's pivot + a per-piece random offset/spin. Then patch the PBR material
 *  so each piece flies apart and blocks back together as ONE rigid unit, glowing
 *  — keeping the original texture + lighting (textured, layered). */
function prepareExplode(root: THREE.Object3D): { update: (p: number, t: number) => void } {
  const shaders: any[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry as THREE.BufferGeometry;
    const spos = src.attributes.position as THREE.BufferAttribute;
    const vCount = spos.count;
    const idx = src.index ? src.index.array : null;
    const triCount = idx ? idx.length / 3 : vCount / 3;

    // weld vertices by position (Tripo meshes split seams), then union-find the
    // triangles into connected pieces.
    const parent = new Int32Array(vCount);
    for (let i = 0; i < vCount; i++) parent[i] = i;
    const find = (a: number) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    const tooBig = vCount > 2_000_000;     // guard: skip welding on monster meshes
    if (!tooBig) {
      const weld = new Map<string, number>();
      const rep = new Int32Array(vCount);
      for (let i = 0; i < vCount; i++) {
        const k = `${Math.round(spos.getX(i) * 800)}_${Math.round(spos.getY(i) * 800)}_${Math.round(spos.getZ(i) * 800)}`;
        let r = weld.get(k); if (r === undefined) { r = i; weld.set(k, i); }
        rep[i] = r;
      }
      const vi = (t: number, k: number) => (idx ? (idx[t * 3 + k] as number) : t * 3 + k);
      for (let t = 0; t < triCount; t++) {
        const a = rep[vi(t, 0)], b = rep[vi(t, 1)], c = rep[vi(t, 2)];
        union(a, b); union(b, c);
      }
    }

    // per-piece centroid + a deterministic random offset/spin seed
    const sumX = new Map<number, number>(), sumY = new Map<number, number>(),
          sumZ = new Map<number, number>(), cnt = new Map<number, number>();
    const compOf = (v: number) => (tooBig ? Math.floor(v / 3) : find(v));
    for (let i = 0; i < vCount; i++) {
      const cmp = compOf(i);
      sumX.set(cmp, (sumX.get(cmp) || 0) + spos.getX(i));
      sumY.set(cmp, (sumY.get(cmp) || 0) + spos.getY(i));
      sumZ.set(cmp, (sumZ.get(cmp) || 0) + spos.getZ(i));
      cnt.set(cmp, (cnt.get(cmp) || 0) + 1);
    }
    const rand = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

    // de-index so we can attach per-vertex attributes, mapping each new vertex
    // back to its original piece.
    const geo = (src.index ? src.toNonIndexed() : src) as THREE.BufferGeometry;
    const n = (geo.attributes.position as THREE.BufferAttribute).count;
    const piv = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    for (let j = 0; j < n; j++) {
      const orig = idx ? (idx[j] as number) : j;     // new vertex j came from original index
      const cmp = compOf(orig);
      const c = cnt.get(cmp) || 1;
      const px = (sumX.get(cmp) || 0) / c, py = (sumY.get(cmp) || 0) / c, pz = (sumZ.get(cmp) || 0) / c;
      piv[j * 3] = px; piv[j * 3 + 1] = py; piv[j * 3 + 2] = pz;
      rnd[j * 3] = rand(cmp + 1); rnd[j * 3 + 1] = rand(cmp + 17); rnd[j * 3 + 2] = rand(cmp + 91);
    }
    geo.setAttribute("aPivot", new THREE.BufferAttribute(piv, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    mesh.geometry = geo;

    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = { value: 0 };
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader =
        "attribute vec3 aPivot;\nattribute vec3 aRand;\nuniform float uProgress;\nuniform float uTime;\nvarying float vExplode;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float p = clamp(uProgress, 0.0, 1.0);
           float e = 1.0 - p;
           vExplode = e;
           // each PIECE moves as a rigid unit: spin around its own pivot…
           float ang = e * ((aRand.y - 0.5) * 9.0 + uTime * 0.4);
           float s = sin(ang), c = cos(ang);
           vec3 rel = transformed - aPivot;
           rel = vec3(rel.x * c - rel.z * s, rel.y, rel.x * s + rel.z * c);
           // …and flies outward along its own random direction.
           vec3 dir = normalize((aRand * 2.0 - 1.0) + vec3(0.0001));
           float dist = e * (2.2 + aRand.x * 3.0);
           transformed = aPivot + rel + dir * dist;
           transformed.y += e * (aRand.z * 2.0);`
        );
      shader.fragmentShader =
        "varying float vExplode;\n" +
        shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
           // glow harder while scattered, settle to a warm rim glow when assembled
           vec3 glowCol = mix(vec3(0.30, 0.12, 0.55), vec3(0.10, 0.35, 0.55), vExplode);
           totalEmissiveRadiance += glowCol * (0.25 + 0.9 * vExplode);`
        );
      (mat.userData as any).shader = shader;
      shaders.push(mat.userData);
    };
    mat.needsUpdate = true;
  });
  return {
    update: (p: number, t: number) => {
      for (const ud of shaders) {
        const sh = (ud as any).shader;
        if (sh) { sh.uniforms.uProgress.value = p; sh.uniforms.uTime.value = t; }
      }
    },
  };
}

function HeroModel({ progress }: { progress: number }) {
  const { scene } = useGLTF(HERO_URL) as unknown as { scene: THREE.Group };
  const group = useRef<THREE.Group>(null);
  const target = useRef(0);
  const shown = useRef(0);

  const { obj, ctrl } = useMemo(() => {
    const clone = scene.clone(true);
    // centre + scale to a comfortable size
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3(); box.getSize(size);
    const center = new THREE.Vector3(); box.getCenter(center);
    clone.position.sub(center);
    const s = 6 / (Math.max(size.x, size.y, size.z) || 1);
    const wrap = new THREE.Group();
    wrap.scale.setScalar(s);
    wrap.add(clone);
    const ctrl = prepareExplode(clone);
    return { obj: wrap, ctrl };
  }, [scene]);

  useEffect(() => { target.current = Math.max(0, Math.min(1, progress / 100)); }, [progress]);

  useFrame((state, dt) => {
    // ease the shown progress toward the real one (smooth assembly)
    shown.current += (target.current - shown.current) * Math.min(1, dt * 2.5);
    ctrl.update(shown.current, state.clock.elapsedTime);
    if (group.current) group.current.rotation.y += dt * 0.25 * (1.2 - shown.current);
  });

  return <group ref={group}><primitive object={obj} /></group>;
}

function Rig() {
  const { camera } = useThree();
  useEffect(() => { camera.position.set(0, 1.2, 9); camera.lookAt(0, 0, 0); }, [camera]);
  return null;
}

export default function HeroAssembleLoader({ progress }: { progress: number }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 42, near: 0.1, far: 100 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <Rig />
      <color attach="background" args={["#0a0a12"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 8, 6]} intensity={1.2} />
      <pointLight position={[-4, 2, 4]} intensity={2.2} color="#7a3cff" />
      <pointLight position={[4, -1, 3]} intensity={1.8} color="#2bd4ff" />
      <HeroModel progress={progress} />
      <Environment preset="night" />
      <EffectComposer multisampling={4}>
        <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.5} intensity={1.6} radius={0.85} mipmapBlur />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}

useGLTF.preload(HERO_URL);
