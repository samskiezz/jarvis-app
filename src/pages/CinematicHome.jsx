import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as uwAudio from "@/lib/underworldLoaderMusic";

/**
 * CinematicHome — the new front door. The 86-page APEX wall is hidden; the entry
 * is an interactive selector between the two immersive destinations:
 *   • JARVIS    — the render-locked 10-scene cinematic HUD (Command Atrium entry)
 *   • UNDERWORLD — the 3D UE5 world loader (Pixel-Streamed)
 * Both are RTX/streamed experiences. The legacy /apex/* pages remain reachable for
 * admin but are no longer surfaced here.
 */

const CY = "#29E7FF";
const VIOLET = "#7A5CFF";
const BG = "#05080D";
const TEXT = "#DCEBF5";
const MUTED = "#6E8AA0";

const env = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};
// Explicit override (a full URL or a path). When unset we derive the REAL Underworld game at
// runtime (the `underworld-web` app on :5180, same host) — NOT the in-app /apex/Underworld
// panopticon monitor, which is only an admin surface, not the 3D world + its bootloader.
const UNDERWORLD_URL = env.VITE_UNDERWORLD_URL || "";
const UNDERWORLD_PORT = env.VITE_UNDERWORLD_PORT || "5180";

function underworldHref() {
  if (UNDERWORLD_URL) return UNDERWORLD_URL;            // explicit override wins
  if (typeof window !== "undefined") {
    // same host, the underworld-web port — works on any deployment without a rebuild-per-IP
    return `${window.location.protocol}//${window.location.hostname}:${UNDERWORLD_PORT}/`;
  }
  return "/apex/Underworld";                            // SSR/no-window fallback
}

function Portal({ title, subtitle, image, video, color, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: "relative", flex: 1, height: "min(64vh, 620px)", cursor: "pointer", borderRadius: 14,
        overflow: "hidden", border: `1px solid ${hover ? color : "rgba(41,231,255,0.25)"}`,
        boxShadow: hover ? `0 0 80px ${color}66, inset 0 0 90px ${color}26` : `0 0 28px ${color}26`,
        transform: hover ? "perspective(1200px) rotateX(3deg) translateY(-8px) scale(1.025)"
                         : "perspective(1200px) translateY(0) scale(1)",
        transformStyle: "preserve-3d", transition: "transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s ease" }}>
      {/* LIVE animated bootloader as the card hero — the actual hologram, not a static render. */}
      {video ? (
        <video src={video} poster={image} autoPlay muted loop playsInline preload="auto"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
            filter: hover ? "saturate(1.25) brightness(1.08)" : "saturate(1.05) brightness(0.85)",
            transition: "filter .3s ease", transform: hover ? "scale(1.06)" : "scale(1.0)" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${image})`, backgroundSize: "cover",
          backgroundPosition: "center", filter: hover ? "saturate(1.15) brightness(1.05)" : "saturate(0.95) brightness(0.8)",
          transition: "all .25s ease" }} />
      )}
      <div style={{ position: "absolute", inset: 0,
        background: `linear-gradient(180deg, rgba(5,8,13,0.25) 0%, rgba(5,8,13,0.5) 55%, rgba(5,8,13,0.92) 100%)` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 28 }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 8, color, textShadow: `0 0 24px ${color}` }}>{title}</div>
        <div style={{ fontSize: 13, color: TEXT, marginTop: 8, letterSpacing: 1, maxWidth: 460 }}>{subtitle}</div>
        <div style={{ marginTop: 16, display: "inline-block", fontSize: 11, letterSpacing: 3, color,
          border: `1px solid ${color}`, borderRadius: 4, padding: "8px 18px",
          background: hover ? `${color}22` : "transparent" }}>ENTER ▶</div>
      </div>
    </div>
  );
}

export default function CinematicHome() {
  const navigate = useNavigate();
  const [now, setNow] = useState("");
  const [entering, setEntering] = useState(false);   // Underworld bootloader overlay is showing
  const [toll, setToll] = useState(0);               // bumps on each deep bell toll (scene flash)
  const [noteFlash, setNoteFlash] = useState(0);     // bumps on each melody note (text glow)
  const bootRef = useRef(null);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(t);
  }, []);

  // When the Underworld bootloader overlay mounts: force the video to play (muted-autoplay recipe —
  // the same reason the cinematic loader works) and, once it's actually playing, hand off to the
  // real Underworld game (:5180). The :5180 GameLoader picks the SAME video up so it's seamless and
  // keeps looping "until the underworld loads". A fallback timer covers a stalled/blocked decode.
  useEffect(() => {
    if (!entering) return;
    const href = underworldHref();
    let done = false;
    const go = () => {
      if (done) return; done = true;
      uwAudio.stop(700);                 // fade the theme as the world opens
      window.location.href = href;
    };
    const v = bootRef.current;
    if (v) { v.play().catch(() => {}); }
    // the portal click is the gesture browsers require; fire scene effects ON each audio event so
    // the visuals are TIMED to the music (a violet flash on the deep toll, a glow on each note).
    uwAudio.start(0.4, {
      onToll: () => setToll((t) => t + 1),
      onNote: () => setNoteFlash((n) => n + 1),
    });
    // give the user the full audio-visual boot (video loops + theme plays), then hand to :5180.
    const onPlaying = () => { setTimeout(go, 6000); };
    v?.addEventListener("playing", onPlaying);
    const fallback = setTimeout(go, 8000);            // never get stuck if the video can't decode
    return () => { v?.removeEventListener("playing", onPlaying); clearTimeout(fallback); uwAudio.stop(300); };
  }, [entering]);

  const enterUnderworld = () => {
    const href = underworldHref();
    if (href.startsWith("http")) setEntering(true);   // show the bootloader video, then redirect
    else navigate(href);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, color: TEXT, overflow: "hidden",
      fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column" }}>
      {/* UNDERWORLD BOOTLOADER — plays the moment you pick Underworld, fullscreen + fit to any
          device (object-cover, no bars), muted-autoplay + looping, then hands off to the world. */}
      {entering && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#04060A",
          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {/* HERO — the clip FILLING the whole phone (object-cover, aspect preserved). */}
          <video
            ref={bootRef}
            src="/immersive/loader/underworld_bootloader.mp4"
            autoPlay muted loop playsInline preload="auto"
            style={{ position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", objectFit: "cover" }}
          />
          {/* TIMED SCENE EFFECT — a deep violet light swell on every bell toll (the world waking). */}
          <div key={`toll-${toll}`} style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
            background: `radial-gradient(circle at 50% 52%, ${VIOLET}40 0%, ${CY}14 28%, transparent 62%)`,
            opacity: 0, animation: toll ? "uwToll 5s ease-out forwards" : "none" }} />
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1,
            background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(4,6,10,0.5) 100%)" }} />
          {/* the title pulses its glow on each melody note */}
          <div key={`note-${noteFlash}`} style={{ position: "absolute", bottom: "8%", width: "100%", textAlign: "center",
            zIndex: 2, fontFamily: "'JetBrains Mono',monospace", color: VIOLET, letterSpacing: 6, fontSize: 13,
            animation: noteFlash ? "uwGlow 1.4s ease-out forwards" : "none",
            textShadow: `0 0 18px ${VIOLET}` }}>ENTERING THE UNDERWORLD…</div>
          <style>{`
            @keyframes uwToll { 0%{opacity:0} 12%{opacity:1} 100%{opacity:0} }
            @keyframes uwGlow { 0%{text-shadow:0 0 34px ${VIOLET},0 0 60px ${CY}} 100%{text-shadow:0 0 14px ${VIOLET}} }
          `}</style>
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, background:
        "radial-gradient(900px 500px at 50% -10%, rgba(41,231,255,0.10), transparent 60%)" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px",
        zIndex: 1 }}>
        <div style={{ fontWeight: 800, letterSpacing: 12, fontSize: 22, color: CY, textShadow: `0 0 18px ${CY}` }}>JARVIS</div>
        <div style={{ fontSize: 11, color: MUTED, letterSpacing: 2 }}>SELECT DESTINATION · {now} UTC</div>
      </div>

      <div style={{ flex: 1, display: "flex", gap: 22, padding: "0 28px 28px", zIndex: 1 }}>
        <Portal title="JARVIS" color={CY}
          subtitle="Immersive command HUD — 10 render-locked cinematic scenes. Every database, document and live feed routed into the hologram."
          image="/immersive/renders/web/01_command_atrium.jpg"
          video="/immersive/loader/loader_src.mp4"
          onClick={() => navigate("/cinematic/01_command_atrium")} />
        <Portal title="UNDERWORLD" color={VIOLET}
          subtitle="The 3D UE5 world — server-authoritative simulation, possession & the watched-creator loop. Pixel-streamed."
          image="/immersive/renders/web/08_simulation_theatre.jpg"
          video="/immersive/loader/underworld_bootloader.mp4"
          onClick={enterUnderworld} />
      </div>

      <div style={{ textAlign: "center", padding: "0 0 16px", fontSize: 10, color: MUTED, letterSpacing: 2, zIndex: 1 }}>
        legacy console (86 pages) preserved at <span style={{ color: MUTED, textDecoration: "underline", cursor: "pointer" }}
          onClick={() => navigate("/apex")}>/apex</span>
      </div>
    </div>
  );
}
