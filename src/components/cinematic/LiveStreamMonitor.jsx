/**
 * LiveStreamMonitor — F284
 * ◈ STRMMON button: left 206840, bottom 8, zIndex 380
 * Toggle: window.dispatchEvent(new Event("jarvis:strmmon-toggle"))
 * Voice triggers: "live stream", "stream monitor", "strmmon", "stream terminal", "stream feed"
 * Data: EventSource /streams/{key}  (SSE JSON frames from simulation service)
 * ASSESS: speaks about stream health + TTS via /v1/voice/tts
 */
import { useState, useEffect, useRef, useCallback } from "react";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const BTN_LEFT = 206840;
const MAX_LINES = 500;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  return (
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
    "http://localhost:8000"
  );
}

const STRMMON_RE =
  /\b(live\s+stream(?:\s+monitor)?|stream\s+monitor|strmmon\b|stream\s+terminal|stream\s+feed|stream\s+health)\b/i;

export function isStrmmonQuery(q) {
  return STRMMON_RE.test(q || "");
}

function lineColor(raw) {
  const u = (raw || "").toUpperCase();
  if (u.includes("ERROR"))  return RD;
  if (u.includes("WARN"))   return AM;
  if (u.includes("OK"))     return GN;
  if (u.includes("INFO"))   return CY;
  return "rgba(200,220,240,0.85)";
}

function fmtNow() {
  return new Date().toISOString().slice(11, 23);
}

async function speak(text) {
  try {
    const res = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(() => {});
  } catch {}
}

const STREAM_KEYS = ["brain", "alerts", "tasks"];

export default function LiveStreamMonitor() {
  const [open, setOpen]         = useState(false);
  const [key, setKey]           = useState("brain");
  const [lines, setLines]       = useState([]);
  const [connected, setConnected] = useState(false);
  const [scrollLock, setScrollLock] = useState(true);
  const [assessing, setAssessing]   = useState(false);

  const esRef    = useRef(null);
  const backRef  = useRef(1000);
  const retryRef = useRef(null);
  const panelRef = useRef(null);

  const addLine = useCallback((raw) => {
    const ts  = fmtNow();
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    setLines(prev => {
      const next = [...prev, { ts, text }];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const disconnect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    backRef.current = 1000;
    setConnected(false);
  }, []);

  const connect = useCallback((streamKey) => {
    disconnect();
    setLines([]);
    const url = `${apiBase()}/streams/${encodeURIComponent(streamKey)}`;
    const es = new EventSource(url);
    esRef.current = es;
    backRef.current = 1000;

    es.onopen = () => {
      setConnected(true);
      backRef.current = 1000;
      addLine(`[INFO] connected to stream "${streamKey}"`);
    };

    es.onmessage = (evt) => {
      let payload;
      try { payload = JSON.parse(evt.data); } catch { payload = evt.data; }
      addLine(typeof payload === "object" ? JSON.stringify(payload) : String(payload));
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;
      const delay = backRef.current;
      backRef.current = Math.min(delay * 2, 30000);
      addLine(`[WARN] stream error — reconnecting in ${(delay / 1000).toFixed(1)}s`);
      retryRef.current = setTimeout(() => connect(streamKey), delay);
    };
  }, [addLine, disconnect]);

  // auto-scroll
  useEffect(() => {
    if (scrollLock && panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }
  }, [lines, scrollLock]);

  // toggle listener
  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:strmmon-toggle", handler);
    return () => window.removeEventListener("jarvis:strmmon-toggle", handler);
  }, []);

  // cleanup on unmount
  useEffect(() => () => disconnect(), [disconnect]);

  async function handleAssess() {
    setAssessing(true);
    const recent = lines.slice(-20).map(l => `${l.ts} ${l.text}`).join("\n");
    const errors = lines.filter(l => l.text.toUpperCase().includes("ERROR")).length;
    const warns  = lines.filter(l => l.text.toUpperCase().includes("WARN")).length;
    const prompt = `Stream health summary for key "${key}": ${lines.length} total lines, ${errors} errors, ${warns} warnings. Recent lines:\n${recent}\nProvide a 2-sentence stream health assessment.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const j = await r.json();
      const text = j.response || j.message || j.answer || JSON.stringify(j);
      await speak(text);
    } catch {
      await speak(`Stream ${key}: ${lines.length} events received, ${errors} errors, ${warns} warnings.`);
    } finally {
      setAssessing(false);
    }
  }

  const errors  = lines.filter(l => l.text.toUpperCase().includes("ERROR")).length;
  const warns   = lines.filter(l => l.text.toUpperCase().includes("WARN")).length;

  return (
    <>
      {/* ◈ STRMMON dock button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed",
          bottom: 8,
          left: BTN_LEFT,
          zIndex: 380,
          background: open ? "rgba(41,231,255,0.18)" : "rgba(10,18,28,0.85)",
          border: `1px solid ${BORD}`,
          borderRadius: 6,
          color: connected ? GN : CY,
          fontFamily: "monospace",
          fontSize: 11,
          padding: "3px 8px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ STRMMON
        {lines.length > 0 && (
          <span style={{ marginLeft: 4, background: errors > 0 ? RD : "rgba(41,231,255,0.2)", borderRadius: 3, padding: "0 4px", fontSize: 10 }}>
            {lines.length}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 40,
            left: BTN_LEFT - 400,
            width: 700,
            maxHeight: 560,
            zIndex: 10380,
            background: SURF,
            border: `1px solid ${BORD}`,
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "10px 14px 8px", borderBottom: `1px solid ${BORD}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 13 }}>◈ LIVE STREAM MONITOR</span>
            <span style={{ color: connected ? GN : "rgba(200,200,200,0.4)", fontSize: 11, marginLeft: 4 }}>
              {connected ? "● LIVE" : "○ IDLE"}
            </span>
            <span style={{ color: "rgba(200,220,240,0.5)", fontSize: 11 }}>{lines.length} lines</span>
            {errors > 0 && <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>{errors} ERR</span>}
            {warns  > 0 && <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>{warns} WARN</span>}
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={() => setScrollLock(s => !s)}
                style={{ background: scrollLock ? "rgba(41,231,255,0.15)" : "transparent", border: `1px solid ${BORD}`, borderRadius: 4, color: CY, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
              >
                {scrollLock ? "LOCK ↓" : "UNLOCK"}
              </button>
              <button
                onClick={handleAssess}
                disabled={assessing || lines.length === 0}
                style={{ background: "rgba(41,231,255,0.12)", border: `1px solid ${BORD}`, borderRadius: 4, color: CY, fontSize: 10, padding: "2px 8px", cursor: "pointer", opacity: assessing || lines.length === 0 ? 0.5 : 1 }}
              >
                {assessing ? "..." : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "transparent", border: "none", color: "rgba(200,220,240,0.5)", fontSize: 14, cursor: "pointer", padding: "0 4px" }}
              >×</button>
            </div>
          </div>

          {/* Controls */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORD}`, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: "rgba(200,220,240,0.6)", fontSize: 11 }}>Key:</span>
            <input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="stream key"
              style={{ background: "rgba(41,231,255,0.06)", border: `1px solid ${BORD}`, borderRadius: 4, color: CY, fontFamily: "monospace", fontSize: 11, padding: "2px 8px", width: 120 }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {STREAM_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => setKey(k)}
                  style={{ background: key === k ? "rgba(41,231,255,0.18)" : "transparent", border: `1px solid ${BORD}`, borderRadius: 4, color: CY, fontSize: 10, padding: "2px 6px", cursor: "pointer" }}
                >
                  {k}
                </button>
              ))}
            </div>
            {!connected ? (
              <button
                onClick={() => connect(key)}
                style={{ background: "rgba(74,222,128,0.15)", border: `1px solid ${GN}`, borderRadius: 4, color: GN, fontSize: 11, padding: "2px 10px", cursor: "pointer", marginLeft: "auto" }}
              >
                ▶ CONNECT
              </button>
            ) : (
              <button
                onClick={disconnect}
                style={{ background: "rgba(248,113,113,0.15)", border: `1px solid ${RD}`, borderRadius: 4, color: RD, fontSize: 11, padding: "2px 10px", cursor: "pointer", marginLeft: "auto" }}
              >
                ■ DISCONNECT
              </button>
            )}
          </div>

          {/* Stream panel */}
          <div
            ref={panelRef}
            style={{
              flex: 1,
              overflowY: "auto",
              background: "rgba(5,10,18,0.98)",
              padding: "8px 12px",
              fontSize: 11,
              lineHeight: 1.6,
              minHeight: 300,
              maxHeight: 380,
            }}
          >
            {lines.length === 0 ? (
              <div style={{ color: "rgba(200,220,240,0.3)", paddingTop: 20, textAlign: "center" }}>
                Select a stream key and click CONNECT
              </div>
            ) : (
              lines.map((l, i) => (
                <div key={i} style={{ color: lineColor(l.text), whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  <span style={{ color: "rgba(41,231,255,0.4)", marginRight: 8 }}>{l.ts}</span>
                  {l.text}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
