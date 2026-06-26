/**
 * EventBackboneMonitor — F123
 * Right-edge slide-in drawer at 11 % vertical.
 * Polls GET /v1/jarvis/events/stats every 30 s.
 * Clicking a stream chip loads GET /v1/jarvis/events/project/{stream}
 * and shows event-type counts + last event preview.
 */
import { useEffect, useRef, useState } from "react";

const ACC = "#818CF8";   // indigo-400
const BG  = "rgba(4,10,18,0.97)";
const BORDER = `1px solid ${ACC}33`;
const MONO = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 30_000;

const STREAM_COLORS = [
  "#06B6D4","#22D3EE","#A78BFA","#F472B6","#34D399",
  "#FBBF24","#F87171","#60A5FA","#4ADE80","#C084FC",
];

function streamColor(i) {
  return STREAM_COLORS[i % STREAM_COLORS.length];
}

function Row({ k, v }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between",
      fontSize: 9, color: "#C0DCE8", marginBottom: 2,
    }}>
      <span style={{ color: "#4A6070" }}>{k}</span>
      <span>{String(v ?? "—")}</span>
    </div>
  );
}

function StreamProjection({ stream, onClose }) {
  const [proj, setProj] = useState(null);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    fetch(`/v1/jarvis/events/project/${encodeURIComponent(stream)}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setProj(d))
      .catch(e => setErr(String(e)));
  }, [stream]);

  return (
    <div style={{
      margin: "6px 10px",
      background: `${ACC}08`,
      border: `1px solid ${ACC}22`,
      borderRadius: 6,
      padding: "8px 10px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 6,
      }}>
        <span style={{ color: ACC, fontSize: 9, letterSpacing: 1.5 }}>
          {stream}
        </span>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "#4A6070",
            fontSize: 11, cursor: "pointer", padding: "0 4px",
          }}
        >✕</button>
      </div>

      {err && (
        <div style={{ color: "#F87171", fontSize: 9 }}>⚠ {err}</div>
      )}

      {!proj && !err && (
        <div style={{ color: "#3A5060", fontSize: 9 }}>LOADING…</div>
      )}

      {proj && (
        <>
          <Row k="total events" v={proj.events} />
          {proj.by_type && Object.keys(proj.by_type).length > 0 && (
            <div style={{ marginTop: 4 }}>
              <div style={{
                fontSize: 8, color: "#4A6070", letterSpacing: 1.5, marginBottom: 3,
              }}>
                BY TYPE
              </div>
              {Object.entries(proj.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} style={{
                    display: "flex", justifyContent: "space-between",
                    fontSize: 9, color: "#8AA8BC", marginBottom: 2,
                  }}>
                    <span>{type}</span>
                    <span style={{ color: "#C0DCE8" }}>{count}</span>
                  </div>
                ))
              }
            </div>
          )}
          {proj.last && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${ACC}11` }}>
              <div style={{ fontSize: 8, color: "#4A6070", letterSpacing: 1.5, marginBottom: 3 }}>
                LAST EVENT
              </div>
              <div style={{ fontSize: 9, color: "#A0BCC8" }}>
                {proj.last.type || "—"}
              </div>
              {proj.last.actor && (
                <div style={{ fontSize: 8, color: "#4A6070" }}>
                  by {proj.last.actor}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function EventBackboneMonitor() {
  const [open, setOpen]         = useState(false);
  const [stats, setStats]       = useState(null);
  const [err, setErr]           = useState(null);
  const [selected, setSelected] = useState(null);
  const timerRef = useRef(null);

  async function fetchStats() {
    try {
      const res = await fetch("/v1/jarvis/events/stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchStats();
    timerRef.current = setInterval(fetchStats, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const streams = stats?.streams || [];

  return (
    <>
      {/* Tab button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", right: open ? 340 : 0, top: "11%",
          zIndex: 1200, writingMode: "vertical-rl", textOrientation: "mixed",
          background: open ? `${ACC}22` : BG,
          border: BORDER, borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: ACC, fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "10px 5px", cursor: "pointer",
          transition: "right 0.22s ease",
        }}
        title="Event Backbone Monitor (F123)"
      >
        EVT ◀
      </button>

      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: open ? 0 : -340,
        width: 340, height: "100vh", zIndex: 1199,
        background: BG, backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderLeft: `1px solid ${ACC}33`,
        display: "flex", flexDirection: "column",
        transition: "right 0.22s ease",
        fontFamily: MONO,
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${ACC}22`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: ACC, fontSize: 10, letterSpacing: 2.5 }}>
            ⬡ EVENT BACKBONE
          </span>
          {stats && (
            <span style={{
              background: `${ACC}22`, color: ACC,
              border: `1px solid ${ACC}44`,
              fontSize: 9, letterSpacing: 1.5,
              padding: "2px 7px", borderRadius: 4,
            }}>
              {stats.events} EVT
            </span>
          )}
        </div>

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 14px", color: "#F87171", fontSize: 9 }}>
            ⚠ {err}
          </div>
        )}

        {/* Loading */}
        {open && !stats && !err && (
          <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 9 }}>
            FETCHING…
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1 }}>
          {stats && (
            <>
              {/* Stats tiles */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr",
                gap: 6, padding: "10px 10px 4px",
              }}>
                {[
                  { label: "EVENTS", value: stats.events ?? 0 },
                  { label: "CONSUMERS", value: stats.consumers ?? 0 },
                ].map(({ label, value }) => (
                  <div key={label} style={{
                    background: `${ACC}08`,
                    border: `1px solid ${ACC}22`,
                    borderRadius: 6,
                    padding: "8px 10px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 14, color: ACC, fontWeight: 600 }}>
                      {value}
                    </div>
                    <div style={{ fontSize: 8, color: "#4A6070", letterSpacing: 1.5, marginTop: 2 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Streams */}
              <div style={{ padding: "8px 10px 4px" }}>
                <div style={{
                  fontSize: 8, color: "#4A6070", letterSpacing: 1.5, marginBottom: 6,
                }}>
                  STREAMS ({streams.length})
                </div>
                {streams.length === 0 && (
                  <div style={{ fontSize: 9, color: "#3A5060", padding: "4px 0" }}>
                    NO STREAMS REGISTERED
                  </div>
                )}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {streams.map((s, i) => {
                    const col = streamColor(i);
                    const active = selected === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setSelected(active ? null : s)}
                        style={{
                          background: active ? `${col}22` : `${col}11`,
                          border: `1px solid ${active ? col : col + "55"}`,
                          color: active ? col : col + "CC",
                          borderRadius: 4,
                          fontSize: 9, letterSpacing: 1,
                          padding: "3px 8px",
                          cursor: "pointer",
                          fontFamily: MONO,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stream projection detail */}
              {selected && (
                <StreamProjection
                  key={selected}
                  stream={selected}
                  onClose={() => setSelected(null)}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px",
          borderTop: `1px solid ${ACC}11`,
          fontSize: 8, color: "#2A4050", letterSpacing: 1,
        }}>
          POLLS EVERY 30 S · CLICK STREAM FOR PROJECTION
        </div>
      </div>
    </>
  );
}
