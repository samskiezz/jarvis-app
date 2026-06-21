/**
 * InvestmentWidget — F23 Investment/Wealth Widget.
 * Sources portfolio data from /entities/Investment and /entities/WealthSnapshot.
 * Shows holdings, total value, allocation bars, and P&L indicators.
 * "JARVIS, investments" or "JARVIS, portfolio" opens the panel + TTS brief.
 * Toggle button in bottom-left strip at left:1116; auto-refreshes every 60s.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const GLD  = "#FFD700";
const GRN  = "#00E5A0";
const CY   = "#29E7FF";
const RED  = "#FF3B6B";
const MUTED = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const INVEST_RE = /\binvest|portfolio|wealth|holding|asset|stock|equity|fund|position|p&l|pnl/i;

async function fetchInvestments() {
  const r = await fetch(`${apiBase()}/entities/Investment`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.items)       ? d.items
    : Array.isArray(d?.results)     ? d.results
    : Array.isArray(d?.investments) ? d.investments
    : [];
}

async function fetchWealthSnapshot() {
  try {
    const r = await fetch(`${apiBase()}/entities/WealthSnapshot`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const arr = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : null;
    return arr ? arr[0] ?? null : (typeof d === "object" && d !== null ? d : null);
  } catch (_) {
    return null;
  }
}

export function isInvestmentQuery(text) {
  return INVEST_RE.test(text || "");
}

export async function buildInvestmentScript() {
  let investments = [];
  let snapshot = null;
  try { investments = await fetchInvestments(); } catch (_) {}
  try { snapshot = await fetchWealthSnapshot(); } catch (_) {}

  if (!investments.length && !snapshot) {
    return "No investment data is currently available, sir.";
  }

  const getName  = i => i.name || i.asset || i.ticker || i.symbol || i.title || "Unnamed";
  const getValue = i => {
    const v = i.current_value ?? i.value ?? i.market_value ?? i.amount ?? null;
    return v != null ? parseFloat(v) : null;
  };
  const total = investments.reduce((s, i) => {
    const v = getValue(i); return v != null ? s + v : s;
  }, 0);

  const snapshotTotal = snapshot
    ? (snapshot.total_value ?? snapshot.total ?? snapshot.net_worth ?? snapshot.wealth ?? null)
    : null;

  const displayTotal = snapshotTotal != null ? parseFloat(snapshotTotal) : (total || null);

  const top = investments.slice(0, 3).map(getName).join(", ");

  let script = `Investment portfolio: ${investments.length} holding${investments.length !== 1 ? "s" : ""}. `;
  if (displayTotal != null) {
    script += `Total value: ${formatCurrency(displayTotal)}. `;
  }
  if (top) script += `Top positions: ${top}.`;
  return script;
}

function formatCurrency(n) {
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function pnlColor(v) {
  if (v == null) return MUTED;
  return v > 0 ? GRN : v < 0 ? RED : MUTED;
}

function AllocationBar({ pct, color }) {
  return (
    <div style={{ marginTop: 4, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
      <div style={{
        height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color, borderRadius: 2,
        boxShadow: `0 0 6px ${color}88`,
        transition: "width 0.5s ease",
      }} />
    </div>
  );
}

export default function InvestmentWidget() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [snapshot,    setSnapshot]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [filter,      setFilter]      = useState("");
  const [tab,         setTab]         = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inv, snap] = await Promise.all([fetchInvestments(), fetchWealthSnapshot()]);
      setInvestments(inv);
      setSnapshot(snap);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (INVEST_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const getName     = i => i.name || i.asset || i.ticker || i.symbol || i.title || "Unnamed";
  const getValue    = i => { const v = i.current_value ?? i.value ?? i.market_value ?? i.amount ?? null; return v != null ? parseFloat(v) : null; };
  const getPnl      = i => { const v = i.pnl ?? i.gain_loss ?? i.unrealized_pnl ?? i.profit_loss ?? null; return v != null ? parseFloat(v) : null; };
  const getPnlPct   = i => { const v = i.pnl_pct ?? i.return_pct ?? i.gain_loss_pct ?? i.change_pct ?? null; return v != null ? parseFloat(v) : null; };
  const getType     = i => (i.asset_class || i.type || i.category || i.asset_type || "").toLowerCase();
  const getTicker   = i => i.ticker || i.symbol || "";

  const totalValue = investments.reduce((s, i) => { const v = getValue(i); return v != null ? s + v : s; }, 0);
  const snapshotTotal = snapshot ? parseFloat(snapshot.total_value ?? snapshot.total ?? snapshot.net_worth ?? snapshot.wealth ?? 0) : 0;
  const displayTotal = (snapshotTotal > 0 ? snapshotTotal : totalValue) || null;

  const tabs = ["all", ...Array.from(new Set(investments.map(getType).filter(Boolean))).slice(0, 4)];

  const visible = investments.filter(i => {
    if (tab !== "all" && getType(i) !== tab) return false;
    if (filter.trim()) {
      const hay = [getName(i), getTicker(i), getType(i)].join(" ").toLowerCase();
      return hay.includes(filter.toLowerCase());
    }
    return true;
  });

  const fmtAge = (t) => {
    if (!t) return "";
    const mins = Math.round((Date.now() - t.getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    return `${Math.round(mins / 60)}h ago`;
  };

  return (
    <>
      {/* Toggle button — bottom-left strip at left:1116 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment / Wealth Widget"
        style={{
          position: "fixed", left: 1116, bottom: 18, zIndex: 68,
          background: open ? GLD + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${GLD}55`,
          borderRadius: 8,
          color: open ? "#04060A" : GLD,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${GLD}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◆</span>
        WEALTH
        {investments.length > 0 && (
          <span style={{
            background: GLD + "44", color: GLD,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {investments.length}
          </span>
        )}
      </button>

      {/* Portfolio panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(460px,94vw)", maxHeight: "min(600px,78vh)",
          background: "rgba(4,8,14,0.95)",
          border: `1px solid ${GLD}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${GLD}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GLD}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: GLD,
              boxShadow: `0 0 10px ${GLD}`, display: "inline-block",
              animation: loading ? "wlpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GLD, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTMENT PORTFOLIO
            </span>
            <span style={{ marginLeft: "auto", color: MUTED, fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: MUTED,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Wealth summary bar */}
          {(displayTotal != null || snapshot) && (
            <div style={{
              padding: "8px 14px", borderBottom: `1px solid ${GLD}18`,
              display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
            }}>
              {displayTotal != null && (
                <span style={{ fontSize: 13, color: GLD, fontWeight: 700, letterSpacing: 1 }}>
                  {formatCurrency(displayTotal)}
                  <span style={{ fontSize: 9, color: MUTED, marginLeft: 6 }}>TOTAL</span>
                </span>
              )}
              {snapshot?.cash != null && (
                <span style={{ fontSize: 10, color: CY }}>
                  CASH {formatCurrency(parseFloat(snapshot.cash))}
                </span>
              )}
              {snapshot?.change_pct != null && (
                <span style={{ fontSize: 10, color: pnlColor(parseFloat(snapshot.change_pct)), marginLeft: "auto" }}>
                  {parseFloat(snapshot.change_pct) >= 0 ? "▲" : "▼"} {Math.abs(parseFloat(snapshot.change_pct)).toFixed(2)}%
                </span>
              )}
              <span style={{ fontSize: 9, color: MUTED }}>
                {investments.length} HOLDING{investments.length !== 1 ? "S" : ""}
              </span>
            </div>
          )}

          {/* Type filter tabs */}
          {tabs.length > 1 && (
            <div style={{
              padding: "5px 12px", borderBottom: `1px solid ${GLD}18`,
              display: "flex", gap: 6, overflowX: "auto",
            }}>
              {tabs.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? GLD + "33" : "transparent",
                  border: `1px solid ${tab === t ? GLD + "66" : GLD + "22"}`,
                  borderRadius: 5, color: tab === t ? GLD : MUTED,
                  cursor: "pointer", padding: "3px 9px",
                  fontSize: 9, letterSpacing: 1, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace",
                  textTransform: "uppercase", whiteSpace: "nowrap",
                }}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Filter input */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${GLD}18` }}>
            <input
              type="text"
              placeholder="filter holdings…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(255,215,0,0.05)`, border: `1px solid ${GLD}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Holdings list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: MUTED, fontSize: 10, textAlign: "center" }}>
                {investments.length === 0 ? "No investment data available." : "No matches."}
              </div>
            )}
            {visible.map((inv, i) => {
              const name    = getName(inv);
              const ticker  = getTicker(inv);
              const value   = getValue(inv);
              const pnl     = getPnl(inv);
              const pnlPct  = getPnlPct(inv);
              const type    = getType(inv);
              const alloc   = displayTotal && value ? (value / displayTotal) * 100 : null;

              return (
                <div key={inv.id || inv.investment_id || name + i} style={{
                  margin: "5px 10px",
                  background: `${GLD}07`,
                  border: `1px solid ${GLD}22`,
                  borderRadius: 8, padding: "9px 12px",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, color: GLD, lineHeight: 1 }}>◆</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {name}
                      {ticker && ticker !== name && (
                        <span style={{ color: MUTED, fontWeight: 400, marginLeft: 6 }}>{ticker}</span>
                      )}
                    </span>
                    {value != null && (
                      <span style={{ fontSize: 10, color: GLD, fontWeight: 700 }}>
                        {formatCurrency(value)}
                      </span>
                    )}
                  </div>

                  {/* Allocation bar */}
                  {alloc != null && (
                    <AllocationBar pct={alloc} color={GLD} />
                  )}

                  {/* PnL + meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
                    {pnl != null && (
                      <span style={{
                        fontSize: 9, color: pnlColor(pnl), letterSpacing: 0.5, fontWeight: 700,
                      }}>
                        {pnl >= 0 ? "▲" : "▼"} {formatCurrency(Math.abs(pnl))}
                      </span>
                    )}
                    {pnlPct != null && (
                      <span style={{
                        fontSize: 9, color: pnlColor(pnlPct),
                        border: `1px solid ${pnlColor(pnlPct)}44`,
                        borderRadius: 3, padding: "1px 5px",
                      }}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </span>
                    )}
                    {alloc != null && (
                      <span style={{ fontSize: 9, color: MUTED, marginLeft: "auto" }}>
                        {alloc.toFixed(1)}% alloc
                      </span>
                    )}
                    {type && (
                      <span style={{
                        fontSize: 8, color: CY + "88", border: `1px solid ${CY}22`,
                        borderRadius: 3, padding: "1px 5px", letterSpacing: 0.8,
                        textTransform: "uppercase",
                      }}>
                        {type}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wlpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
