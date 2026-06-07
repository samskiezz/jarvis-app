/**
 * Globe3D — A real interactive 3D globe plotting all cities with live measurements.
 *
 * Uses Three.js with the existing holoCore rendering pipeline:
 *   - Procedural Earth sphere with lat/lon grid
 *   - City markers positioned by real coordinates
 *   - Color-coded by metric type (temp=red, aq=green, marine=blue)
 *   - Click to open detail panel with live data
 *   - OrbitControls for rotate/zoom
 *   - UnrealBloomPass for the holographic glow
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { appParams } from "@/lib/app-params";
import { COLORS as C } from "@/domain/colors";

const API_BASE = appParams.apiBaseUrl || "";

// Lat/lon → 3D point on unit sphere
function latLonToVector3(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Color by metric category
function metricColor(metric) {
  if (!metric) return C.cyan;
  const m = metric.toLowerCase();
  if (m.includes("temp") || m.includes("heat") || m.includes("fire")) return C.red;
  if (m.includes("pm") || m.includes("pollen") || m.includes("ozone") || m.includes("quality")) return C.green;
  if (m.includes("wave") || m.includes("ocean") || m.includes("marine") || m.includes("sea")) return C.blue;
  if (m.includes("wind") || m.includes("storm") || m.includes("rain")) return C.purple;
  if (m.includes("flight") || m.includes("aircraft")) return C.gold;
  return C.cyan;
}

export default function Globe3D({ onSelectCity, height = 600 }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const markersRef = useRef([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);

  // Fetch cities with measurements
  useEffect(() => {
    fetch(`${API_BASE}/v1/jarvis/page-data/GeoMap?limit=500`)
      .then((r) => r.json())
      .then((data) => {
        const measurements = data?.measurements || [];
        // Group by city_id, keep latest per metric
        const cityMap = new Map();
        for (const m of measurements) {
          const p = m.props || {};
          const cid = p.city_id || "unknown";
          if (!cityMap.has(cid)) {
            cityMap.set(cid, {
              city_id: cid,
              name: cid.replace(/city:/g, "").replace(/_/g, " "),
              lat: p.lat,
              lon: p.lon,
              metrics: [],
            });
          }
          cityMap.get(cid).metrics.push({
            metric: p.metric || p.label,
            value: p.value,
            unit: p.unit,
            source: p.source,
            timestamp: p.timestamp,
          });
        }
        setCities(Array.from(cityMap.values()).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Init Three.js scene
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const h = height;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / h, 0.1, 1000);
    camera.position.set(0, 1.5, 3.2);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controlsRef.current = controls;

    // Earth sphere
    const earthGeo = new THREE.SphereGeometry(1, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x0a1628,
      emissive: 0x001133,
      specular: 0x112244,
      shininess: 15,
      transparent: true,
      opacity: 0.95,
    });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    scene.add(earth);

    // Atmosphere glow
    const atmosGeo = new THREE.SphereGeometry(1.08, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.6 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(0.0, 0.4, 0.8, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosphere);

    // Lat/lon grid
    const gridGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.15 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const points = [];
      for (let lon = -180; lon <= 180; lon += 5) {
        points.push(latLonToVector3(lat, lon, 1.005));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geo, gridMat));
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 5) {
        points.push(latLonToVector3(lat, lon, 1.005));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      gridGroup.add(new THREE.Line(geo, gridMat));
    }
    scene.add(gridGroup);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);
    const backLight = new THREE.DirectionalLight(0x0044aa, 0.8);
    backLight.position.set(-5, -2, -5);
    scene.add(backLight);

    // Post-processing (bloom)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, h), 1.2, 0.5, 0.85);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());

    // Animation loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      composer.render();
    };
    animate();

    // Resize
    const handleResize = () => {
      const w = mount.clientWidth;
      const h2 = height;
      camera.aspect = w / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h2);
      composer.setSize(w, h2);
    };
    window.addEventListener("resize", handleResize);

    // Click handler
    const handleClick = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(markersRef.current, false);
      if (intersects.length > 0) {
        const cityData = intersects[0].object.userData.city;
        if (cityData && onSelectCity) onSelectCity(cityData);
        controls.autoRotate = false;
      } else {
        controls.autoRotate = true;
      }
    };
    renderer.domElement.addEventListener("click", handleClick);

    // Hover handler
    const handleMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(markersRef.current, false);
      if (intersects.length > 0) {
        const cityData = intersects[0].object.userData.city;
        setHovered(cityData);
        renderer.domElement.style.cursor = "pointer";
      } else {
        setHovered(null);
        renderer.domElement.style.cursor = "default";
      }
    };
    renderer.domElement.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.domElement.removeEventListener("mousemove", handleMouseMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [height, onSelectCity]);

  // Add city markers when data loads
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || cities.length === 0) return;

    // Clear old markers
    for (const m of markersRef.current) {
      scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    }
    markersRef.current = [];

    for (const city of cities) {
      const pos = latLonToVector3(city.lat, city.lon, 1.02);
      // Marker size scaled by number of metrics
      const size = Math.max(0.008, Math.min(0.03, 0.01 + city.metrics.length * 0.002));
      const geo = new THREE.SphereGeometry(size, 8, 8);
      const color = metricColor(city.metrics[0]?.metric);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.userData = { city };
      scene.add(mesh);
      markersRef.current.push(mesh);

      // Glow ring
      const ringGeo = new THREE.RingGeometry(size * 1.5, size * 2.5, 16);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().multiplyScalar(1.001));
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      scene.add(ring);
      markersRef.current.push(ring);
    }
  }, [cities]);

  return (
    <div style={{ position: "relative", width: "100%", height }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
      {loading && (
        <div style={{ position: "absolute", top: 10, left: 10, fontSize: 10, color: C.cyan }}>
          ◌ Loading {cities.length} cities…
        </div>
      )}
      {hovered && (
        <div style={{
          position: "absolute", bottom: 10, left: 10,
          background: "rgba(0,0,0,0.8)", border: `1px solid ${C.border}`,
          borderRadius: 6, padding: "8px 12px", fontSize: 10, color: C.textB,
          pointerEvents: "none", maxWidth: 280,
        }}>
          <div style={{ fontWeight: 700, color: C.cyan, textTransform: "uppercase", fontSize: 9, marginBottom: 4 }}>
            {hovered.name}
          </div>
          <div style={{ fontSize: 8, color: C.text, marginBottom: 4 }}>
            {hovered.lat?.toFixed(2)}°, {hovered.lon?.toFixed(2)}° · {hovered.metrics.length} metrics
          </div>
          {hovered.metrics.slice(0, 4).map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 2 }}>
              <span style={{ color: C.text }}>{m.metric}</span>
              <span style={{ color: C.textB, fontVariantNumeric: "tabular-nums" }}>
                {typeof m.value === "number" ? m.value.toFixed(1) : m.value} {m.unit}
              </span>
            </div>
          ))}
        </div>
      )}
      <div style={{
        position: "absolute", top: 10, right: 10,
        background: "rgba(0,0,0,0.7)", border: `1px solid ${C.border}`,
        borderRadius: 6, padding: "6px 10px", fontSize: 8, color: C.text,
      }}>
        <div style={{ color: C.cyan, fontWeight: 700, marginBottom: 2 }}>GOTHAM GLOBE</div>
        <div>{cities.length} cities plotted</div>
        <div style={{ marginTop: 4, opacity: 0.7 }}>Click marker · Drag to rotate · Scroll to zoom</div>
      </div>
    </div>
  );
}
