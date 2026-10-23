/**
 * F141 Investigation × IntelProfile × SwarmJob × Dataset × Brain
 * Active Case Intelligence Foundation — ◈ INVFND
 *
 * Fetches: /v1/investigations + /entities/IntelProfile + /entities/SwarmJob
 *          + /v1/datasets + /v1/cinematic/brain
 * Classifies each open investigation across 4 tiers based on cross-source keyword overlap:
 *   PROSECUTED — matched all 4 external sources (fully backed case)
 *   ACTIVE     — matched 2-3 sources
 *   PARTIAL    — matched exactly 1 source
 *   DARK       — zero matches (open cases with no intel profile, no swarm automation,
 *                no dataset, no brain model — operational dead spots)
 * Red pulse on DARK count.
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

const CLS_COLOR = { PROSECUTED: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { PROSECUTED: 4, ACTIVE: 3, PARTIAL: 2, DARK: 1 };

const INVFND_RE = /\b(invfnd|investigation\.foundation|case\.intelligence|active\.case\.intel|investigation.*intel.*swarm|investigation.*dataset.*brain|case.*intelligence.*foundation|open.*case.*coverage|investigation.*coverage|case.*foundation|case.*blind)\b/i;

export function isInvfndQuery(q) { return INVFND_RE.test(q || ""); }

export function buildInvfndScript(rows) {
  const total       = rows.length;
  const prosecuted  = rows.filter(r => r.cls === "PROSECUTED").length;
  const dark        = rows.filter(r => r.cls === "DARK").length;
  return (
    `Active Case Intelligence Foundation: ${total} investigation${total !== 1 ? "s" : ""} assessed. ` +
    `${prosecuted} fully prosecuted (intel profile, swarm automation, dataset, and brain model confirmed). ` +
    (dark > 0
      ? `${dark} dark — no intel profile, no swarm automation, no dataset, no brain model. Operational dead spots.`
      : "No dark investigations detected.")
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

function classifyInvestigation(inv, profiles, swarmJobs, datasets, brainNodes) {
  const toks = tokens(
    [inv._label, inv.name, inv.title, inv.type, inv.category, inv.subject, inv.description, inv.status].join(" ")
  );

  const matchedProfiles  = profiles.filter(p =>
    overlaps(toks, [p._label, p.name, p.title, p.category, p.type, p.subject, p.tags].join(" "))
  );
  const matchedSwarmJobs = swarmJobs.filter(sj =>
    overlaps(toks, [sj._label, sj.name, sj.title, sj.type, sj.category, sj.task_type, sj.description].join(" "))
  );
  const matchedDatasets  = datasets.filter(ds =>
    overlaps(toks, [ds._label, ds.name, ds.title, ds.category, ds.type, ds.source].join(" "))
  );
  const matchedBrainNodes = brainNodes.filter(bn =>
    overlaps(toks, [bn._label, bn.name, bn.title, bn.type, bn.category, bn.label].join(" "))
  );

  const matchCount = [matchedProfiles, matchedSwarmJobs, matchedDatasets, matchedBrainNodes]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "PROSECUTED" :
    matchCount >= 2 ? "ACTIVE"     :
    matchCount === 1 ? "PARTIAL"   :
    "DARK";

  return { cls, matchedProfiles, matchedSwarmJobs, matchedDatasets, matchedBrainNodes };
}

export default function InvestigationIntelSwarmDatasetBrainFoundation() {
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
      const [invRaw, profileRaw, swarmRaw, datasetRaw, brainRaw] = await Promise.all([
        fetcher("/v1/investigations"),
        fetcher("/entities/IntelProfile"),
        fetcher("/entities/SwarmJob"),
        fetcher("/v1/datasets"),
        fetcher("/v1/cinematic/brain"),
      ]);

      const investigations = normalizeArray(invRaw,     ["name", "title", "subject"]);
      const profiles       = normalizeArray(profileRaw, ["name", "title", "subject"]);
      const swarmJobs      = normalizeArray(swarmRaw,   ["name", "title", "task_type"]);
      const datasets       = normalizeArray(datasetRaw, ["name", "title", "dataset_name"]);
      const brainNodes     = normalizeArray(
        Array.isArray(brainRaw?.nodes) ? brainRaw.nodes : brainRaw,
        ["name", "title", "label"]
      );

      const classified = investigations.map(inv => ({
        ...inv,
        ...classifyInvestigation(inv, profiles, swarmJobs, datasets, brainNodes),
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
    window.addEventListener("jarvis:invfnd-toggle", h);
    return () => window.removeEventListener("jarvis:invfnd-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildInvfndScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `INVFND ASSESS: ${script}` }),
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

  const darkCount = rows.filter(r => r.cls === "DARK").length;
  const counts = { ALL: rows.length, PROSECUTED: 0, ACTIVE: 0, PARTIAL: 0, DARK: 0 };
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
        title="Investigation × IntelProfile × SwarmJob × Dataset × Brain — Active Case Intelligence Foundation"
        style={{
          position: "fixed", left: 127320, bottom: 8, zIndex: 238,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${darkCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || darkCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: darkCount > 0 && !open ? "invfnd_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        INVFND
        {rows.length > 0 && (
          <span style={{
            background: darkCount > 0 ? RED : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {darkCount > 0 ? `${darkCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 238,
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
              animation: loading || darkCount > 0 ? "invfnd_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              ACTIVE CASE INTELLIGENCE FOUNDATION
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
                { label: "CASES",       val: counts.ALL,        col: CYAN  },
                { label: "PROSECUTED",  val: counts.PROSECUTED, col: GREEN },
                { label: "ACTIVE",      val: counts.ACTIVE,     col: CYAN  },
                { label: "PARTIAL",     val: counts.PARTIAL,    col: AMBER },
                { label: "DARK",        val: counts.DARK,       col: RED   },
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
            {["ALL", "PROSECUTED", "ACTIVE", "PARTIAL", "DARK"].map(cls => {
              const col = cls === "ALL" ? "#8ba3b8" : CLS_COLOR[cls];
              return (
                <button
                  key={cls}
                  onClick={() => setFilter(cls)}
                  style={{
                    background: filter === cls ? col + "22" : "transparent",
                    border: `1px solid ${filter === cls ? col : col + "44"}`,
                    borderRadius: 5, color: filter === cls ? col : col + "88",
                    cursor: "pointer", padding: "2px 8px", fontSize: 9,
                    fontFamily: "inherit", letterSpacing: 1,
                  }}
                >
                  {cls} {counts[cls] !== undefined ? `(${counts[cls]})` : ""}
                </button>
              );
            })}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="filter…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.04)",
                border: "1px solid #334455", borderRadius: 5,
                color: "#8ba3b8", padding: "2px 8px", fontSize: 10,
                fontFamily: "inherit", outline: "none", width: 90,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && rows.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM, fontSize: 10 }}>
                LOADING…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM, fontSize: 10 }}>
                NO CASES MATCHED
              </div>
            )}
            {visible.map((row, i) => {
              const col   = CLS_COLOR[row.cls] || DIM;
              const label = row._label || row.name || row.title || `CASE-${i + 1}`;
              const isExp = !!expanded[i];
              return (
                <div key={i} style={{
                  borderBottom: `1px solid #0a1520`,
                  background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent",
                }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [i]: !e[i] }))}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 12px", cursor: "pointer",
                    }}
                  >
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0, opacity: 0.85,
                      boxShadow: row.cls === "DARK" ? `0 0 8px ${RED}` : "none",
                    }} />
                    <span style={{ color: "#9fb5c5", fontSize: 11, flex: 1, letterSpacing: 0.5 }}>
                      {label.slice(0, 44)}
                    </span>
                    <span style={{
                      color: col, fontSize: 8, letterSpacing: 2,
                      background: col + "18", borderRadius: 4, padding: "1px 5px",
                      flexShrink: 0,
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "4px 12px 10px 28px",
                      borderTop: `1px solid #0d1e2a`,
                      display: "flex", flexDirection: "column", gap: 6,
                    }}>
                      {/* Intel Profiles */}
                      <div>
                        <div style={{ color: GREEN, fontSize: 8, letterSpacing: 2, marginBottom: 3 }}>
                          INTEL PROFILES ({row.matchedProfiles?.length ?? 0})
                        </div>
                        {(row.matchedProfiles || []).slice(0, 3).map((p, j) => (
                          <div key={j} style={{
                            color: "#7a9aaa", fontSize: 10, padding: "1px 0",
                            display: "flex", gap: 6, alignItems: "center",
                          }}>
                            <span style={{ color: GREEN + "88" }}>◆</span>
                            <span>{(p._label || p.name || "Profile").slice(0, 36)}</span>
                            {p.category && (
                              <span style={{
                                color: GREEN + "99", fontSize: 8,
                                background: GREEN + "18", borderRadius: 3,
                                padding: "0 4px", letterSpacing: 1,
                              }}>{p.category}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Swarm Jobs */}
                      <div>
                        <div style={{ color: CYAN, fontSize: 8, letterSpacing: 2, marginBottom: 3 }}>
                          SWARM JOBS ({row.matchedSwarmJobs?.length ?? 0})
                        </div>
                        {(row.matchedSwarmJobs || []).slice(0, 3).map((sj, j) => (
                          <div key={j} style={{
                            color: "#7a9aaa", fontSize: 10, padding: "1px 0",
                            display: "flex", gap: 6, alignItems: "center",
                          }}>
                            <span style={{ color: CYAN + "88" }}>◆</span>
                            <span>{(sj._label || sj.name || "Job").slice(0, 36)}</span>
                            {sj.status && (
                              <span style={{
                                color: CYAN + "99", fontSize: 8,
                                background: CYAN + "18", borderRadius: 3,
                                padding: "0 4px", letterSpacing: 1,
                              }}>{sj.status}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Datasets */}
                      <div>
                        <div style={{ color: AMBER, fontSize: 8, letterSpacing: 2, marginBottom: 3 }}>
                          DATASETS ({row.matchedDatasets?.length ?? 0})
                        </div>
                        {(row.matchedDatasets || []).slice(0, 3).map((ds, j) => (
                          <div key={j} style={{
                            color: "#7a9aaa", fontSize: 10, padding: "1px 0",
                            display: "flex", gap: 6, alignItems: "center",
                          }}>
                            <span style={{ color: AMBER + "88" }}>◆</span>
                            <span>{(ds._label || ds.name || "Dataset").slice(0, 36)}</span>
                            {ds.row_count != null && (
                              <span style={{
                                color: AMBER + "99", fontSize: 8,
                                background: AMBER + "18", borderRadius: 3,
                                padding: "0 4px", letterSpacing: 1,
                              }}>{ds.row_count} rows</span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Brain Nodes */}
                      <div>
                        <div style={{ color: RED, fontSize: 8, letterSpacing: 2, marginBottom: 3 }}>
                          BRAIN NODES ({row.matchedBrainNodes?.length ?? 0})
                        </div>
                        {(row.matchedBrainNodes || []).slice(0, 3).map((bn, j) => (
                          <div key={j} style={{
                            color: "#7a9aaa", fontSize: 10, padding: "1px 0",
                            display: "flex", gap: 6, alignItems: "center",
                          }}>
                            <span style={{ color: RED + "88" }}>◆</span>
                            <span>{(bn._label || bn.name || "Node").slice(0, 36)}</span>
                            {bn.type && (
                              <span style={{
                                color: RED + "99", fontSize: 8,
                                background: RED + "18", borderRadius: 3,
                                padding: "0 4px", letterSpacing: 1,
                              }}>{bn.type}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 12px", borderTop: `1px solid ${RED}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? RED + "44" : RED + "22",
                border: `1px solid ${RED}55`, borderRadius: 6,
                color: RED, cursor: assessing ? "not-allowed" : "pointer",
                padding: "4px 14px", fontSize: 9, letterSpacing: 2,
                fontFamily: "inherit", fontWeight: 700,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS"}
            </button>
            <span style={{ color: DIM, fontSize: 9 }}>
              Inv × IntelProfile × SwarmJob × Dataset × Brain
            </span>
            <button
              onClick={load}
              disabled={loading}
              style={{
                marginLeft: "auto", background: "none",
                border: `1px solid #334455`, borderRadius: 5,
                color: DIM, cursor: loading ? "not-allowed" : "pointer",
                padding: "3px 10px", fontSize: 9, fontFamily: "inherit",
              }}
            >
              {loading ? "…" : "↺"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes invfnd_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes invfnd_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
