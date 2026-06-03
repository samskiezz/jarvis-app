import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { resolveAssetForUnit, resolveMapAsset } from '@/lib/assetCatalog';

const RENDER_SIZE = 900; // world units mapped onto the terrain plane
const TEAM_COLORS = { CT: 0x0096d4, T: 0xf07820, AGENT: 0x00c878, INTRUDER: 0xe8203c };
const DEFAULT_COLOR = 0x00c878;
const DEAD_COLOR = 0x803038;

/**
 * Live tactical 3D renderer.
 *
 * The scene/renderer/terrain are built ONCE (rebuilt only when the map or model
 * changes). Streamed unit frames update target positions in a ref; the render
 * loop lerps each mesh toward its target every frame, so an 8 Hz SSE feed turns
 * into continuous, smooth motion instead of a renderer teardown per frame.
 *
 * Tactical layers (bombsites/bomb for counterstrike, objectives + alert level
 * for panopticon) are additive: they render only when the matching props are
 * supplied, and are diffed/lerped against persistent refs the same way units
 * are — no per-frame mesh churn.
 */
export default function LiveTactical3D({
  gameKey = 'counterstrike',
  mapName,
  mapModelUrl,
  units = [],
  bounds = null,
  manifest = {},
  bombsites = null,
  bomb = null,
  objectives = null,
  alertLevel = null,
}) {
  const mountRef = useRef(null);
  const meshesRef = useRef(new Map());   // id -> THREE.Group (capsule + hp bar + tracer)
  const targetsRef = useRef(new Map());  // id -> { x, z, hp, team, aimX, aimY, firing, dead }
  const unitGroupRef = useRef(null);
  const fxGroupRef = useRef(null);       // bombsites / bomb / objectives layer
  const boundsRef = useRef(bounds);
  const bombRef = useRef(null);          // { mesh, state, timer }
  const objMeshesRef = useRef(new Map());
  const siteMeshesRef = useRef(new Map());
  const fogRef = useRef(null);
  const alertRef = useRef(null);

  const project = (u, b) => {
    const bb = b || { minX: -RENDER_SIZE / 2, maxX: RENDER_SIZE / 2, minY: -RENDER_SIZE / 2, maxY: RENDER_SIZE / 2 };
    const nx = (((u.worldX ?? u.x ?? 0) - bb.minX) / Math.max(1, bb.maxX - bb.minX) - 0.5) * RENDER_SIZE;
    const nz = (((u.worldY ?? u.y ?? 0) - bb.minY) / Math.max(1, bb.maxY - bb.minY) - 0.5) * RENDER_SIZE;
    return { x: nx, z: nz };
  };
  // Project a raw world point ({x,y}) -> scene coords using the same bounds math.
  const projectXY = (px, py, b) => project({ worldX: px, worldY: py }, b);
  // Scale a world-space radius into scene units (uses the X axis span).
  const scaleR = (r, b) => {
    const bb = b || { minX: -RENDER_SIZE / 2, maxX: RENDER_SIZE / 2 };
    return Math.max(6, (r / Math.max(1, bb.maxX - bb.minX)) * RENDER_SIZE);
  };

  // ── Build the scene once (rebuild only when map/model changes) ───────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = Math.max(320, mount.clientWidth || 0);
    const h = Math.max(220, mount.clientHeight || 0);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080d);
    const baseFog = new THREE.Fog(0x04080d, 700, 1800);
    scene.fog = baseFog;
    fogRef.current = baseFog;
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

    // Tactical FX layer (bombsites, bomb, objectives). Persistent group; its
    // children are diffed in the per-frame effects below.
    const fxGroup = new THREE.Group();
    scene.add(fxGroup);
    fxGroupRef.current = fxGroup;
    siteMeshesRef.current = new Map();
    objMeshesRef.current = new Map();
    bombRef.current = null;

    // ── Render loop: lerp meshes toward targets + slow orbit ──────────────
    let anim;
    let theta = 0;
    const clock = new THREE.Clock();
    const tmp = new THREE.Vector3();
    const render = () => {
      anim = requestAnimationFrame(render);
      const dt = clock.getDelta();
      const now = clock.elapsedTime;
      theta += 0.0016;
      const radius = RENDER_SIZE * 0.62;
      camera.position.set(Math.sin(theta) * radius, RENDER_SIZE * 0.42, Math.cos(theta) * radius);
      camera.lookAt(0, 0, 0);

      meshesRef.current.forEach((mesh, id) => {
        const t = targetsRef.current.get(id);
        if (!t) return;
        tmp.set(t.x, 9, t.z);
        mesh.position.lerp(tmp, 0.12);
        // Face toward the aim vector (world XY). Fall back to a slow idle spin.
        if (typeof t.aimX === 'number' && typeof t.aimY === 'number' && (t.aimX || t.aimY)) {
          const aim = projectXY(t.aimX, t.aimY, boundsRef.current);
          const dx = aim.x - mesh.position.x;
          const dz = aim.z - mesh.position.z;
          if (dx || dz) mesh.rotation.y = Math.atan2(dx, dz);
        } else {
          mesh.rotation.y += 0.02;
        }
        // Tracer fade.
        const tracer = mesh.userData.tracer;
        if (tracer) {
          mesh.userData.tracerLife = Math.max(0, (mesh.userData.tracerLife || 0) - dt * 4);
          tracer.material.opacity = mesh.userData.tracerLife;
          tracer.visible = mesh.userData.tracerLife > 0.01;
        }
      });

      // Bomb pulse.
      const b = bombRef.current;
      if (b?.mesh) {
        let speed = 2.2;
        if (b.state === 'planted') {
          const tt = typeof b.timer === 'number' ? b.timer : 40;
          speed = 3 + (1 - Math.max(0, Math.min(1, tt / 40))) * 12; // faster as timer -> 0
        } else if (b.state === 'exploded') {
          speed = 22;
        }
        const pulse = 0.5 + 0.5 * Math.sin(now * speed);
        b.mesh.material.emissiveIntensity = 0.4 + pulse * 1.4;
        b.mesh.scale.setScalar(1 + pulse * 0.4);
      }
      // Objective marker breathing.
      objMeshesRef.current.forEach((m) => {
        if (m.userData.contested) m.material.emissiveIntensity = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(now * 6));
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
      siteMeshesRef.current.clear();
      objMeshesRef.current.clear();
      bombRef.current = null;
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
      const hp = typeof u.hp === 'number' ? u.hp : 100;
      const dead = hp <= 0 || u.state === 'dead' || u.state === 'captured';
      targets.set(id, { x, z, hp, team: u.team, aimX: u.aimX, aimY: u.aimY, firing: !!u.firing, dead });

      let mesh = meshes.get(id);
      if (!mesh) {
        const { weapon } = resolveAssetForUnit(u, manifest);
        const col = TEAM_COLORS[u.team] ?? DEFAULT_COLOR;
        // Group holds the body capsule, an HP bar and a reusable tracer line so
        // facing rotation and position lerp apply to the whole unit at once.
        mesh = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.CapsuleGeometry(8, 20, 6, 12),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.35, metalness: 0.1 }),
        );
        body.castShadow = true;
        body.receiveShadow = true;
        mesh.add(body);
        // HP bar sprite (green->red), billboarded above the head.
        const hpMat = new THREE.SpriteMaterial({ color: 0x00c878, depthTest: false, transparent: true });
        const hpBar = new THREE.Sprite(hpMat);
        hpBar.position.set(0, 26, 0);
        hpBar.scale.set(20, 2.5, 1);
        mesh.add(hpBar);
        // Tracer: a thin emissive line pointing forward (+Z), fired by toggling
        // opacity/visibility. Reused every frame — no per-shot allocation.
        const tracerGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 9, 6),
          new THREE.Vector3(0, 9, 220),
        ]);
        const tracer = new THREE.Line(
          tracerGeo,
          new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0 }),
        );
        tracer.visible = false;
        mesh.add(tracer);

        mesh.position.set(x, 9, z); // spawn at target — no slide-in from origin
        mesh.userData = { body, hpBar, tracer, col, tracerLife: 0 };
        if (weapon?.name) mesh.userData.weapon = weapon.name;
        group.add(mesh);
        meshes.set(id, mesh);
      }

      const { body, hpBar } = mesh.userData;
      const baseCol = TEAM_COLORS[u.team] ?? DEFAULT_COLOR;
      if (dead) {
        body.material.color.setHex(DEAD_COLOR);
        body.material.emissive.setHex(DEAD_COLOR);
        body.material.emissiveIntensity = 0.08;
        body.material.opacity = 0.55;
        body.material.transparent = true;
        body.scale.set(1, 0.5, 1);
        hpBar.visible = false;
      } else {
        body.material.color.setHex(baseCol);
        body.material.emissive.setHex(baseCol);
        body.material.emissiveIntensity = 0.12 + 0.4 * Math.max(0, Math.min(1, hp / 100));
        body.material.opacity = 1;
        body.scale.set(1, 1, 1);
        // HP bar: width + color track health.
        const frac = Math.max(0, Math.min(1, hp / 100));
        hpBar.visible = true;
        hpBar.scale.set(4 + 16 * frac, 2.5, 1);
        hpBar.material.color.setHex(frac > 0.5 ? 0x00c878 : frac > 0.25 ? 0xe8a800 : 0xe8203c);
      }
      // Trigger tracer on the frame firing is true.
      if (u.firing && !dead) mesh.userData.tracerLife = 1;
    });

    // remove meshes for units no longer present
    meshes.forEach((mesh, id) => {
      if (seen.has(id)) return;
      group.remove(mesh);
      mesh.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
      });
      meshes.delete(id);
      targets.delete(id);
    });
  }, [units, bounds]);

  // ── Counterstrike: bombsites (ground rings) + bomb marker ────────────────
  useEffect(() => {
    boundsRef.current = bounds;
    const group = fxGroupRef.current;
    if (!group) return;
    const sites = siteMeshesRef.current;
    const seen = new Set();

    (bombsites || []).forEach((s, i) => {
      const id = s.id ?? `site${i}`;
      seen.add(id);
      const { x, z } = projectXY(s.x, s.y, bounds);
      const r = scaleR(s.r ?? 120, bounds);
      let ring = sites.get(id);
      if (!ring) {
        ring = new THREE.Mesh(
          new THREE.RingGeometry(r * 0.86, r, 48),
          new THREE.MeshBasicMaterial({ color: 0xe8203c, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        // Label A/B as a sprite at the center.
        const cv = document.createElement('canvas');
        cv.width = 64; cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#e8203c';
        ctx.font = 'bold 48px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(s.label || (i === 0 ? 'A' : 'B')), 32, 34);
        const tex = new THREE.CanvasTexture(cv);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        label.scale.set(34, 34, 1);
        label.position.y = 14;
        ring.add(label);
        group.add(ring);
        sites.set(id, ring);
      }
      ring.position.set(x, 0.6, z);
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(r * 0.86, r, 48);
    });

    sites.forEach((ring, id) => {
      if (seen.has(id)) return;
      group.remove(ring);
      ring.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            m.map?.dispose?.();
            m.dispose?.();
          });
        }
      });
      sites.delete(id);
    });
  }, [bombsites, bounds]);

  // Bomb marker (held/planted/defused/exploded).
  useEffect(() => {
    boundsRef.current = bounds;
    const group = fxGroupRef.current;
    if (!group) return;
    if (!bomb || !bomb.state) {
      if (bombRef.current?.mesh) {
        group.remove(bombRef.current.mesh);
        bombRef.current.mesh.geometry.dispose();
        bombRef.current.mesh.material.dispose();
        bombRef.current = null;
      }
      return;
    }
    let entry = bombRef.current;
    if (!entry?.mesh) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(11, 0),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 }),
      );
      group.add(mesh);
      entry = { mesh, state: bomb.state, timer: bomb.timer };
      bombRef.current = entry;
    }
    entry.state = bomb.state;
    entry.timer = bomb.timer;
    const stateCol = { held: 0xc8c8c8, planted: 0xe8203c, defused: 0x0096d4, exploded: 0xffaa20 }[bomb.state] || 0xffffff;
    entry.mesh.material.color.setHex(stateCol);
    entry.mesh.material.emissive.setHex(stateCol);
    const { x, z } = projectXY(bomb.x ?? 0, bomb.y ?? 0, bounds);
    entry.mesh.position.set(x, 16, z);
  }, [bomb, bounds]);

  // ── Panopticon: objective markers + alert-level scene tint ───────────────
  useEffect(() => {
    boundsRef.current = bounds;
    const group = fxGroupRef.current;
    if (!group) return;
    const objs = objMeshesRef.current;
    const seen = new Set();
    const stateCol = { secure: 0x00c878, contested: 0xe8a800, breached: 0xe8203c };

    (objectives || []).forEach((o, i) => {
      const id = o.id ?? `obj${i}`;
      seen.add(id);
      const { x, z } = projectXY(o.x, o.y, bounds);
      const col = stateCol[o.state] ?? 0x00c878;
      let m = objs.get(id);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.CylinderGeometry(16, 16, 3, 6),
          new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 }),
        );
        group.add(m);
        objs.set(id, m);
      }
      m.position.set(x, 1.6, z);
      m.material.color.setHex(col);
      m.material.emissive.setHex(col);
      m.userData.contested = o.state === 'contested';
      if (!m.userData.contested) m.material.emissiveIntensity = 0.4;
    });

    objs.forEach((m, id) => {
      if (seen.has(id)) return;
      group.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      objs.delete(id);
    });
  }, [objectives, bounds]);

  // Alert-level scene tint (panopticon). Shift fog color/near as threat rises.
  useEffect(() => {
    alertRef.current = alertLevel;
    const fog = fogRef.current;
    if (!fog) return;
    const tint = { calm: 0x04080d, suspicious: 0x12080a, alarmed: 0x1c0608 }[alertLevel] || 0x04080d;
    fog.color.setHex(tint);
    fog.near = alertLevel === 'alarmed' ? 520 : 700;
  }, [alertLevel]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden' }} />;
}
