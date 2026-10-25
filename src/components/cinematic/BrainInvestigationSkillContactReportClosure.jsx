/**
 * F172 Brain × Investigation × Skill × Contact × Report
 * Intelligence Closure Authority — ◈ BISCR
 *
 * Fetches: /v1/cinematic/brain + /v1/investigations + /v1/aip/skill
 *          + /entities/Contact + /v1/reports
 * Classifies each brain node across 4 tiers by cross-source keyword overlap:
 *   CLOSED  — matched 4-5 sources (investigation + skill + contact + report)
 *   CAPABLE — matched 2-3 sources
 *   STAFFED — matched 1 source
 *   OPEN    — zero matches (brain node with no investigation, no skill, no
 *              contact owner, no report — unresolved intelligence dead-end)
 * Red pulse on OPEN count.
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

const CLS_COLOR = { CLOSED: GREEN, CAPABLE: CYAN, STAFFED: AMBER, OPEN: RED };
const CLS_ORDER = { CLOSED: 4, CAPABLE: 3, STAFFED: 2, OPEN: 1 };

const BISCR_RE = /\b(biscr|brain.investigation|brain.closure|intelligence.closure|brain.skill.contact|investigation.closure|brain.report.closure|closure.authority|unresolved.brain|brain.open|brain.dead.end|intelligence.dead.end|brain.investigation.skill|brain.contact.report|open.brain.node|brain.staffed|brain.capable|brain.closed)\b/i;

export function isBiscrQuery(q) { return BISCR_RE.test(q || ""); }

export function buildBiscrScript(rows) {
  const total   = rows.length;
  const closed  = rows.filter(r => r.cls === "CLOSED").length;
  const open    = rows.filter(r => r.cls === "OPEN").length;
  return (
    `Intelligence Closure Authority: ${total} brain node${total !== 1 ? "s" : ""} assessed across investigation, skill, contact, and report sources. ` +
    `${closed} fully closed (4-5 sources grounded). ` +
    (open > 0
      ? `${open} OPEN — no investigation, no skill, no contact owner, no filed report. These are unresolved intelligence dead-ends requiring immediate attention.`
      : "No unresolved intelligence dead-ends detected.")
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
  if (sourceCount >= 4) return "CLOSED";
  if (sourceCount >= 2) return "CAPABLE";
  if (sourceCount >= 1) return "STAFFED";
  return "OPEN";
}

async function loadData() {
  const [brainRaw, invsRaw, skillsRaw, contactsRaw, reportsRaw] = await Promise.all([
    fetcher("/v1/cinematic/brain"),
    fetcher("/v1/investigations"),
    fetcher("/v1/aip/skill"),
    fetcher("/entities/Contact"),
    fetcher("/v1/reports"),
  ]);

  const brainNodes = normalizeArray(
    Array.isArray(brainRaw?.nodes) ? brainRaw.nodes
      : Array.isArray(brainRaw?.data?.nodes) ? brainRaw.data.nodes
      : brainRaw,
    ["label", "name", "id", "type"]
  );
  const invs      = normalizeArray(invsRaw,     ["title","name","summary","id"]);
  const skills    = normalizeArray(skillsRaw,   ["name","title","skill_name","id"]);
  const contacts  = normalizeArray(contactsRaw, ["name","full_name","displayName","email","id"]);
  const reports   = normalizeArray(reportsRaw,  ["title","name","summary","id"]);

  return brainNodes.map(node => {
    const nToks = tokens(node._label || node.type || "");
    const matchedInvs      = invs.filter(i => overlaps(nToks, i._label + " " + (i.summary || "") + " " + (i.status || "")));
    const matchedSkills    = skills.filter(s => overlaps(nToks, s._label + " " + (s.description || "") + " " + (s.category || "")));
    const matchedContacts  = contacts.filter(c => overlaps(nToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));
    const matchedReports   = reports.filter(r => overlaps(nToks, r._label + " " + (r.summary || "") + " " + (r.category || "")));

    const sourceCount =
      (matchedInvs.length     > 0 ? 1 : 0) +
      (matchedSkills.length    > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0) +
      (matchedReports.length   > 0 ? 1 : 0);

    return {
      ...node,
      cls: classify(sourceCount),
      matchedInvs,
      matchedSkills,
      matchedContacts,
      matchedReports,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "CLOSED", "CAPABLE", "STAFFED", "OPEN"];
const LEFT_PX = 144680;
const Z_IDX   = 269;

export default function BrainInvestigationSkillContactReportClosure() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [lastFetch,setLastFetch]= useState(0);

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
    window.addEventListener("jarvis:biscr-toggle", handler);
    return () => window.removeEventListener("jarvis:biscr-toggle", handler);
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
      const script = buildBiscrScript(rows);
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
    CLOSED:  rows.filter(r => r.cls === "CLOSED").length,
    CAPABLE: rows.filter(r => r.cls === "CAPABLE").length,
    STAFFED: rows.filter(r => r.cls === "STAFFED").length,
    OPEN:    rows.filter(r => r.cls === "OPEN").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasOpen = counts.OPEN > 0;

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
          border: `1px solid ${hasOpen ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasOpen ? RED : CYAN,
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
          animation: hasOpen ? "biscr_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasOpen && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: RED, display: "inline-block",
            animation: "biscr_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ BISCR
        {hasOpen && (
          <span style={{
            background: `${RED}33`, color: RED,
            borderRadius: 4, padding: "1px 5px", fontSize: 8,
          }}>{counts.OPEN}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 36,
          left: LEFT_PX - 340,
          zIndex: Z_IDX + 1,
          width: 420,
          maxHeight: 480,
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
              ◈ BRAIN × INVESTIGATION × SKILL × CONTACT × REPORT
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <span style={{ fontSize: 8, color: DIM }}>
              {rows.length} nodes
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
                  animation: cls === "OPEN" && cnt > 0 ? "biscr_pulse 1.4s ease-in-out infinite" : "none",
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
                {loading ? "Fetching brain nodes…" : "No nodes match."}
              </div>
            )}
            {visible.map((node, i) => {
              const clsColor = CLS_COLOR[node.cls];
              const isExp    = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 4,
                    background: `${clsColor}09`,
                    border: `1px solid ${clsColor}${node.cls === "OPEN" ? "55" : "33"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "5px 8px",
                    animation: node.cls === "OPEN" ? "biscr_pulse_card 2s ease-in-out infinite" : "none",
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
                    }}>{node.cls}</span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {node._label || node.type || "brain node"}
                    </span>
                    {node.type && (
                      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                        [{node.type}]
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
                      {/* Investigations */}
                      {node.matchedInvs.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ INVESTIGATIONS ({node.matchedInvs.length})
                          </div>
                          {node.matchedInvs.slice(0, 3).map((inv, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(inv.status || inv.state || "open").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {inv._label || inv.title || inv.name || "investigation"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Skills */}
                      {node.matchedSkills.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ SKILLS ({node.matchedSkills.length})
                          </div>
                          {node.matchedSkills.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{typeof s.score === "number" ? s.score.toFixed(1) : "skill"}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || s.skill_name || "skill"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {node.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({node.matchedContacts.length})
                          </div>
                          {node.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
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
                      {/* Reports */}
                      {node.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ REPORTS ({node.matchedReports.length})
                          </div>
                          {node.matchedReports.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{r.date ? new Date(r.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "rpt"}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.title || r.name || "report"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {node.cls === "OPEN" &&
                        node.matchedInvs.length === 0 &&
                        node.matchedSkills.length === 0 &&
                        node.matchedContacts.length === 0 &&
                        node.matchedReports.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Unresolved dead-end — no investigation, skill, contact, or report.
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
              BRAIN×INV×SKILL×CONT×RPT — 5-source
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
        @keyframes biscr_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes biscr_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes biscr_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
