/**
 * ReportViewer — F476
 * Fetches /v1/reports and renders an intelligence report browsing panel.
 * Voice: "JARVIS, report viewer / show reports / intelligence reports / rview"
 * Toggle: jarvis:report-viewer-toggle  |  ◈ RVIEW button
 * Additive only — mounted via App.jsx; helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const YLW = "#FFD700";
const RED = "#FF3B3B";
const PRP = "#A855F7";
const DIM = "#3A4A5A";
const BG  = "rgba(4,8,14,0.92)";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 120_000;
const BTN_LEFT = 10920;

const RVIEW_RE =
  /\breport.viewer\b|\bshow.reports?\b|\bintelligence.reports?\b|\brview\b|\bmy.reports?\b|\breport.list\b|\bview.reports?\b|\breports.panel\b/i;

export function isReportViewerQuery(text) {
  return RVIEW_RE.test(text || "");
}

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.slice(0, 60).map((r, i) => ({
    id:        r.id || r.report_id || `rpt-${i}`,
    title:     r.title || r.name || r.label || `Report ${i + 1}`,
    type:      r.type || r.category || r.report_type || "report",
    status:    r.status || r.state || null,
    summary:   r.summary || r.description || r.abstract || r.content || null,
    author:    r.author || r.created_by || r.owner || null,
    created:   r.created_at || r.date || r.timestamp || r.published_at || null,
    updated:   r.updated_at || r.last_modified || null,
    tags:      Array.isArray(r.tags) ? r.tags : [],
  }));
}

function typeColor(type = "") {
  const t = String(type).toLowerCase();
  if (/threat|risk|alert|danger/i.test(t)) return RED;
  if (/intel|intelligence|profile/i.test(t)) return PRP;
  if (/ops|operational|operation/i.test(t)) return YLW;
  if (/knowledge|research|study/i.test(t)) return GRN;
  return CY;
}

function fmtDate(str) {
  if (!str) return "—";
  try {
    return new Date(str).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return str; }
}

export async function buildReportViewerScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  window.dispatchEvent(new CustomEvent("jarvis:report-viewer-toggle"));

  if (!data) return "Unable to retrieve reports at this time, sir.";
  const reports = normaliseReports(data);
  if (!reports.length) return "No reports on record at this time, sir.";

  const byType = {};
  reports.forEach(r => {
    const k = r.type || "unknown";
    byType[k] = (byType[k] || 0) + 1;
  });
  const typeStr = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");

  const latest = reports.find(r => r.created)?.title;
  const latestPart = latest ? ` Latest: ${latest}.` : "";

  return (
    `Intelligence reports: ${reports.length} on record. Types include ${typeStr || "various"}.` +
    latestPart +
    " Report viewer is now open, sir."
  );
}

const TABS = ["ALL", "THREAT", "INTEL", "OPS", "KNOWLEDGE", "OTHER"];

function tabFilter(reports, tab) {
  if (tab === "ALL") return reports;
  const map = {
    THREAT:    /threat|risk|alert|danger/i,
    INTEL:     /intel|intelligence|profile/i,
    OPS:       /ops|operational|operation/i,
    KNOWLEDGE: /knowledge|research|study/i,
  };
  const re = map[tab];
  if (!re) return reports.filter(r => !Object.values(map).some(m => m.test(r.type)));
  return reports.filter(r => re.test(r.type));
}

export default function ReportViewer() {
  const [open, setOpen]       = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [query, setQuery]     = useState("");

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${apiBase()}/v1/reports`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setReports(normaliseReports(data));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:report-viewer-toggle", toggle);
    return () => window.removeEventListener("jarvis:report-viewer-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="Report Viewer"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 71,
          background: "rgba(4,8,14,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontSize: 10, padding: "3px 7px", borderRadius: 4,
          cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        ◈ RVIEW
      </button>
    );
  }

  const visible = tabFilter(
    reports.filter(r =>
      !query || r.title.toLowerCase().includes(query.toLowerCase()) ||
      (r.summary || "").toLowerCase().includes(query.toLowerCase())
    ),
    tab
  );

  return (
    <div style={{
      position: "fixed", right: 18, top: 18, zIndex: 71,
      width: "min(600px,92vw)", maxHeight: "88vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 14,
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
        flexShrink: 0,
      }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
          ◈ INTELLIGENCE REPORTS
        </span>
        <span style={{
          marginLeft: 8, background: `${CY}22`, color: CY,
          borderRadius: 10, padding: "1px 8px", fontSize: 11,
        }}>{reports.length}</span>
        <button
          onClick={() => setOpen(false)}
          style={{
            marginLeft: "auto", background: "none", border: "none",
            color: "#6E8AA0", cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}
        >✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 16px", borderBottom: `1px solid ${CY}11`, flexShrink: 0 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search reports…"
          style={{
            width: "100%", background: "rgba(41,231,255,0.06)",
            border: `1px solid ${CY}33`, borderRadius: 6,
            color: "#DCEBF5", padding: "5px 10px", fontSize: 12,
            fontFamily: "'JetBrains Mono',monospace", outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "8px 16px",
        borderBottom: `1px solid ${CY}11`, flexShrink: 0, flexWrap: "wrap",
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "none",
              border: `1px solid ${tab === t ? CY : DIM}`,
              color: tab === t ? CY : "#6E8AA0",
              borderRadius: 4, padding: "2px 8px", fontSize: 10,
              cursor: "pointer", letterSpacing: 1,
            }}
          >{t}</button>
        ))}
        <button
          onClick={load}
          style={{
            marginLeft: "auto", background: "none", border: `1px solid ${DIM}`,
            color: "#6E8AA0", borderRadius: 4, padding: "2px 7px",
            fontSize: 10, cursor: "pointer",
          }}
          title="Refresh"
        >↻</button>
      </div>

      {/* Body */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
        {loading && (
          <div style={{ textAlign: "center", color: CY, fontSize: 12, padding: 24 }}>
            loading reports…
          </div>
        )}
        {err && !loading && (
          <div style={{ textAlign: "center", color: RED, fontSize: 12, padding: 24 }}>
            {err}
          </div>
        )}
        {!loading && !err && visible.length === 0 && (
          <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 24 }}>
            no reports found
          </div>
        )}
        {visible.map(rpt => {
          const isExp = expanded === rpt.id;
          const tc = typeColor(rpt.type);
          return (
            <div
              key={rpt.id}
              onClick={() => setExpanded(isExp ? null : rpt.id)}
              style={{
                margin: "0 12px 6px",
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isExp ? tc + "55" : DIM + "44"}`,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{
                  background: tc + "22", color: tc,
                  borderRadius: 3, padding: "1px 6px", fontSize: 9,
                  letterSpacing: 1, textTransform: "uppercase", flexShrink: 0,
                }}>{rpt.type}</span>
                <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rpt.title}
                </span>
                <span style={{ fontSize: 9, color: "#6E8AA0", flexShrink: 0 }}>
                  {fmtDate(rpt.created)}
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#9BAFC0", lineHeight: 1.5 }}>
                  {rpt.summary && (
                    <p style={{ margin: "0 0 6px" }}>{rpt.summary}</p>
                  )}
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {rpt.author && (
                      <span><span style={{ color: CY }}>Author:</span> {rpt.author}</span>
                    )}
                    {rpt.status && (
                      <span><span style={{ color: CY }}>Status:</span> {rpt.status}</span>
                    )}
                    {rpt.updated && (
                      <span><span style={{ color: CY }}>Updated:</span> {fmtDate(rpt.updated)}</span>
                    )}
                  </div>
                  {rpt.tags.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {rpt.tags.map(tag => (
                        <span key={tag} style={{
                          background: `${DIM}55`, color: "#9BAFC0",
                          borderRadius: 3, padding: "1px 5px", fontSize: 9,
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px", borderTop: `1px solid ${CY}11`,
        fontSize: 10, color: "#3A4A5A", flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>showing {visible.length}/{reports.length} reports</span>
        <span>auto-refresh every 2 min</span>
      </div>
    </div>
  );
}
