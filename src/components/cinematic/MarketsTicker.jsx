/**
 * MarketsTicker — F07 Markets Ticker.
 * Scrolling strip of crypto + FX prices from /functions/getLiveIntel.
 * "JARVIS, markets" → JarvisBrain speaks top movers via isMarketsQuery / buildMarketsScript.
 * Additive only — mounted via App.jsx; intent hook imported into JarvisBrain.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getLiveIntel } from "@/api/backendFunctions";

const GLD = "#FFD700";
const CY = "#29E7FF";
const RED = "#FF4455";

const MARKETS_RE = /\bmarket|crypto|bitcoin|btc|eth|ether|forex|\bfx\b|mover|price|trading|dollar|pound|euro|yen/i;

export function isMarketsQuery(text) {
  return MARKETS_RE.test(text || "");
}

export async function buildMarketsScript() {
  let markets = [];
  try {
    const res = await getLiveIntel({ type: "all" });
    markets = Array.isArray(res?.markets) ? res.markets : [];
  } catch (_) {}

  if (!markets.length) return "Market data is unavailable at this time, sir.";

  const sorted = [...markets]
    .filter(m => Number.isFinite(Number(m.change_pct)))
    .sort((a, b) => Math.abs(Number(b.change_pct)) - Math.abs(Number(a.change_pct)));

  const top = sorted.slice(0, 5);
  if (!top.length) return "Market feeds are live but no mover data is available right now, sir.";

  const lines = top.map(m => {
    const ch = Number(m.change_pct);
    const dir = ch >= 0 ? "up" : "down";
    return `${m.display} at ${m.price}, ${dir} ${Math.abs(ch).toFixed(2)} percent`;
  });

  const gainers = sorted.filter(m => Number(m.change_pct) > 0).length;
  const decliners = sorted.filter(m => Number(m.change_pct) < 0).length;

  return `Markets report, sir. ${gainers} advancing, ${decliners} declining across ${markets.length} instruments. Top movers: ${lines.join("; ")}.`;
}

function TickerItem({ m }) {
  const ch = Number(m.change_pct);
  const up = ch >= 0;
  const col = up ? CY : RED;
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center",
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10, padding: "0 14px" }}>
      <span style={{ color: GLD, fontWeight: 700, letterSpacing: 1 }}>{m.display}</span>
      <span style={{ color: "#DCEBF5" }}>{m.price}</span>
      {Number.isFinite(ch) && (
        <span style={{ color: col, fontWeight: 700 }}>
          {up ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}%
        </span>
      )}
      <span style={{ color: "#1e3040" }}>│</span>
    </span>
  );
}

function ScrollingTicker({ markets }) {
  const trackRef = useRef(null);
  const posRef = useRef(0);
  const animRef = useRef(null);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || markets.length === 0) return;

    posRef.current = 0;
    const speed = 0.55;

    const tick = () => {
      const half = el.scrollWidth / 2;
      posRef.current -= speed;
      if (posRef.current <= -half) posRef.current = 0;
      el.style.transform = `translateX(${posRef.current}px)`;
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [markets]);

  const doubled = [...markets, ...markets];

  return (
    <div style={{ overflow: "hidden", flex: 1, minWidth: 0, height: "100%",
      display: "flex", alignItems: "center" }}>
      <div ref={trackRef} style={{ display: "inline-flex", alignItems: "center",
        whiteSpace: "nowrap", willChange: "transform" }}>
        {doubled.map((m, i) => <TickerItem key={i} m={m} />)}
      </div>
    </div>
  );
}

function MarketGrid({ markets, onClose }) {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 30, zIndex: 66,
      background: "rgba(5,9,16,0.95)", borderTop: `1px solid ${GLD}33`,
      backdropFilter: "blur(14px)", boxShadow: `0 -8px 40px rgba(255,215,0,0.08)`,
      padding: "12px 16px 12px",
      fontFamily: "'JetBrains Mono',monospace",
      maxHeight: "min(260px,38vh)", overflowY: "auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
        <span style={{ color: GLD, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>LIVE MARKETS</span>
        <span style={{ marginLeft: 10, color: "#566878", fontSize: 9 }}>{markets.length} INSTRUMENTS</span>
        <button onClick={onClose} style={{
          marginLeft: "auto", background: "none", border: "none",
          color: "#566878", cursor: "pointer", fontSize: 15, padding: "0 2px",
        }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
        {markets.map((m, i) => {
          const ch = Number(m.change_pct);
          const up = ch >= 0;
          const col = up ? CY : RED;
          return (
            <div key={i} style={{
              background: "rgba(0,0,0,0.4)", border: `1px solid ${up ? GLD : RED}22`,
              borderRadius: 6, padding: "8px 10px",
            }}>
              <div style={{ fontSize: 9, color: "#8ba3b8", letterSpacing: 1 }}>{m.display}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#DCEBF5", marginTop: 2 }}>{m.price}</div>
              <div style={{ fontSize: 10, color: col, fontWeight: 700, marginTop: 1 }}>
                {Number.isFinite(ch) ? `${up ? "▲" : "▼"} ${Math.abs(ch).toFixed(2)}%` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MarketsTicker() {
  const [markets, setMarkets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLiveIntel({ type: "all" });
      const arr = Array.isArray(res?.markets) ? res.markets : [];
      setMarkets(arr);
      setLastFetch(new Date());
    } catch (_) {
      // silent — endpoint down; keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Listen for "JARVIS, markets" intent to auto-open the grid
  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "").toLowerCase();
      if (MARKETS_RE.test(q)) setExpanded(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const noData = markets.length === 0;

  return (
    <>
      {/* Bottom ticker strip */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 67,
        height: 30, background: "rgba(4,7,12,0.88)",
        borderTop: `1px solid ${GLD}22`,
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center",
      }}>
        {/* Label / toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          title="Markets"
          style={{
            height: "100%", padding: "0 12px",
            background: expanded ? GLD + "22" : "transparent",
            border: "none", borderRight: `1px solid ${GLD}22`,
            color: GLD, cursor: "pointer",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 9, fontWeight: 700, letterSpacing: 2,
            display: "flex", alignItems: "center", gap: 5,
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 11 }}>◈</span>
          {loading ? "SYNC" : "MARKETS"}
          {!noData && (
            <span style={{ color: "#566878", fontWeight: 400, fontSize: 8 }}>
              {markets.length}
            </span>
          )}
        </button>

        {/* Scrolling ticker or no-data placeholder */}
        {noData ? (
          <span style={{ flex: 1, padding: "0 14px", fontSize: 9, color: "#2d4050",
            fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1 }}>
            {loading ? "FETCHING MARKET DATA…" : "NO MARKET DATA"}
          </span>
        ) : (
          <ScrollingTicker markets={markets} />
        )}

        {/* Last-updated badge */}
        {lastFetch && (
          <span style={{
            padding: "0 10px", fontSize: 8, color: "#2d4050",
            fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap",
            borderLeft: `1px solid ${GLD}11`,
          }}>
            {loading ? "↻" : `↻ ${Math.round((Date.now() - lastFetch.getTime()) / 1000)}s`}
          </span>
        )}
      </div>

      {/* Expanded market grid (above the ticker) */}
      {expanded && markets.length > 0 && (
        <MarketGrid markets={markets} onClose={() => setExpanded(false)} />
      )}
    </>
  );
}
