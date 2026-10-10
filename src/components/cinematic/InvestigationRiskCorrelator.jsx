import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const RE = "#F44336";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const IRSIG_RE = /\b(inv(estigation)?\s*risk|risk\s*inv(estigation)?|irsig|unconfirmed\s*inv(estigation)?s?|investigation\s*signal|risk\s*signal\s*link|corroborated\s*inv(estigation)?s?)\b/i;
export function isIrsigQuery(q) { return IRSIG_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(investigation, signal) {
  const ikw = keywords(`${investigation.title || ""} ${investigation.description || ""} ${investigation.type || ""} ${investigation.status || ""}`);
  const skw = keywords(`${signal.name || signal.title || ""} ${signal.description || ""} ${signal.type || ""} ${signal.severity || ""} ${signal.source || ""}`);
  if (!ikw.length || !skw.length) return 0;
  const shared = ikw.filter(w => skw.includes(w));
  return shared.length / Math.max(ikw.length, skw.length);
}

export async function buildIrsigScript() {
  const base = apiBase();
  const [invRes, sigRes] = await Promise.allSettled([
    fetch(`${base}/v1/investigations`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
  ]);

  const investigations = invRes.status === "fulfilled"
    ? (invRes.value?.items || invRes.value || [])
    : [];
  const signals = sigRes.status === "fulfilled"
    ? (sigRes.value?.items || sigRes.value || [])
    : [];

  const corroborated = investigations.filter(inv =>
    signals.some(s => relevance(inv, s) > 0)
  );
  const unconfirmed = investigations.filter(inv =>
    !signals.some(s => relevance(inv, s) > 0)
  );

  const snapshot =
    `Investigations: ${investigations.length} total, ${corroborated.length} corroborated by risk signals, ` +
    `${unconfirmed.length} unconfirmed. Active risk signals: ${signals.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Investigation risk correlation analysis. Provide exactly 2 sentences: current corroboration status across open investigations, and recommended prioritisation action for unconfirmed investigations. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || `${unconfirmed.length} investigations lack risk signal corroboration. Prioritise evidence gathering for unconfirmed cases.`)
    .replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── Component ─────────────────────────────────────────────────────────────
export default function InvestigationRiskCorrelator() {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [investigations, setInvestigations] = useState([]);
  const [signals, setSignals]         = useState([]);
  const [filter, setFilter]           = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [briefText, setBriefText]     = useState("");
  const [briefing, setBriefing]       = useState(false);
  const [ts, setTs]                   = useState(null);
  const timerRef                      = useRef(null);
  const audioRef                      = useRef(null);

  const base    = apiBase();
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, sigRes] = await Promise.allSettled([
        fetch(`${base}/v1/investigations`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
      ]);
      const inv = invRes.status === "fulfilled" ? (invRes.value?.items || invRes.value || []) : [];
      const sig = sigRes.status === "fulfilled" ? (sigRes.value?.items || sigRes.value || []) : [];
      setInvestigations(Array.isArray(inv) ? inv : []);
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
  }, [base]);

  const runBrief = useCallback(async () => {
    setBriefing(true);
    try {
      const text = await buildIrsigScript();
      setBriefText(text);
      speak(text);
    } catch { setBriefText("Investigation risk correlation assessment unavailable."); }
    finally { setBriefing(false); }
  }, [speak]);

  // Auto-refresh while open
  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  // Voice toggle
  useEffect(() => {
    const handler = () => { setOpen(v => { if (!v) fetchData(); return !v; }); };
    window.addEventListener("jarvis:irsig-toggle", handler);
    return () => window.removeEventListener("jarvis:irsig-toggle", handler);
  }, [fetchData]);

  // Enrich each investigation with matched signals
  const enriched = investigations.map(inv => {
    const links = signals
      .map(s => ({ sig: s, score: relevance(inv, s) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...inv, links, corroborated: links.length > 0 };
  });

  const unconfirmedCount = enriched.filter(inv => !inv.corroborated).length;

  const filtered = enriched.filter(inv => {
    if (filter === "CORROBORATED" && !inv.corroborated) return false;
    if (filter === "UNCONFIRMED"  &&  inv.corroborated) return false;
    if (search) {
      const q = search.toLowerCase();
      return (inv.title || "").toLowerCase().includes(q) ||
             (inv.description || "").toLowerCase().includes(q) ||
             (inv.type || "").toLowerCase().includes(q) ||
             (inv.status || "").toLowerCase().includes(q);
    }
    return true;
  });

  const TABS = ["ALL", "CORROBORATED", "UNCONFIRMED"];

  // Severity colour for risk signals
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
        title="Investigation × Risk Signal Correlator"
        style={{
          position: "fixed", left: 976520, bottom: 8, zIndex: 122,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: 1,
          background: open ? CY : "rgba(5,8,13,0.82)",
          color: open ? "#04060A" : CY,
          border: `1px solid ${CY}`, borderRadius: 4, padding: "3px 8px",
          cursor: "pointer", whiteSpace: "nowrap",
          boxShadow: `0 0 10px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ IRSIG
        {unconfirmedCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 3, padding: "0 4px", fontSize: 9, fontWeight: 700,
          }}>{unconfirmedCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 976520, bottom: 36, zIndex: 122,
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
              INVESTIGATION × RISK SIGNAL CORRELATOR
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
          {investigations.length > 0 && (
            <div style={{ display: "flex", gap: 8 }}>
              {[
                ["INVESTIGATIONS", investigations.length,                            CY],
                ["RISK SIGNALS",   signals.length,                                   "#B0BEC5"],
                ["CORROBORATED",   enriched.filter(inv => inv.corroborated).length,  "#4CAF50"],
                ["UNCONFIRMED",    unconfirmedCount,                                 AM],
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
              placeholder="search investigations…"
              style={{
                marginLeft: "auto", background: "rgba(0,229,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 4, padding: "3px 8px",
                color: "#DCEBF5", fontSize: 10, outline: "none", width: 150,
              }}
            />
          </div>

          {/* Investigation list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {loading && <span style={{ color: "#6E8AA0", fontSize: 11 }}>loading…</span>}
            {!loading && filtered.length === 0 && (
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>No investigations match.</span>
            )}
            {filtered.map((inv, i) => {
              const isExp       = expanded === i;
              const statusColor = inv.corroborated ? "#4CAF50" : AM;
              return (
                <div key={inv.id || i} style={{
                  background: isExp ? "rgba(0,229,255,0.07)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${statusColor}33`,
                  borderRadius: 7, padding: "8px 10px", cursor: "pointer",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, padding: "1px 6px",
                      background: `${statusColor}22`, color: statusColor,
                      border: `1px solid ${statusColor}55`, borderRadius: 3,
                    }}>{inv.corroborated ? "CORROBORATED" : "UNCONFIRMED"}</span>
                    <span style={{ fontSize: 11, flex: 1 }}>{inv.title || "(unnamed investigation)"}</span>
                    {inv.status && (
                      <span style={{ fontSize: 9, color: "#6E8AA0" }}>{inv.status}</span>
                    )}
                    <span style={{ fontSize: 10, color: CY }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {inv.description && (
                    <div style={{ fontSize: 9, color: "#6E8AA0", marginTop: 3 }}>
                      {inv.description.slice(0, 100)}{inv.description.length > 100 ? "…" : ""}
                    </div>
                  )}

                  {/* Expanded: matched risk signals */}
                  {isExp && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                      {inv.links.length === 0 && (
                        <span style={{ fontSize: 9, color: AM }}>No corroborating risk signals found for this investigation.</span>
                      )}
                      {inv.links.map(({ sig, score }, li) => {
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
              {briefing ? "assessing…" : "▶ ASSESS CORROBORATION"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
