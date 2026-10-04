/**
 * OpsAlertsReportNexus — F657
 * "JARVIS, oalrpt / ops alert report / alert report coverage /
 *  which alerts have reports / documented alerts / report-backed alerts /
 *  alert documentation / blind alerts report"
 * Cross-references /v1/ops/alerts against /v1/reports.
 * DOCUMENTED alerts (≥1 report keyword-matches) vs BLIND (no report backing).
 * Coverage % tile; ALL/DOCUMENTED/BLIND filter tabs + search; click-to-expand matched reports.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 116_560;
const Z_INDEX  = 194;

const OALRPT_RE =
  /\boalrpt\b|\bops.?alert.?report\b|\balert.?report.?coverage\b|\bwhich.?alerts?.have.?reports?\b|\bdocumented.?alerts?\b|\breport.?backed.?alerts?\b|\balert.?documentation\b|\bblind.?alerts?.report\b|\balert.?report.?match\b|\breport.?alert.?coverage\b/i;

export function isOalrptQuery(text) {
  return OALRPT_RE.test(text || "");
}

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id || String(i),
    title:    a.title    || a.name     || a.summary    || `Alert ${i + 1}`,
    severity: (a.severity || a.level   || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service  || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.reports)
    ? data.reports
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((r, i) => ({
    id:      r.id     || `rpt-${i}`,
    title:   r.title  || r.name    || `Report ${i + 1}`,
    type:    (r.type  || r.kind    || r.category || "OTHER").toString().toUpperCase(),
    author:  r.author || r.created_by || "",
    summary: r.summary || r.description || r.body || "",
    status:  (r.status || "").toString().toUpperCase(),
  }));
}

function crossRef(alerts, reports) {
  return alerts.map((alert) => {
    const haystack = `${alert.title} ${alert.source} ${alert.message}`;
    const matches = reports
      .map((rpt) => {
        const needle = `${rpt.title} ${rpt.summary} ${rpt.type}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...rpt, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...alert, documented: matches.length > 0, reports: matches };
  });
}

export async function buildOalrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [alertRes, rptRes] = await Promise.all([
      fetch(`${base}/v1/ops/alerts`, { headers: hdr }),
      fetch(`${base}/v1/reports`,    { headers: hdr }),
    ]);
    const [alertData, rptData] = await Promise.all([alertRes.json(), rptRes.json()]);
    const alerts  = normaliseAlerts(alertData);
    const reports = normaliseReports(rptData);
    const rows    = crossRef(alerts, reports);
    const documented = rows.filter((r) => r.documented).length;
    const blind      = rows.length - documented;
    const pct = rows.length ? Math.round((documented / rows.length) * 100) : 0;
    if (!rows.length) return "No ops alerts found in the system, sir.";
    const topBlind = rows
      .filter((r) => !r.documented)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${documented} of ${rows.length} ops alerts are backed by formal reports (${pct}% documentation coverage). ` +
      (blind > 0
        ? `${blind} alert${blind !== 1 ? "s" : ""} lack any matching report — potential documentation gaps requiring attention: ${topBlind || "unidentified"}.`
        : "All active alerts are corroborated by at least one formal report — full documentation coverage confirmed.")
    );
  } catch {
    return "Unable to reach ops alerts or reports endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     "#FF6B35",
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

export default function OpsAlertsReportNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [alertRes, rptRes] = await Promise.all([
        fetch(`${base}/v1/ops/alerts`, { headers: hdr }),
        fetch(`${base}/v1/reports`,    { headers: hdr }),
      ]);
      const [alertData, rptData] = await Promise.all([alertRes.json(), rptRes.json()]);
      const alerts  = normaliseAlerts(alertData);
      const reports = normaliseReports(rptData);
      setRows(crossRef(alerts, reports));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oalrpt-toggle", handler);
    return () => window.removeEventListener("jarvis:oalrpt-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const documented = rows.filter((r) => r.documented).length;
  const blind      = rows.length - documented;
  const pct        = rows.length ? Math.round((documented / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "DOCUMENTED") return r.documented;
      if (filter === "BLIND")      return !r.documented;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.severity.toLowerCase().includes(search.toLowerCase()) ||
      r.source.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildOalrptScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS ops-alert report coverage brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: blind > 0 ? `${AMB}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${blind > 0 ? AMB : CY}55`,
          borderRadius: 5,
          color:    blind > 0 ? AMB : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OALRPT
        {blind > 0 && (
          <span style={{ marginLeft: 5, background: AMB, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {blind}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS ALERTS × REPORTS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "ALERTS",     value: rows.length, col: CY },
              { label: "DOCUMENTED", value: documented,  col: GRN },
              { label: "BLIND",      value: blind,       col: AMB },
              { label: "COVERAGE",   value: `${pct}%`,   col: pct >= 60 ? GRN : AMB },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "BLIND"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No alerts match filter.</div>
            )}
            {visible.map((alert) => (
              <div
                key={alert.id}
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}
                style={{
                  background: !alert.documented ? `${AMB}09` : `${GRN}06`,
                  border: `1px solid ${!alert.documented ? AMB + "33" : GRN + "22"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${(SEV_COLOR[alert.severity] || CY)}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: SEV_COLOR[alert.severity] || CY,
                    letterSpacing: 1,
                  }}>
                    {alert.severity}
                  </span>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${alert.documented ? GRN + "44" : AMB + "44"}`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: alert.documented ? GRN : AMB,
                    letterSpacing: 1,
                  }}>
                    {alert.documented ? "DOCUMENTED" : "BLIND"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</span>
                  {alert.documented && (
                    <span style={{ color: DIM, fontSize: 9 }}>{alert.reports.length} rpt</span>
                  )}
                </div>
                {alert.source && (
                  <div style={{ color: DIM, fontSize: 9, marginLeft: 16 }}>{alert.source.slice(0, 30)}</div>
                )}

                {expanded === alert.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${AMB}22`, paddingTop: 6 }}>
                    {alert.documented ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {alert.reports.slice(0, 4).map((rpt) => (
                          <div key={rpt.id} style={{ background: `${GRN}08`, border: `1px solid ${GRN}22`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: CY,
                                fontSize: 9,
                                border: `1px solid ${CY}33`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {rpt.type}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rpt.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {rpt.hits}</span>
                            </div>
                            {rpt.author && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>by {rpt.author}</div>
                            )}
                            {rpt.summary && (
                              <div style={{ color: "#AABBCC", fontSize: 9, marginTop: 2 }}>{rpt.summary.slice(0, 80)}{rpt.summary.length > 80 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No formal reports match this alert — documentation gap requiring analyst attention.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${AMB}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${AMB}18`,
                border: `1px solid ${AMB}55`,
                borderRadius: 5,
                color: AMB,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${AMB}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
