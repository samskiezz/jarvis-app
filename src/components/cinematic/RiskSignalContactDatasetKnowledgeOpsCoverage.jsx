/**
 * F170 RiskSignal × Contact × Dataset × Knowledge × Ops Alert
 * Full Threat Intelligence Asset Coverage — ◈ RCKDOA
 *
 * Fetches: /entities/RiskSignal + /entities/Contact + /v1/datasets
 *          + /knowledge/ + /v1/ops/alerts
 * Classifies each risk signal across 4 tiers based on cross-source keyword overlap:
 *   SECURED  — matched all 4 external sources (fully covered threat)
 *   TRACKED  — matched 2-3 sources
 *   PARTIAL  — matched exactly 1 source
 *   EXPOSED  — zero matches (threat signal with no contact owner, no dataset,
 *               no knowledge article, no ops alert — full intelligence blind spot)
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

const CLS_COLOR = { SECURED: GREEN, TRACKED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { SECURED: 4, TRACKED: 3, PARTIAL: 2, EXPOSED: 1 };

const RCKDOA_RE = /\b(rckdoa|risk.contact.dataset|risk.knowledge|risk.ops.alert|threat.intelligence.coverage|threat.asset.coverage|threat.intel.asset|exposed.risk|exposed.threat|risk.blind.spot|threat.blind.spot|threat.coverage|risk.coverage|unowned.risk|risk.uncovered|full.threat.coverage|threat.intelligence.asset)\b/i;

export function isRckdoaQuery(q) { return RCKDOA_RE.test(q || ""); }

export function buildRckdoaScript(rows) {
  const total   = rows.length;
  const exposed = rows.filter(r => r.cls === "EXPOSED").length;
  const secured = rows.filter(r => r.cls === "SECURED").length;
  return (
    `Threat Intelligence Asset Coverage: ${total} risk signal${total !== 1 ? "s" : ""} assessed across contact, dataset, knowledge, and ops alert sources. ` +
    `${secured} fully secured (all 4 sources grounded). ` +
    (exposed > 0
      ? `${exposed} EXPOSED — no contact owner, no dataset, no knowledge article, no ops alert. These are full intelligence blind spots requiring immediate action.`
      : "No exposed threat blind spots detected.")
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

function classifySignal(signal, contacts, datasets, knowledge, opsAlerts) {
  const toks = tokens(
    [signal._label, signal.name, signal.type, signal.category, signal.description].join(" ")
  );

  const matchedContacts = contacts.filter(c =>
    overlaps(toks, [c._label, c.name, c.role, c.organization, c.org].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(toks, [d._label, d.name, d.category, d.source].join(" "))
  );
  const matchedKnowledge = knowledge.filter(k =>
    overlaps(toks, [k._label, k.title, k.name, k.category, k.tags].join(" "))
  );
  const matchedOpsAlerts = opsAlerts.filter(a =>
    overlaps(toks, [a._label, a.name, a.title, a.type, a.severity, a.message].join(" "))
  );

  const matchCount = [matchedContacts, matchedDatasets, matchedKnowledge, matchedOpsAlerts]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "SECURED"  :
    matchCount >= 2 ? "TRACKED"  :
    matchCount === 1 ? "PARTIAL" :
    "EXPOSED";

  return { cls, matchedContacts, matchedDatasets, matchedKnowledge, matchedOpsAlerts };
}

export default function RiskSignalContactDatasetKnowledgeOpsCoverage() {
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
      const [sigRaw, contRaw, dsRaw, knRaw, opsRaw] = await Promise.all([
        fetcher("/entities/RiskSignal"),
        fetcher("/entities/Contact"),
        fetcher("/v1/datasets"),
        fetcher("/knowledge/"),
        fetcher("/v1/ops/alerts"),
      ]);

      const signals   = normalizeArray(sigRaw,  ["name", "title", "signal_name", "id"]);
      const contacts  = normalizeArray(contRaw, ["name", "full_name", "display_name"]);
      const datasets  = normalizeArray(dsRaw,   ["name", "title", "dataset_name"]);
      const knowledge = normalizeArray(knRaw,   ["title", "name", "article_title"]);
      const opsAlerts = normalizeArray(opsRaw,  ["name", "title", "message", "type"]);

      const classified = signals.map(s => ({
        ...s,
        ...classifySignal(s, contacts, datasets, knowledge, opsAlerts),
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
    window.addEventListener("jarvis:rckdoa-toggle", h);
    return () => window.removeEventListener("jarvis:rckdoa-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildRckdoaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `RCKDOA ASSESS: ${script}` }),
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
  const counts = { ALL: rows.length, SECURED: 0, TRACKED: 0, PARTIAL: 0, EXPOSED: 0 };
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
        title="RiskSignal × Contact × Dataset × Knowledge × Ops Alert — Full Threat Intelligence Asset Coverage"
        style={{
          position: "fixed", left: 143560, bottom: 8, zIndex: 267,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${exposedCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || exposedCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: exposedCount > 0 && !open ? "rckdoa_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        RCKDOA
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
          position: "fixed", left: 18, bottom: 72, zIndex: 267,
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
              animation: loading || exposedCount > 0 ? "rckdoa_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              THREAT INTELLIGENCE ASSET COVERAGE
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
                { label: "SIGNALS", val: counts.ALL,     col: CYAN  },
                { label: "SECURED", val: counts.SECURED, col: GREEN },
                { label: "TRACKED", val: counts.TRACKED, col: CYAN  },
                { label: "PARTIAL", val: counts.PARTIAL, col: AMBER },
                { label: "EXPOSED", val: counts.EXPOSED, col: RED   },
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
            {["ALL", "SECURED", "TRACKED", "PARTIAL", "EXPOSED"].map(cls => {
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
                {rows.length === 0 ? "No risk signal data." : `No ${filter} signals.`}
              </div>
            )}
            {visible.map((sig, i) => {
              const col    = CLS_COLOR[sig.cls] || CYAN;
              const name   = sig._label || sig.name || `Signal #${i + 1}`;
              const sev    = sig.severity || sig.level || sig.type || "";
              const isExp  = (expanded[i] || false);
              return (
                <div key={sig.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${sig.cls === "EXPOSED" ? "10" : "07"}`,
                  border: `1px solid ${col}${sig.cls === "EXPOSED" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: sig.cls === "EXPOSED" ? "rckdoa_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: sig.cls === "EXPOSED" ? `0 0 8px ${col}` : "none",
                    }}>{sig.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {sev && (
                      <span style={{
                        fontSize: 8, color: col + "99",
                        background: `${col}18`, padding: "1px 5px", borderRadius: 4,
                      }}>{sev.toUpperCase().slice(0, 10)}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Contacts */}
                      {sig.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({sig.matchedContacts.length})
                          </div>
                          {sig.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0, maxWidth: 60,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{(c.role || c.organization || c.org || "contact").toUpperCase().slice(0, 12)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || "contact"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Datasets */}
                      {sig.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ DATASETS ({sig.matchedDatasets.length})
                          </div>
                          {sig.matchedDatasets.slice(0, 3).map((d, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(d.row_count != null ? `${d.row_count}r` : "data").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {d._label || d.name || "dataset"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Knowledge */}
                      {sig.matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◈ KNOWLEDGE ({sig.matchedKnowledge.length})
                          </div>
                          {sig.matchedKnowledge.slice(0, 3).map((k, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0, maxWidth: 60,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{(k.category || "know").toUpperCase().slice(0, 10)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {k._label || k.title || k.name || "article"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops Alerts */}
                      {sig.matchedOpsAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚠ OPS ALERTS ({sig.matchedOpsAlerts.length})
                          </div>
                          {sig.matchedOpsAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(a.severity || a.level || "alert").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.name || a.title || a.message || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {sig.cls === "EXPOSED" &&
                        sig.matchedContacts.length === 0 &&
                        sig.matchedDatasets.length === 0 &&
                        sig.matchedKnowledge.length === 0 &&
                        sig.matchedOpsAlerts.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Blind spot — no contact owner, dataset, knowledge article, or ops alert.
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
              RISK×CONT×DATA×KNOW×OPS — 5-source
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
        @keyframes rckdoa_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes rckdoa_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes rckdoa_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
