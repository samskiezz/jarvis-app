/**
 * ReportGenerator — F279.
 *
 * Data sources:
 *   GET  /v1/reports                      → {items:[{id,title,created_at,...}], count}
 *   POST /v1/reports/generate             → {brief:{title,markdown,...}, id?}
 *   GET  /v1/reports/{id}/export?fmt=md   → {id, fmt, content}
 *
 * Displays:
 *   - ◈ RPRTGEN button  left:204040  bottom:8  zIndex:375
 *   - Query/subject text input
 *   - "Generate" → POST /v1/reports/generate (save:true) → spinner → brief in
 *     scrollable formatted panel
 *   - "Export" button → GET /v1/reports/{id}/export → download .md file
 *   - History list from GET /v1/reports; click row to load that report
 *   - ASSESS → /v1/jarvis/agent/chat + TTS
 *
 * Toggle: ◈ RPRTGEN  left:204040  bottom:8  zIndex:375
 * Event:  jarvis:rprtgen-toggle
 * Voice:  "report generator / rprtgen / generate report / create report /
 *          report builder / build report / new report"
 *
 * Exported for JarvisBrain: isRprtgenQuery
 * Mounted via src/App.jsx.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";
const DIM  = "rgba(41,231,255,0.45)";

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT = 204040;
const PANEL_W  = 820;
const PANEL_H  = 640;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const RPRTGEN_RE =
  /\b(report\s+generator|rprtgen\b|generate\s+report|create\s+report|report\s+builder|build\s+report|new\s+report)\b/i;

export function isRprtgenQuery(q) {
  return RPRTGEN_RE.test(q || "");
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function speak(text) {
  if (!text) return;
  fetch(`${apiBase()}/v1/voice/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ text, voice: "onyx" }),
  }).catch(() => {});
}

function fmtDate(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function normaliseReports(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.reports)
    ? data.reports
    : [];
  return arr.map((r, i) => ({
    id:         r.id ?? i,
    title:      r.title ?? `Report ${r.id ?? i}`,
    created_at: r.created_at ?? r.ts ?? null,
    body:       r.body ?? r.markdown ?? r.content ?? "",
  }));
}

// ─── MarkdownBody — simple lightweight renderer ───────────────────────────────
function MarkdownBody({ text }) {
  if (!text) return <span style={{ color: DIM }}>No content.</span>;
  const lines = text.split("\n");
  return (
    <div style={{ fontSize: 13, lineHeight: 1.65, color: "#CBD5E1" }}>
      {lines.map((line, i) => {
        if (/^### /.test(line)) {
          return (
            <div key={i} style={{ color: CY, fontWeight: 700, fontSize: 13, margin: "10px 0 4px" }}>
              {line.replace(/^### /, "")}
            </div>
          );
        }
        if (/^## /.test(line)) {
          return (
            <div key={i} style={{ color: CY, fontWeight: 700, fontSize: 14, margin: "12px 0 4px", borderBottom: `1px solid ${BORD}`, paddingBottom: 4 }}>
              {line.replace(/^## /, "")}
            </div>
          );
        }
        if (/^# /.test(line)) {
          return (
            <div key={i} style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 16, margin: "14px 0 6px" }}>
              {line.replace(/^# /, "")}
            </div>
          );
        }
        if (/^- /.test(line) || /^\* /.test(line)) {
          return (
            <div key={i} style={{ paddingLeft: 14, position: "relative" }}>
              <span style={{ position: "absolute", left: 4, color: CY }}>·</span>
              {line.replace(/^[-*] /, "")}
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
        return <div key={i}>{line}</div>;
      })}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function ReportGenerator() {
  const [open, setOpen] = useState(false);

  // form
  const [query, setQuery]   = useState("");
  const [polish, setPolish] = useState(false);

  // generate
  const [generating, setGenerating] = useState(false);
  const [brief, setBrief]           = useState(null);
  const [reportId, setReportId]     = useState(null);
  const [genErr, setGenErr]         = useState("");

  // history
  const [history, setHistory]     = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histErr, setHistErr]     = useState("");

  // assess
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");

  const panelRef = useRef(null);

  // ── toggle ────────────────────────────────────────────────────────────────
  useEffect(() => {
    function onToggle() { setOpen(v => !v); }
    window.addEventListener("jarvis:rprtgen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rprtgen-toggle", onToggle);
  }, []);

  // ── load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(() => {
    setHistLoading(true);
    setHistErr("");
    fetch(`${apiBase()}/v1/reports`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    })
      .then(r => r.json())
      .then(d => setHistory(normaliseReports(d)))
      .catch(() => setHistErr("Failed to load report history."))
      .finally(() => setHistLoading(false));
  }, []);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  // ── generate ──────────────────────────────────────────────────────────────
  async function generate() {
    if (!query.trim()) return;
    setGenerating(true);
    setBrief(null);
    setReportId(null);
    setGenErr("");
    setAssessment("");
    try {
      const r = await fetch(`${apiBase()}/v1/reports/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ query: query.trim(), polish, save: true }),
      });
      if (!r.ok) {
        const txt = await r.text();
        setGenErr(`Generate failed (${r.status}): ${txt.slice(0, 200)}`);
        return;
      }
      const d = await r.json();
      const b = d?.brief ?? d;
      setBrief(b);
      if (d?.id != null) setReportId(d.id);
      // reload history to show new report
      loadHistory();
    } catch (e) {
      setGenErr(`Request failed: ${e?.message ?? "network error"}`);
    } finally {
      setGenerating(false);
    }
  }

  // ── load a saved report from history ──────────────────────────────────────
  async function loadReport(id) {
    setGenErr("");
    setAssessment("");
    try {
      const r = await fetch(`${apiBase()}/v1/reports/${id}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) { setGenErr(`Load failed (${r.status}).`); return; }
      const d = await r.json();
      setBrief({
        title:    d.title,
        markdown: d.body ?? d.markdown ?? d.content ?? "",
      });
      setReportId(id);
    } catch {
      setGenErr("Failed to load report.");
    }
  }

  // ── export ────────────────────────────────────────────────────────────────
  async function exportReport() {
    if (reportId == null) return;
    try {
      const r = await fetch(`${apiBase()}/v1/reports/${reportId}/export?fmt=md`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const d = await r.json();
      const content = d?.content ?? "";
      const blob = new Blob([content], { type: "text/markdown" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `report-${reportId}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setGenErr("Export failed.");
    }
  }

  // ── assess ────────────────────────────────────────────────────────────────
  async function assess() {
    if (!brief) return;
    setAssessing(true);
    const snippet = (brief.markdown ?? brief.body ?? "").slice(0, 400);
    const prompt = `Briefly summarise this JARVIS report in 2 sentences and note the key action: "${brief.title}". ${snippet}`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = d?.response ?? d?.message ?? d?.content ?? "Assessment unavailable.";
      setAssessment(text);
      speak(text.slice(0, 300));
    } catch {
      setAssessment("ASSESS unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Report Generator"
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   375,
          background:  "rgba(10,18,28,0.85)",
          border:      `1px solid ${BORD}`,
          color:       CY,
          borderRadius: 6,
          padding:     "3px 9px",
          fontSize:    11,
          fontFamily:  "monospace",
          cursor:      "pointer",
          letterSpacing: "0.06em",
          whiteSpace:  "nowrap",
        }}
      >
        ◈ RPRTGEN
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position:    "fixed",
        left:        BTN_LEFT,
        bottom:      40,
        width:       PANEL_W,
        maxHeight:   PANEL_H,
        zIndex:      375,
        background:  SURF,
        border:      `1px solid ${BORD}`,
        borderRadius: 10,
        display:     "flex",
        flexDirection: "column",
        fontFamily:  "monospace",
        boxShadow:   "0 8px 40px rgba(0,0,0,0.6)",
        overflow:    "hidden",
      }}
    >
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${BORD}`,
        flexShrink: 0,
      }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: "0.08em" }}>
          ◈ REPORT GENERATOR
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          {brief && reportId != null && (
            <button
              onClick={exportReport}
              style={smallBtn("#2a3a4a", CY)}
              title="Export as .md"
            >
              EXPORT
            </button>
          )}
          {brief && (
            <button
              onClick={assess}
              disabled={assessing}
              style={smallBtn("#1a2a1a", GN)}
            >
              {assessing ? "…" : "ASSESS"}
            </button>
          )}
          <button onClick={() => setOpen(false)} style={smallBtn("#2a1a1a", RD)}>✕</button>
        </div>
      </div>

      {/* body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* left: form + result */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          padding: "12px 14px", overflow: "hidden",
        }}>
          {/* query input */}
          <div style={{ marginBottom: 10, flexShrink: 0 }}>
            <div style={{ color: DIM, fontSize: 11, marginBottom: 4 }}>SUBJECT / QUERY</div>
            <textarea
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) generate(); }}
              placeholder="Describe what to report on…"
              rows={3}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${BORD}`, borderRadius: 5,
                color: "#CBD5E1", fontSize: 12, padding: "7px 10px",
                resize: "vertical", fontFamily: "monospace", outline: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 5, color: DIM, fontSize: 11, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={polish}
                  onChange={e => setPolish(e.target.checked)}
                  style={{ accentColor: CY }}
                />
                Polish
              </label>
              <button
                onClick={generate}
                disabled={generating || !query.trim()}
                style={{
                  ...smallBtn("#0d2a3a", CY),
                  padding: "5px 18px",
                  fontSize: 12,
                  opacity: generating || !query.trim() ? 0.5 : 1,
                }}
              >
                {generating ? "Generating…" : "GENERATE"}
              </button>
            </div>
          </div>

          {genErr && (
            <div style={{ color: RD, fontSize: 11, marginBottom: 8, flexShrink: 0 }}>{genErr}</div>
          )}

          {/* brief output */}
          {brief && (
            <div style={{
              flex: 1, overflow: "auto",
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${BORD}`, borderRadius: 6,
              padding: "10px 12px",
            }}>
              {brief.title && (
                <div style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
                  {brief.title}
                </div>
              )}
              <MarkdownBody text={brief.markdown ?? brief.body ?? brief.content ?? ""} />
            </div>
          )}

          {!brief && !generating && (
            <div style={{ color: DIM, fontSize: 12, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              Enter a query and press GENERATE.
            </div>
          )}

          {generating && (
            <div style={{ color: CY, fontSize: 12, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
              Generating report…
            </div>
          )}

          {/* assessment */}
          {assessment && (
            <div style={{
              marginTop: 8, padding: "8px 10px",
              background: "rgba(74,222,128,0.07)",
              border: `1px solid rgba(74,222,128,0.25)`,
              borderRadius: 5, color: GN, fontSize: 12,
              flexShrink: 0,
            }}>
              {assessment}
            </div>
          )}
        </div>

        {/* right: history sidebar */}
        <div style={{
          width: 220, borderLeft: `1px solid ${BORD}`,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            color: DIM, fontSize: 11, padding: "8px 12px 4px",
            borderBottom: `1px solid ${BORD}`, flexShrink: 0,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>HISTORY ({history.length})</span>
            <button onClick={loadHistory} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 12 }} title="Refresh">↻</button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {histLoading && (
              <div style={{ color: DIM, fontSize: 11, padding: "10px 12px" }}>Loading…</div>
            )}
            {histErr && (
              <div style={{ color: RD, fontSize: 11, padding: "10px 12px" }}>{histErr}</div>
            )}
            {!histLoading && history.length === 0 && !histErr && (
              <div style={{ color: DIM, fontSize: 11, padding: "10px 12px" }}>No saved reports.</div>
            )}
            {history.map(rep => (
              <div
                key={rep.id}
                onClick={() => loadReport(rep.id)}
                style={{
                  padding: "7px 12px",
                  borderBottom: `1px solid ${BORD}`,
                  cursor: "pointer",
                  background: reportId === rep.id ? "rgba(41,231,255,0.08)" : "transparent",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(41,231,255,0.05)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = reportId === rep.id ? "rgba(41,231,255,0.08)" : "transparent"; }}
              >
                <div style={{ color: reportId === rep.id ? CY : "#CBD5E1", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {rep.title}
                </div>
                <div style={{ color: DIM, fontSize: 10, marginTop: 2 }}>
                  {fmtDate(rep.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── style helper ────────────────────────────────────────────────────────────
function smallBtn(bg, col) {
  return {
    background:  bg,
    border:      `1px solid ${col}40`,
    color:       col,
    borderRadius: 4,
    padding:     "3px 10px",
    fontSize:    11,
    cursor:      "pointer",
    fontFamily:  "monospace",
    letterSpacing: "0.05em",
  };
}
