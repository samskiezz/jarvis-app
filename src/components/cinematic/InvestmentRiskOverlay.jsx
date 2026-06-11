/**
 * F53 — Investment Risk Overlay.
 * Parallel-fetches /entities/Investment + /entities/RiskSignal;
 * keyword-correlates each investment against active risk signals;
 * shows a portfolio exposure grid (investment rows × risk heat columns);
 * click a matched pair → /v1/jarvis/agent/chat AI assessment + TTS via jarvis:speak-dossier.
 * Stats tiles: total investments / total risks / exposed count / critical exposure.
 * Toggle: ◈ IRO at left:4236 bottom strip with red badge when critical exposure found.
 * "JARVIS, investment risk" / "portfolio exposure" / "risk overlay" → isInvRiskOverlayQuery.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const GR  = "#4ADE80"; // green = safe
const AM  = "#FACC15"; // amber = mild exposure
const RD  = "#FF4444"; // red = critical
const OR  = "#FB923C"; // orange accent
const CY  = "#29E7FF";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IRO_RE =
  /\b(investment\s+risk|portfolio\s+(risk|exposure|overlay)|risk\s+overlay|iro|asset\s+risk|exposure\s+(map|overlay|analysis))\b/i;

// ── data fetchers ─────────────────────────────────────────────────────────────

async function fetchInvestments() {
  const r = await fetch(`${apiBase()}/entities/Investment`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.investments) ? d.investments
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : [];
}

async function askAI(investment, risk) {
  const invName = investment.name || investment.title || investment.asset_name || "Asset";
  const invType = investment.type || investment.asset_type || "";
  const invVal  = investment.value || investment.amount || investment.current_value || "";
  const riskTitle = risk.title || risk.name || risk.signal_name || "Risk Signal";
  const riskSev   = risk.severity || risk.level || risk.score || "";
  const riskDesc  = (risk.description || risk.summary || "").slice(0, 300);

  let context = `Investment asset: "${invName}"`;
  if (invType) context += `, type: ${invType}`;
  if (invVal)  context += `, value: ${invVal}`;
  context += `. Active risk signal: "${riskTitle}"`;
  if (riskSev) context += `, severity: ${riskSev}`;
  if (riskDesc) context += `. Risk details: ${riskDesc}`;
  context += ". Provide a 2-sentence assessment of this investment's exposure to this risk signal and a recommended action.";

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body:    JSON.stringify({ message: context }),
  });
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── correlation helpers ───────────────────────────────────────────────────────

function extractKeywords(obj, fields) {
  return fields
    .flatMap(f => {
      const v = obj[f];
      if (Array.isArray(v)) return v.map(String);
      if (typeof v === "string") return v.split(/[\s,_/-]+/);
      return [];
    })
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length > 3);
}

function correlate(investment, risk) {
  const invWords  = extractKeywords(investment, ["name", "title", "asset_name", "type", "asset_type", "sector", "tags", "description"]);
  const riskWords = extractKeywords(risk,       ["title", "name", "signal_name", "category", "tags", "description", "sector"]);
  const hits = riskWords.filter(w => invWords.includes(w));
  return hits.length;
}

function sevColor(s) {
  const v = typeof s === "string" ? s.toLowerCase() : String(s ?? "").toLowerCase();
  if (v === "critical" || Number(s) >= 90) return RD;
  if (v === "high"     || Number(s) >= 70) return OR;
  if (v === "medium"   || Number(s) >= 40) return AM;
  return CY;
}

// ── exported intent ───────────────────────────────────────────────────────────

export function isInvRiskOverlayQuery(text) {
  return IRO_RE.test(text || "");
}

export async function buildInvRiskOverlayScript() {
  let investments = [], risks = [];
  try { [investments, risks] = await Promise.all([fetchInvestments(), fetchRiskSignals()]); } catch (_) {}
  if (!investments.length) return "No investment assets found for risk overlay analysis at this time, sir.";
  const exposed = investments.filter(inv =>
    risks.some(r => correlate(inv, r) > 0)
  ).length;
  const critRisks = risks.filter(r => {
    const v = (r.severity || r.level || r.score || "").toString().toLowerCase();
    return v === "critical" || Number(r.severity) >= 90;
  }).length;
  return (
    `Investment Risk Overlay online. ${investments.length} asset${investments.length !== 1 ? "s" : ""} ` +
    `cross-referenced against ${risks.length} active risk signal${risks.length !== 1 ? "s" : ""}. ` +
    `${exposed} asset${exposed !== 1 ? "s" : ""} show keyword exposure` +
    (critRisks ? `; ${critRisks} critical signal${critRisks !== 1 ? "s" : ""} in play` : "") +
    `. Click any matched pair for AI assessment, sir.`
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestmentRiskOverlay() {
  const [open,        setOpen]      = useState(false);
  const [investments, setInv]       = useState([]);
  const [risks,       setRisks]     = useState([]);
  const [loading,     setLoading]   = useState(false);
  const [filter,      setFilter]    = useState("");
  const [tab,         setTab]       = useState("ALL"); // ALL | EXPOSED | CRITICAL
  const [selected,    setSelected]  = useState(null);  // { investment, risk }
  const [aiText,      setAiText]    = useState("");
  const [aiLoading,   setAiLoading] = useState(false);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetch.current < 55_000) return;
    lastFetch.current = now;
    setLoading(true);
    try {
      const [inv, rsk] = await Promise.all([fetchInvestments(), fetchRiskSignals()]);
      setInv(inv);
      setRisks(rsk);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // 60s auto-refresh
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { lastFetch.current = 0; load(); }, 60_000);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (IRO_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:invriskovl-toggle", onToggle);
    return () => window.removeEventListener("jarvis:invriskovl-toggle", onToggle);
  }, []);

  // Build flat pairs list: every (investment, risk) with a correlation score > 0
  const pairs = [];
  for (const inv of investments) {
    for (const risk of risks) {
      const score = correlate(inv, risk);
      if (score > 0) pairs.push({ investment: inv, risk, score });
    }
  }
  // Unique exposed investments
  const exposedInvIds = new Set(pairs.map(p => p.investment.id || p.investment._id || p.investment.name));
  const critPairs = pairs.filter(p => {
    const v = (p.risk.severity || p.risk.level || p.risk.score || "").toString().toLowerCase();
    return v === "critical" || Number(p.risk.severity) >= 90;
  });

  // Stats
  const totalInv   = investments.length;
  const totalRisks = risks.length;
  const exposedCnt = exposedInvIds.size;
  const critCnt    = critPairs.length;

  // Per-investment view: aggregate max risk severity colour
  const invRows = investments
    .filter(inv => {
      if (tab === "EXPOSED") return exposedInvIds.has(inv.id || inv._id || inv.name);
      if (tab === "CRITICAL") return pairs.some(p =>
        (p.investment.id || p.investment._id || p.investment.name) === (inv.id || inv._id || inv.name) &&
        ((p.risk.severity || "").toString().toLowerCase() === "critical" || Number(p.risk.severity) >= 90)
      );
      return true;
    })
    .filter(inv => {
      if (!filter.trim()) return true;
      const hay = [inv.name, inv.title, inv.asset_name, inv.type, inv.asset_type, inv.sector]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(filter.toLowerCase());
    });

  async function handleSelectPair(investment, risk) {
    setSelected({ investment, risk });
    setAiText("");
    setAiLoading(true);
    try {
      const text = await askAI(investment, risk);
      setAiText(text || "No assessment available.");
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setAiText("Unable to retrieve AI assessment at this time.");
    } finally {
      setAiLoading(false);
    }
  }

  const TABS = ["ALL", "EXPOSED", "CRITICAL"];

  return (
    <>
      {/* Toggle button — left:4236 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investment Risk Overlay (F53)"
        style={{
          position: "fixed", left: 4236, bottom: 18, zIndex: 68,
          background: open ? GR + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? GR : GR + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : GR,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${GR}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        IRO
        {critCnt > 0 && (
          <span style={{
            background: "#FF444444", color: RD,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {critCnt}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(700px,96vw)", maxHeight: "min(740px,88vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${GR}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${GR}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GR}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: GR,
              boxShadow: `0 0 10px ${GR}`, display: "inline-block",
              animation: loading ? "iropulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GR, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTMENT RISK OVERLAY
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "LOADING…" : `${totalInv} assets · ${totalRisks} risks`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "8px 14px",
            borderBottom: `1px solid ${GR}18`, flexShrink: 0,
          }}>
            {[
              { label: "ASSETS",  val: totalInv,   col: CY },
              { label: "RISKS",   val: totalRisks, col: OR },
              { label: "EXPOSED", val: exposedCnt, col: AM },
              { label: "CRITICAL PAIRS", val: critCnt, col: RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: col + "0d", border: `1px solid ${col}33`,
                borderRadius: 8, padding: "6px 10px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 900 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter + tabs */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 14px",
            borderBottom: `1px solid ${GR}14`, flexShrink: 0, alignItems: "center",
          }}>
            <input
              type="text"
              placeholder="filter assets…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                flex: 1, background: `rgba(74,222,128,0.06)`, border: `1px solid ${GR}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 9,
                padding: "4px 8px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? GR + "cc" : "transparent",
                  border: `1px solid ${tab === t ? GR : GR + "33"}`,
                  borderRadius: 4, color: tab === t ? "#04060A" : GR,
                  cursor: "pointer", padding: "3px 8px", fontSize: 8,
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                  letterSpacing: 1,
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body: left investment list + right detail/AI panel */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

            {/* Left: investment rows */}
            <div style={{
              width: 240, flexShrink: 0,
              borderRight: `1px solid ${GR}18`,
              overflowY: "auto",
            }}>
              {invRows.length === 0 && !loading && (
                <div style={{ padding: 14, color: DIM, fontSize: 9, textAlign: "center" }}>
                  {investments.length === 0 ? "No assets loaded." : "No matches."}
                </div>
              )}
              {invRows.map((inv, idx) => {
                const id    = inv.id || inv._id || idx;
                const name  = inv.name || inv.title || inv.asset_name || `Asset ${idx + 1}`;
                const type  = inv.type || inv.asset_type || "";
                const val   = inv.value || inv.current_value || inv.amount || "";
                const invPairs = pairs.filter(p =>
                  (p.investment.id || p.investment._id || p.investment.name) === (inv.id || inv._id || inv.name)
                );
                const maxSevColor = invPairs.length
                  ? invPairs.reduce((best, p) => {
                      const sc = sevColor(p.risk.severity || p.risk.level || p.risk.score);
                      const rank = [RD, OR, AM, CY];
                      return rank.indexOf(sc) < rank.indexOf(best) ? sc : best;
                    }, CY)
                  : GR;
                const isSelected = selected &&
                  (selected.investment.id || selected.investment._id || selected.investment.name) ===
                  (inv.id || inv._id || inv.name);

                return (
                  <div key={id} style={{
                    padding: "7px 10px",
                    background: isSelected ? `${GR}14` : "transparent",
                    borderBottom: `1px solid ${GR}0d`,
                    borderLeft: `3px solid ${maxSevColor}`,
                    cursor: invPairs.length ? "pointer" : "default",
                    transition: "all 0.12s",
                  }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${GR}08`; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                    onClick={() => {
                      if (!invPairs.length) return;
                      // open detail for first/highest-score pair
                      const best = invPairs.sort((a, b) => b.score - a.score)[0];
                      handleSelectPair(best.investment, best.risk);
                    }}
                  >
                    <div style={{
                      fontSize: 9, fontWeight: 700, color: isSelected ? GR : "#DCEBF5",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {name}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center" }}>
                      {type && (
                        <span style={{ fontSize: 7, color: DIM, background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 4px" }}>
                          {type.toUpperCase().slice(0, 10)}
                        </span>
                      )}
                      {val && (
                        <span style={{ fontSize: 7, color: CY }}>
                          {String(val).slice(0, 12)}
                        </span>
                      )}
                      {invPairs.length > 0 && (
                        <span style={{
                          fontSize: 7, color: maxSevColor,
                          background: maxSevColor + "22",
                          borderRadius: 3, padding: "1px 4px", marginLeft: "auto",
                        }}>
                          {invPairs.length} risk{invPairs.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: risk pairs + AI assessment */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selected ? (
                <>
                  {/* Selected investment header */}
                  <div style={{
                    padding: "8px 12px", borderBottom: `1px solid ${GR}18`,
                    flexShrink: 0,
                  }}>
                    <div style={{ color: GR, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
                      ◈ {(selected.investment.name || selected.investment.title || selected.investment.asset_name || "Asset").slice(0, 50)}
                    </div>
                    <div style={{ color: OR, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                      ⚠ {(selected.risk.title || selected.risk.name || selected.risk.signal_name || "Risk Signal").slice(0, 60)}
                    </div>
                    {(selected.risk.severity || selected.risk.level) && (
                      <span style={{
                        display: "inline-block", marginTop: 4,
                        fontSize: 7, color: sevColor(selected.risk.severity || selected.risk.level),
                        background: sevColor(selected.risk.severity || selected.risk.level) + "22",
                        borderRadius: 3, padding: "1px 5px",
                      }}>
                        {String(selected.risk.severity || selected.risk.level).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Related risk pairs for this investment */}
                  {(() => {
                    const invId = selected.investment.id || selected.investment._id || selected.investment.name;
                    const relPairs = pairs
                      .filter(p => (p.investment.id || p.investment._id || p.investment.name) === invId)
                      .sort((a, b) => b.score - a.score);
                    return relPairs.length > 1 ? (
                      <div style={{
                        padding: "6px 12px", borderBottom: `1px solid ${GR}14`,
                        flexShrink: 0,
                      }}>
                        <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 4 }}>
                          ALL CORRELATED RISKS ({relPairs.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {relPairs.map((p, i) => {
                            const rName = p.risk.title || p.risk.name || p.risk.signal_name || `Risk ${i+1}`;
                            const col   = sevColor(p.risk.severity || p.risk.level || p.risk.score);
                            const isAct = (p.risk.id || p.risk._id || rName) ===
                                          (selected.risk.id || selected.risk._id || (selected.risk.title || selected.risk.name));
                            return (
                              <button
                                key={p.risk.id || i}
                                onClick={() => handleSelectPair(p.investment, p.risk)}
                                style={{
                                  background: isAct ? col + "33" : col + "14",
                                  border: `1px solid ${col}${isAct ? "88" : "33"}`,
                                  borderRadius: 4, color: col,
                                  cursor: "pointer", padding: "2px 7px",
                                  fontSize: 7, fontFamily: "'JetBrains Mono',monospace",
                                  maxWidth: 130, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}
                                title={rName}
                              >
                                {rName.slice(0, 20)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* AI assessment */}
                  <div style={{
                    flex: 1, overflowY: "auto", padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {aiLoading && (
                      <div style={{
                        color: DIM, fontSize: 9, fontStyle: "italic",
                        animation: "iropulse 1s ease-in-out infinite",
                      }}>
                        Analysing exposure…
                      </div>
                    )}
                    {aiText && !aiLoading && (
                      <div style={{
                        background: "rgba(255,255,255,0.03)", border: `1px solid ${GR}22`,
                        borderRadius: 10, padding: "10px 12px",
                        fontSize: 9, color: "#DCEBF5", lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                      }}>
                        <div style={{ color: GR, fontSize: 7, letterSpacing: 1, marginBottom: 6 }}>
                          ◈ JARVIS AI ASSESSMENT
                        </div>
                        {aiText}
                      </div>
                    )}
                    {!aiLoading && !aiText && (
                      <div style={{ color: DIM, fontSize: 9, fontStyle: "italic", marginTop: 10 }}>
                        Select a risk pairing to get an AI exposure assessment.
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{
                    padding: "4px 12px", borderTop: `1px solid ${GR}11`,
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
                      /entities/Investment · /entities/RiskSignal · /v1/jarvis/agent/chat
                    </span>
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 8,
                  color: DIM, fontSize: 9, fontStyle: "italic", padding: 20,
                  textAlign: "center",
                }}>
                  <span>← click an exposed asset to see correlated risk signals</span>
                  {exposedCnt === 0 && !loading && totalInv > 0 && (
                    <span style={{ color: GR, fontStyle: "normal" }}>
                      No keyword correlations found between current assets and risk signals.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes iropulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
