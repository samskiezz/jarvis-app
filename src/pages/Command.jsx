/**
 * Command — a lean terminal-style command console.
 * A single prompt streams replies from the JARVIS analystChat SSE endpoint into
 * a scrollback log. No frills: type, hit enter, watch the analyst respond live.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C } from "@/domain/colors";
import { appParams } from "@/lib/app-params";
import { PageShell, PanelCard } from "@/components/PageKit";

const ACCENT = C.neon;

// Stream analystChat SSE, calling onToken(fullText) as text arrives.
async function streamAnalyst(message, onToken, signal) {
  const headers = { "Content-Type": "application/json" };
  if (appParams.apiKey) headers.Authorization = `Bearer ${appParams.apiKey}`;
  const res = await fetch(`${appParams.apiBaseUrl}/functions/analystChat`, {
    method: "POST", headers, body: JSON.stringify({ message }), signal,
  });
  if (!res.ok || !res.body) throw new Error(`analystChat ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() || "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return full;
      try { full += JSON.parse(data); onToken(full); } catch { /* skip frame */ }
    }
  }
  return full;
}

export default function Command() {
  // log entries: { role: "cmd" | "out" | "err", text }
  const [log, setLog] = useState([
    { role: "out", text: "JARVIS command console online. Type a query and press ENTER." },
  ]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const logRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const submit = useCallback(async (e) => {
    e?.preventDefault();
    const msg = draft.trim();
    if (!msg || streaming) return;
    setDraft("");
    setStreaming(true);

    // Push the command, then an empty output slot we stream into.
    const idx = { current: -1 };
    setLog((l) => {
      idx.current = l.length + 1;
      return [...l, { role: "cmd", text: msg }, { role: "out", text: "" }];
    });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamAnalyst(msg, (text) => {
        setLog((l) => l.map((row, i) => (i === idx.current ? { ...row, text } : row)));
      }, ctrl.signal);
    } catch (err) {
      if (err.name !== "AbortError") {
        setLog((l) => l.map((row, i) => (
          i === idx.current ? { role: "err", text: "analyst link unavailable." } : row
        )));
      }
    } finally {
      setStreaming(false);
    }
  }, [draft, streaming]);

  const colorFor = (role) => (role === "cmd" ? C.blue : role === "err" ? C.red : "#cfe9dc");
  const prefixFor = (role) => (role === "cmd" ? "sam@jarvis $ " : role === "err" ? "⚠ " : "» ");

  return (
    <PageShell
      title="COMMAND"
      subtitle="JARVIS ANALYST CONSOLE · LIVE SSE STREAM"
      accent={ACCENT}
      actions={
        <button
          onClick={() => { abortRef.current?.abort(); setLog([]); inputRef.current?.focus(); }}
          style={{
            background: ACCENT + "1a", border: `1px solid ${ACCENT}55`, color: ACCENT,
            fontFamily: "inherit", fontSize: 10, letterSpacing: 2, padding: "7px 14px",
            borderRadius: 5, cursor: "pointer", fontWeight: 700,
          }}
        >⌫ CLEAR</button>
      }
    >
      <PanelCard
        title="CONSOLE"
        accent={ACCENT}
        right={streaming ? <span style={{ fontSize: 8, color: ACCENT }}>◌ STREAMING</span> : null}
      >
        <div
          ref={logRef}
          onClick={() => inputRef.current?.focus()}
          style={{
            height: "56vh", overflowY: "auto", padding: 12, borderRadius: 5,
            background: "rgba(0,0,0,0.45)", border: `1px solid ${C.border}`,
            fontSize: 12, lineHeight: 1.6, cursor: "text",
          }}
        >
          {log.length === 0 && (
            <div style={{ color: C.text }}>// scrollback cleared</div>
          )}
          {log.map((row, i) => (
            <div key={i} style={{ color: colorFor(row.role), whiteSpace: "pre-wrap", marginBottom: 6 }}>
              <span style={{ color: row.role === "cmd" ? C.blue : C.text, opacity: 0.75 }}>{prefixFor(row.role)}</span>
              {row.text}
              {streaming && i === log.length - 1 && row.role === "out" && (
                <span style={{ color: ACCENT }}>▌</span>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ color: ACCENT, fontSize: 12, fontWeight: 700 }}>sam@jarvis $</span>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            placeholder={streaming ? "streaming…" : "enter command"}
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              color: C.textB, fontSize: 12, fontFamily: "inherit",
            }}
          />
        </form>
      </PanelCard>
    </PageShell>
  );
}
