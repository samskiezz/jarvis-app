import { useEffect, useRef } from "react";
import * as THREE from "three";

const COUNTRIES = [
  { code:"AU", name:"Australia", flag:"🇦🇺", lat:-33.87, lng:151.21, risk:"LOW", color:"#00c878", riskScore:12, positions:["PSG $180k/wk","Hilts Group","XRP $19k AUD"] },
  { code:"TZ", name:"Tanzania", flag:"🇹🇿", lat:-5.4, lng:38.9, risk:"MEDIUM", color:"#e8a800", riskScore:58, positions:["Pangani 6 acres DD active"] },
  { code:"AE", name:"UAE/Dubai", flag:"🇦🇪", lat:25.20, lng:55.27, risk:"LOW", color:"#00c878", riskScore:18, positions:["IFZA FZCO","Golf Acres Emaar"] },
  { code:"ZZ", name:"Zanzibar", flag:"🌍", lat:-6.16, lng:39.19, risk:"MEDIUM", color:"#e8a800", riskScore:52, positions:["$100M resort anchor"] },
  { code:"CY", name:"Cyprus", flag:"🇨🇾", lat:35.12, lng:33.43, risk:"LOW", color:"#00c878", riskScore:8, positions:["Heritage","Kefalos wedding"] },
  { code:"TH", name:"Thailand", flag:"🇹🇭", lat:15.87, lng:100.99, risk:"LOW", color:"#0096d4", riskScore:10, positions:["Banyan Tree Mar 2026"] },
];

function latLngToVec3(lat, lng, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

export default function Globe3D({ selectedCountry, onSelect, earthquakes }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    camera.position.z = 2.8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Globe
    const globeGeo = new THREE.SphereGeometry(1, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x020d18,
      emissive: 0x001a0a,
      shininess: 40,
      transparent: true,
      opacity: 0.95,
    });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globe);

    // Atmosphere glow
    const atmGeo = new THREE.SphereGeometry(1.06, 64, 64);
    const atmMat = new THREE.MeshPhongMaterial({
      color: 0x00c878,
      transparent: true,
      opacity: 0.04,
      side: THREE.BackSide,
    });
    scene.add(new THREE.Mesh(atmGeo, atmMat));

    // Grid lines (latitude/longitude)
    const gridMat = new THREE.LineBasicMaterial({ color: 0x00c878, transparent: true, opacity: 0.06 });
    for (let lat = -80; lat <= 80; lat += 20) {
      const points = [];
      for (let lng = 0; lng <= 360; lng += 3) {
        points.push(latLngToVec3(lat, lng - 180, 1.005));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
    }
    for (let lng = 0; lng < 360; lng += 20) {
      const points = [];
      for (let lat = -90; lat <= 90; lat += 2) {
        points.push(latLngToVec3(lat, lng - 180, 1.005));
      }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), gridMat));
    }

    // Country markers
    const markerGroup = new THREE.Group();
    COUNTRIES.forEach(c => {
      const pos = latLngToVec3(c.lat, c.lng, 1.015);
      const col = new THREE.Color(c.color);

      // Spike
      const spikeGeo = new THREE.CylinderGeometry(0.004, 0.001, 0.08, 6);
      const spikeMat = new THREE.MeshBasicMaterial({ color: col });
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.copy(pos.clone().normalize().multiplyScalar(1.055));
      spike.lookAt(0, 0, 0);
      spike.rotateX(Math.PI / 2);
      markerGroup.add(spike);

      // Pulse ring
      const ringGeo = new THREE.RingGeometry(0.025, 0.03, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos.clone().normalize().multiplyScalar(1.02));
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      markerGroup.add(ring);

      // Dot
      const dotGeo = new THREE.SphereGeometry(0.012, 12, 12);
      const dotMat = new THREE.MeshBasicMaterial({ color: col });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.copy(pos.clone().normalize().multiplyScalar(1.018));
      dot.userData = { country: c.code };
      markerGroup.add(dot);
    });

    // Earthquake markers
    (earthquakes || []).forEach(eq => {
      const pos = latLngToVec3(eq.lat, eq.lng, 1.02);
      const r = Math.max(0.005, (eq.mag - 4) * 0.005);
      const col = eq.mag >= 6 ? 0xff2200 : eq.mag >= 5 ? 0xff8800 : 0xffcc00;
      const geo = new THREE.SphereGeometry(r, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      markerGroup.add(mesh);
    });

    scene.add(markerGroup);

    // Lighting
    scene.add(new THREE.AmbientLight(0x112233, 1.2));
    const dirLight = new THREE.DirectionalLight(0x00c878, 0.6);
    dirLight.position.set(5, 3, 5);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0x0096d4, 0.3);
    dirLight2.position.set(-5, -3, -2);
    scene.add(dirLight2);

    // Auto-rotate
    let isDragging = false, prevX = 0, prevY = 0;
    let rotX = 0, rotY = 0;

    const onMouseDown = e => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = e => {
      if (!isDragging) return;
      rotY += (e.clientX - prevX) * 0.005;
      rotX += (e.clientY - prevY) * 0.003;
      rotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotX));
      prevX = e.clientX; prevY = e.clientY;
    };

    mount.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (!isDragging) rotY += 0.002;
      globe.rotation.y = rotY;
      globe.rotation.x = rotX;
      markerGroup.rotation.y = rotY;
      markerGroup.rotation.x = rotX;
      renderer.render(scene, camera);
    };
    animate();
    sceneRef.current = { renderer, animId };

    return () => {
      cancelAnimationFrame(animId);
      mount.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [earthquakes]);

  const C = { bg:"#020509", border:"rgba(0,200,120,0.14)", neon:"#00c878", gold:"#e8a800", red:"#e8203c", text:"#566878", textB:"#a8bcc8" };
  const rCol = r => ({LOW:C.neon,MEDIUM:C.gold,HIGH:C.red}[r]||C.text);

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", background:"#010408" }}>
      <div ref={mountRef} style={{ width:"100%", height:"calc(100% - 48px)", cursor:"grab" }} />

      {/* Country strip */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:48, display:"flex", background:"rgba(1,4,8,0.95)", borderTop:`1px solid ${C.border}`, overflowX:"auto" }}>
        {COUNTRIES.map(c => {
          const col = rCol(c.risk);
          const isSel = selectedCountry === c.code;
          return (
            <div key={c.code} onClick={() => onSelect(c.code)}
              style={{ minWidth:80, flex:1, padding:"4px 6px", textAlign:"center", cursor:"pointer", borderRight:`1px solid rgba(0,200,120,0.06)`, background:isSel?col+"18":"transparent", transition:"background 0.2s" }}>
              <div style={{ fontSize:16 }}>{c.flag}</div>
              <div style={{ fontSize:7, color:isSel?col:"#2a3a4a", letterSpacing:1, marginTop:1, fontFamily:"Courier New" }}>{c.name}</div>
              <div style={{ fontSize:6, color:col+"88", fontFamily:"Courier New" }}>{c.risk} · {c.riskScore}</div>
            </div>
          );
        })}
      </div>

      {/* Drag hint */}
      <div style={{ position:"absolute", top:8, right:10, fontSize:7, color:"rgba(0,200,120,0.3)", fontFamily:"Courier New", letterSpacing:1 }}>
        DRAG TO ROTATE · {(earthquakes||[]).length} EQ LIVE
      </div>
    </div>
  );
}