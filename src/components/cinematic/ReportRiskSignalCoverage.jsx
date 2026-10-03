import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const RE = "#F44336";
const GR = "#4CAF50";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const RRSIG_RE = /\b(rrsig|report\s*risk(\s*coverage)?|risk[\s_-]*covered?\s*report|threat\s*coverage\s*report|intelligence\s*gap|report\s*(threat|signal)\s*gap)\b/i;
export function isRrsigQuery(q) { return RRSIG_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(report, signal) {
  const rkw = keywords(
    `${report.title || ""} ${report.description || ""} ${report.type || ""} ${report.author || ""} ${(report.tags || []).join(" ")}`
  );
  const skw = keywords(
    `${signal.name || signal.title || ""} ${signal.description || ""} ${signal.type || ""} ${signal.severity || ""} ${signal.source || ""} ${signal.category || ""}`
  );
  if (!rkw.length || !skw.length) return 0;
  const shared = rkw.filter(w => skw.includes(w));
  return shared.length / Math.max(rkw.length, skw.length);
}

export async function buildRrsigScript() {
  const base = apiBase();
  const [rptRes, sigRes] = await Promise.allSettled([
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);

  const reports = rptRes.status === "fulfilled"
    ? (rptRes.value?.items || rptRes.value || [])
    : [];
  const signals = sigRes.status === "fulfilled"
    ? (sigRes.value?.items || sigRes.value || [])
    : [];

  const covered  = reports.filter(rpt => signals.some(s => relevance(rpt, s) > 0));
  const uncovered = reports.filter(rpt => !signals.some(s => relevance(rpt, s) > 0));

  const snapshot =
    `Reports: ${reports.length} total, ${covered.length} threat-covered by risk signals, ` +
    `${uncovered.length} uncovered. Active risk signals: ${signals.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Report risk signal coverage analysis. Provide exactly 2 sentences: current threat coverage status across intelligence reports, and recommended action to address uncovered reports. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || `${uncovered.length} reports lack corresponding risk signal coverage. Prioritise threat assessment for uncovered intelligence reports.`)
    .replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────
export default function ReportRiskSignalCoverage() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [reports, setReports]     = useState([]);
  const [signals, setSignals]     = useState([]);
  const [filter, setFilter]       = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [briefText, setBriefText] = useState("");
  const [briefing, setBriefing]   = useState(false);
  const [ts, setTs]               = useState(null);
  const timerRef                  = useRef(null);
  const audioRef                  = useRef(null);

  const base    = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rptRes, sigRes] = await Promise.allSettled([
        fetch(`${base}/v1/reports`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const rpt = rptRes.status === "fulfilled" ? (rptRes.value?.items || rptRes.value || []) : [];
      const sig = sigRes.status === "fulfilled" ? (sigRes.value?.items || sigRes.value || []) : [];
      setReports(Array.isArray(rpt) ? rpt : []);
      setSignals(Array.isArray(sig) ? sig : []);
      setTs(new Date());
    } catch { /* retain last data */ }
    finally { setLoading(false); }
  }, [base]);

  const speak = useCallback(async (text) => {
    if (!text) return;
    try {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const r = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text: text.slice(0, 400) }),
      });
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => URL.revokeObjectURL(url);
    } catch { /* TTS unavailable */ }
  }, [base, headers]);

  const runBrief = useCallback(async () => {
    setBriefing(true);
    try {
      const text = await buildRrsigScript();
      setBriefText(text);
      speak(text);
    } catch { setBriefText("Report risk signal coverage assessment unavailable."); }
    finally { setBriefing(false); }
  }, [speak]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) fetchData(); return !v; }); };
    window.addEventListener("jarvis:rrsig-toggle", handler);
    return () => window.removeEventListener("jarvis:rrsig-toggle", handler);
  }, [fetchData]);

  // Enrich each report with matched risk signals
  const enriched = reports.map(rpt => {
    const links = signals
      .map(s => ({ sig: s, score: relevance(rpt, s) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...rpt, links, covered: links.length > 0 };
  });

  const uncoveredCount = enriched.filter(rpt => !rpt.covered).length;

  const filtered = enriched.filter(rpt => {
    if (filter === "THREAT_COVERED" && !rpt.covered)  return false;
    if (filter === "UNCOVERED"      &&  rpt.covered)  return false;
    if (search) {
      const q = search.toLowerCase();
      return (rpt.title || "").toLowerCase().includes(q) ||
             (rpt.description || "").toLowerCase().includes(q) ||
             (rpt.type || "").toLowerCase().includes(q) ||
             (rpt.author || "").toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "THREAT_COVERED", "UNCOVERED"];

  function sigColour(sev = "") {
    const s = sev.toLowerCase();
    if (s === "critical") return RE;
    if (s === "high")     return AM;
    if (s === "medium")   return "#FF9800";
    return CY;
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { if (!open) { setOpen(true); fetchData(); } else setOpen(false); }}
        title="Report × Risk Signal Coverage"
        style={{
          position: "fixed", left: 979320, bottom: 8, zIndex: 126,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ RRSIG
        {uncoveredCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 9, fontWeight: 700,
          }}>{uncoveredCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", right: 18, bottom: 36, zIndex: 126,
          width: "min(560px,92vw)", maxHeight: "74vh",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          display: "flex", flexDirection: "column", gap: 10,
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
              REPORT × RISK SIGNAL COVERAGE
            </span>
            {ts && (
              <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
                {ts.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchData} title="Refresh"
              style={{ background: "none", border: `1px solid ${CY}44`, color: CY, borderRadius: 3, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>
              ↻
            </button>
          </div>

          {/* Stat tiles */}
          {reports.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                ["REPORTS",         reports.length,                             CY],
                ["RISK SIGNALS",    signals.length,                             "#B0BEC5"],
                ["THREAT COVERED",  enriched.filter(r => r.covered).length,     GR],
                ["UNCOVERED",       uncoveredCount,                             AM],
              ].map(([label, val, col]) => (
                <div key={label} style={{
                  flex: 1, textAlign: "center",
                  background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 4px",
                  border: `1px solid ${col}22`,
                }}>
                  <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                  <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                background: filter === t ? CY : "rgba(255,255,255,0.05)",
                color: filter === t ? "#04060A" : "#8AADCC",
                border: `1px solid ${CY}44`, borderRadius: 4, padding: "2px 10px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search reports…"
              style={{
                marginLeft: "auto", background: "rgba(0,229,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 4, padding: "3px 8px",
                color: "#DCEBF5", fontSize: 10, outline: "none", width: 150,
              }}
            />
          </div>

          {/* Report list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {loading && <span style={{ color: "#6E8AA0", fontSize: 11 }}>loading…</span>}
            {!loading && filtered.length === 0 && (
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>No reports match.</span>
            )}
            {filtered.map((rpt, i) => {
              const isExp      = expanded === i;
              const statusColor = rpt.covered ? GR : AM;
              return (
                <div key={rpt.id || i} style={{
                  background: isExp ? "rgba(0,229,255,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${statusColor}33`,
                  borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 6px",
                      background: `${statusColor}22`, color: statusColor,
                      border: `1px solid ${statusColor}55`, borderRadius: 3,
                    }}>{rpt.covered ? "THREAT COVERED" : "UNCOVERED"}</span>
                    <span style={{ fontSize: 11, flex: 1 }}>{rpt.title || "(unnamed report)"}</span>
                    {rpt.type && (
                      <span style={{ fontSize: 9, color: "#6E8AA0" }}>{rpt.type}</span>
                    )}
                    <span style={{ fontSize: 10, color: CY }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {rpt.description && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 3 }}>
                      {rpt.description.slice(0, 100)}{rpt.description.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Expanded: matched risk signals */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                      {rpt.links.length === 0 && (
                        <span style={{ fontSize: 9, color: AM }}>No corroborating risk signals found for this report.</span>
                      )}
                      {rpt.links.map(({ sig, score }, li) => {
                        const col = sigColour(sig.severity);
                        return (
                          <div key={sig.id || li} style={{
                            background: "rgba(0,229,255,0.05)", border: `1px solid ${col}22`,
                            borderRadius: 5, padding: "6px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {sig.severity && (
                                <span style={{
                                  fontSize: 8, padding: "1px 5px",
                                  background: `${col}22`, color: col,
                                  border: `1px solid ${col}55`, borderRadius: 3,
                                  letterSpacing: 1,
                                }}>{sig.severity.toUpperCase()}</span>
                              )}
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>
                                {sig.name || sig.title || "(unnamed signal)"}
                              </span>
                            </div>
                            {sig.description && (
                              <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 2 }}>
                                {sig.description.slice(0, 80)}{sig.description.length > 80 ? "…" : ""}
                              </div>
                            )}
                            {/* Relevance bar */}
                            <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
                              <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                <div style={{ width: `${Math.round(score * 100)}%`, height: "100%", background: CY, borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 8, color: CY, minWidth: 28 }}>{Math.round(score * 100)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI brief */}
          <div style={{ borderTop: `1px solid ${CY}22`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {briefText && (
              <div style={{ fontSize: 10, color: "#B0C4D8", lineHeight: 1.5 }}>{briefText}</div>
            )}
            <button onClick={runBrief} disabled={briefing} style={{
              alignSelf: "flex-start",
              background: briefing ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.14)",
              border: `1px solid ${CY}55`, color: CY, borderRadius: 4,
              padding: "4px 12px", fontSize: 10, cursor: briefing ? "default" : "pointer",
              letterSpacing: 1,
            }}>
              {briefing ? "assessing…" : "▶ ASSESS COVERAGE"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
