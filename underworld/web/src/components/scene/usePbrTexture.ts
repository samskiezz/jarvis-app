import { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { TEXTURE_SETS } from "./assets";

export type TextureKey = keyof typeof TEXTURE_SETS;

// Load a Polyhaven diffuse/normal/roughness triplet with tiling + sRGB set up.
export function usePbrTexture(key: TextureKey, repeat = 8) {
  const set = TEXTURE_SETS[key];
  const [diff, norm, rough] = useLoader(THREE.TextureLoader, [
    set.diff, set.norm, set.rough,
  ]);

  return useMemo(() => {
    const configure = (t: THREE.Texture, isColor: boolean) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repeat, repeat);
      t.anisotropy = 8;
      if (isColor) t.colorSpace = THREE.SRGBColorSpace;
      else t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return {
      diff:  configure(diff, true),
      norm:  configure(norm, false),
      rough: configure(rough, false),
    };
  }, [diff, norm, rough, repeat]);
}
