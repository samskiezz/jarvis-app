/**
 * holoCore — the JARVIS holographic rendering engine (the real depth, not bare three).
 *
 * The app's existing three.js is bare: WebGLRenderer({antialias,alpha}) + Phong
 * materials + a 45° camera + no post-processing — so nothing glows. This is the
 * proper pipeline behind an Iron-Man-grade hologram:
 *
 *   RENDERER  WebGLRenderer, high-performance, ACES Filmic tone mapping, sRGB output.
 *   CAMERA    PerspectiveCamera(50°) + OrbitControls with inertial damping.
 *   POST      EffectComposer → RenderPass → UnrealBloomPass (the holographic glow)
 *             → FXAA (ShaderPass) → OutputPass. Bloom on emissive is what sells it.
 *   MATERIAL  holoMaterial(): a Fresnel rim-light + scanline + flicker ShaderMaterial,
 *             AdditiveBlending, depthWrite off — the signature transparent hologram.
 *   ASSETS    loadGLB(): GLTFLoader (+ optional DRACOLoader) so real .glb models
 *             (helmet, reactor, suit) drop straight in and inherit the holo look.
 *
 * Everything is tree-shakeable from `three/examples/jsm/*` (already in node_modules).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

/** Production renderer: ACES tone mapping + sRGB so emissive blooms cleanly. */
export function createRenderer(canvas, { width, height, dpr = Math.min(2, window.devicePixelRatio || 1) }) {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: true, powerPreference: "high-performance",
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

/** PerspectiveCamera + inertial OrbitControls (auto-rotate, damped). */
export function createCamera(renderer, { width, height, fov = 50, z = 4.2 }) {
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 100);
  camera.position.set(0, 0.3, z);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 2.2;
  controls.maxDistance = 8;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  return { camera, controls };
}

/** Post pipeline: bloom (the glow) → FXAA → output. Tuned for holographic emissives. */
export function createComposer(renderer, scene, camera, { width, height,
  bloomStrength = 0.95, bloomRadius = 0.55, bloomThreshold = 0.18 }) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height),
    bloomStrength, bloomRadius, bloomThreshold);
  composer.addPass(bloom);
  const fxaa = new ShaderPass(FXAAShader);
  const dpr = renderer.getPixelRatio();
  fxaa.material.uniforms.resolution.value.set(1 / (width * dpr), 1 / (height * dpr));
  composer.addPass(fxaa);
  composer.addPass(new OutputPass());
  composer.setSize(width, height);
  return { composer, bloom, fxaa };
}

/** The signature hologram material: Fresnel rim + scanlines + flicker, additive. */
export function holoMaterial({ color = "#3ad8ff", power = 2.2, scan = 220, opacity = 0.9 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uPower: { value: power },
      uScan: { value: scan },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vN; varying vec3 vView; varying vec3 vWorld;
      uniform vec3 uColor; uniform float uTime; uniform float uPower;
      uniform float uScan; uniform float uOpacity;
      void main(){
        float fres = pow(1.0 - clamp(dot(normalize(vN), normalize(vView)), 0.0, 1.0), uPower);
        float scan = 0.5 + 0.5 * sin(vWorld.y * uScan - uTime * 6.0);   // moving scanlines
        float flick = 0.92 + 0.08 * sin(uTime * 40.0 + vWorld.x * 10.0); // hologram flicker
        float a = (fres * 0.85 + scan * 0.25) * flick * uOpacity;
        gl_FragColor = vec4(uColor * (fres + 0.35), a);
      }`,
  });
}

/** GLTF/GLB loader with optional Draco decompression (CDN decoder, lazily used). */
export function makeGLBLoader({ dracoDecoderPath = "https://www.gstatic.com/draco/v1/decoders/" } = {}) {
  const loader = new GLTFLoader();
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath(dracoDecoderPath);
    loader.setDRACOLoader(draco);
  } catch { /* draco optional — plain GLB still loads */ }
  return loader;
}

/** A SOLID holographic skin for real GLB models — emissive PBR that reads under
 * bloom (additive Fresnel would make a dense mesh ghostly). Semi-transparent,
 * emissive in the plane colour, with a touch of metalness for the tech sheen. */
export function holoSolidMaterial({ color = "#3ad8ff", emissive = 1.1, opacity = 0.92 } = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: c, emissive: c, emissiveIntensity: emissive,
    metalness: 0.6, roughness: 0.3, transparent: true, opacity,
  });
}

/** Load a .glb and (optionally) reskin its meshes with the holographic material. */
export function loadGLB(url, { holo = true, color = "#3ad8ff", solid = true } = {}) {
  const loader = makeGLBLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => {
      const root = gltf.scene;
      if (holo) {
        const mat = solid ? holoSolidMaterial({ color }) : holoMaterial({ color });
        root.traverse((o) => {
          if (o.isMesh) {
            o.material = mat;
            // a faint wireframe overlay = the "scanned hologram" read
            const wf = new THREE.Mesh(o.geometry,
              new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.12 }));
            o.add(wf);
          }
        });
      }
      // centre + normalise scale so any model frames nicely
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const center = box.getCenter(new THREE.Vector3());
      root.position.sub(center);
      root.scale.setScalar(3.0 / size);
      resolve({ root, gltf });
    }, undefined, reject);
  });
}

export { THREE };
