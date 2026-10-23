/**
 * F139 SwarmJob × Knowledge × Contact × Ops Alert × Investigation
 * Intelligence Production Coverage — ◈ SWKCIA
 *
 * Fetches: /entities/SwarmJob + /knowledge/ + /entities/Contact
 *          + /v1/ops/alerts + /v1/investigations
 * Classifies each swarm job across 4 tiers based on cross-source keyword overlap:
 *   PRODUCING — matched all 4 external sources (fully production-grounded)
 *   DOCUMENTED — matched 2-3 sources
 *   PARTIAL  — matched exactly 1 source
 *   BLIND    — zero matches (no knowledge grounding, no contact, no alert, no investigation)
 * Amber pulse on BLIND count.
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

const CLS_COLOR = { PRODUCING: GREEN, DOCUMENTED: CYAN, PARTIAL: AMBER, BLIND: AMBER };
const CLS_ORDER = { PRODUCING: 4, DOCUMENTED: 3, PARTIAL: 2, BLIND: 1 };

const SWKCIA_RE = /\b(swkcia|swarm.knowledge.contact|swarm.intel.production|swarm.coverage|swarm.production.coverage|production.coverage|intel.production|swarm.knowledge|swarm.contact.ops|swarm.blind|blind.swarm|automation.production|swarm.investigation.coverage)\b/i;

export function isSwkciaQuery(q) { return SWKCIA_RE.test(q || ""); }

export function buildSwkciaScript(rows) {
  const total     = rows.length;
  const producing = rows.filter(r => r.cls === "PRODUCING").length;
  const blind     = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Swarm Intelligence Production Coverage: ${total} swarm job${total !== 1 ? "s" : ""} assessed. ` +
    `${producing} fully producing (knowledge, contact, ops alert, and investigation coverage confirmed). ` +
    (blind > 0
      ? `${blind} blind — no knowledge grounding, no contact owner, no ops alert, no investigation. Automation dead-ends.`
      : "No blind swarm jobs detected.")
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

function fmtDate(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function classifySwarm(swarm, articles, contacts, alerts, investigations) {
  const toks = tokens(
    [swarm._label, swarm.name, swarm.job_name, swarm.type, swarm.category, swarm.description, swarm.target].join(" ")
  );

  const matchedArticles = articles.filter(a =>
    overlaps(toks, [a._label, a.name, a.title, a.category, a.content, a.summary, a.topic].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(toks, [c._label, c.name, c.full_name, c.org, c.role, c.category].join(" "))
  );
  const matchedAlerts = alerts.filter(al =>
    overlaps(toks, [al._label, al.name, al.title, al.type, al.severity, al.category, al.message].join(" "))
  );
  const matchedInvestigations = investigations.filter(inv =>
    overlaps(toks, [inv._label, inv.name, inv.title, inv.type, inv.category, inv.status].join(" "))
  );

  const matchCount = [matchedArticles, matchedContacts, matchedAlerts, matchedInvestigations]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "PRODUCING"  :
    matchCount >= 2 ? "DOCUMENTED" :
    matchCount === 1 ? "PARTIAL"   :
    "BLIND";

  return { cls, matchedArticles, matchedContacts, matchedAlerts, matchedInvestigations };
}

export default function SwarmKnowledgeContactOpsInvestigationCoverage() {
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
      const [swarmRaw, knowledgeRaw, contactRaw, alertsRaw, invRaw] = await Promise.all([
        fetcher("/entities/SwarmJob"),
        fetcher("/knowledge/"),
        fetcher("/entities/Contact"),
        fetcher("/v1/ops/alerts"),
        fetcher("/v1/investigations"),
      ]);

      const swarms        = normalizeArray(swarmRaw,    ["name", "job_name", "title"]);
      const articles      = normalizeArray(knowledgeRaw, ["name", "title", "topic"]);
      const contacts      = normalizeArray(contactRaw,  ["name", "full_name", "display_name"]);
      const alerts        = normalizeArray(alertsRaw,   ["name", "title", "message"]);
      const investigations = normalizeArray(invRaw,     ["name", "title", "investigation_name"]);

      const classified = swarms.map(s => ({
        ...s,
        ...classifySwarm(s, articles, contacts, alerts, investigations),
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
    window.addEventListener("jarvis:swkcia-toggle", h);
    return () => window.removeEventListener("jarvis:swkcia-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildSwkciaScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SWKCIA ASSESS: ${script}` }),
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

  const blindCount = rows.filter(r => r.cls === "BLIND").length;
  const counts = { ALL: rows.length, PRODUCING: 0, DOCUMENTED: 0, PARTIAL: 0, BLIND: 0 };
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
        title="SwarmJob × Knowledge × Contact × Ops Alert × Investigation — Intelligence Production Coverage"
        style={{
          position: "fixed", left: 126200, bottom: 8, zIndex: 236,
          background: open ? AMBER + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${blindCount > 0 ? AMBER : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : AMBER,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${AMBER}${open || blindCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: blindCount > 0 && !open ? "swkcia_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        SWKCIA
        {rows.length > 0 && (
          <span style={{
            background: blindCount > 0 ? AMBER : "#334455",
            color: "#fff", borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {blindCount > 0 ? `${blindCount}!` : rows.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 236,
          width: "min(430px,93vw)", maxHeight: "min(600px,80vh)",
          background: "rgba(4,8,16,0.95)",
          border: `1px solid ${AMBER}44`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 60px ${AMBER}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${AMBER}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: AMBER,
              boxShadow: `0 0 10px ${AMBER}`, display: "inline-block",
              animation: loading || blindCount > 0 ? "swkcia_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: AMBER, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INTEL PRODUCTION COVERAGE
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
              padding: "8px 12px", borderBottom: `1px solid ${AMBER}12`,
              display: "flex", gap: 8, flexWrap: "wrap",
            }}>
              {[
                { label: "SWARM JOBS", val: counts.ALL,        col: CYAN  },
                { label: "PRODUCING",  val: counts.PRODUCING,  col: GREEN },
                { label: "DOCUMENTED", val: counts.DOCUMENTED, col: CYAN  },
                { label: "PARTIAL",    val: counts.PARTIAL,    col: AMBER },
                { label: "BLIND",      val: counts.BLIND,      col: AMBER },
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
            padding: "6px 12px", borderBottom: `1px solid ${AMBER}12`,
            display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "PRODUCING", "DOCUMENTED", "PARTIAL", "BLIND"].map(cls => {
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
                {rows.length === 0 ? "No swarm job data." : `No ${filter} jobs.`}
              </div>
            )}
            {visible.map((job, i) => {
              const col     = CLS_COLOR[job.cls] || CYAN;
              const name    = job._label || job.name || `Job #${i + 1}`;
              const jobType = job.type || job.status || job.category || "";
              const isExp   = (expanded[i] || false);
              return (
                <div key={job.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${job.cls === "BLIND" ? "10" : "07"}`,
                  border: `1px solid ${col}${job.cls === "BLIND" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: job.cls === "BLIND" ? "swkcia_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: job.cls === "BLIND" ? `0 0 8px ${col}` : "none",
                    }}>{job.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {jobType && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>
                        {String(jobType).toUpperCase().slice(0, 12)}
                      </span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Knowledge articles */}
                      {job.matchedArticles.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◉ KNOWLEDGE ({job.matchedArticles.length})
                          </div>
                          {job.matchedArticles.slice(0, 3).map((a, j) => (
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
                      {/* Contacts */}
                      {job.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◈ CONTACTS ({job.matchedContacts.length})
                          </div>
                          {job.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(c.role || c.org || "contact").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || c.full_name || "contact"}
                                {c.org ? ` · ${c.org}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Ops alerts */}
                      {job.matchedAlerts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚠ OPS ALERTS ({job.matchedAlerts.length})
                          </div>
                          {job.matchedAlerts.slice(0, 3).map((al, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(al.severity || al.type || "alert").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {al._label || al.name || al.title || al.message || "alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Investigations */}
                      {job.matchedInvestigations.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ INVESTIGATIONS ({job.matchedInvestigations.length})
                          </div>
                          {job.matchedInvestigations.slice(0, 3).map((inv, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>
                                {(inv.status || inv.type || "open").toUpperCase().slice(0, 8)}
                              </span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {inv._label || inv.name || inv.title || "investigation"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {job.cls === "BLIND" &&
                        job.matchedArticles.length === 0 &&
                        job.matchedContacts.length === 0 &&
                        job.matchedAlerts.length === 0 &&
                        job.matchedInvestigations.length === 0 && (
                        <div style={{ fontSize: 8, color: AMBER, padding: "4px 6px" }}>
                          ⚠ Blind swarm job — no knowledge grounding, no contact, no ops alert, no investigation.
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
            padding: "8px 14px", borderTop: `1px solid ${AMBER}18`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 8, color: DIM, flex: 1 }}>
              SWARM×KNOWLEDGE×CONTACT×ALERTS×INVST — 5-source
            </span>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: assessing ? `${AMBER}33` : `${AMBER}22`,
                border: `1px solid ${AMBER}66`, borderRadius: 6,
                color: AMBER, cursor: assessing ? "default" : "pointer",
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
        @keyframes swkcia_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes swkcia_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${AMBER}44; }
          50% { box-shadow: 0 0 36px ${AMBER}bb; }
        }
        @keyframes swkcia_pulse_card {
          0%,100% { border-color: ${AMBER}55; }
          50% { border-color: ${AMBER}bb; }
        }
      `}</style>
    </>
  );
}
