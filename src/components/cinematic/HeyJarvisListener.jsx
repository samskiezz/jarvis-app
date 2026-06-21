import { useEffect, useRef, useState, useCallback } from "react";
import { createVoice, recognitionSupported } from "@/lib/jarvisVoice";
import { play, setHum, unlock } from "@/lib/jarvisSound";
import WakeWordToggle from "@/components/Jarvis/WakeWordToggle";

/**
 * HeyJarvisListener — always-listening wake word engine for cinematic + home routes.
 *
 * Mounts globally in App.jsx (after GlobalCommandPalette). When armed, uses the
 * browser's SpeechRecognition API (via createVoice) to passively listen for "JARVIS".
 * On detection, dispatches jarvis:ask to open JarvisBrain, plays the listen cue, and
 * starts the ambient reactor hum while armed.
 *
 * No-ops silently on browsers that lack SpeechRecognition (Firefox, older Safari).
 */
export default function HeyJarvisListener() {
  const [armed, setArmed] = useState(false);
  const voiceRef = useRef(null);

  // Build the voice engine once.
  useEffect(() => {
    if (!recognitionSupported()) return;

    const voice = createVoice({
      wakeWord: "jarvis",
      onWake() {
        play("listen");
        window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: {} }));
      },
      onResult(text) {
        // Full command said on same breath as wake word ("JARVIS, show risks").
        play("listen");
        window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text } }));
      },
    });

    voiceRef.current = voice;
    return () => { voice.dispose(); };
  }, []);

  const handleArm = useCallback(() => {
    unlock(); // unblock Web Audio on first gesture
    play("boot");
    voiceRef.current?.setWake(true);
    setHum(true);
    setArmed(true);
  }, []);

  const handleDisarm = useCallback(() => {
    voiceRef.current?.setWake(false);
    setHum(false);
    play("listenEnd");
    setArmed(false);
  }, []);

  // Don't render anything if the browser can't support this feature.
  if (!recognitionSupported()) return null;

  return (
    <WakeWordToggle
      armed={armed}
      onArm={handleArm}
      onDisarm={handleDisarm}
    />
  );
}
