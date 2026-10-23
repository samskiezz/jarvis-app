/**
 * F145 IntelProfile × Report × Task × Dataset × Brain
 * Intelligence Production Authority — ◈ IPTDBA
 *
 * Fetches: /entities/IntelProfile + /v1/reports + /entities/Task
 *          + /v1/datasets + /v1/cinematic/brain
 * Classifies each intel profile across 4 tiers based on cross-source keyword overlap:
 *   COMMANDING — matched all 4 external sources (report, task, dataset, brain node)
 *   ACTIVE     — matched 2-3 sources
 *   PARTIAL    — matched exactly 1 source
 *   DORMANT    — zero matches (intel profiles with no report, no task, no dataset, no brain model)
 * Red pulse on DORMANT count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";
const DIM   = "#566878";

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DORMANT: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, PARTIAL: 2, DORMANT: 1 };

const REFRESH_MS = 90_000;

const IPTDBA_RE = /\b(iptdba|intel.*report.*task.*dataset|intel.*brain.*authority|intel.*production.*authority|intel.*profile.*report.*task|intel.*dataset.*brain|intel.*authority|intelligence.*production.*authority|intel.*commanding|dormant.*intel|intel.*dormant)\b/i;

export function isIptdbaQuery(q) { return IPTDBA_RE.test(q || ""); }

export function buildIptdbaScript(rows) {
  const total     = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const dormant   = rows.filter(r => r.cls === "DORMANT").length;
  return (
    `Intelligence Production Authority: ${total} intel profile${total !== 1 ? "s" : ""} assessed. ` +
    `${commanding} commanding (report, task, dataset, and brain model coverage confirmed). ` +
    (dormant > 0
      ? `${dormant} dormant — no report filed, no task assigned, no dataset sourced, no brain model. Full intelligence dead-ends.`
      : "No dormant intel profiles detected.")
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
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : Array.isArray(raw?.nodes)            ? raw.nodes
    : Array.isArray(raw?.reports)          ? raw.reports
    : Array.isArray(raw?.articles)         ? raw.articles
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
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyProfile(profile, reports, tasks, datasets, brainNodes) {
  const profileText = [
    profile.name, profile.title, profile.type, profile.category,
    profile.description, profile.source, profile.tags, profile.alias,
  ].filter(Boolean).join(" ");
  const pToks = tokens(profileText);

  const matchedReports = reports.filter(r =>
    overlaps(pToks, [r._label, r.title, r.name, r.type, r.category, r.summary, r.description, r.subject].join(" "))
  );
  const matchedTasks = tasks.filter(t =>
    overlaps(pToks, [t._label, t.name, t.title, t.type, t.category, t.description, t.status, t.assignee].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(pToks, [d._label, d.name, d.title, d.type, d.category, d.description, d.source].join(" "))
  );
  const matchedBrainNodes = brainNodes.filter(n =>
    overlaps(pToks, [n._label, n.label, n.name, n.title, n.type, n.description, n.id].join(" "))
  );

  const sources = [
    matchedReports.length > 0,
    matchedTasks.length > 0,
    matchedDatasets.length > 0,
    matchedBrainNodes.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "COMMANDING";
  else if (sources >= 2) cls = "ACTIVE";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "DORMANT";

  return { profile, cls, matchedReports, matchedTasks, matchedDatasets, matchedBrainNodes };
}

export default function IntelProfileReportTaskDatasetBrainAuthority() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilesRaw, reportsRaw, tasksRaw, datasetsRaw, brainRaw] = await Promise.all([
        fetcher("/entities/IntelProfile"),
        fetcher("/v1/reports"),
        fetcher("/entities/Task"),
        fetcher("/v1/datasets"),
        fetcher("/v1/cinematic/brain"),
      ]);

      const profiles   = normalizeArray(profilesRaw,  ["name", "title", "type", "category", "alias"]);
      const reports    = normalizeArray(reportsRaw,    ["title", "name", "subject", "type", "category"]);
      const tasks      = normalizeArray(tasksRaw,      ["name", "title", "type", "description"]);
      const datasets   = normalizeArray(datasetsRaw,   ["name", "title", "type", "category", "description"]);
      const brainNodes = normalizeArray(brainRaw,      ["label", "name", "title", "type", "id"]);

      const built = profiles.map(p => classifyProfile(p, reports, tasks, datasets, brainNodes));
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:iptdba-toggle", handler);
    return () => window.removeEventListener("jarvis:iptdba-toggle", handler);
  }, []);

  useEffect(() => {
    if (open) {
      load();
      timerRef.current = setInterval(load, REFRESH_MS);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildIptdbaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const json = await r.json();
        const text = json?.response || json?.message || json?.content || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text, voice: "onyx" }),
        });
      }
    } catch { /* silent */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  const dormantCount = rows.filter(r => r.cls === "DORMANT").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = [r.profile.name, r.profile.title, r.profile.type, r.profile.category].filter(Boolean).join(" ").toLowerCase();
      return label.includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const btnPulse = open && dormantCount > 0;

  return (
    <>
      {/* ◈ IPTDBA toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="IntelProfile × Report × Task × Dataset × Brain — Intelligence Production Authority"
        style={{
          position: "fixed",
          bottom: 8,
          left: 129560,
          zIndex: 242,
          background: open ? RED + "33" : "#0a0f1a",
          border: `1px solid ${open ? RED : "#1e3a4a"}`,
          borderRadius: 6,
          color: open ? RED : CYAN,
          cursor: "pointer",
          padding: "3px 9px",
          fontSize: 9,
          letterSpacing: 2,
          fontFamily: "inherit",
          fontWeight: 700,
          whiteSpace: "nowrap",
          animation: btnPulse ? "iptdba_pulse_btn 1.4s ease-in-out infinite" : "none",
        }}
      >
        {dormantCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: RED,
            animation: "iptdba_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ IPTDBA
      </button>

      {open && (
        <div style={{
          position: "fixed",
          bottom: 38,
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          maxHeight: 480,
          background: "rgba(6,10,18,0.97)",
          border: `1px solid ${RED}55`,
          borderRadius: 10,
          zIndex: 9243,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          color: CYAN,
          fontSize: 11,
          boxShadow: `0 0 40px ${RED}33`,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${RED}33`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ color: RED, fontWeight: 700, letterSpacing: 2, fontSize: 10 }}>
              ◈ INTELLIGENCE PRODUCTION AUTHORITY
            </span>
            {dormantCount > 0 && (
              <span style={{
                background: RED + "33",
                border: `1px solid ${RED}`,
                borderRadius: 4,
                color: RED,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 700,
                animation: "iptdba_pulse 1.4s ease-in-out infinite",
              }}>
                {dormantCount} DORMANT
              </span>
            )}
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              IntelProfile × Report × Task × Dataset × Brain
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none", border: "none", color: DIM,
                cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >✕</button>
          </div>

          {/* Filters */}
          <div style={{
            padding: "6px 12px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexShrink: 0,
          }}>
            {["ALL", "COMMANDING", "ACTIVE", "PARTIAL", "DORMANT"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? (CLS_COLOR[f] || CYAN) + "22" : "none",
                  border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : "#1e3a4a"}`,
                  borderRadius: 4,
                  color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: 8,
                  letterSpacing: 1,
                  fontFamily: "inherit",
                  fontWeight: 700,
                }}
              >{f} {f !== "ALL" ? `(${rows.filter(r => r.cls === f).length})` : `(${rows.length})`}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search intel profiles…"
              style={{
                marginLeft: "auto",
                background: "#0a0f1a",
                border: `1px solid #1e3a4a`,
                borderRadius: 4,
                color: CYAN,
                padding: "2px 8px",
                fontSize: 9,
                fontFamily: "inherit",
                outline: "none",
                width: 150,
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>Loading intel profiles…</div>
            )}
            {error && (
              <div style={{ padding: 10, color: RED }}>{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>No intel profiles match.</div>
            )}
            {!loading && visible.map((row, idx) => {
              const key = `intel-${row.profile.id || row.profile.name || idx}`;
              const isExp = !!expanded[key];
              const clsColor = CLS_COLOR[row.cls] || CYAN;
              const profileLabel = row.profile.name || row.profile.title || row.profile.alias || `Profile ${idx + 1}`;
              const typeCategory = [row.profile.type, row.profile.category].filter(Boolean).join(" · ");

              return (
                <div key={key} style={{
                  borderBottom: `1px solid ${RED}11`,
                  background: isExp ? "#0a0f1acc" : "transparent",
                }}>
                  <div
                    onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 90,
                      color: clsColor,
                      fontWeight: 700,
                      fontSize: 9,
                      letterSpacing: 1,
                    }}>{row.cls}</span>

                    <span style={{ flex: 1, color: CYAN, fontSize: 10 }}>{profileLabel}</span>

                    {typeCategory && (
                      <span style={{ fontSize: 9, color: DIM, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {typeCategory}
                      </span>
                    )}

                    {/* Source badges */}
                    {row.matchedReports.length > 0 && (
                      <span style={{
                        background: GREEN + "22", border: `1px solid ${GREEN}55`,
                        borderRadius: 3, color: GREEN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>R:{row.matchedReports.length}</span>
                    )}
                    {row.matchedTasks.length > 0 && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>T:{row.matchedTasks.length}</span>
                    )}
                    {row.matchedDatasets.length > 0 && (
                      <span style={{
                        background: AMBER + "22", border: `1px solid ${AMBER}55`,
                        borderRadius: 3, color: AMBER,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>D:{row.matchedDatasets.length}</span>
                    )}
                    {row.matchedBrainNodes.length > 0 && (
                      <span style={{
                        background: RED + "22", border: `1px solid ${RED}55`,
                        borderRadius: 3, color: RED,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>B:{row.matchedBrainNodes.length}</span>
                    )}

                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "4px 12px 10px 24px",
                      borderTop: `1px solid ${RED}11`,
                    }}>
                      {typeCategory && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 6 }}>{typeCategory}</div>
                      )}

                      {row.matchedReports.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GREEN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>REPORTS</div>
                          {row.matchedReports.slice(0, 4).map((r, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: GREEN + "22", border: `1px solid ${GREEN}55`,
                                borderRadius: 3, color: GREEN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{r.date || r.created_at ? new Date(r.date || r.created_at).toLocaleDateString() : r.type || "RPT"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {r._label || r.title || r.name || r.subject || "Report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedTasks.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CYAN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>TASKS</div>
                          {row.matchedTasks.slice(0, 4).map((t, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: CYAN + "22", border: `1px solid ${CYAN}55`,
                                borderRadius: 3, color: CYAN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{t.status || t.type || "TASK"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {t._label || t.name || t.title || "Task"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedDatasets.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AMBER, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>DATASETS</div>
                          {row.matchedDatasets.slice(0, 4).map((d, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: AMBER + "22", border: `1px solid ${AMBER}55`,
                                borderRadius: 3, color: AMBER,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{typeof d.row_count === "number" ? d.row_count.toLocaleString() + "r" : d.type || "DS"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {d._label || d.name || d.title || "Dataset"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedBrainNodes.length > 0 && (
                        <div style={{ marginBottom: 2 }}>
                          <div style={{ color: RED, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>BRAIN NODES</div>
                          {row.matchedBrainNodes.slice(0, 4).map((n, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: RED + "22", border: `1px solid ${RED}55`,
                                borderRadius: 3, color: RED,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{n.type || n.kind || "NODE"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {n._label || n.label || n.name || n.id || "Node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedReports.length === 0 && row.matchedTasks.length === 0 &&
                        row.matchedDatasets.length === 0 && row.matchedBrainNodes.length === 0 && (
                        <div style={{ color: RED, fontSize: 9, fontStyle: "italic" }}>
                          No report, task, dataset, or brain model — intel profile is fully dormant.
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
            padding: "8px 12px",
            borderTop: `1px solid ${RED}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? RED + "44" : RED + "22",
                border: `1px solid ${RED}55`,
                borderRadius: 6,
                color: RED,
                cursor: assessing ? "not-allowed" : "pointer",
                padding: "4px 14px",
                fontSize: 9,
                letterSpacing: 2,
                fontFamily: "inherit",
                fontWeight: 700,
              }}
            >{assessing ? "ASSESSING…" : "▶ ASSESS"}</button>
            <span style={{ color: DIM, fontSize: 9 }}>
              IntelProfile × Report × Task × Dataset × Brain
            </span>
            <button
              onClick={load}
              disabled={loading}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid #334455`,
                borderRadius: 5,
                color: DIM,
                cursor: loading ? "not-allowed" : "pointer",
                padding: "3px 10px",
                fontSize: 9,
                fontFamily: "inherit",
              }}
            >{loading ? "…" : "↺"}</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes iptdba_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes iptdba_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
