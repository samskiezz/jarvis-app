import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

interface Props {
  url: string;
  position: [number, number, number];
  rotation?: number;
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Force a glow (emissive) look; if omitted it's auto-detected from the url. */
  glow?: number;
}

// Assets whose name implies they emit light — their glow lives in an emissive
// map / the renderer, not the muted albedo. We set emissive on these so the
// Bloom pass actually makes them blaze (the "Avatar" pop on hero pieces).
const GLOW_RE = /(fx_|glow|crystal|lantern|neon|plasma|energy|hologram|rune|spirit|lumino|orb|core|ember|fire|torch|brazier|reactor|portal|conduit)/i;

function glowFor(url: string, glow?: number): number {
  if (typeof glow === "number") return glow;
  return GLOW_RE.test(url) ? 0.9 : 0;
}

// Generic non-skinned GLB loader. Each instance clones the source so it
// gets its own transform and material instance (so we don't share state
// between buildings). Skinned characters use SkeletonUtils.clone separately.
export default function GlbModel({
  url, position, rotation = 0, scale = 1, castShadow = true, receiveShadow = true, glow,
}: Props) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group };
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    const emissive = glowFor(url, glow);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      if (emissive > 0) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const s = mat as THREE.MeshStandardMaterial;
          if (!s || !("emissive" in s)) continue;
          // emit the material's own base colour so the glow matches the look,
          // and let the base colour map drive the emissive intensity per-texel.
          s.emissive = (s.color ? s.color.clone() : new THREE.Color(0xffffff));
          s.emissiveIntensity = emissive;
          if (s.map && "emissiveMap" in s) s.emissiveMap = s.map;
          s.needsUpdate = true;
        }
      }
    });
    return c;
  }, [scene, castShadow, receiveShadow, url, glow]);
  return <primitive object={cloned} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}
