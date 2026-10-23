/**
 * F140 RiskSignal × Knowledge × Dataset × Report × Brain
 * Threat Intelligence Evidence Foundation — ◈ RKDRB
 *
 * Fetches: /entities/RiskSignal + /knowledge/ + /v1/datasets
 *          + /v1/reports + /v1/cinematic/brain
 * Classifies each risk signal across 4 tiers based on cross-source keyword overlap:
 *   EVIDENCED — matched all 4 external sources (fully evidence-backed threat)
 *   TRACKED   — matched 2-3 sources
 *   PARTIAL   — matched exactly 1 source
 *   EXPOSED   — zero matches (risks with no knowledge grounding, no dataset,
 *                no report, no brain model — intelligence blind spots)
 * Red pulse on EXPOSED count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { EVIDENCED: GREEN, TRACKED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { EVIDENCED: 4, TRACKED: 3, PARTIAL: 2, EXPOSED: 1 };

const RKDRB_RE = /\b(rkdrb|risk\.knowledge\.depth|threat\.evidence|risk.*evidence.*foundation|evidence.*threat|risk.*knowledge.*dataset|risk.*report.*brain|threat.*intel.*depth|risk.*evidence|evidence.*backed|threat.*backing|risk.*foundation)\b/i;

export function isRkdrbQuery(q) { return RKDRB_RE.test(q || ""); }

export function buildRkdrbScript(rows) {
  const total    = rows.length;
  const evidenced = rows.filter(r => r.cls === "EVIDENCED").length;
  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Threat Intelligence Evidence Foundation: ${total} risk signal${total !== 1 ? "s" : ""} assessed. ` +
    `${evidenced} fully evidenced (knowledge, dataset, report, and brain model confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no knowledge grounding, no dataset, no report, no brain model. Intelligence blind spots.`
      : "No exposed risk signals detected.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw, keys) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.data)    ? raw.data
    : Array.isArray(raw?.items)   ? raw.items
    : Array.isArray(raw?.results) ? raw.results
    : Array.isArray(raw?.nodes)   ? raw.nodes
    : [];
  return arr.map(item => {
    let label = "";
    for (const k of keys) if (item[k]) { label = String(item[k]); break; }
    return { ...item, _label: label };
  });
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : [];
  } catch { return []; }
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function classifyRisk(risk, articles, datasets, reports, brainNodes) {
  const toks = tokens(
    [risk._label, risk.name, risk.title, risk.type, risk.category, risk.severity, risk.description, risk.signal_type].join(" ")
  );

  const matchedArticles  = articles.filter(a =>
    overlaps(toks, [a._label, a.name, a.title, a.category, a.content, a.summary, a.topic].join(" "))
  );
  const matchedDatasets  = datasets.filter(ds =>
    overlaps(toks, [ds._label, ds.name, ds.title, ds.category, ds.type, ds.source].join(" "))
  );
  const matchedReports   = reports.filter(rep =>
    overlaps(toks, [rep._label, rep.name, rep.title, rep.category, rep.type, rep.summary].join(" "))
  );
  const matchedBrainNodes = brainNodes.filter(bn =>
    overlaps(toks, [bn._label, bn.name, bn.title, bn.type, bn.category, bn.label].join(" "))
  );

  const matchCount = [matchedArticles, matchedDatasets, matchedReports, matchedBrainNodes]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "EVIDENCED" :
    matchCount >= 2 ? "TRACKED"   :
    matchCount === 1 ? "PARTIAL"  :
    "EXPOSED";

  return { cls, matchedArticles, matchedDatasets, matchedReports, matchedBrainNodes };
}

export default function RiskKnowledgeDatasetReportBrainDepth() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [riskRaw, knowledgeRaw, datasetRaw, reportsRaw, brainRaw] = await Promise.all([
        fetcher("/entities/RiskSignal"),
        fetcher("/knowledge/"),
        fetcher("/v1/datasets"),
        fetcher("/v1/reports"),
        fetcher("/v1/cinematic/brain"),
      ]);

      const risks      = normalizeArray(riskRaw,      ["name", "title", "signal_name"]);
      const articles   = normalizeArray(knowledgeRaw, ["name", "title", "topic"]);
      const datasets   = normalizeArray(datasetRaw,   ["name", "title", "dataset_name"]);
      const reports    = normalizeArray(reportsRaw,   ["name", "title", "report_name"]);
      const brainNodes = normalizeArray(
        Array.isArray(brainRaw?.nodes) ? brainRaw.nodes : brainRaw,
        ["name", "title", "label"]
      );

      const classified = risks.map(r => ({
        ...r,
        ...classifyRisk(r, articles, datasets, reports, brainNodes),
      }));
      classified.sort((a, b) => (CLS_ORDER[b.cls] ?? 0) - (CLS_ORDER[a.cls] ?? 0));
      setRows(classified);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 90_000); return () => clearInterval(id); }, [load]);

  useEffect(() => {
    const h = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:rkdrb-toggle", h);
    return () => window.removeEventListener("jarvis:rkdrb-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildRkdrbScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `RKDRB ASSESS: ${script}` }),
      });
      const d = await r.json();
      const answer = (d.answer || script).slice(0, 600);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: answer }),
      });
    } catch (_) {
    } finally { setAssessing(false); }
  }, [rows]);

  const exposedCount = rows.filter(r => r.cls === "EXPOSED").length;
  const counts = { ALL: rows.length, EVIDENCED: 0, TRACKED: 0, PARTIAL: 0, EXPOSED: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (r._label || r.name || "").toLowerCase().includes(s) || r.cls.toLowerCase().includes(s);
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="RiskSignal × Knowledge × Dataset × Report × Brain — Threat Intelligence Evidence Foundation"
        style={{
          position: "fixed", left: 126760, bottom: 8, zIndex: 237,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${exposedCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || exposedCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: exposedCount > 0 && !open ? "rkdrb_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        RKDRB
        {rows.length > 0 && (
          <span style={{
            background: exposedCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {exposedCount > 0 ? `${exposedCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 237,
          width: "min(430px,93vw)", maxHeight: "min(600px,80vh)",
          background: "rgba(4,8,16,0.95)",
          border: `1px solid ${RED}44`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${RED}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: RED,
              boxShadow: `0 0 10px ${RED}`, display: "inline-block",
              animation: loading || exposedCount > 0 ? "rkdrb_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              THREAT EVIDENCE FOUNDATION
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "SYNCING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          {rows.length > 0 && (
            <div style={{
              padding: "8px 12px", borderBottom: `1px solid ${RED}12`,
              display: "flex", gap: 8, flexWrap: "wrap",
            }}>
              {[
                { label: "RISK SIGNALS", val: counts.ALL,       col: CYAN  },
                { label: "EVIDENCED",    val: counts.EVIDENCED, col: GREEN },
                { label: "TRACKED",      val: counts.TRACKED,   col: CYAN  },
                { label: "PARTIAL",      val: counts.PARTIAL,   col: AMBER },
                { label: "EXPOSED",      val: counts.EXPOSED,   col: RED   },
              ].map(({ label, val, col }) => (
                <div key={label} style={{
                  background: `${col}14`, border: `1px solid ${col}33`,
                  borderRadius: 6, padding: "3px 8px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: col }}>{val}</div>
                  <div style={{ fontSize: 7, color: col + "99", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{
            padding: "6px 12px", borderBottom: `1px solid ${RED}12`,
            display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "EVIDENCED", "TRACKED", "PARTIAL", "EXPOSED"].map(cls => {
              const col = cls === "ALL" ? "#8ba3b8" : CLS_COLOR[cls];
              return (
                <button key={cls} onClick={() => setFilter(cls)} style={{
                  background: filter === cls ? `${col}22` : "transparent",
                  border: `1px solid ${filter === cls ? col : col + "44"}`,
                  borderRadius: 5, color: col, cursor: "pointer",
                  padding: "2px 7px", fontSize: 8, letterSpacing: 1, fontWeight: 700,
                  fontFamily: "'JetBrains Mono',monospace", transition: "all 0.15s",
                }}>
                  {cls} {counts[cls] ?? counts.ALL}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: "1px solid #334455", borderRadius: 5,
                color: CYAN, fontSize: 9, padding: "3px 8px",
                fontFamily: "'JetBrains Mono',monospace", outline: "none", width: 90,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: DIM, fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "No risk signal data." : `No ${filter} risks.`}
              </div>
            )}
            {visible.map((risk, i) => {
              const col      = CLS_COLOR[risk.cls] || CYAN;
              const name     = risk._label || risk.name || `Risk #${i + 1}`;
              const severity = risk.severity || risk.type || risk.category || "";
              const isExp    = (expanded[i] || false);
              return (
                <div key={risk.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${risk.cls === "EXPOSED" ? "10" : "07"}`,
                  border: `1px solid ${col}${risk.cls === "EXPOSED" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: risk.cls === "EXPOSED" ? "rkdrb_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: risk.cls === "EXPOSED" ? `0 0 8px ${col}` : "none",
                    }}>{risk.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {severity && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>
                        {String(severity).toUpperCase().slice(0, 10)}
                      </span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Knowledge articles */}
                      {risk.matchedArticles.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◉ KNOWLEDGE ({risk.matchedArticles.length})
                          </div>
                          {risk.matchedArticles.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(a.category || a.topic || "article").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.name || a.title || "article"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Datasets */}
                      {risk.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◈ DATASETS ({risk.matchedDatasets.length})
                          </div>
                          {risk.matchedDatasets.slice(0, 3).map((ds, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(ds.type || ds.source || "dataset").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {ds._label || ds.name || ds.title || "dataset"}
                                {ds.row_count ? ` · ${ds.row_count.toLocaleString()} rows` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Reports */}
                      {risk.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ REPORTS ({risk.matchedReports.length})
                          </div>
                          {risk.matchedReports.slice(0, 3).map((rep, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(rep.type || rep.category || "report").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {rep._label || rep.name || rep.title || "report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Brain nodes */}
                      {risk.matchedBrainNodes.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ BRAIN NODES ({risk.matchedBrainNodes.length})
                          </div>
                          {risk.matchedBrainNodes.slice(0, 3).map((bn, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {bn.centrality != null
                                  ? `CTR:${Number(bn.centrality).toFixed(2)}`
                                  : (bn.type || "node").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {bn._label || bn.name || bn.title || "brain node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {risk.cls === "EXPOSED" &&
                        risk.matchedArticles.length === 0 &&
                        risk.matchedDatasets.length === 0 &&
                        risk.matchedReports.length === 0 &&
                        risk.matchedBrainNodes.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Exposed risk — no knowledge grounding, no dataset, no report, no brain model.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${RED}18`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 8, color: DIM, flex: 1 }}>
              RISK×KNOWLEDGE×DATASET×REPORT×BRAIN — 5-source
            </span>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? `${RED}33` : `${RED}22`,
                border: `1px solid ${RED}66`, borderRadius: 6,
                color: RED, cursor: assessing ? "default" : "pointer",
                padding: "4px 12px", fontSize: 9, letterSpacing: 1, fontWeight: 700,
                fontFamily: "'JetBrains Mono',monospace",
                transition: "all 0.2s",
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes rkdrb_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes rkdrb_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes rkdrb_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
