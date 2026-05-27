import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree, extend } from "@react-three/fiber";
import * as THREE from "three";
// `Water` from the three.js examples is a Reflector-backed mesh with a
// vertex-displacement + sun-strike fragment program — same one most demos use.
import { Water as ThreeWater } from "three/examples/jsm/objects/Water.js";

extend({ Water: ThreeWater });

// React doesn't know about the <water> intrinsic, so declare it once.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      water: any;
    }
  }
}

interface Props {
  size: number;
  sunDirection: [number, number, number];
}

// Shipped locally so the scene doesn't depend on a remote CDN — a network
// stall here would deadlock Suspense and the whole canvas would stay black.
const WATER_NORMAL_URL = "/models/polyhaven/waternormals.jpg";

export default function Water({ size, sunDirection }: Props) {
  const ref = useRef<ThreeWater>(null);
  const gl = useThree((s) => s.gl);
  const normalMap = useLoader(THREE.TextureLoader, WATER_NORMAL_URL);

  useEffect(() => {
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  }, [normalMap]);

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
  }, [normalMap, size]);

  // Sync sun direction on diurnal changes.
  useEffect(() => {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.sunDirection.value.set(...sunDirection).normalize();
  }, [sunDirection, water]);

  useFrame((_, dt) => {
    const u = (water.material as THREE.ShaderMaterial).uniforms;
    u.time.value += dt * 1.0;
  });

  // Mark gl as needing the renderer reference (Water uses it internally for
  // its render-to-texture reflection pass).
  void gl;

  return <primitive ref={ref} object={water} />;
}
