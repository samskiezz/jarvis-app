/**
 * F115 — Risk Signal × Dataset × Ops Event Data Coverage Triad (RDOETRI)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/datasets + /v1/ops/events.
 * Keyword-correlates each risk signal against available datasets AND ops events:
 *   FULLY_GROUNDED  — matched both a dataset AND an ops event
 *   DATA_LINKED     — matched dataset only
 *   OPS_LINKED      — matched ops event only
 *   UNGROUNDED      — no matches (data gap)
 *
 * Stat tiles: RISK SIGNALS / DATASETS / OPS EVENTS + all four class counts + COVERAGE%.
 * Amber badge on ungrounded count.
 * Filter tabs ALL / FULLY_GROUNDED / DATA_LINKED / OPS_LINKED / UNGROUNDED + text search.
 * Expand signal → matched dataset cards (purple) + ops event cards (blue) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:rdoetri-toggle event.
 *
 * Voice triggers: "rdoetri / risk data ops / risk signal data / grounded risk /
 *                  ungrounded risk / risk event coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_007_320;
const Z_INDEX  = 177;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const RDOETRI_RE = /\b(rdoetri|risk[\s-]data[\s-]ops|risk[\s-]signal[\s-]data|grounded[\s-]risk|ungrounded[\s-]risk|risk[\s-]event[\s-]coverage)\b/i;

// ── colour palette ────────────────────────────────────────────────────────────
const CY    = "#00CFFF";
const RD    = "#EF4444";
const OR    = "#F97316";
const AM    = "#F59E0B";
const PU    = "#A855F7";
const BL    = "#3B82F6";
const GR    = "#22C55E";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = { FULLY_GROUNDED: GR, DATA_LINKED: PU, OPS_LINKED: BL, UNGROUNDED: AM };
const TABS = ["ALL", "FULLY_GROUNDED", "DATA_LINKED", "OPS_LINKED", "UNGROUNDED"];
const SEV_COLOR = { CRITICAL: RD, HIGH: OR, MEDIUM: AM, LOW: "#64748b" };

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isRdoetriQuery(text) {
  return RDOETRI_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function words(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function relevance(signal, target) {
  const sw = words(`${signal.name || signal.title || ""} ${signal.description || ""} ${signal.severity || ""}`);
  const tw = words(`${target.name || target.title || target.description || ""}`);
  if (!sw.length || !tw.length) return 0;
  const hits = sw.filter(w => tw.includes(w)).length;
  return Math.min(100, Math.round((hits / Math.min(sw.length, tw.length)) * 100));
}

function classify(signal, datasets, opsEvents) {
  const dMatches = datasets
    .map(d => ({ item: d, score: relevance(signal, d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const oMatches = opsEvents
    .map(o => ({ item: o, score: relevance(signal, o) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  let cls;
  if (dMatches.length && oMatches.length)   cls = "FULLY_GROUNDED";
  else if (dMatches.length)                  cls = "DATA_LINKED";
  else if (oMatches.length)                  cls = "OPS_LINKED";
  else                                       cls = "UNGROUNDED";
  return { cls, dMatches, oMatches };
}

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return isNaN(d) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export async function buildRdoetriScript() {
  const base = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [sigRaw, dsRaw, opsRaw] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/events`,        { headers }).then(r => r.json()).catch(() => []),
  ]);
  const signals   = norm(sigRaw,  ["results", "data", "items", "signals"]);
  const datasets  = norm(dsRaw,   ["results", "data", "items", "datasets"]);
  const opsEvents = norm(opsRaw,  ["results", "data", "items", "events"]);
  const rows = signals.map(s => ({ ...s, ...classify(s, datasets, opsEvents) }));
  const fully   = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
  const dataL   = rows.filter(r => r.cls === "DATA_LINKED").length;
  const opsL    = rows.filter(r => r.cls === "OPS_LINKED").length;
  const ungr    = rows.filter(r => r.cls === "UNGROUNDED").length;
  const pct     = rows.length ? Math.round(((fully + dataL + opsL) / rows.length) * 100) : 0;
  const context = `Risk Data Ops Triad (RDOETRI) — ${signals.length} risk signals, ${datasets.length} datasets, ${opsEvents.length} ops events. Grounding: ${fully} fully-grounded, ${dataL} data-linked, ${opsL} ops-linked, ${ungr} ungrounded. Coverage: ${pct}%.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ message: `${context} Assess risk signal data coverage in two sentences.` }),
  });
  const d = await r.json().catch(() => ({}));
  return (d.answer || context).replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── component ─────────────────────────────────────────────────────────────────

export function RiskDataOpsTriad() {
  const [open, setOpen] = useState(false);
  const [signals, setSignals]     = useState([]);
  const [datasets, setDatasets]   = useState([]);
  const [opsEvents, setOpsEvents] = useState([]);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);
  const base     = apiBase();
  const headers  = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sigRaw, dsRaw, opsRaw] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`,          { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`,        { headers }).then(r => r.json()).catch(() => []),
      ]);
      const sigs   = norm(sigRaw,  ["results", "data", "items", "signals"]);
      const dsets  = norm(dsRaw,   ["results", "data", "items", "datasets"]);
      const ops    = norm(opsRaw,  ["results", "data", "items", "events"]);
      setSignals(sigs);
      setDatasets(dsets);
      setOpsEvents(ops);
      setRows(sigs.map(s => ({ ...s, ...classify(s, dsets, ops) })));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    const onToggle = () => setOpen(v => { if (!v) load(); return !v; });
    window.addEventListener("jarvis:rdoetri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rdoetri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // derived
  const fully = rows.filter(r => r.cls === "FULLY_GROUNDED").length;
  const dataL = rows.filter(r => r.cls === "DATA_LINKED").length;
  const opsL  = rows.filter(r => r.cls === "OPS_LINKED").length;
  const ungr  = rows.filter(r => r.cls === "UNGROUNDED").length;
  const pct   = rows.length ? Math.round(((fully + dataL + opsL) / rows.length) * 100) : 0;
  const badge = ungr;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.title || "").toLowerCase().includes(q) ||
             (r.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildRdoetriScript();
      setBrief(script);
      const tr = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: script }),
      });
      const blob = await tr.blob().catch(() => null);
      if (blob) { const a = new Audio(URL.createObjectURL(blob)); a.play().catch(() => {}); }
    } catch { setBrief("Coverage assessment unavailable."); }
    setAssessing(false);
  }

  const tile = (label, val, col) => (
    <div style={{ background: `${col}12`, border: `1px solid ${col}55`, borderRadius: 6,
                  padding: "5px 10px", textAlign: "center", minWidth: 70 }}>
      <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const relBar = (score, color) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, minWidth: 26, textAlign: "right" }}>{score}%</span>
    </div>
  );

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? AM : "rgba(6,11,22,0.85)", border: `1px solid ${AM}`,
          color: open ? "#04060A" : AM, fontFamily: FONT, fontSize: 9, fontWeight: 700,
          padding: "3px 9px", borderRadius: 4, cursor: "pointer", letterSpacing: 1,
          boxShadow: open ? `0 0 14px ${AM}` : "none",
        }}
      >
        {badge > 0 && !open && (
          <span style={{ background: AM, color: "#04060A", borderRadius: "50%", fontSize: 8, fontWeight: 700,
                         padding: "0 4px", marginRight: 4 }}>{badge}</span>
        )}
        ◈ RDOETRI
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: Z_INDEX - 1,
          background: "rgba(0,0,0,0)", pointerEvents: "none",
        }} />
      )}

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(820px,96vw)", maxHeight: "85vh",
          background: BG, border: `1px solid ${AM}44`, borderRadius: 12,
          fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden",
          boxShadow: `0 0 60px ${AM}18`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: AM, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>◈ RDOETRI</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>Risk Signal × Dataset × Ops Event Data Coverage Triad</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", gap: 8, flexWrap: "wrap" }}>
            {tile("RISK SIGS", rows.length,   RD)}
            {tile("DATASETS",  datasets.length, PU)}
            {tile("OPS EVENTS", opsEvents.length, BL)}
            {tile("FULLY GRD", fully,  GR)}
            {tile("DATA LINK", dataL,  PU)}
            {tile("OPS LINK",  opsL,   BL)}
            {tile("UNGROUNDED", ungr,  AM)}
            {tile("COVERAGE",  `${pct}%`, pct > 70 ? GR : pct > 40 ? AM : RD)}
          </div>

          {/* Coverage bar */}
          <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, minWidth: 70 }}>GROUNDING</span>
              <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: "100%",
                              background: pct > 70 ? GR : pct > 40 ? AM : RD,
                              borderRadius: 2, transition: "width .4s" }} />
              </div>
              <span style={{ color: pct > 70 ? GR : pct > 40 ? AM : RD, fontSize: 10, minWidth: 28 }}>{pct}%</span>
            </div>
          </div>

          {/* Controls */}
          <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
                        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${AM}22` : "none",
                border: `1px solid ${tab === t ? AM : "rgba(255,255,255,0.15)"}`,
                color: tab === t ? AM : "rgba(255,255,255,0.5)",
                fontFamily: FONT, fontSize: 9, padding: "2px 9px", borderRadius: 3, cursor: "pointer",
                letterSpacing: 1,
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search signals…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.05)",
                border: `1px solid rgba(255,255,255,0.15)`, borderRadius: 4,
                color: "#e2e8f0", fontFamily: FONT, fontSize: 10, padding: "3px 8px",
                outline: "none", width: 140,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
            {loading && !rows.length && (
              <div style={{ color: "rgba(0,207,255,0.5)", padding: 20, textAlign: "center", fontSize: 11 }}>
                loading…
              </div>
            )}
            {visible.map((row, i) => {
              const id     = row.id || row.name || i;
              const isExp  = expanded === id;
              const sev    = row.severity?.toUpperCase() || "MEDIUM";
              const sevCol = SEV_COLOR[sev] || AM;
              const clsCol = CLASS_COLOR[row.cls] || CY;
              return (
                <div key={id} style={{
                  background: "rgba(255,255,255,0.025)", border: `1px solid rgba(255,255,255,0.06)`,
                  borderRadius: 6, marginBottom: 4, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : id)}
                    style={{
                      padding: "7px 10px", cursor: "pointer", display: "flex",
                      alignItems: "center", gap: 8,
                    }}
                  >
                    {/* Severity badge */}
                    <span style={{
                      background: `${sevCol}18`, border: `1px solid ${sevCol}`,
                      color: sevCol, fontSize: 9, padding: "1px 6px", borderRadius: 10,
                      fontWeight: 700, letterSpacing: 1,
                      animation: sev === "CRITICAL" ? "rdpulse 1.4s ease-in-out infinite" : "none",
                    }}>{sev}</span>
                    {/* Class badge */}
                    <span style={{
                      background: `${clsCol}18`, border: `1px solid ${clsCol}`,
                      color: clsCol, fontSize: 9, padding: "1px 6px", borderRadius: 10, letterSpacing: 1,
                    }}>{row.cls.replace(/_/g, " ")}</span>
                    {/* Title */}
                    <span style={{
                      flex: 1, color: "#e2e8f0", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{row.name || row.title || `Signal ${i + 1}`}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "0 10px 10px 10px", borderTop: `1px solid rgba(255,255,255,0.05)` }}>
                      {row.description && (
                        <div style={{ color: "rgba(0,207,255,0.55)", fontSize: 10, marginTop: 6, marginBottom: 8, lineHeight: 1.5 }}>
                          {String(row.description).slice(0, 200)}{row.description.length > 200 ? "…" : ""}
                        </div>
                      )}
                      {/* Dataset matches */}
                      {row.dMatches.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>▶ DATASET MATCHES</div>
                          {row.dMatches.map((m, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "4px 8px",
                                                   background: `${PU}08`, borderRadius: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#e2e8f0", fontSize: 10, flex: 1,
                                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.item.name || m.item.title || `Dataset ${j + 1}`}
                                </span>
                              </div>
                              {relBar(m.score, PU)}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops event matches */}
                      {row.oMatches.length > 0 && (
                        <div>
                          <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>▶ OPS EVENT MATCHES</div>
                          {row.oMatches.map((m, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "4px 8px",
                                                   background: `${BL}08`, borderRadius: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                <span style={{ color: "#e2e8f0", fontSize: 10, flex: 1,
                                               overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {m.item.name || m.item.title || m.item.type || `Event ${j + 1}`}
                                </span>
                                {m.item.timestamp && (
                                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                                    {fmtTime(m.item.timestamp)}
                                  </span>
                                )}
                              </div>
                              {relBar(m.score, BL)}
                            </div>
                          ))}
                        </div>
                      )}
                      {row.dMatches.length === 0 && row.oMatches.length === 0 && (
                        <div style={{ color: AM, fontSize: 10, padding: "6px 0" }}>
                          ⚠ No matching datasets or ops events — risk signal is ungrounded.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && visible.length === 0 && rows.length > 0 && (
              <div style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 20, fontSize: 11 }}>
                No signals match current filter.
              </div>
            )}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`,
                          color: GR, fontSize: 10, lineHeight: 1.5 }}>
              ⟡ {brief}
            </div>
          )}

          {/* Footer */}
          <div style={{ padding: "6px 14px", borderTop: `1px solid ${BORDER}`,
                        display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={assess} disabled={assessing} style={{
              background: "none", border: `1px solid ${AM}`, color: AM,
              fontFamily: FONT, fontSize: 9, padding: "3px 10px", borderRadius: 3,
              cursor: assessing ? "wait" : "pointer", letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS COVERAGE"}
            </button>
            <span style={{ marginLeft: "auto", color: "rgba(0,207,255,0.35)", fontSize: 10 }}>
              RDOETRI · {visible.length}/{rows.length} · auto-refresh 90 s
            </span>
            <span style={{ color: loading ? OR : "rgba(0,207,255,0.35)", fontSize: 10 }}>
              {loading ? "refreshing…" : "live"}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rdpulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </>
  );
}
