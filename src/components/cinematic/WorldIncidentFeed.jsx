/**
 * WorldIncidentFeed — F06 Live World Incident Feed.
 * Floating cinematic panel: mini Three.js globe with earthquake pins
 * + scrolling seismic incident list, sourced from /functions/getLiveIntel.
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { getLiveIntel } from "@/api/backendFunctions";
import { earthquakeColor } from "@/domain/colors";

const CY = "#29E7FF";
const OR = "#ff6b35";

function latLngToVec3(lat, lng, r) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function MiniGlobe({ earthquakes }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth || 180;
    const H = mount.clientHeight || 180;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 2.6;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Globe sphere
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x020d18, emissive: 0x001a0a, shininess: 30, transparent: true, opacity: 0.92 })
    );
    scene.add(globe);

    // Atmosphere
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x0044cc, transparent: true, opacity: 0.03, side: THREE.BackSide })
    ));

    // Lat/lng grid
    const gridMat = new THREE.LineBasicMaterial({ color: 0x29E7FF, transparent: true, opacity: 0.06 });
    for (let lat = -80; lat <= 80; lat += 30) {
      const pts = [];
      for (let lng = 0; lng <= 360; lng += 5) pts.push(latLngToVec3(lat, lng - 180, 1.003));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }
    for (let lng = 0; lng < 360; lng += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 3) pts.push(latLngToVec3(lat, lng - 180, 1.003));
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
    }

    // Earthquake pins
    const pinGroup = new THREE.Group();
    (earthquakes || []).forEach(eq => {
      const lat = Number(eq.lat ?? eq.latitude);
      const lng = Number(eq.lng ?? eq.lon ?? eq.longitude);
      const mag = Number(eq.mag);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(mag)) return;

      const pos = latLngToVec3(lat, lng, 1.015);
      const hexColor = mag >= 6 ? 0xff2200 : mag >= 5 ? 0xff8800 : mag >= 4.5 ? 0xffcc00 : 0x88ff88;
      const radius = Math.max(0.012, (mag - 4) * 0.012);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 8, 8),
        new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0.85 })
      );
      dot.position.copy(pos);
      pinGroup.add(dot);

      // Halo ring for significant quakes
      if (mag >= 5) {
        const haloR = radius * 2.2;
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(haloR, haloR * 1.4, 24),
          new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
        );
        halo.position.copy(pos.clone().normalize().multiplyScalar(1.018));
        halo.lookAt(new THREE.Vector3(0, 0, 0));
        pinGroup.add(halo);
      }
    });
    scene.add(pinGroup);

    scene.add(new THREE.AmbientLight(0x223344, 1.4));
    const dir = new THREE.DirectionalLight(0x29E7FF, 0.5);
    dir.position.set(4, 3, 4);
    scene.add(dir);

    let rotY = 0;
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      rotY += 0.004;
      globe.rotation.y = rotY;
      pinGroup.rotation.y = rotY;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [earthquakes]);

  return (
    <div
      ref={mountRef}
      style={{ width: "100%", height: 170, borderRadius: 8, overflow: "hidden", background: "rgba(2,5,10,0.6)" }}
    />
  );
}

function fmtTime(t) {
  if (!t) return "—";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function WorldIncidentFeed() {
  const [open, setOpen] = useState(false);
  const [quakes, setQuakes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const prevCountRef = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLiveIntel({ type: "all" });
      const arr = Array.isArray(res?.earthquakes) ? res.earthquakes : [];
      // Sort by time descending
      arr.sort((a, b) => {
        const ta = typeof a.time === "number" ? a.time : Date.parse(a.time) || 0;
        const tb = typeof b.time === "number" ? b.time : Date.parse(b.time) || 0;
        return tb - ta;
      });
      if (arr.length > prevCountRef.current && prevCountRef.current > 0) {
        setNewCount(arr.length - prevCountRef.current);
        setTimeout(() => setNewCount(0), 5000);
      }
      prevCountRef.current = arr.length;
      setQuakes(arr);
      setLastFetch(new Date());
    } catch (_) {
      // silent — real errors mean the endpoint is down; don't blank UI
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Cinematic: listen for "show incidents" / "world incidents" intent from JarvisBrain
  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "").toLowerCase();
      if (/incident|seismic|quake|earthquake|world feed/.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const significant = quakes.filter(q => Number(q.mag) >= 5);
  const badge = newCount > 0 ? `+${newCount}` : quakes.length > 0 ? quakes.length : null;

  return (
    <>
      {/* Toggle button — bottom-left */}
      <button
        onClick={() => setOpen(v => !v)}
        title="World Incident Feed"
        style={{
          position: "fixed", left: 18, bottom: 18, zIndex: 68,
          background: open ? OR + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${OR}88`, borderRadius: 8,
          color: open ? "#fff" : OR, cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${OR}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)", display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 14 }}>◎</span>
        INCIDENTS
        {badge && (
          <span style={{
            background: OR, color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {badge}
          </span>
        )}
      </button>

      {/* Feed panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(340px,90vw)", maxHeight: "min(560px,75vh)",
          background: "rgba(5,9,16,0.92)", border: `1px solid ${OR}44`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${OR}22`,
          fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${OR}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: OR, boxShadow: `0 0 10px ${OR}`, display: "inline-block",
              animation: loading ? "wipulse 1s ease-in-out infinite" : "none" }} />
            <span style={{ color: OR, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>WORLD INCIDENTS</span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtTime(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878", cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Mini globe */}
          <div style={{ padding: "10px 12px 6px" }}>
            <MiniGlobe earthquakes={quakes} />
            <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "center" }}>
              {[[6, "#ff2200", "M6+"], [5, "#ff8800", "M5+"], [4.5, "#ffcc00", "M4.5+"]].map(([, col, lbl]) => (
                <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, color: col, letterSpacing: 1 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col, display: "inline-block" }} />
                  {lbl}
                </span>
              ))}
            </div>
          </div>

          {/* Stats strip */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${OR}18`, borderBottom: `1px solid ${OR}18`,
            display: "flex", gap: 16,
          }}>
            <span style={{ fontSize: 9, color: "#566878" }}>
              ALL <span style={{ color: CY }}>{quakes.length}</span>
            </span>
            <span style={{ fontSize: 9, color: "#566878" }}>
              M5+ <span style={{ color: "#ff8800" }}>{significant.length}</span>
            </span>
            <span style={{ fontSize: 9, color: "#566878" }}>
              M6+ <span style={{ color: "#ff2200" }}>{quakes.filter(q => Number(q.mag) >= 6).length}</span>
            </span>
          </div>

          {/* Incident scroll list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {quakes.length === 0 && !loading && (
              <div style={{ padding: "20px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                No seismic events on the feed.
              </div>
            )}
            {quakes.slice(0, 50).map((q, i) => {
              const mag = Number(q.mag);
              const col = earthquakeColor(mag);
              const isSig = mag >= 5;
              return (
                <div
                  key={i}
                  style={{
                    padding: "7px 14px", borderBottom: `1px solid rgba(255,107,53,0.07)`,
                    display: "flex", alignItems: "center", gap: 10,
                    background: isSig ? `${col}09` : "transparent",
                  }}
                >
                  <span style={{
                    minWidth: 34, fontSize: 12, fontWeight: 900, color: col,
                    textShadow: isSig ? `0 0 10px ${col}` : "none",
                  }}>
                    {mag.toFixed(1)}
                  </span>
                  <span style={{ flex: 1, fontSize: 9, color: "#8ba3b8", lineHeight: 1.4, letterSpacing: 0.5 }}>
                    {q.place || "Unknown location"}
                  </span>
                  <span style={{ fontSize: 8, color: "#566878", whiteSpace: "nowrap" }}>
                    {fmtTime(q.time)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wipulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
