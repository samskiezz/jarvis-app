/**
 * OpsReportCoverage — F58
 * /v1/ops/events × /v1/reports → keyword-correlates significant ops events against the
 * reports catalogue to surface REPORTED vs UNREPORTED events.
 * Voice trigger: "ops reports"/"opres"/"unreported events"/"event reports"/"ops report coverage".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPRES_RE =
  /\bops?\s*report(?:s|ed|ing)?\b|\bopres\b|\bunreported\s*events?\b|\bevent\s*report(?:s|ed)?\b|\bops\s*report\s*coverage\b|\breport\s*coverage\s*ops?\b|\bops?\s*doc(?:s|umentation)?\b/i;

export function isOpresQuery(text) {
  return OPRES_RE.test(text || "");
}

async function fetchOpsEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const rows =
    Array.isArray(d)           ? d
    : Array.isArray(d?.events) ? d.events
    : Array.isArray(d?.data)   ? d.data
    : Array.isArray(d?.items)  ? d.items
    : Array.isArray(d?.results)? d.results
    : [];
  return rows.filter(e => !e.severity || e.severity >= 30);
}

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)             ? d
    : Array.isArray(d?.reports)       ? d.reports
    : Array.isArray(d?.data)          ? d.data
    : Array.isArray(d?.items)         ? d.items
    : Array.isArray(d?.results)       ? d.results
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.description, obj?.message,
    obj?.type, obj?.category, obj?.subject, obj?.summary,
    obj?.event_type, obj?.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function correlate(events, reports) {
  return events.map(ev => {
    const evWords = new Set(keywords(ev));
    const matched = reports.filter(rpt => {
      const rWords = keywords(rpt);
      return rWords.some(w => evWords.has(w));
    });
    const status = matched.length > 0 ? "REPORTED" : "UNREPORTED";
    return { event: ev, reports: matched, status };
  });
}

export async function buildOpresScript() {
  const [evRes, rpRes] = await Promise.allSettled([fetchOpsEvents(), fetchReports()]);
  const events  = evRes.status === "fulfilled" ? evRes.value : [];
  const reports = rpRes.status === "fulfilled" ? rpRes.value : [];
  if (!events.length) return "No significant ops events available to assess report coverage, sir.";
  const rows       = correlate(events, reports);
  const reported   = rows.filter(r => r.status === "REPORTED").length;
  const unreported = rows.filter(r => r.status === "UNREPORTED").length;
  return (
    `Ops report coverage: ${rows.length} event${rows.length !== 1 ? "s" : ""} assessed against ` +
    `${reports.length} report${reports.length !== 1 ? "s" : ""}. ` +
    `${reported} REPORTED, ${unreported} UNREPORTED — no backing documentation.`
  );
}

const TABS = ["ALL", "REPORTED", "UNREPORTED"];

export default function OpsReportCoverage() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [q, setQ]               = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [verdict, setVerdict]   = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [events, reports] = await Promise.all([fetchOpsEvents(), fetchReports()]);
      setRows(correlate(events, reports));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:opres-toggle", toggle);
    return () => window.removeEventListener("jarvis:opres-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  async function assess(row, idx) {
    setAssessing(idx);
    const evName  = row.event?.title || row.event?.name || row.event?.message || row.event?.type || "this event";
    const rptList = row.reports.slice(0, 3).map(r => r.title || r.name || "report").join(", ");
    const prompt  = row.reports.length
      ? `Briefly assess ops report coverage for the event "${evName}". Matching reports: ${rptList}. Two sentences max.`
      : `The ops event "${evName}" has NO report documentation. What should be documented first? Two sentences max.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d   = await r.json();
      const ans = (d.answer || "No assessment available.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setVerdict(v => ({ ...v, [idx]: ans }));
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ans, voice }),
      }).then(async res => {
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const a   = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.play().catch(() => {});
      }).catch(() => {});
    } catch (_) {
      setVerdict(v => ({ ...v, [idx]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    const unreported = rows.filter(r => r.status === "UNREPORTED").length;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: 13480, zIndex: 67,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${unreported > 0 ? AMB : CY}44`,
          color: unreported > 0 ? AMB : CY, fontSize: 10, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
        title="Ops Events × Report Coverage"
      >
        ◈ OPRES{unreported > 0 ? ` ${unreported}` : ""}
      </button>
    );
  }

  const reported   = rows.filter(r => r.status === "REPORTED").length;
  const unreported = rows.filter(r => r.status === "UNREPORTED").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (q) {
      const n = (
        r.event?.title || r.event?.name || r.event?.message || r.event?.type || ""
      ).toLowerCase();
      return n.includes(q.toLowerCase());
    }
    return true;
  });

  const statusColor = s => s === "REPORTED" ? GRN : RED;

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, zIndex: 200, width: "min(480px,92vw)",
      background: "rgba(6,10,16,0.96)", border: `1px solid ${CY}33`, borderRadius: 12,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 40px ${CY}18`, display: "flex", flexDirection: "column", maxHeight: "84vh",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ OPS EVENTS × REPORTS</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4A6070" }}>COVERAGE</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "EVENTS",     val: rows.length,  col: CY },
          { label: "REPORTED",   val: reported,     col: GRN },
          { label: "UNREPORTED", val: unreported,   col: RED },
          { label: "REPORTS",    val: rows.reduce((n, r) => n + r.reports.length, 0), col: AMB },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, textAlign: "center", background: `${t.col}09`,
            border: `1px solid ${t.col}22`, borderRadius: 6, padding: "6px 0",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
            <div style={{ fontSize: 9, color: "#4A6070", letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 16px 4px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none", border: `1px solid ${tab === t ? CY : CY + "22"}`,
            color: tab === t ? CY : "#4A6070", fontSize: 9, letterSpacing: 1, padding: "2px 8px",
            borderRadius: 3, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search events…"
          style={{
            marginLeft: "auto", background: "transparent", border: `1px solid ${CY}22`,
            color: "#DCEBF5", fontSize: 10, padding: "2px 8px", borderRadius: 3, outline: "none", width: 140,
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {loading && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            loading…
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 16px", color: RED, fontSize: 11 }}>⚠ {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            no events match
          </div>
        )}
        {visible.map((row, idx) => {
          const evName = row.event?.title || row.event?.name || row.event?.message || row.event?.type || `Event ${idx + 1}`;
          const sev    = row.event?.severity;
          const isExp  = expanded === idx;
          const sc     = statusColor(row.status);
          return (
            <div key={idx} style={{ borderBottom: `1px solid ${CY}0D` }}>
              <div
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 16px", cursor: "pointer",
                  background: isExp ? `${CY}08` : "transparent",
                }}
              >
                <span style={{
                  width: 70, textAlign: "center", fontSize: 9, letterSpacing: 1,
                  color: sc, border: `1px solid ${sc}44`, borderRadius: 3, padding: "1px 4px",
                  flexShrink: 0,
                }}>{row.status}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {evName}
                </span>
                {sev != null && (
                  <span style={{ fontSize: 9, color: sev >= 80 ? RED : sev >= 50 ? AMB : "#4A6070", flexShrink: 0 }}>
                    sev {sev}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "#4A6070", flexShrink: 0 }}>
                  {row.reports.length} rpt{row.reports.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 10, color: "#2E4050" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 16px 10px 24px" }}>
                  {row.reports.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      {row.reports.slice(0, 5).map((rpt, ri) => (
                        <div key={ri} style={{
                          padding: "4px 8px", marginBottom: 3, borderRadius: 4,
                          background: `${GRN}09`, border: `1px solid ${GRN}22`,
                        }}>
                          <span style={{ fontSize: 10, color: GRN }}>
                            {rpt.title || rpt.name || rpt.id || "Untitled report"}
                          </span>
                          {rpt.type && (
                            <span style={{ marginLeft: 8, fontSize: 9, color: "#4A6070" }}>{rpt.type}</span>
                          )}
                        </div>
                      ))}
                      {row.reports.length > 5 && (
                        <div style={{ fontSize: 9, color: "#4A6070", padding: "2px 8px" }}>
                          +{row.reports.length - 5} more reports
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: RED, marginBottom: 8, padding: "4px 8px" }}>
                      No reports document this event.
                    </div>
                  )}

                  {verdict[idx] && (
                    <div style={{
                      padding: "6px 8px", borderRadius: 4, background: `${CY}09`,
                      border: `1px solid ${CY}22`, fontSize: 10, color: "#DCEBF5", marginBottom: 6,
                    }}>
                      {verdict[idx]}
                    </div>
                  )}

                  <button
                    onClick={() => assess(row, idx)}
                    disabled={assessing === idx}
                    style={{
                      background: assessing === idx ? `${CY}11` : `${CY}18`,
                      border: `1px solid ${CY}44`, color: CY, fontSize: 9, letterSpacing: 1,
                      padding: "3px 10px", borderRadius: 3, cursor: assessing === idx ? "default" : "pointer",
                    }}
                  >
                    {assessing === idx ? "…assessing" : "▶ ASSESS"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 16px", borderTop: `1px solid ${CY}11`,
        fontSize: 9, color: "#2E4050", display: "flex", gap: 12,
      }}>
        <span>{rows.length} events · {rows.reduce((n, r) => n + r.reports.length, 0)} report links</span>
        <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", color: `${CY}66`, cursor: "pointer", fontSize: 9 }}>↺ refresh</button>
      </div>
    </div>
  );
}
