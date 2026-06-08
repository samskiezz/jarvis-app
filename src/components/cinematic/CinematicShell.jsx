import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { CINEMATIC_SCENES, SCENE_BY_ID } from "@/lib/cinematicSceneRegistry";
import { fetchScene, fetchBrain } from "@/api/cinematicDataAdapters";
import JarvisLoader from "./JarvisLoader";

/**
 * CinematicShell — the render-locked immersive scene surface.
 *
 * Until the RTX stream (UE5 Pixel Streaming) is wired (VITE_STREAM_URL), this
 * shows the LOCKED TARGET RENDER as the full-bleed backdrop and routes the live,
 * server-hydrated anchor data into the layout zones (left dock, hero caption,
 * right stack, bottom command). When VITE_STREAM_URL is set it embeds the stream
 * instead and feeds the same data. No Three.js — this is the stream/control shell.
 */

const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
const STREAM_URL = env.VITE_STREAM_URL || "";

const CY = "#29E7FF";
const GREEN = "#29F0A0";
const AMBER = "#FFB020";
const BG = "#05080D";
const PANEL = "rgba(14,27,42,0.62)";
const EDGE = "rgba(41,231,255,0.35)";
const TEXT = "#DCEBF5";
const MUTED = "#6E8AA0";

function zoneOf(anchor) {
  const p = anchor.split(".")[0];
  if (p === "left") return "left";
  if (p === "right") return "right";
  if (p === "hero" || p === "center" || p === "floor") return "hero";
  if (p === "status") return "status";
  return "bottom";
}

function Badge({ children, color }) {
  return (
    <span style={{ fontSize: 9, letterSpacing: 1, color: color || MUTED, border: `1px solid ${color || EDGE}`,
      borderRadius: 3, padding: "1px 5px", textTransform: "uppercase" }}>{children}</span>
  );
}

function summarize(value) {
  if (value == null) return "—";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") {
    if (value.status === "acquiring") return null; // handled by caller
    if (value.control) return null;
    const nums = Object.entries(value).filter(([, v]) => typeof v === "number");
    if (nums.length) return nums.map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString() : v}`).join("  ·  ");
    const keys = Object.keys(value).slice(0, 3);
    return keys.length ? keys.join(", ") : "ok";
  }
  return String(value).slice(0, 80);
}

function AnchorCard({ name, value }) {
  const acquiring = value && typeof value === "object" && value.status === "acquiring";
  const isCtrl = value && typeof value === "object" && value.control;
  const label = name.split(".").slice(1).join(".").replace(/_/g, " ");
  return (
    <div style={{ background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 6, padding: "8px 10px",
      backdropFilter: "blur(6px)", boxShadow: `0 0 18px rgba(41,231,255,0.08)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: 1.5, color: CY, textTransform: "uppercase" }}>{label}</span>
        {acquiring && <Badge color={AMBER}>◌ acquiring</Badge>}
        {isCtrl && <Badge color={MUTED}>control</Badge>}
      </div>
      <div style={{ fontSize: 11, color: TEXT, marginTop: 4, fontFamily: "'JetBrains Mono',monospace" }}>
        {acquiring
          ? <span style={{ color: AMBER }}>scraping: {value.topic}</span>
          : isCtrl
            ? <span style={{ color: MUTED }}>{value.control} · {(value.options || value.variables || value.countries || []).slice(0, 4).join(", ")}</span>
            : summarize(value)}
      </div>
    </div>
  );
}

export default function CinematicShell() {
  const { sceneId } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const context = sp.get("context");
  const scene = SCENE_BY_ID[sceneId] || CINEMATIC_SCENES[0];

  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [now, setNow] = useState("");
  const [brain, setBrain] = useState(null);
  const [ready, setReady] = useState(false);
  const [streamReady, setStreamReady] = useState(!STREAM_URL);
  const [mediaDone, setMediaDone] = useState(false);   // the loader video + music have played in FULL
  const cmdRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchBrain().then((b) => { if (alive) setBrain(b); }).catch(() => {});
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => fetchScene(scene.id, context)
      .then((d) => { if (alive) { setData(d); setErr(null); } })
      .catch((e) => { if (alive) setErr(String(e)); });
    load();
    const t = setInterval(load, 12000);
    return () => { alive = false; clearInterval(t); };
  }, [scene.id, context]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(t);
  }, []);

  // Reveal the scene ONLY once the data + stream are ready AND the loader's video + music have
  // played in FULL (mediaDone). This is what stops the intro from cutting short — the bootloader
  // always finishes, with its action-synced audio, before JARVIS appears.
  useEffect(() => {
    if (data && streamReady && mediaDone && !ready) {
      const t = setTimeout(() => setReady(true), 400);
      return () => clearTimeout(t);
    }
  }, [data, streamReady, mediaDone, ready]);

  const anchors = data?.anchors || {};
  const zones = useMemo(() => {
    const z = { left: [], right: [], hero: [], status: [], bottom: [] };
    for (const [k, v] of Object.entries(anchors)) {
      if (k.startsWith("_")) continue;
      z[zoneOf(k)].push([k, v]);
    }
    return z;
  }, [data]);

  const health = data?.health;

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: TEXT, overflow: "hidden",
      fontFamily: "'JetBrains Mono',monospace" }}>
      <JarvisLoader ready={ready} label={`INITIALIZING ${scene.label.toUpperCase()}`}
        onMediaComplete={() => setMediaDone(true)} />
      {/* Backdrop: RTX stream when available, else the locked target render */}
      {STREAM_URL ? (
        <iframe title={`stream ${scene.label}`} allow="fullscreen; microphone; autoplay"
          src={`${STREAM_URL}?scene=${scene.id}&context=${encodeURIComponent(context || "")}`}
          onLoad={() => setStreamReady(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} />
      ) : (
        <div style={{ position: "absolute", inset: 0,
          backgroundImage: `url(${scene.render})`, backgroundSize: "cover", backgroundPosition: "center",
          filter: "saturate(1.05)" }} />
      )}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(5,8,13,0.55) 0%, rgba(5,8,13,0.15) 30%, rgba(5,8,13,0.6) 100%)" }} />

      {/* Top bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 44, display: "flex",
        alignItems: "center", justifyContent: "space-between", padding: "0 16px",
        background: "rgba(5,8,13,0.65)", borderBottom: `1px solid ${EDGE}`, backdropFilter: "blur(8px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span onClick={() => navigate("/")} style={{ cursor: "pointer", fontWeight: 700, letterSpacing: 6,
            color: CY, textShadow: `0 0 12px ${CY}` }}>JARVIS</span>
          <span style={{ color: MUTED, fontSize: 11, letterSpacing: 2 }}>{scene.label.toUpperCase()}</span>
          {context && <Badge color={AMBER}>ctx: {context}</Badge>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11 }}>
          <span style={{ color: err ? "#FF4438" : GREEN }}>{err ? "DATA ERROR" : data ? "LIVE" : "SYNCING"}</span>
          {brain && <span style={{ color: MUTED }} title="growing knowledge graph">🧠 {Number(brain.nodes).toLocaleString()} nodes · {Number(brain.synapses).toLocaleString()} synapses</span>}
          {health && <span style={{ color: MUTED }}>{health.filled}/{health.total} bound · {health.acquiring || 0} scraping</span>}
          <span style={{ color: CY }}>{now} UTC</span>
        </div>
      </div>

      {/* Left rail — the 10 scenes */}
      <div style={{ position: "absolute", top: 44, bottom: 0, left: 0, width: 150, padding: "10px 8px",
        background: "rgba(5,8,13,0.55)", borderRight: `1px solid ${EDGE}`, backdropFilter: "blur(8px)",
        overflowY: "auto" }}>
        {CINEMATIC_SCENES.map((s) => {
          const active = s.id === scene.id;
          return (
            <div key={s.id} onClick={() => navigate(s.route)} style={{ cursor: "pointer", padding: "8px 8px",
              marginBottom: 4, borderRadius: 5, fontSize: 10, letterSpacing: 1,
              color: active ? BG : TEXT, background: active ? CY : "transparent",
              borderLeft: active ? `3px solid ${CY}` : "3px solid transparent",
              textShadow: active ? "none" : `0 0 8px rgba(41,231,255,0.2)` }}>
              {s.rail}
            </div>
          );
        })}
      </div>

      {/* Left data dock */}
      <div style={{ position: "absolute", top: 56, left: 162, width: 300, bottom: 64, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 8 }}>
        {zones.left.map(([k, v]) => <AnchorCard key={k} name={k} value={v} />)}
      </div>

      {/* Hero caption (center) */}
      <div style={{ position: "absolute", top: "44%", left: "50%", transform: "translate(-50%,-50%)",
        textAlign: "center", pointerEvents: "none" }}>
        {zones.hero.map(([k, v]) => (
          <div key={k} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: MUTED, letterSpacing: 2 }}>{k.split(".").slice(1).join(".").replace(/_/g, " ").toUpperCase()}</div>
            <div style={{ fontSize: 13, color: CY, textShadow: `0 0 14px ${CY}` }}>
              {v && v.status === "acquiring" ? `◌ scraping ${v.topic}` : summarize(v)}
            </div>
          </div>
        ))}
      </div>

      {/* Right stack */}
      <div style={{ position: "absolute", top: 56, right: 14, width: 320, bottom: 64, overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 8 }}>
        {zones.status.map(([k, v]) => <AnchorCard key={k} name={k} value={v} />)}
        {zones.right.map(([k, v]) => <AnchorCard key={k} name={k} value={v} />)}
      </div>

      {/* Bottom command bar */}
      <div style={{ position: "absolute", left: 162, right: 14, bottom: 12, height: 40, display: "flex",
        alignItems: "center", gap: 10, padding: "0 12px", background: PANEL, border: `1px solid ${EDGE}`,
        borderRadius: 8, backdropFilter: "blur(8px)" }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◉ JARVIS</span>
        <input ref={cmdRef} placeholder={`Command the ${scene.label}…`}
          onKeyDown={(e) => { if (e.key === "Enter") { window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { scene: scene.id, text: e.currentTarget.value } })); e.currentTarget.value = ""; } }}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: TEXT, fontSize: 12,
            fontFamily: "'JetBrains Mono',monospace" }} />
        {zones.bottom.map(([k, v]) => (
          <span key={k} style={{ fontSize: 10, color: MUTED }}>{k.split(".").slice(1).join(".")}: {summarize(v)}</span>
        ))}
      </div>
    </div>
  );
}
