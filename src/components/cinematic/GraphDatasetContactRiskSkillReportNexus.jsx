/**
 * F181 Graph × Dataset × Contact × RiskSignal × Skill × Report
 * Full Operational Coverage Nexus — ◈ GCDRSR
 *
 * Fetches: /v1/graph/centrality + /v1/datasets + /entities/Contact
 *          + /entities/RiskSignal + /v1/aip/skill + /v1/reports
 * Classifies each graph node by keyword overlap across all 5 external sources:
 *   COVERED — matched 5-6 sources
 *   ACTIVE  — matched 3-4 sources
 *   PARTIAL — matched 1-2 sources
 *   DARK    — zero matches (blind-spot nodes with no dataset, no contact owner,
 *              no risk signal, no skill match, no report)
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

const CLS_COLOR = { COVERED: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { COVERED: 4, ACTIVE: 3, PARTIAL: 2, DARK: 1 };

const GCDRSR_RE = /\b(gcdrsr|graph.coverage.nexus|full.operational.coverage|graph.operational.nexus|graph.full.coverage|blind.graph.node|graph.dark.node|graph.dataset.contact|graph.risk.skill.report|graph.coverage.network|operational.coverage.nexus|graph.blind.spot|graph.operational.blind)\b/i;

export function isGcdrsrQuery(q) { return GCDRSR_RE.test(q || ""); }

export function buildGcdrsrScript(rows) {
  const total   = rows.length;
  const covered = rows.filter(r => r.cls === "COVERED").length;
  const dark    = rows.filter(r => r.cls === "DARK").length;
  return (
    `Graph Full Operational Coverage Nexus: ${total} graph node${total !== 1 ? "s" : ""} assessed across datasets, contacts, risk signals, skills, and reports. ` +
    `${covered} fully covered (5-6 sources). ` +
    (dark > 0
      ? `${dark} DARK — no dataset backing, no contact owner, no risk signal, no skill match, no filed report. These graph nodes are complete operational blind spots requiring immediate grounding.`
      : "No dark graph nodes detected. All nodes have at least one operational grounding source.")
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
  if (sourceCount >= 5) return "COVERED";
  if (sourceCount >= 3) return "ACTIVE";
  if (sourceCount >= 1) return "PARTIAL";
  return "DARK";
}

async function loadData() {
  const [graphRaw, datasetsRaw, contactsRaw, risksRaw, skillsRaw, reportsRaw] = await Promise.all([
    fetcher("/v1/graph/centrality"),
    fetcher("/v1/datasets"),
    fetcher("/entities/Contact"),
    fetcher("/entities/RiskSignal"),
    fetcher("/v1/aip/skill"),
    fetcher("/v1/reports"),
  ]);

  const graph = normalizeArray(
    Array.isArray(graphRaw?.nodes) ? graphRaw.nodes : (Array.isArray(graphRaw) ? graphRaw : []),
    ["name", "label", "entity", "id"]
  );
  const datasets  = normalizeArray(datasetsRaw,  ["name", "title", "dataset_name", "label", "id"]);
  const contacts  = normalizeArray(contactsRaw,  ["name", "full_name", "contact_name", "label", "id"]);
  const risks     = normalizeArray(risksRaw,     ["name", "title", "signal_name", "label", "id"]);
  const skills    = normalizeArray(skillsRaw,    ["name", "skill_name", "title", "label", "id"]);
  const reports   = normalizeArray(reportsRaw,   ["title", "name", "report_title", "subject", "label", "id"]);

  return graph.map(node => {
    const nToks = tokens(
      node._label + " " +
      (node.type || "") + " " +
      (node.entity || "") + " " +
      (node.description || "")
    );

    const matchedDatasets  = datasets.filter(d => overlaps(nToks, d._label + " " + (d.description || "") + " " + (d.type || "") + " " + (d.tags || "").toString()));
    const matchedContacts  = contacts.filter(c => overlaps(nToks, c._label + " " + (c.role || "") + " " + (c.organisation || c.org || "") + " " + (c.email || "")));
    const matchedRisks     = risks.filter(r    => overlaps(nToks, r._label + " " + (r.description || "") + " " + (r.severity || "") + " " + (r.type || "")));
    const matchedSkills    = skills.filter(s   => overlaps(nToks, s._label + " " + (s.description || "") + " " + (s.category || "") + " " + (s.tags || "").toString()));
    const matchedReports   = reports.filter(r  => overlaps(nToks, r._label + " " + (r.summary || "") + " " + (r.category || "") + " " + (r.tags || "").toString()));

    const sourceCount =
      (matchedDatasets.length  > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0) +
      (matchedRisks.length     > 0 ? 1 : 0) +
      (matchedSkills.length    > 0 ? 1 : 0) +
      (matchedReports.length   > 0 ? 1 : 0);

    return {
      ...node,
      cls: classify(sourceCount),
      matchedDatasets,
      matchedContacts,
      matchedRisks,
      matchedSkills,
      matchedReports,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "COVERED", "ACTIVE", "PARTIAL", "DARK"];
const LEFT_PX = 149720;
const Z_IDX   = 278;

export default function GraphDatasetContactRiskSkillReportNexus() {
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
    window.addEventListener("jarvis:gcdrsr-toggle", handler);
    return () => window.removeEventListener("jarvis:gcdrsr-toggle", handler);
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
      const script = buildGcdrsrScript(rows);
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
    COVERED: rows.filter(r => r.cls === "COVERED").length,
    ACTIVE:  rows.filter(r => r.cls === "ACTIVE").length,
    PARTIAL: rows.filter(r => r.cls === "PARTIAL").length,
    DARK:    rows.filter(r => r.cls === "DARK").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.entity || "").toLowerCase().includes(s);
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
          animation: hasDark ? "gcdrsr_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasDark && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "gcdrsr_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ GCDRSR
        {hasDark && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.DARK} DARK
          </span>
        )}
      </button>

      <style>{`
        @keyframes gcdrsr_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes gcdrsr_dot_pulse {
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
          border: `1px solid ${hasDark ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasDark ? RED : CYAN}22`,
          display: "flex",
          flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px 10px",
            borderBottom: "1px solid #ffffff11",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}>
            <span style={{ color: CYAN, fontSize: 11, fontWeight: 800, letterSpacing: 2 }}>
              ◈ GRAPH FULL OPERATIONAL COVERAGE NEXUS
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              GRAPH × DATASET × CONTACT × RISK × SKILL × REPORT
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
                  border: "1px solid #ffffff22",
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
              placeholder="search graph nodes…"
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
                LOADING GRAPH COVERAGE NEXUS DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No graph nodes match current filter.
              </div>
            )}
            {!loading && visible.map((row, i) => {
              const isExp = expanded === i;
              const clsColor = CLS_COLOR[row.cls];
              return (
                <div
                  key={i}
                  style={{ borderBottom: "1px solid #ffffff08", padding: "0 18px" }}
                >
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
                      minWidth: 68,
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
                    {row.centrality != null && (
                      <span style={{
                        background: `${GREEN}18`,
                        border: `1px solid ${GREEN}44`,
                        borderRadius: 3,
                        color: GREEN,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {Number(row.centrality).toFixed(3)}
                      </span>
                    )}
                    {row.type && (
                      <span style={{
                        background: `${CYAN}18`,
                        border: `1px solid ${CYAN}44`,
                        borderRadius: 3,
                        color: CYAN,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.type}
                      </span>
                    )}
                    <span style={{ color: "#2a3a4a", fontSize: 9, marginLeft: 4 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "0 0 12px 12px",
                      borderLeft: `2px solid ${clsColor}33`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}>
                      <DetailSection
                        label="DATASETS" color={CYAN}
                        items={row.matchedDatasets}
                        renderItem={d => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{d._label}</span>
                            {d.row_count != null && (
                              <Badge color={CYAN}>{d.row_count} rows</Badge>
                            )}
                            {d.type && <Badge color={AMBER}>{d.type}</Badge>}
                          </>
                        )}
                      />
                      <DetailSection
                        label="CONTACTS" color={GREEN}
                        items={row.matchedContacts}
                        renderItem={c => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{c._label}</span>
                            {c.role && <Badge color={GREEN}>{c.role}</Badge>}
                            {(c.organisation || c.org) && (
                              <Badge color={CYAN}>{c.organisation || c.org}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="RISK SIGNALS" color={RED}
                        items={row.matchedRisks}
                        renderItem={r => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{r._label}</span>
                            {r.severity && (
                              <Badge color={r.severity === "critical" ? RED : AMBER}>{r.severity}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="SKILLS" color={AMBER}
                        items={row.matchedSkills}
                        renderItem={s => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{s._label}</span>
                            {s.score != null && (
                              <Badge color={s.score >= 0.7 ? GREEN : AMBER}>{Math.round(s.score * 100)}%</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="REPORTS" color={GREEN}
                        items={row.matchedReports}
                        renderItem={r => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{r._label}</span>
                            {(r.date || r.created_at) && (
                              <Badge color={CYAN}>{(r.date || r.created_at || "").slice(0, 10)}</Badge>
                            )}
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
              {rows.length} graph nodes · auto-refresh 90s
            </span>
            {loading && <span style={{ color: CYAN, fontSize: 8 }}>LOADING…</span>}
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
