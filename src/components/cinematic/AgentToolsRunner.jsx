/**
 * F31 — Agent Tools Command Runner
 * ⌘⇧T opens a palette that fetches real tool names from /v1/jarvis/agent/tools.
 * Selecting a tool fires /v1/jarvis/agent/chat with a one-shot prompt and shows the result.
 * Additive only — new file; mounted in App.jsx; does not touch protected files.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const DIM = "#4E6070";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
}

async function loadTools() {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/tools`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`tools ${r.status}`);
  const body = await r.json();
  // Accept either [{name, description}] or {tools:[...]} or {data:[...]}
  const list = Array.isArray(body) ? body
    : Array.isArray(body.tools) ? body.tools
    : Array.isArray(body.data)  ? body.data
    : [];
  return list.filter((t) => t && (t.name || t.tool_name));
}

async function runTool(toolName, description) {
  const prompt =
    `Use the tool "${toolName}"` +
    (description ? ` (${description})` : "") +
    `. Return a one-paragraph result.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ message: prompt }),
  });
  if (!r.ok) throw new Error(`chat ${r.status}`);
  const body = await r.json();
  return (
    body.response || body.message || body.text || body.result ||
    (typeof body === "string" ? body : JSON.stringify(body, null, 2))
  );
}

export default function AgentToolsRunner() {
  const [open, setOpen]       = useState(false);
  const [tools, setTools]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery]     = useState("");
  const [selected, setSelected] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelected(0);
    setResult(null);
    setError(null);
  }, []);

  // ⌘⇧T / Ctrl+Shift+T
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Load tools on open
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    loadTools()
      .then((t) => { setTools(t); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.children[selected];
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const filtered = query.trim()
    ? tools.filter((t) => {
        const name = (t.name || t.tool_name || "").toLowerCase();
        const desc = (t.description || t.desc || "").toLowerCase();
        const q = query.toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
    : tools;

  const execTool = useCallback(async (tool) => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const name = tool.name || tool.tool_name;
      const desc = tool.description || tool.desc || "";
      const res = await runTool(name, desc);
      setResult({ tool: name, text: res });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, []);

  function onKeyDown(e) {
    if (e.key === "Escape") { close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === "Enter" && filtered[selected] && !running) {
      execTool(filtered[selected]);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(0,4,10,0.75)",
          backdropFilter: "blur(5px)",
        }}
      />

      {/* Palette */}
      <div
        style={{
          position: "fixed", top: "10vh", left: "50%",
          transform: "translateX(-50%)",
          width: "min(720px, 94vw)", zIndex: 201,
          background: "rgba(4,8,16,0.98)",
          border: `1px solid ${CY}44`,
          borderRadius: 16,
          boxShadow: `0 0 100px ${CY}14, 0 32px 64px rgba(0,0,0,0.9)`,
          fontFamily: "'JetBrains Mono', monospace",
          overflow: "hidden",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "11px 18px",
          borderBottom: `1px solid ${CY}22`,
          flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 13, flexShrink: 0 }}>⚙</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={running}
            placeholder={loading ? "Loading tools…" : `Search ${tools.length} tools — Enter to run`}
            style={{
              flex: 1, background: "transparent",
              border: "none", outline: "none",
              color: "#DCEBF5", fontSize: 13, letterSpacing: 0.5,
              fontFamily: "inherit",
              opacity: running ? 0.5 : 1,
            }}
          />
          <kbd style={{
            background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}22`,
            borderRadius: 4, padding: "2px 6px",
            color: DIM, fontSize: 9, letterSpacing: 1,
          }}>
            ⌘⇧T
          </kbd>
        </div>

        {/* Tool list */}
        {!result && (
          <div ref={listRef} style={{ overflowY: "auto", flexShrink: 1 }}>
            {loading && (
              <div style={{ padding: "20px 18px", color: DIM, fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                Fetching tools from JARVIS…
              </div>
            )}
            {!loading && error && !tools.length && (
              <div style={{ padding: "20px 18px", color: "#FF3B3B", fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                {error}
              </div>
            )}
            {!loading && !tools.length && !error && (
              <div style={{ padding: "20px 18px", color: DIM, fontSize: 11, textAlign: "center", letterSpacing: 1 }}>
                No tools found
              </div>
            )}
            {filtered.map((tool, i) => {
              const name = tool.name || tool.tool_name || "?";
              const desc = tool.description || tool.desc || "";
              return (
                <div
                  key={name}
                  onClick={() => !running && execTool(tool)}
                  onMouseEnter={() => setSelected(i)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    padding: "8px 18px", cursor: running ? "wait" : "pointer",
                    background: i === selected ? `${CY}0D` : "transparent",
                    borderLeft: i === selected ? `2px solid ${CY}` : "2px solid transparent",
                  }}
                >
                  <span style={{ color: CY, fontSize: 11, flexShrink: 0, marginTop: 1 }}>▸</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: i === selected ? "#DCEBF5" : "#7A95AB",
                      fontSize: 12, letterSpacing: 0.5,
                    }}>
                      {name}
                    </div>
                    {desc && (
                      <div style={{
                        color: DIM, fontSize: 10, letterSpacing: 0.3,
                        marginTop: 2, whiteSpace: "nowrap",
                        overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {desc}
                      </div>
                    )}
                  </div>
                  {i === selected && !running && (
                    <span style={{ color: `${CY}66`, fontSize: 9, letterSpacing: 1, flexShrink: 0, marginTop: 2 }}>
                      ENTER
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Running spinner */}
        {running && (
          <div style={{ padding: "28px 18px", textAlign: "center" }}>
            <div style={{ color: CY, fontSize: 11, letterSpacing: 2, marginBottom: 6 }}>
              JARVIS RUNNING TOOL…
            </div>
            <div style={{ color: DIM, fontSize: 10, letterSpacing: 1 }}>
              Waiting for agent response
            </div>
          </div>
        )}

        {/* Result pane */}
        {result && (
          <div style={{ padding: "16px 18px", overflowY: "auto", flex: 1 }}>
            <div style={{
              color: GRN, fontSize: 10, letterSpacing: 2, marginBottom: 8,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>▸ {result.tool}</span>
              <button
                onClick={() => { setResult(null); setQuery(""); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: DIM, fontSize: 10, letterSpacing: 1,
                  fontFamily: "inherit",
                }}
              >
                BACK
              </button>
            </div>
            <div style={{
              color: "#A8C4D0", fontSize: 12, lineHeight: 1.7,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
              {result.text}
            </div>
          </div>
        )}

        {/* Error */}
        {error && result === null && !loading && !running && (
          <div style={{
            padding: "8px 18px",
            color: "#FF3B3B", fontSize: 10, letterSpacing: 1,
            borderTop: `1px solid #FF3B3B22`,
            flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{
          borderTop: `1px solid ${CY}18`,
          padding: "6px 18px",
          display: "flex", gap: 16,
          color: DIM, fontSize: 9, letterSpacing: 1,
          flexShrink: 0,
        }}>
          <span>↑↓ navigate</span>
          <span>↵ run tool</span>
          <span>ESC close</span>
          {!loading && tools.length > 0 && (
            <span style={{ marginLeft: "auto" }}>
              {filtered.length}/{tools.length} tools
            </span>
          )}
        </div>
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${CY}33; border-radius: 2px; }
      `}</style>
    </>
  );
}
