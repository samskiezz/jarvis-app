/**
 * F143 Contact × Investment × SwarmJob × Brain × Ops Alert
 * Operational Wealth Command Monitor — ◈ CIBOC
 *
 * Fetches: /entities/Contact + /entities/Investment + /entities/SwarmJob
 *          + /v1/cinematic/brain + /v1/ops/alerts
 * Classifies each contact across 4 tiers based on cross-source keyword overlap:
 *   COMMANDING — matched all 4 external sources (investment link, swarm automation, brain model, ops monitoring)
 *   FUNDED     — matched 2-3 sources
 *   PROCESSING — matched exactly 1 source
 *   GHOST      — zero matches (contacts with no investment link, no swarm automation, no brain grounding, no ops alert)
 * Red pulse on GHOST count.
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

const CLS_COLOR = { COMMANDING: GREEN, FUNDED: CYAN, PROCESSING: AMBER, GHOST: RED };
const CLS_ORDER = { COMMANDING: 4, FUNDED: 3, PROCESSING: 2, GHOST: 1 };

const REFRESH_MS = 90_000;

const CIBOC_RE = /\b(ciboc|contact.*investment.*swarm|contact.*wealth.*command|operational.*wealth|wealth.*command|ghost.*contact|contact.*ghost|contact.*brain.*ops|contact.*ops.*alert.*swarm|contact.*investment.*brain|operational.*contact|commanding.*contact)\b/i;

export function isCibocQuery(q) { return CIBOC_RE.test(q || ""); }

export function buildCibocScript(rows) {
  const total      = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const ghost      = rows.filter(r => r.cls === "GHOST").length;
  return (
    `Operational Wealth Command Monitor: ${total} contact${total !== 1 ? "s" : ""} assessed. ` +
    `${commanding} commanding (investment link, swarm automation, brain model, and ops alert monitoring confirmed). ` +
    (ghost > 0
      ? `${ghost} ghost — no investment link, no swarm automation, no brain grounding, no ops alert. Zero operational authority.`
      : "No ghost contacts detected.")
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
    : Array.isArray(raw?.alerts)           ? raw.alerts
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

function classifyContact(contact, investments, jobs, brainNodes, alerts) {
  const contactText = [
    contact.name, contact.title, contact.role, contact.organisation,
    contact.org, contact.category, contact.type, contact.department,
    contact.email, contact.tags,
  ].filter(Boolean).join(" ");
  const cToks = tokens(contactText);

  const matchedInvestments = investments.filter(inv =>
    overlaps(cToks, [inv._label, inv.name, inv.title, inv.type, inv.category, inv.description, inv.owner].join(" "))
  );
  const matchedJobs = jobs.filter(j =>
    overlaps(cToks, [j._label, j.name, j.title, j.type, j.status, j.description, j.owner, j.assignee].join(" "))
  );
  const matchedBrainNodes = brainNodes.filter(n =>
    overlaps(cToks, [n._label, n.label, n.name, n.title, n.type, n.description, n.id].join(" "))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(cToks, [a._label, a.name, a.title, a.type, a.category, a.message, a.source, a.assignee].join(" "))
  );

  const sources = [
    matchedInvestments.length > 0,
    matchedJobs.length > 0,
    matchedBrainNodes.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "COMMANDING";
  else if (sources >= 2) cls = "FUNDED";
  else if (sources === 1) cls = "PROCESSING";
  else cls = "GHOST";

  return { contact, cls, matchedInvestments, matchedJobs, matchedBrainNodes, matchedAlerts };
}

export default function ContactInvestmentSwarmBrainOpsMonitor() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contactsRaw, investmentsRaw, jobsRaw, brainRaw, alertsRaw] = await Promise.all([
        fetcher("/entities/Contact"),
        fetcher("/entities/Investment"),
        fetcher("/entities/SwarmJob"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/ops/alerts"),
      ]);

      const contacts    = normalizeArray(contactsRaw,    ["name", "title", "role", "organisation", "org"]);
      const investments = normalizeArray(investmentsRaw, ["name", "title", "type", "category", "description"]);
      const jobs        = normalizeArray(jobsRaw,        ["name", "title", "type", "status", "description"]);
      const brainNodes  = normalizeArray(brainRaw,       ["label", "name", "title", "type", "id"]);
      const alerts      = normalizeArray(alertsRaw,      ["name", "title", "message", "type", "source", "category"]);

      const built = contacts.map(c => classifyContact(c, investments, jobs, brainNodes, alerts));
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
    window.addEventListener("jarvis:ciboc-toggle", handler);
    return () => window.removeEventListener("jarvis:ciboc-toggle", handler);
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
      const script = buildCibocScript(rows);
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

  const ghostCount = rows.filter(r => r.cls === "GHOST").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = [r.contact.name, r.contact.title, r.contact.role, r.contact.organisation].filter(Boolean).join(" ").toLowerCase();
      return label.includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const btnPulse = open && ghostCount > 0;

  return (
    <>
      {/* ◈ CIBOC toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact × Investment × SwarmJob × Brain × Ops Alert — Operational Wealth Command Monitor"
        style={{
          position: "fixed",
          bottom: 8,
          left: 128440,
          zIndex: 240,
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
          animation: btnPulse ? "ciboc_pulse_btn 1.4s ease-in-out infinite" : "none",
        }}
      >
        {ghostCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: RED,
            animation: "ciboc_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ CIBOC
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
          zIndex: 9241,
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
              ◈ OPERATIONAL WEALTH COMMAND MONITOR
            </span>
            {ghostCount > 0 && (
              <span style={{
                background: RED + "33",
                border: `1px solid ${RED}`,
                borderRadius: 4,
                color: RED,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 700,
                animation: "ciboc_pulse 1.4s ease-in-out infinite",
              }}>
                {ghostCount} GHOST
              </span>
            )}
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              Contact × Investment × SwarmJob × Brain × OpsAlert
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
            {["ALL", "COMMANDING", "FUNDED", "PROCESSING", "GHOST"].map(f => (
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
              placeholder="search contacts…"
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
                width: 130,
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
            {loading && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>Loading contacts…</div>
            )}
            {error && (
              <div style={{ padding: 10, color: RED }}>{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>No contacts match.</div>
            )}
            {!loading && visible.map((row, idx) => {
              const key = `contact-${row.contact.id || row.contact.name || idx}`;
              const isExp = !!expanded[key];
              const clsColor = CLS_COLOR[row.cls] || CYAN;
              const contactLabel = row.contact.name || row.contact.title || row.contact.email || `Contact ${idx + 1}`;
              const roleOrg = [row.contact.role, row.contact.organisation || row.contact.org].filter(Boolean).join(" · ");

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

                    <span style={{ flex: 1, color: CYAN, fontSize: 10 }}>{contactLabel}</span>

                    {roleOrg && (
                      <span style={{ fontSize: 9, color: DIM, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {roleOrg}
                      </span>
                    )}

                    {/* Source badges */}
                    {row.matchedInvestments.length > 0 && (
                      <span style={{
                        background: GREEN + "22", border: `1px solid ${GREEN}55`,
                        borderRadius: 3, color: GREEN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>I:{row.matchedInvestments.length}</span>
                    )}
                    {row.matchedJobs.length > 0 && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>S:{row.matchedJobs.length}</span>
                    )}
                    {row.matchedBrainNodes.length > 0 && (
                      <span style={{
                        background: AMBER + "22", border: `1px solid ${AMBER}55`,
                        borderRadius: 3, color: AMBER,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>B:{row.matchedBrainNodes.length}</span>
                    )}
                    {row.matchedAlerts.length > 0 && (
                      <span style={{
                        background: RED + "22", border: `1px solid ${RED}55`,
                        borderRadius: 3, color: RED,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>A:{row.matchedAlerts.length}</span>
                    )}

                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "4px 12px 10px 24px",
                      borderTop: `1px solid ${RED}11`,
                    }}>
                      {roleOrg && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 6 }}>{roleOrg}</div>
                      )}

                      {row.matchedInvestments.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GREEN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>INVESTMENTS</div>
                          {row.matchedInvestments.slice(0, 4).map((inv, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: GREEN + "22", border: `1px solid ${GREEN}55`,
                                borderRadius: 3, color: GREEN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{inv.type || inv.category || "INV"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {inv._label || inv.name || inv.title || "Investment"}
                                {inv.value ? ` · ${inv.value}` : ""}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedJobs.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CYAN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>SWARM JOBS</div>
                          {row.matchedJobs.slice(0, 4).map((j, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: CYAN + "22", border: `1px solid ${CYAN}55`,
                                borderRadius: 3, color: CYAN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{j.status || j.type || "JOB"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {j._label || j.name || j.title || "Swarm Job"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedBrainNodes.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AMBER, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>BRAIN NODES</div>
                          {row.matchedBrainNodes.slice(0, 4).map((n, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: AMBER + "22", border: `1px solid ${AMBER}55`,
                                borderRadius: 3, color: AMBER,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{typeof n.centrality === "number" ? n.centrality.toFixed(3) : n.type || "NODE"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {n._label || n.label || n.name || n.id || "Node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedAlerts.length > 0 && (
                        <div style={{ marginBottom: 2 }}>
                          <div style={{ color: RED, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>OPS ALERTS</div>
                          {row.matchedAlerts.slice(0, 4).map((a, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: RED + "22", border: `1px solid ${RED}55`,
                                borderRadius: 3, color: RED,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{a.severity || a.level || "ALERT"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {a._label || a.name || a.type || "Alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedInvestments.length === 0 && row.matchedJobs.length === 0 &&
                        row.matchedBrainNodes.length === 0 && row.matchedAlerts.length === 0 && (
                        <div style={{ color: RED, fontSize: 9, fontStyle: "italic" }}>
                          No investment link, swarm automation, brain model, or ops alert — contact is a ghost.
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
              Contact × Investment × SwarmJob × Brain × OpsAlert
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
        @keyframes ciboc_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes ciboc_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
