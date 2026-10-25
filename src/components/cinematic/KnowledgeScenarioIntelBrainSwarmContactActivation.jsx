/**
 * F173 Knowledge × Scenario × IntelProfile × Brain × SwarmJob × Contact
 * Full Intelligence Activation Status — ◈ KSPBSC
 *
 * Fetches: /knowledge/ + /v1/scenario/list + /entities/IntelProfile
 *          + /v1/cinematic/brain + /entities/SwarmJob + /entities/Contact
 * Classifies each knowledge article across 4 tiers by cross-source keyword overlap:
 *   ACTIVATED    — matched 5-6 sources
 *   ORCHESTRATED — matched 3-4 sources
 *   PARTIAL      — matched 1-2 sources
 *   DARK         — zero matches (no scenario, no intel profile, no brain model,
 *                   no swarm processing, no contact owner — full intelligence dead-ends)
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

const CLS_COLOR = { ACTIVATED: GREEN, ORCHESTRATED: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { ACTIVATED: 4, ORCHESTRATED: 3, PARTIAL: 2, DARK: 1 };

const KSPBSC_RE = /\b(kspbsc|knowledge.activation|intelligence.activation|knowledge.scenario.intel|knowledge.brain.swarm|knowledge.contact.intel|dark.knowledge|knowledge.dead.end|full.intelligence.activation|knowledge.orchestration|knowledge.swarm.contact|intel.knowledge.activation|knowledge.scenario.brain|knowledge.profile.swarm)\b/i;

export function isKspbscQuery(q) { return KSPBSC_RE.test(q || ""); }

export function buildKspbscScript(rows) {
  const total       = rows.length;
  const activated   = rows.filter(r => r.cls === "ACTIVATED").length;
  const dark        = rows.filter(r => r.cls === "DARK").length;
  return (
    `Full Intelligence Activation Status: ${total} knowledge article${total !== 1 ? "s" : ""} assessed across scenario, intel profile, brain model, swarm job, and contact sources. ` +
    `${activated} fully activated (5-6 sources grounded). ` +
    (dark > 0
      ? `${dark} DARK — no scenario, no intel profile, no brain model, no swarm processing, no contact owner. These are full intelligence dead-ends requiring immediate operational grounding.`
      : "No intelligence dead-ends detected. All knowledge articles have operational grounding.")
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
    : Array.isArray(raw?.articles) ? raw.articles
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
  if (sourceCount >= 5) return "ACTIVATED";
  if (sourceCount >= 3) return "ORCHESTRATED";
  if (sourceCount >= 1) return "PARTIAL";
  return "DARK";
}

async function loadData() {
  const [knowledgeRaw, scenariosRaw, intelRaw, brainRaw, swarmRaw, contactsRaw] = await Promise.all([
    fetcher("/knowledge/"),
    fetcher("/v1/scenario/list"),
    fetcher("/entities/IntelProfile"),
    fetcher("/v1/cinematic/brain"),
    fetcher("/entities/SwarmJob"),
    fetcher("/entities/Contact"),
  ]);

  const articles  = normalizeArray(knowledgeRaw,  ["title","name","summary","id","topic"]);
  const scenarios = normalizeArray(scenariosRaw,  ["name","title","scenario_name","id"]);
  const profiles  = normalizeArray(intelRaw,      ["name","title","subject","id","category"]);
  const brainNodes = normalizeArray(
    Array.isArray(brainRaw?.nodes) ? brainRaw.nodes
      : Array.isArray(brainRaw?.data?.nodes) ? brainRaw.data.nodes
      : brainRaw,
    ["label", "name", "id", "type"]
  );
  const swarmJobs = normalizeArray(swarmRaw,      ["name","title","job_name","id"]);
  const contacts  = normalizeArray(contactsRaw,   ["name","full_name","displayName","email","id"]);

  return articles.map(article => {
    const aToks = tokens(article._label + " " + (article.summary || "") + " " + (article.category || "") + " " + (article.topic || ""));

    const matchedScenarios = scenarios.filter(s => overlaps(aToks, s._label + " " + (s.description || "") + " " + (s.status || "")));
    const matchedProfiles  = profiles.filter(p => overlaps(aToks, p._label + " " + (p.description || "") + " " + (p.category || "")));
    const matchedBrain     = brainNodes.filter(b => overlaps(aToks, b._label + " " + (b.type || "") + " " + (b.description || "")));
    const matchedSwarm     = swarmJobs.filter(j => overlaps(aToks, j._label + " " + (j.description || "") + " " + (j.status || "")));
    const matchedContacts  = contacts.filter(c => overlaps(aToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));

    const sourceCount =
      (matchedScenarios.length > 0 ? 1 : 0) +
      (matchedProfiles.length  > 0 ? 1 : 0) +
      (matchedBrain.length     > 0 ? 1 : 0) +
      (matchedSwarm.length     > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0);

    return {
      ...article,
      cls: classify(sourceCount),
      matchedScenarios,
      matchedProfiles,
      matchedBrain,
      matchedSwarm,
      matchedContacts,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "ACTIVATED", "ORCHESTRATED", "PARTIAL", "DARK"];
const LEFT_PX = 145240;
const Z_IDX   = 270;

export default function KnowledgeScenarioIntelBrainSwarmContactActivation() {
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
    window.addEventListener("jarvis:kspbsc-toggle", handler);
    return () => window.removeEventListener("jarvis:kspbsc-toggle", handler);
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
      const script = buildKspbscScript(rows);
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
    ACTIVATED:    rows.filter(r => r.cls === "ACTIVATED").length,
    ORCHESTRATED: rows.filter(r => r.cls === "ORCHESTRATED").length,
    PARTIAL:      rows.filter(r => r.cls === "PARTIAL").length,
    DARK:         rows.filter(r => r.cls === "DARK").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.category || "").toLowerCase().includes(s) ||
             (r.topic || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasDark = counts.DARK > 0;

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
          border: `1px solid ${hasDark ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasDark ? RED : CYAN,
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
          animation: hasDark ? "kspbsc_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasDark && (
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: RED, display: "inline-block",
            animation: "kspbsc_pulse 1.4s ease-in-out infinite",
          }} />
        )}
        ◈ KSPBSC
        {hasDark && (
          <span style={{
            background: `${RED}33`, color: RED,
            borderRadius: 4, padding: "1px 5px", fontSize: 8,
          }}>{counts.DARK}</span>
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
              ◈ KNOWLEDGE × SCENARIO × INTEL × BRAIN × SWARM × CONTACT
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <span style={{ fontSize: 8, color: DIM }}>
              {rows.length} articles
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
                  animation: cls === "DARK" && cnt > 0 ? "kspbsc_pulse 1.4s ease-in-out infinite" : "none",
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
                {loading ? "Fetching knowledge articles…" : "No articles match."}
              </div>
            )}
            {visible.map((article, i) => {
              const clsColor = CLS_COLOR[article.cls];
              const isExp    = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    marginBottom: 4,
                    background: `${clsColor}09`,
                    border: `1px solid ${clsColor}${article.cls === "DARK" ? "55" : "33"}`,
                    borderRadius: 6,
                    cursor: "pointer",
                    padding: "5px 8px",
                    animation: article.cls === "DARK" ? "kspbsc_pulse_card 2s ease-in-out infinite" : "none",
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
                    }}>{article.cls}</span>
                    <span style={{ fontSize: 9, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {article._label || article.title || article.name || "knowledge article"}
                    </span>
                    {article.category && (
                      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
                        [{article.category}]
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
                      {/* Scenarios */}
                      {article.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ SCENARIOS ({article.matchedScenarios.length})
                          </div>
                          {article.matchedScenarios.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(s.status || s.state || "active").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || s.title || "scenario"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Intel Profiles */}
                      {article.matchedProfiles.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ INTEL PROFILES ({article.matchedProfiles.length})
                          </div>
                          {article.matchedProfiles.slice(0, 3).map((p, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${CYAN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: CYAN, background: `${CYAN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(p.category || p.type || "intel").toUpperCase().slice(0, 8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {p._label || p.name || p.subject || "profile"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Brain nodes */}
                      {article.matchedBrain.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: AMBER + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◎ BRAIN NODES ({article.matchedBrain.length})
                          </div>
                          {article.matchedBrain.slice(0, 3).map((b, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${AMBER}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{typeof b.centrality === "number" ? b.centrality.toFixed(2) : (b.type || "node").slice(0, 4).toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {b._label || b.label || b.name || "node"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Swarm jobs */}
                      {article.matchedSwarm.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⚙ SWARM JOBS ({article.matchedSwarm.length})
                          </div>
                          {article.matchedSwarm.slice(0, 3).map((j, idx) => (
                            <div key={idx} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(j.status || j.state || "run").toUpperCase().slice(0, 7)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {j._label || j.name || j.job_name || "swarm job"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Contacts */}
                      {article.matchedContacts.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: DIM + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ● CONTACTS ({article.matchedContacts.length})
                          </div>
                          {article.matchedContacts.slice(0, 3).map((c, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: "#1a2a3a33", borderRadius: 4, marginBottom: 2,
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
                      {article.cls === "DARK" &&
                        article.matchedScenarios.length === 0 &&
                        article.matchedProfiles.length === 0 &&
                        article.matchedBrain.length === 0 &&
                        article.matchedSwarm.length === 0 &&
                        article.matchedContacts.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Intelligence dead-end — no scenario, intel profile, brain model, swarm job, or contact.
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
              KNOW×SCN×INTEL×BRAIN×SWARM×CONT — 6-source
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
        @keyframes kspbsc_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes kspbsc_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes kspbsc_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
