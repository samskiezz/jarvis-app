/**
 * F146 Graph × IntelProfile × Scenario × Contact × Ops Alert
 * Strategic Intelligence Command Network — ◈ GISCNET
 *
 * Fetches: /v1/graph/centrality + /entities/IntelProfile + /v1/scenario/list
 *          + /entities/Contact + /v1/ops/alerts
 * Classifies each graph node across 4 tiers based on cross-source keyword overlap:
 *   COMMANDING — matched all 4 external sources (intel profile, scenario, contact, ops alert)
 *   ACTIVE     — matched 2-3 sources
 *   MONITORED  — matched exactly 1 source
 *   DARK       — zero matches (blind-spot nodes with no intel profile, scenario, contact, or ops alert)
 * Red pulse on DARK count.
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, MONITORED: AMBER, DARK: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, MONITORED: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const GISCNET_RE = /\b(giscnet|graph.*intel.*scenario.*contact|graph.*command.*network|strategic.*intelligence.*command|intel.*command.*network|graph.*ops.*command|dark.*node|node.*dark|strategic.*command.*intel|graph.*intelligence.*command)\b/i;

export function isGiscnetQuery(q) { return GISCNET_RE.test(q || ""); }

export function buildGiscnetScript(rows) {
  const total      = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const dark       = rows.filter(r => r.cls === "DARK").length;
  return (
    `Strategic Intelligence Command Network: ${total} graph node${total !== 1 ? "s" : ""} assessed. ` +
    `${commanding} commanding (intel profile, scenario, contact, and ops alert coverage confirmed). ` +
    (dark > 0
      ? `${dark} dark — no intel profile, no scenario, no contact, no ops alert. Full strategic blind spots.`
      : "No dark nodes detected.")
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

function classifyNode(node, intelProfiles, scenarios, contacts, opsAlerts) {
  const nodeText = [
    node.label, node.name, node.title, node.type, node.description, node.id,
  ].filter(Boolean).join(" ");
  const nToks = tokens(nodeText);

  const matchedProfiles = intelProfiles.filter(p =>
    overlaps(nToks, [p._label, p.name, p.title, p.type, p.category, p.description, p.source, p.alias].join(" "))
  );
  const matchedScenarios = scenarios.filter(s =>
    overlaps(nToks, [s._label, s.name, s.title, s.type, s.category, s.description, s.status].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(nToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.email, c.type].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(nToks, [a._label, a.name, a.title, a.type, a.category, a.description, a.severity, a.message].join(" "))
  );

  const sources = [
    matchedProfiles.length > 0,
    matchedScenarios.length > 0,
    matchedContacts.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "COMMANDING";
  else if (sources >= 2) cls = "ACTIVE";
  else if (sources === 1) cls = "MONITORED";
  else cls = "DARK";

  return { node, cls, matchedProfiles, matchedScenarios, matchedContacts, matchedAlerts };
}

export default function GraphIntelProfileScenarioContactOpsCommand() {
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
      const [graphRaw, profilesRaw, scenariosRaw, contactsRaw, alertsRaw] = await Promise.all([
        fetcher("/v1/graph/centrality"),
        fetcher("/entities/IntelProfile"),
        fetcher("/v1/scenario/list"),
        fetcher("/entities/Contact"),
        fetcher("/v1/ops/alerts"),
      ]);

      const graphNodes     = normalizeArray(graphRaw,    ["label", "name", "title", "type", "id"]);
      const intelProfiles  = normalizeArray(profilesRaw, ["name", "title", "type", "category", "alias"]);
      const scenarios      = normalizeArray(scenariosRaw,["name", "title", "type", "category"]);
      const contacts       = normalizeArray(contactsRaw, ["name", "title", "role", "org", "organization"]);
      const opsAlerts      = normalizeArray(alertsRaw,   ["name", "title", "type", "category", "message"]);

      const built = graphNodes.map(n => classifyNode(n, intelProfiles, scenarios, contacts, opsAlerts));
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
    window.addEventListener("jarvis:giscnet-toggle", handler);
    return () => window.removeEventListener("jarvis:giscnet-toggle", handler);
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
      const script = buildGiscnetScript(rows);
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

  const darkCount = rows.filter(r => r.cls === "DARK").length;

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const label = [r.node.label, r.node.name, r.node.title, r.node.type].filter(Boolean).join(" ").toLowerCase();
      return label.includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const btnPulse = open && darkCount > 0;

  return (
    <>
      {/* ◈ GISCNET toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Graph × IntelProfile × Scenario × Contact × Ops Alert — Strategic Intelligence Command Network"
        style={{
          position: "fixed",
          bottom: 8,
          left: 130120,
          zIndex: 243,
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
          animation: btnPulse ? "giscnet_pulse_btn 1.4s ease-in-out infinite" : "none",
        }}
      >
        {darkCount > 0 && (
          <span style={{
            display: "inline-block", marginRight: 5,
            width: 7, height: 7, borderRadius: "50%",
            background: RED,
            animation: "giscnet_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ GISCNET
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
          zIndex: 9244,
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
              ◈ STRATEGIC INTELLIGENCE COMMAND NETWORK
            </span>
            {darkCount > 0 && (
              <span style={{
                background: RED + "33",
                border: `1px solid ${RED}`,
                borderRadius: 4,
                color: RED,
                padding: "1px 7px",
                fontSize: 9,
                fontWeight: 700,
                animation: "giscnet_pulse 1.4s ease-in-out infinite",
              }}>
                {darkCount} DARK
              </span>
            )}
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              Graph × IntelProfile × Scenario × Contact × Ops Alert
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
            {["ALL", "COMMANDING", "ACTIVE", "MONITORED", "DARK"].map(f => (
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
              placeholder="search graph nodes…"
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
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>Loading graph nodes…</div>
            )}
            {error && (
              <div style={{ padding: 10, color: RED }}>{error}</div>
            )}
            {!loading && !error && visible.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: DIM }}>No graph nodes match.</div>
            )}
            {!loading && visible.map((row, idx) => {
              const key = `giscnet-${row.node.id || row.node.label || row.node.name || idx}`;
              const isExp = !!expanded[key];
              const clsColor = CLS_COLOR[row.cls] || CYAN;
              const nodeLabel = row.node.label || row.node.name || row.node.title || `Node ${idx + 1}`;
              const nodeType = row.node.type || row.node.kind || "";
              const score = typeof row.node.score === "number" || typeof row.node.centrality === "number"
                ? (row.node.score ?? row.node.centrality).toFixed(3)
                : null;

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

                    <span style={{ flex: 1, color: CYAN, fontSize: 10 }}>{nodeLabel}</span>

                    {nodeType && (
                      <span style={{ fontSize: 9, color: DIM, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {nodeType}
                      </span>
                    )}
                    {score !== null && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>⊕{score}</span>
                    )}

                    {row.matchedProfiles.length > 0 && (
                      <span style={{
                        background: GREEN + "22", border: `1px solid ${GREEN}55`,
                        borderRadius: 3, color: GREEN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>I:{row.matchedProfiles.length}</span>
                    )}
                    {row.matchedScenarios.length > 0 && (
                      <span style={{
                        background: CYAN + "22", border: `1px solid ${CYAN}55`,
                        borderRadius: 3, color: CYAN,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>S:{row.matchedScenarios.length}</span>
                    )}
                    {row.matchedContacts.length > 0 && (
                      <span style={{
                        background: AMBER + "22", border: `1px solid ${AMBER}55`,
                        borderRadius: 3, color: AMBER,
                        padding: "1px 5px", fontSize: 8, fontWeight: 700,
                      }}>C:{row.matchedContacts.length}</span>
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
                      {nodeType && (
                        <div style={{ color: DIM, fontSize: 9, marginBottom: 6 }}>{nodeType}</div>
                      )}

                      {row.matchedProfiles.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GREEN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>INTEL PROFILES</div>
                          {row.matchedProfiles.slice(0, 4).map((p, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: GREEN + "22", border: `1px solid ${GREEN}55`,
                                borderRadius: 3, color: GREEN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{p.category || p.type || "INTEL"}</span>
                              <span style={{ color: CYAN, fontSize: 9 }}>
                                {p._label || p.name || p.title || p.alias || "Profile"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedScenarios.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: CYAN, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS</div>
                          {row.matchedScenarios.slice(0, 4).map((s, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: CYAN + "22", border: `1px solid ${CYAN}55`,
                                borderRadius: 3, color: CYAN,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{s.status || s.type || "SCN"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {s._label || s.name || s.title || "Scenario"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedContacts.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: AMBER, fontSize: 8, letterSpacing: 1, marginBottom: 3 }}>CONTACTS</div>
                          {row.matchedContacts.slice(0, 4).map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                              <span style={{
                                background: AMBER + "22", border: `1px solid ${AMBER}55`,
                                borderRadius: 3, color: AMBER,
                                padding: "0 5px", fontSize: 8, fontWeight: 700,
                              }}>{c.role || c.type || "CONTACT"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {c._label || c.name || c.title || "Contact"}
                                {(c.org || c.organization) ? ` · ${c.org || c.organization}` : ""}
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
                              }}>{a.severity || a.type || "ALERT"}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>
                                {a._label || a.name || a.title || a.message || "Alert"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedProfiles.length === 0 && row.matchedScenarios.length === 0 &&
                        row.matchedContacts.length === 0 && row.matchedAlerts.length === 0 && (
                        <div style={{ color: RED, fontSize: 9, fontStyle: "italic" }}>
                          No intel profile, scenario, contact, or ops alert — graph node is fully dark.
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
              Graph × IntelProfile × Scenario × Contact × Ops Alert
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
        @keyframes giscnet_pulse {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        @keyframes giscnet_pulse_btn {
          0%,100% { box-shadow:0 0 20px ${RED}88; } 50% { box-shadow:0 0 40px ${RED}cc; }
        }
      `}</style>
    </>
  );
}
