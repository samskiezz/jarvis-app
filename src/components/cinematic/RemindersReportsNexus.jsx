/**
 * RemindersReportsNexus — F607
 * "JARVIS, remrpt / reminders report / report reminders / report-backed reminders / floating report notes"
 * Cross-references /reminders/list against /v1/reports.
 * REPORT-BACKED reminders (≥1 report keyword-matches) vs FLOATING (no report backing).
 * Coverage % tile; ALL/REPORT-BACKED/FLOATING filter tabs + search; click-to-expand matched reports.
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

const REMRPT_RE =
  /\bremrpt\b|\breminders?.reports?\b|\breports?.reminders?\b|\breport.?backed.?reminders?\b|\bfloating.?report.?notes?\b|\breminder.?report.?coverage\b|\bunlinked.?report.?reminders?\b/i;

export function isRemrptQuery(text) {
  return REMRPT_RE.test(text || "");
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

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rem-${i}`,
    content: r.content || r.text || r.title || r.note || `Reminder ${i + 1}`,
    kind:    (r.kind || r.type || "reminder").toLowerCase(),
    status:  (r.status || "pending").toLowerCase(),
    tags:    r.tags || [],
  }));
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data)           ? data
    : Array.isArray(data?.reports)          ? data.reports
    : Array.isArray(data?.items)            ? data.items
    : Array.isArray(data?.results)          ? data.results
    : [];
  return arr.map((r, i) => ({
    id:      r.id      || String(i),
    title:   r.title   || r.name  || `Report ${i + 1}`,
    type:    (r.type   || r.kind  || r.category || "REPORT").toString().toUpperCase(),
    author:  r.author  || r.created_by || "",
    summary: (r.summary || r.description || r.abstract || "").toString().slice(0, 200),
    tags:    Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags || ""),
  }));
}

function crossRef(reminders, reports) {
  return reminders.map((rem) => {
    const haystack = `${rem.content} ${(rem.tags || []).join(" ")}`;
    const matches = reports
      .map((rpt) => {
        const hits = overlap(haystack, `${rpt.title} ${rpt.summary} ${rpt.tags}`);
        return hits > 0 ? { ...rpt, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);
    return { ...rem, reports: matches, backed: matches.length > 0 };
  });
}

export async function buildRemrptScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [remRes, rptRes] = await Promise.all([
      fetch(`${base}/reminders/list`, { headers: hdr }),
      fetch(`${base}/v1/reports`,     { headers: hdr }),
    ]);
    const [remData, rptData] = await Promise.all([remRes.json(), rptRes.json()]);
    const reminders = normaliseReminders(remData);
    const reports   = normaliseReports(rptData);
    const rows      = crossRef(reminders, reports);
    const backed    = rows.filter((r) => r.backed).length;
    const floating  = rows.length - backed;
    const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topFloating = rows
      .filter((r) => !r.backed)
      .slice(0, 2)
      .map((r) => r.content.slice(0, 40))
      .join("; ");
    return (
      `${backed} of ${rows.length} reminders are backed by formal reports (${pct}% coverage). ` +
      (floating > 0
        ? `${floating} reminder${floating !== 1 ? "s" : ""} have no matching report — undocumented notes: ${topFloating || "unknown"}.`
        : "All reminders are supported by formal reports.")
    );
  } catch {
    return "Unable to reach reminders or reports endpoints, sir.";
  }
}

export default function RemindersReportsNexus() {
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
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [remRes, rptRes] = await Promise.all([
        fetch(`${base}/reminders/list`, { headers: hdr }),
        fetch(`${base}/v1/reports`,     { headers: hdr }),
      ]);
      const [remData, rptData] = await Promise.all([remRes.json(), rptRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseReports(rptData)));
    } catch {
      /* non-fatal */
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
    window.addEventListener("jarvis:remrpt-toggle", toggle);
    return () => window.removeEventListener("jarvis:remrpt-toggle", toggle);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const backed   = rows.filter((r) => r.backed);
      const floating = rows.filter((r) => !r.backed);
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Assess reminder-to-report linkage: ${rows.length} reminders total, ` +
            `${backed.length} are backed by formal reports, ` +
            `${floating.length} have no associated report (floating undocumented notes). ` +
            `Top floating: ${floating.slice(0, 3).map((r) => r.content.slice(0, 40)).join("; ") || "none"}. ` +
            "Give a 2-sentence operational-documentation coverage assessment with recommended action.",
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

  const backed   = rows.filter((r) => r.backed).length;
  const floating = rows.length - backed;
  const pct      = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (tab === "REPORT-BACKED") return r.backed;
      if (tab === "FLOATING")      return !r.backed;
      return true;
    })
    .filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        r.content.toLowerCase().includes(q) ||
        r.kind.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    });

  const KIND_COLOR = {
    note: CY, task: GRN, alert: RED, reminder: AMB,
  };

  const RPT_TYPE_COLOR = {
    THREAT: RED, INTEL: AMB, OPS: GRN, KNOWLEDGE: CY,
    REPORT: CY, OTHER: DIM,
  };

  const BTN_LEFT = 87_320;
  const BTN_STYLE = {
    position: "fixed",
    left: BTN_LEFT,
    bottom: 8,
    zIndex: 160,
    padding: "4px 10px",
    background: "rgba(5,8,13,0.82)",
    border: `1px solid ${floating > 0 ? AMB : CY}55`,
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
    zIndex: 160,
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
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Reminders × Reports Nexus (REMRPT)"
      >
        ◈ REMRPT
        {floating > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 9 }}>
            {floating}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>REMINDERS × REPORTS NEXUS</span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",     value: rows.length, color: CY },
              { label: "REPORT-BACKED", value: backed,      color: backed > 0 ? GRN : DIM },
              { label: "FLOATING",      value: floating,    color: floating > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
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
            {["ALL", "REPORT-BACKED", "FLOATING"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.backed ? GRN : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.backed ? GRN : AMB, fontSize: 10 }}>{rem.backed ? "●" : "○"}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || CY, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rem.kind}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.content.slice(0, 60)}{rem.content.length > 60 ? "…" : ""}</span>
                  <span style={{ color: rem.backed ? GRN : DIM, fontSize: 9 }}>
                    {rem.backed ? `${rem.reports.length} report${rem.reports.length !== 1 ? "s" : ""}` : "FLOATING"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
                    {rem.backed ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.reports.map((rpt) => (
                          <div key={rpt.id} style={{ background: "rgba(0,229,160,0.04)", border: `1px solid ${GRN}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: RPT_TYPE_COLOR[rpt.type] || CY, fontSize: 9, border: `1px solid ${(RPT_TYPE_COLOR[rpt.type] || CY)}44`, borderRadius: 3, padding: "1px 4px" }}>{rpt.type}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{rpt.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {rpt.hits}</span>
                            </div>
                            {rpt.author && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>by {rpt.author}</div>
                            )}
                            {rpt.summary && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>{rpt.summary.slice(0, 100)}{rpt.summary.length > 100 ? "…" : ""}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No formal reports matched this reminder — undocumented operational note.</div>
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
