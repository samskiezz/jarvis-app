/**
 * CommandHistory — F28
 * Captures every jarvis:ask command into localStorage and lets you replay any entry.
 * No backend required — purely localStorage-persisted.
 * Toggle: ◷ HIST button at left:1636 · shortcut Alt+H.
 * Exports isHistoryQuery + buildHistoryScript for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";

const HIST_KEY  = "jarvis:cmd_history";
const MAX_ITEMS = 50;

const HIST_RE = /\b(command.hist|recent.command|show.hist|replay|last.command|what.did.i.ask|history)\b/i;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveEntry(text) {
  if (!text || !text.trim()) return;
  try {
    const hist = loadHistory();
    hist.unshift({ text: text.trim(), ts: Date.now() });
    if (hist.length > MAX_ITEMS) hist.length = MAX_ITEMS;
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  } catch (_) {}
}

export function isHistoryQuery(text) {
  return HIST_RE.test(text || "");
}

export function buildHistoryScript() {
  const hist = loadHistory();
  if (!hist.length) return "No command history recorded yet, sir.";
  const recent = hist.slice(0, 5).map((e, i) => `${i + 1}: ${e.text}`).join("; ");
  return `Command history: ${hist.length} entr${hist.length === 1 ? "y" : "ies"} recorded. Most recent — ${recent}.`;
}

export default function CommandHistory() {
  const [open, setOpen]       = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [filter, setFilter]   = useState("");

  const refresh = useCallback(() => setHistory(loadHistory()), []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query;
      if (q) {
        saveEntry(q);
        refresh();
      }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [refresh]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key === "h") { e.preventDefault(); setOpen(v => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (HIST_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  function replay(text) {
    window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text } }));
    setOpen(false);
  }

  function clearAll() {
    try { localStorage.removeItem(HIST_KEY); } catch (_) {}
    setHistory([]);
  }

  const filtered = filter.trim()
    ? history.filter(e => e.text.toLowerCase().includes(filter.toLowerCase()))
    : history;

  const count = history.length;

  return (
    <>
      {/* Bottom strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Command History (F28) · Alt+H"
        style={{
          position: "fixed", left: 1636, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◷</span>
        HIST
        {count > 0 && (
          <span style={{
            background: CY + "33", color: CY,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(480px,96vw)", maxHeight: "min(580px,80vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY, boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              COMMAND HISTORY
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {count} ENTR{count === 1 ? "Y" : "IES"} · MAX {MAX_ITEMS}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Filter input */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${CY}18` }}>
            <input
              type="text"
              placeholder="Filter commands…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 7,
                color: "#DCF0FF", padding: "5px 10px",
                fontSize: 11, outline: "none",
                fontFamily: "'JetBrains Mono',monospace",
                letterSpacing: 0.5,
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!filtered.length && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {history.length === 0 ? "NO COMMANDS RECORDED YET" : "NO MATCHES"}
              </div>
            )}

            {filtered.map((entry, i) => {
              const d = new Date(entry.ts);
              const ts = d.toLocaleTimeString("en-GB", { hour12: false }) + " " +
                         d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
              const isRecent = i === 0 && !filter;
              return (
                <div
                  key={entry.ts + i}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${CY}0C`,
                    borderLeft: `3px solid ${isRecent ? CY : CY + "44"}`,
                    display: "flex", alignItems: "center", gap: 8,
                    cursor: "default",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = CY + "0A"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{
                    color: "#4A6070", fontSize: 9, letterSpacing: 0.5,
                    minWidth: 22, textAlign: "right", flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: isRecent ? CY : "#B0CED9",
                      fontSize: 12, letterSpacing: 0.3,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {entry.text}
                    </div>
                    <div style={{ color: "#4A6070", fontSize: 9, marginTop: 2 }}>{ts}</div>
                  </div>

                  <button
                    onClick={() => replay(entry.text)}
                    title={`Replay: ${entry.text}`}
                    style={{
                      background: "transparent",
                      border: `1px solid ${GRN}55`,
                      borderRadius: 5,
                      color: GRN, cursor: "pointer",
                      padding: "3px 8px", fontSize: 10,
                      letterSpacing: 1,
                      fontFamily: "'JetBrains Mono',monospace",
                      flexShrink: 0,
                    }}
                  >
                    ▶
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>STORED IN LOCALSTORAGE</span>
            {history.length > 0 && (
              <button
                onClick={clearAll}
                style={{
                  background: "transparent",
                  border: `1px solid #FF3B3B44`,
                  borderRadius: 5, color: "#FF3B3B",
                  cursor: "pointer", padding: "2px 8px",
                  fontSize: 9, letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                  marginLeft: "auto",
                }}
              >
                CLEAR ALL
              </button>
            )}
            <span style={{ color: YLW + "88", marginLeft: history.length > 0 ? 0 : "auto" }}>
              ALT+H
            </span>
          </div>
        </div>
      )}
    </>
  );
}
