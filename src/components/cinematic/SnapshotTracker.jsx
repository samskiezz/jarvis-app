/**
 * F163 — System Snapshot Tracker
 *
 * Captures point-in-time readings of /v1/jarvis/system/status (cpu/mem/load)
 * and /v1/cinematic/brain (nodes/synapses). Persists up to 20 timestamped
 * snapshots in localStorage ("jarvis-sys-snapshots"). The panel shows a
 * reverse-chronological snapshot list with per-metric deltas (Δ) from the
 * previous reading — green = improvement, red = degradation.
 *
 * ▶ TREND: sends the last 5 snapshots as structured context to
 *   /v1/jarvis/agent/chat for a 2-sentence system-health trend brief, then
 *   dispatches jarvis:speak-dossier for TTS playback.
 *
 * Toggle:  ◈ SNAP  fixed at bottom:8 left:53400 zIndex:106.
 * Event:   jarvis:snap-toggle
 * Voice:   "snapshot / system snapshot / take snapshot / capture system / snap / metric history"
 * Refresh: auto-polls live values every 60 s; manual TAKE SNAP stores a snapshot.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT   = 53400;
const POLL_MS    = 60_000;
const MAX_SNAPS  = 20;
const STORE_KEY  = "jarvis-sys-snapshots";
const GN         = "#4ADE80";
const RD         = "#EF4444";
const AM         = "#F59E0B";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function loadSnaps() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSnaps(snaps) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(snaps)); } catch {}
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SNAP_RE =
  /\b(snapshot|system\s+snapshot|take\s+snapshot|capture\s+system|metric\s+history|system\s+trend|snap)\b/i;

export function isSnapQuery(q) { return SNAP_RE.test(q); }

export async function buildSnapScript() {
  const snaps = loadSnaps();
  if (snaps.length < 2) {
    return "Insufficient snapshot history for trend analysis, sir. Please capture at least two readings.";
  }
  const recent = snaps.slice(0, 5);
  const summary = recent
    .map((s, i) => {
      const ts = new Date(s.ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      return `[${ts}] CPU:${s.cpu}% MEM:${s.mem}% LOAD:${s.load} NODES:${s.nodes} SYNAPSES:${s.synapses}`;
    })
    .join("; ");
  try {
    const base = apiBase();
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS system metric snapshot history (most recent first): ${summary}. ` +
          `Give a 2-sentence system health trend assessment — British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "System health trend assessment complete, sir.").trim();
  } catch {
    return "Trend analysis unavailable at this time, sir.";
  }
}

// ── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchLive() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const [sysRes, brainRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers: hdr }).then((r) => r.json()),
    fetch(`${base}/v1/cinematic/brain`,      { headers: hdr }).then((r) => r.json()),
  ]);
  const sys   = sysRes.status   === "fulfilled" ? sysRes.value   : {};
  const brain = brainRes.status === "fulfilled" ? brainRes.value : {};

  return {
    cpu:      typeof sys.cpu_percent     === "number" ? +sys.cpu_percent.toFixed(1) : null,
    mem:      typeof sys.memory_percent  === "number" ? +sys.memory_percent.toFixed(1) : null,
    load:     Array.isArray(sys.load_avg)
                ? +sys.load_avg[0].toFixed(2)
                : typeof sys.load_avg === "number" ? +sys.load_avg.toFixed(2) : null,
    nodes:    typeof brain.node_count    === "number" ? brain.node_count    : null,
    synapses: typeof brain.synapse_count === "number" ? brain.synapse_count : null,
  };
}

// ── delta helper ──────────────────────────────────────────────────────────────

function delta(curr, prev, key, lowerIsBetter = false) {
  if (curr[key] == null || prev?.[key] == null) return null;
  const d = curr[key] - prev[key];
  if (d === 0) return null;
  const improving = lowerIsBetter ? d < 0 : d > 0;
  return { d, improving };
}

function DeltaPill({ d }) {
  if (!d) return null;
  const sign  = d.d > 0 ? "+" : "";
  const color = d.improving ? GN : RD;
  return (
    <span style={{
      fontSize: "7px", color, marginLeft: 3,
      fontVariantNumeric: "tabular-nums",
    }}>
      {sign}{d.d}
    </span>
  );
}

function MetricVal({ value, unit = "" }) {
  if (value == null) return <span style={{ color: S.text }}>—</span>;
  return <span>{value}{unit}</span>;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SnapshotTracker() {
  const [open,      setOpen]      = useState(false);
  const [live,      setLive]      = useState(null);
  const [snaps,     setSnaps]     = useState(loadSnaps);
  const [loading,   setLoading]   = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [trending,  setTrending]  = useState(false);
  const timerRef = useRef(null);

  const refreshLive = useCallback(async () => {
    setLoading(true);
    try { setLive(await fetchLive()); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refreshLive();
    timerRef.current = setInterval(refreshLive, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [refreshLive]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:snap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:snap-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "");
      if (isSnapQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function takeSnap() {
    setCapturing(true);
    try {
      const values = await fetchLive();
      const snap = { ts: new Date().toISOString(), ...values };
      const updated = [snap, ...snaps].slice(0, MAX_SNAPS);
      saveSnaps(updated);
      setSnaps(updated);
      setLive(values);
    } catch {}
    finally { setCapturing(false); }
  }

  async function assessTrend() {
    setTrending(true);
    const text = await buildSnapScript();
    setTrending(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  function clearSnaps() {
    saveSnaps([]);
    setSnaps([]);
  }

  const badge = snaps.length > 0 ? snaps.length : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="System Snapshot Tracker (◈ SNAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 106,
          background: open ? `${GN}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? GN : S.border}`,
          borderRadius: S.radius, color: open ? GN : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${GN}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ SNAP
        {badge && (
          <span style={{
            marginLeft: 4, background: GN, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{badge}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 105,
          bottom: 36, left: Math.max(8, BTN_LEFT - 320),
          width: 380,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${GN}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "72vh", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
            gap: 6,
          }}>
            <span style={{ color: GN, letterSpacing: 2, fontWeight: 700, fontSize: S.fs.xxs }}>
              SYSTEM SNAPSHOT TRACKER
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={assessTrend}
                disabled={trending || snaps.length < 2}
                style={{
                  background: "transparent", border: `1px solid ${C.blue}`,
                  color: C.blue, borderRadius: S.radius, padding: "2px 7px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                  opacity: (trending || snaps.length < 2) ? 0.4 : 1,
                }}
              >
                {trending ? "…" : "▶ TREND"}
              </button>
              <button
                onClick={clearSnaps}
                disabled={snaps.length === 0}
                style={{
                  background: "transparent", border: `1px solid ${RD}55`,
                  color: RD, borderRadius: S.radius, padding: "2px 7px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                  opacity: snaps.length === 0 ? 0.3 : 1,
                }}
                title="Clear all snapshots"
              >
                ✕ CLR
              </button>
            </div>
          </div>

          {/* Live values */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${S.border}22`,
            background: "rgba(0,0,0,0.2)",
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 6,
            }}>
              <span style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>
                LIVE — {loading ? "polling…" : live ? "updated" : "waiting"}
              </span>
              <button
                onClick={takeSnap}
                disabled={capturing || !live}
                style={{
                  background: capturing ? `${GN}33` : `${GN}18`,
                  border: `1px solid ${GN}`,
                  color: GN, borderRadius: S.radius, padding: "2px 10px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                  fontWeight: 700, letterSpacing: 1,
                  opacity: (!live || capturing) ? 0.5 : 1,
                }}
              >
                {capturing ? "CAPTURING…" : "⊕ TAKE SNAP"}
              </button>
            </div>
            {live && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 4 }}>
                {[
                  { label: "CPU",      val: live.cpu,      unit: "%" },
                  { label: "MEM",      val: live.mem,      unit: "%" },
                  { label: "LOAD",     val: live.load,     unit: ""  },
                  { label: "NODES",    val: live.nodes,    unit: ""  },
                  { label: "SYNAPSES", val: live.synapses, unit: ""  },
                ].map(({ label, val, unit }) => (
                  <div key={label} style={{
                    background: "rgba(0,0,0,0.3)", borderRadius: 5,
                    padding: "4px 3px", textAlign: "center",
                  }}>
                    <div style={{ color: GN, fontSize: S.fs.xs, fontWeight: 700 }}>
                      {val != null ? `${val}${unit}` : "—"}
                    </div>
                    <div style={{ color: S.text, fontSize: "7px", letterSpacing: 0.5 }}>{label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Snapshot list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 12px 10px" }}>
            {snaps.length === 0 ? (
              <div style={{
                color: S.text, padding: "16px 0", textAlign: "center",
                fontSize: S.fs.xxs, letterSpacing: 1,
              }}>
                No snapshots yet. Click ⊕ TAKE SNAP to capture system state.
              </div>
            ) : (
              snaps.map((snap, i) => {
                const prev  = snaps[i + 1] ?? null;
                const dt    = new Date(snap.ts);
                const time  = dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
                const date  = dt.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
                const dCpu  = delta(snap, prev, "cpu",  true);
                const dMem  = delta(snap, prev, "mem",  true);
                const dLoad = delta(snap, prev, "load", true);
                const dNode = delta(snap, prev, "nodes", false);
                const dSyn  = delta(snap, prev, "synapses", false);

                return (
                  <div key={snap.ts} style={{
                    padding: "6px 8px", marginBottom: 4, borderRadius: 6,
                    background: i === 0 ? `${GN}08` : "rgba(0,0,0,0.2)",
                    border: `1px solid ${i === 0 ? GN + "44" : S.border + "44"}`,
                  }}>
                    {/* Timestamp row */}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      marginBottom: 4,
                    }}>
                      <span style={{ color: i === 0 ? GN : S.textHi, fontSize: S.fs.xxs, letterSpacing: 0.5 }}>
                        {i === 0 ? "◈ LATEST — " : ""}{time}
                      </span>
                      <span style={{ color: S.text, fontSize: "7px" }}>{date}</span>
                    </div>

                    {/* Metric pills */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {[
                        { label: "CPU",  val: snap.cpu,      unit: "%", d: dCpu  },
                        { label: "MEM",  val: snap.mem,      unit: "%", d: dMem  },
                        { label: "LOAD", val: snap.load,     unit: "",  d: dLoad },
                        { label: "NODE", val: snap.nodes,    unit: "",  d: dNode },
                        { label: "SYN",  val: snap.synapses, unit: "",  d: dSyn  },
                      ].map(({ label, val, unit, d: dl }) => (
                        <span key={label} style={{
                          fontSize: "8px",
                          color: dl ? (dl.improving ? GN : RD) : S.textHi,
                          background: "rgba(0,0,0,0.25)",
                          border: `1px solid ${dl ? (dl.improving ? GN : RD) + "44" : S.border}`,
                          borderRadius: 4, padding: "1px 5px",
                          display: "inline-flex", alignItems: "center", gap: 2,
                        }}>
                          <span style={{ color: S.text, fontSize: "7px" }}>{label}:</span>
                          {val != null ? `${val}${unit}` : "—"}
                          {dl && (
                            <span style={{ fontSize: "7px", color: dl.improving ? GN : RD }}>
                              {dl.d > 0 ? "+" : ""}{dl.d.toFixed ? dl.d.toFixed(1) : dl.d}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "7px", letterSpacing: 0.5,
            display: "flex", justifyContent: "space-between",
          }}>
            <span>/v1/jarvis/system/status · /v1/cinematic/brain</span>
            <span>{snaps.length}/{MAX_SNAPS} snapshots · 60 s poll</span>
          </div>
        </div>
      )}
    </>
  );
}
