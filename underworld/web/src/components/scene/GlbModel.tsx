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
}

// Generic non-skinned GLB loader. Each instance clones the source so it
// gets its own transform and material instance (so we don't share state
// between buildings). Skinned characters use SkeletonUtils.clone separately.
export default function GlbModel({
  url, position, rotation = 0, scale = 1, castShadow = true, receiveShadow = true,
}: Props) {
  const { scene } = useGLTF(url) as unknown as { scene: THREE.Group };
  const cloned = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = castShadow;
        m.receiveShadow = receiveShadow;
      }
    });
    return c;
  }, [scene, castShadow, receiveShadow]);
  return <primitive object={cloned} position={position} rotation={[0, rotation, 0]} scale={scale} />;
}
