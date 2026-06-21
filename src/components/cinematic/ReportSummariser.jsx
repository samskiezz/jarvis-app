/**
 * ReportSummariser — F37 Report Summariser.
 * Fetches /v1/reports → selectable list; clicking a report sends
 * "summarize this: {title}" to /v1/jarvis/agent/chat and shows the full
 * AI transcript in-panel + speaks it via jarvis:speak-dossier.
 * "JARVIS, summarize report" / "report summary" opens the panel.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 * Toggle button at left:2572 bottom strip.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const VI  = "#C084FC"; // violet — report summariser accent
const CY  = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const REPORT_SUMM_RE =
  /\bsummariz[ei]\s+report|\breport\s+summar|\bsummariz[ei]\s+this\s+report|report\s*summarizer\b/i;

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)             ? d
    : Array.isArray(d?.data)              ? d.data
    : Array.isArray(d?.items)             ? d.items
    : Array.isArray(d?.reports)           ? d.reports
    : Array.isArray(d?.results)           ? d.results
    : [];
  return arr;
}

export function isReportSummariserQuery(text) {
  return REPORT_SUMM_RE.test(text || "");
}

export async function buildReportSummariserScript() {
  let items = [];
  try { items = await fetchReports(); } catch (_) {}
  if (!items.length) return "No reports available in the vault at this time, sir.";
  const names = items
    .slice(0, 3)
    .map(i => i.title || i.name || i.report_name || i.filename || "Untitled")
    .join(", ");
  return (
    `Report vault contains ${items.length} report${items.length !== 1 ? "s" : ""}. ` +
    `Recent entries include: ${names}. ` +
    `Click any report to receive an AI-generated summary, sir.`
  );
}

function fmtAge(t) {
  if (!t) return "";
  const d = new Date(typeof t === "number" ? t : Date.parse(t));
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 16);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

async function summariseReport(item, setTranscript, setSummarising) {
  const title   = item.title || item.name || item.report_name || item.filename || "Untitled";
  const snippet = (
    item.content || item.body || item.abstract || item.summary ||
    item.description || item.text || ""
  ).slice(0, 500);

  const prompt = `summarize this: ${title}${snippet ? `. Context: ${snippet}` : ""}`;

  setSummarising(true);
  setTranscript({ title, status: "loading", text: "" });

  let summary = "";
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const d = await r.json();
    summary = (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
  } catch (_) {}

  const spoken = summary || `Report: ${title}. ${snippet.slice(0, 200)}`;
  setTranscript({ title, status: "done", text: spoken });
  setSummarising(false);
  window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: spoken } }));
}

export default function ReportSummariser() {
  const [open,        setOpen]        = useState(false);
  const [reports,     setReports]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [lastFetch,   setLastFetch]   = useState(null);
  const [filter,      setFilter]      = useState("");
  const [summarising, setSummarising] = useState(false);
  const [transcript,  setTranscript]  = useState(null);
  const [selected,    setSelected]    = useState(null);
  const transcriptRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReports();
      setReports(data);
      setLastFetch(new Date());
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 120_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (REPORT_SUMM_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    if (transcript?.status === "done" && transcriptRef.current) {
      transcriptRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [transcript]);

  const visible = reports.filter(item => {
    if (!filter.trim()) return true;
    const hay = [
      item.title, item.name, item.report_name, item.filename,
      item.category, item.type, item.status, item.description, item.summary,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  async function handleSelect(item) {
    if (summarising) return;
    const id = item.id || item._id || item.title || "";
    setSelected(id);
    await summariseReport(item, setTranscript, setSummarising);
  }

  return (
    <>
      {/* Toggle button — bottom strip at left:2572 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Report Summariser (F37)"
        style={{
          position: "fixed", left: 2572, bottom: 18, zIndex: 68,
          background: open ? VI + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? VI : VI + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : VI,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${VI}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◎</span>
        SUMM
        {reports.length > 0 && (
          <span style={{
            background: VI + "44", color: VI,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {reports.length}
          </span>
        )}
      </button>

      {/* Report Summariser panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(520px,96vw)", maxHeight: "min(680px,82vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${VI}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${VI}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${VI}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: VI,
              boxShadow: `0 0 10px ${VI}`, display: "inline-block",
              animation: (loading || summarising) ? "rsumpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: VI, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              REPORT SUMMARISER
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {summarising
                ? "ANALYSING…"
                : loading
                  ? "LOADING"
                  : lastFetch
                    ? `↻ ${fmtAge(lastFetch)}`
                    : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Search input */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${VI}18`, flexShrink: 0 }}>
            <input
              type="text"
              placeholder="filter reports…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(192,132,252,0.06)`, border: `1px solid ${VI}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          <div style={{
            padding: "4px 14px", fontSize: 8, color: "#566878",
            letterSpacing: 0.5, flexShrink: 0,
          }}>
            {visible.length} report{visible.length !== 1 ? "s" : ""} — click to receive AI summary + voice brief
          </div>

          {/* Scrollable body: report list + transcript */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0 8px" }}>
            {/* Report list */}
            {visible.length === 0 && !loading && (
              <div style={{ padding: "20px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {reports.length === 0
                  ? "Report vault empty or unreachable."
                  : "No matches for your filter."}
              </div>
            )}

            {visible.map((item, i) => {
              const rawId  = item.id || item._id || item.title || i;
              const title  = item.title || item.name || item.report_name || item.filename || `Report ${i + 1}`;
              const cat    = item.category || item.type || item.report_type || item.status || "";
              const ts     = item.updated_at || item.created_at || item.date || item.published_at;
              const snip   = item.description || item.abstract || item.summary || "";
              const isActive = selected === rawId;

              return (
                <div
                  key={rawId}
                  onClick={() => handleSelect(item)}
                  title={summarising && !isActive ? "Summarising another report…" : "Click for AI summary"}
                  style={{
                    margin: "5px 10px",
                    background: isActive ? `${VI}14` : `${VI}05`,
                    border: `1px solid ${isActive ? VI + "66" : VI + "22"}`,
                    borderRadius: 8, padding: "8px 12px",
                    cursor: summarising && !isActive ? "default" : "pointer",
                    opacity: summarising && !isActive ? 0.5 : 1,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    if (!isActive && !summarising) {
                      e.currentTarget.style.borderColor = VI + "55";
                      e.currentTarget.style.background  = VI + "10";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = VI + "22";
                      e.currentTarget.style.background  = VI + "05";
                    }
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: snip ? 4 : 0 }}>
                    {cat && (
                      <span style={{
                        fontSize: 8, color: CY,
                        background: CY + "1a", border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "1px 6px",
                        letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
                        flexShrink: 0,
                      }}>
                        {String(cat).slice(0, 12)}
                      </span>
                    )}
                    <span style={{
                      flex: 1, fontSize: 10, color: "#DCEBF5",
                      fontWeight: 700, letterSpacing: 0.5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {title}
                    </span>
                    {isActive && summarising && (
                      <span style={{ fontSize: 8, color: VI, flexShrink: 0, animation: "rsumpulse 1s infinite" }}>
                        ◍ analysing…
                      </span>
                    )}
                    {ts && !(isActive && summarising) && (
                      <span style={{ fontSize: 8, color: "#566878", flexShrink: 0 }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>
                  {snip && (
                    <p style={{ margin: 0, fontSize: 9, color: "#8ba3b8", lineHeight: 1.5, letterSpacing: 0.3 }}>
                      {snip.length > 120 ? snip.slice(0, 120) + "…" : snip}
                    </p>
                  )}
                </div>
              );
            })}

            {/* AI Transcript */}
            {transcript && (
              <div
                ref={transcriptRef}
                style={{
                  margin: "10px 10px 4px",
                  background: `rgba(192,132,252,0.07)`,
                  border: `1px solid ${VI}44`,
                  borderRadius: 10, padding: "10px 14px",
                }}
              >
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  borderBottom: `1px solid ${VI}22`, paddingBottom: 6,
                }}>
                  <span style={{ fontSize: 9, color: VI, fontWeight: 700, letterSpacing: 2 }}>
                    ◎ AI SUMMARY
                  </span>
                  <span style={{
                    flex: 1, fontSize: 9, color: "#DCEBF5",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {transcript.title}
                  </span>
                  {transcript.status === "loading" && (
                    <span style={{ fontSize: 8, color: VI, animation: "rsumpulse 1s infinite" }}>
                      thinking…
                    </span>
                  )}
                </div>
                {transcript.status === "done" ? (
                  <p style={{
                    margin: 0, fontSize: 10, color: "#DCEBF5",
                    lineHeight: 1.7, letterSpacing: 0.3, whiteSpace: "pre-wrap",
                  }}>
                    {transcript.text}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: 10, color: "#566878", fontStyle: "italic" }}>
                    Consulting intelligence core…
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: "6px 14px", borderTop: `1px solid ${VI}18`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{ fontSize: 8, color: "#566878", letterSpacing: 1 }}>
              /v1/reports · /v1/jarvis/agent/chat
            </span>
            {transcript?.status === "done" && (
              <span style={{ marginLeft: "auto", fontSize: 8, color: VI, letterSpacing: 1 }}>
                ◍ TRANSCRIPT READY
              </span>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes rsumpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
