/**
 * F136 Brain × Scenario × Dataset × Contact × Skill
 * Operational Readiness Foundation — ◈ BSDCS
 *
 * Fetches: /v1/cinematic/brain + /v1/scenario/list + /v1/datasets
 *          + /entities/Contact + /v1/aip/skill
 * Classifies each brain node across 4 tiers based on cross-source keyword overlap:
 *   OPERATIONAL — matched all 4 external sources (fully grounded node)
 *   CAPABLE     — matched 2-3 sources
 *   PARTIAL     — matched exactly 1 source
 *   DARK        — zero matches (blind-spot node: no scenario, no dataset, no contact, no skill)
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

const CLS_COLOR = { OPERATIONAL: GREEN, CAPABLE: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { OPERATIONAL: 4, CAPABLE: 3, PARTIAL: 2, DARK: 1 };

const BSDCS_RE = /\b(bsdcs|brain.scenario|brain.dataset|brain.contact|brain.skill|brain.readiness|brain.foundation|brain.operational|operational.readiness|brain.grounding|model.readiness|brain.coverage|node.readiness|node.foundation|node.grounding|brain.blind)\b/i;

export function isBsdcsQuery(q) { return BSDCS_RE.test(q || ""); }

export function buildBsdcsScript(rows) {
  const total       = rows.length;
  const dark        = rows.filter(r => r.cls === "DARK").length;
  const operational = rows.filter(r => r.cls === "OPERATIONAL").length;
  return (
    `Brain Operational Readiness Foundation: ${total} brain node${total !== 1 ? "s" : ""} assessed. ` +
    `${operational} fully operational (all 4 sources grounded). ` +
    (dark > 0
      ? `${dark} dark — zero scenario, dataset, contact, or skill grounding. Blind spots require immediate attention.`
      : "No ungrounded blind-spot nodes detected.")
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

function classifyNode(node, scenarios, datasets, contacts, skills) {
  const toks = tokens(
    [node._label, node.label || "", node.type || "", node.category || ""].join(" ")
  );

  const matchedScenarios = scenarios.filter(s =>
    overlaps(toks, [s._label, s.name, s.type, s.category].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(toks, [d._label, d.name, d.category, d.source].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(toks, [c._label, c.name, c.role, c.organization, c.org].join(" "))
  );
  const matchedSkills = skills.filter(sk =>
    overlaps(toks, [sk._label, sk.name, sk.category, sk.skill_type].join(" "))
  );

  const matchCount = [matchedScenarios, matchedDatasets, matchedContacts, matchedSkills]
    .filter(a => a.length > 0).length;
  const cls =
    matchCount >= 4 ? "OPERATIONAL" :
    matchCount >= 2 ? "CAPABLE"     :
    matchCount === 1 ? "PARTIAL"    :
    "DARK";

  return { cls, matchedScenarios, matchedDatasets, matchedContacts, matchedSkills };
}

export default function BrainScenarioDatasetContactSkillFoundation() {
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
      const [brainRaw, scenRaw, dsRaw, contRaw, skillRaw] = await Promise.all([
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/scenario/list"),
        fetcher("/v1/datasets"),
        fetcher("/entities/Contact"),
        fetcher("/v1/aip/skill"),
      ]);

      const nodes    = normalizeArray(brainRaw?.nodes ? brainRaw : brainRaw, ["label", "name", "id"]);
      const scenarios = normalizeArray(scenRaw, ["name", "title", "scenario_name"]);
      const datasets  = normalizeArray(dsRaw,   ["name", "title", "dataset_name"]);
      const contacts  = normalizeArray(contRaw, ["name", "full_name", "display_name"]);
      const skills    = normalizeArray(skillRaw,["name", "title", "skill_name"]);

      const classified = nodes.map(n => ({
        ...n,
        ...classifyNode(n, scenarios, datasets, contacts, skills),
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
    window.addEventListener("jarvis:bsdcs-toggle", h);
    return () => window.removeEventListener("jarvis:bsdcs-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    try {
      const script = buildBsdcsScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `BSDCS ASSESS: ${script}` }),
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
  const counts = { ALL: rows.length, OPERATIONAL: 0, CAPABLE: 0, PARTIAL: 0, DARK: 0 };
  rows.forEach(r => { counts[r.cls] = (counts[r.cls] || 0) + 1; });

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (r._label || r.label || "").toLowerCase().includes(s) || r.cls.toLowerCase().includes(s);
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Brain × Scenario × Dataset × Contact × Skill — Operational Readiness Foundation"
        style={{
          position: "fixed", left: 124520, bottom: 8, zIndex: 233,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${darkCount > 0 ? RED : "#334455"}88`,
          borderRadius: 8, color: open ? "#fff" : RED,
          cursor: "pointer", padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${RED}${open || darkCount > 0 ? "88" : "22"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
          animation: darkCount > 0 && !open ? "bsdcs_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        BSDCS
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
          position: "fixed", left: 18, bottom: 72, zIndex: 233,
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
              animation: loading || darkCount > 0 ? "bsdcs_pulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: RED, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              BRAIN OPERATIONAL READINESS FOUNDATION
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
                { label: "NODES",       val: counts.ALL,         col: CYAN  },
                { label: "OPERATIONAL", val: counts.OPERATIONAL, col: GREEN },
                { label: "CAPABLE",     val: counts.CAPABLE,     col: CYAN  },
                { label: "PARTIAL",     val: counts.PARTIAL,     col: AMBER },
                { label: "DARK",        val: counts.DARK,        col: RED   },
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
            {["ALL", "OPERATIONAL", "CAPABLE", "PARTIAL", "DARK"].map(cls => {
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
                {rows.length === 0 ? "No brain node data." : `No ${filter} nodes.`}
              </div>
            )}
            {visible.map((node, i) => {
              const col    = CLS_COLOR[node.cls] || CYAN;
              const name   = node._label || node.label || node.name || `Node #${i + 1}`;
              const nodeType = node.type || node.category || "";
              const score  = node.centrality_score != null ? Number(node.centrality_score).toFixed(3) : null;
              const isExp  = (expanded[i] || false);
              return (
                <div key={node.id || i} style={{
                  margin: "5px 10px",
                  background: `${col}${node.cls === "DARK" ? "10" : "07"}`,
                  border: `1px solid ${col}${node.cls === "DARK" ? "55" : "28"}`,
                  borderRadius: 8, padding: "8px 11px",
                  animation: node.cls === "DARK" ? "bsdcs_pulse_card 2.4s ease-in-out infinite" : "none",
                  cursor: "pointer",
                }} onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{
                      fontSize: 8, fontWeight: 900, letterSpacing: 1, color: col,
                      background: `${col}22`, padding: "2px 6px", borderRadius: 4, flexShrink: 0,
                      textShadow: node.cls === "DARK" ? `0 0 8px ${col}` : "none",
                    }}>{node.cls}</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700 }}>
                      {name}
                    </span>
                    {nodeType && (
                      <span style={{ fontSize: 8, color: col + "99", letterSpacing: 0.5 }}>{nodeType}</span>
                    )}
                    {score != null && (
                      <span style={{
                        fontSize: 8, color: CYAN, background: `${CYAN}18`,
                        padding: "1px 5px", borderRadius: 4,
                      }}>⬡ {score}</span>
                    )}
                    <span style={{ color: DIM, fontSize: 10, marginLeft: 4 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {/* Scenarios */}
                      {node.matchedScenarios.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: GREEN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ▶ SCENARIOS ({node.matchedScenarios.length})
                          </div>
                          {node.matchedScenarios.slice(0, 3).map((s, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${GREEN}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: GREEN, background: `${GREEN}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{(s.status || "scenario").toUpperCase()}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {s._label || s.name || "scenario"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Datasets */}
                      {node.matchedDatasets.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: CYAN + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ⬡ DATASETS ({node.matchedDatasets.length})
                          </div>
                          {node.matchedDatasets.slice(0, 3).map((d, j) => (
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
                              <span style={{
                                fontSize: 7, color: AMBER, background: `${AMBER}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0, maxWidth: 60,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>{(c.role || c.organization || c.org || "contact").toUpperCase().slice(0,12)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {c._label || c.name || "contact"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Skills */}
                      {node.matchedSkills.length > 0 && (
                        <div>
                          <div style={{ fontSize: 7, color: RED + "cc", letterSpacing: 1, marginBottom: 2 }}>
                            ◈ SKILLS ({node.matchedSkills.length})
                          </div>
                          {node.matchedSkills.slice(0, 3).map((sk, j) => (
                            <div key={j} style={{
                              display: "flex", alignItems: "center", gap: 5,
                              padding: "2px 6px", background: `${RED}0d`, borderRadius: 4, marginBottom: 2,
                            }}>
                              <span style={{
                                fontSize: 7, color: RED, background: `${RED}22`,
                                padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                              }}>{sk.score != null ? Number(sk.score).toFixed(2) : (sk.category || "skill").toUpperCase().slice(0,8)}</span>
                              <span style={{ fontSize: 8, color: "#DCEBF5", flex: 1 }}>
                                {sk._label || sk.name || "skill"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {node.cls === "DARK" &&
                        node.matchedScenarios.length === 0 &&
                        node.matchedDatasets.length === 0 &&
                        node.matchedContacts.length === 0 &&
                        node.matchedSkills.length === 0 && (
                        <div style={{ fontSize: 8, color: RED, padding: "4px 6px" }}>
                          ⚠ Blind spot — no scenario, dataset, contact or skill grounding.
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
              BRAIN×SCEN×DATA×CONT×SKILL — 5-source
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
        @keyframes bsdcs_pulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
        @keyframes bsdcs_pulse_btn {
          0%,100% { box-shadow: 0 0 20px ${RED}44; }
          50% { box-shadow: 0 0 36px ${RED}bb; }
        }
        @keyframes bsdcs_pulse_card {
          0%,100% { border-color: ${RED}55; }
          50% { border-color: ${RED}bb; }
        }
      `}</style>
    </>
  );
}
