import { useEffect, useRef } from "react";

/**
 * JarvisLoader — the boot/intro that MUST PLAY IN FULL before the cinematic reveals.
 *
 * The clip carries its OWN audio track, so the music is perfectly TIMED TO THE ACTIONS of the
 * video (it's the creator's baked soundtrack). We therefore unmute the hero video and play it at
 * native rate, ONCE, to the end — then tell the parent (`onMediaComplete`) it's done. The parent
 * only reveals the scene once BOTH the media has finished AND the scene data is ready, so the intro
 * never gets cut short. After the first full play the hero loops silently (so it isn't a frozen
 * frame) while we wait for data; the cinematic riser .wav rides quietly underneath as a bed.
 *
 * Composited for depth: blurred cover fill (no bars/orientation issues) + cyan key-light bloom +
 * a CRISP contain hero (true aspect, max sharpness) + grounded shadow/vignette.
 */
const CY = "#29E7FF";
const VID = "/immersive/loader/loader_src.mp4";
const SND = "/immersive/loader/loader_sound.wav";

export default function JarvisLoader({
  ready = false,
  label = "INITIALIZING JARVIS",
  progress = null,
  onMediaComplete = () => {},
}) {
  const back = useRef(null);
  const front = useRef(null);
  const audio = useRef(null);
  const completed = useRef(false);

  useEffect(() => {
    const heroV = front.current;
    const backV = back.current;
    const bed = audio.current;

    const fireComplete = () => {
      if (completed.current) return;
      completed.current = true;
      // The lady has now said her part ONCE. Keep the loader alive by looping the video MUTED (no
      // repeated voice), and let ONLY the music bed continue — louder now that the speech is done.
      if (heroV) { heroV.muted = true; heroV.loop = true; heroV.currentTime = 0; heroV.play?.().catch(() => {}); }
      if (bed) { bed.volume = 0.55; bed.loop = true; bed.play?.().catch(() => {}); }
      onMediaComplete();
    };

    // Hero: the user's clip WITH its own action-synced audio. Play once, full, then signal done.
    if (heroV) {
      heroV.muted = false;
      heroV.loop = false;
      heroV.volume = 1.0;
      const kick = () => heroV.play().catch(() => {
        // sound blocked (no gesture carried) → play muted so the VIDEO still runs + completes.
        heroV.muted = true;
        heroV.play().catch(() => {});
      });
      kick();
      heroV.addEventListener("ended", fireComplete);
      // resume audio on the first interaction ONLY if the browser blocked unmuted autoplay AND the
      // lady hasn't already finished her line. Once completed, the clip loops muted forever — a
      // later click (e.g. picking a home tile) must NEVER un-mute it and replay the voice.
      const onGesture = () => {
        window.removeEventListener("pointerdown", onGesture);
        if (completed.current) return;            // already spoke once → never speak again
        heroV.muted = false; heroV.play().catch(() => {});
      };
      window.addEventListener("pointerdown", onGesture);
      // belt-and-suspenders: when fireComplete runs, drop the gesture hook so it can't re-arm.
      heroV.addEventListener("ended", () => window.removeEventListener("pointerdown", onGesture));
      // safety net: never hang the boot — if `ended` never fires (stall/decode), complete after the
      // clip's duration + a margin, or a hard 40s cap.
      let cap = setTimeout(fireComplete, 40000);
      heroV.addEventListener("loadedmetadata", () => {
        clearTimeout(cap);
        const ms = Number.isFinite(heroV.duration) ? heroV.duration * 1000 + 4000 : 40000;
        cap = setTimeout(fireComplete, ms);
      });
    }

    // Backdrop: muted, looping ambiance.
    if (backV) { backV.muted = true; backV.loop = true; backV.play?.().catch(() => {}); }

    // Quiet riser bed under the clip's own audio (does not gate anything).
    if (bed) { bed.volume = 0.25; bed.play?.().catch(() => {}); }

    return () => {
      heroV?.removeEventListener("ended", fireComplete);
    };
  }, [onMediaComplete]);

  // When the scene is finally revealed, fade the audio out then stop.
  useEffect(() => {
    if (!ready) return;
    const els = [audio.current, front.current].filter(Boolean);
    const id = setInterval(() => {
      let allQuiet = true;
      els.forEach((el) => {
        try { el.volume = Math.max(0, el.volume - 0.08); if (el.volume > 0.01) allQuiet = false; } catch (_) {}
      });
      if (allQuiet) { els.forEach((el) => { try { el.pause(); } catch (_) {} }); clearInterval(id); }
    }, 60);
    return () => clearInterval(id);
  }, [ready]);

  return (
    <div aria-hidden={ready} style={{
      position: "fixed", inset: 0, zIndex: 60, background: "#03050A",
      opacity: ready ? 0 : 1, pointerEvents: ready ? "none" : "auto",
      transition: "opacity 900ms ease", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center" }}>

      <audio ref={audio} src={SND} loop preload="auto" />

      {/* FILL — the SAME video, blurred, covering the WHOLE screen edge-to-edge (no bars on any
          device/orientation). Bright enough to actually read as "the video fills the phone". */}
      <video ref={back} src={VID} autoPlay muted loop playsInline preload="auto"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover",
          filter: "blur(26px) brightness(0.62) saturate(1.2)", transform: "scale(1.2)" }} />

      {/* BLOOM — cyan key light behind the hero video */}
      <div style={{ position: "absolute", width: "82vw", height: "82vw", borderRadius: "50%",
        background: `radial-gradient(circle, ${CY}33 0%, transparent 62%)`, filter: "blur(46px)", zIndex: 1 }} />

      {/* HERO — the clip FILLING the whole phone (object-cover, aspect preserved, no squish), with
          its own action-synced audio (the lady speaks ONCE; on loop it's muted — see fireComplete). */}
      <video ref={front} src={VID} autoPlay playsInline preload="auto"
        style={{ position: "absolute", inset: 0, zIndex: 2, width: "100%", height: "100%",
          objectFit: "cover",
          filter: "contrast(1.12) saturate(1.22) brightness(1.02)" }} />

      {/* SHADOWS / DOF — gentle vignette (keeps the blurred fill visible, doesn't crush to black) */}
      <div style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none",
        background: "radial-gradient(135% 100% at 50% 50%, transparent 52%, rgba(3,5,10,0.5) 100%)" }} />

      <div style={{ position: "absolute", bottom: "6.5%", width: "100%", textAlign: "center", zIndex: 4,
        fontFamily: "'JetBrains Mono',monospace", color: CY, letterSpacing: 6, textShadow: `0 0 20px ${CY}` }}>
        <div style={{ fontSize: 14 }}>{label}{progress == null ? "…" : ` · ${Math.round(progress * 100)}%`}</div>
        <div style={{ margin: "12px auto 0", width: 260, height: 3, background: "rgba(41,231,255,0.16)",
          borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress == null ? "38%" : `${Math.round(progress * 100)}%`,
            background: CY, boxShadow: `0 0 12px ${CY}`,
            animation: progress == null ? "jload 1.6s ease-in-out infinite" : "none" }} />
        </div>
      </div>
      <style>{`@keyframes jload{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}`}</style>
    </div>
  );
}
