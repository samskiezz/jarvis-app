/**
 * InvestmentSnapshotDrawer — slide-in right-edge drawer listing investment
 * holdings from GET /entities/Investment, polling every 5 min while open.
 *
 * Tab sits at 5 % from top (right edge, above KnowledgeTimelinePanel at 20 %).
 * Mounted in src/Layout.jsx after ContactsDirectoryDrawer.
 *
 * Endpoint: GET /entities/Investment
 * → array | { items | investments | data | results: [...] }
 *   each holding: { id, name|ticker|symbol, asset_class|type|kind,
 *                   quantity|shares, current_value|value|price,
 *                   pnl|profit_loss|unrealized_pnl,
 *                   pnl_pct|return_pct|return_percent,
 *                   currency, updated_at|created_at }
 */
import { useEffect, useReducer, useRef, useState } from "react";
import { SHELL as S } from "@/domain/colors";
import { kimiClient } from "@/api/kimiClient";

const POLL_MS  = 300_000; // 5 min
const DRAWER_W = 340;
const GLD  = "#FFD700";
const GRN  = "#00E5A0";
const RED  = "#FF3B6B";
const GREY = "#4e6070";

function normalise(raw) {
  if (!raw) return [];
  if (Array.isArray(raw))                    return raw;
  if (Array.isArray(raw.items))              return raw.items;
  if (Array.isArray(raw.investments))        return raw.investments;
  if (Array.isArray(raw.data))               return raw.data;
  if (Array.isArray(raw.results))            return raw.results;
  if (Array.isArray(raw.holdings))           return raw.holdings;
  return [];
}

function fmt(n) {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(v)) return "—";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtPct(n) {
  const v = typeof n === "number" ? n : parseFloat(n);
  if (isNaN(v)) return null;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function relTime(ts) {
  if (!ts) return "—";
  const ms   = typeof ts === "number" && ts < 1e12 ? ts * 1000 : Number(ts);
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 0)      return "just now";
  if (diff < 60)     return `${diff}s ago`;
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function InvestmentSnapshotDrawer() {
  const [open,     setOpen]     = useState(false);
  const [holdings, setHoldings] = useState(null);
  const [err,      setErr]      = useState(false);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    kimiClient
      .request("/entities/Investment")
      .then((raw) => {
        if (alive) { setHoldings(normalise(raw)); setErr(false); }
      })
      .catch(() => {
        if (alive) setErr(true);
      });

    timerRef.current = setTimeout(() => { if (alive) bump(); }, POLL_MS);
    return () => { alive = false; clearTimeout(timerRef.current); };
  }, [open, tick]);

  const items = holdings ?? [];

  const totalValue = items.reduce((sum, h) => {
    const v = parseFloat(h.current_value ?? h.value ?? h.price ?? 0);
    return isNaN(v) ? sum : sum + v;
  }, 0);

  return (
    <>
      {/* Fixed toggle tab — right edge, 5 % from top */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close portfolio" : "Open investment snapshot"}
        style={{
          position: "fixed",
          right: open ? DRAWER_W : 0,
          top: "5%",
          transform: "translateY(0)",
          zIndex: 9000,
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          background: "rgba(2,6,10,0.92)",
          border: `1px solid ${GLD}55`,
          borderRight: open ? "none" : `1px solid ${GLD}55`,
          color: GLD,
          fontFamily: S.mono,
          fontSize: S.fs.xxs,
          letterSpacing: 2,
          padding: "10px 5px",
          cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 0.2s ease",
          userSelect: "none",
        }}
      >
        {open ? "PORTFOLIO ▶" : "◀ PORTFOLIO"}
      </button>

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          right: open ? 0 : -DRAWER_W,
          top: 0,
          bottom: 0,
          width: DRAWER_W,
          zIndex: 8990,
          background: "rgba(2,6,10,0.96)",
          backdropFilter: S.blur,
          WebkitBackdropFilter: S.blur,
          borderLeft: `1px solid ${GLD}33`,
          display: "flex",
          flexDirection: "column",
          transition: "right 0.2s ease",
          fontFamily: S.mono,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: `1px solid ${S.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: S.fs.xs, color: GLD, letterSpacing: 2, flex: 1 }}>
            PORTFOLIO
          </span>
          {holdings !== null && totalValue > 0 && (
            <span style={{ fontSize: S.fs.xxs, color: GLD, letterSpacing: 1 }}>
              {fmt(totalValue)}
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {!open ? null : err ? (
            <div style={{ padding: "20px 14px", color: "#e8203c", fontSize: S.fs.xs, letterSpacing: 1 }}>
              ENDPOINT UNREACHABLE
            </div>
          ) : holdings === null ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              LOADING…
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 14px", color: S.text, fontSize: S.fs.xxs, letterSpacing: 1 }}>
              NO HOLDINGS
            </div>
          ) : (
            items.map((h, idx) => {
              const name    = h.name ?? h.ticker ?? h.symbol ?? `Holding #${idx + 1}`;
              const cls     = (h.asset_class ?? h.type ?? h.kind ?? "").toUpperCase();
              const qty     = h.quantity ?? h.shares;
              const val     = h.current_value ?? h.value ?? h.price;
              const pnl     = h.pnl ?? h.profit_loss ?? h.unrealized_pnl;
              const pnlPct  = h.pnl_pct ?? h.return_pct ?? h.return_percent;
              const age     = relTime(h.updated_at ?? h.created_at);

              const pnlNum  = typeof pnl === "number" ? pnl : parseFloat(pnl);
              const pnlSign = !isNaN(pnlNum) ? (pnlNum >= 0 ? GRN : RED) : GREY;
              const pnlPctStr = fmtPct(pnlPct);

              return (
                <div
                  key={h.id ?? idx}
                  style={{
                    padding: "8px 14px",
                    borderBottom: `1px solid ${S.border}`,
                    borderLeft: `3px solid ${GLD}44`,
                  }}
                >
                  {/* name + asset class badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: S.fs.xs,
                        color: S.textHi,
                        letterSpacing: 0.5,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {name}
                    </span>
                    {cls && (
                      <span
                        style={{
                          fontSize: S.fs.xxs,
                          color: GLD,
                          border: `1px solid ${GLD}55`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          letterSpacing: 1,
                          flexShrink: 0,
                        }}
                      >
                        {cls}
                      </span>
                    )}
                  </div>

                  {/* value / qty / P&L / age */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      fontSize: S.fs.xxs,
                      color: GREY,
                      marginTop: 3,
                      letterSpacing: 0.5,
                    }}
                  >
                    {val != null && (
                      <span style={{ color: GLD }}>{fmt(val)}</span>
                    )}
                    {qty != null && (
                      <span>×{qty}</span>
                    )}
                    {!isNaN(pnlNum) && (
                      <span style={{ color: pnlSign }}>
                        {fmt(pnlNum)}
                        {pnlPctStr && ` (${pnlPctStr})`}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto" }}>{age}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${S.border}`,
            fontSize: S.fs.xxs,
            color: S.text,
            letterSpacing: 1,
            flexShrink: 0,
          }}
        >
          {holdings !== null
            ? `${items.length} HOLDING${items.length !== 1 ? "S" : ""} · 5 MIN POLL`
            : err
            ? "ERR"
            : "…"}
        </div>
      </div>
    </>
  );
}
