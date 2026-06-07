import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { interpret, LINES, pick } from "@/lib/jarvisAgent";
import { createVoice } from "@/lib/jarvisVoice";
import { agentChat } from "@/lib/jarvisApi";
import jarvisSound from "@/lib/jarvisSound";
import ArcReactor from "./ArcReactor";

/**
 * JarvisAssistant — the omnipresent JARVIS HUD.
 *
 * Wires the three pieces together:
 *   • voice (jarvisVoice)  — speaks replies, listens for the "JARVIS" wake word
 *   • agency (jarvisAgent) — turns commands into terminal actions
 *   • analysis (backend)   — streams open questions from /functions/analystChat
 *
 * It renders a collapsed arc-reactor orb that expands into a conversation panel.
 * `actions` is the bridge the terminal hands in so JARVIS can actually drive it.
 */

// Compose a short spoken briefing from the live intel snapshot — real figures
// only, no invention (per the JARVIS contract).
function buildBriefing(liveData, topRisk) {
  const bits = [];
  const markets = Array.isArray(liveData?.markets) ? liveData.markets : [];
  const mover = markets
    .filter((m) => Number.isFinite(Number(m.change_pct)))
    .sort((a, b) => Math.abs(Number(b.change_pct)) - Math.abs(Number(a.change_pct)))[0];
  if (mover) {
    const ch = Number(mover.change_pct);
    bits.push(`${mover.display} is ${ch >= 0 ? "up" : "down"} ${Math.abs(ch).toFixed(1)} percent at ${mover.price}`);
  }
  if (topRisk) bits.push(`highest open risk is ${topRisk.label} at severity ${topRisk.severity ?? topRisk.score ?? "—"}`);
  const eq = liveData?.earthquakes?.length;
  if (eq) bits.push(`${eq} significant quakes on the USGS feed`);
  if (!bits.length) return "All systems nominal, sir. Nothing pressing on the feeds.";
  return `Briefing, sir. ${bits.join("; ")}.`;
}

export default function JarvisAssistant({ actions = {}, liveData: liveDataProp, entities = [], risks = [], pages = [], currentPage = null }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);   // audio unlocked + wake armed
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [messages, setMessages] = useState([]);   // {role:'sam'|'jarvis', text}
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [liveDataSelf, setLiveDataSelf] = useState(null);

  // When the host page doesn't feed live intel (i.e. anywhere but the terminal),
  // JARVIS pulls its own so briefings work on every page — including Apex.
  const liveData = liveDataProp || liveDataSelf;
  useEffect(() => {
    if (liveDataProp) return;
    let alive = true;
    (async () => {
      try {
        const headers = { "Content-Type": "application/json" };
        if (appParams.apiKey) headers.Authorization = `Bearer ${appParams.apiKey}`;
        const r = await fetch(`${appParams.apiBaseUrl}/functions/getLiveIntel`,
          { method: "POST", headers, body: JSON.stringify({ type: "all" }) });
        if (alive && r.ok) setLiveDataSelf(await r.json());
      } catch { /* offline — assistant still answers, just no briefing figures */ }
    })();
    return () => { alive = false; };
  }, [liveDataProp]);

  const voiceRef = useRef(null);
  const abortRef = useRef(null);
  const logRef = useRef(null);
  const topRisk = useMemo(
    () => [...(risks || [])].sort((a, b) => (b.severity ?? b.score ?? 0) - (a.severity ?? a.score ?? 0))[0],
    [risks],
  );

  const say = useCallback((text) => {
    setMessages((m) => [...m, { role: "jarvis", text }]);
    voiceRef.current?.speak(text);
  }, []);

  // A query now runs the REAL backend agent loop: LLM planner → governed tool
  // dispatch (search / ontology / science) → step memory → synthesised answer.
  // We surface the tool trace inline and speak the final answer. `historyRef`
  // gives the loop short-term memory across turns.
  const historyRef = useRef([]);
  // Keep the latest page context in a ref so runQuery (created once) always sends
  // the current route without being torn down on every navigation.
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);
  const runQuery = useCallback(async (message) => {
    setStreaming(true);
    const idx = { current: -1 };
    setMessages((m) => { idx.current = m.length; return [...m, { role: "jarvis", text: "" }]; });
    try {
      const page = currentPageRef.current;
      const pageContext = page
        ? { name: page.name, label: page.label, route: page.route }
        : undefined;
      const res = await agentChat(message, { history: historyRef.current, pageContext });
      const text = res.answer || "I have nothing to report on that, sir.";
      setMessages((m) => m.map((msg, i) => (
        i === idx.current
          ? { ...msg, text, tools: res.used_tools, backend: res.backend, steps: res.steps }
          : msg
      )));
      historyRef.current = [...historyRef.current, { role: "sam", text: message }, { role: "jarvis", text }].slice(-8);
      if (!res.error) voiceRef.current?.speak(text);
    } catch {
      setMessages((m) => m.map((msg, i) => (i === idx.current ? { ...msg, text: "My apologies, sir — the agent link is down." } : msg)));
    } finally {
      setStreaming(false);
    }
  }, []);

  // ── core: handle one utterance (voice or typed) ──────────────────────────
  const handleUtterance = useCallback(async (raw) => {
    const text = String(raw || "").trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "sam", text }]);

    const plan = interpret(text, { entities, pages });
    switch (plan.intent) {
      case "greeting":
        return say(pick(plan.warm ? LINES.greetingWarm : LINES.greeting));
      case "stop":
        voiceRef.current?.cancelSpeech();
        abortRef.current?.abort();
        return say(pick(LINES.stop));
      case "help":
        return say("I can take you to any page, open or close panels, focus an entity, pull fresh intel, brief you on the day, or answer questions on your universe. Try: JARVIS, take me to Apex Core.");
      case "refresh":
        actions.refresh?.();
        return say(pick(LINES.refresh));
      case "navigate": {
        actions.navigate?.(plan.page.name);
        return say(LINES.navigated(plan.page.label));
      }
      case "open_panel": {
        actions.openPanel?.(plan.panel);
        return say(LINES.opened(actions.panelLabel?.(plan.panel) || plan.panel));
      }
      case "close_panel": {
        actions.closePanel?.(plan.panel);
        return say(LINES.closed(actions.panelLabel?.(plan.panel) || plan.panel));
      }
      case "focus_entity": {
        actions.focusEntity?.(plan.entity.id);
        return say(LINES.focused(plan.entity.label));
      }
      case "briefing":
        return say(buildBriefing(liveData, topRisk));
      case "query":
      default: {
        if (plan.entity) actions.focusEntity?.(plan.entity.id);
        return runQuery(plan.query || text);
      }
    }
  }, [entities, pages, liveData, topRisk, say, actions, runQuery]);

  // Keep a ref to the latest handler so the (once-created) voice engine always
  // dispatches into current state without being torn down and rebuilt.
  const handlerRef = useRef(handleUtterance);
  useEffect(() => { handlerRef.current = handleUtterance; }, [handleUtterance]);

  // ── voice engine lifecycle (created once) ────────────────────────────────
  useEffect(() => {
    const v = createVoice({
      onWake: () => { setListening(true); say(pick(LINES.greeting)); },
      onResult: (text) => handlerRef.current?.(text),
      onListeningChange: setListening,
      onSpeakingChange: setSpeaking,
    });
    voiceRef.current = v;
    return () => v.dispose();
  }, [say]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  // The command palette ("Ask Jarvis: <query>") and any other surface can hand
  // a query to the assistant via a window event. Open the panel and process it.
  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.query;
      if (!q) return;
      setOpen(true);
      handlerRef.current?.(q);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  // First user gesture unlocks audio (browsers block speech before one) and
  // arms the wake word.
  const activate = useCallback(() => {
    setOpen(true);
    if (active) return;
    setActive(true);
    jarvisSound.unlock();
    jarvisSound.play("boot");   // the JARVIS power-on
    const v = voiceRef.current;
    v?.setWake(true);
    const greeting = pick(LINES.greeting);
    setMessages((m) => (m.length ? m : [{ role: "jarvis", text: greeting }]));
    v?.speak(greeting, { onend: () => { if (liveData) say(buildBriefing(liveData, topRisk)); } });
  }, [active, liveData, topRisk, say]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
    jarvisSound.setMuted(next);
  };

  // JARVIS sonic cues — fire on every state transition (the missing audio layer).
  useEffect(() => { jarvisSound.play(listening ? "listen" : "listenEnd"); }, [listening]);
  useEffect(() => { if (streaming) jarvisSound.play("think"); }, [streaming]);
  useEffect(() => { if (speaking) jarvisSound.play("speak"); }, [speaking]);
  useEffect(() => { jarvisSound.setHum(active); return () => jarvisSound.setHum(false); }, [active]);

  const supported = voiceRef.current?.supported || { speech: false, recognition: false };
  const orbColor = speaking ? C.gold : listening ? C.red : active ? C.neon : C.blue;
  const orbState = speaking ? "speaking" : listening ? "listening"
    : streaming ? "thinking" : active ? "armed" : "idle";

  return (
    <>
      {/* Live arc-reactor orb — animated, state-reactive, with sonic activation. */}
      <button
        onClick={() => { jarvisSound.unlock(); jarvisSound.play(open ? "tick" : "activate"); open ? setOpen(false) : activate(); }}
        onMouseEnter={() => jarvisSound.play("hover")}
        title="JARVIS"
        style={{
          position: "fixed", right: 16, bottom: 32, width: 58, height: 58, borderRadius: "50%",
          zIndex: 10000, cursor: "pointer", background: "rgba(2,8,12,0.92)",
          border: `1px solid ${orbColor}66`, boxShadow: `0 0 22px ${orbColor}66`,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
          transition: "box-shadow 0.3s",
        }}
      >
        <ArcReactor state={orbState} size={56} color={orbColor} />
      </button>

      {open && (
        <div style={{
          position: "fixed", right: 16, bottom: 94, width: 340, maxHeight: "62vh", zIndex: 10000,
          background: "rgba(2,8,12,0.98)", border: `1px solid ${C.neon}44`, borderRadius: 8,
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)", display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono','SF Mono',monospace", overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: `1px solid ${C.border}`, background: "rgba(0,200,120,0.05)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: orbColor, boxShadow: `0 0 6px ${orbColor}` }} />
            <span style={{ color: C.neon, fontSize: 11, letterSpacing: 3, fontWeight: "bold" }}>JARVIS</span>
            <span style={{ color: C.text, fontSize: 7, letterSpacing: 1 }}>
              {speaking ? "SPEAKING" : listening ? "LISTENING" : active ? "ARMED" : "STANDBY"}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={toggleMute} title={muted ? "unmute" : "mute"}
              style={{ background: "none", border: "none", cursor: "pointer", color: muted ? C.red : C.text, fontSize: 13 }}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.text, fontSize: 13 }}>×</button>
          </div>

          {/* transcript */}
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 120 }}>
            {messages.length === 0 && (
              <div style={{ color: C.text, fontSize: 9, lineHeight: 1.7 }}>
                Say “JARVIS” or tap the mic. Try: “brief me”, “open markets”, “focus on PSG”.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "sam" ? "flex-end" : "flex-start", maxWidth: "86%" }}>
                <div style={{
                  fontSize: 10, lineHeight: 1.5, padding: "6px 9px", borderRadius: 7,
                  background: m.role === "sam" ? "rgba(0,150,212,0.14)" : "rgba(0,200,120,0.08)",
                  border: `1px solid ${m.role === "sam" ? C.blue + "33" : C.neon + "33"}`,
                  color: m.role === "sam" ? C.textB : "#cfe9dc",
                  whiteSpace: "pre-wrap",
                }}>{m.text || (streaming ? "…" : "")}</div>
                {/* Tool trace: which governed tools the agent actually called. */}
                {Array.isArray(m.tools) && m.tools.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 7, color: C.text, letterSpacing: 1 }}>
                      {m.backend ? m.backend.toUpperCase() : "GROUNDED"} · {m.steps || m.tools.length} STEP{(m.steps || m.tools.length) === 1 ? "" : "S"}
                    </span>
                    {m.tools.map((t, k) => (
                      <span key={k} style={{ fontSize: 7, color: C.gold, background: C.gold + "14",
                        border: `1px solid ${C.gold}33`, borderRadius: 3, padding: "1px 5px" }}>⛭ {t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* input row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 8, borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={() => { if (!active) activate(); voiceRef.current?.listenOnce(); }}
              disabled={!supported.recognition}
              title={supported.recognition ? "push to talk" : "speech recognition unavailable in this browser"}
              style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0, cursor: supported.recognition ? "pointer" : "not-allowed",
                background: listening ? "rgba(232,32,60,0.18)" : "rgba(0,200,120,0.1)",
                border: `1px solid ${listening ? C.red : C.neon}55`, color: listening ? C.red : C.neon, fontSize: 14,
              }}>🎙</button>
            <form style={{ flex: 1, display: "flex", gap: 6 }} onSubmit={(e) => { e.preventDefault(); if (!active) activate(); handleUtterance(draft); setDraft(""); }}>
              <input
                value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={currentPage?.label ? `Ask JARVIS about ${currentPage.label}…` : "Ask JARVIS…"}
                style={{ flex: 1, background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 5, color: C.textB, fontSize: 10, padding: "7px 9px", outline: "none", fontFamily: "inherit" }}
              />
            </form>
          </div>
          {!supported.speech && (
            <div style={{ padding: "4px 10px 8px", color: C.gold, fontSize: 8 }}>Voice output unavailable in this browser — text only.</div>
          )}
        </div>
      )}
    </>
  );
}
