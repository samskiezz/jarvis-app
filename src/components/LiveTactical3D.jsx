import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { resolveAssetForUnit, resolveMapAsset } from '@/lib/assetCatalog';

const RENDER_SIZE = 900; // world units mapped onto the terrain plane
const TEAM_COLORS = { CT: 0x0096d4, T: 0xf07820 };
const DEFAULT_COLOR = 0x00c878;

/**
 * Live tactical 3D renderer.
 *
 * The scene/renderer/terrain are built ONCE (rebuilt only when the map or model
 * changes). Streamed unit frames update target positions in a ref; the render
 * loop lerps each mesh toward its target every frame, so an 8 Hz SSE feed turns
 * into continuous, smooth motion instead of a renderer teardown per frame.
 */
export default function LiveTactical3D({ gameKey = 'counterstrike', mapName, mapModelUrl, units = [], bounds = null, manifest = {} }) {
  const mountRef = useRef(null);
  const meshesRef = useRef(new Map());   // id -> THREE.Mesh
  const targetsRef = useRef(new Map());  // id -> { x, z, hp, team }
  const unitGroupRef = useRef(null);
  const boundsRef = useRef(bounds);

  const project = (u, b) => {
    const bb = b || { minX: -RENDER_SIZE / 2, maxX: RENDER_SIZE / 2, minY: -RENDER_SIZE / 2, maxY: RENDER_SIZE / 2 };
    const nx = (((u.worldX ?? u.x ?? 0) - bb.minX) / Math.max(1, bb.maxX - bb.minX) - 0.5) * RENDER_SIZE;
    const nz = (((u.worldY ?? u.y ?? 0) - bb.minY) / Math.max(1, bb.maxY - bb.minY) - 0.5) * RENDER_SIZE;
    return { x: nx, z: nz };
  };

  // ── Build the scene once (rebuild only when map/model changes) ───────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = Math.max(320, mount.clientWidth || 0);
    const h = Math.max(220, mount.clientHeight || 0);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080d);
    scene.fog = new THREE.Fog(0x04080d, 700, 1800);
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 6000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const dir = new THREE.DirectionalLight(0x88ccff, 1.2);
    dir.position.set(300, 500, 200);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    Object.assign(dir.shadow.camera, { left: -700, right: 700, top: 700, bottom: -700 });
    scene.add(dir);

    const rgbe = new RGBELoader();
    const hdrUrl = import.meta.env.VITE_RENDER_HDRI_URL;
    if (hdrUrl) {
      rgbe.load(hdrUrl, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        scene.environment = tex;
        scene.background = tex;
      });
    }

    // Terrain
    const terrainGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    const loader = new THREE.TextureLoader();
    const grassUrl = import.meta.env.VITE_RENDER_GRASS_ALBEDO_URL;
    const dirtUrl = import.meta.env.VITE_RENDER_DIRT_ALBEDO_URL;
    const grass = grassUrl ? loader.load(grassUrl) : null;
    const dirt = dirtUrl ? loader.load(dirtUrl) : null;
    [grass, dirt].forEach((t) => {
      if (!t) return;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(16, 16);
      t.colorSpace = THREE.SRGBColorSpace;
    });
    const terrain = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({ color: 0x2a3b32, map: grass || dirt || null, roughness: 0.95, metalness: 0 }),
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Faint tactical grid over the play area
    const grid = new THREE.GridHelper(RENDER_SIZE, 24, 0x00c878, 0x0a3326);
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    grid.position.y = 0.2;
    scene.add(grid);

    // Optional GLTF map model
    let mapRoot = null;
    const resolvedMap = resolveMapAsset(gameKey, mapName, manifest);
    const finalMapUrl = mapModelUrl || resolvedMap?.modelUrl || null;
    if (finalMapUrl) {
      new GLTFLoader().load(finalMapUrl, (gltf) => {
        mapRoot = gltf.scene;
        mapRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) child.material.envMapIntensity = 1.0;
          }
        });
        scene.add(mapRoot);
      });
    }

    const unitGroup = new THREE.Group();
    scene.add(unitGroup);
    unitGroupRef.current = unitGroup;
    meshesRef.current = new Map();

    // ── Render loop: lerp meshes toward targets + slow orbit ──────────────
    let anim;
    let theta = 0;
    const tmp = new THREE.Vector3();
    const render = () => {
      anim = requestAnimationFrame(render);
      theta += 0.0016;
      const radius = RENDER_SIZE * 0.62;
      camera.position.set(Math.sin(theta) * radius, RENDER_SIZE * 0.42, Math.cos(theta) * radius);
      camera.lookAt(0, 0, 0);

      meshesRef.current.forEach((mesh, id) => {
        const t = targetsRef.current.get(id);
        if (!t) return;
        tmp.set(t.x, 9, t.z);
        mesh.position.lerp(tmp, 0.12);
        mesh.rotation.y += 0.04;
      });
      renderer.render(scene, camera);
    };
    render();

    const onResize = () => {
      const nw = Math.max(320, mount.clientWidth || 0);
      const nh = Math.max(220, mount.clientHeight || 0);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(anim);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      scene.clear();
      meshesRef.current.clear();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [gameKey, mapName, mapModelUrl]);

  // ── Update targets + add/remove meshes when a new frame arrives ──────────
  useEffect(() => {
    boundsRef.current = bounds;
    const group = unitGroupRef.current;
    if (!group) return;
    const meshes = meshesRef.current;
    const targets = targetsRef.current;
    const seen = new Set();

    units.forEach((u) => {
      const id = u.id;
      if (!id) return;
      seen.add(id);
      const { x, z } = project(u, bounds);
      targets.set(id, { x, z, hp: u.hp, team: u.team });

      let mesh = meshes.get(id);
      if (!mesh) {
        const { weapon } = resolveAssetForUnit(u, manifest);
        const col = TEAM_COLORS[u.team] ?? DEFAULT_COLOR;
        mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(8, 20, 6, 12),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.1 }),
        );
        mesh.position.set(x, 9, z); // spawn at target — no slide-in from origin
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (weapon?.name) mesh.userData.weapon = weapon.name;
        group.add(mesh);
        meshes.set(id, mesh);
      }
      // reflect HP as emissive intensity (dimmer = hurt)
      const hp = typeof u.hp === 'number' ? u.hp : 100;
      mesh.material.emissiveIntensity = 0.12 + 0.4 * Math.max(0, Math.min(1, hp / 100));
    });

    // remove meshes for units no longer present
    meshes.forEach((mesh, id) => {
      if (seen.has(id)) return;
      group.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      meshes.delete(id);
      targets.delete(id);
    });
  }, [units, bounds]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden' }} />;
}
