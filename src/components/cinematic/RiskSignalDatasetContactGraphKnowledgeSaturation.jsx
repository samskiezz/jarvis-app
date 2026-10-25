/**
 * F179 RiskSignal × Dataset × Contact × Graph × Knowledge
 * Intelligence Saturation Foundation — ◈ RDCGK
 *
 * Fetches: /entities/RiskSignal + /v1/datasets + /entities/Contact
 *          + /v1/graph/centrality + /knowledge/
 * Classifies each risk signal across 4 tiers by cross-source keyword overlap:
 *   FORTIFIED — matched 4-5 sources
 *   TRACKED   — matched 2-3 sources
 *   PARTIAL   — matched 1 source
 *   EXPOSED   — zero matches (threat signals with no dataset backing, no contact
 *               owner, no graph trace, no knowledge article — full blind spots)
 * Red pulse on EXPOSED count.
 * ASSESS → /v1/jarvis/agent/chat + /v1/voice/tts
 */

import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CYAN  = "#29E7FF";
const GREEN = "#00FF88";
const AMBER = "#FFB347";
const RED   = "#FF3B6B";

const CLS_COLOR = { FORTIFIED: GREEN, TRACKED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { FORTIFIED: 4, TRACKED: 3, PARTIAL: 2, EXPOSED: 1 };

const RDCGK_RE = /\b(rdcgk|risk.saturation|threat.saturation|risk.dataset.contact|risk.graph.knowledge|threat.foundation|exposed.risk|blind.threat|risk.blind.spot|threat.intelligence.saturation|risk.coverage.foundation|risk.knowledge.gap|threat.coverage.foundation)\b/i;

export function isRdcgkQuery(q) { return RDCGK_RE.test(q || ""); }

export function buildRdcgkScript(rows) {
  const total     = rows.length;
  const fortified = rows.filter(r => r.cls === "FORTIFIED").length;
  const exposed   = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Risk Signal Intelligence Saturation Foundation: ${total} threat signal${total !== 1 ? "s" : ""} assessed across dataset, contact, graph, and knowledge sources. ` +
    `${fortified} fully fortified (4-5 sources grounded). ` +
    (exposed > 0
      ? `${exposed} EXPOSED — no dataset backing, no contact owner, no graph trace, no knowledge article. These are full intelligence blind spots requiring immediate saturation.`
      : "No exposed threat signals detected. All risks have intelligence coverage.")
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
  if (sourceCount >= 4) return "FORTIFIED";
  if (sourceCount >= 2) return "TRACKED";
  if (sourceCount >= 1) return "PARTIAL";
  return "EXPOSED";
}

async function loadData() {
  const [risksRaw, datasetsRaw, contactsRaw, graphRaw, knowledgeRaw] = await Promise.all([
    fetcher("/entities/RiskSignal"),
    fetcher("/v1/datasets"),
    fetcher("/entities/Contact"),
    fetcher("/v1/graph/centrality"),
    fetcher("/knowledge/"),
  ]);

  const risks    = normalizeArray(risksRaw,    ["name","title","signal_name","label","id"]);
  const datasets = normalizeArray(datasetsRaw, ["name","title","dataset_name","label","id"]);
  const contacts = normalizeArray(contactsRaw, ["name","full_name","display_name","label","id"]);
  const graph    = normalizeArray(
    Array.isArray(graphRaw?.nodes) ? graphRaw.nodes : (Array.isArray(graphRaw) ? graphRaw : []),
    ["name","label","entity","id"]
  );
  const knowledge = normalizeArray(knowledgeRaw, ["title","name","article_title","subject","id"]);

  return risks.map(risk => {
    const rToks = tokens(
      risk._label + " " +
      (risk.description || "") + " " +
      (risk.severity || "") + " " +
      (risk.type || "") + " " +
      (risk.category || "") + " " +
      (risk.tags || "").toString()
    );

    const matchedDatasets  = datasets.filter(d => overlaps(rToks, d._label + " " + (d.description || "") + " " + (d.tags || "").toString()));
    const matchedContacts  = contacts.filter(c => overlaps(rToks, c._label + " " + (c.role || "") + " " + (c.organization || "") + " " + (c.org || "")));
    const matchedGraph     = graph.filter(g => overlaps(rToks, g._label + " " + (g.type || "") + " " + (g.centrality || "")));
    const matchedKnowledge = knowledge.filter(k => overlaps(rToks, k._label + " " + (k.category || "") + " " + (k.tags || "").toString() + " " + (k.summary || "")));

    const sourceCount =
      (matchedDatasets.length  > 0 ? 1 : 0) +
      (matchedContacts.length  > 0 ? 1 : 0) +
      (matchedGraph.length     > 0 ? 1 : 0) +
      (matchedKnowledge.length > 0 ? 1 : 0);

    return {
      ...risk,
      cls: classify(sourceCount),
      matchedDatasets,
      matchedContacts,
      matchedGraph,
      matchedKnowledge,
    };
  }).sort((a, b) => CLS_ORDER[b.cls] - CLS_ORDER[a.cls]);
}

const FILTERS = ["ALL", "FORTIFIED", "TRACKED", "PARTIAL", "EXPOSED"];
const LEFT_PX = 148600;
const Z_IDX   = 276;

export default function RiskSignalDatasetContactGraphKnowledgeSaturation() {
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
    window.addEventListener("jarvis:rdcgk-toggle", handler);
    return () => window.removeEventListener("jarvis:rdcgk-toggle", handler);
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
      const script = buildRdcgkScript(rows);
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
    FORTIFIED: rows.filter(r => r.cls === "FORTIFIED").length,
    TRACKED:   rows.filter(r => r.cls === "TRACKED").length,
    PARTIAL:   rows.filter(r => r.cls === "PARTIAL").length,
    EXPOSED:   rows.filter(r => r.cls === "EXPOSED").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r._label || "").toLowerCase().includes(s) ||
             (r.severity || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s);
    }
    return true;
  });

  const hasExposed = counts.EXPOSED > 0;

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
          border: `1px solid ${hasExposed ? RED : CYAN}55`,
          borderRadius: 7,
          color: hasExposed ? RED : CYAN,
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
          animation: hasExposed ? "rdcgk_pulse_btn 2s ease-in-out infinite" : "none",
        }}
      >
        {hasExposed && (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: RED,
            animation: "rdcgk_dot_pulse 1.2s ease-in-out infinite",
          }} />
        )}
        ◈ RDCGK
        {hasExposed && (
          <span style={{
            background: `${RED}33`,
            border: `1px solid ${RED}66`,
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 8,
          }}>
            {counts.EXPOSED} EXPOSED
          </span>
        )}
      </button>

      <style>{`
        @keyframes rdcgk_pulse_btn {
          0%,100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%      { box-shadow: 0 0 12px 3px ${RED}44; }
        }
        @keyframes rdcgk_dot_pulse {
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
          border: `1px solid ${hasExposed ? RED : CYAN}33`,
          borderRadius: 14,
          boxShadow: `0 0 40px ${hasExposed ? RED : CYAN}22`,
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
              ◈ RISK SIGNAL INTELLIGENCE SATURATION FOUNDATION
            </span>
            <span style={{ color: "#566878", fontSize: 9 }}>
              RISKSIGNAL × DATASET × CONTACT × GRAPH × KNOWLEDGE
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
              placeholder="search risk signals…"
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
                LOADING RISK INTELLIGENCE SATURATION DATA…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#566878", fontSize: 10, padding: "20px", textAlign: "center" }}>
                No risk signals match current filter.
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
                      minWidth: 82,
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
                    {row.severity && (
                      <span style={{
                        background: `${row.severity === "critical" ? RED : AMBER}18`,
                        border: `1px solid ${row.severity === "critical" ? RED : AMBER}44`,
                        borderRadius: 3,
                        color: row.severity === "critical" ? RED : AMBER,
                        fontSize: 8,
                        padding: "1px 5px",
                        fontWeight: 600,
                      }}>
                        {row.severity}
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
                            {c.role && <Badge color={AMBER}>{c.role}</Badge>}
                            {(c.organization || c.org) && (
                              <Badge color={CYAN}>{c.organization || c.org}</Badge>
                            )}
                          </>
                        )}
                      />
                      <DetailSection
                        label="GRAPH NODES" color={AMBER}
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
                      <DetailSection
                        label="KNOWLEDGE" color={RED}
                        items={row.matchedKnowledge}
                        renderItem={k => (
                          <>
                            <span style={{ color: "#c8d8e8", fontSize: 9 }}>{k._label}</span>
                            {k.category && <Badge color={AMBER}>{k.category}</Badge>}
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
              {rows.length} risk signals · auto-refresh 90s
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
