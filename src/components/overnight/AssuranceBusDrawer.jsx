/**
 * AssuranceBusDrawer — F161
 * Left-edge slide-in drawer showing the JARVIS assurance command + event bus
 * history. Dual-tab: CMDS (GET /assurance/commands) and EVTS (GET /assurance/events).
 *
 * Polls every 90 s; tab label shows recent-item count.
 * Accent: indigo (#6366F1). Tab: left-edge at 39% from top.
 * Mount point: src/Layout.jsx after <AssuranceInvariantsDrawer />.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS = 90_000;
const INDIGO = "#6366F1";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const HEADERS = { Authorization: `Bearer ${API_KEY}` };

function relTime(ts) {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function shortId(id) {
  if (!id) return "—";
  const parts = id.split("-");
  return parts[parts.length - 1] || id.slice(-8);
}

export default function AssuranceBusDrawer() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("cmds");
  const [cmds, setCmds] = useState([]);
  const [evts, setEvts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetchBus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [cr, er] = await Promise.all([
        fetch(`${base}/assurance/commands?limit=40`, { headers: HEADERS }),
        fetch(`${base}/assurance/events?limit=40`, { headers: HEADERS }),
      ]);
      if (cr.ok) {
        const d = await cr.json();
        setCmds(d.items || []);
      }
      if (er.ok) {
        const d = await er.json();
        setEvts(d.items || []);
      }
      if (!cr.ok && !er.ok) throw new Error(`HTTP ${cr.status}`);
    } catch (e) {
      setError(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBus();
    timerRef.current = setInterval(fetchBus, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchBus]);

  const tabStyle = {
    position: "fixed",
    left: 0,
    top: "39%",
    transform: "translateY(-50%) rotate(-90deg) translateX(-50%)",
    transformOrigin: "left center",
    zIndex: 200,
    background: open ? INDIGO : "rgba(8,14,22,0.85)",
    color: open ? "#fff" : INDIGO,
    border: `1px solid ${INDIGO}55`,
    borderRadius: "0 0 6px 6px",
    padding: "4px 12px",
    fontSize: 10,
    letterSpacing: 2,
    cursor: "pointer",
    fontFamily: "'JetBrains Mono', monospace",
    whiteSpace: "nowrap",
  };

  const panelStyle = {
    position: "fixed",
    left: open ? 0 : -380,
    top: 0,
    height: "100vh",
    width: 360,
    background: "rgba(6,10,18,0.97)",
    borderRight: `1px solid ${INDIGO}44`,
    boxShadow: open ? `4px 0 40px ${INDIGO}22` : "none",
    zIndex: 199,
    display: "flex",
    flexDirection: "column",
    transition: "left 0.28s ease",
    fontFamily: "'JetBrains Mono', monospace",
  };

  const activeItems = tab === "cmds" ? cmds : evts;

  return (
    <>
      <button onClick={() => setOpen((v) => !v)} style={tabStyle} title="Assurance Bus">
        ◈ BUS ({cmds.length}/{evts.length})
      </button>

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          borderBottom: `1px solid ${INDIGO}33`,
          padding: "14px 16px 10px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: INDIGO, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              ASSURANCE BUS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 6 }}>
            {[["cmds", `CMDS (${cmds.length})`], ["evts", `EVTS (${evts.length})`]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                style={{
                  background: tab === key ? `${INDIGO}33` : "transparent",
                  border: `1px solid ${tab === key ? INDIGO : INDIGO + "33"}`,
                  borderRadius: 4,
                  color: tab === key ? "#DCEBF5" : "#4A6278",
                  fontSize: 10,
                  letterSpacing: 1,
                  padding: "3px 10px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={fetchBus}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${INDIGO}33`,
                borderRadius: 4,
                color: INDIGO,
                fontSize: 10,
                padding: "3px 8px",
                cursor: loading ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? "…" : "↻"}
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {error && (
            <div style={{ color: "#F87171", fontSize: 10, padding: "10px 16px" }}>
              {error}
            </div>
          )}

          {activeItems.length === 0 && !loading && !error && (
            <div style={{ color: "#4A6278", fontSize: 11, padding: "18px 16px" }}>
              {tab === "cmds" ? "No commands in history" : "No events in history"}
            </div>
          )}

          {tab === "cmds" && cmds.map((c, i) => {
            const ok = c.ok !== false && !c.error;
            return (
              <div key={c.command_id || i} style={{
                padding: "8px 16px",
                borderBottom: "1px solid #0D1824",
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{
                    padding: "1px 5px", borderRadius: 3, fontSize: 9, letterSpacing: 1,
                    background: ok ? "#052e1680" : "#450a1480",
                    color: ok ? "#34D399" : "#F87171",
                    border: `1px solid ${ok ? "#34D39933" : "#F8717133"}`,
                    flexShrink: 0,
                  }}>
                    {ok ? "OK" : "ERR"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, wordBreak: "break-all" }}>
                    {c.name || "—"}
                  </span>
                  <span style={{ color: "#4A6278", fontSize: 9, flexShrink: 0 }}>
                    {relTime(c.finished_at || c.timestamp)}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {c.actor && (
                    <span style={{ color: "#6E8AA0", fontSize: 9 }}>
                      actor: <span style={{ color: INDIGO }}>{c.actor}</span>
                    </span>
                  )}
                  {c.command_id && (
                    <span style={{ color: "#4A6278", fontSize: 9 }}>
                      id: {shortId(c.command_id)}
                    </span>
                  )}
                  {c.error && (
                    <span style={{ color: "#F87171", fontSize: 9, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.error}
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {tab === "evts" && evts.map((e, i) => (
            <div key={e.event_id || i} style={{
              padding: "8px 16px",
              borderBottom: "1px solid #0D1824",
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  padding: "1px 5px", borderRadius: 3, fontSize: 9, letterSpacing: 1,
                  background: `${INDIGO}22`,
                  color: INDIGO,
                  border: `1px solid ${INDIGO}44`,
                  flexShrink: 0,
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {(e.name || "evt").replace("command.", "cmd.").replace("assurance.", "")}
                </span>
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {e.actor || e.source || "—"}
                </span>
                <span style={{ color: "#4A6278", fontSize: 9, flexShrink: 0 }}>
                  {relTime(e.timestamp)}
                </span>
              </div>
              {e.source && e.source !== e.actor && (
                <span style={{ color: "#4A6278", fontSize: 9 }}>
                  src: {e.source}
                </span>
              )}
              {e.correlation_id && (
                <span style={{ color: "#2A3844", fontSize: 9 }}>
                  corr: {shortId(e.correlation_id)}
                </span>
              )}
            </div>
          ))}
        </div>

        <div style={{ color: "#2A3844", fontSize: 9, padding: "6px 16px", borderTop: `1px solid ${INDIGO}22`, flexShrink: 0 }}>
          GET /assurance/commands + /events · poll 90 s
        </div>
      </div>
    </>
  );
}
