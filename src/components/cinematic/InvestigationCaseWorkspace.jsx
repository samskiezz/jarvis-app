/**
 * F52 — Investigation Case Workspace.
 * Lists /v1/investigations; select a case to see full metadata + cross-referenced
 * /entities/RiskSignal matches (keyword overlap on case title/tags);
 * ask JARVIS (/v1/jarvis/agent/chat) for AI case analysis → spoken via jarvis:speak-dossier.
 * In-panel Q&A history (up to 10 pairs).
 * Toggle: ◈ ICWS at left:4132 bottom strip.
 * "JARVIS, case workspace" / "investigation workspace" / "case deep dive" → isICWSQuery.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const OR  = "#FB923C"; // orange accent
const CY  = "#29E7FF";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const ICWS_RE =
  /\b(case\s+workspace|investigation\s+(workspace|case|detail)|case\s+(deep\s*dive|detail|analysis)|open\s+case|icws)\b/i;

async function fetchInvestigations() {
  const r = await fetch(`${apiBase()}/v1/investigations`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.investigations) ? d.investigations
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchRiskSignals() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data) ? d.data
    : Array.isArray(d?.items) ? d.items
    : [];
}

async function askAboutCase(inv, question) {
  const title  = inv.title || inv.name || inv.case_title || "Untitled Case";
  const status = inv.status || inv.state || "";
  const prio   = inv.priority || inv.severity || "";
  const lead   = inv.lead || inv.assigned_to || inv.assignee || "";
  const desc   = (inv.description || inv.summary || "").slice(0, 400);
  let context = `Investigation case: "${title}"`;
  if (status) context += `, status: ${status}`;
  if (prio)   context += `, priority: ${prio}`;
  if (lead)   context += `, lead: ${lead}`;
  if (desc)   context += `. Summary: ${desc}`;
  const prompt = `${context}. Question: ${question}`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body:    JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

function matchScore(inv, risk) {
  const haystack = [
    inv.title, inv.name, inv.case_title,
    inv.description, inv.summary,
    ...(Array.isArray(inv.tags) ? inv.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
  const needles = [
    risk.title, risk.name, risk.signal_name, risk.category,
    risk.description,
    ...(Array.isArray(risk.tags) ? risk.tags : []),
  ].filter(Boolean).join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return needles.filter(w => haystack.includes(w)).length;
}

function sevColor(s) {
  const v = typeof s === "string" ? s.toLowerCase() : String(s ?? "").toLowerCase();
  if (v === "critical" || Number(s) >= 90) return "#FF4444";
  if (v === "high"     || Number(s) >= 70) return "#FB923C";
  if (v === "medium"   || Number(s) >= 40) return "#FACC15";
  return CY;
}

function statusColor(s) {
  const v = (s || "").toLowerCase();
  if (v === "open")       return "#FF4444";
  if (v === "in-progress" || v === "in_progress" || v === "active") return OR;
  if (v === "pending")    return "#FACC15";
  if (v === "closed" || v === "done" || v === "complete") return "#4ADE80";
  return DIM;
}

export function isICWSQuery(text) {
  return ICWS_RE.test(text || "");
}

export async function buildICWSScript() {
  let investigations = [];
  try { investigations = await fetchInvestigations(); } catch (_) {}
  if (!investigations.length) return "No investigation cases available in the workspace at this time, sir.";
  const open = investigations.filter(i => (i.status || "").toLowerCase() === "open").length;
  const titles = investigations.slice(0, 2).map(i => i.title || i.name || "Untitled").join("; ");
  return (
    `Investigation Case Workspace online. ${investigations.length} case${investigations.length !== 1 ? "s" : ""} loaded` +
    (open ? `, ${open} open` : "") +
    `. Recent: ${titles}. Select a case to review cross-referenced risk signals and ask JARVIS for AI analysis, sir.`
  );
}

export default function InvestigationCaseWorkspace() {
  const [open,         setOpen]       = useState(false);
  const [cases,        setCases]      = useState([]);
  const [risks,        setRisks]      = useState([]);
  const [loading,      setLoading]    = useState(false);
  const [filter,       setFilter]     = useState("");
  const [selected,     setSelected]   = useState(null);
  const [question,     setQuestion]   = useState("");
  const [thinking,     setThinking]   = useState(false);
  const [history,      setHistory]    = useState([]);
  const historyRef = useRef(null);
  const inputRef   = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r] = await Promise.all([fetchInvestigations(), fetchRiskSignals()]);
      setCases(c);
      setRisks(r);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (ICWS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:icws-toggle", onToggle);
    return () => window.removeEventListener("jarvis:icws-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (open && selected && inputRef.current) inputRef.current.focus();
  }, [open, selected]);

  useEffect(() => {
    if (historyRef.current) historyRef.current.scrollTop = historyRef.current.scrollHeight;
  }, [history]);

  const visible = cases.filter(c => {
    if (!filter.trim()) return true;
    const hay = [c.title, c.name, c.case_title, c.status, c.priority, c.description]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  const relatedRisks = selected
    ? risks
        .map(r => ({ ...r, _score: matchScore(selected, r) }))
        .filter(r => r._score > 0)
        .sort((a, b) => b._score - a._score)
        .slice(0, 6)
    : [];

  const openCount = cases.filter(c => (c.status || "").toLowerCase() === "open").length;

  async function handleAsk() {
    if (!selected || !question.trim() || thinking) return;
    const q    = question.trim();
    const inv  = selected;
    const name = inv.title || inv.name || inv.case_title || "Case";
    setThinking(true);
    setQuestion("");
    let answer = "";
    try {
      answer = await askAboutCase(inv, q);
    } catch (_) {
      answer = "I could not retrieve an analysis from the intelligence core at this time, sir.";
    }
    if (!answer) answer = `I don't have detailed data on "${name}" to answer that specifically, sir.`;
    setHistory(h => [...h.slice(-9), { q, a: answer, caseName: name }]);
    setThinking(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  }

  return (
    <>
      {/* Toggle button — left:4132 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Investigation Case Workspace (F52)"
        style={{
          position: "fixed", left: 4132, bottom: 18, zIndex: 68,
          background: open ? OR + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? OR : OR + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : OR,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${OR}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        ICWS
        {openCount > 0 && (
          <span style={{
            background: "#FF444444", color: "#FF4444",
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {openCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(660px,96vw)", maxHeight: "min(720px,86vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${OR}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${OR}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${OR}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: OR,
              boxShadow: `0 0 10px ${OR}`, display: "inline-block",
              animation: loading ? "icwspulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: OR, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              INVESTIGATION CASE WORKSPACE
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "LOADING" : `${cases.length} cases · ${risks.length} signals`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Body: two-column */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

            {/* Left: case list */}
            <div style={{
              width: 210, flexShrink: 0,
              borderRight: `1px solid ${OR}18`,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}>
              <div style={{ padding: "6px 10px", borderBottom: `1px solid ${OR}14`, flexShrink: 0 }}>
                <input
                  type="text"
                  placeholder="filter cases…"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: `rgba(251,146,60,0.06)`, border: `1px solid ${OR}33`,
                    borderRadius: 5, color: "#DCEBF5", fontSize: 9,
                    padding: "4px 8px", fontFamily: "'JetBrains Mono',monospace",
                    outline: "none",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {visible.length === 0 && !loading && (
                  <div style={{ padding: 12, color: DIM, fontSize: 9, textAlign: "center" }}>
                    {cases.length === 0 ? "No cases." : "No matches."}
                  </div>
                )}
                {visible.map((c, i) => {
                  const key    = c.id || c._id || c.case_id || i;
                  const title  = c.title || c.name || c.case_title || `Case ${i + 1}`;
                  const status = c.status || c.state || "";
                  const prio   = c.priority || c.severity || "";
                  const isAct  = selected === c || (selected?.id && selected?.id === c.id);
                  return (
                    <div
                      key={key}
                      onClick={() => setSelected(c)}
                      style={{
                        padding: "7px 10px",
                        background: isAct ? `${OR}14` : "transparent",
                        borderBottom: `1px solid ${OR}11`,
                        cursor: "pointer",
                        borderLeft: isAct ? `2px solid ${OR}` : "2px solid transparent",
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = `${OR}08`; }}
                      onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{
                        fontSize: 9, color: isAct ? OR : "#DCEBF5",
                        fontWeight: 700, letterSpacing: 0.4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {title}
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 2, flexWrap: "wrap" }}>
                        {status && (
                          <span style={{
                            fontSize: 7, color: statusColor(status),
                            background: statusColor(status) + "22",
                            borderRadius: 3, padding: "1px 4px",
                          }}>
                            {status.toUpperCase()}
                          </span>
                        )}
                        {prio && (
                          <span style={{
                            fontSize: 7, color: DIM, background: "rgba(255,255,255,0.04)",
                            borderRadius: 3, padding: "1px 4px",
                          }}>
                            {String(prio).toUpperCase().slice(0, 8)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: case detail + Q&A */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {selected ? (
                <>
                  {/* Case metadata */}
                  <div style={{
                    padding: "8px 12px", borderBottom: `1px solid ${OR}18`,
                    flexShrink: 0,
                  }}>
                    <div style={{ color: OR, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                      ◈ {(selected.title || selected.name || selected.case_title || "Case").slice(0, 60)}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                      {(selected.status || selected.state) && (
                        <span style={{
                          fontSize: 8, color: statusColor(selected.status || selected.state),
                          background: statusColor(selected.status || selected.state) + "22",
                          borderRadius: 4, padding: "2px 6px",
                        }}>
                          {(selected.status || selected.state).toUpperCase()}
                        </span>
                      )}
                      {(selected.priority || selected.severity) && (
                        <span style={{
                          fontSize: 8, color: CY, background: CY + "18",
                          borderRadius: 4, padding: "2px 6px",
                        }}>
                          {String(selected.priority || selected.severity).toUpperCase()}
                        </span>
                      )}
                      {(selected.lead || selected.assigned_to || selected.assignee) && (
                        <span style={{ fontSize: 8, color: DIM }}>
                          LEAD: {selected.lead || selected.assigned_to || selected.assignee}
                        </span>
                      )}
                    </div>
                    {(selected.description || selected.summary) && (
                      <div style={{
                        fontSize: 8, color: "#9BB0C0", lineHeight: 1.5,
                        maxHeight: 36, overflow: "hidden",
                        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                      }}>
                        {selected.description || selected.summary}
                      </div>
                    )}
                    {/* Related risks */}
                    {relatedRisks.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 3 }}>
                          RELATED RISK SIGNALS ({relatedRisks.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {relatedRisks.map((r, i) => {
                            const sev = r.severity || r.level || r.score || "";
                            const label = r.title || r.name || r.signal_name || `Risk ${i+1}`;
                            return (
                              <span key={r.id || i} style={{
                                fontSize: 7, color: sevColor(sev),
                                background: sevColor(sev) + "18",
                                border: `1px solid ${sevColor(sev)}33`,
                                borderRadius: 4, padding: "1px 5px",
                                maxWidth: 120, overflow: "hidden",
                                textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {label.slice(0, 20)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {relatedRisks.length === 0 && risks.length > 0 && (
                      <div style={{ marginTop: 4, fontSize: 7, color: DIM, fontStyle: "italic" }}>
                        No matching risk signals found for this case.
                      </div>
                    )}
                  </div>

                  {/* Q&A history */}
                  <div
                    ref={historyRef}
                    style={{
                      flex: 1, overflowY: "auto", padding: "8px 12px",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    {history.length === 0 && !thinking && (
                      <div style={{ color: DIM, fontSize: 9, textAlign: "center", marginTop: 20, fontStyle: "italic" }}>
                        Ask JARVIS a question about this case — AI analysis on demand.
                      </div>
                    )}
                    {history.map((item, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <div style={{
                          alignSelf: "flex-end", maxWidth: "85%",
                          background: `${OR}14`, border: `1px solid ${OR}33`,
                          borderRadius: "10px 10px 2px 10px",
                          padding: "5px 10px", fontSize: 9, color: "#DCEBF5", lineHeight: 1.5,
                        }}>
                          <span style={{ fontSize: 7, color: DIM, display: "block", marginBottom: 2, letterSpacing: 1 }}>
                            [{item.caseName}]
                          </span>
                          {item.q}
                        </div>
                        <div style={{
                          alignSelf: "flex-start", maxWidth: "92%",
                          background: "rgba(255,255,255,0.03)", border: `1px solid ${OR}22`,
                          borderRadius: "2px 10px 10px 10px",
                          padding: "6px 10px", fontSize: 9, color: "#DCEBF5", lineHeight: 1.7,
                          whiteSpace: "pre-wrap",
                        }}>
                          <span style={{ fontSize: 7, color: OR, display: "block", marginBottom: 3, letterSpacing: 1 }}>
                            ◈ JARVIS
                          </span>
                          {item.a}
                        </div>
                      </div>
                    ))}
                    {thinking && (
                      <div style={{
                        alignSelf: "flex-start",
                        background: "rgba(255,255,255,0.03)", border: `1px solid ${OR}22`,
                        borderRadius: "2px 10px 10px 10px",
                        padding: "6px 10px", fontSize: 9, color: DIM, fontStyle: "italic",
                        animation: "icwspulse 1s ease-in-out infinite",
                      }}>
                        Analysing case…
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div style={{
                    padding: "8px 12px", borderTop: `1px solid ${OR}18`,
                    display: "flex", gap: 6, flexShrink: 0,
                    background: "rgba(4,6,14,0.5)",
                  }}>
                    <input
                      ref={inputRef}
                      type="text"
                      placeholder="Ask JARVIS about this case…"
                      value={question}
                      disabled={thinking}
                      onChange={e => setQuestion(e.target.value)}
                      onKeyDown={handleKeyDown}
                      style={{
                        flex: 1, background: `rgba(251,146,60,0.06)`,
                        border: `1px solid ${OR}44`,
                        borderRadius: 6, color: "#DCEBF5",
                        fontSize: 10, padding: "6px 10px",
                        fontFamily: "'JetBrains Mono',monospace",
                        outline: "none",
                        opacity: thinking ? 0.5 : 1,
                      }}
                    />
                    <button
                      onClick={handleAsk}
                      disabled={!question.trim() || thinking}
                      style={{
                        background: question.trim() && !thinking ? OR + "cc" : "rgba(5,8,13,0.5)",
                        border: `1px solid ${OR}${question.trim() && !thinking ? "" : "33"}`,
                        borderRadius: 6,
                        color: question.trim() && !thinking ? "#04060A" : DIM,
                        cursor: question.trim() && !thinking ? "pointer" : "default",
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
                    padding: "4px 12px", borderTop: `1px solid ${OR}11`,
                    display: "flex", gap: 8, flexShrink: 0, alignItems: "center",
                  }}>
                    <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
                      /v1/investigations · /entities/RiskSignal · /v1/jarvis/agent/chat
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
                </>
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  color: DIM, fontSize: 9, fontStyle: "italic",
                }}>
                  ← select an investigation case to begin
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes icwspulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
