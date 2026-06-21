/**
 * MultiVoiceToggle — F29
 * Lets you switch the JARVIS TTS voice between ash / fable / onyx live.
 * Voice is persisted in localStorage (jarvis:tts_voice).
 * JarvisBrain imports getActiveVoice() and includes it in every /v1/voice/tts POST.
 * Toggle: ◈ VOICE button at left:1740 bottom strip.
 * Voice query ("JARVIS, switch to fable voice") handled via isVoiceQuery + buildVoiceScript.
 */
import { useEffect, useState } from "react";

const CY  = "#29E7FF";
const GRN = "#00E5A0";

const VOICES = ["ash", "fable", "onyx"];
const VOICE_KEY = "jarvis:tts_voice";

const VOICE_RE = /\b(voice|tts\s+voice|change\s+voice|switch\s+voice|use\s+voice|speak\s+as|speak\s+like|set\s+voice)\b/i;

export function getActiveVoice() {
  try {
    const v = localStorage.getItem(VOICE_KEY);
    return VOICES.includes(v) ? v : "ash";
  } catch (_) {
    return "ash";
  }
}

function setActiveVoice(v) {
  try { localStorage.setItem(VOICE_KEY, v); } catch (_) {}
  window.dispatchEvent(new CustomEvent("jarvis:voice-change", { detail: { voice: v } }));
}

function extractVoiceName(text) {
  for (const v of VOICES) {
    if (new RegExp(`\\b${v}\\b`, "i").test(text || "")) return v;
  }
  return null;
}

export function isVoiceQuery(text) {
  return VOICE_RE.test(text || "");
}

export function buildVoiceScript() {
  const v = getActiveVoice();
  return `Voice profile set to ${v}. All subsequent speech will use the ${v} voice engine, sir.`;
}

export function applyVoiceFromQuery(text) {
  const named = extractVoiceName(text);
  const current = getActiveVoice();
  if (named && named !== current) {
    setActiveVoice(named);
    return named;
  }
  // cycle to next if no name given
  if (!named) {
    const next = VOICES[(VOICES.indexOf(current) + 1) % VOICES.length];
    setActiveVoice(next);
    return next;
  }
  return current;
}

const VOICE_COLOR = { ash: "#29E7FF", fable: "#C084FC", onyx: "#00E5A0" };

export default function MultiVoiceToggle() {
  const [voice, setVoice]   = useState(getActiveVoice);
  const [open, setOpen]     = useState(false);

  useEffect(() => {
    const onVoice = (e) => { if (VOICES.includes(e?.detail?.voice)) setVoice(e.detail.voice); };
    window.addEventListener("jarvis:voice-change", onVoice);
    return () => window.removeEventListener("jarvis:voice-change", onVoice);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (VOICE_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  function pick(v) {
    setVoice(v);
    setActiveVoice(v);
    setOpen(false);
  }

  function cycleVoice() {
    const next = VOICES[(VOICES.indexOf(voice) + 1) % VOICES.length];
    pick(next);
  }

  const col = VOICE_COLOR[voice] || CY;

  return (
    <>
      {/* Bottom strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title={`TTS Voice: ${voice} — click to pick, right-click to cycle`}
        onContextMenu={e => { e.preventDefault(); cycleVoice(); }}
        style={{
          position: "fixed", left: 1740, bottom: 18, zIndex: 68,
          background: open ? col + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? col : col + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : col,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${col}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        <span style={{ color: open ? "#04060A" : col }}>{voice.toUpperCase()}</span>
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 1740, bottom: 54, zIndex: 68,
          width: 220,
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${col}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 50px ${col}18`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>

          {/* Header */}
          <div style={{
            padding: "9px 14px", borderBottom: `1px solid ${col}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: col, boxShadow: `0 0 10px ${col}`,
              display: "inline-block",
            }} />
            <span style={{ color: col, fontSize: 10, letterSpacing: 3, fontWeight: 700 }}>
              TTS VOICE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px", marginLeft: "auto",
            }}>×</button>
          </div>

          {/* Voice options */}
          {VOICES.map(v => {
            const vc = VOICE_COLOR[v];
            const active = v === voice;
            return (
              <div
                key={v}
                onClick={() => pick(v)}
                style={{
                  padding: "10px 16px",
                  borderBottom: `1px solid ${vc}0C`,
                  borderLeft: `3px solid ${active ? vc : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 10,
                  cursor: "pointer",
                  background: active ? vc + "12" : "transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = vc + "0A"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 14, color: vc }}>{active ? "●" : "○"}</span>
                <span style={{
                  color: active ? vc : "#8AAABB",
                  fontSize: 12, letterSpacing: 2, fontWeight: active ? 700 : 400,
                }}>
                  {v.toUpperCase()}
                </span>
                {active && (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, color: vc + "AA", letterSpacing: 1,
                  }}>ACTIVE</span>
                )}
              </div>
            );
          })}

          {/* Footer */}
          <div style={{
            padding: "7px 14px",
            borderTop: `1px solid ${col}18`,
            fontSize: 9, color: "#4A6070",
            display: "flex", gap: 6, alignItems: "center",
          }}>
            <span>RIGHT-CLICK STRIP TO CYCLE</span>
            <span style={{ marginLeft: "auto", color: GRN + "88" }}>
              {VOICES.indexOf(voice) + 1}/{VOICES.length}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
