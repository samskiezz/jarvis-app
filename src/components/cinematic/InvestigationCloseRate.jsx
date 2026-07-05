/**
 * InvestigationCloseRate — F164
 *
 * Polls /v1/investigations every 5 min; tracks the ratio of closed
 * (status: closed / resolved / archived) vs open cases over time using
 * localStorage; shows a close-rate gauge + sparkline + trend badge.
 *
 * If the rate falls for 2 consecutive readings, JARVIS speaks a brief
 * warning via jarvis:speak-dossier so the operator is notified hands-free.
 *
 * Toggle: ◎ CRATE  (left:53960, bottom:8, zIndex:80)
 * Event:  jarvis:crate-toggle
 * Voice:  "investigation close rate" | "case closure rate" |
 *         "cases resolved" | "close rate" | "crate" | "closure metric"
 * Refresh: every 5 min; stores up to 24 readings in localStorage.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GN   = "#00E5A0";
const AM   = "#F5A623";
const RD   = "#FF4444";
const DIM  = "#4A6070";
const BG   = "rgba(3,5,9,0.97)";
const POLL = 5 * 60 * 1000;
const MAX_H = 24;
const LS_KEY = "jarvis_crate_v1";
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CRATE_RE =
  /\b(investigation.close.rate|case.closure|close.rate|cases.resolved|crate|closure.metric|closure.trend)\b/i;

export function isCrateQuery(t) { return CRATE_RE.test(t || ""); }
export function buildCrateScript(history) {
  const latest = history[history.length - 1];
  return `Summarise the JARVIS investigation close-rate trend in 2 sentences. ` +
    `Current rate: ${latest?.rate ?? "?"}% (${latest?.closed ?? 0} closed / ${latest?.total ?? 0} total). ` +
    `Last ${history.length} readings: ${history.map(h => h.rate + "%").join(", ")}.`;
}

const CLOSED_STATUS = new Set(["closed", "resolved", "archived"]);

function classify(inv) {
  const s = (inv?.status || "").toLowerCase().replace(/_/g, "-");
  return CLOSED_STATUS.has(s) ? "closed" : "open";
}

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)           ? d.data
    : Array.isArray(d?.items)          ? d.items
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.cases)          ? d.cases
    : Array.isArray(d?.results)        ? d.results
    : [];
}

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveHistory(h) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(h.slice(-MAX_H))); } catch {}
}

function Spark({ history, color }) {
  if (history.length < 2) return null;
  const vals = history.map((h) => h.rate);
  const max = Math.max(...vals, 1);
  const W = 200, H = 28;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * H}`)
    .join(" ");
  const last = history[history.length - 1];
  const lx = W;
  const ly = H - (last.rate / max) * H;
  return (
    <svg width={W} height={H} style={{ display: "block", overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} />
    </svg>
  );
}

export default function InvestigationCloseRate() {
  const [open, setOpen]     = useState(false);
  const [history, setHist]  = useState(loadHistory);
  const [loading, setLoad]  = useState(false);
  const [err, setErr]       = useState(null);
  const [lastTs, setLastTs] = useState(null);
  const timer = useRef(null);

  const poll = useCallback(async () => {
    setLoad(true); setErr(null);
    try {
      const invs  = await fetchInvestigations();
      const total  = invs.length;
      const closed = invs.filter((i) => classify(i) === "closed").length;
      const rate   = total > 0 ? Math.round((closed / total) * 100) : 0;
      const ts     = Date.now();
      const h      = loadHistory();
      h.push({ ts, total, closed, open: total - closed, rate });
      saveHistory(h);
      const trimmed = h.slice(-MAX_H);
      setHist(trimmed);
      setLastTs(ts);

      if (trimmed.length >= 3) {
        const tail = trimmed.slice(-3);
        if (tail[2].rate < tail[1].rate && tail[1].rate < tail[0].rate) {
          window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
            detail: {
              text: `Warning: investigation close rate declining. ` +
                `Now ${rate}% — was ${tail[0].rate}% three readings ago.`,
            },
          }));
        }
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoad(false);
    }
  }, []);

  useEffect(() => {
    poll();
    timer.current = setInterval(poll, POLL);
    return () => clearInterval(timer.current);
  }, [poll]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => { if (isCrateQuery(e.detail?.query)) setOpen(true); };
    window.addEventListener("jarvis:crate-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:crate-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const latest = history[history.length - 1] ?? null;
  const prev   = history.length >= 2 ? history[history.length - 2] : null;
  const delta  = latest && prev ? latest.rate - prev.rate : null;
  const trend  = delta === null ? "—" : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const trendC = trend === "↑" ? GN : trend === "↓" ? AM : DIM;
  const gaugeC = !latest ? DIM
    : latest.rate >= 70 ? GN
    : latest.rate >= 40 ? AM
    : RD;

  const BTN_LEFT = 53960;

  return (
    <>
      {/* ── Toggle button ─────────────────────────────────────────────────── */}
      <button
        title="Investigation Close Rate (CRATE)"
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 80,
          height: 26, padding: "0 8px", borderRadius: 5,
          background: open ? "rgba(41,231,255,0.12)" : "rgba(8,14,22,0.82)",
          border: `1px solid ${open ? CY : "#2A3A4A"}`,
          color: open ? CY : "#6E8AA0",
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◎ CRATE{latest !== null && (
          <span style={{ marginLeft: 5, color: gaugeC, fontWeight: 700 }}>
            {latest.rate}%
          </span>
        )}
      </button>

      {/* ── Panel ─────────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: Math.min(BTN_LEFT, window.innerWidth - 290),
          zIndex: 81,
          background: BG,
          border: `1px solid ${CY}33`,
          borderRadius: 6,
          padding: "12px 14px",
          width: 270,
          fontFamily: MONO,
          color: CY,
          boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
        }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>◎ CASE CLOSURE RATE</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >✕</button>
          </div>

          {loading && !latest && (
            <div style={{ fontSize: 10, color: DIM, textAlign: "center", padding: "12px 0" }}>
              ◌ loading…
            </div>
          )}
          {err && (
            <div style={{ fontSize: 10, color: RD, padding: "4px 0" }}>⚠ {err}</div>
          )}

          {latest && (
            <>
              {/* Big rate number + trend */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 40, fontWeight: 700, color: gaugeC, lineHeight: 1 }}>
                  {latest.rate}%
                </span>
                <span style={{ fontSize: 22, color: trendC, lineHeight: 1 }}>{trend}</span>
                {delta !== null && (
                  <span style={{ fontSize: 9, color: trendC, alignSelf: "flex-end" }}>
                    {delta > 0 ? "+" : ""}{delta}pp
                  </span>
                )}
                <span style={{ fontSize: 8, color: DIM, marginLeft: "auto", alignSelf: "flex-end" }}>
                  {loading ? "↻" : lastTs ? new Date(lastTs).toLocaleTimeString() : ""}
                </span>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "TOTAL",  val: latest.total,  c: CY },
                  { label: "CLOSED", val: latest.closed, c: GN },
                  { label: "OPEN",   val: latest.open,   c: AM },
                ].map(({ label, val, c }) => (
                  <div key={label} style={{
                    flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4,
                    padding: "5px 4px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 18, color: c, fontWeight: 700 }}>{val}</div>
                    <div style={{ fontSize: 8, color: DIM, letterSpacing: 1 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Gauge bar */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ height: 5, background: "#1E3A4A", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${latest.rate}%`, background: gaugeC,
                    borderRadius: 3, transition: "width 0.6s ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: DIM, marginTop: 2 }}>
                  <span>0%</span><span>CLOSE RATE</span><span>100%</span>
                </div>
              </div>

              {/* Sparkline */}
              {history.length >= 2 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 8, color: DIM, marginBottom: 4, letterSpacing: 1 }}>
                    RATE HISTORY — {history.length} READINGS
                  </div>
                  <Spark history={history} color={gaugeC} />
                </div>
              )}

              {/* Assess button */}
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("jarvis:ask", {
                    detail: { query: buildCrateScript(history.slice(-6)) },
                  }));
                }}
                style={{
                  marginTop: 4, width: "100%",
                  background: "rgba(41,231,255,0.08)",
                  border: `1px solid ${CY}55`,
                  color: CY, fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                  padding: "5px 0", borderRadius: 3, cursor: "pointer",
                }}
              >
                ▶ JARVIS ASSESS CLOSURE TREND
              </button>
            </>
          )}

          <div style={{ marginTop: 8, fontSize: 7, color: DIM, textAlign: "center", letterSpacing: 0.5 }}>
            POLLS /v1/investigations · 5-MIN REFRESH
          </div>
        </div>
      )}
    </>
  );
}
