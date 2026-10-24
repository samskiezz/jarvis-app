/**
 * F166 Dataset × Brain × Ops Alert × RiskSignal × Contact
 * Data Intelligence Posture — ◈ DBORCA
 *
 * Fetches: /v1/datasets + /v1/cinematic/brain + /v1/ops/alerts
 *          + /entities/RiskSignal + /entities/Contact
 * Keyword-matches each dataset against brain nodes, ops alerts,
 * risk signals, and contacts to classify:
 *   DEFENDED   — matched all 4 supporting sources (full intelligence posture)
 *   MONITORED  — matched 2–3 sources
 *   PARTIAL    — matched 1 source
 *   EXPOSED    — zero matches (datasets with no brain model, no ops alert,
 *                no risk signal, no contact owner — full data blind spots)
 * Red pulse on EXPOSED count.
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

const CLS_COLOR = { DEFENDED: GREEN, MONITORED: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { DEFENDED: 4, MONITORED: 3, PARTIAL: 2, EXPOSED: 1 };

const REFRESH_MS = 90_000;

const DBORCA_RE = /\b(dborca|dataset.*brain.*ops|dataset.*risk.*contact|data.*intelligence.*posture|data.*posture|exposed.*dataset|dataset.*exposed|dataset.*blind.?spot|data.*blind|dataset.*coverage|dataset.*defense|defended.*dataset|data.*ops.*alert|dataset.*risk.*signal|dataset.*contact.*owner)\b/i;

export function isDborcaQuery(q) { return DBORCA_RE.test(q || ""); }

export function buildDborcaScript(rows) {
  const total    = rows.length;
  const defended = rows.filter(r => r.cls === "DEFENDED").length;
  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Data Intelligence Posture: ${total} dataset${total !== 1 ? "s" : ""} assessed across brain models, ops alerts, risk signals, and contacts. ` +
    `${defended} fully defended (brain model, ops alert coverage, risk signal, and contact owner all confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no brain model, no ops alert, no risk signal, no contact owner. These datasets are full data blind spots with zero intelligence posture.`
      : "No exposed datasets — all data assets have full intelligence coverage.")
  );
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function overlaps(aToks, bStr) {
  const bToks = new Set(tokens(bStr));
  return aToks.some(t => bToks.has(t));
}

function normalizeArray(raw) {
  return Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : Array.isArray(raw?.datasets)             ? raw.datasets
    : Array.isArray(raw?.nodes)                ? raw.nodes
    : Array.isArray(raw?.brain_nodes)          ? raw.brain_nodes
    : Array.isArray(raw?.alerts)               ? raw.alerts
    : Array.isArray(raw?.risk_signals)         ? raw.risk_signals
    : Array.isArray(raw?.contacts)             ? raw.contacts
    : [];
}

async function fetcher(path) {
  try {
    const r = await fetch(`${apiBase()}${path}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

function classifyDataset(dataset, brainNodes, opsAlerts, riskSignals, contacts) {
  const dText = [
    dataset.name, dataset.title, dataset.description,
    dataset.category, dataset.type, dataset.tags,
    dataset.id, dataset.source,
  ].filter(Boolean).join(" ");
  const aToks = tokens(dText);

  const matchedBrain = brainNodes.filter(b =>
    overlaps(aToks, [b.label, b.id, b.name, b.type, b.category, b.description].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(aToks, [a.title, a.name, a.message, a.description, a.category, a.type, a.severity].join(" "))
  );
  const matchedRisks = riskSignals.filter(r =>
    overlaps(aToks, [r.title, r.name, r.signal, r.description, r.category, r.type, r.severity].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c.name, c.first_name, c.last_name, c.org, c.organisation, c.role, c.tags].join(" "))
  );

  const sources = [
    matchedBrain.length > 0,
    matchedAlerts.length > 0,
    matchedRisks.length > 0,
    matchedContacts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "DEFENDED";
  else if (sources >= 2)  cls = "MONITORED";
  else if (sources === 1) cls = "PARTIAL";
  else                    cls = "EXPOSED";

  return { dataset, cls, matchedBrain, matchedAlerts, matchedRisks, matchedContacts };
}

export default function DatasetBrainOpsRiskContactPosture() {
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
      const [datasetsRaw, brainRaw, alertsRaw, risksRaw, contactsRaw] = await Promise.all([
        fetcher("/v1/datasets"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/ops/alerts"),
        fetcher("/entities/RiskSignal"),
        fetcher("/entities/Contact"),
      ]);

      const datasets    = normalizeArray(datasetsRaw);
      const brainNodes  = normalizeArray(brainRaw?.nodes ?? brainRaw);
      const opsAlerts   = normalizeArray(alertsRaw);
      const riskSignals = normalizeArray(risksRaw);
      const contacts    = normalizeArray(contactsRaw);

      const built = datasets.map(d =>
        classifyDataset(d, brainNodes, opsAlerts, riskSignals, contacts)
      );
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
    window.addEventListener("jarvis:dborca-toggle", toggle);
    return () => window.removeEventListener("jarvis:dborca-toggle", toggle);
  }, []);

  const exposedCount = rows.filter(r => r.cls === "EXPOSED").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.dataset?.name || r.dataset?.title || r.dataset?.id || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildDborcaScript(rows);
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await resp.json();
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
        title="Dataset × Brain × Ops Alert × RiskSignal × Contact — Data Intelligence Posture"
        style={{
          position: "fixed", left: 141320, bottom: 8, zIndex: 263,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${exposedCount > 0 ? RED : CYAN}`,
          color: exposedCount > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: exposedCount > 0 ? `0 0 6px ${RED}` : "none",
          animation: exposedCount > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ DBORCA{exposedCount > 0 ? ` — ${exposedCount} EXPOSED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9263,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ DBORCA — DATA INTELLIGENCE POSTURE
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Dataset × Brain × Ops Alert × RiskSignal × Contact (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} datasets ·{" "}
          {exposedCount > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{exposedCount} EXPOSED</span>
            : <span style={{ color: GREEN }}>0 exposed</span>}
        </span>
        <button onClick={assess} disabled={assessing || rows.length === 0}
          style={{ background: "none", border: `1px solid ${CYAN}`, color: CYAN,
            borderRadius: 3, padding: "2px 10px", fontSize: 11, cursor: "pointer" }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM,
            fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0,
        borderBottom: `1px solid ${CYAN}11` }}>
        {["ALL", "DEFENDED", "MONITORED", "PARTIAL", "EXPOSED"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              background: filter === f ? `${CLS_COLOR[f] || CYAN}22` : "none",
              border: `1px solid ${filter === f ? (CLS_COLOR[f] || CYAN) : DIM}`,
              color: filter === f ? (CLS_COLOR[f] || CYAN) : DIM,
              borderRadius: 3, padding: "2px 8px", fontSize: 10, cursor: "pointer",
            }}>
            {f}{f !== "ALL" ? ` (${rows.filter(r => r.cls === f).length})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 160 }}
        />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RED, fontSize: 11, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: 8 }}>No datasets match current filter.</div>
        )}
        {visible.map((row, i) => {
          const dsLabel = row.dataset?.name || row.dataset?.title || row.dataset?.id || `dataset-${i}`;
          const dsRows  = row.dataset?.row_count ?? row.dataset?.rows ?? row.dataset?.count ?? null;
          const isExp   = expanded[i];
          return (
            <div key={i} style={{ marginBottom: 4 }}>
              <div
                onClick={() => setExpanded(p => ({ ...p, [i]: !p[i] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 8px", borderRadius: 3, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}33`,
                }}
              >
                <span style={{ fontSize: 9, color: CLS_COLOR[row.cls] || CYAN,
                  border: `1px solid ${CLS_COLOR[row.cls] || CYAN}`,
                  borderRadius: 2, padding: "1px 4px", minWidth: 68, textAlign: "center" }}>
                  {row.cls}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: CYAN }}>{dsLabel}</span>
                {dsRows !== null && dsRows !== undefined && (
                  <span style={{ fontSize: 9, color: DIM,
                    border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                    rows:{typeof dsRows === "number" ? dsRows.toLocaleString() : dsRows}
                  </span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  {row.matchedBrain.length}b · {row.matchedAlerts.length}a ·{" "}
                  {row.matchedRisks.length}r · {row.matchedContacts.length}c
                </span>
                <span style={{ fontSize: 10, color: DIM }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 12px 8px 20px", fontSize: 10,
                  borderLeft: `2px solid ${CLS_COLOR[row.cls] || CYAN}44`, marginLeft: 8 }}>

                  {/* Brain nodes */}
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>BRAIN NODES</div>
                      {row.matchedBrain.slice(0, 5).map((b, bi) => (
                        <div key={bi} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{b.label || b.name || b.id || `node-${bi}`}</span>
                          {(b.centrality !== undefined || b.score !== undefined) && (
                            <span style={{ fontSize: 9, color: DIM,
                              border: `1px solid ${DIM}55`, borderRadius: 2, padding: "1px 4px" }}>
                              centrality:{typeof (b.centrality ?? b.score) === "number"
                                ? (b.centrality ?? b.score).toFixed(3)
                                : (b.centrality ?? b.score)}
                            </span>
                          )}
                          {b.type && (
                            <span style={{ fontSize: 9, color: AMBER,
                              border: `1px solid ${AMBER}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {b.type}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ops alerts */}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>OPS ALERTS</div>
                      {row.matchedAlerts.slice(0, 5).map((a, ai) => (
                        <div key={ai} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{a.title || a.name || a.message || `alert-${ai}`}</span>
                          {a.severity && (
                            <span style={{ fontSize: 9,
                              color: a.severity === "critical" ? RED : a.severity === "high" ? AMBER : DIM,
                              border: `1px solid ${a.severity === "critical" ? RED : a.severity === "high" ? AMBER : DIM}55`,
                              borderRadius: 2, padding: "1px 4px" }}>
                              {a.severity}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Risk signals */}
                  {row.matchedRisks.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>RISK SIGNALS</div>
                      {row.matchedRisks.slice(0, 5).map((r, ri) => (
                        <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>{r.title || r.name || r.signal || `risk-${ri}`}</span>
                          {r.severity && (
                            <span style={{ fontSize: 9,
                              color: r.severity === "critical" ? RED : r.severity === "high" ? AMBER : DIM,
                              border: `1px solid ${r.severity === "critical" ? RED : r.severity === "high" ? AMBER : DIM}55`,
                              borderRadius: 2, padding: "1px 4px" }}>
                              {r.severity}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contacts */}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: DIM, marginBottom: 3 }}>CONTACTS</div>
                      {row.matchedContacts.slice(0, 5).map((c, ci) => (
                        <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span style={{ color: CYAN }}>
                            {c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || `contact-${ci}`}
                          </span>
                          {c.role && (
                            <span style={{ fontSize: 9, color: GREEN,
                              border: `1px solid ${GREEN}55`, borderRadius: 2, padding: "1px 4px" }}>
                              {c.role}
                            </span>
                          )}
                          {(c.org || c.organisation) && (
                            <span style={{ fontSize: 9, color: DIM }}>
                              {c.org || c.organisation}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {row.matchedBrain.length === 0 && row.matchedAlerts.length === 0 &&
                   row.matchedRisks.length === 0 && row.matchedContacts.length === 0 && (
                    <div style={{ color: RED, fontStyle: "italic" }}>
                      No brain model, no ops alert, no risk signal, no contact — full data blind spot.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "6px 16px", borderTop: `1px solid ${CYAN}11`,
        fontSize: 10, color: DIM, flexShrink: 0 }}>
        Auto-refresh every 90s · {rows.length} datasets assessed ·{" "}
        DEFENDED:{rows.filter(r => r.cls === "DEFENDED").length} ·{" "}
        MONITORED:{rows.filter(r => r.cls === "MONITORED").length} ·{" "}
        PARTIAL:{rows.filter(r => r.cls === "PARTIAL").length} ·{" "}
        <span style={{ color: exposedCount > 0 ? RED : DIM }}>
          EXPOSED:{exposedCount}
        </span>
      </div>
    </div>
  );
}
