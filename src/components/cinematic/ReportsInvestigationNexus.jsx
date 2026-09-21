/**
 * ReportsInvestigationNexus — F597
 * "JARVIS, reports investigation / rptinv / documented cases / investigation report coverage"
 * Cross-references /v1/reports against /v1/investigations.
 * DOCUMENTED investigations (≥1 report keyword-matches) vs UNDOCUMENTED (no report backing).
 * Coverage % tile; ALL/DOCUMENTED/UNDOCUMENTED filter tabs + search; click-to-expand matched reports.
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

const POLL_MS = 90_000;

const RPTINV_RE =
  /\brptinv\b|\breports?.investigation\b|\binvestigation.?reports?\b|\bdocumented.?cases?\b|\bcase.?reports?\b|\bwhich.?cases?.?(have|has).?reports?\b|\breport.?coverage\b|\bundocumented.?invest/i;

export function isRptinvQuery(text) {
  return RPTINV_RE.test(text || "");
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

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    title:   inv.title || inv.name || inv.case_name || `Case ${i + 1}`,
    status:  (inv.status || "OPEN").toUpperCase(),
    lead:    inv.lead || inv.assigned_to || null,
    summary: inv.summary || inv.description || null,
    tags:    inv.tags || [],
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const raw =
    data.reports || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rpt-${i}`,
    title:   r.title || r.name || `Report ${i + 1}`,
    type:    r.type || r.kind || r.category || "report",
    author:  r.author || r.created_by || null,
    summary: r.summary || r.abstract || r.content || null,
    tags:    r.tags || [],
  }));
}

function crossRef(investigations, reports) {
  return investigations.map((inv) => {
    const haystack = `${inv.title} ${inv.summary || ""} ${(inv.tags || []).join(" ")}`;
    const matches = reports
      .map((rpt) => {
        const hits = overlap(
          haystack,
          `${rpt.title} ${rpt.summary || ""} ${(rpt.tags || []).join(" ")}`
        );
        return hits > 0 ? { ...rpt, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...inv, reports: matches, documented: matches.length > 0 };
  });
}

export async function buildRptinvScript() {
  try {
    const base = apiBase();
    const [iRes, rRes] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/reports`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [iData, rData] = await Promise.all([iRes.json(), rRes.json()]);
    const investigations = normaliseInvestigations(iData);
    const reports        = normaliseReports(rData);
    const rows           = crossRef(investigations, reports);
    const documented     = rows.filter((r) => r.documented).length;
    const undocumented   = rows.length - documented;
    const pct            = rows.length ? Math.round((documented / rows.length) * 100) : 0;
    if (!rows.length) return "No investigations found in the system, sir.";
    const openUndoc = rows.filter((r) => !r.documented && r.status === "OPEN");
    return (
      `${documented} of ${rows.length} investigations have associated report coverage ` +
      `(${pct}% documentation rate). ` +
      (openUndoc.length > 0
        ? `${openUndoc.length} open case${openUndoc.length !== 1 ? "s" : ""} lack any report documentation — priority gap: ${openUndoc.slice(0, 2).map((r) => r.title).join(", ")}.`
        : `${undocumented} closed or inactive case${undocumented !== 1 ? "s" : ""} remain undocumented.`)
    );
  } catch {
    return "Unable to reach investigations or reports endpoints, sir.";
  }
}

export default function ReportsInvestigationNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [iRes, rRes] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/reports`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [iData, rData] = await Promise.all([iRes.json(), rRes.json()]);
      setRows(crossRef(normaliseInvestigations(iData), normaliseReports(rData)));
    } catch {
      /* network errors are non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:rptinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:rptinv-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const documented   = rows.filter((r) => r.documented);
      const undocumented = rows.filter((r) => !r.documented);
      const openUndoc    = undocumented.filter((r) => r.status === "OPEN");
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess report coverage of investigations: ${rows.length} investigations total, ` +
            `${documented.length} have associated report backing, ` +
            `${undocumented.length} are undocumented. ` +
            `Open cases without reports: ${openUndoc.length} — ` +
            `${openUndoc.slice(0, 3).map((r) => r.title).join(", ") || "none"}. ` +
            "Give a 2-sentence operational documentation coverage assessment and recommended priority action.",
        }),
      });
      const d = await resp.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [rows]);

  const documented   = rows.filter((r) => r.documented).length;
  const undocumented = rows.length - documented;
  const pct          = rows.length ? Math.round((documented / rows.length) * 100) : 0;
  const openUndoc    = rows.filter((r) => !r.documented && r.status === "OPEN").length;

  const visible = rows
    .filter((r) => {
      if (tab === "DOCUMENTED")   return r.documented;
      if (tab === "UNDOCUMENTED") return !r.documented;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q) ||
        (r.lead || "").toLowerCase().includes(q) ||
        (r.summary || "").toLowerCase().includes(q)
      );
    });

  const STATUS_COLOR = {
    OPEN: AMB, CLOSED: GRN, ESCALATED: RED,
    "IN PROGRESS": CY, ACTIVE: CY,
  };

  const TYPE_COLOR = {
    report: CY, intelligence: RED, brief: AMB,
    analysis: "#BB88FF", summary: GRN, assessment: "#FF88CC",
  };

  const BTN_LEFT = 78_860;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 150,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${openUndoc > 0 ? AMB : CY}55`,
    borderRadius: 6,
    cursor: "pointer",
    color: CY,
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    backdropFilter: "blur(6px)",
  };

  const PANEL = {
    position: "fixed",
    left: BTN_LEFT - 340,
    bottom: 38,
    zIndex: 150,
    width: 400,
    maxHeight: "70vh",
    overflowY: "auto",
    background: "rgba(6,10,16,0.94)",
    border: `1px solid ${CY}44`,
    borderRadius: 10,
    padding: 14,
    fontFamily: "'JetBrains Mono',monospace",
    color: "#DCEBF5",
    backdropFilter: "blur(10px)",
    boxShadow: `0 0 40px ${CY}18`,
  };

  const tabStyle = (t) => ({
    padding: "3px 8px",
    border: `1px solid ${tab === t ? CY : CY + "33"}`,
    borderRadius: 4,
    cursor: "pointer",
    background: tab === t ? CY + "22" : "transparent",
    color: tab === t ? CY : DIM,
    fontSize: 10,
    letterSpacing: 1,
  });

  return (
    <>
      <button style={BTN_STYLE} onClick={() => setOpen((o) => !o)} title="Reports × Investigation Nexus (RPTINV)">
        ◈ RPTINV
        {openUndoc > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {openUndoc}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REPORTS × INVESTIGATION NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "CASES",      value: rows.length,  color: CY },
              { label: "DOCUMENTED", value: documented,   color: documented > 0 ? GRN : DIM },
              { label: "UNDOCUMENTED", value: undocumented, color: undocumented > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>REPORT COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search investigations…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No investigations match.</div>
            )}
            {visible.map((inv) => (
              <div
                key={inv.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${inv.documented ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: inv.documented ? GRN : AMB, fontSize: 10 }}>{inv.documented ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{inv.title}</span>
                  <span style={{ color: STATUS_COLOR[inv.status] || CY, fontSize: 9, border: `1px solid ${(STATUS_COLOR[inv.status] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{inv.status}</span>
                  <span style={{ color: inv.documented ? GRN : DIM, fontSize: 9 }}>{inv.documented ? `${inv.reports.length} rpt.` : "UNDOC"}</span>
                </div>
                {inv.lead && (
                  <div style={{ color: DIM, fontSize: 9 }}>lead: {inv.lead}</div>
                )}
                {inv.summary && !inv.lead && (
                  <div style={{ color: DIM, fontSize: 9 }}>{inv.summary.slice(0, 70)}{inv.summary.length > 70 ? "…" : ""}</div>
                )}

                {expanded === inv.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {inv.documented ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {inv.reports.map((rpt) => (
                          <div key={rpt.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: TYPE_COLOR[rpt.type] || CY, fontSize: 9, border: `1px solid ${(TYPE_COLOR[rpt.type] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rpt.type}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rpt.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {rpt.hits}</span>
                            </div>
                            {rpt.author && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>by: {rpt.author}</div>
                            )}
                            {rpt.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>{rpt.summary.slice(0, 80)}{rpt.summary.length > 80 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No reports matched this investigation — documentation gap.</div>
                    )}
                    {inv.summary && inv.lead && (
                      <div style={{ marginTop: 5, color: DIM, fontSize: 9, borderLeft: `2px solid ${CY}33`, paddingLeft: 6 }}>
                        {inv.summary.slice(0, 100)}{inv.summary.length > 100 ? "…" : ""}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${CY}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${CY}18`, border: `1px solid ${CY}55`, borderRadius: 5, color: CY, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${CY}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
