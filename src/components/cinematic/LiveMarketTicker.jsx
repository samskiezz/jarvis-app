/**
 * LiveMarketTicker — fixed bottom strip with live crypto/FX prices.
 *
 * Data source: POST /functions/getLiveIntel (no auth required).
 * Polls every 60 s. Renders nothing on error so it never breaks the host page.
 */
import { useState, useEffect, useCallback } from "react";
import { COLORS as C } from "@/domain/colors";
import { getLiveIntel } from "@/api/backendFunctions";

const POLL_MS = 60_000;

function TickerItem({ sym, price, change_pct }) {
  const positive = typeof change_pct === "number" ? change_pct >= 0 : true;
  const arrow = positive ? "▲" : "▼";
  const changeColor = positive ? C.neon : C.red;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "0 12px",
        borderRight: `1px solid ${C.border}`,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span style={{ color: C.text, fontSize: 8, letterSpacing: 1 }}>{sym}</span>
      <span
        style={{
          color: C.textB,
          fontSize: 10,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: 0,
        }}
      >
        {price}
      </span>
      {typeof change_pct === "number" && (
        <span style={{ color: changeColor, fontSize: 8 }}>
          {arrow} {Math.abs(change_pct).toFixed(2)}%
        </span>
      )}
    </span>
  );
}

export function LiveMarketTicker() {
  const [intel, setIntel] = useState(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getLiveIntel();
      setIntel(result);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Render nothing until first successful load, and nothing on persistent error.
  if (failed || !intel) return null;

  const markets = intel.markets || [];
  const earthquakes = intel.earthquakes || [];
  const latestEq = earthquakes[0];
  const generatedAt = intel.generated_at
    ? new Date(intel.generated_at * 1000).toISOString().slice(11, 19) + " UTC"
    : null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9000,
        height: 26,
        background: "rgba(2,6,10,0.92)",
        borderTop: `1px solid ${C.border}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
        letterSpacing: 1,
        userSelect: "none",
      }}
      aria-label="Live market ticker"
      role="status"
    >
      {/* Label */}
      <span
        style={{
          padding: "0 10px",
          color: C.neon,
          fontSize: 8,
          letterSpacing: 2,
          borderRight: `1px solid ${C.border}`,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        ◈ LIVE
      </span>

      {/* Market items */}
      <div style={{ display: "flex", alignItems: "center", flex: 1, overflow: "hidden" }}>
        {markets.map((m) => (
          <TickerItem key={m.sym} sym={m.sym} price={m.price} change_pct={m.change_pct} />
        ))}
      </div>

      {/* Right-side: latest earthquake + timestamp */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          borderLeft: `1px solid ${C.border}`,
        }}
      >
        {latestEq && (
          <span
            style={{
              padding: "0 10px",
              color: C.text,
              fontSize: 8,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: C.gold }}>⚠ EQ</span>
            {" M"}
            {latestEq.mag}
            {" · "}
            {latestEq.place}
          </span>
        )}
        {generatedAt && (
          <span
            style={{
              padding: "0 8px",
              color: "rgba(86,104,120,0.5)",
              fontSize: 7,
              whiteSpace: "nowrap",
              borderLeft: `1px solid ${C.border}`,
            }}
          >
            {generatedAt}
          </span>
        )}
      </div>
    </div>
  );
}
