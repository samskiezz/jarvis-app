/**
 * F153 Report × Brain × Dataset × Ops Alert × Investigation
 * Intelligence Continuity Chain — ◈ RBDOIC
 *
 * Fetches: /v1/reports + /v1/cinematic/brain + /v1/datasets
 *          + /v1/ops/alerts + /v1/investigations
 * Keyword-matches each report against brain nodes, datasets, ops alerts,
 * and investigations to classify:
 *   CONTINUOUS  — matched all 4 operational sources (fully grounded)
 *   ANCHORED    — matched 2–3 sources
 *   PARTIAL     — matched exactly 1 source
 *   DARK        — zero matches (orphaned report with no brain model,
 *                 no dataset, no ops alert, no investigation — intelligence dead-end)
 * Amber pulse on DARK count.
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

const CLS_COLOR = { CONTINUOUS: GREEN, ANCHORED: CYAN, PARTIAL: AMBER, DARK: RED };
const CLS_ORDER = { CONTINUOUS: 4, ANCHORED: 3, PARTIAL: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const RBDOIC_RE = /\b(rbdoic|report.*brain.*dataset|report.*continuity|intelligence.*continuity|report.*ops.*alert.*investigation|report.*dark|dark.*report|orphaned.*report|continuity.*chain|report.*grounding|report.*intelligence.*chain|report.*brain.*ops)\b/i;

export function isRbdoicQuery(q) { return RBDOIC_RE.test(q || ""); }

export function buildRbdoicScript(rows) {
  const total      = rows.length;
  const continuous = rows.filter(r => r.cls === "CONTINUOUS").length;
  const dark       = rows.filter(r => r.cls === "DARK").length;
  return (
    `Intelligence Continuity Chain: ${total} report${total !== 1 ? "s" : ""} assessed across brain model, dataset, ops alert, and investigation sources. ` +
    `${continuous} fully continuous (brain model, dataset, ops alert, and investigation all confirmed). ` +
    (dark > 0
      ? `${dark} dark — no brain model, no dataset, no ops alert, no investigation. Orphaned intelligence dead-ends with zero operational continuity requiring immediate remediation.`
      : "No dark reports detected.")
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
  const arr = Array.isArray(raw)                ? raw
    : Array.isArray(raw?.data)                  ? raw.data
    : Array.isArray(raw?.items)                 ? raw.items
    : Array.isArray(raw?.results)               ? raw.results
    : Array.isArray(raw?.nodes)                 ? raw.nodes
    : Array.isArray(raw?.articles)              ? raw.articles
    : Array.isArray(raw?.reports)               ? raw.reports
    : Array.isArray(raw?.skills)                ? raw.skills
    : Array.isArray(raw?.datasets)              ? raw.datasets
    : Array.isArray(raw?.scenarios)             ? raw.scenarios
    : Array.isArray(raw?.alerts)                ? raw.alerts
    : Array.isArray(raw?.investigations)        ? raw.investigations
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

function classifyReport(report, brainNodes, datasets, opsAlerts, investigations) {
  const rText = [
    report._label, report.name, report.title, report.type, report.category,
    report.summary, report.description, report.tags, report.subject,
  ].filter(Boolean).join(" ");
  const aToks = tokens(rText);

  const matchedBrain = brainNodes.filter(n =>
    overlaps(aToks, [n._label, n.name, n.label, n.type, n.category, n.description].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(aToks, [d._label, d.name, d.title, d.type, d.category, d.description, d.tags].join(" "))
  );
  const matchedAlerts = opsAlerts.filter(a =>
    overlaps(aToks, [a._label, a.name, a.title, a.type, a.category, a.description, a.severity, a.source].join(" "))
  );
  const matchedInvs = investigations.filter(inv =>
    overlaps(aToks, [inv._label, inv.name, inv.title, inv.type, inv.status, inv.description].join(" "))
  );

  const sources = [
    matchedBrain.length > 0,
    matchedDatasets.length > 0,
    matchedAlerts.length > 0,
    matchedInvs.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "CONTINUOUS";
  else if (sources >= 2) cls = "ANCHORED";
  else if (sources === 1) cls = "PARTIAL";
  else cls = "DARK";

  return { report, cls, matchedBrain, matchedDatasets, matchedAlerts, matchedInvs };
}

export default function ReportBrainDatasetOpsInvestigationContinuity() {
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
      const [reportsRaw, brainRaw, datasetsRaw, opsRaw, invsRaw] = await Promise.all([
        fetcher("/v1/reports"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/v1/datasets"),
        fetcher("/v1/ops/alerts"),
        fetcher("/v1/investigations"),
      ]);

      const reports = normalizeArray(reportsRaw,  ["title", "name", "type", "category", "summary"]);
      const brain   = normalizeArray(brainRaw,    ["name", "label", "type", "category"]);
      const datasets= normalizeArray(datasetsRaw, ["name", "title", "type", "category"]);
      const alerts  = normalizeArray(opsRaw,      ["name", "title", "type", "severity", "category"]);
      const invs    = normalizeArray(invsRaw,     ["name", "title", "type", "status", "subject"]);

      const built = reports.map(r => classifyReport(r, brain, datasets, alerts, invs));
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
    window.addEventListener("jarvis:rbdoic-toggle", toggle);
    return () => window.removeEventListener("jarvis:rbdoic-toggle", toggle);
  }, []);

  const dark    = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.report?._label || r.report?.title || r.report?.name || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildRbdoicScript(rows);
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
        title="Report × Brain × Dataset × Ops Alert × Investigation — Intelligence Continuity Chain"
        style={{
          position: "fixed", left: 134040, bottom: 8, zIndex: 250,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${dark > 0 ? AMBER : CYAN}`,
          color: dark > 0 ? AMBER : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: dark > 0 ? `0 0 6px ${AMBER}` : "none",
          animation: dark > 0 ? "pulse-amber 1.4s infinite" : "none",
        }}
      >
        ◈ RBDOIC{dark > 0 ? ` — ${dark} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9250,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ RBDOIC — INTELLIGENCE CONTINUITY CHAIN
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Report × Brain × Dataset × Ops Alert × Investigation (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} reports ·{" "}
          {dark > 0
            ? <span style={{ color: AMBER, fontWeight: 700 }}>{dark} DARK</span>
            : <span style={{ color: GREEN }}>0 dark</span>}
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
        {["ALL", "CONTINUOUS", "ANCHORED", "PARTIAL", "DARK"].map(f => (
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
          placeholder="search report…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No reports match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.report._label || row.report.title || row.report.id || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const dateStr = row.report.date || row.report.created_at || row.report.updated_at;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 96 }}>
                  {row.cls}
                </span>
                {dateStr && (
                  <span style={{ color: DIM, fontSize: 9, fontWeight: 700, minWidth: 72,
                    background: `${DIM}18`, borderRadius: 2, padding: "1px 4px" }}>
                    {String(dateStr).slice(0, 10)}
                  </span>
                )}
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.report._label || row.report.title || row.report.name || "(report)"}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  B:{row.matchedBrain.length} D:{row.matchedDatasets.length} A:{row.matchedAlerts.length} I:{row.matchedInvs.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedBrain.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Brain Nodes ({row.matchedBrain.length}):</span>
                      {row.matchedBrain.slice(0, 6).map((n, ni) => {
                        const score = n.centrality ?? n.score ?? n.weight;
                        return (
                          <span key={ni} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {n._label || n.name || n.label}
                            {score != null && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {Number(score).toFixed(3)}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedDatasets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Datasets ({row.matchedDatasets.length}):</span>
                      {row.matchedDatasets.slice(0, 6).map((d, di) => {
                        const rows_ = d.row_count ?? d.rows ?? d.count;
                        return (
                          <span key={di} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {d._label || d.name || d.title}
                            {rows_ != null && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {rows_}r
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Ops Alerts ({row.matchedAlerts.length}):</span>
                      {row.matchedAlerts.slice(0, 6).map((a, ai) => {
                        const sev = a.severity || a.level || a.type;
                        return (
                          <span key={ai} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {a._label || a.title || a.name}
                            {sev && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {sev}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedInvs.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: RED, fontWeight: 700 }}>Investigations ({row.matchedInvs.length}):</span>
                      {row.matchedInvs.slice(0, 6).map((inv, ii) => {
                        const st = inv.status || inv.type;
                        return (
                          <span key={ii} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {inv._label || inv.title || inv.name}
                            {st && (
                              <span style={{ color: RED, background: `${RED}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {st}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedBrain.length === 0 && row.matchedDatasets.length === 0 &&
                   row.matchedAlerts.length === 0 && row.matchedInvs.length === 0 && (
                    <span style={{ color: DIM }}>No matching sources — dark report (intelligence dead-end).</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
