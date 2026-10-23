/**
 * F149 Ops Alert × Dataset × Graph × Brain × Contact
 * Full Operational Intelligence Fusion — ◈ OAGBCFUS
 *
 * Fetches: /v1/ops/alerts + /v1/datasets + /v1/graph/centrality
 *          + /v1/cinematic/brain + /entities/Contact
 * Keyword-matches each ops alert against datasets, graph nodes, brain nodes,
 * and contacts to classify:
 *   FUSED   — matched all 4 external sources (fully grounded alert)
 *   GROUNDED — matched 2-3 sources
 *   PARTIAL  — matched exactly 1 source
 *   BLIND    — zero matches (ops alerts with no dataset backing, no graph trace,
 *              no brain model, no contact owner — full operational blind spots)
 * Red pulse on BLIND count.
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

const CLS_COLOR = { FUSED: GREEN, GROUNDED: CYAN, PARTIAL: AMBER, BLIND: RED };
const CLS_ORDER = { FUSED: 4, GROUNDED: 3, PARTIAL: 2, BLIND: 1 };

const REFRESH_MS = 90_000;

const OAGBCFUS_RE = /\b(oagbcfus|ops.*alert.*fusion|alert.*dataset.*graph|ops.*brain.*contact|alert.*intelligence.*fusion|operational.*intelligence.*fusion|ops.*fusion|alert.*graph.*brain)\b/i;

export function isOagbcfusQuery(q) { return OAGBCFUS_RE.test(q || ""); }

export function buildOagbcfusScript(rows) {
  const total   = rows.length;
  const fused   = rows.filter(r => r.cls === "FUSED").length;
  const blind   = rows.filter(r => r.cls === "BLIND").length;
  return (
    `Operational Intelligence Fusion: ${total} ops alert${total !== 1 ? "s" : ""} assessed across dataset, graph, brain, and contact sources. ` +
    `${fused} fully fused (dataset, graph, brain, and contact coverage confirmed). ` +
    (blind > 0
      ? `${blind} blind — no dataset backing, no graph trace, no brain model, no contact owner. Full operational intelligence blind spots requiring immediate remediation.`
      : "No blind operational alerts detected.")
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
    : Array.isArray(raw?.skills)           ? raw.skills
    : Array.isArray(raw?.datasets)         ? raw.datasets
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
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

function classifyAlert(alert, datasets, graphNodes, brainNodes, contacts) {
  const alertText = [
    alert._label, alert.name, alert.title, alert.type, alert.category,
    alert.description, alert.message, alert.source, alert.service,
  ].filter(Boolean).join(" ");
  const aToks = tokens(alertText);

  const matchedDatasets = datasets.filter(d =>
    overlaps(aToks, [d._label, d.name, d.title, d.type, d.category, d.description, d.source].join(" "))
  );
  const matchedGraphNodes = graphNodes.filter(g =>
    overlaps(aToks, [g._label, g.name, g.title, g.type, g.label, g.category].join(" "))
  );
  const matchedBrainNodes = brainNodes.filter(b =>
    overlaps(aToks, [b._label, b.name, b.title, b.type, b.label, b.category].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.description].join(" "))
  );

  const sources = [
    matchedDatasets.length > 0,
    matchedGraphNodes.length > 0,
    matchedBrainNodes.length > 0,
    matchedContacts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "FUSED";
  else if (sources >= 2) cls = "GROUNDED";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "BLIND";

  return { alert, cls, matchedDatasets, matchedGraphNodes, matchedBrainNodes, matchedContacts };
}

export default function OpsAlertDatasetGraphBrainContactFusion() {
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
      const [alertsRaw, datasetsRaw, graphRaw, brainRaw, contactsRaw] = await Promise.all([
        fetcher("/v1/ops/alerts"),
        fetcher("/v1/datasets"),
        fetcher("/v1/graph/centrality"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/entities/Contact"),
      ]);

      const alerts     = normalizeArray(alertsRaw,   ["name", "title", "type", "category", "message", "source"]);
      const datasets   = normalizeArray(datasetsRaw, ["name", "title", "type", "category"]);
      const graphNodes = normalizeArray(graphRaw,    ["name", "title", "label", "type", "category"]);
      const brainNodes = normalizeArray(
        Array.isArray(brainRaw?.nodes) ? brainRaw.nodes : (Array.isArray(brainRaw) ? brainRaw : []),
        ["name", "title", "label", "type", "category"]
      );
      const contacts   = normalizeArray(contactsRaw, ["name", "title", "role", "org", "organization"]);

      const built = alerts.map(a => classifyAlert(a, datasets, graphNodes, brainNodes, contacts));
      built.sort((a, b) => (CLS_ORDER[a.cls] || 0) - (CLS_ORDER[b.cls] || 0));
      setRows(built);
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:oagbcfus-toggle", toggle);
    return () => window.removeEventListener("jarvis:oagbcfus-toggle", toggle);
  }, []);

  const blind   = rows.filter(r => r.cls === "BLIND").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.alert?._label || r.alert?.name || r.alert?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildOagbcfusScript(rows);
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.answer || d.message || script;
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text }),
      });
    } catch { /* non-fatal */ }
    finally { setAssessing(false); }
  }, [assessing, rows]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Alert × Dataset × Graph × Brain × Contact — Full Operational Intelligence Fusion"
        style={{
          position: "fixed", left: 131800, bottom: 8, zIndex: 246,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${blind > 0 ? RED : CYAN}`,
          color: blind > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: blind > 0 ? `0 0 6px ${RED}` : "none",
          animation: blind > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ OAGBCFUS{blind > 0 ? ` — ${blind} BLIND` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9246,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ OAGBCFUS — FULL OPERATIONAL INTELLIGENCE FUSION
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Ops Alert × Dataset × Graph × Brain × Contact (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} alerts · {blind > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{blind} BLIND</span>
            : <span style={{ color: GREEN }}>0 blind</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, fontSize: 16, cursor: "pointer" }}>
          ✕
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "FUSED", "GROUNDED", "PARTIAL", "BLIND"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search alert…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No alerts match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.alert._label || row.alert.name || row.alert.id || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const sev   = row.alert.severity || row.alert.level || row.alert.priority;
          const SEV_COLOR = { critical: RED, high: RED, medium: AMBER, low: GREEN, info: DIM };
          const sevCol = SEV_COLOR[(sev || "").toLowerCase()] || DIM;
          return (
            <div key={key} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [key]: !e[key] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 4, cursor: "pointer",
                  background: "rgba(41,231,255,0.03)",
                  border: `1px solid ${col}33`,
                }}
              >
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 72 }}>
                  {row.cls}
                </span>
                {sev && (
                  <span style={{ color: sevCol, fontSize: 9, fontWeight: 700, minWidth: 48,
                    background: `${sevCol}18`, borderRadius: 2, padding: "1px 4px" }}>
                    {sev.toUpperCase()}
                  </span>
                )}
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.alert._label || row.alert.name || row.alert.title || "(alert)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  D:{row.matchedDatasets.length} G:{row.matchedGraphNodes.length} B:{row.matchedBrainNodes.length} C:{row.matchedContacts.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Datasets ({row.matchedDatasets.length}):</span>
                      {row.matchedDatasets.slice(0, 6).map((d, di) => (
                        <span key={di} style={{ marginLeft: 6, color: "#f0d8a8" }}>
                          {d._label || d.name}
                          {d.row_count != null
                            ? <span style={{ color: DIM }}> [{d.row_count} rows]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedGraphNodes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Graph Nodes ({row.matchedGraphNodes.length}):</span>
                      {row.matchedGraphNodes.slice(0, 6).map((g, gi) => (
                        <span key={gi} style={{ marginLeft: 6, color: "#a8d8f0" }}>
                          {g._label || g.name}
                          {g.centrality != null
                            ? <span style={{ color: DIM }}> [c:{(+g.centrality).toFixed(3)}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedBrainNodes.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: "#AA88FF", fontWeight: 700 }}>Brain Nodes ({row.matchedBrainNodes.length}):</span>
                      {row.matchedBrainNodes.slice(0, 6).map((b, bi) => (
                        <span key={bi} style={{ marginLeft: 6, color: "#d0c0ff" }}>
                          {b._label || b.name}
                          {(b.type || b.category)
                            ? <span style={{ color: DIM }}> [{b.type || b.category}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => (
                        <span key={ci} style={{ marginLeft: 6, color: "#a8f0c8" }}>
                          {c._label || c.name}
                          {(c.role || c.org)
                            ? <span style={{ color: DIM }}> [{[c.role, c.org].filter(Boolean).join(" / ")}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedDatasets.length === 0 && row.matchedGraphNodes.length === 0 &&
                   row.matchedBrainNodes.length === 0 && row.matchedContacts.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any source — full operational intelligence blind spot.</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse-red { 0%,100% { box-shadow: 0 0 6px ${RED}; } 50% { box-shadow: 0 0 14px ${RED}, 0 0 4px ${RED}; } }
      `}</style>
    </div>
  );
}
