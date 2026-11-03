/**
 * LearnedPatternExplorer — F297.
 *
 * Data sources (confirmed-real):
 *   GET /v1/predict/patterns?series=...&window=N
 *       → {motifs:[{start_a,start_b,length,distance},...],
 *          discords:[{start,length,distance},...],
 *          regimes:[{label,start,end,centroid},...],
 *          changepoints:[int,...],
 *          anomalies:[int,...]}
 *   GET /v1/predict/improvement
 *       → {model_scores:[...], pending_retrains:[...], recent_evals:[...]}
 *   POST /v1/jarvis/agent/chat  → ASSESS
 *   POST /v1/voice/tts          → speak
 *
 * UI:
 *   - Textarea: paste comma-separated floats + window slider (1–20, default 7)
 *   - "Discover" button → hits /v1/predict/patterns
 *   - Tree view grouped by type: MOTIFS / DISCORDS / REGIMES / CHANGEPOINTS / ANOMALIES
 *   - Each group expandable; items show detail; confidence/distance bars
 *   - Filter: confidence threshold slider (hides items above distance threshold)
 *   - Improvement panel: /v1/predict/improvement model_scores + pending_retrains
 *   - ASSESS + TTS
 *
 * Toggle: ◈ LRNPTN  left:214120  bottom:8  zIndex:393
 * Event:  jarvis:lrnptn-toggle
 * Voice:  "learned pattern / lrnptn / pattern explorer / motif / discord / regime /
 *          changepoint / anomaly patterns / predict patterns / pattern discovery"
 *
 * Exported for JarvisBrain: isLrnptnQuery
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ── palette ─────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const VI   = "#A78BFA";
const OR   = "#FB923C";
const SURF = "rgba(6,11,18,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.40)";

// ── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT = 214120;
const PANEL_W  = 960;
const PANEL_H  = 660;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const PATTERN_TYPES = [
  { key: "motifs",       label: "MOTIFS",       color: CY  },
  { key: "discords",     label: "DISCORDS",     color: RD  },
  { key: "regimes",      label: "REGIMES",      color: AM  },
  { key: "changepoints", label: "CHANGEPOINTS", color: OR  },
  { key: "anomalies",    label: "ANOMALIES",    color: VI  },
];

// ── JarvisBrain export ───────────────────────────────────────────────────────
const LRNPTN_RE =
  /\b(learned\s*pattern|lrnptn\b|pattern\s*explorer|motif|discord|regime|changepoint|anomaly\s*pattern|predict\s*pattern|pattern\s*discover|time[- ]?series\s*pattern)\b/i;

export function isLrnptnQuery(q) {
  return LRNPTN_RE.test(q || "");
}

// ── helpers ──────────────────────────────────────────────────────────────────
function parseSeriesInput(raw) {
  return raw
    .split(/[\s,;]+/)
    .map(s => parseFloat(s.trim()))
    .filter(v => !Number.isNaN(v));
}

function buildSeriesQS(arr, window) {
  const parts = arr.map(v => `series=${encodeURIComponent(v)}`);
  parts.push(`window=${window}`);
  return parts.join("&");
}

function distanceOf(item) {
  if (typeof item?.distance === "number") return item.distance;
  return null;
}

function confidenceBar(value, maxVal, color) {
  const pct = maxVal > 0 ? Math.min(100, (value / maxVal) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2,
      }}>
        <div style={{
          width: `${pct}%`, height: "100%",
          background: color, borderRadius: 2, opacity: 0.75,
        }} />
      </div>
      <span style={{ color, fontSize: 8, minWidth: 32, textAlign: "right" }}>
        {value.toFixed(3)}
      </span>
    </div>
  );
}

// ── TTS ──────────────────────────────────────────────────────────────────────
async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return;
    const buf = await r.arrayBuffer();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createBufferSource();
    src.buffer = await ctx.decodeAudioData(buf);
    src.connect(ctx.destination);
    src.start();
  } catch {}
}

// ── sub-components ───────────────────────────────────────────────────────────
function SectionHeader({ label, color = CY, count }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      color, fontSize: 8, letterSpacing: 1.5, marginBottom: 4,
      borderBottom: `1px solid rgba(41,231,255,0.12)`, paddingBottom: 2,
    }}>
      <span>{label.toUpperCase()}</span>
      {count != null && (
        <span style={{
          padding: "0 5px", borderRadius: 10,
          background: `${color}22`, border: `1px solid ${color}44`, fontSize: 8,
        }}>{count}</span>
      )}
    </div>
  );
}

function btnStyle(color, active = false) {
  return {
    background: active ? `${color}22` : "transparent",
    border: `1px solid ${color}55`,
    color, fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
    padding: "2px 7px", borderRadius: 3, cursor: "pointer",
  };
}

function MotifItem({ item, maxDist }) {
  return (
    <div style={{ padding: "4px 0", borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
      <div style={{ display: "flex", gap: 8, color: "#aab8c8", fontSize: 9 }}>
        <span style={{ color: CY }}>idx {item.start_a}</span>
        <span style={{ color: DIM }}>↔</span>
        <span style={{ color: CY }}>idx {item.start_b}</span>
        <span style={{ color: DIM }}>len {item.length}</span>
      </div>
      {typeof item.distance === "number" && confidenceBar(item.distance, maxDist || 1, CY)}
    </div>
  );
}

function DiscordItem({ item, maxDist }) {
  return (
    <div style={{ padding: "4px 0", borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
      <div style={{ display: "flex", gap: 8, color: "#aab8c8", fontSize: 9 }}>
        <span style={{ color: RD }}>idx {item.start ?? item.index ?? "?"}</span>
        <span style={{ color: DIM }}>len {item.length ?? "—"}</span>
      </div>
      {typeof item.distance === "number" && confidenceBar(item.distance, maxDist || 1, RD)}
    </div>
  );
}

function RegimeItem({ item }) {
  return (
    <div style={{ padding: "4px 0", borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
      <div style={{ display: "flex", gap: 8, color: "#aab8c8", fontSize: 9 }}>
        <span style={{ color: AM }}>label {item.label}</span>
        <span style={{ color: DIM }}>
          [{item.start} – {item.end}]
        </span>
        <span style={{ color: GN }}>centroid {typeof item.centroid === "number" ? item.centroid.toFixed(4) : "—"}</span>
      </div>
    </div>
  );
}

function PatternGroup({ ptype, items, expanded, onToggle, distThreshold }) {
  const { key, label, color } = ptype;
  const filtered = distThreshold > 0
    ? items.filter(item => {
        const d = distanceOf(item);
        return d === null || d <= distThreshold;
      })
    : items;
  const count = filtered.length;

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={onToggle}
        style={{
          ...btnStyle(color, expanded),
          display: "flex", alignItems: "center", gap: 6,
          width: "100%", textAlign: "left", padding: "3px 8px",
        }}
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span style={{ letterSpacing: 1.2 }}>{label}</span>
        <span style={{
          marginLeft: "auto", padding: "0 5px", borderRadius: 10,
          background: `${color}22`, border: `1px solid ${color}44`, fontSize: 8,
        }}>{count}</span>
      </button>
      {expanded && count > 0 && (
        <div style={{ padding: "4px 10px 4px 16px" }}>
          {key === "motifs" && (() => {
            const maxDist = Math.max(...filtered.map(m => m.distance ?? 0), 0.001);
            return filtered.map((m, i) => <MotifItem key={i} item={m} maxDist={maxDist} />);
          })()}
          {key === "discords" && (() => {
            const maxDist = Math.max(...filtered.map(m => m.distance ?? 0), 0.001);
            return filtered.map((m, i) => <DiscordItem key={i} item={m} maxDist={maxDist} />);
          })()}
          {key === "regimes" && filtered.map((m, i) => <RegimeItem key={i} item={m} />)}
          {key === "changepoints" && filtered.map((idx, i) => (
            <div key={i} style={{
              padding: "3px 0", color: OR, fontSize: 9,
              borderBottom: "1px solid rgba(41,231,255,0.06)",
            }}>
              changepoint at index {idx}
            </div>
          ))}
          {key === "anomalies" && filtered.map((idx, i) => (
            <div key={i} style={{
              padding: "3px 0", color: VI, fontSize: 9,
              borderBottom: "1px solid rgba(41,231,255,0.06)",
            }}>
              anomaly at index {idx}
            </div>
          ))}
        </div>
      )}
      {expanded && count === 0 && (
        <div style={{ padding: "4px 10px 4px 16px", color: DIM, fontSize: 9 }}>
          None found{distThreshold > 0 ? " (within threshold)" : ""}.
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function LearnedPatternExplorer() {
  const [open, setOpen]             = useState(false);
  const [seriesInput, setSeriesInput] = useState("1.2,3.4,2.1,4.5,3.2,1.8,5.6,4.2,2.3,3.8,1.5,4.9,3.1,2.7,5.2,4.8,1.9,3.5,2.4,4.1,3.0,5.4,2.8,1.6,4.3,3.7,2.2,5.0,4.6,1.4,3.9,2.6");
  const [window_, setWindow_]       = useState(7);
  const [discovering, setDiscovering] = useState(false);
  const [patterns, setPatterns]     = useState(null);
  const [patErr, setPatErr]         = useState(null);
  const [expanded, setExpanded]     = useState({ motifs: true, discords: false, regimes: false, changepoints: false, anomalies: false });
  const [distThreshold, setDistThreshold] = useState(0);
  const [improvement, setImprovement] = useState(null);
  const [impLoading, setImpLoading] = useState(false);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const panelRef = useRef(null);

  // ── toggle listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setOpen(prev => !prev);
    window.addEventListener("jarvis:lrnptn-toggle", handler);
    return () => window.removeEventListener("jarvis:lrnptn-toggle", handler);
  }, []);

  // ── load improvement on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setImpLoading(true);
    fetch(`${apiBase()}/v1/predict/improvement`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then(r => r.json())
      .then(d => setImprovement(d))
      .catch(() => setImprovement(null))
      .finally(() => setImpLoading(false));
  }, [open]);

  // ── discover patterns ─────────────────────────────────────────────────────
  const discover = useCallback(async () => {
    const arr = parseSeriesInput(seriesInput);
    if (arr.length < 4) {
      setPatErr("Need at least 4 numeric values to discover patterns.");
      return;
    }
    setDiscovering(true);
    setPatErr(null);
    setPatterns(null);
    setAssessment("");
    try {
      const qs = buildSeriesQS(arr, window_);
      const r = await fetch(`${apiBase()}/v1/predict/patterns?${qs}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d?.error) throw new Error(d.error);
      setPatterns(d);
    } catch (e) {
      setPatErr(e.message || "Pattern discovery failed.");
    } finally {
      setDiscovering(false);
    }
  }, [seriesInput, window_]);

  // ── ASSESS ────────────────────────────────────────────────────────────────
  const assess = useCallback(async () => {
    if (!patterns) return;
    setAssessing(true);
    setAssessment("");
    const motifCount    = (patterns.motifs ?? []).length;
    const discordCount  = (patterns.discords ?? []).length;
    const regimeCount   = (patterns.regimes ?? []).length;
    const cpCount       = (patterns.changepoints ?? []).length;
    const anomCount     = (patterns.anomalies ?? []).length;
    const prompt =
      `Learned Pattern Explorer discovered: ${motifCount} motif(s), ${discordCount} discord(s), ` +
      `${regimeCount} regime(s), ${cpCount} changepoint(s), ${anomCount} anomaly(ies) in a ` +
      `${parseSeriesInput(seriesInput).length}-point series (window=${window_}). ` +
      "Briefly summarise what these patterns indicate about the series behaviour in 2 sentences.";
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      tts(txt);
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [patterns, seriesInput, window_]);

  const toggleGroup = key =>
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const totalPatterns = patterns
    ? PATTERN_TYPES.reduce((sum, t) => sum + (patterns[t.key]?.length ?? 0), 0)
    : 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Learned Pattern Explorer"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 393,
          background: "rgba(6,11,18,0.85)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ LRNPTN
      </button>
    );
  }

  const impScores = improvement?.model_scores ?? improvement?.models ?? [];
  const impRetrains = improvement?.pending_retrains ?? [];

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed", bottom: 40, left: BTN_LEFT - 200,
        width: PANEL_W, height: PANEL_H,
        background: SURF, border: `1px solid ${BORD}`,
        borderRadius: 6, zIndex: 393, display: "flex", flexDirection: "column",
        fontFamily: "monospace", overflow: "hidden",
        boxShadow: "0 0 40px rgba(41,231,255,0.08)",
      }}
    >
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${BORD}`,
        background: "rgba(41,231,255,0.04)",
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ LEARNED PATTERN EXPLORER
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing || !patterns}
            style={btnStyle(VI)}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={btnStyle(RD)}>✕</button>
        </div>
      </div>

      {/* main layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* left: input + results */}
        <div style={{
          width: 480, display: "flex", flexDirection: "column",
          borderRight: `1px solid ${BORD}`, overflow: "hidden",
        }}>
          {/* input panel */}
          <div style={{
            padding: "10px 12px", borderBottom: `1px solid ${BORD}20`,
            background: "rgba(41,231,255,0.02)",
          }}>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 1, marginBottom: 5 }}>
              SERIES INPUT (comma-separated floats)
            </div>
            <textarea
              value={seriesInput}
              onChange={e => setSeriesInput(e.target.value)}
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.04)", border: `1px solid ${BORD}`,
                color: CY, fontFamily: "monospace", fontSize: 9,
                padding: "5px 7px", borderRadius: 3, outline: "none", resize: "none",
              }}
              placeholder="e.g. 1.2, 3.4, 2.1, 4.5…"
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ color: DIM, fontSize: 8 }}>WINDOW</span>
                <input
                  type="range" min={2} max={20} value={window_}
                  onChange={e => setWindow_(Number(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ color: CY, fontSize: 9, minWidth: 16 }}>{window_}</span>
              </div>
              <button
                onClick={discover}
                disabled={discovering}
                style={{
                  ...btnStyle(GN),
                  background: discovering ? "rgba(74,222,128,0.08)" : "rgba(74,222,128,0.12)",
                  padding: "3px 12px",
                }}
              >
                {discovering ? "Discovering…" : "▶ Discover Patterns"}
              </button>
            </div>
            {patErr && (
              <div style={{ color: RD, fontSize: 9, marginTop: 4 }}>{patErr}</div>
            )}
          </div>

          {/* stats bar */}
          {patterns && (
            <div style={{
              display: "flex", gap: 10, padding: "5px 12px",
              borderBottom: `1px solid ${BORD}20`, fontSize: 9,
              flexWrap: "wrap",
            }}>
              <span style={{ color: DIM }}>TOTAL: <b style={{ color: CY }}>{totalPatterns}</b></span>
              {PATTERN_TYPES.map(t => (
                <span key={t.key} style={{ color: t.color }}>
                  {t.label.slice(0, 4)}: <b>{(patterns[t.key] ?? []).length}</b>
                </span>
              ))}
            </div>
          )}

          {/* distance threshold filter */}
          {patterns && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 12px", borderBottom: `1px solid ${BORD}20`, fontSize: 8,
            }}>
              <span style={{ color: DIM }}>DIST THRESHOLD</span>
              <input
                type="range" min={0} max={20} step={0.5} value={distThreshold}
                onChange={e => setDistThreshold(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ color: CY, minWidth: 30, textAlign: "right" }}>
                {distThreshold === 0 ? "ALL" : `≤${distThreshold}`}
              </span>
            </div>
          )}

          {/* pattern tree */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
            {!patterns && !discovering && !patErr && (
              <div style={{ color: DIM, fontSize: 9, marginTop: 16 }}>
                Enter a series and click Discover Patterns.
              </div>
            )}
            {patterns && PATTERN_TYPES.map(ptype => (
              <PatternGroup
                key={ptype.key}
                ptype={ptype}
                items={patterns[ptype.key] ?? []}
                expanded={expanded[ptype.key]}
                onToggle={() => toggleGroup(ptype.key)}
                distThreshold={distThreshold}
              />
            ))}
          </div>
        </div>

        {/* right: improvement suggestions */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${BORD}20`,
            background: "rgba(41,231,255,0.02)",
          }}>
            <SectionHeader label="Model Improvement Status" color={AM} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
            {impLoading && (
              <div style={{ color: DIM, fontSize: 9 }}>Loading improvement status…</div>
            )}
            {!impLoading && !improvement && (
              <div style={{ color: DIM, fontSize: 9 }}>Improvement status unavailable.</div>
            )}

            {!impLoading && improvement && (
              <>
                {impScores.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: AM, fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                      MODEL SCORES
                    </div>
                    {impScores.slice(0, 10).map((m, i) => {
                      const name  = m?.model || m?.name || m?.id || `Model ${i + 1}`;
                      const score = typeof m?.score === "number" ? m.score
                                  : typeof m?.accuracy === "number" ? m.accuracy
                                  : null;
                      return (
                        <div key={i} style={{
                          padding: "4px 0", borderBottom: "1px solid rgba(41,231,255,0.06)",
                        }}>
                          <div style={{ color: CY, fontSize: 9, marginBottom: 2 }}>{name}</div>
                          {score !== null && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <div style={{
                                flex: 1, height: 4,
                                background: "rgba(255,255,255,0.07)", borderRadius: 2,
                              }}>
                                <div style={{
                                  width: `${Math.min(100, score * 100)}%`, height: "100%",
                                  background: score > 0.7 ? GN : score > 0.4 ? AM : RD,
                                  borderRadius: 2,
                                }} />
                              </div>
                              <span style={{
                                fontSize: 8, color: score > 0.7 ? GN : score > 0.4 ? AM : RD,
                                minWidth: 34, textAlign: "right",
                              }}>
                                {(score * 100).toFixed(1)}%
                              </span>
                            </div>
                          )}
                          {m?.status && (
                            <span style={{ color: DIM, fontSize: 8 }}>{m.status}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {impRetrains.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: RD, fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                      PENDING RETRAINS ({impRetrains.length})
                    </div>
                    {impRetrains.slice(0, 5).map((r, i) => {
                      const name = r?.model || r?.name || r?.id || `Retrain ${i + 1}`;
                      const gain = typeof r?.estimated_gain === "number" ? r.estimated_gain : null;
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "3px 0", borderBottom: "1px solid rgba(41,231,255,0.06)",
                          fontSize: 9, color: "#aab8c8",
                        }}>
                          <span style={{ color: AM }}>{name}</span>
                          {gain !== null && (
                            <span style={{ color: GN, fontSize: 8 }}>
                              +{(gain * 100).toFixed(1)}% est gain
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {improvement.recent_evals && improvement.recent_evals.length > 0 && (
                  <div>
                    <div style={{ color: VI, fontSize: 8, letterSpacing: 1, marginBottom: 6 }}>
                      RECENT EVALS ({improvement.recent_evals.length})
                    </div>
                    {improvement.recent_evals.slice(0, 4).map((ev, i) => (
                      <div key={i} style={{
                        padding: "3px 0", borderBottom: "1px solid rgba(41,231,255,0.06)",
                        fontSize: 9, color: "#aab8c8",
                      }}>
                        <span style={{ color: VI }}>
                          {ev?.model || ev?.id || `Eval ${i + 1}`}
                        </span>
                        {ev?.crps != null && (
                          <span style={{ color: DIM, marginLeft: 6 }}>CRPS {ev.crps.toFixed(4)}</span>
                        )}
                        {ev?.rmse != null && (
                          <span style={{ color: DIM, marginLeft: 6 }}>RMSE {ev.rmse.toFixed(4)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {impScores.length === 0 && impRetrains.length === 0 && (
                  <div style={{ color: DIM, fontSize: 9 }}>
                    No model scores or pending retrains at this time.
                  </div>
                )}
              </>
            )}

            {/* ASSESS result */}
            {(assessing || assessment) && (
              <div style={{
                marginTop: 12, paddingTop: 10,
                borderTop: `1px solid ${BORD}`,
              }}>
                <SectionHeader label="ASSESS" color={VI} />
                <p style={{
                  color: assessing ? DIM : "#aab8c8",
                  fontSize: 9, margin: 0, lineHeight: 1.6,
                  fontStyle: assessing ? "italic" : "normal",
                }}>
                  {assessing ? "JARVIS analysing patterns…" : assessment}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
