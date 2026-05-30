import { useEffect, useMemo } from "react";
import { useFrame, useLoader, extend } from "@react-three/fiber";
import * as THREE from "three";
// `Water` from the three.js examples is a Reflector-backed mesh with a
// vertex-displacement + sun-strike fragment program — same one most demos use.
import { Water as ThreeWater } from "three/examples/jsm/objects/Water.js";

extend({ Water: ThreeWater });

interface Props {
  size: number;
  sunDirection: [number, number, number];
}

// Shipped locally so the scene doesn't depend on a remote CDN — a network
// stall here would deadlock Suspense and the whole canvas would stay black.
const WATER_NORMAL_URL = "/models/polyhaven/waternormals.jpg";

export default function Water({ size, sunDirection }: Props) {
  const normalMap = useLoader(THREE.TextureLoader, WATER_NORMAL_URL);

  useEffect(() => {
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  }, [normalMap]);

  // sunDirection is intentionally not a dep — the diurnal cycle would
  // recreate the Water mesh (and its 512×512 reflection target) every frame.
  // The useEffect below syncs the sun uniform without a rebuild.
  const water = useMemo(() => {
    const geom = new THREE.PlaneGeometry(size * 1.6, size * 1.6);
    const w = new ThreeWater(geom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normalMap,
      sunDirection: new THREE.Vector3(...sunDirection).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x1a4a8a,
      distortionScale: 3.0,
      fog: false,
    });
    w.rotation.x = -Math.PI / 2;
    w.position.y = 0.05;
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalMap, size]);

  // Release the reflection RenderTarget + ShaderMaterial + PlaneGeometry when
  // this Water instance is replaced (size change) or the component unmounts.
  // Without this, every world resize leaks a 512×512 reflection target.
  useEffect(() => {
    return () => {
      water.geometry.dispose();
      const mat = water.material as THREE.ShaderMaterial & {
        uniforms: { tReflectionMap?: { value: THREE.Texture | null } };
      };
      mat.uniforms.tReflectionMap?.value?.dispose?.();
      mat.dispose();
    };
  }, [water]);

  // Sync sun direction on diurnal changes.
  useEffect(() => {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.sunDirection.value.set(...sunDirection).normalize();
  }, [sunDirection, water]);

  useFrame((_, dt) => {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.time.value += dt * 1.0;
  });

  return <primitive object={water} />;
}
