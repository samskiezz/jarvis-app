/**
 * MarketPortfolioCrossfire — F39
 *
 * Cross-references live market prices (/functions/getLiveIntel crypto+FX)
 * against the investment portfolio (/entities/Investment) to surface which
 * holdings are moving TODAY. Shows price movement alongside portfolio position.
 *
 * Toggle: ⊗ CROSS strip button  |  voice: "JARVIS, crossfire" / "market crossfire"
 * Exports isMarketCrossQuery / buildMarketCrossScript for JarvisBrain.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#29E7FF";
const GOLD = "#F2C14E";
const RED = "#FF4D4D";
const GREEN = "#29FF8A";
const MONO = "'JetBrains Mono',monospace";
const EVENT = "jarvis:crossfire-toggle";
const POLL_MS = 60_000;

// ── helpers ──────────────────────────────────────────────────────────────────

function pctColor(v) {
  if (v === null || v === undefined) return CY;
  return v >= 0 ? GREEN : RED;
}

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`;
}

/** Normalise ticker symbols: "BTC/USD" → "BTC", "EUR" → "EUR" */
function normSymbol(s) {
  return (s || "").split("/")[0].toUpperCase().trim();
}

/** Try to match an investment name/ticker to a live market entry */
function matchMarket(inv, markets) {
  const name = (inv.name || inv.asset || inv.ticker || "").toUpperCase();
  return markets.find((m) => {
    const sym = normSymbol(m.symbol || m.ticker || m.pair || "");
    return sym && (name.includes(sym) || sym.includes(name.slice(0, 3)));
  });
}

// ── intent detectors (exported for JarvisBrain) ──────────────────────────────

export function isMarketCrossQuery(q) {
  return /\b(crossfire|cross.?fire|market.?cross|portfolio.?cross|cross.?portfolio|holdings.?mov|movers.?port)\b/i.test(q);
}

export async function buildMarketCrossScript() {
  try {
    const [intelR, invR] = await Promise.all([
      fetch(`${apiBase()}/functions/getLiveIntel`),
      fetch(`${apiBase()}/entities/Investment`),
    ]);
    const intel = await intelR.json();
    const invData = await invR.json();

    const markets = [
      ...(intel.crypto || []),
      ...(intel.fx || []),
    ];
    const investments = Array.isArray(invData) ? invData : (invData.items || invData.results || []);
    if (!investments.length) return "No portfolio data available for crossfire analysis, sir.";

    const hits = [];
    for (const inv of investments) {
      const m = matchMarket(inv, markets);
      if (m) {
        const pct = m.change_pct ?? m.change24h ?? m.pct_change ?? null;
        hits.push({ name: inv.name || inv.ticker, pct, price: m.price || m.rate });
      }
    }
    if (!hits.length) return "No portfolio holdings matched active market tickers, sir. Markets may be using different symbol conventions.";

    const movers = hits.filter((h) => h.pct !== null).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    const top = movers.slice(0, 3);
    if (!top.length) return `${hits.length} portfolio position(s) matched market data but no price-change values were returned, sir.`;

    const lines = top.map((h) => `${h.name} ${h.pct >= 0 ? "up" : "down"} ${Math.abs(h.pct).toFixed(1)}%`);
    return `Crossfire report: ${lines.join(", ")}. Tracking ${hits.length} matched holding${hits.length > 1 ? "s" : ""} in total.`;
  } catch (_) {
    return "Crossfire analysis unavailable — market or portfolio data is unreachable, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MarketPortfolioCrossfire() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [unmatched, setUnmatched] = useState(0);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [intelR, invR] = await Promise.all([
        fetch(`${apiBase()}/functions/getLiveIntel`),
        fetch(`${apiBase()}/entities/Investment`),
      ]);
      const intel = await intelR.json();
      const invData = await invR.json();

      const markets = [...(intel.crypto || []), ...(intel.fx || [])];
      const investments = Array.isArray(invData) ? invData : (invData.items || invData.results || []);

      const matched = [];
      let miss = 0;
      for (const inv of investments) {
        const m = matchMarket(inv, markets);
        if (m) {
          matched.push({
            name: inv.name || inv.asset || inv.ticker || "?",
            symbol: normSymbol(m.symbol || m.ticker || m.pair || ""),
            price: m.price || m.rate,
            pct: m.change_pct ?? m.change24h ?? m.pct_change ?? null,
            value: inv.current_value || inv.value || inv.amount || null,
            type: m.type || (intel.crypto?.includes(m) ? "crypto" : "fx"),
          });
        } else {
          miss++;
        }
      }
      matched.sort((a, b) => {
        if (a.pct === null && b.pct === null) return 0;
        if (a.pct === null) return 1;
        if (b.pct === null) return -1;
        return Math.abs(b.pct) - Math.abs(a.pct);
      });
      setRows(matched);
      setUnmatched(miss);
    } catch (e) {
      setError("Could not fetch market or portfolio data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch_();
    timerRef.current = setInterval(fetch_, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetch_]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener(EVENT, onToggle);
    return () => window.removeEventListener(EVENT, onToggle);
  }, []);

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent(EVENT))}
        title="Market × Portfolio Crossfire (F39)"
        style={{
          position: "fixed", bottom: 0, left: "50%", transform: "translateX(30px)",
          zIndex: 8800, padding: "2px 8px", fontSize: 10, letterSpacing: 1.5,
          fontFamily: MONO, background: "rgba(5,9,14,0.82)",
          border: `1px solid ${GOLD}55`, borderBottom: "none",
          borderRadius: "4px 4px 0 0", color: GOLD, cursor: "pointer",
        }}
      >
        ⊗ CROSS
      </button>

      {open && (
        <div style={{
          position: "fixed", right: 80, top: "50%", transform: "translateY(-50%)",
          width: "min(480px, 94vw)", maxHeight: "80vh",
          background: "rgba(4,8,14,0.94)", border: `1px solid ${GOLD}44`,
          borderTop: `2px solid ${GOLD}`, borderRadius: 12,
          boxShadow: `0 0 60px ${GOLD}18`,
          backdropFilter: "blur(14px)", zIndex: 8801,
          fontFamily: MONO, display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
            borderBottom: `1px solid ${GOLD}33`,
          }}>
            <span style={{ color: GOLD, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⊗ MARKET × PORTFOLIO CROSSFIRE
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 9, color: GOLD, letterSpacing: 1 }}>SYNCING…</span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}
            >×</button>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px 14px" }}>
            {error && (
              <div style={{ color: RED, fontSize: 10, padding: "10px 0" }}>{error}</div>
            )}

            {!error && !loading && rows.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 10, padding: "14px 0" }}>
                No portfolio holdings matched live market tickers.
                {unmatched > 0 && ` (${unmatched} unmatched position${unmatched > 1 ? "s" : ""})`}
              </div>
            )}

            {rows.map((r, i) => (
              <div key={i} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: 8,
                alignItems: "center",
                padding: "7px 0",
                borderBottom: `1px solid rgba(255,255,255,0.04)`,
              }}>
                <div>
                  <div style={{ fontSize: 12, color: "#DCEBF5", fontWeight: 700 }}>
                    {r.name}
                    <span style={{
                      marginLeft: 6, fontSize: 9, color: GOLD,
                      background: `${GOLD}18`, padding: "1px 5px", borderRadius: 3,
                    }}>{r.symbol}</span>
                  </div>
                  {r.value != null && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 2 }}>
                      portfolio value: {typeof r.value === "number" ? `$${r.value.toLocaleString()}` : r.value}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  {r.price != null && (
                    <div style={{ fontSize: 11, color: CY }}>{
                      typeof r.price === "number" ? r.price.toLocaleString(undefined, { maximumFractionDigits: 4 }) : r.price
                    }</div>
                  )}
                  <div style={{ fontSize: 9, color: "#6E8AA0", textTransform: "uppercase" }}>{r.type}</div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, minWidth: 58, textAlign: "right",
                  color: pctColor(r.pct),
                }}>
                  {fmtPct(r.pct)}
                </div>
              </div>
            ))}

            {unmatched > 0 && rows.length > 0 && (
              <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 8 }}>
                + {unmatched} holding{unmatched > 1 ? "s" : ""} not in active market feed
              </div>
            )}
          </div>

          {/* Footer: refresh cadence */}
          <div style={{
            padding: "6px 14px", fontSize: 9, color: "#6E8AA0",
            borderTop: `1px solid ${GOLD}22`, letterSpacing: 0.5,
          }}>
            auto-refresh every 60 s · /functions/getLiveIntel × /entities/Investment
          </div>
        </div>
      )}
    </>
  );
}
