/**
 * LiveIntelPulseDrawer — F129: Live Intel Pulse
 * Right-edge slide-in drawer at 44 % from top showing a combined seismic
 * + markets summary from POST /functions/getLiveIntel.
 *
 * Seismic section: top 5 earthquakes sorted by magnitude (M badge colour-coded).
 * Market section: top 5 movers by |change_pct| with direction arrow + price.
 * Polls every 2 minutes while open. Orange (#F97316) accent.
 *
 * Mount point: src/Layout.jsx after <SchedulesPanel /> (at 42 %).
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS = 120_000;
const DRAWER_W = 320;
const ACC = "#F97316";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

function relAge(ts) {
  if (!ts) return "—";
  const epoch = typeof ts === "number" ? ts : Date.parse(ts);
  if (isNaN(epoch)) return "—";
  const sec = Math.floor((Date.now() - epoch) / 1000);
  if (sec < 60) return `${Math.max(0, sec)}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function magColor(mag) {
  const m = Number(mag);
  if (m >= 6.0) return "#FF2200";
  if (m >= 5.0) return "#FF8800";
  if (m >= 4.5) return "#FFCC00";
  return "#88FF88";
}

function toEarthquakes(d) {
  return Array.isArray(d?.earthquakes) ? d.earthquakes
    : Array.isArray(d?.quakes) ? d.quakes
    : Array.isArray(d?.seismic) ? d.seismic
    : [];
}

function toMarkets(d) {
  return Array.isArray(d?.markets) ? d.markets
    : Array.isArray(d?.crypto) ? d.crypto
    : [];
}

export default function LiveIntelPulseDrawer() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;

    const load = () => {
      kimiClient.functions
        .getLiveIntel({ type: "all" })
        .then((d) => { if (alive) { setData(d); setErr(false); } })
        .catch(() => { if (alive) setErr(true); });
    };

    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(timerRef.current); };
  }, [open]);

  const quakes = toEarthquakes(data)
    .map((q) => ({ ...q, _mag: Number(q.mag ?? q.magnitude ?? 0) }))
    .filter((q) => Number.isFinite(q._mag))
    .sort((a, b) => b._mag - a._mag)
    .slice(0, 5);

  const movers = toMarkets(data)
    .map((m) => ({ ...m, _chg: Number(m.change_pct ?? m.pct_change ?? 0) }))
    .filter((m) => Number.isFinite(m._chg))
    .sort((a, b) => Math.abs(b._chg) - Math.abs(a._chg))
    .slice(0, 5);

  const tabStyle = {
    position: "fixed",
    right: open ? DRAWER_W : 0,
    top: "44%",
    transform: "translateY(-50%) rotate(180deg)",
    zIndex: 1200,
    writingMode: "vertical-rl",
    cursor: "pointer",
    padding: "10px 5px",
    background: open ? ACC : "rgba(5,9,16,0.85)",
    color: open ? "#04060A" : ACC,
    border: `1px solid ${ACC}55`,
    borderRight: "none",
    borderRadius: "4px 0 0 4px",
    fontSize: 9,
    letterSpacing: 2,
    fontFamily: MONO,
    fontWeight: 700,
    transition: "right 0.25s ease, background 0.2s",
    userSelect: "none",
  };

  const drawerStyle = {
    position: "fixed",
    right: open ? 0 : -DRAWER_W,
    top: 0,
    bottom: 0,
    width: DRAWER_W,
    zIndex: 1199,
    background: "rgba(5,9,16,0.97)",
    borderLeft: `1px solid ${ACC}44`,
    backdropFilter: "blur(14px)",
    transition: "right 0.25s ease",
    overflowY: "auto",
    fontFamily: MONO,
    display: "flex",
    flexDirection: "column",
  };

  const sectionHead = {
    padding: "8px 12px 4px",
    fontSize: 8,
    letterSpacing: 2,
    color: ACC,
    fontWeight: 700,
    borderBottom: `1px solid ${ACC}22`,
  };

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: 11,
  };

  return (
    <>
      <div style={tabStyle} onClick={() => setOpen((o) => !o)} title="Live Intel Pulse">
        INTEL PULSE
      </div>

      <div style={drawerStyle}>
        {/* Header */}
        <div style={{
          padding: "12px 14px 8px",
          borderBottom: `1px solid ${ACC}33`,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ color: ACC, fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
              ◈ LIVE INTEL PULSE
            </span>
            {data && (
              <span style={{ marginLeft: "auto", fontSize: 8, color: "#3a5060", letterSpacing: 1 }}>
                {quakes.length} QUAKES · {movers.length} MOVERS
              </span>
            )}
          </div>
          <div style={{ fontSize: 8, color: "#2e4050", letterSpacing: 1 }}>
            POST /functions/getLiveIntel · 2-min poll
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {err && (
            <div style={{ padding: "14px 12px", color: "#FF4455", fontSize: 11 }}>
              ⚠ getLiveIntel unavailable
            </div>
          )}

          {!data && !err && (
            <div style={{ padding: "14px 12px", color: "#3a5060", fontSize: 11 }}>
              Loading…
            </div>
          )}

          {data && (
            <>
              {/* Seismic section */}
              <div style={sectionHead}>SEISMIC FEED</div>
              {quakes.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "#3a5060", fontSize: 10 }}>
                  NO SEISMIC DATA
                </div>
              ) : quakes.map((q, i) => {
                const loc = q.location ?? q.place ?? q.region ?? "Unknown";
                const ts = q.time ?? q.ts ?? q.timestamp;
                return (
                  <div key={i} style={rowStyle}>
                    <span style={{
                      minWidth: 32, textAlign: "center", fontWeight: 700,
                      fontSize: 12, color: magColor(q._mag),
                      flexShrink: 0,
                    }}>
                      M{q._mag.toFixed(1)}
                    </span>
                    <span style={{ flex: 1, color: "#DCEBF5", overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {loc}
                    </span>
                    <span style={{ color: "#3a5060", fontSize: 9, flexShrink: 0 }}>
                      {relAge(ts)}
                    </span>
                  </div>
                );
              })}

              {/* Markets section */}
              <div style={{ ...sectionHead, marginTop: 4 }}>TOP MOVERS</div>
              {movers.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "#3a5060", fontSize: 10 }}>
                  NO MARKET DATA
                </div>
              ) : movers.map((m, i) => {
                const up = m._chg >= 0;
                return (
                  <div key={i} style={rowStyle}>
                    <span style={{ fontWeight: 700, color: "#DCEBF5",
                      minWidth: 60, flexShrink: 0, fontSize: 11 }}>
                      {m.display ?? m.symbol ?? m.name ?? "?"}
                    </span>
                    <span style={{ color: "#7A95AB", flex: 1, fontSize: 10 }}>
                      {m.price ?? "—"}
                    </span>
                    <span style={{
                      color: up ? "#4ADE80" : "#FF4455",
                      fontWeight: 700, flexShrink: 0, fontSize: 11,
                    }}>
                      {up ? "▲" : "▼"} {Math.abs(m._chg).toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 12px",
          borderTop: `1px solid ${ACC}22`,
          fontSize: 8, color: "#2e4050", letterSpacing: 1, flexShrink: 0,
        }}>
          /functions/getLiveIntel · quakes sorted by magnitude · movers by |Δ%|
        </div>
      </div>
    </>
  );
}
