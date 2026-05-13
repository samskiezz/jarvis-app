import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { resolveAssetForUnit, resolveMapAsset } from '@/lib/assetCatalog';

export default function LiveTactical3D({ gameKey = 'counterstrike', mapName, mapModelUrl, units = [], manifest = {} }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const w = Math.max(320, mount.clientWidth || 0);
    const h = Math.max(220, mount.clientHeight || 0);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04080d);
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 5000);
    camera.position.set(0, 220, 320);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0x88ccff, 1.2);
    dir.position.set(200, 300, 120);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -400;
    dir.shadow.camera.right = 400;
    dir.shadow.camera.top = 400;
    dir.shadow.camera.bottom = -400;
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

    const terrainGeo = new THREE.PlaneGeometry(1200, 1200, 128, 128);
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
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x5f7050,
      map: grass || dirt || null,
      roughness: 0.95,
      metalness: 0.0,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);

    let mapRoot = null;
    const resolvedMap = resolveMapAsset(gameKey, mapName, manifest);
    const finalMapUrl = mapModelUrl || resolvedMap?.modelUrl || null;
    if (finalMapUrl) {
      const gltfLoader = new GLTFLoader();
      gltfLoader.load(finalMapUrl, (gltf) => {
        mapRoot = gltf.scene;
        mapRoot.scale.setScalar(1);
        mapRoot.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              child.material.envMapIntensity = 1.0;
            }
          }
        });
        scene.add(mapRoot);
      });
    }

    const unitGroup = new THREE.Group();
    scene.add(unitGroup);

    const mkUnit = (u) => {
      const { weapon } = resolveAssetForUnit(u, manifest);
      const geom = new THREE.CapsuleGeometry(3, 8, 4, 8);
      const col = u.team === 'CT' ? 0x0096d4 : u.team === 'T' ? 0xf07820 : 0x00c878;
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, metalness: 0.1 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(u.worldX || 0, 8, u.worldY || 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (weapon?.name) mesh.userData.weapon = weapon.name;
      return mesh;
    };

    units.forEach((u) => unitGroup.add(mkUnit(u)));

    let anim;
    const render = () => {
      anim = requestAnimationFrame(render);
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
      scene.clear();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [mapName, mapModelUrl, JSON.stringify(units)]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden' }} />;
}
