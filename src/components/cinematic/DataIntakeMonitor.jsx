/**
 * DataIntakeMonitor — F484
 * "JARVIS, data intake / dataset monitor / dint / data volume / row count"
 * Opens a bar-chart panel showing dataset row-count distribution sourced
 * from the real /v1/datasets endpoint. Additive only — mounted via App.jsx;
 * intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const ORG = "#FF8C42";
const PRP = "#A855F7";
const YLW = "#FFD700";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;

const DINT_RE =
  /\bdata.intake\b|\bdataset.monitor\b|\bdint\b|\bdata.volume\b|\brow.count\b|\bdataset.rows?\b|\bdata.distribution\b|\bdataset.size\b|\bingestion.volume\b|\bdataset.intake\b/i;

export function isDataIntakeQuery(text) {
  return DINT_RE.test(text || "");
}

function normaliseDatasets(data) {
  if (!data) return [];
  const raw =
    data.datasets || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw
    .map((d, i) => ({
      id:        d.id || d.dataset_id || `ds-${i}`,
      name:      d.name || d.title || d.label || `Dataset ${i + 1}`,
      rows:      Number(d.row_count || d.rows || d.count || d.size || 0),
      source:    d.source || d.type || d.kind || null,
      updated:   d.updated_at || d.last_updated || d.modified_at || null,
      status:    d.status || d.state || null,
    }))
    .sort((a, b) => b.rows - a.rows);
}

function fmtRows(n) {
  if (!n || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function barColor(rank, total) {
  if (rank === 0) return CY;
  if (rank < Math.ceil(total * 0.2)) return GRN;
  if (rank < Math.ceil(total * 0.5)) return PRP;
  return ORG;
}

export async function buildDataIntakeScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/datasets`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  if (!data) return "Unable to retrieve dataset intake metrics at this time, sir.";

  const datasets = normaliseDatasets(data);
  if (!datasets.length) return "No datasets registered in the intake monitor, sir.";

  const totalRows = datasets.reduce((s, d) => s + d.rows, 0);
  const largest   = datasets[0];
  const withRows  = datasets.filter(d => d.rows > 0).length;

  const parts = [
    `Data intake monitor: ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} registered.`,
    `Total volume: ${fmtRows(totalRows)} rows across ${withRows} active dataset${withRows !== 1 ? "s" : ""}.`,
  ];
  if (largest?.name && largest.rows > 0) {
    parts.push(`Largest dataset: ${largest.name} at ${fmtRows(largest.rows)} rows.`);
  }

  return parts.join(" ");
}

export default function DataIntakeMonitor() {
  const [open,     setOpen]     = useState(false);
  const [datasets, setDatasets] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [lastTs,   setLastTs]   = useState(null);
  const [view,     setView]     = useState("CHART"); // CHART | LIST

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/datasets`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) {
        const data = await r.json();
        setDatasets(normaliseDatasets(data));
        setLastTs(Date.now());
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (DINT_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:dint-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dint-toggle", onToggle);
  }, []);

  const totalRows = datasets.reduce((s, d) => s + d.rows, 0);
  const maxRows   = datasets.length > 0 ? Math.max(...datasets.map(d => d.rows), 1) : 1;
  const top10     = datasets.slice(0, 10);
  const ts        = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Data Intake Monitor — F484"
        style={{
          position: "fixed", left: 13500, bottom: 8, zIndex: 74,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        DINT
        {datasets.length > 0 && (
          <span style={{
            background: CY + "33", color: CY,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {datasets.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 74,
          width: "min(580px,96vw)", maxHeight: "min(660px,84vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: CY, boxShadow: `0 0 10px ${CY}`,
              display: "inline-block",
              animation: loading ? "dintpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DATA INTAKE MONITOR
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · REFRESH {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stats row */}
          {datasets.length > 0 && (
            <div style={{
              display: "flex", gap: 8, padding: "8px 14px",
              borderBottom: `1px solid ${CY}18`,
            }}>
              <StatTile label="DATASETS"  value={datasets.length}      color={CY}  />
              <StatTile label="TOTAL ROWS" value={fmtRows(totalRows)}  color={GRN} />
              <StatTile label="LARGEST"   value={fmtRows(maxRows)}     color={ORG} />
              <StatTile
                label="STATUS"
                value={datasets.length > 0 ? "ACTIVE" : "EMPTY"}
                color={datasets.length > 0 ? GRN : YLW}
              />
            </div>
          )}

          {/* View toggle */}
          <div style={{
            display: "flex", gap: 4, padding: "6px 14px",
            borderBottom: `1px solid ${CY}18`,
          }}>
            {["CHART", "LIST"].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? CY + "22" : "transparent",
                border: `1px solid ${view === v ? CY + "55" : CY + "22"}`,
                borderRadius: 5, color: view === v ? CY : "#566878",
                padding: "3px 10px", fontSize: 9, cursor: "pointer",
                letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
              }}>
                {v}
              </button>
            ))}
            <button onClick={load} style={{
              marginLeft: "auto",
              background: "transparent", border: `1px solid ${CY}33`,
              borderRadius: 5, color: "#566878", padding: "3px 9px",
              fontSize: 9, cursor: "pointer", letterSpacing: 1,
              fontFamily: "'JetBrains Mono',monospace",
            }}>↺</button>
          </div>

          {/* Content */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
            {datasets.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING DATASET METRICS…" : "NO DATASETS — CHECK CONNECTION"}
              </div>
            )}

            {/* Bar chart view */}
            {view === "CHART" && top10.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5, marginBottom: 4 }}>
                  TOP {top10.length} BY ROW COUNT
                </div>
                {top10.map((ds, i) => {
                  const pct = maxRows > 0 ? (ds.rows / maxRows) * 100 : 0;
                  const col = barColor(i, top10.length);
                  return (
                    <div key={ds.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{
                          color: "#DCF0FF", fontSize: 10,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          maxWidth: "65%",
                          letterSpacing: 0.5,
                        }}>
                          {i === 0 && <span style={{ color: col, marginRight: 4 }}>▶</span>}
                          {ds.name}
                        </span>
                        <span style={{ color: col, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                          {fmtRows(ds.rows)}
                        </span>
                      </div>
                      <div style={{
                        height: 6, background: "#0A1520", borderRadius: 3, overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${pct}%`, height: "100%",
                          background: col,
                          boxShadow: `0 0 8px ${col}88`,
                          transition: "width 0.4s ease",
                          borderRadius: 3,
                        }} />
                      </div>
                      {ds.source && (
                        <div style={{ fontSize: 8, color: "#4A6070", paddingLeft: 2 }}>
                          SRC: {ds.source}
                          {ds.updated && (
                            <span style={{ marginLeft: 10 }}>
                              UPDATED: {new Date(ds.updated).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* List view */}
            {view === "LIST" && datasets.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {datasets.map((ds, i) => {
                  const col = barColor(i, datasets.length);
                  const ts2 = ds.updated
                    ? new Date(ds.updated).toLocaleDateString("en-GB")
                    : null;
                  return (
                    <div key={ds.id} style={{
                      padding: "7px 0",
                      borderBottom: `1px solid ${CY}0F`,
                      borderLeft: `3px solid ${col}`,
                      paddingLeft: 10,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          color: "#DCF0FF", fontSize: 10, flex: 1,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {ds.name}
                        </span>
                        <span style={{
                          color: col, fontSize: 11, fontWeight: 700,
                          letterSpacing: 1, flexShrink: 0,
                        }}>
                          {fmtRows(ds.rows)}
                        </span>
                        {ds.status && (
                          <span style={{
                            fontSize: 8, letterSpacing: 1, fontWeight: 700,
                            color: ds.status === "active" ? GRN : YLW,
                            background: (ds.status === "active" ? GRN : YLW) + "22",
                            borderRadius: 4, padding: "1px 6px", flexShrink: 0,
                          }}>
                            {String(ds.status).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div style={{
                        display: "flex", gap: 12, marginTop: 2,
                        fontSize: 8, color: "#4A6070",
                      }}>
                        {ds.source && <span>SRC: <span style={{ color: "#7A9AB0" }}>{ds.source}</span></span>}
                        {ts2 && <span>UPDATED: {ts2}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>SOURCE: /v1/datasets</span>
            <span style={{ marginLeft: "auto", color: CY + "88" }}>
              {fmtRows(totalRows)} TOTAL ROWS · {datasets.length} DATASETS
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dintpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: color + "11",
      border: `1px solid ${color}33`,
      borderRadius: 8, padding: "6px 10px",
      display: "flex", flexDirection: "column", gap: 2, minWidth: 60,
    }}>
      <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 15, color, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}
