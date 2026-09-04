/**
 * ReportRiskCoverageMonitor — F492
 * "JARVIS, report risk / risk coverage / undocumented risks / rrisk / which risks have reports"
 * Cross-references /v1/reports + /entities/RiskSignal.
 * Finds which active risk signals are formally documented in intelligence reports
 * (DOCUMENTED) vs which have no matching report (UNDOCUMENTED — operational blind spots).
 * Severity-sorted; click to expand matched report detail; ▶ ASSESS → /v1/jarvis/agent/chat + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4444";
const ORG = "#FF8C42";
const YLW = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#8899AA";
const AMB = "#FFA500";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 120_000;

const RRISK_RE =
  /\breport.?risk\b|\brisk.?report\b|\bundocumented.?risk\b|\brrisk\b|\bwhich.risks.have.reports?\b|\brisk.coverage\b|\brisk.document\b|\bformal.?risk\b|\brepor?ted.risk\b|\brisk.doc(ument)?s?\b/i;

export function isRriskQuery(text) {
  return RRISK_RE.test(text || "");
}

function severityOrder(sev) {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL") return 0;
  if (s === "HIGH")     return 1;
  if (s === "MEDIUM")   return 2;
  return 3;
}

function severityColor(sev) {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return ORG;
  if (s === "MEDIUM")   return YLW;
  return GRN;
}

function normaliseReports(data) {
  if (!data) return [];
  const raw = data.reports || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:      r.id || `rpt-${i}`,
    title:   r.title || r.name || r.report_name || `Report ${i + 1}`,
    type:    r.type || r.report_type || r.kind || "OTHER",
    summary: r.summary || r.abstract || r.description || null,
    author:  r.author || r.created_by || null,
    status:  r.status || null,
    tags:    [
      ...(r.tags || []),
      ...(r.labels || []),
      r.subject, r.entity, r.related_entity,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
    keywords: [
      r.title || "", r.summary || "", r.abstract || "", r.description || "",
      ...(r.tags || []),
    ].join(" ").toLowerCase(),
  }));
}

function normaliseSignals(data) {
  if (!data) return [];
  const raw = data.signals || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `rs-${i}`,
    name:        s.name || s.title || s.signal_name || `Signal ${i + 1}`,
    severity:    (s.severity || s.level || s.risk_level || "LOW").toUpperCase(),
    description: s.description || s.summary || s.detail || null,
    source:      s.source || s.origin || null,
    tags:        [
      ...(s.tags || []),
      ...(s.labels || []),
      s.target, s.entity, s.related_entity,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
    keywords:    [
      s.name || "", s.title || "", s.description || "",
      ...(s.tags || []),
    ].join(" ").toLowerCase(),
  }));
}

function scoreMatch(signal, reports) {
  const sigWords = signal.keywords.split(/\s+/).filter(w => w.length > 3);
  const hits = [];
  for (const rpt of reports) {
    const count = sigWords.filter(w => rpt.keywords.includes(w)).length;
    if (count > 0) hits.push({ ...rpt, relevance: count });
  }
  hits.sort((a, b) => b.relevance - a.relevance);
  return hits;
}

function buildCoverage(signals, reports) {
  return signals
    .map(signal => {
      const matchedReports = scoreMatch(signal, reports);
      return { signal, matchedReports, covered: matchedReports.length > 0 };
    })
    .sort((a, b) => {
      if (a.covered !== b.covered) return a.covered ? 1 : -1;
      return severityOrder(a.signal.severity) - severityOrder(b.signal.severity);
    });
}

export async function buildRriskScript() {
  try {
    const base = apiBase();
    const [rptRes, sigRes] = await Promise.all([
      fetch(`${base}/v1/reports`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [rptData, sigData] = await Promise.all([rptRes.json(), sigRes.json()]);
    const reports = normaliseReports(rptData);
    const signals = normaliseSignals(sigData);
    const coverage = buildCoverage(signals, reports);
    const undocumented = coverage.filter(c => !c.covered);
    const documented   = coverage.filter(c => c.covered);
    const critUnDoc    = undocumented.filter(c => c.signal.severity === "CRITICAL").length;
    const pct          = signals.length ? Math.round((documented.length / signals.length) * 100) : 0;
    let script = `Report-risk coverage analysis complete, sir. ${signals.length} active risk signals cross-referenced against ${reports.length} intelligence reports. `;
    script += `${documented.length} risks are formally documented — ${pct}% coverage. `;
    if (undocumented.length > 0) {
      script += `${undocumented.length} risks have no matching report`;
      if (critUnDoc > 0) script += `, including ${critUnDoc} critical-severity signals`;
      script += `. I recommend prioritising formal documentation for these blind spots, sir.`;
    } else {
      script += `All risk signals have formal report coverage. Excellent intelligence hygiene, sir.`;
    }
    return script;
  } catch {
    return "Unable to retrieve report-risk coverage data at this time, sir.";
  }
}

export default function ReportRiskCoverageMonitor() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [coverage, setCoverage] = useState([]);
  const [reports, setReports]   = useState([]);
  const [signals, setSignals]   = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [rptRes, sigRes] = await Promise.all([
        fetch(`${base}/v1/reports`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/RiskSignal`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      if (!rptRes.ok || !sigRes.ok) throw new Error("fetch failed");
      const [rptData, sigData] = await Promise.all([rptRes.json(), sigRes.json()]);
      const rpts = normaliseReports(rptData);
      const sigs = normaliseSignals(sigData);
      setReports(rpts);
      setSignals(sigs);
      setCoverage(buildCoverage(sigs, rpts));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:rrisk-toggle", toggle);
    return () => window.removeEventListener("jarvis:rrisk-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isRriskQuery(q)) { setOpen(true); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const base = apiBase();
      const undoc = coverage.filter(c => !c.covered);
      const prompt = `Risk-report coverage: ${signals.length} risk signals, ${reports.length} reports, ${coverage.filter(c=>c.covered).length} documented, ${undoc.length} undocumented. Top undocumented: ${undoc.slice(0,3).map(c=>c.signal.name).join(", ")}. Give a 2-sentence operational brief.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const txt = (d.answer || "No assessment available.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const a = new Audio(url);
        a.onended = () => URL.revokeObjectURL(url);
        a.play().catch(() => {});
      }).catch(() => {});
    } catch { setAssessment("Assessment unavailable."); }
    setAssessing(false);
  }

  const undocumentedCount = coverage.filter(c => !c.covered).length;
  const criticalUndoc = coverage.filter(c => !c.covered && c.signal.severity === "CRITICAL").length;

  const filtered = coverage.filter(({ signal, covered, matchedReports }) => {
    if (tab === "DOCUMENTED" && !covered) return false;
    if (tab === "UNDOCUMENTED" && covered) return false;
    if (search) {
      const q = search.toLowerCase();
      return signal.name.toLowerCase().includes(q) ||
        matchedReports.some(r => r.title.toLowerCase().includes(q));
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report-Risk Coverage Monitor (RRISK)"
        style={{
          position: "fixed", left: 19520, bottom: 8, zIndex: 81,
          background: "rgba(5,8,13,0.85)", border: `1px solid ${undocumentedCount > 0 ? AMB : CY}55`,
          color: undocumentedCount > 0 ? AMB : CY, borderRadius: 6, padding: "3px 9px",
          fontSize: 11, fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", letterSpacing: 1,
        }}
      >
        ◈ RRISK
        {undocumentedCount > 0 && (
          <span style={{
            marginLeft: 5, background: criticalUndoc > 0 ? RED : AMB,
            color: "#000", borderRadius: 4, padding: "1px 5px", fontSize: 10,
          }}>{undocumentedCount}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, right: 18, zIndex: 90, width: "min(560px, 94vw)",
      maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: "rgba(5,9,15,0.93)", border: `1px solid ${CY}44`, borderRadius: 12,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 60px ${CY}18`, backdropFilter: "blur(12px)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: `1px solid ${CY}22` }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>◈ REPORT × RISK COVERAGE</span>
        {undocumentedCount > 0 && (
          <span style={{ background: criticalUndoc > 0 ? RED : AMB, color: "#000", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
            {undocumentedCount} undocumented
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {signals.length} risks · {reports.length} reports
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
      </div>

      {/* Stat tiles */}
      {!loading && coverage.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${CY}22` }}>
          {[
            { label: "DOCUMENTED", value: coverage.filter(c=>c.covered).length, color: GRN },
            { label: "UNDOCUMENTED", value: undocumentedCount, color: undocumentedCount > 0 ? AMB : DIM },
            { label: "CRITICAL GAPS", value: criticalUndoc, color: criticalUndoc > 0 ? RED : DIM },
            { label: "COVERAGE", value: signals.length ? `${Math.round((coverage.filter(c=>c.covered).length/signals.length)*100)}%` : "—", color: CY },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
              <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
              <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "DOCUMENTED", "UNDOCUMENTED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : "rgba(41,231,255,0.08)", color: tab === t ? "#04060A" : CY,
            border: `1px solid ${CY}44`, borderRadius: 5, padding: "3px 10px", fontSize: 10,
            cursor: "pointer", letterSpacing: 1,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="search…"
          style={{ flex: 1, minWidth: 100, background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
            borderRadius: 5, padding: "3px 8px", color: "#DCEBF5", fontSize: 11, outline: "none" }}
        />
      </div>

      {/* Assess button */}
      <div style={{ padding: "4px 14px 6px" }}>
        <button onClick={assess} disabled={assessing || coverage.length === 0} style={{
          background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
          border: `1px solid ${CY}55`, color: CY, borderRadius: 5, padding: "4px 14px",
          fontSize: 10, cursor: "pointer", letterSpacing: 1,
        }}>
          {assessing ? "▷ ASSESSING…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{ marginTop: 6, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
            background: "rgba(41,231,255,0.06)", borderRadius: 5, padding: "6px 10px" }}>
            {assessment}
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 12px" }}>
        {loading && <div style={{ color: DIM, fontSize: 11, padding: 12 }}>Loading coverage data…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: 12 }}>No results match the current filter.</div>
        )}
        {filtered.map(({ signal, covered, matchedReports }) => {
          const sevColor = severityColor(signal.severity);
          const isExp = expanded === signal.id;
          return (
            <div key={signal.id}
              onClick={() => setExpanded(isExp ? null : signal.id)}
              style={{
                borderRadius: 7, border: `1px solid ${covered ? CY : AMB}22`,
                background: "rgba(41,231,255,0.03)", marginBottom: 6,
                padding: "8px 10px", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{
                  background: sevColor + "22", color: sevColor,
                  border: `1px solid ${sevColor}44`, borderRadius: 4,
                  padding: "1px 6px", fontSize: 9, letterSpacing: 1,
                }}>{signal.severity}</span>
                <span style={{ color: covered ? "#DCEBF5" : AMB, fontSize: 12, fontWeight: 600, flex: 1 }}>
                  {signal.name}
                </span>
                <span style={{
                  fontSize: 9, letterSpacing: 1,
                  color: covered ? GRN : AMB,
                  background: covered ? `${GRN}18` : `${AMB}18`,
                  border: `1px solid ${covered ? GRN : AMB}44`,
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  {covered ? `✓ ${matchedReports.length} REPORT${matchedReports.length !== 1 ? "S" : ""}` : "✗ UNDOCUMENTED"}
                </span>
                <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {signal.description && (
                <div style={{ color: DIM, fontSize: 10, marginTop: 3 }}>{signal.description}</div>
              )}
              {isExp && (
                <div style={{ marginTop: 8, borderTop: `1px solid ${CY}18`, paddingTop: 8 }}>
                  {covered ? (
                    matchedReports.map(rpt => (
                      <div key={rpt.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.05)", borderRadius: 5, padding: "6px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            background: `${CY}18`, color: CY, border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "1px 5px", fontSize: 9, letterSpacing: 1,
                          }}>{rpt.type}</span>
                          <span style={{ color: "#DCEBF5", fontSize: 11, fontWeight: 600 }}>{rpt.title}</span>
                          <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
                            {rpt.relevance} hit{rpt.relevance !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {rpt.summary && <div style={{ color: DIM, fontSize: 10, marginTop: 3 }}>{rpt.summary}</div>}
                        {rpt.author && <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>Author: {rpt.author}</div>}
                        {rpt.status && <div style={{ color: DIM, fontSize: 9 }}>Status: {rpt.status}</div>}
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMB, fontSize: 11 }}>
                      No formal intelligence reports reference this risk signal. Consider creating a report to document this exposure.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
