/**
 * DatasetInvestigationNexus — F497
 * "JARVIS, dataset investigation / investigation data / dinv /
 *  which datasets support investigations / data coverage /
 *  investigation dataset / dinv / dataset coverage"
 * Cross-references /v1/datasets + /v1/investigations.
 * Keyword-matches investigation titles/subjects/descriptions against dataset names/tags/descriptions.
 * REFERENCED (≥1 investigation matched) vs UNREFERENCED (no case backing).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFD700";
const DIM = "#8899AA";
const RED = "#FF4466";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;
const BTN_LEFT = 23820;

const DINV_RE =
  /\bdataset.?invest\w*\b|\binvest\w*.?data\w*\b|\bdinv\b|\bwhich.?datasets?.?support\b|\bdata.?coverage\b|\binvest\w*.?dataset\b|\bdataset.?case\b|\bcase.?dataset\b|\bdata.?case\b|\bcase.?data\b/i;

export function isDinvQuery(text) {
  return DINV_RE.test(text || "");
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((d, i) => ({
    id:          d.id || `ds-${i}`,
    name:        (d.name || d.title || d.label || `Dataset ${i + 1}`).trim(),
    description: d.description || d.summary || d.notes || null,
    kind:        d.kind || d.type || d.category || null,
    rows:        d.row_count ?? d.rows ?? d.record_count ?? null,
    tags: [
      ...(d.tags || []),
      ...(d.labels || []),
      d.source, d.domain, d.schema, d.kind, d.type,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.cases || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:       inv.id || `inv-${i}`,
    name:     (inv.name || inv.title || inv.subject || `Case ${i + 1}`).trim(),
    status:   (inv.status || "UNKNOWN").toUpperCase(),
    lead:     inv.lead || inv.owner || inv.assignee || null,
    summary:  inv.summary || inv.description || inv.notes || null,
    tags: [
      ...(inv.tags || []),
      ...(inv.labels || []),
      inv.category, inv.type, inv.subject,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function tokenise(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function buildNexus(datasets, investigations) {
  return datasets.map(ds => {
    const dsTokens = [
      ...tokenise(ds.name),
      ...tokenise(ds.description),
      ...ds.tags,
    ];
    const matched = investigations.filter(inv => {
      const invTokens = [
        ...tokenise(inv.name),
        ...tokenise(inv.summary),
        ...inv.tags,
      ];
      return invTokens.some(t => dsTokens.includes(t)) ||
             dsTokens.some(t => invTokens.includes(t));
    });
    return { dataset: ds, investigations: matched, referenced: matched.length > 0 };
  });
}

export async function buildDinvScript() {
  let dsData = null, invData = null;
  try {
    const [dr, ir] = await Promise.all([
      fetch(`${apiBase()}/v1/datasets`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/investigations`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (dr.ok)  dsData  = await dr.json();
    if (ir.ok)  invData = await ir.json();
  } catch (_) {}

  if (!dsData && !invData)
    return "Unable to retrieve dataset investigation nexus data at this time, sir.";

  const datasets       = normaliseDatasets(dsData);
  const investigations = normaliseInvestigations(invData);
  const nexus          = buildNexus(datasets, investigations);
  const referenced     = nexus.filter(r => r.referenced);
  const unreferenced   = nexus.filter(r => !r.referenced);
  const pct            = nexus.length ? Math.round((referenced.length / nexus.length) * 100) : 0;

  if (!nexus.length)
    return `Dataset Investigation Nexus: ${datasets.length} datasets and ${investigations.length} investigations scanned. No cross-reference data available, sir.`;

  const top = referenced.slice(0, 2).map(r =>
    `${r.dataset.name} (${r.investigations.length} case${r.investigations.length !== 1 ? "s" : ""})`
  ).join("; ");

  return [
    `Dataset Investigation Nexus: ${referenced.length} of ${nexus.length} datasets are referenced by active investigations (${pct}%).`,
    unreferenced.length
      ? `${unreferenced.length} dataset${unreferenced.length !== 1 ? "s" : ""} have no investigation backing — potential data blind spots.`
      : "All datasets have active case references.",
    top ? `Key datasets: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

function invStatusColor(status) {
  return { OPEN: GRN, ACTIVE: CY, ESCALATED: RED, CLOSED: DIM, RESOLVED: DIM }[status] || DIM;
}

export default function DatasetInvestigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dr, ir] = await Promise.all([
        fetch(`${apiBase()}/v1/datasets`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const dsData  = dr.ok  ? await dr.json()  : null;
      const invData = ir.ok  ? await ir.json()  : null;
      const datasets       = normaliseDatasets(dsData);
      const investigations = normaliseInvestigations(invData);
      setNexus(buildNexus(datasets, investigations));
      setLastTs(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:dinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dinv-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const referenced   = nexus.filter(r => r.referenced);
  const unreferenced = nexus.filter(r => !r.referenced);
  const pct          = nexus.length ? Math.round((referenced.length / nexus.length) * 100) : 0;

  const visible = nexus
    .filter(r => {
      if (filter === "REFERENCED")   return r.referenced;
      if (filter === "UNREFERENCED") return !r.referenced;
      return true;
    })
    .filter(r => !search || r.dataset.name.toLowerCase().includes(search.toLowerCase()));

  const TABS = ["ALL", "REFERENCED", "UNREFERENCED"];

  const assess = useCallback(async (row) => {
    setAssessing(row.dataset.id);
    try {
      const prompt = `Dataset Investigation Nexus — dataset "${row.dataset.name}": ${
        row.referenced
          ? `referenced by ${row.investigations.length} investigation(s): ${row.investigations.map(i => i.name).join(", ")}.`
          : "no investigation references found."
      } Provide a 2-sentence analysis of the data coverage implications.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = j.response || j.reply || j.message || j.content || null;
        if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch (_) {}
    setAssessing(null);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   86,
          background: unreferenced.length > 0 ? `${AMB}22` : `${CY}18`,
          border:   `1px solid ${unreferenced.length > 0 ? AMB : CY}55`,
          color:    unreferenced.length > 0 ? AMB : CY,
          padding:  "2px 6px",
          fontSize: 9,
          letterSpacing: 1.2,
          cursor: "pointer",
          borderRadius: 3,
          fontFamily: "monospace",
        }}
      >
        ◈ DINV
        {unreferenced.length > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMB,
            color: "#000",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: 8,
          }}>{unreferenced.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed",
          top:      60,
          right:    8,
          width:    380,
          maxHeight: "80vh",
          background: "rgba(4,14,26,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 6,
          zIndex: 9010,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px 6px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1.5 }}>
              ◈ DATASET INVESTIGATION NEXUS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 12px",
            borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "DATASETS",    val: nexus.length,         col: CY  },
              { label: "REFERENCED",  val: referenced.length,    col: GRN },
              { label: "UNREFERENCED",val: unreferenced.length,  col: AMB },
              { label: "COVERAGE",    val: `${pct}%`,            col: CY  },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, textAlign: "center",
                background: `${s.col}0d`, border: `1px solid ${s.col}33`,
                borderRadius: 4, padding: "4px 0",
              }}>
                <div style={{ color: s.col, fontSize: 13, fontWeight: 700 }}>{s.val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "5px 12px", borderBottom: `1px solid ${CY}18` }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === t ? CY : CY + "33"}`,
                  color: filter === t ? CY : DIM,
                  padding: "2px 6px", fontSize: 8, borderRadius: 3,
                  cursor: "pointer", letterSpacing: 0.8,
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search datasets…"
              style={{
                flex: 1, background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: CY, fontSize: 8, padding: "2px 5px",
                outline: "none", fontFamily: "monospace",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && nexus.length === 0 && (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 16 }}>
                Loading dataset investigation nexus…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 16 }}>
                No datasets match current filter.
              </div>
            )}
            {visible.map(row => {
              const isExp = expanded === row.dataset.id;
              const statusCol = row.referenced ? GRN : AMB;
              return (
                <div
                  key={row.dataset.id}
                  style={{
                    padding: "7px 12px",
                    borderBottom: `1px solid ${CY}11`,
                    borderLeft: `3px solid ${statusCol}`,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : row.dataset.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      background: `${statusCol}22`,
                      color: statusCol,
                      border: `1px solid ${statusCol}55`,
                      borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                      flexShrink: 0,
                    }}>
                      {row.referenced ? "REFERENCED" : "UNREFERENCED"}
                    </span>
                    <span style={{ color: "#c0d8f0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.dataset.name}
                    </span>
                    {row.investigations.length > 0 && (
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        style={{
                          background: `${CY}18`, border: `1px solid ${CY}44`,
                          color: CY, padding: "1px 5px", fontSize: 8,
                          borderRadius: 3, cursor: "pointer",
                        }}
                      >
                        {assessing === row.dataset.id ? "…" : "▶ ASSESS"}
                      </button>
                    )}
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {row.dataset.kind && !isExp && (
                    <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                      {row.dataset.kind}
                      {row.dataset.rows !== null ? ` · ${row.dataset.rows.toLocaleString()} rows` : ""}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.dataset.kind && (
                        <div style={{ color: DIM, fontSize: 9 }}>
                          Kind: <span style={{ color: AMB }}>{row.dataset.kind}</span>
                          {row.dataset.rows !== null
                            ? <> · <span style={{ color: CY }}>{row.dataset.rows.toLocaleString()}</span> rows</>
                            : null}
                        </div>
                      )}
                      {row.dataset.description && (
                        <div style={{ color: "#9ab8d0", fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                          {row.dataset.description.slice(0, 160)}
                          {row.dataset.description.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {row.investigations.length === 0 && (
                        <div style={{ color: AMB, fontSize: 9 }}>
                          No investigations currently reference this dataset.
                        </div>
                      )}
                      {row.investigations.map(inv => {
                        const iCol = invStatusColor(inv.status);
                        return (
                          <div key={inv.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${iCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                background: `${iCol}22`, color: iCol,
                                border: `1px solid ${iCol}55`,
                                borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                              }}>{inv.status}</span>
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{inv.name}</span>
                            </div>
                            {inv.lead && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                                Lead: <span style={{ color: CY }}>{inv.lead}</span>
                              </div>
                            )}
                            {inv.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2, lineHeight: 1.4 }}>
                                {inv.summary.slice(0, 140)}{inv.summary.length > 140 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px",
            borderTop: `1px solid ${CY}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>
              AUTO-REFRESH {POLL_MS / 1000}s · /v1/datasets + /v1/investigations
            </span>
            {lastTs && <span style={{ color: DIM, fontSize: 8 }}>{lastTs}</span>}
          </div>
        </div>
      )}
    </>
  );
}
