/**
 * ReportCategoryBreakdown — F34.
 * Sources from /v1/reports (confirmed endpoint).
 * Groups reports by category/type and shows per-category counts as a ranked
 * bar chart. Distinct from ReportSummariser (which reads individual report
 * content); this shows the distribution across the whole catalog.
 * "JARVIS, report breakdown" / "report categories" / "which report types" opens panel.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const GR   = "#00E5A0";
const AM   = "#F5A623";
const DIM  = "#3A4A55";
const MONO = "'JetBrains Mono','Courier New',monospace";
const SANS = "'Inter',system-ui,sans-serif";

const POLL_MS = 120_000;
const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RCB_RE = /\breport\s*(category|categor|breakdown|distribut|type|by\s*type|by\s*categor|group|overview)\b|\bwhich\s*report\s*type|\breport\s*categor|\brcb\b/i;
export function isRcbQuery(t) { return RCB_RE.test(t || ""); }

function normArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "results", "data", "reports", "records", "list"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function getCategory(r) {
  return (r.category || r.type || r.report_type || r.kind || "Uncategorised")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function groupByCategory(reports) {
  const map = {};
  for (const r of reports) {
    const cat = getCategory(r);
    map[cat] = (map[cat] || 0) + 1;
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ cat, count }));
}

export async function buildRcbScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) throw new Error("no data");
    const data = await r.json();
    const reports = normArray(data);
    if (!reports.length) return "Report Category Breakdown: no reports found in the catalog.";
    const grouped = groupByCategory(reports);
    const top3 = grouped.slice(0, 3).map(g => `${g.cat} (${g.count})`).join(", ");
    return `Report Catalog: ${reports.length} total reports across ${grouped.length} categor${grouped.length === 1 ? "y" : "ies"}. Top categories: ${top3}. Use this breakdown to identify where your intelligence production is concentrated.`;
  } catch {
    return "Report Category Breakdown: unable to reach /v1/reports.";
  }
}

export default function ReportCategoryBreakdown() {
  const [open, setOpen]       = useState(false);
  const [groups, setGroups]   = useState([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]     = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const reports = normArray(data);
      setTotal(reports.length);
      setGroups(groupByCategory(reports));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = (e) => {
      const q = (e.detail?.query || e.detail?.text || "").toLowerCase();
      if (isRcbQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", h);
    return () => window.removeEventListener("jarvis:ask", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildRcbScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.text || d.content || "No response.";
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Unable to reach agent.");
    } finally {
      setAssessing(false);
    }
  }

  const maxCount = groups[0]?.count || 1;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Report Category Breakdown (F34)"
        style={{
          position: "fixed", bottom: 8, left: 5200, zIndex: 85,
          background: open ? "rgba(0,229,160,0.15)" : "rgba(5,12,20,0.75)",
          border: `1px solid ${open ? GR : "rgba(0,229,160,0.2)"}`,
          color: GR, fontFamily: MONO, fontSize: 10, letterSpacing: 1.2,
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(6px)",
        }}
      >
        ◼ RCAT{total > 0 && <span style={{ marginLeft: 5, opacity: 0.7 }}>{total}</span>}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 42, left: 5120, zIndex: 9500,
          width: 340, maxHeight: 460,
          background: "rgba(5,12,20,0.93)", backdropFilter: "blur(20px)",
          border: `1px solid rgba(0,229,160,0.18)`,
          borderTop: `2px solid ${GR}`,
          borderRadius: 12,
          boxShadow: "0 0 50px rgba(0,229,160,0.10), 0 20px 50px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column",
          fontFamily: SANS,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px 8px",
            borderBottom: "1px solid rgba(0,229,160,0.1)",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: GR }}>
              REPORT CATEGORIES
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={assess}
                disabled={assessing || loading}
                style={{
                  background: "none", border: `1px solid ${CY}44`, color: CY,
                  fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: "2px 7px",
                  borderRadius: 4, cursor: "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", color: DIM,
                  fontFamily: MONO, fontSize: 14, cursor: "pointer", lineHeight: 1,
                }}
              >×</button>
            </div>
          </div>

          {/* Stats row */}
          {total > 0 && (
            <div style={{
              display: "flex", gap: 10, padding: "7px 14px",
              borderBottom: "1px solid rgba(0,229,160,0.07)",
            }}>
              <Stat label="TOTAL" val={total} color={GR} />
              <Stat label="CATEGORIES" val={groups.length} color={CY} />
              <Stat label="TOP CAT" val={groups[0]?.cat.split(" ")[0] || "—"} color={AM} />
            </div>
          )}

          {/* Body */}
          <div style={{ overflowY: "auto", padding: "8px 12px 10px", flex: 1 }}>
            {loading && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, padding: 12, textAlign: "center" }}>
                ◌ LOADING…
              </div>
            )}
            {err && !loading && (
              <div style={{ color: "#f87171", fontFamily: MONO, fontSize: 10, padding: 12 }}>
                ✕ {err}
              </div>
            )}
            {!loading && !err && groups.length === 0 && (
              <div style={{ color: DIM, fontFamily: MONO, fontSize: 10, padding: 12, textAlign: "center" }}>
                No reports found.
              </div>
            )}
            {groups.map(({ cat, count }, i) => {
              const pct = Math.round((count / maxCount) * 100);
              const hue = i < 3 ? GR : i < 6 ? CY : AM;
              return (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    fontFamily: MONO, fontSize: 10, marginBottom: 3,
                  }}>
                    <span style={{ color: "#C0DCE8", letterSpacing: 0.3 }}>{cat}</span>
                    <span style={{ color: hue, fontWeight: 700 }}>{count}</span>
                  </div>
                  <div style={{
                    height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden",
                  }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: hue, borderRadius: 2,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
              );
            })}

            {brief && (
              <div style={{
                marginTop: 10, padding: "8px 10px",
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)", borderRadius: 7,
                fontFamily: SANS, fontSize: 11, color: "#A0C8DC", lineHeight: 1.55,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, val, color }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: DIM, marginTop: 1 }}>{label}</div>
    </div>
  );
}
