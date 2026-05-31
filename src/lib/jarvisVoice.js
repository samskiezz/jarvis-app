/**
 * jarvisVoice — the speech half of JARVIS.
 *
 * Wraps the Web Speech API for text-to-speech (a British male voice, to match
 * the films) and speech recognition (push-to-talk + an always-listening wake
 * word). Everything is feature-detected: on a browser without the API — or in
 * jsdom under tests — `createVoice()` returns a fully-functional no-op so the
 * rest of the app never has to branch on capability.
 */

const hasWindow = typeof window !== "undefined";

export function speechSupported() {
  return hasWindow && "speechSynthesis" in window;
}

export function recognitionSupported() {
  return hasWindow && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// Prefer, in order: a named British male voice, any en-GB voice, any English
// voice, then whatever's default. Chrome/Edge expose "Google UK English Male";
// Safari/iOS expose "Daniel".
function pickVoice() {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices() || [];
  const byName = (frag) => voices.find((v) => v.name.toLowerCase().includes(frag));
  return (
    byName("google uk english male") ||
    byName("daniel") ||
    voices.find((v) => /en-GB/i.test(v.lang) && /male/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

export function createVoice({ onWake, onResult, onListeningChange, onSpeakingChange, wakeWord = "jarvis" } = {}) {
  let voice = null;
  let recog = null;
  let wantWake = false;      // should we be passively listening for the wake word?
  let capturing = false;     // are we in a single command-capture burst?
  let listening = false;
  let muted = false;

  const setListening = (v) => { listening = v; onListeningChange?.(v); };

  if (speechSupported()) {
    const load = () => { voice = pickVoice(); };
    load();
    // Voices load async in Chrome.
    if (typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  function speak(text, { onend } = {}) {
    if (!text) { onend?.(); return; }
    if (!speechSupported() || muted) { onend?.(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      if (voice) u.voice = voice;
      u.lang = voice?.lang || "en-GB";
      u.rate = 1.02;   // crisp, slightly brisk — JARVIS isn't sleepy
      u.pitch = 0.9;   // a touch lower for the calm authority
      u.onstart = () => onSpeakingChange?.(true);
      u.onend = () => { onSpeakingChange?.(false); onend?.(); };
      u.onerror = () => { onSpeakingChange?.(false); onend?.(); };
      window.speechSynthesis.speak(u);
    } catch {
      onend?.();
    }
  }

  function cancelSpeech() {
    if (speechSupported()) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }
    onSpeakingChange?.(false);
  }

  function makeRecognizer() {
    if (!recognitionSupported()) return null;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Ctor();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      const text = (last[0]?.transcript || "").trim();
      if (!text) return;
      const lower = text.toLowerCase();
      if (capturing) {
        capturing = false;
        onResult?.(text);
        return;
      }
      // Passive wake-word mode: only react if the phrase contains "jarvis".
      if (lower.includes(wakeWord)) {
        // If they said a full command on the same breath ("jarvis open markets")
        // route it straight away; otherwise just acknowledge the wake.
        const after = lower.split(wakeWord)[1]?.trim();
        if (after && after.length > 1) onResult?.(text);
        else onWake?.();
      }
    };
    r.onend = () => {
      // Keep the wake listener alive across the browser's auto-stops.
      if (wantWake && !muted) { try { r.start(); } catch { /* already running */ } }
      else setListening(false);
    };
    r.onerror = () => { /* swallow — onend will decide whether to restart */ };
    return r;
  }

  function ensureRecog() {
    if (!recog) recog = makeRecognizer();
    return recog;
  }

  // Listen for one command burst right now (push-to-talk).
  function listenOnce() {
    const r = ensureRecog();
    if (!r) return false;
    capturing = true;
    try { r.start(); setListening(true); return true; }
    catch { return true; } // already started — capturing flag still applies
  }

  // Toggle the always-on wake-word listener.
  function setWake(on) {
    wantWake = on;
    const r = ensureRecog();
    if (!r) return false;
    if (on && !muted) { try { r.start(); setListening(true); } catch { /* running */ } }
    else { try { r.stop(); } catch { /* noop */ } }
    return true;
  }

  function setMuted(v) {
    muted = v;
    if (v) { cancelSpeech(); try { recog?.stop(); } catch { /* noop */ } }
    else if (wantWake) setWake(true);
  }

  function dispose() {
    wantWake = false;
    cancelSpeech();
    try { recog?.stop(); } catch { /* noop */ }
    recog = null;
  }

  return {
    speak,
    cancelSpeech,
    listenOnce,
    setWake,
    setMuted,
    dispose,
    get listening() { return listening; },
    supported: { speech: speechSupported(), recognition: recognitionSupported() },
  };
}
