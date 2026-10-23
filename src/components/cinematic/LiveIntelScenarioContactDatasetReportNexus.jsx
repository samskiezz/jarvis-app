/**
 * F148 LiveIntel × Scenario × Contact × Dataset × Report
 * Live Threat Response Intelligence Nexus — ◈ LTRINEX
 *
 * Fetches: /functions/getLiveIntel + /v1/scenario/list + /entities/Contact
 *          + /v1/datasets + /v1/reports
 * Groups live events by category (earthquake region / crypto symbol / FX pair)
 * and cross-references against scenarios, contacts, datasets, and reports:
 *   RESPONDING — matched all 4 external sources
 *   STAGED     — matched 2-3 sources
 *   STAFFED    — matched exactly 1 source
 *   DARK       — zero matches (live events with no scenario, no contact, no dataset, no report)
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

const CLS_COLOR = { RESPONDING: GREEN, STAGED: CYAN, STAFFED: AMBER, DARK: RED };
const CLS_ORDER = { RESPONDING: 4, STAGED: 3, STAFFED: 2, DARK: 1 };

const REFRESH_MS = 90_000;

const LTRINEX_RE = /\b(ltrinex|live.*threat.*nexus|live.*intel.*scenario|live.*threat.*response|dark.*live.*event|threat.*response.*nexus|live.*response.*intelligence|live.*intel.*contact|live.*scenario.*dataset)\b/i;

export function isLtrinexQuery(q) { return LTRINEX_RE.test(q || ""); }

export function buildLtrinexScript(rows) {
  const total      = rows.length;
  const responding = rows.filter(r => r.cls === "RESPONDING").length;
  const dark       = rows.filter(r => r.cls === "DARK").length;
  return (
    `Live Threat Response Intelligence Nexus: ${total} live event category${total !== 1 ? "ies" : "y"} assessed. ` +
    `${responding} responding (scenario, contact, dataset, and report coverage confirmed). ` +
    (dark > 0
      ? `${dark} dark — no scenario playbook, no contact owner, no dataset, no report. Full live intelligence blind spots.`
      : "No dark live event categories detected.")
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

function extractLiveCategories(liveData) {
  const categories = new Map();
  const quakes = liveData?.earthquakes || liveData?.quakes || [];
  const crypto  = liveData?.crypto  || liveData?.cryptocurrency || [];
  const fx      = liveData?.fx      || liveData?.forex          || [];

  for (const q of (Array.isArray(quakes) ? quakes : [])) {
    const place = q.place || q.region || q.location || q.title || "Unknown Region";
    const region = place.split(",").pop()?.trim() || place;
    const key = `quake:${region}`;
    if (!categories.has(key)) {
      categories.set(key, { key, type: "QUAKE", label: region, raw: q, magnitude: q.mag || q.magnitude });
    }
  }
  for (const c of (Array.isArray(crypto) ? crypto : [])) {
    const sym = c.symbol || c.name || c.id || "???";
    const key = `crypto:${sym}`;
    if (!categories.has(key)) {
      categories.set(key, { key, type: "CRYPTO", label: sym, raw: c });
    }
  }
  for (const f of (Array.isArray(fx) ? fx : [])) {
    const pair = f.pair || f.symbol || f.name || "???";
    const key = `fx:${pair}`;
    if (!categories.has(key)) {
      categories.set(key, { key, type: "FX", label: pair, raw: f });
    }
  }
  return [...categories.values()];
}

function classifyCategory(cat, scenarios, contacts, datasets, reports) {
  const catText = [cat.label, cat.type, cat.raw?.title, cat.raw?.description, cat.raw?.place].filter(Boolean).join(" ");
  const cToks = tokens(catText);

  const matchedScenarios = scenarios.filter(s =>
    overlaps(cToks, [s._label, s.name, s.title, s.type, s.category, s.description, s.status].join(" "))
  );
  const matchedContacts = contacts.filter(c =>
    overlaps(cToks, [c._label, c.name, c.title, c.role, c.org, c.organization, c.description, c.email].join(" "))
  );
  const matchedDatasets = datasets.filter(d =>
    overlaps(cToks, [d._label, d.name, d.title, d.type, d.category, d.description, d.source].join(" "))
  );
  const matchedReports = reports.filter(r =>
    overlaps(cToks, [r._label, r.name, r.title, r.type, r.category, r.description, r.summary].join(" "))
  );

  const sources = [
    matchedScenarios.length > 0,
    matchedContacts.length > 0,
    matchedDatasets.length > 0,
    matchedReports.length > 0,
  ].filter(Boolean).length;

  let cls;
  if (sources === 4) cls = "RESPONDING";
  else if (sources >= 2) cls = "STAGED";
  else if (sources === 1) cls = "STAFFED";
  else cls = "DARK";

  return { cat, cls, matchedScenarios, matchedContacts, matchedDatasets, matchedReports };
}

export default function LiveIntelScenarioContactDatasetReportNexus() {
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
      const [liveRaw, scenariosRaw, contactsRaw, datasetsRaw, reportsRaw] = await Promise.all([
        fetcher("/functions/getLiveIntel"),
        fetcher("/v1/scenario/list"),
        fetcher("/entities/Contact"),
        fetcher("/v1/datasets"),
        fetcher("/v1/reports"),
      ]);

      const categories = extractLiveCategories(liveRaw || {});
      const scenarios  = normalizeArray(scenariosRaw, ["name", "title", "type", "category"]);
      const contacts   = normalizeArray(contactsRaw,  ["name", "title", "role", "org", "organization"]);
      const datasets   = normalizeArray(datasetsRaw,  ["name", "title", "type", "category"]);
      const reports    = normalizeArray(reportsRaw,   ["name", "title", "type", "category"]);

      const built = categories.map(c => classifyCategory(c, scenarios, contacts, datasets, reports));
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
    window.addEventListener("jarvis:ltrinex-toggle", toggle);
    return () => window.removeEventListener("jarvis:ltrinex-toggle", toggle);
  }, []);

  const dark    = rows.filter(r => r.cls === "DARK").length;
  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const label = (r.cat?.label || "").toLowerCase();
      if (!label.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const assess = useCallback(async () => {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    try {
      const script = buildLtrinexScript(rows);
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

  const TYPE_COLOR = { QUAKE: "#FF8C42", CRYPTO: "#9B59B6", FX: "#1ABC9C" };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="LiveIntel × Scenario × Contact × Dataset × Report — Live Threat Response Intelligence Nexus"
        style={{
          position: "fixed", left: 131240, bottom: 8, zIndex: 245,
          background: "rgba(0,20,40,0.82)", border: `1px solid ${dark > 0 ? RED : CYAN}`,
          color: dark > 0 ? RED : CYAN, borderRadius: 4, padding: "3px 7px",
          fontSize: 10, fontFamily: "monospace", cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: dark > 0 ? `0 0 6px ${RED}` : "none",
          animation: dark > 0 ? "pulse-red 1.4s infinite" : "none",
        }}
      >
        ◈ LTRINEX{dark > 0 ? ` — ${dark} DARK` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9245,
      background: "rgba(0,8,20,0.96)", display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CYAN, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px",
        borderBottom: `1px solid ${CYAN}22`, flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          ◈ LTRINEX — LIVE THREAT RESPONSE INTELLIGENCE NEXUS
        </span>
        <span style={{ fontSize: 11, color: DIM }}>
          LiveIntel × Scenario × Contact × Dataset × Report (5-source)
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: DIM }}>
          {rows.length} categories · {dark > 0
            ? <span style={{ color: RED, fontWeight: 700 }}>{dark} DARK</span>
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
        {["ALL", "RESPONDING", "STAGED", "STAFFED", "DARK"].map(f => (
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
          placeholder="search event category…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CYAN}33`, color: CYAN, borderRadius: 3,
            padding: "2px 8px", fontSize: 10, outline: "none", width: 200 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 16px" }}>
        {loading && <div style={{ color: DIM, fontSize: 12, padding: 8 }}>Loading…</div>}
        {error && <div style={{ color: RED, fontSize: 12, padding: 8 }}>Error: {error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 12, padding: 8 }}>No live event categories match current filter.</div>
        )}
        {visible.map((row, i) => {
          const key   = row.cat.key || i;
          const isExp = !!expanded[key];
          const col   = CLS_COLOR[row.cls];
          const typeCol = TYPE_COLOR[row.cat.type] || CYAN;
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
                <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 88 }}>
                  {row.cls}
                </span>
                <span style={{ color: typeCol, fontSize: 9, fontWeight: 700, minWidth: 50,
                  background: `${typeCol}18`, borderRadius: 2, padding: "1px 4px" }}>
                  {row.cat.type}
                </span>
                <span style={{ fontSize: 11, flex: 1, color: "#c8e8f8" }}>
                  {row.cat.label}
                  {row.cat.magnitude != null
                    ? <span style={{ color: DIM, marginLeft: 6 }}>M{row.cat.magnitude}</span>
                    : null}
                </span>
                <span style={{ fontSize: 10, color: DIM }}>
                  S:{row.matchedScenarios.length} C:{row.matchedContacts.length} D:{row.matchedDatasets.length} R:{row.matchedReports.length}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "4px 12px 4px 20px", fontSize: 10,
                  borderLeft: `1px solid ${col}44`, marginLeft: 8, marginTop: 2 }}>
                  {row.matchedScenarios.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: CYAN, fontWeight: 700 }}>Scenarios ({row.matchedScenarios.length}):</span>
                      {row.matchedScenarios.slice(0, 6).map((s, si) => (
                        <span key={si} style={{ marginLeft: 6, color: "#a8d8f0" }}>
                          {s._label || s.name}
                          {s.status
                            ? <span style={{ color: DIM }}> [{s.status}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedContacts.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
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
                  {row.matchedReports.length > 0 && (
                    <div>
                      <span style={{ color: "#AA88FF", fontWeight: 700 }}>Reports ({row.matchedReports.length}):</span>
                      {row.matchedReports.slice(0, 6).map((r, ri) => (
                        <span key={ri} style={{ marginLeft: 6, color: "#d0c0ff" }}>
                          {r._label || r.name || r.title}
                          {(r.date || r.created_at)
                            ? <span style={{ color: DIM }}> [{(r.date || r.created_at || "").slice(0, 10)}]</span>
                            : null}
                        </span>
                      ))}
                    </div>
                  )}
                  {row.matchedScenarios.length === 0 && row.matchedContacts.length === 0 &&
                   row.matchedDatasets.length === 0 && row.matchedReports.length === 0 && (
                    <span style={{ color: DIM }}>No matches across any source — full live intelligence blind spot.</span>
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
