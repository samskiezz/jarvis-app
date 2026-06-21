/**
 * DatasetsBrowser — F11 Datasets Browser.
 * Floating catalog panel sourced from /v1/datasets.
 * Shows each dataset with name, row count, type, and description.
 * "JARVIS, datasets" opens the panel. Refreshes every 120s.
 * Additive only — mounted via App.jsx; intent hook imported into JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GLD  = "#FFD700";
const GRN  = "#00E5A0";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DATASETS_RE = /\bdataset|catalog|ingest|pipeline|fusion\b/i;

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)           ? d
    : Array.isArray(d?.data)        ? d.data
    : Array.isArray(d?.items)       ? d.items
    : Array.isArray(d?.datasets)    ? d.datasets
    : Array.isArray(d?.results)     ? d.results
    : [];
}

export function isDatasetsQuery(text) {
  return DATASETS_RE.test(text || "");
}

export async function buildDatasetsScript() {
  let sets = [];
  try { sets = await fetchDatasets(); } catch (_) {}

  if (!sets.length) return "No datasets are currently indexed, sir.";

  const totalRows = sets.reduce((acc, s) => {
    const rc = s.row_count ?? s.rows ?? s.count ?? s.record_count ?? 0;
    return acc + (Number(rc) || 0);
  }, 0);

  const topNames = sets
    .slice(0, 3)
    .map(s => s.name || s.title || s.dataset_name || "unnamed")
    .join(", ");

  return (
    `Data Fusion Reactor: ${sets.length} dataset${sets.length !== 1 ? "s" : ""} indexed` +
    (totalRows > 0 ? `, ${totalRows.toLocaleString()} total records` : "") +
    `. Includes: ${topNames}.`
  );
}

function fmtRows(s) {
  const rc = s.row_count ?? s.rows ?? s.count ?? s.record_count;
  if (rc == null) return null;
  const n = Number(rc);
  if (Number.isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M rows`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K rows`;
  return `${n} row${n !== 1 ? "s" : ""}`;
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

export default function DatasetsBrowser() {
  const [open,      setOpen]      = useState(false);
  const [datasets,  setDatasets]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const arr = await fetchDatasets();
      setDatasets(arr);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e?.detail?.text || e?.detail?.query || "");
      if (DATASETS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = filter.trim()
    ? datasets.filter(s => {
        const hay = [
          s.name, s.title, s.dataset_name, s.type, s.source, s.description,
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(filter.toLowerCase());
      })
    : datasets;

  const totalRows = datasets.reduce((acc, s) => {
    const rc = s.row_count ?? s.rows ?? s.count ?? s.record_count ?? 0;
    return acc + (Number(rc) || 0);
  }, 0);

  return (
    <>
      {/* Toggle button — bottom-left strip, after RISKS */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Datasets Browser"
        style={{
          position: "fixed", left: 420, bottom: 18, zIndex: 68,
          background: open ? GRN + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${GRN}55`,
          borderRadius: 8,
          color: open ? "#04060A" : GRN,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${GRN}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        DATA
        {datasets.length > 0 && (
          <span style={{
            background: GRN + "44", color: GRN,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {datasets.length}
          </span>
        )}
      </button>

      {/* Datasets panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(420px,93vw)", maxHeight: "min(560px,76vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${GRN}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${GRN}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${GRN}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: GRN,
              boxShadow: `0 0 10px ${GRN}`, display: "inline-block",
              animation: loading ? "dbpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: GRN, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DATA FUSION CATALOG
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING"
                : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats bar */}
          {datasets.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${GRN}18`,
              display: "flex", gap: 16, alignItems: "center",
            }}>
              <span style={{ fontSize: 9, color: GRN, letterSpacing: 1 }}>
                {datasets.length} DATASET{datasets.length !== 1 ? "S" : ""}
              </span>
              {totalRows > 0 && (
                <span style={{ fontSize: 9, color: GLD, letterSpacing: 1 }}>
                  {totalRows.toLocaleString()} RECORDS
                </span>
              )}
            </div>
          )}

          {/* Search / filter */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${GRN}18` }}>
            <input
              type="text"
              placeholder="filter datasets…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(0,229,160,0.06)", border: `1px solid ${GRN}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Dataset cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {datasets.length === 0 ? "No datasets indexed." : "No matches."}
              </div>
            )}
            {visible.map((s, i) => {
              const name    = s.name || s.title || s.dataset_name || `Dataset ${i + 1}`;
              const desc    = s.description || s.summary || s.notes || "";
              const type    = s.type || s.source_type || s.format || s.source || "";
              const rows    = fmtRows(s);
              const ts      = s.updated_at || s.last_updated || s.created_at || s.created_date;
              const status  = s.status || s.state || "";

              return (
                <div key={s.id || s.dataset_id || i} style={{
                  margin: "6px 10px",
                  background: `${GRN}08`,
                  border: `1px solid ${GRN}28`,
                  borderRadius: 8, padding: "9px 12px",
                }}>
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, lineHeight: 1 }}>⬡</span>
                    <span style={{ flex: 1, fontSize: 10, color: "#DCEBF5", fontWeight: 700, letterSpacing: 0.5 }}>
                      {name}
                    </span>
                    {rows && (
                      <span style={{
                        fontSize: 9, color: GLD, background: `${GLD}18`,
                        borderRadius: 4, padding: "1px 6px", letterSpacing: 0.5, fontWeight: 700,
                      }}>
                        {rows}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {desc && (
                    <p style={{
                      margin: "0 0 5px", fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
                    </p>
                  )}

                  {/* Meta row */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {type && (
                      <span style={{
                        fontSize: 8, color: GRN + "aa", letterSpacing: 0.8,
                        border: `1px solid ${GRN}33`, borderRadius: 3, padding: "1px 5px",
                      }}>
                        {type}
                      </span>
                    )}
                    {status && (
                      <span style={{
                        fontSize: 8, color: "#566878",
                        border: "1px solid #334455", borderRadius: 3,
                        padding: "1px 5px", letterSpacing: 0.5,
                      }}>
                        {status}
                      </span>
                    )}
                    {ts && (
                      <span style={{ fontSize: 8, color: "#566878", marginLeft: "auto" }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes dbpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
