/**
 * CryptoRiskCorrelator — F211.
 *
 * Parallel-fetches /functions/getLiveIntel (crypto + FX markets)
 * and /entities/RiskSignal.
 *
 * Keyword-correlates each active risk signal (title/category/tags/summary)
 * against live crypto/FX asset names and tickers to surface:
 *   EXPOSED  — signal has ≥1 keyword overlap with a live market asset
 *   ISOLATED — signal has no live crypto/FX correlation
 *
 * Stat tiles: assets / signals / exposed / isolated
 * Filter tabs: ALL / EXPOSED / ISOLATED + text search
 * Expand signal → matched assets with change_pct + relevance score.
 * ▶ ASSESS per signal → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier.
 * 5-min auto-refresh.
 *
 * Intent: "crypto risk" / "bitcoin risk" / "financial risk signal" /
 *         "market risk signal" / "crypto correlation" / "cryptorsk"
 *   → jarvis:cryptorsk-toggle + TTS brief via buildCryptorskScript()
 *
 * Toggle: ◈ CRYPTORSK at left:31000, bottom:8, zIndex:61.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveIntel } from "@/api/backendFunctions";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF4466";
const PUR   = "#A78BFA";

const BTN_LEFT   = 31000;
const REFRESH_MS = 300_000; // 5 min

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalisers ─────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseSignals(raw) {
  return normaliseArray(raw).map((s) => ({
    id:       s.id || String(Math.random()),
    title:    s.title || s.name || s.signal_name || "Unnamed Signal",
    category: s.category || s.type || s.signal_type || "",
    severity: (s.severity || s.level || "medium").toLowerCase(),
    tags:     Array.isArray(s.tags) ? s.tags.join(" ") : (s.tags || ""),
    summary:  s.summary || s.description || s.details || "",
  }));
}

/** Extract crypto/FX assets from getLiveIntel payload. */
function extractAssets(data) {
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  return markets.map((m) => {
    const sym     = m.symbol || m.ticker || m.name || "";
    const display = m.display || m.name || sym;
    const chg     = m.change_pct ?? m.changePercent ?? m.pct_change ?? null;
    const atype   = m.asset_type === "FX" || m.type === "FX" ? "FX" : "CRYPTO";
    const keywords = [
      sym.toLowerCase(),
      display.toLowerCase(),
      ...(sym.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 0)),
      ...(display.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2)),
    ].filter(Boolean);
    return { sym, display, chg: chg != null ? Number(chg) : null, atype, keywords };
  }).filter((a) => a.sym);
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function matchScore(signal, asset) {
  const sigText = `${signal.title} ${signal.category} ${signal.tags} ${signal.summary}`.toLowerCase();
  return asset.keywords.reduce((acc, kw) => acc + (sigText.includes(kw) ? 1 : 0), 0)
    + tokens(signal.title).reduce((acc, w) => acc + (asset.display.toLowerCase().includes(w) ? 1 : 0), 0);
}

function correlate(signals, assets) {
  return signals.map((sig) => {
    const matched = assets
      .map((a) => ({ ...a, _score: matchScore(sig, a) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 6);
    return { ...sig, matched };
  });
}

function severityCol(sev) {
  if (sev === "critical") return RED;
  if (sev === "high")     return AMBER;
  if (sev === "medium")   return "#F5D623";
  return GREEN;
}

function chgCol(chg) {
  if (chg == null) return "#445566";
  return chg >= 0 ? GREEN : RED;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const CRYPTORSK_RE =
  /crypto.{0,12}risk|bitcoin.{0,12}risk|financial.{0,15}risk.{0,12}signal|market.{0,12}risk.{0,12}signal|risk.{0,12}signal.{0,15}market|risk.{0,12}signal.{0,15}crypto|crypto.{0,15}correlat|market.{0,15}correlat|cryptorsk\b/i;

export function isCryptorskQuery(q) {
  return CRYPTORSK_RE.test(q || "");
}

export async function buildCryptorskScript() {
  try {
    const [intelData, sigRaw] = await Promise.all([
      getLiveIntel({ type: "all" }),
      fetch(`${apiBase()}/entities/RiskSignal`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const assets   = extractAssets(intelData);
    const signals  = normaliseSignals(sigRaw);
    const corr     = correlate(signals, assets);
    const exposed  = corr.filter((s) => s.matched.length > 0);
    const isolated = corr.filter((s) => s.matched.length === 0);
    const topExposed = exposed
      .filter((s) => s.severity === "critical" || s.severity === "high")
      .slice(0, 2)
      .map((s) => `"${s.title}"`)
      .join(", ");
    return `Crypto-risk correlation complete, sir. ${assets.length} live market asset${assets.length !== 1 ? "s" : ""} cross-referenced against ${signals.length} active risk signal${signals.length !== 1 ? "s" : ""}. ${exposed.length} signal${exposed.length !== 1 ? "s show" : " shows"} financial market keyword exposure${topExposed ? ` — highest severity: ${topExposed}` : ""}. ${isolated.length} signal${isolated.length !== 1 ? "s" : ""} appear isolated from live crypto and FX markets; I recommend reviewing the exposed signals for portfolio or operational risk implications.`;
  } catch (_) {
    return "Crypto risk correlator is standing by, sir.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function CryptoRiskCorrelator() {
  const [visible, setVisible]     = useState(false);
  const [assets, setAssets]       = useState([]);
  const [signals, setSignals]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [intelData, sigRaw] = await Promise.all([
        getLiveIntel({ type: "all" }),
        fetch(`${apiBase()}/entities/RiskSignal`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setAssets(extractAssets(intelData));
      setSignals(normaliseSignals(sigRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:cryptorsk-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cryptorsk-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessSignal(sig, matched) {
    setAssessing(sig.id);
    const assetList = matched.length > 0
      ? matched.map((a) => a.display).join(", ")
      : "none";
    const prompt = `As JARVIS, provide a 2-sentence financial-risk intelligence brief on the risk signal "${sig.title}" (severity: ${sig.severity}, category: ${sig.category}) and its correlation with live crypto/FX markets: ${assetList}. Focus on portfolio or operational risk implications and recommended action.`;
    try {
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Assessment unavailable, sir.";
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: "Assessment unavailable at this time, sir." },
        })
      );
    }
    setAssessing(null);
  }

  const correlated = correlate(signals, assets);
  const exposed    = correlated.filter((s) => s.matched.length > 0);
  const isolated   = correlated.filter((s) => s.matched.length === 0);

  const base =
    tab === "EXPOSED"  ? exposed  :
    tab === "ISOLATED" ? isolated : correlated;

  const displayed = search.trim()
    ? base.filter((s) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.category.toLowerCase().includes(search.toLowerCase()) ||
        s.severity.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Crypto × Risk Signal Correlator (F211)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 61,
          background: visible ? `${PUR}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? PUR : `${PUR}44`}`,
          color: visible ? PUR : `${PUR}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ CRYPTORSK
        {exposed.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{exposed.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 300), zIndex: 61,
          width: 660, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${PUR}33`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${PUR}14`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: PUR, fontSize: 11, letterSpacing: 2 }}>
              ◈ CRYPTO × RISK SIGNAL CORRELATOR
            </span>
            <button
              onClick={fetchData}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${PUR}33`, borderRadius: 3,
                color: `${PUR}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
              }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, marginBottom: 10,
          }}>
            {[
              ["ASSETS",    assets.length,   CY],
              ["SIGNALS",   signals.length,  PUR],
              ["EXPOSED",   exposed.length,  exposed.length > 0 ? AMBER : "#445566"],
              ["ISOLATED",  isolated.length, GREEN],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>
                  {loading ? "…" : val}
                </div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {["ALL", "EXPOSED", "ISOLATED"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${PUR}22` : "transparent",
                border: `1px solid ${tab === t ? PUR : "#1e3040"}`,
                color: tab === t ? PUR : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search signals…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: `1px solid ${PUR}33`, borderRadius: 4,
                color: "#DCEBF5", padding: "3px 8px", fontSize: 8,
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 140,
              }}
            />
          </div>

          {/* Signal rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating risk signals against live crypto/FX markets…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "EXPOSED"
                ? "No risk signals show crypto/FX market exposure."
                : "No items in this filter."}
            </div>
          ) : (
            displayed.map((sig) => {
              const isExposed = sig.matched.length > 0;
              const isOpen    = expanded === sig.id;
              const sevCol    = severityCol(sig.severity);
              return (
                <div
                  key={sig.id}
                  onClick={() => setExpanded(isOpen ? null : sig.id)}
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: `1px solid ${isOpen ? `${PUR}44` : "#1a2530"}`,
                    borderLeft: `3px solid ${isExposed ? AMBER : GREEN}`,
                    borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                    cursor: "pointer",
                  }}
                >
                  {/* Signal header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 7, color: sevCol,
                      border: `1px solid ${sevCol}44`,
                      borderRadius: 3, padding: "1px 5px",
                      letterSpacing: 1, whiteSpace: "nowrap",
                      textTransform: "uppercase", flexShrink: 0,
                    }}>{sig.severity}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {sig.title}
                    </span>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isExposed ? AMBER : GREEN,
                    }}>
                      {isExposed
                        ? `${sig.matched.length} asset${sig.matched.length !== 1 ? "s" : ""} EXPOSED`
                        : "ISOLATED"}
                    </span>
                  </div>

                  {sig.category && (
                    <div style={{ color: "#445566", fontSize: 7, marginTop: 3, letterSpacing: 1 }}>
                      {sig.category.toUpperCase()}
                    </div>
                  )}

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 5 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessSignal(sig, sig.matched); }}
                      disabled={assessing === sig.id}
                      style={{
                        background: assessing === sig.id ? "#1a2530" : `${PUR}18`,
                        color: assessing === sig.id ? "#445566" : PUR,
                        border: `1px solid ${PUR}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1,
                        cursor: assessing === sig.id ? "default" : "pointer",
                      }}
                    >
                      {assessing === sig.id ? "…assessing" : "▶ ASSESS"}
                    </button>
                  </div>

                  {/* Expanded: matched assets */}
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${PUR}18` }}>
                      {sig.matched.length === 0 ? (
                        <div style={{
                          color: GREEN, fontSize: 8, lineHeight: 1.5,
                          background: `${GREEN}0a`, borderRadius: 4, padding: "6px 8px",
                        }}>
                          ✓ No live crypto/FX market keywords detected in this risk signal.
                        </div>
                      ) : (
                        sig.matched.map((a, i) => (
                          <div key={`${a.sym}-${i}`} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderLeft: `3px solid ${AMBER}`,
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                            display: "flex", alignItems: "center", gap: 8,
                          }}>
                            <span style={{
                              fontSize: 7, color: a.atype === "FX" ? CY : PUR,
                              border: `1px solid ${a.atype === "FX" ? CY : PUR}44`,
                              borderRadius: 3, padding: "1px 5px",
                              letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0,
                            }}>{a.atype}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{a.display || a.sym}</div>
                            </div>
                            {a.chg != null && (
                              <span style={{ fontSize: 8, color: chgCol(a.chg), whiteSpace: "nowrap", flexShrink: 0 }}>
                                {a.chg >= 0 ? "+" : ""}{a.chg.toFixed(2)}%
                              </span>
                            )}
                            <div style={{ fontSize: 7, color: `${AMBER}66`, whiteSpace: "nowrap", flexShrink: 0 }}>
                              match {a._score}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{
            marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right",
          }}>
            /functions/getLiveIntel + /entities/RiskSignal · 5-min auto-refresh · ▶ ASSESS for AI crypto-risk brief
          </div>
        </div>
      )}
    </>
  );
}
