/**
 * F175 IntelProfile × Report × Contact × Task × Graph × Ops Alert
 * Command Execution Intelligence Web — ◈ IPCTWEB
 *
 * Fetches: /entities/IntelProfile + /v1/reports + /entities/Contact
 *          + /entities/Task + /v1/graph/centrality + /v1/ops/alerts
 * Classifies each intel profile across 4 tiers by cross-source keyword overlap:
 *   COMMANDING — matched 5-6 sources
 *   ACTIVE     — matched 3-4 sources
 *   PARTIAL    — matched 1-2 sources
 *   DORMANT    — zero matches (no report, no contact, no task, no graph trace,
 *                no ops alert — full intelligence dead-ends)
 * Red pulse on DORMANT count.
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DORMANT: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, PARTIAL: 2, DORMANT: 1 };

const IPCTWEB_RE = /\b(ipctweb|intel.profile.report.contact|intel.command.web|intel.execution.web|intel.profile.ops|dormant.intel|intel.dead.end|intel.command.execution|intel.profile.task|intel.profile.graph|intel.authority.web|command.execution.web|intel.web|profile.report.contact|intel.profile.contact.task|intelligence.web)\b/i;

export function isIpctwebQuery(q) { return IPCTWEB_RE.test(q || ""); }

export function buildIpctwebScript(rows) {
  const total    = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const dormant  = rows.filter(r => r.cls === "DORMANT").length;
  return (
    `Command Execution Intelligence Web: ${total} intel profile${total !== 1 ? "s" : ""} assessed across report, contact, task, graph, and ops alert sources. ` +
    `${commanding} fully commanding (5-6 sources grounded). ` +
    (dormant > 0
      ? `${dormant} DORMANT — no filed report, no contact owner, no assigned task, no graph trace, no ops alert coverage. These are intelligence dead-ends requiring immediate activation.`
      : "No intelligence dead-ends detected. All profiles have full command execution coverage.")
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

function classify(sourceCount) {
  if (sourceCount >= 5) return "COMMANDING";
  if (sourceCount >= 3) return "ACTIVE";
  if (sourceCount >= 1) return "PARTIAL";
  return "DORMANT";
}

async function loadData() {
  const [profilesRaw, reportsRaw, contactsRaw, tasksRaw, graphRaw, opsRaw] = await Promise.all([
    fetcher("/entities/IntelProfile"),
    fetcher("/v1/reports"),
    fetcher("/entities/Contact"),
    fetcher("/entities/Task"),
    fetcher("/v1/graph/centrality"),
    fetcher("/v1/ops/alerts"),
  ]);

  const profiles = normalizeArray(profilesRaw,  ["name","title","subject","profile_name","id"]);
  const reports  = normalizeArray(reportsRaw,   ["title","name","summary","id"]);
  const contacts = normalizeArray(contactsRaw,  ["name","full_name","displayName","email","id"]);
  const tasks    = normalizeArray(tasksRaw,     ["name","title","task_name","description","id"]);
  const graphNodes = normalizeArray(
    Array.isArray(graphRaw?.nodes) ? graphRaw.nodes
      : Array.isArray(graphRaw?.data?.nodes) ? graphRaw.data.nodes
      : Array.isArray(graphRaw) ? graphRaw
      : [],
    ["label", "name", "id", "type"]
  );
  const alerts   = normalizeArray(opsRaw,       ["message","title","name","description","id"]);

  return profiles.map(profile => {
    const pToks = tokens(
      profile._label + " " +
      (profile.category || "") + " " +
      (profile.description || "") + " " +
      (profile.tags || "").toString()
    );

    const matchedReports  = reports.filter(r  => overlaps(pToks, r._label + " " + (r.summary || "") + " " + (r.category || "")));
    const matchedContacts = contacts.filter(c  => overlaps(pToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));
    const matchedTasks    = tasks.filter(t    => overlaps(pToks, t._label + " " + (t.description || "") + " " + (t.status || "")));
    const matchedGraph    = graphNodes.filter(g => overlaps(pToks, g._label + " " + (g.type || "") + " " + (g.description || "")));
    const matchedAlerts   = alerts.filter(a   => overlaps(pToks, a._label + " " + (a.severity || "") + " " + (a.type || "")));

    const sourceCount =
      (matchedReports.length  > 0 ? 1 : 0) +
      (matchedContacts.length > 0 ? 1 : 0) +
      (matchedTasks.length    > 0 ? 1 : 0) +
      (matchedGraph.length    > 0 ? 1 : 0) +
      (matchedAlerts.length   > 0 ? 1 : 0);

    return {
      ...profile,
      cls: classify(sourceCount),
      matchedReports,
      matchedContacts,
      matchedTasks,
      matchedGraph,
      matchedAlerts,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "COMMANDING", "ACTIVE", "PARTIAL", "DORMANT"];
const LEFT_PX = 146360;
const Z_IDX   = 272;

export default function IntelProfileReportContactTaskGraphOpsWeb() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - lastFetch < 90_000) return;
    setLoading(true);
    try {
      const data = await loadData();
      setRows(data);
      setLastFetch(Date.now());
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) load(true); return !v; }); };
    window.addEventListener("jarvis:ipctweb-toggle", handler);
    return () => window.removeEventListener("jarvis:ipctweb-toggle", handler);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => load(true), 90_000);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildIpctwebScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      if (r.ok) {
        const j = await r.json();
        const reply = j.response || j.message || j.reply || script;
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ text: reply }),
        });
      }
    } finally {
      setAssessing(false);
    }
  }, [assessing, rows]);

  const counts = {
    COMMANDING: rows.filter(r => r.cls === "COMMANDING").length,
    ACTIVE:     rows.filter(r => r.cls === "ACTIVE").length,
    PARTIAL:    rows.filter(r => r.cls === "PARTIAL").length,
    DORMANT:    rows.filter(r => r.cls === "DORMANT").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.category || "").toLowerCase().includes(s) ||
             (r.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasDormant = counts.DORMANT > 0;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(v => { if (!v) load(true); return !v; }); }}
        style={{
          position: "fixed",
          bottom: 8,
          left: LEFT_PX,
          zIndex: Z_IDX,
          background: open ? `${RED}22` : "#0a1628cc",
          border: `1px solid ${hasDormant ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasDormant ? RED : CYAN,
          cursor: "pointer",
          padding: "5px 10px",
          fontSize: 9,
          letterSpacing: 1,
          fontWeight: 700,
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 5,
          animation: hasDormant ? "ipctweb_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasDormant && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: RED, display: "inline-block",
            animation: "ipctweb_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ IPCTWEB
        {hasDormant && (
          <span style={{
            background: `${RED}33`, color: RED,
            borderRadius: 4, padding: "1px 5px", fontSize: 8,
          }}>{counts.DORMANT}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 36,
          left: LEFT_PX - 340,
          zIndex: Z_IDX + 1,
          width: 440,
          maxHeight: 500,
          background: "#060e1eee",
          border: `1px solid ${RED}44`,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          boxShadow: `0 0 32px ${RED}22`,
          backdropFilter: "blur(12px)",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px 6px",
            borderBottom: `1px solid ${RED}22`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 9, color: RED, fontWeight: 700, letterSpacing: 1 }}>
              ◈ INTEL × REPORT × CONTACT × TASK × GRAPH × OPS
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <span style={{ fontSize: 8, color: DIM }}>
              {rows.length} profiles
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none",
              color: DIM, cursor: "pointer", fontSize: 12, padding: 0,
            }}>✕</button>
          </div>

          {/* Stats row */}
          <div style={{
            padding: "6px 14px",
            display: "flex",
            gap: 8,
            borderBottom: `1px solid ${RED}18`,
          }}>
            {Object.entries(counts).map(([cls, cnt]) => (
              <div key={cls} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                flex: 1,
              }}>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: CLS_COLOR[cls],
                  animation: cls === "DORMANT" && cnt > 0 ? "ipctweb_pulse 1.4s ease-in-out infinite" : "none",
                }}>{cnt}</span>
                <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{cls}</span>
              </div>
            ))}
          </div>

          {/* Filter row */}
          <div style={{
            padding: "4px 14px",
            display: "flex",
            gap: 4,
            alignItems: "center",
            borderBottom: `1px solid ${RED}12`,
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
                border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}44`,
                borderRadius: 4,
                color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
                cursor: "pointer",
                padding: "2px 6px",
                fontSize: 8,
                letterSpacing: 1,
              }}>{f}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                flex: 1,
                minWidth: 80,
                background: "#0c1a30",
                border: `1px solid ${DIM}44`,
                borderRadius: 4,
                color: "#DCEBF5",
                fontSize: 8,
                padding: "2px 6px",
                outline: "none",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 10px" }}>
            {visible.length === 0 && (
              <div style={{ fontSize: 9, color: DIM, textAlign: "center", padding: 16 }}>
                {loading ? "Fetching profiles…" : "No profiles match."}
              </div>
            )}
            {visible.map((profile, i) => {
              const clsColor = CLS_COLOR[profile.cls];
              const isExp    = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 4,
                    background: `${clsColor}09`,
                    border: `1px solid ${clsColor}${profile.cls === "DORMANT" ? "55" : "33"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "5px 8px",
                    animation: profile.cls === "DORMANT" ? "ipctweb_pulse_card 2s ease-in-out infinite" : "none",
                  }}
                >
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      fontSize: 7,
                      color: clsColor,
                      background: `${clsColor}22`,
                      padding: "1px 5px",
                      borderRadius: 3,
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}>{profile.cls}</span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {profile._label || profile.name || profile.title || "profile"}
                    </span>
                    {profile.category && (
                      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                        [{profile.category}]
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: clsColor, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: `1px solid ${clsColor}22`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}>
                      {/* Reports */}
                      {profile.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ REPORTS ({profile.matchedReports.length})
                          </div>
                          {profile.matchedReports.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{r.date ? new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "rpt"}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.title || r.name || "report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {profile.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({profile.matchedContacts.length})
                          </div>
                          {profile.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || c.email || "contact"}
                              </span>
                              {(c.role || c.organization || c.org) && (
                                <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                                  {(c.role || "") + (c.organization || c.org ? " · " + (c.organization || c.org) : "")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Tasks */}
                      {profile.matchedTasks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ TASKS ({profile.matchedTasks.length})
                          </div>
                          {profile.matchedTasks.slice(0, 3).map((t, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(t.status || "task").toString().toUpperCase().slice(0, 5)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {t._label || t.name || t.title || "task"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Graph nodes */}
                      {profile.matchedGraph.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: DIM + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ GRAPH NODES ({profile.matchedGraph.length})
                          </div>
                          {profile.matchedGraph.slice(0, 3).map((g, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: "#1a2a3a33", borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: DIM, background: "#1a2a3a55",
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{typeof g.centrality === "number" ? g.centrality.toFixed(2) : (g.type || "node").slice(0, 4).toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {g._label || g.label || g.name || "node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops alerts */}
                      {profile.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ OPS ALERTS ({profile.matchedAlerts.length})
                          </div>
                          {profile.matchedAlerts.slice(0, 3).map((a, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(a.severity || a.level || "alrt").toString().toUpperCase().slice(0, 5)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {a._label || a.message || a.title || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {profile.cls === "DORMANT" &&
                        profile.matchedReports.length === 0 &&
                        profile.matchedContacts.length === 0 &&
                        profile.matchedTasks.length === 0 &&
                        profile.matchedGraph.length === 0 &&
                        profile.matchedAlerts.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Intelligence dead-end — no filed report, no contact, no task, no graph trace, no ops alert.
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
            padding: "8px 14px",
            borderTop: `1px solid ${RED}18`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{ fontSize: 8, color: DIM, flex: 1 }}>
              INTEL×RPT×CONT×TASK×GRAPH×OPS — 6-source
            </span>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? `${RED}33` : `${RED}22`,
                border: `1px solid ${RED}66`,
                borderRadius: 6,
                color: RED,
                cursor: assessing ? "default" : "pointer",
                padding: "4px 12px",
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: 700,
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
        @keyframes ipctweb_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes ipctweb_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes ipctweb_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
