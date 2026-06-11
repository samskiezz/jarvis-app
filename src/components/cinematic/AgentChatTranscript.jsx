/**
 * AgentChatTranscript — F47
 * Persistent multi-turn chat panel wired to /v1/jarvis/agent/chat.
 * Unlike JarvisBrain (single-turn ephemeral overlay), this keeps a scrollable
 * conversation history in localStorage (up to 60 messages) and provides a
 * direct text-input interface for typed conversation.
 * "JARVIS, open chat" | "chat panel" | "chat transcript" | "agent chat" → panel + TTS.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY       = "#29E7FF";
const RED      = "#FF4D6D";
const STORAGE_KEY = "jarvis_chat_history";
const MAX_MSGS    = 60;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CHAT_RE =
  /\b(open[\s-]{0,8}chat|chat[\s-]panel|chat[\s-]transcript|chat[\s-]window|agent[\s-]chat|multi[\s-]turn|direct[\s-]chat)\b/i;

export function isChatQuery(t) {
  return CHAT_RE.test(t || "");
}

export function buildChatScript(history) {
  const n = Array.isArray(history) ? history.length : 0;
  if (!n) return "Chat transcript is open, sir. The panel is ready for direct multi-turn conversation.";
  return `Chat transcript loaded, sir — ${n} message${n === 1 ? "" : "s"} on record. The panel is open and awaiting your next query.`;
}

/* ── localStorage helpers ──────────────────────────────────────────────────── */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}
function saveHistory(h) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(h.slice(-MAX_MSGS))); } catch (_) {}
}

/* ── timestamp ─────────────────────────────────────────────────────────────── */
function formatTs(ts) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/* ── main component ─────────────────────────────────────────────────────────── */
export default function AgentChatTranscript() {
  const [open, setOpen]         = useState(false);
  const [history, setHistory]   = useState(() => loadHistory());
  const [input, setInput]       = useState("");
  const [thinking, setThinking] = useState(false);
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  // persist on every history change
  useEffect(() => { saveHistory(history); }, [history]);

  // auto-scroll to bottom when new messages arrive or panel opens
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, thinking, open]);

  // focus input when panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [open]);

  // toggle via event (dispatched by JarvisBrain on intent match)
  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:chat-toggle", onToggle);
    return () => window.removeEventListener("jarvis:chat-toggle", onToggle);
  }, []);

  const send = useCallback(async () => {
    const q = input.trim();
    if (!q || thinking) return;
    setInput("");
    const userMsg = { role: "user", text: q, ts: Date.now() };
    setHistory(h => [...h, userMsg]);
    setThinking(true);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: q }),
      });
      const d = await r.json();
      const answer =
        ((d.answer || d.response || d.text || "").trim()) ||
        "I'm afraid I couldn't process that, sir.";
      const jarvisMsg = { role: "jarvis", text: answer, ts: Date.now() };
      setHistory(h => [...h, jarvisMsg]);
      // speak via JarvisBrain's speak-dossier handler (respects active voice)
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      const errMsg = "I'm afraid I couldn't reach my reasoning core just now, sir.";
      setHistory(h => [...h, { role: "jarvis", text: errMsg, ts: Date.now() }]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking]);

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function clearAll() {
    setHistory([]);
    saveHistory([]);
  }

  /* ── render ──────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── bottom-strip toggle ──────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Agent Chat Transcript (F47) — open chat"
        style={{
          position: "fixed", bottom: 8, left: 3612, zIndex: 60,
          background: open ? CY : "rgba(5,8,13,0.75)",
          border: `1px solid ${CY}88`, borderRadius: 6, padding: "3px 8px",
          color: open ? "#04060A" : CY, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          boxShadow: open ? `0 0 14px ${CY}` : "none", whiteSpace: "nowrap",
        }}>
        ◉ CHAT
        {history.length > 0 && (
          <span style={{
            marginLeft: 4, background: "rgba(41,231,255,0.2)", color: CY,
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{history.length}</span>
        )}
      </button>

      {/* ── main panel ───────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: 3512, zIndex: 65,
          width: 500, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.95)", border: `1px solid ${CY}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>

          {/* header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${CY}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <div>
              <span style={{
                color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12,
                textShadow: `0 0 12px ${CY}`,
              }}>◉ AGENT CHAT TRANSCRIPT</span>
              <span style={{ marginLeft: 10, color: "#6E8AA0", fontSize: 10 }}>
                {history.length} msg{history.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {thinking && (
                <span style={{
                  color: CY, fontSize: 10,
                  animation: "jtpulse 1s ease-in-out infinite",
                }}>thinking…</span>
              )}
              <button
                onClick={clearAll}
                title="Clear conversation history"
                style={{
                  background: "none", border: `1px solid ${RED}44`, borderRadius: 4,
                  color: RED, fontSize: 10, cursor: "pointer", padding: "2px 6px",
                }}>✕ clear</button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: "#6E8AA0",
                  fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}>✕</button>
            </div>
          </div>

          {/* transcript */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 14px 6px" }}>
            {history.length === 0 && !thinking && (
              <div style={{
                color: "#6E8AA0", fontSize: 11, padding: "20px 10px",
                textAlign: "center", lineHeight: 1.7,
              }}>
                Start a conversation.<br />
                Type below and press <b style={{ color: CY }}>Enter</b> to send.
              </div>
            )}

            {history.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 12,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: m.role === "user" ? "flex-end" : "flex-start",
                }}>
                <div style={{
                  maxWidth: "88%", padding: "8px 12px",
                  borderRadius: m.role === "user"
                    ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                  background: m.role === "user"
                    ? "rgba(41,231,255,0.10)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${m.role === "user" ? CY : "#2A3A4A"}33`,
                  color: m.role === "user" ? CY : "#DCEBF5",
                  fontSize: 12, lineHeight: 1.55, wordBreak: "break-word",
                }}>
                  {m.text}
                </div>
                <span style={{
                  fontSize: 9, color: "#4A6070", marginTop: 3,
                  [m.role === "user" ? "marginRight" : "marginLeft"]: 4,
                }}>
                  {m.role === "jarvis" ? "JARVIS" : "YOU"} · {formatTs(m.ts)}
                </span>
              </div>
            ))}

            {/* thinking bubble */}
            {thinking && (
              <div style={{
                marginBottom: 12, display: "flex", flexDirection: "column",
                alignItems: "flex-start",
              }}>
                <div style={{
                  padding: "8px 14px", borderRadius: "10px 10px 10px 2px",
                  background: "rgba(255,255,255,0.03)", border: "1px solid #2A3A4A33",
                  color: "#6E8AA0", fontSize: 12,
                  animation: "jtpulse 1.2s ease-in-out infinite",
                }}>
                  consulting the knowledge graph…
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* input row */}
          <div style={{
            padding: "10px 14px 12px", borderTop: `1px solid ${CY}22`,
            display: "flex", gap: 8, flexShrink: 0,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type a message… (Enter to send)"
              disabled={thinking}
              style={{
                flex: 1, background: "rgba(41,231,255,0.05)",
                border: `1px solid ${CY}44`, borderRadius: 8,
                color: "#DCEBF5", fontSize: 12, padding: "8px 12px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none",
                opacity: thinking ? 0.5 : 1,
              }}
            />
            <button
              onClick={send}
              disabled={thinking || !input.trim()}
              style={{
                background: (thinking || !input.trim()) ? "rgba(41,231,255,0.07)" : CY,
                border: `1px solid ${CY}`,
                borderRadius: 8,
                color: (thinking || !input.trim()) ? CY : "#04060A",
                fontSize: 11, letterSpacing: 1,
                cursor: (thinking || !input.trim()) ? "not-allowed" : "pointer",
                padding: "8px 14px",
                fontFamily: "'JetBrains Mono',monospace",
                whiteSpace: "nowrap",
                transition: "background 0.2s, color 0.2s",
              }}>
              {thinking ? "…" : "SEND ▶"}
            </button>
          </div>

          <style>{`
            @keyframes jtpulse {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.4; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
