/**
 * F183 — RiskSignal × Report × OpsEvent — Threat Response Evidence Chain Audit (TRECA)
 *
 * Parallel-fetches /entities/RiskSignal + /v1/reports + /v1/ops/events every 90 s.
 * Keyword-correlates each risk signal against report archive AND ops event log:
 *
 *   FULLY_DOCUMENTED — matched ≥1 report AND ≥1 ops event
 *   REPORT_LINKED    — report matched, no corroborating ops event
 *   EVENT_LINKED     — ops event matched, no documenting report
 *   UNTRACKED        — neither — a threat with no evidence trail
 *
 * Stat tiles: risks / reports / events / fully documented / untracked
 * Filter tabs: ALL | FULLY_DOCUMENTED | REPORT_LINKED | EVENT_LINKED | UNTRACKED
 * Text search on risk signal title / severity / category.
 * Expand row → matched reports (amber bars) + matched ops events (cyan bars).
 * Red badge + pulse on UNTRACKED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence evidence chain brief + TTS.
 *
 * Toggle:  ◈ TRECA  at bottom:8 left:976820, zIndex:684.
 * Event:   jarvis:treca-toggle
 * Voice:   "treca / threat evidence / risk evidence chain / untracked threat /
 *           risk report coverage / threat response audit / ops event risk /
 *           threat documentation / evidence chain audit"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 976_820;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const RED      = "#FF2244";
const AMBER    = "#FFB020";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const TRECA_RE =
  /\b(treca|threat\s+evidence|risk\s+evidence\s+chain|untracked\s+threat|risk\s+report\s+coverage|threat\s+response\s+audit|ops\s+event\s+risk|threat\s+documentation|evidence\s+chain\s+audit)\b/i;

export function isTrecaQuery(q) {
  return TRECA_RE.test(q || "");
}

export async function buildTrecaScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [rr, rep, ev] = await Promise.allSettled([
      fetch(`${base}/entities/RiskSignal?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/reports?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/ops/events?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const risks   = toArr(rr.value);
    const reports = toArr(rep.value);
    const events  = toArr(ev.value);
    let untracked = 0;
    risks.forEach(sig => {
      const kws = keywords(sig);
      const hasRep = reports.some(r => matchKws(kws, r));
      const hasEv  = events.some(e => matchKws(kws, e));
      if (!hasRep && !hasEv) untracked++;
    });
    return `Threat Response Evidence Chain Audit: ${risks.length} risk signals assessed against ${reports.length} reports and ${events.length} ops events. ${untracked} signals have no evidence trail and require immediate documentation.`;
  } catch {
    return "TRECA assessment unavailable.";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.items)) return v.items;
  if (Array.isArray(v.results)) return v.results;
  if (Array.isArray(v.data)) return v.data;
  return [];
}

function txt(obj) {
  return [
    obj?.title, obj?.name, obj?.description, obj?.summary,
    obj?.severity, obj?.category, obj?.type, obj?.status,
    obj?.content, obj?.subject,
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywords(sig) {
  const raw = txt(sig);
  return raw.split(/\W+/).filter(w => w.length > 3);
}

function matchKws(kws, item) {
  if (!kws.length) return false;
  const haystack = txt(item);
  return kws.some(k => haystack.includes(k));
}

function classify(sig, reports, events) {
  const kws = keywords(sig);
  const hasRep = reports.some(r => matchKws(kws, r));
  const hasEv  = events.some(e => matchKws(kws, e));
  if (hasRep && hasEv)  return "FULLY_DOCUMENTED";
  if (hasRep)           return "REPORT_LINKED";
  if (hasEv)            return "EVENT_LINKED";
  return "UNTRACKED";
}

function getSev(sig) {
  const s = (sig?.severity || sig?.level || "").toLowerCase();
  if (s.includes("crit")) return "critical";
  if (s.includes("high")) return "high";
  if (s.includes("med"))  return "medium";
  return "low";
}

const CLASS_COLORS = {
  FULLY_DOCUMENTED: "#29E7FF",
  REPORT_LINKED:    "#FFB020",
  EVENT_LINKED:     "#7FEFB4",
  UNTRACKED:        "#FF2244",
};

const CLASS_ORDER = ["FULLY_DOCUMENTED", "REPORT_LINKED", "EVENT_LINKED", "UNTRACKED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RiskReportOpsEvidence() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [reportCount, setRepCt] = useState(0);
  const [eventCount, setEvCt]   = useState(0);
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [rr, rep, ev] = await Promise.allSettled([
        fetch(`${base}/entities/RiskSignal?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/reports?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/ops/events?limit=200`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const risks   = toArr(rr.value);
      const reports = toArr(rep.value);
      const events  = toArr(ev.value);
      setRepCt(reports.length);
      setEvCt(events.length);
      setRows(risks.map(sig => ({
        sig,
        cls: classify(sig, reports, events),
        matchedReports: reports.filter(r => matchKws(keywords(sig), r)).slice(0, 5),
        matchedEvents:  events.filter(e => matchKws(keywords(sig), e)).slice(0, 5),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isTrecaQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:treca-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:treca-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildTrecaScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(ans || script);
      window.dispatchEvent(new CustomEvent("jarvis:tts", { detail: { text: ans || script } }));
    } catch {
      const fallback = await buildTrecaScript();
      setAssessment(fallback);
    }
    setAssessing(false);
  }

  const untrackedCount = rows.filter(r => r.cls === "UNTRACKED").length;

  const displayRows = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = txt(r.sig);
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const stats = CLASS_ORDER.reduce((acc, cls) => {
    acc[cls] = rows.filter(r => r.cls === cls).length;
    return acc;
  }, {});

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Threat Response Evidence Chain Audit"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 684,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${untrackedCount > 0 ? RED : "#992244"}88`,
          borderRadius: 8, padding: "3px 8px", cursor: "pointer",
          color: open ? "#fff" : untrackedCount > 0 ? RED : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          boxShadow: untrackedCount > 0 ? `0 0 10px ${RED}44` : "none",
          animation: untrackedCount > 0 ? "treca-pulse 2s infinite" : "none",
        }}
      >
        ◈ TRECA{untrackedCount > 0 ? ` ${untrackedCount}!` : ""}
      </button>
      <style>{`
        @keyframes treca-pulse {
          0%,100% { box-shadow: 0 0 10px ${RED}44; }
          50%      { box-shadow: 0 0 20px ${RED}88; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", left: Math.max(8, BTN_LEFT - 340), bottom: 36, zIndex: 684,
          width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${RED}22`,
          fontFamily: MONO,
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>◈ TRECA</span>
            <span style={{ color: "#334F62", fontSize: 9 }}>threat response evidence chain</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#334F62",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 10px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              ["RISKS", rows.length, CY],
              ["REPORTS", reportCount, AMBER],
              ["EVENTS", eventCount, "#7FEFB4"],
              ["FULL", stats.FULLY_DOCUMENTED, CY],
              ["UNTRACKED", untrackedCount, RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "3px 7px", textAlign: "center", minWidth: 54,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#334F62", fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "4px 8px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)} style={{
                background: filter === cls ? `${CLASS_COLORS[cls] || CY}22` : "transparent",
                border: `1px solid ${filter === cls ? (CLASS_COLORS[cls] || CY) : "#1A2A38"}`,
                borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                color: filter === cls ? (CLASS_COLORS[cls] || CY) : "#334F62",
                fontSize: 8, letterSpacing: 0.5,
              }}>{cls === "ALL" ? `ALL (${rows.length})` : `${cls} (${stats[cls] || 0})`}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search risks…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                padding: "4px 8px", color: CY, fontSize: 10,
                fontFamily: MONO, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "16px", color: "#334F62", fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "loading…" : "no matches"}
              </div>
            ) : displayRows.map((row, i) => {
              const { sig, cls, matchedReports, matchedEvents } = row;
              const sev   = getSev(sig);
              const col   = CLASS_COLORS[cls];
              const title = sig?.title || sig?.name || sig?.id || `Signal ${i + 1}`;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0A`, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.04)" : "transparent",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0,
                      boxShadow: cls === "UNTRACKED" ? `0 0 6px ${RED}` : "none",
                    }} />
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{title}</span>
                    <span style={{
                      color: sev === "critical" ? RED : sev === "high" ? AMBER : "#334F62",
                      fontSize: 8, flexShrink: 0,
                    }}>{sev.toUpperCase()}</span>
                    <span style={{ color: col, fontSize: 8, flexShrink: 0 }}>{cls}</span>
                    <span style={{ color: "#334F62", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "4px 12px 8px" }}>
                      {sig?.description && (
                        <div style={{ color: "#5A7A90", fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                          {sig.description.slice(0, 120)}
                        </div>
                      )}
                      {/* Reports */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: AMBER, fontSize: 8, marginBottom: 3 }}>
                          REPORTS ({matchedReports.length})
                        </div>
                        {matchedReports.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedReports.map((rep, ri) => (
                            <div key={ri} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: AMBER,
                                  width: `${Math.min(100, 50 + ri * 10)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(rep?.title || rep?.name || "Report").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      {/* Ops Events */}
                      <div>
                        <div style={{ color: "#7FEFB4", fontSize: 8, marginBottom: 3 }}>
                          OPS EVENTS ({matchedEvents.length})
                        </div>
                        {matchedEvents.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedEvents.map((ev, ei) => (
                            <div key={ei} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: "#7FEFB4",
                                  width: `${Math.min(100, 50 + ei * 10)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(ev?.title || ev?.name || ev?.type || "Event").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} risks · {reportCount} reports · {eventCount} events
          </div>
        </div>
      )}
    </>
  );
}
