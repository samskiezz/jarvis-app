/**
 * ReportInvestigationCoverage — F50.
 *
 * Cross-references open investigations against the reports catalogue to surface
 * which investigations are BACKED (at least one report contains relevant data)
 * and which are UNBACKED (no backing report — documentation gap).
 *
 * Endpoints used:
 *   /v1/investigations  — open investigation cases
 *   /v1/reports         — intelligence / operational reports catalogue
 *
 * Stat tiles: investigations / reports / backed / unbacked
 * Filter tabs: ALL / BACKED / UNBACKED
 * Expand investigation → matched report cards (title + type)
 * ▶ ASSESS per investigation → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *   via jarvis:speak-dossier
 * 90 s auto-refresh.
 *
 * Voice: "report investigation" / "investigation reports" / "repinv" /
 *        "unbacked investigations" / "investigation documentation" /
 *        "undocumented investigations" / "missing reports"
 *   → jarvis:repinv-toggle + TTS via buildRepInvScript()
 *
 * Toggle: ◈ REPINV at left:12360, bottom:8, zIndex:132.
 * Mounted in App.jsx; wired in JarvisBrain.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3D5A";
const BTN_LEFT   = 12360;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function toArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseInvestigations(raw) {
  return toArray(raw).map((inv) => ({
    id:          inv.id || inv.investigation_id || String(Math.random()),
    name:        inv.name || inv.title || inv.case_name || "Unnamed Investigation",
    status:      inv.status || inv.state || "open",
    priority:    inv.priority || inv.severity || inv.risk_level || "",
    description: inv.description || inv.summary || inv.details || "",
    tags:        Array.isArray(inv.tags) ? inv.tags : [],
    keywords: [
      inv.name || "", inv.title || "", inv.case_name || "",
      inv.type || "", inv.category || "",
      ...(Array.isArray(inv.tags) ? inv.tags : []),
      inv.description || "",
    ].join(" ").toLowerCase(),
  }));
}

function normaliseReports(raw) {
  return toArray(raw).map((r) => ({
    id:          r.id || r.report_id || String(Math.random()),
    name:        r.name || r.title || r.report_name || "Unnamed Report",
    type:        r.type || r.category || r.report_type || "",
    description: r.description || r.summary || r.abstract || "",
    tags:        Array.isArray(r.tags) ? r.tags : [],
    keywords: [
      r.name || "", r.title || "", r.type || "", r.category || "",
      ...(Array.isArray(r.tags) ? r.tags : []),
      r.description || "",
    ].join(" ").toLowerCase(),
  }));
}

function kwMatch(a = "", b = "") {
  const words = (s) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
  const aw = words(a);
  const bw = words(b);
  return aw.some((w) => bw.includes(w));
}

function correlate(investigations, reports) {
  return investigations.map((inv) => {
    const matched = reports.filter(
      (r) =>
        kwMatch(inv.name, r.keywords) ||
        kwMatch(inv.keywords, r.name) ||
        kwMatch(inv.keywords, r.keywords)
    );
    return { ...inv, reports: matched, backed: matched.length > 0 };
  });
}

// ─── exported helpers for JarvisBrain voice routing ──────────────────────────

export function isRepInvQuery(q = "") {
  const lq = q.toLowerCase();
  return (
    lq.includes("repinv") ||
    lq.includes("report investigation") ||
    lq.includes("investigation report") ||
    lq.includes("unbacked investigation") ||
    lq.includes("investigation documentation") ||
    lq.includes("undocumented investigation") ||
    lq.includes("missing reports") ||
    lq.includes("report coverage") && lq.includes("invest")
  );
}

export async function buildRepInvScript() {
  const base = apiBase();
  try {
    const [invRaw, repRaw] = await Promise.all([
      fetch(`${base}/v1/investigations`).then((r) => r.json()).catch(() => []),
      fetch(`${base}/v1/reports`).then((r) => r.json()).catch(() => []),
    ]);
    const investigations = normaliseInvestigations(invRaw);
    const reports        = normaliseReports(repRaw);
    const corr           = correlate(investigations, reports);
    const nBacked   = corr.filter((inv) => inv.backed).length;
    const nUnbacked = corr.length - nBacked;
    if (!corr.length) return "No open investigations found to cross-reference against reports, sir.";
    return `Report investigation coverage analysis complete, sir. ${corr.length} open investigations reviewed against ${reports.length} reports. ${nBacked} investigations have backing report documentation; ${nUnbacked} are unbacked — flagged as documentation gaps. Review the REPINV panel for the full breakdown.`;
  } catch {
    return "Report investigation coverage is standing by — endpoint temporarily unreachable, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ReportInvestigationCoverage() {
  const [open, setOpen]                   = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [reports, setReports]             = useState([]);
  const [corr, setCorr]                   = useState([]);
  const [filter, setFilter]               = useState("ALL");
  const [loading, setLoading]             = useState(false);
  const [err, setErr]                     = useState(null);
  const [expanded, setExpanded]           = useState(null);
  const [assessing, setAssessing]         = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [invRaw, repRaw] = await Promise.all([
        fetch(`${base}/v1/investigations`).then((r) => r.json()),
        fetch(`${base}/v1/reports`).then((r) => r.json()),
      ]);
      const invs  = normaliseInvestigations(invRaw);
      const reps  = normaliseReports(repRaw);
      setInvestigations(invs);
      setReports(reps);
      setCorr(correlate(invs, reps));
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:repinv-toggle", onToggle);
    return () => window.removeEventListener("jarvis:repinv-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess(inv) {
    setAssessing(inv.id);
    try {
      const repTitles = inv.reports.map((r) => r.name).join(", ") || "none";
      const prompt = `Investigation: "${inv.name}" (status: ${inv.status}, priority: ${inv.priority || "unknown"}). Backing reports: ${repTitles}. In two sentences, assess whether the available reports adequately document this investigation and what documentation gap exists if any.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const script = (d.answer || "Assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch {
      // silent
    } finally {
      setAssessing(null);
    }
  }

  const nBacked   = corr.filter((inv) => inv.backed).length;
  const nUnbacked = corr.length - nBacked;

  const visible = corr.filter((inv) => {
    if (filter === "BACKED")   return inv.backed;
    if (filter === "UNBACKED") return !inv.backed;
    return true;
  });

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 132,
    background: open ? `${CY}22` : "rgba(5,10,18,0.82)",
    border: `1px solid ${open ? CY : CY + "44"}`,
    borderRadius: 6, padding: "3px 10px",
    color: open ? CY : `${CY}99`, fontSize: 10, letterSpacing: 1.5,
    fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
    display: "flex", alignItems: "center", gap: 6,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen((v) => !v)} title="Report × Investigation Coverage">
        ◈ REPINV
        {nUnbacked > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 4,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{nUnbacked}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 54, right: 18, width: 460, maxHeight: "80vh",
          background: "rgba(3,8,16,0.97)", border: `1px solid ${CY}33`,
          borderRadius: 14, zIndex: 133, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace", overflow: "hidden",
          boxShadow: `0 0 60px ${CY}12`,
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◈ REPORT × INVESTIGATION COVERAGE
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: `${CY}66`, fontSize: 9 }}>◌ LOADING</span>}
              <button onClick={load} style={{
                background: "transparent", border: `1px solid ${CY}33`, borderRadius: 4,
                color: `${CY}99`, fontSize: 9, padding: "2px 7px", cursor: "pointer",
                fontFamily: "inherit",
              }}>↻</button>
              <button onClick={() => setOpen(false)} style={{
                background: "transparent", border: "none",
                color: `${CY}66`, fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}18` }}>
            {[
              { label: "INVESTIGATIONS", val: corr.length,   color: CY },
              { label: "REPORTS",        val: reports.length, color: CY },
              { label: "BACKED",   val: nBacked,   color: GREEN },
              { label: "UNBACKED", val: nUnbacked, color: nUnbacked > 0 ? AMBER : `${CY}44` },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}1A`,
                borderRadius: 8, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: `${CY}55`, fontSize: 8, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18` }}>
            {["ALL", "BACKED", "UNBACKED"].map((tab) => (
              <button key={tab} onClick={() => setFilter(tab)} style={{
                background: filter === tab ? `${CY}18` : "transparent",
                border: `1px solid ${filter === tab ? CY : CY + "33"}`,
                borderRadius: 5, padding: "3px 10px",
                color: filter === tab ? CY : `${CY}66`,
                fontSize: 9, letterSpacing: 1, cursor: "pointer",
                fontFamily: "inherit",
              }}>{tab}</button>
            ))}
          </div>

          {/* Investigation list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {err && (
              <div style={{ padding: "16px 18px", color: RED, fontSize: 11 }}>
                ⚠ {err}
              </div>
            )}
            {!err && visible.length === 0 && !loading && (
              <div style={{ padding: "20px 18px", color: `${CY}44`, fontSize: 11, textAlign: "center" }}>
                No investigations in this view
              </div>
            )}
            {visible.map((inv) => (
              <div key={inv.id}>
                {/* Investigation row */}
                <div
                  onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 14px", cursor: "pointer",
                    borderLeft: `2px solid ${inv.backed ? GREEN : AMBER}`,
                    background: expanded === inv.id ? `${CY}08` : "transparent",
                  }}
                >
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 4, fontWeight: 700,
                    background: inv.backed ? `${GREEN}22` : `${AMBER}22`,
                    color: inv.backed ? GREEN : AMBER,
                    flexShrink: 0,
                  }}>
                    {inv.backed ? "BACKED" : "UNBACKED"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#DCEBF5", fontSize: 11, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {inv.name}
                    </div>
                    {inv.status && (
                      <div style={{ color: `${CY}66`, fontSize: 9, marginTop: 2 }}>{inv.status}{inv.priority ? ` · ${inv.priority}` : ""}</div>
                    )}
                  </div>
                  {inv.backed && (
                    <span style={{ color: `${CY}55`, fontSize: 9, flexShrink: 0 }}>
                      {inv.reports.length} rpt
                    </span>
                  )}
                  <span style={{ color: `${CY}33`, fontSize: 10 }}>
                    {expanded === inv.id ? "▲" : "▼"}
                  </span>
                </div>

                {/* Expanded detail */}
                {expanded === inv.id && (
                  <div style={{ background: "rgba(41,231,255,0.04)", padding: "10px 14px 12px 28px", borderBottom: `1px solid ${CY}12` }}>
                    {inv.description && (
                      <p style={{ color: `${CY}88`, fontSize: 10, margin: "0 0 8px", lineHeight: 1.5 }}>
                        {inv.description.slice(0, 180)}{inv.description.length > 180 ? "…" : ""}
                      </p>
                    )}
                    {inv.reports.length > 0 ? (
                      <>
                        <div style={{ color: `${CY}55`, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
                          BACKED BY {inv.reports.length} REPORT{inv.reports.length !== 1 ? "S" : ""}
                        </div>
                        {inv.reports.map((r) => (
                          <div key={r.id} style={{
                            background: "rgba(0,200,120,0.07)", border: `1px solid ${GREEN}33`,
                            borderRadius: 6, padding: "5px 10px", marginBottom: 4,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>{r.name}</span>
                            {r.type && (
                              <span style={{ color: GREEN, fontSize: 9, fontWeight: 700 }}>
                                {r.type}
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    ) : (
                      <div style={{ color: AMBER, fontSize: 10 }}>
                        ⚠ No backing reports found — documentation gap
                      </div>
                    )}
                    <button
                      onClick={() => assess(inv)}
                      disabled={assessing === inv.id}
                      style={{
                        marginTop: 8, background: `${CY}12`, border: `1px solid ${CY}44`,
                        borderRadius: 5, padding: "4px 12px", color: CY,
                        fontSize: 9, letterSpacing: 1, cursor: "pointer",
                        fontFamily: "inherit", opacity: assessing === inv.id ? 0.5 : 1,
                      }}
                    >
                      {assessing === inv.id ? "◌ ASSESSING…" : "▶ ASSESS"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            borderTop: `1px solid ${CY}18`, padding: "6px 14px",
            display: "flex", justifyContent: "space-between",
            color: `${CY}44`, fontSize: 9, letterSpacing: 1,
          }}>
            <span>↻ 90 s auto-refresh</span>
            <span>{visible.length} investigation{visible.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}
    </>
  );
}
