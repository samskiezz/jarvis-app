import { useState, useEffect, useCallback, useRef } from "react";
import VoiceInterface from "./VoiceInterface";
import { COLORS as C } from "@/domain/colors";

interface ChatMessage {
  role: "user" | "jarvis" | string;
  text: string;
}

interface VoiceChatIntegrationProps {
  messages: ChatMessage[];
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/**
 * VoiceChatIntegration — reusable wrapper that wires VoiceInterface into any
 * chat flow, auto-speaks JARVIS responses via /v1/voice/tts, and surfaces a
 * compact mute + status indicator suitable for a chat header.
 */
export default function VoiceChatIntegration({ messages, onTranscript, disabled = false }: VoiceChatIntegrationProps) {
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const lastSpokenIndexRef = useRef(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speakText = useCallback(async (text: string) => {
    if (!text || muted) return;
    setSpeaking(true);
    try {
      const r = await fetch("/v1/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("TTS failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch {
      const utter = new SpeechSynthesisUtterance(text);
      utter.onend = () => setSpeaking(false);
      speechSynthesis.speak(utter);
    }
  }, [muted]);

  // Auto-speak new jarvis responses
  useEffect(() => {
    if (muted) return;
    const jarvisMsgs = messages.map((m, i) => ({ ...m, index: i })).filter((m) => m.role === "jarvis");
    const latest = jarvisMsgs[jarvisMsgs.length - 1];
    if (!latest) return;
    if (latest.index <= lastSpokenIndexRef.current) return;
    lastSpokenIndexRef.current = latest.index;
    speakText(latest.text);
  }, [messages, muted, speakText]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next && audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setSpeaking(false);
      }
      return next;
    });
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px" }}>
      <VoiceInterface onTranscript={onTranscript} disabled={disabled} />
      <button
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        style={{
          width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
          background: muted ? "rgba(232,32,60,0.18)" : "rgba(0,200,120,0.1)",
          border: `1px solid ${muted ? C.red : C.neon}55`,
          color: muted ? C.red : C.neon,
          fontSize: 12, cursor: "pointer",
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {speaking && (
          <>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                width: 3, background: C.neon, borderRadius: 2,
                animation: "pulse 0.6s ease-in-out infinite",
                animationDelay: `${i * 0.1}s`,
                height: `${6 + i * 3}px`,
              }} />
            ))}
          </>
        )}
        <span style={{ fontSize: 8, color: speaking ? C.neon : muted ? C.text : C.textB, letterSpacing: 1 }}>
          {speaking ? "SPEAKING" : muted ? "MUTED" : "VOICE READY"}
        </span>
      </div>
    </div>
  );
}
