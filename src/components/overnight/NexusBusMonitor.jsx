/**
 * NexusBusMonitor — F76
 * Right-edge slide-in at 38 % vertical.
 * Stats:  GET /v1/bus/stats   (30-s poll) → { events, streams, consumers }
 * Events: GET /v1/bus/poll?consumer=nexus-monitor&limit=30 (15-s poll)
 *         → { events: [{ seq, ts, stream, type, payload, actor }] }
 * Builds a rolling 50-event buffer; accent: purple (#A855F7).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const STATS_MS  = 30_000;
const EVENTS_MS = 15_000;
const DRAWER_W  = 320;
const MAX_BUF   = 50;
const PURPLE    = "#A855F7";

const STREAM_PALETTE = {
  nexus:     "#A855F7",
  jarvis:    "#38BDF8",
  ops:       "#F87171",
  forge:     "#84CC16",
  swarm:     "#FB923C",
  cinematic: "#34D399",
  brain:     "#60A5FA",
  audit:     "#FBBF24",
};
function streamColor(s) {
  return STREAM_PALETTE[s] ?? "#9CA3AF";
}

function relTime(ts_ms) {
  if (!ts_ms) return "—";
  const diff = Math.floor((Date.now() - ts_ms) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function payloadExcerpt(p) {
  if (!p || typeof p !== "object" || Object.keys(p).length === 0) return "";
  const s = JSON.stringify(p);
  return s.length > 50 ? s.slice(0, 50) + "…" : s;
}

function StreamChip({ name }) {
  const c = streamColor(name);
  return (
    <span style={{
      fontFamily: S.mono, fontSize: 8,
      color: c, border: `1px solid ${c}55`, borderRadius: 3,
      padding: "1px 4px", letterSpacing: 0.8, flexShrink: 0,
    }}>
      {name}
    </span>
  );
}

export default function NexusBusMonitor() {
  const [open,     setOpen]     = useState(false);
  const [stats,    setStats]    = useState(null);
  const [statsErr, setStatsErr] = useState(false);
  const [events,   setEvents]   = useState([]);

  const [statsTick,  bumpStats]  = useReducer((n) => n + 1, 0);
  const [eventsTick, bumpEvents] = useReducer((n) => n + 1, 0);
  const statsTimer  = useRef(null);
  const eventsTimer = useRef(null);

  // Stats — 30 s poll
  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/bus/stats")
      .then((d) => { if (alive) { setStats(d); setStatsErr(false); } })
      .catch(() => { if (alive) setStatsErr(true); });
    statsTimer.current = setTimeout(() => { if (alive) bumpStats(); }, STATS_MS);
    return () => { alive = false; clearTimeout(statsTimer.current); };
  }, [open, statsTick]);

  // Events — 15 s poll; builds rolling buffer (newest first)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/v1/bus/poll?consumer=nexus-monitor&limit=30")
      .then((d) => {
        if (!alive) return;
        const incoming = Array.isArray(d?.events) ? d.events : [];
        if (incoming.length > 0) {
          setEvents((prev) => {
            // newest first
            const merged = [...incoming.slice().reverse(), ...prev];
            return merged.slice(0, MAX_BUF);
          });
        }
      })
      .catch(() => {});
    eventsTimer.current = setTimeout(() => { if (alive) bumpEvents(); }, EVENTS_MS);
    return () => { alive = false; clearTimeout(eventsTimer.current); };
  }, [open, eventsTick]);

  const totalEvents = stats?.events ?? 0;
  const streams     = Array.isArray(stats?.streams) ? stats.streams : [];
  const consumers   = stats?.consumers ?? 0;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Nexus Event Bus — GET /v1/bus/stats + /v1/bus/poll"
        style={{
          position: "fixed", right: open ? DRAWER_W : 0, top: "38%",
          zIndex: 120, cursor: "pointer",
          background: open ? PURPLE : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : PURPLE,
          border: `1px solid ${PURPLE}77`,
          borderRight: open ? "none" : `1px solid ${PURPLE}77`,
          borderRadius: "6px 0 0 6px",
          padding: "6px 5px",
          fontSize: 9, fontFamily: S.mono, letterSpacing: 1.5,
          writingMode: "vertical-rl", textOrientation: "mixed",
          userSelect: "none", backdropFilter: "blur(6px)",
          boxShadow: `0 0 14px ${PURPLE}33`,
          transition: "right 0.25s ease",
        }}
      >
        BUS {events.length > 0 ? `(${events.length})` : "▶"}
      </div>

      {/* Drawer */}
      <div style={{
        position: "fixed", right: open ? 0 : -DRAWER_W - 2, top: 0, bottom: 0,
        width: DRAWER_W, zIndex: 119,
        background: "rgba(5,8,13,0.93)", borderLeft: `1px solid ${PURPLE}44`,
        backdropFilter: "blur(12px)", display: "flex", flexDirection: "column",
        transition: "right 0.25s ease",
        fontFamily: S.mono, color: "#DCEBF5",
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px", borderBottom: `1px solid ${PURPLE}33`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ color: PURPLE, fontSize: 10, letterSpacing: 2, fontWeight: 700 }}>
              NEXUS EVENT BUS
            </span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6B7280" }}>
              {stats === null ? "…" : statsErr ? "ERR" : `Σ ${totalEvents}`}
            </span>
          </div>

          {/* Counters */}
          {stats && !statsErr && (
            <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: "#9CA3AF" }}>
                <span style={{ color: PURPLE }}>consumers</span> {consumers}
              </span>
              <span style={{ fontSize: 9, color: "#9CA3AF" }}>
                <span style={{ color: PURPLE }}>streams</span> {streams.length}
              </span>
            </div>
          )}

          {/* Stream chips */}
          {streams.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {streams.map((s) => <StreamChip key={s} name={s} />)}
            </div>
          )}
        </div>

        {/* Event feed */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {events.length === 0 && (
            <div style={{ padding: "14px", color: "#6B7280", fontSize: 10, textAlign: "center" }}>
              AWAITING EVENTS…
            </div>
          )}
          {events.map((e, i) => {
            const excerpt = payloadExcerpt(e.payload);
            return (
              <div key={`${e.seq}-${i}`} style={{
                padding: "6px 14px", borderBottom: `1px solid ${PURPLE}0F`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                  <span style={{
                    fontSize: 8, color: "#374151",
                    border: "1px solid #374151", borderRadius: 3,
                    padding: "0 3px", flexShrink: 0,
                  }}>
                    #{e.seq}
                  </span>
                  <StreamChip name={e.stream} />
                  <span style={{
                    fontSize: 10, color: "#E2E8F0",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1,
                  }}>
                    {e.type}
                  </span>
                  <span style={{ fontSize: 8, color: "#4B5563", flexShrink: 0 }}>
                    {relTime(e.ts)}
                  </span>
                </div>
                {(e.actor && e.actor !== "system" || excerpt) && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {e.actor && e.actor !== "system" && (
                      <span style={{ fontSize: 8, color: "#6B7280", flexShrink: 0 }}>
                        @{e.actor}
                      </span>
                    )}
                    {excerpt && (
                      <span style={{
                        fontSize: 8, color: "#374151",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {excerpt}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${PURPLE}22`,
          fontSize: 9, color: "#374151", letterSpacing: 1,
        }}>
          /v1/bus/stats · 30 s · /v1/bus/poll · 15 s
        </div>
      </div>
    </>
  );
}
