/**
 * F155 Investment × Brain × Contact × Report × Ops Alert
 * Wealth Intelligence Authority Chain — ◈ IBCRAL
 *
 * Fetches: /entities/Investment + /v1/cinematic/brain + /entities/Contact
 *          + /v1/reports + /v1/ops/alerts
 * Keyword-matches each investment against brain nodes, contacts, reports,
 * and ops alerts to classify:
 *   COMMANDING — matched all 4 operational sources (fully grounded)
 *   ACTIVE     — matched 3 sources
 *   PARTIAL    — matched 1-2 sources
 *   EXPOSED    — zero matches (wealth blind spot — investment with no brain
 *                model, no contact owner, no filed report, no ops alert)
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

const CLS_COLOR = { COMMANDING: GREEN, ACTIVE: CYAN, PARTIAL: AMBER, EXPOSED: RED };
const CLS_ORDER = { COMMANDING: 4, ACTIVE: 3, PARTIAL: 2, EXPOSED: 1 };

const REFRESH_MS = 90_000;

const IBCRAL_RE = /\b(ibcral|investment.*brain|investment.*authority|wealth.*intelligence.*authority|wealth.*chain|investment.*brain.*contact|investment.*report.*alert|investment.*ops.*alert|investment.*command|wealth.*authority.*chain|investment.*coverage.*chain|investment.*operational.*authority|wealth.*exposed|exposed.*investment|investment.*blind|blind.*investment|wealth.*intelligence.*chain|investment.*monitoring.*chain)\b/i;

export function isIbcralQuery(q) { return IBCRAL_RE.test(q || ""); }

export function buildIbcralScript(rows) {
  const total      = rows.length;
  const commanding = rows.filter(r => r.cls === "COMMANDING").length;
  const exposed    = rows.filter(r => r.cls === "EXPOSED").length;
  return (
    `Wealth Intelligence Authority Chain: ${total} investment${total !== 1 ? "s" : ""} assessed across brain model grounding, contact ownership, filed reports, and ops alert coverage. ` +
    `${commanding} commanding (brain model, contact owner, reports, and ops alerts all confirmed). ` +
    (exposed > 0
      ? `${exposed} exposed — no brain model, no contact owner, no filed report, no ops alert. Wealth blind spots with zero operational authority requiring immediate remediation.`
      : "No exposed investments detected.")
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
    : Array.isArray(raw?.contacts)              ? raw.contacts
    : Array.isArray(raw?.profiles)              ? raw.profiles
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

function classifyInvestment(inv, brainNodes, contacts, reports, alerts) {
  const iText = [
    inv._label, inv.name, inv.title, inv.type, inv.category,
    inv.description, inv.tags, inv.sector, inv.asset_class,
  ].filter(Boolean).join(" ");
  const aToks = tokens(iText);

  const matchedBrain = brainNodes.filter(n =>
    overlaps(aToks, [n._label, n.name, n.label, n.type, n.category, n.description].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(aToks, [c._label, c.name, c.role, c.org, c.organisation, c.title, c.category, c.tags].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(aToks, [r._label, r.name, r.title, r.category, r.description, r.tags, r.summary].join(" "))
  );
  const matchedAlerts = alerts.filter(a =>
    overlaps(aToks, [a._label, a.name, a.title, a.type, a.description, a.category, a.message, a.source].join(" "))
  );

  const sources = [
    matchedBrain.length > 0,
    matchedContacts.length > 0,
    matchedReports.length > 0,
    matchedAlerts.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4)      cls = "COMMANDING";
  else if (sources === 3) cls = "ACTIVE";
  else if (sources >= 1)  cls = "PARTIAL";
  else                    cls = "EXPOSED";

  return { inv, cls, matchedBrain, matchedContacts, matchedReports, matchedAlerts };
}

export default function InvestmentBrainContactReportAlertChain() {
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
      const [investmentsRaw, brainRaw, contactsRaw, reportsRaw, alertsRaw] = await Promise.all([
        fetcher("/entities/Investment"),
        fetcher("/v1/cinematic/brain"),
        fetcher("/entities/Contact"),
        fetcher("/v1/reports"),
        fetcher("/v1/ops/alerts"),
      ]);

      const investments = normalizeArray(investmentsRaw, ["name", "title", "type", "category"]);
      const brainNodes  = normalizeArray(brainRaw,       ["label", "name", "type", "category"]);
      const contacts    = normalizeArray(contactsRaw,    ["name", "title", "role", "org"]);
      const reports     = normalizeArray(reportsRaw,     ["title", "name", "category", "summary"]);
      const alerts      = normalizeArray(alertsRaw,      ["title", "name", "message", "type"]);

      const built = investments.map(inv =>
        classifyInvestment(inv, brainNodes, contacts, reports, alerts)
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
    window.addEventListener("jarvis:ibcral-toggle", toggle);
    return () => window.removeEventListener("jarvis:ibcral-toggle", toggle);
  }, []);

  const exposed  = rows.filter(r => r.cls === "EXPOSED").length;
  const visible  = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.inv?._label || r.inv?.name || r.inv?.title || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildIbcralScript(rows);
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
        title="Investment × Brain × Contact × Report × Ops Alert — Wealth Intelligence Authority Chain"
        style={{
          position: "fixed", left: 135160, bottom: 8, zIndex: 252,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${exposed > 0 ? RED : CYAN}`,
          color: exposed > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: exposed > 0 ? `0 0 6px ${RED}` : "none",
          animation: exposed > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ IBCRAL{exposed > 0 ? ` — ${exposed} EXPOSED` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9252,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ IBCRAL — WEALTH INTELLIGENCE AUTHORITY CHAIN
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          Investment × Brain × Contact × Report × Ops Alert (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} investments ·{" "}
          {exposed > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{exposed} EXPOSED</span>
            : <span style={{ color: GREEN }}>0 exposed</span>}
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
        {["ALL", "COMMANDING", "ACTIVE", "PARTIAL", "EXPOSED"].map(f => (
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
          placeholder="search investment…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No investments match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.inv._label || row.inv.name || row.inv.title || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const typeVal = row.inv.type || row.inv.asset_class;
          const valStr  = row.inv.value != null ? String(row.inv.value) : (row.inv.amount != null ? String(row.inv.amount) : null);
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
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.inv._label || row.inv.name || row.inv.title || "(investment)"}
                </span>
                {typeVal && (
                  <span style={{ color: CYAN, background: `${CYAN}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{typeVal}</span>
                )}
                {valStr && (
                  <span style={{ color: AMBER, background: `${AMBER}18`, borderRadius: 2,
                    padding: "0 4px", fontSize: 9 }}>{valStr}</span>
                )}
                <span style={{ fontSize: 10, color: DIM }}>
                  B:{row.matchedBrain.length} C:{row.matchedContacts.length} R:{row.matchedReports.length} A:{row.matchedAlerts.length}
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
                        const score = n.centrality != null ? n.centrality.toFixed(3) : (n.score != null ? n.score.toFixed(3) : null);
                        return (
                          <span key={ni} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {n._label || n.name || n.label}
                            {score && (
                              <span style={{ color: CYAN, background: `${CYAN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {score}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: GREEN, fontWeight: 700 }}>Contacts ({row.matchedContacts.length}):</span>
                      {row.matchedContacts.slice(0, 6).map((c, ci) => {
                        const roleOrg = [c.role, c.org || c.organisation].filter(Boolean).join(" · ");
                        return (
                          <span key={ci} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {c._label || c.name}
                            {roleOrg && (
                              <span style={{ color: GREEN, background: `${GREEN}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {roleOrg}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedReports.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: AMBER, fontWeight: 700 }}>Reports ({row.matchedReports.length}):</span>
                      {row.matchedReports.slice(0, 6).map((r, ri) => {
                        const date = r.date || r.created_at || r.timestamp;
                        return (
                          <span key={ri} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {r._label || r.title || r.name}
                            {date && (
                              <span style={{ color: AMBER, background: `${AMBER}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {String(date).slice(0, 10)}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedAlerts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: RED, fontWeight: 700 }}>Ops Alerts ({row.matchedAlerts.length}):</span>
                      {row.matchedAlerts.slice(0, 6).map((a, ai) => {
                        const sev = a.severity || a.level || a.priority;
                        return (
                          <span key={ai} style={{ marginLeft: 6, color: "#c8e8f8" }}>
                            {a._label || a.title || a.name || a.message}
                            {sev && (
                              <span style={{ color: RED, background: `${RED}18`,
                                borderRadius: 2, padding: "0 3px", marginLeft: 2, fontSize: 9 }}>
                                {sev}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {row.matchedBrain.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedReports.length === 0 && row.matchedAlerts.length === 0 && (
                    <span style={{ color: DIM }}>No matching sources — exposed investment (wealth intelligence blind spot).</span>
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
