import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

interface Props {
  url: string;
  position: [number, number, number];
  /** Desired world-space footprint (the larger of width/depth maps to this). */
  targetSize: number;
  /** Y rotation in radians. */
  rotation?: number;
  /** Override the ground plane the model's base snaps to (defaults to position.y). */
  groundY?: number;
}

// Same emissive-glow heuristic as GlbModel: assets whose name implies they emit
// light get their albedo pushed into emissive so the Bloom pass makes them pop.
const GLOW_RE = /(fx_|glow|crystal|lantern|neon|plasma|energy|hologram|rune|spirit|lumino|orb|core|ember|fire|torch|brazier|reactor|portal|conduit)/i;

/**
 * Wrapper that auto-normalizes an arbitrary-scale Tripo GLB so it fits the
 * world. Tripo models come out at wildly different scales and origins, so we:
 *   1. clone the scene per instance,
 *   2. measure its bounding box,
 *   3. uniform-scale so its largest horizontal extent ~= targetSize,
 *   4. recenter horizontally onto position.x/z and ground-snap so its base
 *      sits at position.y.
 * The outer <group> carries position; the inner <primitive> carries the
 * normalising offset so re-centering is independent of placement.
 */
export default function NormalizedGlb({
  url, position, targetSize, rotation = 0, groundY,
}: Props) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group };

  const { clone, scale, offset } = useMemo(() => {
    const c = scene.clone(true);
    const emissive = GLOW_RE.test(url) ? 0.9 : 0;
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      if (emissive > 0) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const s = mat as THREE.MeshStandardMaterial;
          if (!s || !("emissive" in s)) continue;
          s.emissive = (s.color ? s.color.clone() : new THREE.Color(0xffffff));
          s.emissiveIntensity = emissive;
          if (s.map && "emissiveMap" in s) s.emissiveMap = s.map;
          s.needsUpdate = true;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Footprint-based normalisation: use the larger horizontal extent so the
    // model occupies ~targetSize on the ground regardless of how tall it is.
    const horiz = Math.max(size.x, size.z, size.y * 0.0001);
    let s = horiz > 0 && Number.isFinite(horiz) ? targetSize / horiz : 1;
    if (!Number.isFinite(s) || s <= 0) s = 1;

    // After scaling, recenter horizontally and ground-snap the base to y=0
    // (the outer group then lifts the whole thing to position.y).
    const off: [number, number, number] = [
      -center.x * s,
      -box.min.y * s,
      -center.z * s,
    ];
    return { clone: c, scale: s, offset: off };
  }, [scene, url, targetSize]);

  const base: [number, number, number] = [
    position[0],
    groundY ?? position[1],
    position[2],
  ];

  return (
    <group position={base} rotation={[0, rotation, 0]}>
      <primitive object={clone} position={offset} scale={scale} />
    </group>
  );
}
