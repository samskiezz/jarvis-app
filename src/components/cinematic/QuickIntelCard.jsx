/**
 * F35 — Quick Intel Card
 * A compact always-dismissible card showing the top item from each live
 * world-intel category: biggest earthquake, top crypto/FX mover, FX snapshot.
 * Uses /functions/getLiveIntel (real data, no mocks).
 * Additive only — mounted via App.jsx; zero edits to protected files.
 *
 * Voice: "quick intel" | "intel card" | "world snapshot" | "qic"
 * Toggle: ⊕ QIC button in the bottom strip.
 * Keyboard: Ctrl+Shift+I
 */
import { useEffect, useState, useCallback } from "react";
import { getLiveIntel } from "@/api/backendFunctions";

const CY  = "#29E7FF";
const GLD = "#FFD700";
const RED = "#FF4455";
const GRN = "#00E5A0";
const DIM = "#4E6070";
const BG  = "rgba(4,8,14,0.96)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 5 * 60 * 1000; // 5 minutes

const QIC_RE = /\bquick.intel\b|\bintel.card\b|\bworld.snapshot\b|\bqic\b/i;
export function isQuickIntelCardQuery(text) {
  return QIC_RE.test(text || "");
}

export async function buildQicScript() {
  try {
    const res = await getLiveIntel({ type: "all" });
    const quakes  = Array.isArray(res?.earthquakes) ? res.earthquakes : [];
    const markets = Array.isArray(res?.markets)     ? res.markets     : [];
    const topQ = quakes.reduce((b, q) => Number(q.mag) > Number(b?.mag ?? -1) ? q : b, null);
    const topM = markets.slice().sort((a, b) => Math.abs(Number(b.change_pct)) - Math.abs(Number(a.change_pct)))[0];
    const parts = [];
    if (topQ) parts.push(`Top seismic event: M${Number(topQ.mag).toFixed(1)} near ${topQ.place || "unknown"}.`);
    if (topM) {
      const chg = Number(topM.change_pct);
      parts.push(`Largest market move: ${topM.display} ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%.`);
    }
    parts.push(`${quakes.length} quake${quakes.length !== 1 ? "s" : ""} and ${markets.length} instrument${markets.length !== 1 ? "s" : ""} tracked.`);
    return parts.join(" ") || "Quick intel card is live, sir.";
  } catch {
    return "Quick intel card is live. Opening the panel now, sir.";
  }
}

function fmtMag(mag) {
  return `M${Number(mag).toFixed(1)}`;
}

function fmtChg(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function Row({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0",
      borderBottom: `1px solid ${CY}12` }}>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
        letterSpacing: 2, color: DIM, textTransform: "uppercase",
        minWidth: 46, paddingTop: 2 }}>
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
          color: color || "#DCEBF5", letterSpacing: 0.5,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
            color: DIM, letterSpacing: 1, marginTop: 1 }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuickIntelCard() {
  const [open, setOpen]     = useState(false);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [ts, setTs]         = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLiveIntel({ type: "all" });
      setData(res || null);
      setTs(new Date());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, POLL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Keyboard shortcut: Ctrl+Shift+I
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Voice trigger via JarvisBrain custom event
  useEffect(() => {
    function onAsk(e) {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isQuickIntelCardQuery(q)) setOpen(true);
    }
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  // Dedicated toggle for JarvisBrain ask() wiring
  useEffect(() => {
    function onToggle() { setOpen(o => !o); }
    window.addEventListener("jarvis:qic-toggle", onToggle);
    return () => window.removeEventListener("jarvis:qic-toggle", onToggle);
  }, []);

  const quakes  = Array.isArray(data?.earthquakes) ? data.earthquakes : [];
  const markets = Array.isArray(data?.markets)     ? data.markets     : [];

  const topQuake = quakes.reduce((best, q) => {
    return Number(q.mag) > Number(best?.mag ?? -1) ? q : best;
  }, null);

  const movers = [...markets]
    .filter(m => Number.isFinite(Number(m.change_pct)))
    .sort((a, b) => Math.abs(Number(b.change_pct)) - Math.abs(Number(a.change_pct)));

  const topMover = movers[0] ?? null;
  const nextMover = movers[1] ?? null;

  const hasData = quakes.length > 0 || markets.length > 0;

  return (
    <>
      {/* Toggle button — bottom strip */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Quick Intel Card (Ctrl+Shift+I)"
        style={{
          position: "fixed", bottom: 8, left: 480, zIndex: 9100,
          background: open ? `${CY}22` : "rgba(4,8,14,0.82)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 6, padding: "3px 10px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 2, color: open ? CY : DIM,
          textTransform: "uppercase", whiteSpace: "nowrap",
          transition: "all 0.15s",
        }}
      >
        ⊕ QIC
      </button>

      {/* Card panel */}
      {open && (
        <div
          style={{
            position: "fixed", bottom: 36, left: 480, zIndex: 9101,
            width: 260,
            background: BG,
            border: `1px solid ${CY}33`,
            borderRadius: 10,
            boxShadow: `0 0 40px ${CY}10, 0 12px 28px rgba(0,0,0,0.8)`,
            fontFamily: "'JetBrains Mono',monospace",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px 6px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ fontSize: 9, letterSpacing: 3, color: CY, textTransform: "uppercase" }}>
              ⊕ Quick Intel
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && (
                <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>FETCHING…</span>
              )}
              {ts && !loading && (
                <span style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>
                  {ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: DIM, fontSize: 12, padding: 0, lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "6px 12px 10px" }}>
            {!hasData && !loading && (
              <div style={{ color: DIM, fontSize: 10, letterSpacing: 1, padding: "8px 0" }}>
                No live intel available.
              </div>
            )}

            {topQuake && (
              <Row
                label="QUAKE"
                value={`${fmtMag(topQuake.mag)} — ${topQuake.place || "Unknown"}`}
                sub={topQuake.time ? new Date(topQuake.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) : undefined}
                color={Number(topQuake.mag) >= 6 ? RED : Number(topQuake.mag) >= 5 ? GLD : CY}
              />
            )}

            {topMover && (
              <Row
                label="TOP ▲▼"
                value={`${topMover.display}  ${topMover.price}`}
                sub={`${fmtChg(topMover.change_pct)} 24 h`}
                color={Number(topMover.change_pct) >= 0 ? GRN : RED}
              />
            )}

            {nextMover && (
              <Row
                label="#2"
                value={`${nextMover.display}  ${nextMover.price}`}
                sub={`${fmtChg(nextMover.change_pct)} 24 h`}
                color={Number(nextMover.change_pct) >= 0 ? GRN : RED}
              />
            )}

            {/* Summary counts */}
            {hasData && (
              <div style={{
                display: "flex", gap: 12, marginTop: 8,
                paddingTop: 6, borderTop: `1px solid ${CY}12`,
              }}>
                <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
                  <span style={{ color: CY }}>{quakes.length}</span> quakes
                </span>
                <span style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>
                  <span style={{ color: CY }}>{markets.length}</span> instruments
                </span>
                <button
                  onClick={fetchData}
                  style={{
                    marginLeft: "auto", background: "none", border: "none",
                    cursor: "pointer", color: DIM, fontSize: 9, letterSpacing: 1,
                    fontFamily: "inherit", padding: 0, textDecoration: "underline",
                  }}
                >
                  refresh
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
