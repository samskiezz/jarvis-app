/**
 * AgentConsole — interactive full-page chat terminal backed by the real JARVIS
 * agentic loop.
 * Endpoint: POST /v1/jarvis/agent/chat  { message, history }
 *   → { answer, trace, backend, steps, used_tools }
 * Features: multi-turn history, per-turn tool trace expansion, stat tiles
 *   (turns, tools invoked, last backend), input with Ctrl+Enter send, 💬.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { COLORS as C } from "@/domain/colors";
import { PageShell, PanelCard, StatTile } from "@/components/PageKit";
import { apiPost } from "@/lib/wave1";

const ACCENT = "#22D3EE"; // cyan — agent / reasoning tier

/* ── helpers ── */
function relTs(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

function toolKey(t, i) {
  return t?.tool || t?.name || t?.id || String(i);
}

function asList(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

/* ── ToolTraceRow: one step/tool call in the trace ── */
function ToolTraceRow({ step }) {
  const [open, setOpen] = useState(false);
  const name   = step?.tool || step?.name || step?.action || "step";
  const status = step?.status || step?.result?.status || "";
  const ok     = !status || status === "ok" || status === "success";
  const dot    = ok ? (C.green || "#4ADE80") : (C.red || "#EF4444");

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          padding: "4px 8px", borderRadius: 4,
          background: "rgba(255,255,255,0.03)",
          fontFamily: "monospace", fontSize: 10,
        }}
      >
        <span style={{ color: dot, fontSize: 8 }}>●</span>
        <span style={{ color: ACCENT, minWidth: 140, flexShrink: 0 }}>{name}</span>
        {status && (
          <span style={{ color: ok ? (C.green || "#4ADE80") : (C.red || "#EF4444"), fontSize: 9 }}>
            {status.toUpperCase()}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: "#475569", fontSize: 9 }}>
          {open ? "▲" : "▼"}
        </span>
      </div>
      {open && (
        <pre style={{
          margin: "4px 0 4px 16px", padding: 8, borderRadius: 4,
          background: "rgba(0,0,0,0.35)", color: "#94A3B8",
          fontSize: 9, lineHeight: 1.5, overflowX: "auto",
          maxHeight: 200, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {JSON.stringify(step, null, 2)}
        </pre>
      )}
    </div>
  );
}

/* ── TurnBubble: one chat turn (user + assistant) ── */
function TurnBubble({ turn }) {
  const [traceOpen, setTraceOpen] = useState(false);
  const steps      = asList(turn.trace || turn.steps);
  const usedTools  = asList(turn.used_tools);
  const hasTrace   = steps.length > 0;
  const backend    = turn.backend || "";

  return (
    <div style={{ marginBottom: 20 }}>
      {/* user message */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
        <div style={{
          maxWidth: "75%", padding: "8px 14px", borderRadius: "12px 12px 2px 12px",
          background: `${ACCENT}22`, border: `1px solid ${ACCENT}44`,
          color: C.text || "#E2E8F0", fontSize: 12, lineHeight: 1.6,
          fontFamily: "monospace",
        }}>
          {turn.message}
        </div>
      </div>

      {/* assistant answer */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
          background: `${ACCENT}33`, border: `1px solid ${ACCENT}66`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: ACCENT,
        }}>J</div>
        <div style={{ flex: 1 }}>
          <div style={{
            padding: "10px 14px", borderRadius: "2px 12px 12px 12px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
            color: C.textB || "#CBD5E1", fontSize: 12, lineHeight: 1.7,
            whiteSpace: "pre-wrap", fontFamily: "monospace",
          }}>
            {turn.loading
              ? <span style={{ color: ACCENT, opacity: 0.7 }}>◌ thinking…</span>
              : turn.error
                ? <span style={{ color: C.red || "#EF4444" }}>⚠ {turn.error}</span>
                : (turn.answer || <span style={{ color: "#475569" }}>—</span>)
            }
          </div>

          {/* meta row */}
          <div style={{
            display: "flex", gap: 12, marginTop: 4, fontSize: 9,
            color: "#475569", fontFamily: "monospace",
          }}>
            {relTs(turn.ts) && <span>{relTs(turn.ts)}</span>}
            {backend && <span style={{ color: `${ACCENT}99` }}>via {backend}</span>}
            {usedTools.length > 0 && (
              <span style={{ color: ACCENT }}>
                {usedTools.length} tool{usedTools.length !== 1 ? "s" : ""} used
              </span>
            )}
            {hasTrace && !turn.loading && (
              <span
                onClick={() => setTraceOpen(o => !o)}
                style={{ cursor: "pointer", color: ACCENT, textDecoration: "underline" }}
              >
                {traceOpen ? "hide trace" : `show trace (${steps.length})`}
              </span>
            )}
          </div>

          {/* tool trace */}
          {traceOpen && hasTrace && (
            <div style={{
              marginTop: 8, padding: 8, borderRadius: 6,
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div style={{ fontSize: 9, color: "#475569", marginBottom: 6, fontFamily: "monospace" }}>
                TOOL TRACE
              </div>
              {steps.map((step, i) => (
                <ToolTraceRow key={toolKey(step, i)} step={step} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────────────────────── */
export default function AgentConsole() {
  const [history, setHistory] = useState([]);   // array of TurnBubble data
  const [input, setInput]     = useState("");
  const [busy, setBusy]       = useState(false);
  const bottomRef = useRef(null);
  const textRef   = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const totalTools = history.reduce((n, t) => n + asList(t.used_tools).length, 0);
  const lastBackend = [...history].reverse().find(t => t.backend)?.backend || "—";

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput("");
    setBusy(true);

    const turnHistory = history.map(t => ({ role: "user", content: t.message }));

    const placeholder = {
      message: msg,
      answer: null,
      trace: [],
      steps: [],
      used_tools: [],
      backend: "",
      loading: true,
      error: null,
      ts: new Date().toISOString(),
    };
    setHistory(prev => [...prev, placeholder]);

    try {
      const res = await apiPost("/v1/jarvis/agent/chat", {
        message: msg,
        history: turnHistory,
      });
      setHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          message: msg,
          answer:     res.answer || res.reply || res.result || "",
          trace:      asList(res.trace),
          steps:      asList(res.steps),
          used_tools: asList(res.used_tools),
          backend:    res.backend || res.provider || "",
          loading:    false,
          error:      null,
          ts:         placeholder.ts,
        };
        return next;
      });
    } catch (err) {
      setHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          ...placeholder,
          loading: false,
          error: err?.message || "Request failed",
        };
        return next;
      });
    } finally {
      setBusy(false);
      textRef.current?.focus();
    }
  }, [input, busy, history]);

  const onKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  }, [send]);

  return (
    <PageShell title="Agent Console" subtitle="interactive agentic chat · POST /v1/jarvis/agent/chat" accent={ACCENT}>
      {/* stat tiles */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StatTile label="TURNS" value={history.filter(t => !t.loading).length} accent={ACCENT} />
        <StatTile label="TOOLS INVOKED" value={totalTools} accent={ACCENT} />
        <StatTile label="LAST BACKEND" value={lastBackend} accent={ACCENT} />
      </div>

      {/* conversation panel */}
      <PanelCard title="Conversation" accent={ACCENT}>
        <div style={{
          minHeight: 340, maxHeight: "55vh", overflowY: "auto",
          padding: "8px 4px",
        }}>
          {history.length === 0 && (
            <div style={{
              textAlign: "center", color: "#475569", fontSize: 11,
              padding: "60px 20px", fontFamily: "monospace",
            }}>
              Send a message to start a conversation with the JARVIS agent.<br />
              <span style={{ fontSize: 9, color: "#334155" }}>
                The agent can call tools, inspect live system state, and chain reasoning steps.
              </span>
            </div>
          )}
          {history.map((turn, i) => (
            <TurnBubble key={i} turn={turn} />
          ))}
          <div ref={bottomRef} />
        </div>
      </PanelCard>

      {/* input area */}
      <PanelCard title="Message" accent={ACCENT} style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea
            ref={textRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={busy}
            placeholder="Ask JARVIS anything… (Ctrl+Enter to send)"
            rows={3}
            style={{
              flex: 1, resize: "vertical", minHeight: 64,
              background: "rgba(0,0,0,0.35)", border: `1px solid ${ACCENT}44`,
              borderRadius: 6, color: C.text || "#E2E8F0",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 12,
              padding: "8px 12px", outline: "none", lineHeight: 1.5,
              opacity: busy ? 0.6 : 1,
            }}
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            style={{
              padding: "10px 22px", borderRadius: 6, fontSize: 11,
              fontFamily: "monospace", letterSpacing: 1, cursor: "pointer",
              background: busy || !input.trim() ? "rgba(255,255,255,0.06)" : `${ACCENT}22`,
              border: `1px solid ${busy || !input.trim() ? "#334155" : ACCENT}`,
              color: busy || !input.trim() ? "#475569" : ACCENT,
              transition: "all 0.15s",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "◌ THINKING" : "▶ SEND"}
          </button>
        </div>
        <div style={{ fontSize: 9, color: "#334155", marginTop: 6, fontFamily: "monospace" }}>
          Ctrl+Enter to send · tool traces expand per-turn · POST /v1/jarvis/agent/chat
        </div>
      </PanelCard>
    </PageShell>
  );
}
