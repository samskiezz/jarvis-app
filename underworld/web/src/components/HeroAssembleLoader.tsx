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

/** Patch a GLB's PBR materials so each triangle can explode/assemble + glow,
 *  keeping the original texture + lighting (so it reads "textured, layered"). */
function prepareExplode(root: THREE.Object3D): { update: (p: number, t: number) => void } {
  const shaders: any[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // de-index so every triangle is independent, then tag each with its
    // centroid + a random direction/spin (shared by the triangle's 3 verts).
    const geo = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry) as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const n = pos.count;
    const cent = new Float32Array(n * 3);
    const rnd = new Float32Array(n * 3);
    for (let t = 0; t + 2 < n; t += 3) {
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const cz = (pos.getZ(t) + pos.getZ(t + 1) + pos.getZ(t + 2)) / 3;
      const rx = Math.random() * 2 - 1;
      const ry = Math.random();              // lift + spin seed (0..1)
      const rz = Math.random() * 2 - 1;
      for (let k = 0; k < 3; k++) {
        const i = (t + k) * 3;
        cent[i] = cx; cent[i + 1] = cy; cent[i + 2] = cz;
        rnd[i] = rx; rnd[i + 1] = ry; rnd[i + 2] = rz;
      }
    }
    geo.setAttribute("aCentroid", new THREE.BufferAttribute(cent, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rnd, 3));
    mesh.geometry = geo;

    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    mat.transparent = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uProgress = { value: 0 };
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader =
        "attribute vec3 aCentroid;\nattribute vec3 aRand;\nuniform float uProgress;\nuniform float uTime;\nvarying float vExplode;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float p = clamp(uProgress, 0.0, 1.0);
           float e = 1.0 - p;
           vExplode = e;
           vec3 dir = normalize(aRand + vec3(0.0001, 0.0001, 0.0001));
           float dist = e * (2.5 + aRand.x * 2.0);
           float ang = e * (aRand.y * 6.2831 + uTime * 0.6);
           float s = sin(ang), c = cos(ang);
           vec3 rel = transformed - aCentroid;
           rel = vec3(rel.x * c - rel.z * s, rel.y, rel.x * s + rel.z * c);
           transformed = aCentroid + rel + dir * dist;
           transformed.y += e * aRand.z * 1.6;`
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
