/**
 * F184 — RiskSignal × Dataset × Investigation Triage Map (RSDITRI)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/datasets + /v1/investigations
 * and keyword-correlates each risk signal against datasets AND investigations
 * to classify:
 *
 *   FULLY_TRIAGED       — matched dataset + investigation (fully triaged risk)
 *   DATA_SOURCED        — dataset match, no investigation
 *   UNDER_INVESTIGATION — investigation match, no dataset
 *   UNTRIAGED           — no matches (triage gap)
 *
 * Stat tiles: RISK SIGNALS / DATASETS / INVESTIGATIONS + four class counts + TRIAGED%.
 * Red badge on untriaged count.
 * Filter tabs ALL / FULLY_TRIAGED / DATA_SOURCED / UNDER_INVESTIGATION / UNTRIAGED + text search.
 * Expand signal → matched dataset cards (green, row-count badge) + investigation cards (cyan, priority badge).
 * ▶ ASSESS TRIAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:rsditri-toggle event.
 *
 * Voice triggers:
 *   "rsditri / risk triage / signal triage / untriaged risk / risk dataset /
 *    risk investigation triage / data backed risk / investigated risk"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_045_400;
const Z_INDEX  = 245;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const RSDITRI_RE = /\b(rsditri|risk[\s-]triage|signal[\s-]triage|untriaged[\s-]risk|risk[\s-]dataset|risk[\s-]investigation[\s-]triage|data[\s-]backed[\s-]risk|investigated[\s-]risk)\b/i;

export function isRsditriQuery(q = "") { return RSDITRI_RE.test(q); }

export async function buildRsditriScript() {
  const base = apiBase();
  const [rsRes, dsRes, invRes] = await Promise.allSettled([
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/investigations`).then(r => r.json()),
  ]);
  const signals = (rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value || []) : []);
  const datasets = (dsRes.status === "fulfilled" ? (dsRes.value?.items || dsRes.value || []) : []);
  const investigations = (invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : []);
  const untriaged = signals.filter(s => {
    const kws = keywords(sigText(s));
    const dsMatch = datasets.some(d => score(dsText(d), kws) > 0);
    const invMatch = investigations.some(i => score(invText(i), kws) > 0);
    return !dsMatch && !invMatch;
  }).length;
  const total = signals.length;
  const triaged = total - untriaged;
  const pct = total ? Math.round((triaged / total) * 100) : 0;
  return `RSDITRI Triage Map online, sir. I am correlating ${total} risk signals against ${datasets.length} datasets and ${investigations.length} active investigations. ${triaged} signals are triaged — ${pct}% coverage. ${untriaged} signal${untriaged === 1 ? "" : "s"} remain untriaged with no dataset source and no open investigation. Recommend prioritising those for immediate triage assignment.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const PU     = "#A78BFA";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const SEV_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR };

const CLASS_COLOR = {
  FULLY_TRIAGED:       GR,
  DATA_SOURCED:        CY,
  UNDER_INVESTIGATION: BL,
  UNTRIAGED:           RD,
};

const TABS = ["ALL", "FULLY_TRIAGED", "DATA_SOURCED", "UNDER_INVESTIGATION", "UNTRIAGED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function sigText(s) {
  return [s.title, s.name, s.description, s.category, s.source, s.tags].filter(Boolean).join(" ");
}
function dsText(d) {
  return [d.name, d.title, d.description, d.category, d.source, d.tags].filter(Boolean).join(" ");
}
function invText(i) {
  return [i.title, i.name, i.description, i.category, i.priority, i.tags].filter(Boolean).join(" ");
}

function classify(signal, datasets, investigations) {
  const kws = keywords(sigText(signal));
  const matchedDs = datasets
    .map(d => ({ ...d, _score: score(dsText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedInv = investigations
    .map(i => ({ ...i, _score: score(invText(i), kws) }))
    .filter(i => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasDs  = matchedDs.length > 0;
  const hasInv = matchedInv.length > 0;
  let cls;
  if (hasDs && hasInv)  cls = "FULLY_TRIAGED";
  else if (hasDs)       cls = "DATA_SOURCED";
  else if (hasInv)      cls = "UNDER_INVESTIGATION";
  else                  cls = "UNTRIAGED";
  return { ...signal, _cls: cls, _ds: matchedDs, _inv: matchedInv };
}

export default function RiskSignalDatasetInvestigationTriage() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [signals, setSignals] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [rsRes, dsRes, invRes] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/investigations`).then(r => r.json()),
      ]);
      const sigs = rsRes.status === "fulfilled" ? (rsRes.value?.items || rsRes.value || []) : [];
      const dss  = dsRes.status === "fulfilled"  ? (dsRes.value?.items  || dsRes.value  || []) : [];
      const invs = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : [];
      setSignals(sigs);
      setDatasets(dss);
      setInvestigations(invs);
      setClassified(sigs.map(s => classify(s, dss, invs)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:rsditri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rsditri-toggle", onToggle);
  }, []);

  const fully   = classified.filter(s => s._cls === "FULLY_TRIAGED").length;
  const dataSrc = classified.filter(s => s._cls === "DATA_SOURCED").length;
  const underInv = classified.filter(s => s._cls === "UNDER_INVESTIGATION").length;
  const untriaged = classified.filter(s => s._cls === "UNTRIAGED").length;
  const total = classified.length;
  const triagedPct = total ? Math.round(((fully + dataSrc + underInv) / total) * 100) : 0;

  const visible = classified
    .filter(s => tab === "ALL" || s._cls === tab)
    .filter(s => !search || sigText(s).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `RiskSignals:${total} Datasets:${datasets.length} Investigations:${investigations.length} FullyTriaged:${fully} DataSourced:${dataSrc} UnderInvestigation:${underInv} Untriaged:${untriaged} TriagedPct:${triagedPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess the risk signal triage coverage: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="RiskSignal × Dataset × Investigation Triage Map (RSDITRI)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? RD : "rgba(5,8,13,0.85)",
          border: `1px solid ${RD}`,
          color: open ? "#000" : RD,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: untriaged > 0 ? `0 0 8px ${RD}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ RSDITRI
        {untriaged > 0 && (
          <span style={{
            marginLeft: 4, background: RD, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{untriaged}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 800, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: RD, fontWeight: 700, letterSpacing: 2 }}>RSDITRI</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>RiskSignal × Dataset × Investigation — Triage Map</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "RISK SIGNALS",     val: signals.length,  clr: RD },
              { label: "DATASETS",         val: datasets.length, clr: GR },
              { label: "INVESTIGATIONS",   val: investigations.length, clr: CY },
              { label: "FULLY TRIAGED",    val: fully,           clr: GR },
              { label: "DATA SOURCED",     val: dataSrc,         clr: CY },
              { label: "UNDER INV.",       val: underInv,        clr: BL },
              { label: "UNTRIAGED",        val: untriaged,       clr: RD },
              { label: "TRIAGED%",         val: `${triagedPct}%`, clr: triagedPct >= 70 ? GR : triagedPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Triage coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${triagedPct}%`, background: triagedPct >= 70 ? GR : triagedPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? RD : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? RD : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search signals…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No risk signals match current filter.</div>
            )}
            {visible.map((s, i) => {
              const clr = CLASS_COLOR[s._cls] || AM;
              const sevClr = SEV_COLOR[s.severity] || AM;
              const isExp = expanded === i;
              return (
                <div key={s.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 130 }}>{s._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{s.title || s.name || "Unknown Signal"}</span>
                    {s.severity && <span style={{ color: sevClr, fontSize: 8, border: `1px solid ${sevClr}44`, borderRadius: 2, padding: "0 4px" }}>{s.severity}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {s._ds.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>DATASETS ({s._ds.length})</div>
                          {s._ds.map((d, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(34,197,94,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{d.name || d.title || "Dataset"}</span>
                                {d.row_count != null && <span style={{ color: GR, fontSize: 8, border: `1px solid ${GR}33`, borderRadius: 2, padding: "0 3px" }}>{d.row_count.toLocaleString()} rows</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (d._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {s._inv.length > 0 && (
                        <div>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>INVESTIGATIONS ({s._inv.length})</div>
                          {s._inv.map((inv, j) => (
                            <div key={j} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(0,207,255,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{inv.title || inv.name || "Investigation"}</span>
                                {inv.priority && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 3px" }}>{inv.priority}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (inv._score / 5) * 100)}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {s._ds.length === 0 && s._inv.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No datasets or investigations correlated — triage gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS TRIAGE"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/RiskSignal · /v1/datasets · /v1/investigations
            </span>
          </div>
        </div>
      )}
    </>
  );
}
