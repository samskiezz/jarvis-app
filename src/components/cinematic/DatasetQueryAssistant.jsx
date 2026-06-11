/**
 * F51 — Dataset Query Assistant.
 * Lists /v1/datasets; user selects a dataset + types a natural-language question;
 * question + dataset metadata sent to /v1/jarvis/agent/chat for AI answer;
 * answer shown in-panel + spoken via jarvis:speak-dossier.
 * Session Q&A history kept in-memory (up to 20 pairs).
 * Toggle: ◈ DQRY at left:4028 bottom strip.
 * "JARVIS, query dataset" / "ask dataset" / "dataset question" → isDatasetQueryQuery.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const LM  = "#4ADE80"; // lime green accent
const CY  = "#29E7FF";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const DQRY_RE =
  /\b(query|ask|question)\s+(a\s+)?(dataset|data\s*set)\b|\bdataset\s+(query|question|ask)\b|\bdata\s+query\s+assist|\bdqry\b/i;

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const arr = Array.isArray(d)           ? d
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.datasets)        ? d.datasets
    : Array.isArray(d?.results)         ? d.results
    : [];
  return arr;
}

async function askAboutDataset(dataset, question) {
  const name  = dataset.name || dataset.title || dataset.dataset_name || "Untitled Dataset";
  const rows  = dataset.row_count ?? dataset.rows ?? dataset.record_count ?? dataset.count ?? null;
  const dtype = dataset.type     || dataset.data_type || dataset.category || dataset.source || "";
  const desc  = (dataset.description || dataset.summary || "").slice(0, 300);

  let context = `Dataset: "${name}"`;
  if (rows !== null) context += `, ${Number(rows).toLocaleString()} rows`;
  if (dtype)         context += `, type: ${dtype}`;
  if (desc)          context += `. Description: ${desc}`;

  const prompt = `${context}. Question: ${question}`;

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body:    JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

export function isDatasetQueryQuery(text) {
  return DQRY_RE.test(text || "");
}

export async function buildDatasetQueryScript() {
  let datasets = [];
  try { datasets = await fetchDatasets(); } catch (_) {}
  if (!datasets.length) return "No datasets available to query at this time, sir.";
  const names = datasets
    .slice(0, 3)
    .map(d => d.name || d.title || d.dataset_name || "Untitled")
    .join(", ");
  return (
    `Dataset query assistant online. ${datasets.length} dataset${datasets.length !== 1 ? "s" : ""} available. ` +
    `Recent entries: ${names}. ` +
    `Select a dataset and type a question to receive an AI-powered analysis, sir.`
  );
}

function fmtRows(n) {
  if (n == null) return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1)}M rows`;
  if (x >= 1_000)     return `${(x / 1_000).toFixed(1)}k rows`;
  return `${x} rows`;
}

export default function DatasetQueryAssistant() {
  const [open,        setOpen]       = useState(false);
  const [datasets,    setDatasets]   = useState([]);
  const [loading,     setLoading]    = useState(false);
  const [filter,      setFilter]     = useState("");
  const [selected,    setSelected]   = useState(null);
  const [question,    setQuestion]   = useState("");
  const [thinking,    setThinking]   = useState(false);
  const [history,     setHistory]    = useState([]); // [{q, a, dsName}]
  const historyRef = useRef(null);
  const inputRef   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDatasets();
      setDatasets(data);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (DQRY_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:dqry-toggle", onToggle);
    return () => window.removeEventListener("jarvis:dqry-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open && selected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open, selected]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history]);

  const visible = datasets.filter(ds => {
    if (!filter.trim()) return true;
    const hay = [
      ds.name, ds.title, ds.dataset_name,
      ds.type, ds.data_type, ds.category,
      ds.description, ds.summary,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  async function handleAsk() {
    if (!selected || !question.trim() || thinking) return;
    const q   = question.trim();
    const ds  = selected;
    const dsName = ds.name || ds.title || ds.dataset_name || "Dataset";
    setThinking(true);
    setQuestion("");
    let answer = "";
    try {
      answer = await askAboutDataset(ds, q);
    } catch (_) {
      answer = "I could not retrieve an answer from the intelligence core at this time, sir.";
    }
    if (!answer) answer = `I don't have specific data on "${dsName}" to answer that, sir.`;
    setHistory(h => [...h.slice(-19), { q, a: answer, dsName }]);
    setThinking(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  }

  return (
    <>
      {/* Toggle button — left:4028 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Dataset Query Assistant (F51)"
        style={{
          position: "fixed", left: 4028, bottom: 18, zIndex: 68,
          background: open ? LM + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? LM : LM + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : LM,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${LM}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        DQRY
        {datasets.length > 0 && (
          <span style={{
            background: LM + "44", color: LM,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {datasets.length}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(560px,96vw)", maxHeight: "min(700px,84vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${LM}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${LM}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${LM}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: LM,
              boxShadow: `0 0 10px ${LM}`, display: "inline-block",
              animation: (loading || thinking) ? "dqrypulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: LM, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              DATASET QUERY ASSISTANT
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {thinking ? "THINKING…" : loading ? "LOADING" : `${datasets.length} datasets`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Body: two-column layout */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

            {/* Left: dataset list */}
            <div style={{
              width: 200, flexShrink: 0,
              borderRight: `1px solid ${LM}18`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              <div style={{ padding: "6px 10px", borderBottom: `1px solid ${LM}14`, flexShrink: 0 }}>
                <input
                  type="text"
                  placeholder="filter…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: `rgba(74,222,128,0.06)`, border: `1px solid ${LM}33`,
                    borderRadius: 5, color: "#DCEBF5", fontSize: 9,
                    padding: "4px 8px", fontFamily: "'JetBrains Mono',monospace",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {visible.length === 0 && !loading && (
                  <div style={{ padding: 12, color: DIM, fontSize: 9, textAlign: "center" }}>
                    {datasets.length === 0 ? "No datasets." : "No matches."}
                  </div>
                )}
                {visible.map((ds, i) => {
                  const key    = ds.id || ds._id || ds.name || i;
                  const name   = ds.name || ds.title || ds.dataset_name || `Dataset ${i + 1}`;
                  const rows   = fmtRows(ds.row_count ?? ds.rows ?? ds.record_count ?? ds.count);
                  const dtype  = ds.type || ds.data_type || ds.category || "";
                  const isAct  = selected === ds || (selected?.id && selected?.id === ds.id);
                  return (
                    <div
                      key={key}
                      onClick={() => { setSelected(ds); setTimeout(() => inputRef.current?.focus(), 50); }}
                      style={{
                        padding: "7px 10px",
                        background: isAct ? `${LM}14` : "transparent",
                        borderBottom: `1px solid ${LM}11`,
                        cursor: "pointer",
                        borderLeft: isAct ? `2px solid ${LM}` : "2px solid transparent",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = `${LM}08`; }}
                      onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{
                        fontSize: 9, color: isAct ? LM : "#DCEBF5",
                        fontWeight: 700, letterSpacing: 0.4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {name}
                      </div>
                      <div style={{ display: "flex", gap: 5, marginTop: 2, flexWrap: "wrap" }}>
                        {rows && (
                          <span style={{ fontSize: 7, color: CY, background: CY + "18",
                            borderRadius: 3, padding: "1px 4px" }}>
                            {rows}
                          </span>
                        )}
                        {dtype && (
                          <span style={{ fontSize: 7, color: DIM, background: "rgba(255,255,255,0.04)",
                            borderRadius: 3, padding: "1px 4px" }}>
                            {String(dtype).slice(0, 12).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Q&A area */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* Selected dataset header */}
              <div style={{
                padding: "7px 12px", borderBottom: `1px solid ${LM}18`,
                flexShrink: 0, minHeight: 32,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {selected ? (
                  <>
                    <span style={{ fontSize: 9, color: LM, fontWeight: 700, letterSpacing: 1 }}>
                      ◈ {(selected.name || selected.title || selected.dataset_name || "Dataset").slice(0, 40)}
                    </span>
                    {(() => {
                      const rows = fmtRows(selected.row_count ?? selected.rows ?? selected.record_count ?? selected.count);
                      return rows ? (
                        <span style={{ fontSize: 7, color: CY, background: CY + "18",
                          borderRadius: 3, padding: "1px 5px" }}>
                          {rows}
                        </span>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <span style={{ fontSize: 9, color: DIM, fontStyle: "italic" }}>
                    ← select a dataset to begin querying
                  </span>
                )}
              </div>

              {/* History */}
              <div
                ref={historyRef}
                style={{
                  flex: 1, overflowY: "auto", padding: "8px 12px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}
              >
                {history.length === 0 && !thinking && (
                  <div style={{ color: DIM, fontSize: 9, textAlign: "center", marginTop: 20, fontStyle: "italic" }}>
                    Ask a question about your selected dataset — JARVIS will analyse it with AI.
                  </div>
                )}

                {history.map((item, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {/* User question */}
                    <div style={{
                      alignSelf: "flex-end", maxWidth: "85%",
                      background: `${LM}14`, border: `1px solid ${LM}33`,
                      borderRadius: "10px 10px 2px 10px",
                      padding: "5px 10px", fontSize: 9, color: "#DCEBF5", lineHeight: 1.5,
                    }}>
                      <span style={{ fontSize: 7, color: DIM, display: "block", marginBottom: 2, letterSpacing: 1 }}>
                        [{item.dsName}]
                      </span>
                      {item.q}
                    </div>
                    {/* AI answer */}
                    <div style={{
                      alignSelf: "flex-start", maxWidth: "92%",
                      background: "rgba(255,255,255,0.03)", border: `1px solid ${LM}22`,
                      borderRadius: "2px 10px 10px 10px",
                      padding: "6px 10px", fontSize: 9, color: "#DCEBF5", lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                    }}>
                      <span style={{ fontSize: 7, color: LM, display: "block", marginBottom: 3, letterSpacing: 1 }}>
                        ◈ JARVIS
                      </span>
                      {item.a}
                    </div>
                  </div>
                ))}

                {thinking && (
                  <div style={{
                    alignSelf: "flex-start",
                    background: "rgba(255,255,255,0.03)", border: `1px solid ${LM}22`,
                    borderRadius: "2px 10px 10px 10px",
                    padding: "6px 10px", fontSize: 9, color: DIM, fontStyle: "italic",
                    animation: "dqrypulse 1s ease-in-out infinite",
                  }}>
                    Analysing dataset…
                  </div>
                )}
              </div>

              {/* Input row */}
              <div style={{
                padding: "8px 12px", borderTop: `1px solid ${LM}18`,
                display: "flex", gap: 6, flexShrink: 0,
                background: "rgba(4,6,14,0.5)",
              }}>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={selected ? "Ask a question about this dataset…" : "Select a dataset first"}
                  value={question}
                  disabled={!selected || thinking}
                  onChange={e => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{
                    flex: 1, background: `rgba(74,222,128,0.06)`,
                    border: `1px solid ${LM}${selected ? "44" : "22"}`,
                    borderRadius: 6, color: selected ? "#DCEBF5" : DIM,
                    fontSize: 10, padding: "6px 10px",
                    fontFamily: "'JetBrains Mono',monospace",
                    outline: "none",
                    opacity: selected && !thinking ? 1 : 0.5,
                  }}
                />
                <button
                  onClick={handleAsk}
                  disabled={!selected || !question.trim() || thinking}
                  style={{
                    background: selected && question.trim() && !thinking ? LM + "cc" : "rgba(5,8,13,0.5)",
                    border: `1px solid ${LM}${selected && question.trim() && !thinking ? "" : "33"}`,
                    borderRadius: 6, color: selected && question.trim() && !thinking ? "#04060A" : DIM,
                    cursor: selected && question.trim() && !thinking ? "pointer" : "default",
                    padding: "6px 12px", fontSize: 10, fontWeight: 700,
                    fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
                    transition: "all 0.2s",
                  }}
                >
                  ASK
                </button>
              </div>

              {/* Footer */}
              <div style={{
                padding: "4px 12px", borderTop: `1px solid ${LM}11`,
                display: "flex", gap: 8, flexShrink: 0,
              }}>
                <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
                  /v1/datasets · /v1/jarvis/agent/chat
                </span>
                {history.length > 0 && (
                  <button
                    onClick={() => setHistory([])}
                    style={{
                      marginLeft: "auto", background: "none", border: "none",
                      color: DIM, cursor: "pointer", fontSize: 7, letterSpacing: 1,
                      fontFamily: "'JetBrains Mono',monospace", padding: 0,
                    }}
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes dqrypulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
