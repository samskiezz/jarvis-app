/**
 * F177 Scenario × Skill × Contact × Knowledge × Graph × SwarmJob
 * Strategic Mission Readiness Web — ◈ SMRWEB
 *
 * Fetches: /v1/scenario/list + /v1/aip/skill + /entities/Contact
 *          + /knowledge/ + /v1/graph/centrality + /entities/SwarmJob
 * Classifies each scenario across 4 tiers by cross-source keyword overlap:
 *   READY     — matched 5-6 sources
 *   ARMED     — matched 3-4 sources
 *   PARTIAL   — matched 1-2 sources
 *   GROUNDED  — zero matches (scenarios with no skill backing, no contact owner,
 *               no knowledge article, no graph trace, no swarm processing —
 *               strategy without foundation)
 * Red pulse on GROUNDED count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { READY: GREEN, ARMED: CYAN, PARTIAL: AMBER, GROUNDED: RED };
const CLS_ORDER = { READY: 4, ARMED: 3, PARTIAL: 2, GROUNDED: 1 };

const SMRWEB_RE = /\b(smrweb|scenario.readiness|strategic.mission.readiness|mission.readiness.web|scenario.skill.contact|scenario.graph.swarm|grounded.scenario|scenario.foundation|strategy.readiness|mission.capability.web|scenario.capability.gap|readiness.web|mission.swarm.readiness|skill.scenario.coverage|scenario.knowledge.gap|scenario.swarm.coverage)\b/i;

export function isSmrwebQuery(q) { return SMRWEB_RE.test(q || ""); }

export function buildSmrwebScript(rows) {
  const total    = rows.length;
  const ready    = rows.filter(r => r.cls === "READY").length;
  const grounded = rows.filter(r => r.cls === "GROUNDED").length;
  return (
    `Strategic Mission Readiness Web: ${total} scenario${total !== 1 ? "s" : ""} assessed across skill, contact, knowledge, graph, and swarm processing sources. ` +
    `${ready} fully ready (5-6 sources grounded). ` +
    (grounded > 0
      ? `${grounded} GROUNDED — no skill backing, no contact owner, no knowledge article, no graph trace, no swarm processing. These are strategy-without-foundation scenarios requiring immediate attention.`
      : "No foundation gaps detected. All scenarios have full strategic mission readiness.")
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
  if (sourceCount >= 5) return "READY";
  if (sourceCount >= 3) return "ARMED";
  if (sourceCount >= 1) return "PARTIAL";
  return "GROUNDED";
}

async function loadData() {
  const [scenariosRaw, skillsRaw, contactsRaw, knowledgeRaw, graphRaw, swarmRaw] = await Promise.all([
    fetcher("/v1/scenario/list"),
    fetcher("/v1/aip/skill"),
    fetcher("/entities/Contact"),
    fetcher("/knowledge/"),
    fetcher("/v1/graph/centrality"),
    fetcher("/entities/SwarmJob"),
  ]);

  const scenarios = normalizeArray(scenariosRaw, ["name","title","scenario_name","label","id"]);
  const skills    = normalizeArray(skillsRaw,    ["name","skill_name","title","id"]);
  const contacts  = normalizeArray(contactsRaw,  ["name","full_name","displayName","email","id"]);
  const knowledge = normalizeArray(knowledgeRaw, ["title","name","subject","article_title","id"]);
  const graph     = normalizeArray(graphRaw,     ["name","label","entity","id"]);
  const swarm     = normalizeArray(swarmRaw,     ["name","job_name","title","task","id"]);

  return scenarios.map(scenario => {
    const sToks = tokens(
      scenario._label + " " +
      (scenario.description || "") + " " +
      (scenario.status || "") + " " +
      (scenario.type || "") + " " +
      (scenario.tags || "").toString()
    );

    const matchedSkills    = skills.filter(s  => overlaps(sToks, s._label + " " + (s.description || "") + " " + (s.category || "") + " " + (s.score || "")));
    const matchedContacts  = contacts.filter(c => overlaps(sToks, c._label + " " + (c.role || "") + " " + (c.organization || c.org || "")));
    const matchedKnowledge = knowledge.filter(k => overlaps(sToks, k._label + " " + (k.category || "") + " " + (k.tags || "").toString()));
    const matchedGraph     = graph.filter(g    => overlaps(sToks, g._label + " " + (g.type || "") + " " + (g.centrality || "")));
    const matchedSwarm     = swarm.filter(sw   => overlaps(sToks, sw._label + " " + (sw.type || "") + " " + (sw.description || "") + " " + (sw.status || "")));

    const sourceCount =
      (matchedSkills.length    > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0) +
      (matchedKnowledge.length > 0 ? 1 : 0) +
      (matchedGraph.length     > 0 ? 1 : 0) +
      (matchedSwarm.length     > 0 ? 1 : 0);

    return {
      ...scenario,
      cls: classify(sourceCount),
      matchedSkills,
      matchedContacts,
      matchedKnowledge,
      matchedGraph,
      matchedSwarm,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "READY", "ARMED", "PARTIAL", "GROUNDED"];
const LEFT_PX = 147480;
const Z_IDX   = 274;

export default function ScenarioSkillContactKnowledgeGraphSwarmReadiness() {
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
    window.addEventListener("jarvis:smrweb-toggle", handler);
    return () => window.removeEventListener("jarvis:smrweb-toggle", handler);
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
      const script = buildSmrwebScript(rows);
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
    READY:    rows.filter(r => r.cls === "READY").length,
    ARMED:    rows.filter(r => r.cls === "ARMED").length,
    PARTIAL:  rows.filter(r => r.cls === "PARTIAL").length,
    GROUNDED: rows.filter(r => r.cls === "GROUNDED").length,
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

  const hasGrounded = counts.GROUNDED > 0;

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
          border: `1px solid ${hasGrounded ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasGrounded ? RED : CYAN,
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
          animation: hasGrounded ? "smrweb_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasGrounded && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "smrweb_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ SMRWEB
        {hasGrounded && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.GROUNDED} GROUNDED
          </span>
        )}
      </button>

      <style>{`
        @keyframes smrweb_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes smrweb_dot_pulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.3; }
        }
      `}</style>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(1100px, 96vw)",
          maxHeight: "78vh",
          zIndex: Z_IDX + 1,
          background: "linear-gradient(145deg,#040d1aee,#071426ee)",
          border: `1px solid ${hasGrounded ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasGrounded ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: `1px solid #ffffff11`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ STRATEGIC MISSION READINESS WEB
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              SCENARIO × SKILL × CONTACT × KNOWLEDGE × GRAPH × SWARM
            </span>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {Object.entries(counts).map(([k, v]) => (
                <span key={k} style={{
                  background: `${CLS_COLOR[k]}15`,
                  border: `1px solid ${CLS_COLOR[k]}44`,
                  borderRadius: 5,
                  color: CLS_COLOR[k],
                  fontSize: 9,
                  padding: "2px 8px",
                  fontWeight: 700,
                }}>
                  {k} {v}
                </span>
              ))}
              <button
                onClick={assess}
                disabled={assessing || rows.length === 0}
                style={{
                  background: assessing ? "#1a2a3a" : `${GREEN}22`,
                  border: `1px solid ${GREEN}55`,
                  borderRadius: 6,
                  color: GREEN,
                  cursor: assessing ? "not-allowed" : "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "4px 10px",
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "ASSESSING…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: `1px solid #ffffff22`,
                  borderRadius: 5,
                  color: "#566878",
                  cursor: "pointer",
                  fontSize: 10,
                  padding: "3px 8px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Filters + search */}
          <div style={{
            padding: "8px 18px",
            borderBottom: "1px solid #ffffff0a",
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${f === "ALL" ? CYAN : CLS_COLOR[f]}22` : "none",
                  border: `1px solid ${filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#ffffff22"}`,
                  borderRadius: 5,
                  color: filter === f ? (f === "ALL" ? CYAN : CLS_COLOR[f]) : "#566878",
                  cursor: "pointer",
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "3px 9px",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {f}{f !== "ALL" ? ` (${counts[f] || 0})` : ""}
              </button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                marginLeft: "auto",
                background: "#071426",
                border: "1px solid #ffffff22",
                borderRadius: 5,
                color: CYAN,
                fontSize: 9,
                padding: "4px 10px",
                fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
                width: 180,
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
            {loading && (
              <div style={{ color: CYAN, fontSize: 10, padding: "20px", textAlign: "center" }}>
                LOADING SCENARIO READINESS DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No scenarios match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{
                    borderBottom: "1px solid #ffffff08",
                    padding: "0 18px",
                  }}
                >
                  {/* Row header */}
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 0",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      minWidth: 80,
                      background: `${clsColor}18`,
                      border: `1px solid ${clsColor}44`,
                      borderRadius: 4,
                      color: clsColor,
                      fontSize: 8,
                      fontWeight: 700,
                      padding: "2px 7px",
                      letterSpacing: 1,
                      textAlign: "center",
                    }}>
                      {row.cls}
                    </span>
                    <span style={{ color: "#c8d8e8", fontSize: 10, flex: 1 }}>
                      {row._label || row.id || "—"}
                    </span>
                    {row.status && (
                      <span style={{ color: "#566878", fontSize: 9 }}>{row.status}</span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {/* Expanded detail */}
                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      {/* Matched skills */}
                      <DetailSection
                        label="SKILLS" color={GREEN}
                        items={row.matchedSkills}
                        renderItem={s => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{s._label}</span>
                            {s.score != null && (
                              <Badge color={GREEN}>{String(s.score).slice(0,6)}</Badge>
                            )}
                            {s.category && <Badge color={CYAN}>{s.category}</Badge>}
                          </>
                        )}
                      />
                      {/* Matched contacts */}
                      <DetailSection
                        label="CONTACTS" color={CYAN}
                        items={row.matchedContacts}
                        renderItem={c => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{c._label}</span>
                            {c.role && <Badge color={AMBER}>{c.role}</Badge>}
                            {(c.organization || c.org) && (
                              <Badge color={CYAN}>{c.organization || c.org}</Badge>
                            )}
                          </>
                        )}
                      />
                      {/* Matched knowledge */}
                      <DetailSection
                        label="KNOWLEDGE" color={AMBER}
                        items={row.matchedKnowledge}
                        renderItem={k => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{k._label}</span>
                            {k.category && <Badge color={AMBER}>{k.category}</Badge>}
                          </>
                        )}
                      />
                      {/* Matched graph nodes */}
                      <DetailSection
                        label="GRAPH NODES" color={CYAN}
                        items={row.matchedGraph}
                        renderItem={g => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{g._label}</span>
                            {g.centrality != null && (
                              <Badge color={GREEN}>{Number(g.centrality).toFixed(3)}</Badge>
                            )}
                            {g.type && <Badge color={CYAN}>{g.type}</Badge>}
                          </>
                        )}
                      />
                      {/* Matched swarm jobs */}
                      <DetailSection
                        label="SWARM JOBS" color={AMBER}
                        items={row.matchedSwarm}
                        renderItem={sw => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{sw._label}</span>
                            {sw.status && <Badge color={sw.status === "running" ? GREEN : AMBER}>{sw.status}</Badge>}
                          </>
                        )}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 18px",
            borderTop: "1px solid #ffffff0a",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}>
            <span style={{ color: "#566878", fontSize: 8 }}>
              {rows.length} scenarios · auto-refresh 90s
            </span>
            {loading && (
              <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>
            )}
            <button
              onClick={() => load(true)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: `1px solid ${CYAN}33`,
                borderRadius: 4,
                color: CYAN,
                cursor: "pointer",
                fontSize: 8,
                padding: "2px 8px",
                fontFamily: "'JetBrains Mono',monospace",
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DetailSection({ label, color, items, renderItem }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div style={{ color, fontSize: 8, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {label} ({items.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.slice(0, 6).map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {renderItem(item)}
          </div>
        ))}
        {items.length > 6 && (
          <span style={{ color: "#566878", fontSize: 8 }}>+{items.length - 6} more</span>
        )}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      background: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 3,
      color,
      fontSize: 8,
      padding: "1px 5px",
      fontWeight: 600,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}
