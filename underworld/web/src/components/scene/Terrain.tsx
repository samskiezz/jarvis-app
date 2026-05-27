import { useMemo } from "react";
import * as THREE from "three";
import { useLoader } from "@react-three/fiber";
import { TEXTURE_SETS } from "./assets";

interface Props {
  grid: number[][];
  size: number;
  amplitude: number;
}

export function elevationAt(grid: number[][], nx: number, ny: number): number {
  const cells = grid.length;
  const fx = Math.max(0, Math.min(cells - 1.0001, nx * (cells - 1)));
  const fy = Math.max(0, Math.min(cells - 1.0001, ny * (cells - 1)));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = grid[y0][x0];
  const b = grid[y0][x0 + 1];
  const c = grid[y0 + 1][x0];
  const d = grid[y0 + 1][x0 + 1];
  return (
    a * (1 - tx) * (1 - ty) +
    b * tx * (1 - ty) +
    c * (1 - tx) * ty +
    d * tx * ty
  );
}

function configureTiled(t: THREE.Texture, repeat: number, isColor: boolean): THREE.Texture {
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Splat-mapped multi-texture material — blends 4 PBR layers (sand / grass /
// dirt / rock) using a per-vertex weight attribute. Built on
// MeshStandardMaterial via onBeforeCompile so we keep PBR + shadows + IBL.
function useSplatMaterial(repeat: number) {
  const [sandD, sandN, sandR, grassD, grassN, grassR, dirtD, dirtN, dirtR, rockD, rockN, rockR] =
    useLoader(THREE.TextureLoader, [
      TEXTURE_SETS.sand.diff, TEXTURE_SETS.sand.norm, TEXTURE_SETS.sand.rough,
      TEXTURE_SETS.grass.diff, TEXTURE_SETS.grass.norm, TEXTURE_SETS.grass.rough,
      TEXTURE_SETS.dirt.diff, TEXTURE_SETS.dirt.norm, TEXTURE_SETS.dirt.rough,
      TEXTURE_SETS.rock.diff, TEXTURE_SETS.rock.norm, TEXTURE_SETS.rock.rough,
    ]);

  return useMemo(() => {
    const all = [sandD, sandN, sandR, grassD, grassN, grassR, dirtD, dirtN, dirtR, rockD, rockN, rockR];
    all.forEach((t, i) => configureTiled(t, repeat, i % 3 === 0));

    const mat = new THREE.MeshStandardMaterial({
      // We feed the GPU through the standard map slot so r3f's shader chunks
      // (normal mapping, IBL, shadows) wire up correctly. The map itself is
      // ignored in favour of the splat blend in our injected fragment code.
      map: grassD,
      normalMap: grassN,
      roughnessMap: grassR,
      roughness: 1.0,
      metalness: 0.0,
      envMapIntensity: 0.7,
    });

    const uniforms: Record<string, { value: unknown }> = {
      uSand:    { value: sandD }, uSandN:    { value: sandN }, uSandR:    { value: sandR },
      uGrass:   { value: grassD }, uGrassN:  { value: grassN }, uGrassR:  { value: grassR },
      uDirt:    { value: dirtD }, uDirtN:    { value: dirtN }, uDirtR:    { value: dirtR },
      uRock:    { value: rockD }, uRockN:    { value: rockN }, uRockR:    { value: rockR },
    };

    mat.onBeforeCompile = (shader) => {
      // Make our splat attribute available to the fragment shader.
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute vec4 splat;\nvarying vec4 vSplat;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvSplat = splat;",
        );

      // Replace the default map sample with a 4-way blend.
      Object.assign(shader.uniforms, uniforms);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
            uniform sampler2D uSand;   uniform sampler2D uSandN;   uniform sampler2D uSandR;
            uniform sampler2D uGrass;  uniform sampler2D uGrassN;  uniform sampler2D uGrassR;
            uniform sampler2D uDirt;   uniform sampler2D uDirtN;   uniform sampler2D uDirtR;
            uniform sampler2D uRock;   uniform sampler2D uRockN;   uniform sampler2D uRockR;
            varying vec4 vSplat;`,
        )
        .replace(
          "#include <map_fragment>",
          `vec4 sandC  = texture2D(uSand,  vMapUv);
           vec4 grassC = texture2D(uGrass, vMapUv);
           vec4 dirtC  = texture2D(uDirt,  vMapUv);
           vec4 rockC  = texture2D(uRock,  vMapUv);
           vec4 splatColor =
              sandC  * vSplat.x +
              grassC * vSplat.y +
              dirtC  * vSplat.z +
              rockC  * vSplat.w;
           diffuseColor *= splatColor;`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `vec3 sandNS  = texture2D(uSandN,  vNormalMapUv).xyz * 2.0 - 1.0;
           vec3 grassNS = texture2D(uGrassN, vNormalMapUv).xyz * 2.0 - 1.0;
           vec3 dirtNS  = texture2D(uDirtN,  vNormalMapUv).xyz * 2.0 - 1.0;
           vec3 rockNS  = texture2D(uRockN,  vNormalMapUv).xyz * 2.0 - 1.0;
           vec3 mapN =
             sandNS  * vSplat.x +
             grassNS * vSplat.y +
             dirtNS  * vSplat.z +
             rockNS  * vSplat.w;
           mapN.xy *= normalScale;
           normal = normalize(tbn * mapN);`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          // The default chunk would also declare `float roughnessFactor = roughness;`
          // so we open our own scope to avoid a GLSL redefinition error and
          // multiply the base roughness by the blended layer roughness.
          `float roughnessFactor = roughness;
           {
             float rSand  = texture2D(uSandR,  vRoughnessMapUv).g;
             float rGrass = texture2D(uGrassR, vRoughnessMapUv).g;
             float rDirt  = texture2D(uDirtR,  vRoughnessMapUv).g;
             float rRock  = texture2D(uRockR,  vRoughnessMapUv).g;
             roughnessFactor *=
               rSand  * vSplat.x +
               rGrass * vSplat.y +
               rDirt  * vSplat.z +
               rRock  * vSplat.w;
           }`,
        );
    };
    mat.needsUpdate = true;
    return mat;
  }, [sandD, sandN, sandR, grassD, grassN, grassR, dirtD, dirtN, dirtR, rockD, rockN, rockR, repeat]);
}

// Per-vertex splat weight from elevation. Slope influences rock mix at steeper
// faces, so cliffs read as rock regardless of altitude. Below sand level the
// seabed reads as sand so submerged terrain stays visible under the water.
function splatFor(e: number, slope: number): [number, number, number, number] {
  // Sand only on the water/shore band; everywhere submerged (e<0.42) falls
  // back to full sand so the seabed isn't black when multiplied by the splat
  // colour, but above shore level sand fades quickly to let grass dominate.
  let sand: number;
  if (e < 0.42) sand = 1;
  else if (e < 0.47) sand = (0.47 - e) / 0.05;
  else sand = 0;
  const grass = smoothBand(e, 0.46, 0.66, 0.04);
  const dirt = smoothBand(e, 0.60, 0.80, 0.06);
  let rock = smoothBand(e, 0.74, 1.04, 0.08) + Math.max(0, slope - 0.55) * 1.4;
  rock = Math.min(1.0, rock);
  const sum = sand + grass + dirt + rock + 1e-5;
  return [sand / sum, grass / sum, dirt / sum, rock / sum];
}

function smoothBand(x: number, a: number, b: number, k: number): number {
  // Trapezoidal window — full strength between a+k and b-k, falling off
  // linearly into the k-wide tails.
  if (x < a - k || x > b + k) return 0;
  if (x < a + k) return Math.max(0, (x - (a - k)) / (2 * k));
  if (x > b - k) return Math.max(0, ((b + k) - x) / (2 * k));
  return 1;
}

export default function Terrain({ grid, size, amplitude }: Props) {
  const mat = useSplatMaterial(Math.max(8, Math.round(size / 5)));

  const geom = useMemo(() => {
    const cells = grid.length;
    const segs = (cells - 1) * 2;
    const g = new THREE.PlaneGeometry(size, size, segs, segs);
    g.rotateX(-Math.PI / 2);

    const pos = g.attributes.position as THREE.BufferAttribute;
    const splat = new Float32Array(pos.count * 4);

    // Pass 1: displace each vertex.
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = (x / size) + 0.5;
      const ny = (z / size) + 0.5;
      const e = elevationAt(grid, nx, ny);
      const yWorld = e < 0.42 ? 0 : (e - 0.42) * amplitude;
      pos.setY(i, yWorld);
    }
    g.computeVertexNormals();

    // Pass 2: write the splat weights using both elevation and slope (from
    // the computed normal — flatter ↑ y, steeper ↓ y).
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = (x / size) + 0.5;
      const ny = (z / size) + 0.5;
      const e = elevationAt(grid, nx, ny);
      const slope = 1.0 - Math.abs(nrm.getY(i));
      const [s, gr, d, r] = splatFor(e, slope);
      splat[i * 4 + 0] = s;
      splat[i * 4 + 1] = gr;
      splat[i * 4 + 2] = d;
      splat[i * 4 + 3] = r;
    }
    g.setAttribute("splat", new THREE.BufferAttribute(splat, 4));
    return g;
  }, [grid, size, amplitude]);

  return <mesh geometry={geom} material={mat} receiveShadow />;
}
