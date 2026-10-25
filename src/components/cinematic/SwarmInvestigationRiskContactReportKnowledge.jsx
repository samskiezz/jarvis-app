/**
 * F176 SwarmJob × Investigation × RiskSignal × Contact × Report × Knowledge
 * Active Threat Intelligence Operations Closure — ◈ SITCOP
 *
 * Fetches: /entities/SwarmJob + /v1/investigations + /entities/RiskSignal
 *          + /entities/Contact + /v1/reports + /knowledge/
 * Classifies each swarm job across 4 tiers by cross-source keyword overlap:
 *   CLOSED    — matched 5-6 sources
 *   MANAGED   — matched 3-4 sources
 *   PARTIAL   — matched 1-2 sources
 *   BLIND     — zero matches (no investigation, no risk signal, no contact owner,
 *               no report, no knowledge article — fully blind automation)
 * Red pulse on BLIND count.
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

const CLS_COLOR = { CLOSED: GREEN, MANAGED: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { CLOSED: 4, MANAGED: 3, PARTIAL: 2, BLIND: 1 };

const SITCOP_RE = /\b(sitcop|swarm.investigation|swarm.risk.contact|swarm.closure|threat.ops.closure|blind.swarm|swarm.blind.spot|swarm.investigation.risk|swarm.knowledge.report|active.threat.closure|threat.intelligence.closure|operations.closure|swarm.ops.closure|swarm.threat.intel|automation.closure|swarm.unmonitored|unmonitored.swarm)\b/i;

export function isSitcopQuery(q) { return SITCOP_RE.test(q || ""); }

export function buildSitcopScript(rows) {
  const total   = rows.length;
  const closed  = rows.filter(r => r.cls === "CLOSED").length;
  const blind   = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Active Threat Intelligence Operations Closure: ${total} swarm job${total !== 1 ? "s" : ""} assessed across investigation, risk signal, contact, report, and knowledge sources. ` +
    `${closed} fully closed (5-6 sources grounded). ` +
    (blind > 0
      ? `${blind} BLIND — no investigation trace, no risk signal, no contact owner, no filed report, no knowledge article. These are fully unmonitored automation blind spots requiring immediate attention.`
      : "No automation blind spots detected. All swarm jobs have full operational intelligence closure.")
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
  if (sourceCount >= 5) return "CLOSED";
  if (sourceCount >= 3) return "MANAGED";
  if (sourceCount >= 1) return "PARTIAL";
  return "BLIND";
}

async function loadData() {
  const [swarmRaw, investRaw, riskRaw, contactsRaw, reportsRaw, knowledgeRaw] = await Promise.all([
    fetcher("/entities/SwarmJob"),
    fetcher("/v1/investigations"),
    fetcher("/entities/RiskSignal"),
    fetcher("/entities/Contact"),
    fetcher("/v1/reports"),
    fetcher("/knowledge/"),
  ]);

  const swarmJobs    = normalizeArray(swarmRaw,     ["name","job_name","title","task","id"]);
  const invests      = normalizeArray(investRaw,    ["title","name","subject","case_name","id"]);
  const risks        = normalizeArray(riskRaw,      ["name","title","signal","description","id"]);
  const contacts     = normalizeArray(contactsRaw,  ["name","full_name","displayName","email","id"]);
  const reports      = normalizeArray(reportsRaw,   ["title","name","summary","id"]);
  const knowledge    = normalizeArray(knowledgeRaw, ["title","name","subject","article_title","id"]);

  return swarmJobs.map(job => {
    const jToks = tokens(
      job._label + " " +
      (job.type || "") + " " +
      (job.description || "") + " " +
      (job.status || "")
    );

    const matchedInvests   = invests.filter(i  => overlaps(jToks, i._label + " " + (i.status || "") + " " + (i.description || "") + " " + (i.subject || "")));
    const matchedRisks     = risks.filter(r    => overlaps(jToks, r._label + " " + (r.severity || "") + " " + (r.type || "") + " " + (r.description || "")));
    const matchedContacts  = contacts.filter(c => overlaps(jToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));
    const matchedReports   = reports.filter(r  => overlaps(jToks, r._label + " " + (r.summary || "") + " " + (r.category || "")));
    const matchedKnowledge = knowledge.filter(k => overlaps(jToks, k._label + " " + (k.category || "") + " " + (k.tags || "").toString()));

    const sourceCount =
      (matchedInvests.length   > 0 ? 1 : 0) +
      (matchedRisks.length     > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0) +
      (matchedReports.length   > 0 ? 1 : 0) +
      (matchedKnowledge.length > 0 ? 1 : 0);

    return {
      ...job,
      cls: classify(sourceCount),
      matchedInvests,
      matchedRisks,
      matchedContacts,
      matchedReports,
      matchedKnowledge,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "CLOSED", "MANAGED", "PARTIAL", "BLIND"];
const LEFT_PX = 146920;
const Z_IDX   = 273;

export default function SwarmInvestigationRiskContactReportKnowledge() {
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
    window.addEventListener("jarvis:sitcop-toggle", handler);
    return () => window.removeEventListener("jarvis:sitcop-toggle", handler);
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
      const script = buildSitcopScript(rows);
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
    MANAGED: rows.filter(r => r.cls === "MANAGED").length,
    PARTIAL: rows.filter(r => r.cls === "PARTIAL").length,
    BLIND:   rows.filter(r => r.cls === "BLIND").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.status || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasBlind = counts.BLIND > 0;

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
          border: `1px solid ${hasBlind ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasBlind ? RED : CYAN,
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
          animation: hasBlind ? "sitcop_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasBlind && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: RED, display: "inline-block",
            animation: "sitcop_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ SITCOP
        {hasBlind && (
          <span style={{
            background: `${RED}33`, color: RED,
            borderRadius: 4, padding: "1px 5px", fontSize: 8,
          }}>{counts.BLIND}</span>
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
              ◈ SWARM × INV × RISK × CONT × RPT × KNOW
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <span style={{ fontSize: 8, color: DIM }}>
              {rows.length} jobs
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
                  animation: cls === "BLIND" && cnt > 0 ? "sitcop_pulse 1.4s ease-in-out infinite" : "none",
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
                {loading ? "Fetching swarm jobs…" : "No swarm jobs match."}
              </div>
            )}
            {visible.map((job, i) => {
              const clsColor = CLS_COLOR[job.cls];
              const isExp    = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 4,
                    background: `${clsColor}09`,
                    border: `1px solid ${clsColor}${job.cls === "BLIND" ? "55" : "33"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "5px 8px",
                    animation: job.cls === "BLIND" ? "sitcop_pulse_card 2s ease-in-out infinite" : "none",
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
                    }}>{job.cls}</span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {job._label || job.name || job.title || "swarm job"}
                    </span>
                    {job.status && (
                      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                        [{(job.status || "").toString().toUpperCase().slice(0, 8)}]
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
                      {job.matchedInvests.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ INVESTIGATIONS ({job.matchedInvests.length})
                          </div>
                          {job.matchedInvests.slice(0, 3).map((inv, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(inv.status || "inv").toString().toUpperCase().slice(0, 5)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {inv._label || inv.title || inv.name || "investigation"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Risk signals */}
                      {job.matchedRisks.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚡ RISK SIGNALS ({job.matchedRisks.length})
                          </div>
                          {job.matchedRisks.slice(0, 3).map((r, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(r.severity || r.level || "risk").toString().toUpperCase().slice(0, 5)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {r._label || r.name || r.title || "signal"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {job.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({job.matchedContacts.length})
                          </div>
                          {job.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
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
                      {job.matchedReports.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ REPORTS ({job.matchedReports.length})
                          </div>
                          {job.matchedReports.slice(0, 3).map((r, j) => (
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
                      {/* Knowledge */}
                      {job.matchedKnowledge.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: DIM + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◉ KNOWLEDGE ({job.matchedKnowledge.length})
                          </div>
                          {job.matchedKnowledge.slice(0, 3).map((k, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: "#1a2a3a33", borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: DIM, background: "#1a2a3a55",
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(k.category || "know").toString().slice(0, 6).toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {k._label || k.title || k.name || "article"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {job.cls === "BLIND" &&
                        job.matchedInvests.length === 0 &&
                        job.matchedRisks.length === 0 &&
                        job.matchedContacts.length === 0 &&
                        job.matchedReports.length === 0 &&
                        job.matchedKnowledge.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Fully blind automation — no investigation, no risk signal, no contact owner, no report, no knowledge article.
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
              SWARM×INV×RISK×CONT×RPT×KNOW — 6-source
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
        @keyframes sitcop_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes sitcop_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes sitcop_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
