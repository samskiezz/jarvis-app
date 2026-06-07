import React, { useCallback, useEffect, useRef, useState } from "react";

interface VoiceInterfaceProps {
  onTranscript: (text: string) => void;
  onWakeWord?: () => void;
  wakeWords?: string[];
  disabled?: boolean;
}

export default function VoiceInterface({
  onTranscript,
  onWakeWord,
  wakeWords = ["jarvis", "hey jarvis", "wake up"],
  disabled = false,
}: VoiceInterfaceProps) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Web Speech API STT ────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (disabled) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Web Speech API not supported in this browser.");
      return;
    }
    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onTranscript(transcript);
      const lower = transcript.toLowerCase();
      if (wakeWords.some((w) => lower.includes(w.toLowerCase()))) {
        onWakeWord?.();
      }
    };
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
  }, [disabled, onTranscript, onWakeWord, wakeWords]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  // ── TTS playback ──────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    if (!text) return;
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
      // Fallback to browser TTS
      const utter = new SpeechSynthesisUtterance(text);
      utter.onend = () => setSpeaking(false);
      speechSynthesis.speak(utter);
    }
  }, []);

  // ── keyboard shortcut (hold Space) ────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !listening && !disabled) {
        e.preventDefault();
        startListening();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        stopListening();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [listening, disabled, startListening, stopListening]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={listening ? stopListening : startListening}
        disabled={disabled}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
          listening
            ? "bg-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse"
            : "bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-400/30"
        }`}
        title={listening ? "Stop listening" : "Hold Space to talk"}
      >
        <span className="text-xl">{listening ? "🎙️" : "🎤"}</span>
        {listening && (
          <span className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-50" />
        )}
      </button>

      {speaking && (
        <div className="flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-cyan-400 rounded-full animate-bounce"
              style={{
                height: "12px",
                animationDelay: `${i * 0.1}s`,
                animationDuration: "0.6s",
              }}
            />
          ))}
        </div>
      )}

      <span className="text-xs text-cyan-300/60">
        {listening ? "Listening…" : speaking ? "Speaking…" : "Hold Space"}
      </span>
    </div>
  );
}

export { speak as browserSpeak };
