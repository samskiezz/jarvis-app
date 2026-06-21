/**
 * DocumentSearch — F14 Document Search.
 * Queries /v1/reports and /knowledge/ → combined result list.
 * User can filter; clicking a result speaks a JARVIS summary via TTS.
 * "JARVIS, documents/reports/knowledge" opens the panel and briefs total count.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const AMB = "#E8B86D"; // amber/gold — document vault accent
const CY  = "#29E7FF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DOC_RE = /\bdocument|report|knowledge|vault|dossier|brief|paper|file|search.doc|find.report\b/i;

async function fetchReports() {
  const r = await fetch(`${apiBase()}/v1/reports`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)          ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.reports)         ? d.reports
    : Array.isArray(d?.results)         ? d.results
    : [];
  return arr.map(x => ({ ...x, _source: "report" }));
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)          ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.knowledge)       ? d.knowledge
    : Array.isArray(d?.results)         ? d.results
    : [];
  return arr.map(x => ({ ...x, _source: "knowledge" }));
}

export function isDocumentQuery(text) {
  return DOC_RE.test(text || "");
}

export async function buildDocumentScript() {
  let reports = [], knowledge = [];
  try { reports  = await fetchReports();   } catch (_) {}
  try { knowledge = await fetchKnowledge(); } catch (_) {}

  const total = reports.length + knowledge.length;
  if (!total) return "No documents or knowledge articles found, sir.";

  const rNames = reports
    .slice(0, 2)
    .map(r => r.title || r.name || r.report_name || "Untitled")
    .join(", ");
  const kCount = knowledge.length;

  let script = `Document vault contains ${total} item${total !== 1 ? "s" : ""}: ` +
    `${reports.length} report${reports.length !== 1 ? "s" : ""}` +
    (kCount ? ` and ${kCount} knowledge article${kCount !== 1 ? "s" : ""}` : "") + ". ";
  if (rNames) script += `Recent reports include: ${rNames}.`;

  return script.trim();
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

function speakItem(item) {
  const title   = item.title || item.name || item.report_name || "Untitled document";
  const summary = item.summary || item.description || item.abstract || item.content || "";
  const src     = item._source === "knowledge" ? "Knowledge article" : "Report";
  const text    = `${src}: ${title}. ${summary ? summary.slice(0, 200) : "No summary available."}`;

  window.dispatchEvent(new CustomEvent("jarvis:ask", { detail: { text } }));
}

export default function DocumentSearch() {
  const [open,      setOpen]      = useState(false);
  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [filter,    setFilter]    = useState("");
  const [srcFilter, setSrcFilter] = useState("all"); // "all"|"report"|"knowledge"

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reports, knowledge] = await Promise.allSettled([fetchReports(), fetchKnowledge()]);
      const r = reports.status     === "fulfilled" ? reports.value     : [];
      const k = knowledge.status   === "fulfilled" ? knowledge.value   : [];
      setDocs([...r, ...k]);
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
      if (DOC_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = docs.filter(d => {
    if (srcFilter !== "all" && d._source !== srcFilter) return false;
    if (!filter.trim()) return true;
    const hay = [
      d.title, d.name, d.report_name, d.description,
      d.summary, d.abstract, d.type, d.category, d.tags,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  const reportCount    = docs.filter(d => d._source === "report").length;
  const knowledgeCount = docs.filter(d => d._source === "knowledge").length;

  return (
    <>
      {/* Toggle button — bottom-left strip, after SIM */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Document Search"
        style={{
          position: "fixed", left: 596, bottom: 18, zIndex: 68,
          background: open ? AMB + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${AMB}55`,
          borderRadius: 8,
          color: open ? "#04060A" : AMB,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${AMB}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        DOCS
        {docs.length > 0 && (
          <span style={{
            background: AMB + "44", color: AMB,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {docs.length}
          </span>
        )}
      </button>

      {/* Document search panel */}
      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(460px,93vw)", maxHeight: "min(600px,76vh)",
          background: "rgba(4,8,14,0.94)",
          border: `1px solid ${AMB}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${AMB}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${AMB}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: AMB,
              boxShadow: `0 0 10px ${AMB}`, display: "inline-block",
              animation: loading ? "docpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: AMB, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DOCUMENT VAULT
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SCANNING" : lastFetch ? `↻ ${fmtAge(lastFetch)}` : "—"}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Source filter tabs */}
          {docs.length > 0 && (
            <div style={{
              padding: "5px 14px", borderBottom: `1px solid ${AMB}18`,
              display: "flex", gap: 8, alignItems: "center",
            }}>
              {[
                { key: "all",       label: `ALL (${docs.length})` },
                { key: "report",    label: `REPORTS (${reportCount})` },
                { key: "knowledge", label: `KNOWLEDGE (${knowledgeCount})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setSrcFilter(tab.key)}
                  style={{
                    background: srcFilter === tab.key ? AMB + "33" : "transparent",
                    border: `1px solid ${srcFilter === tab.key ? AMB + "66" : AMB + "22"}`,
                    borderRadius: 4, color: srcFilter === tab.key ? AMB : "#566878",
                    cursor: "pointer", padding: "2px 8px",
                    fontSize: 8, letterSpacing: 1.5, fontWeight: 700,
                    fontFamily: "'JetBrains Mono',monospace",
                    transition: "all 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {/* Search input */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${AMB}18` }}>
            <input
              type="text"
              placeholder="search documents…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box",
                background: `rgba(232,184,109,0.06)`, border: `1px solid ${AMB}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 10,
                padding: "5px 9px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none", letterSpacing: 0.5,
              }}
            />
          </div>

          {/* Hint */}
          <div style={{ padding: "4px 14px", fontSize: 8, color: "#566878", letterSpacing: 0.5 }}>
            Click any result for JARVIS to read a summary aloud
          </div>

          {/* Document cards */}
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 0 8px" }}>
            {visible.length === 0 && !loading && (
              <div style={{ padding: "24px 14px", color: "#566878", fontSize: 10, textAlign: "center" }}>
                {docs.length === 0 ? "No documents found." : "No matches for your query."}
              </div>
            )}
            {visible.map((doc, i) => {
              const id      = doc.id || doc.report_id || doc._id || i;
              const title   = doc.title || doc.name || doc.report_name || `Document ${i + 1}`;
              const type    = doc.type || doc.category || doc.kind || doc.doc_type || "";
              const summary = doc.summary || doc.description || doc.abstract || "";
              const ts      = doc.updated_at || doc.created_at || doc.date;
              const isKnow  = doc._source === "knowledge";

              return (
                <div
                  key={`${doc._source}-${id}`}
                  onClick={() => speakItem(doc)}
                  title="Click to have JARVIS summarize"
                  style={{
                    margin: "6px 10px",
                    background: `${AMB}05`,
                    border: `1px solid ${AMB}22`,
                    borderRadius: 8, padding: "9px 12px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = AMB + "55";
                    e.currentTarget.style.background  = AMB + "10";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = AMB + "22";
                    e.currentTarget.style.background  = AMB + "05";
                  }}
                >
                  {/* Title row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: summary ? 5 : 0 }}>
                    <span style={{
                      fontSize: 8,
                      color: isKnow ? CY : AMB,
                      background: (isKnow ? CY : AMB) + "1a",
                      border: `1px solid ${isKnow ? CY : AMB}44`,
                      borderRadius: 3, padding: "1px 6px",
                      letterSpacing: 1, fontWeight: 700, textTransform: "uppercase",
                      flexShrink: 0,
                    }}>
                      {isKnow ? "KNOW" : type || "RPT"}
                    </span>
                    <span style={{
                      flex: 1, fontSize: 10, color: "#DCEBF5",
                      fontWeight: 700, letterSpacing: 0.5,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {title}
                    </span>
                    {ts && (
                      <span style={{ fontSize: 8, color: "#566878", flexShrink: 0 }}>
                        {fmtAge(ts)}
                      </span>
                    )}
                  </div>

                  {/* Summary */}
                  {summary && (
                    <p style={{
                      margin: 0, fontSize: 9, color: "#8ba3b8",
                      lineHeight: 1.5, letterSpacing: 0.3,
                    }}>
                      {summary.length > 130 ? summary.slice(0, 130) + "…" : summary}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes docpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
