/**
 * F95 — SwarmJob × RiskSignal × Knowledge Response Readiness (SRKRR)
 * Parallel-fetches /entities/SwarmJob + /entities/RiskSignal + /knowledge/.
 * Keyword-correlates each swarm job against active risk signals AND KB articles to classify:
 *   FULLY_PREPARED (both match) | RISK_AWARE (risk signal only)
 *   KB_BACKED (KB article only) | UNPREPARED (neither)
 * Stat tiles + coverage bar. Red pulse on unprepared count.
 * Filter tabs ALL/FULLY_PREPARED/RISK_AWARE/KB_BACKED/UNPREPARED + text search.
 * Expand job → matched risk signal cards (red) + KB article cards (green) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "srkrr/swarm readiness/swarm knowledge risk/unprepared swarm/swarm response readiness".
 * Event: jarvis:srkrr-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 996_120;
const Z_INDEX  = 157;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const SRKRR_RE = /\b(srkrr|swarm\s+readiness|swarm\s+knowledge\s+risk|unprepared\s+swarm|swarm\s+response\s+readiness|swarm\s+risk\s+knowledge|knowledge\s+swarm\s+risk|swarm\s+kb\s+risk)\b/i;

const CY = "#00CFFF";
const AM = "#F59E0B";
const GR = "#22C55E";
const RD = "#EF4444";
const TE = "#14B8A6";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_PREPARED: GR,
  RISK_AWARE:     RD,
  KB_BACKED:      TE,
  UNPREPARED:     AM,
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isSrkrrQuery(text) {
  return SRKRR_RE.test(text || "");
}

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function scoreAgainst(job, item) {
  const jobStr = [job.name, job.description, job.type, job.status].join(" ");
  const itemStr = [item.name, item.title, item.description, item.content, item.tags?.join?.(" ")].join(" ");
  return overlap(jobStr, itemStr);
}

async function fetchAll() {
  const h = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();
  const [rJobs, rRisk, rKb] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`,       { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/RiskSignal`,     { headers: h }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/knowledge/`,              { headers: h }).then(r => r.json()).catch(() => ({})),
  ]);
  const jobs    = norm(rJobs,  ["items","data","results","swarm_jobs"]);
  const signals = norm(rRisk,  ["items","data","results","risk_signals"]);
  const articles = norm(rKb,  ["items","data","results","articles","knowledge"]);

  const THRESH = 0.06;
  const rows = jobs.map(job => {
    const matchedRisk = signals
      .map(s => ({ ...s, _rel: scoreAgainst(job, s) }))
      .filter(s => s._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const matchedKb = articles
      .map(a => ({ ...a, _rel: scoreAgainst(job, a) }))
      .filter(a => a._rel >= THRESH)
      .sort((a, b) => b._rel - a._rel)
      .slice(0, 4);
    const hasRisk = matchedRisk.length > 0;
    const hasKb   = matchedKb.length > 0;
    const cls = hasRisk && hasKb ? "FULLY_PREPARED"
              : hasRisk          ? "RISK_AWARE"
              : hasKb            ? "KB_BACKED"
              :                    "UNPREPARED";
    return { ...job, _class: cls, _risk: matchedRisk, _kb: matchedKb };
  });
  return { rows, signals, articles };
}

export async function buildSrkrrScript() {
  const { rows } = await fetchAll();
  const total  = rows.length;
  const fp     = rows.filter(r => r._class === "FULLY_PREPARED").length;
  const ra     = rows.filter(r => r._class === "RISK_AWARE").length;
  const kb     = rows.filter(r => r._class === "KB_BACKED").length;
  const unprepared = rows.filter(r => r._class === "UNPREPARED").length;
  const pct = total ? Math.round((fp / total) * 100) : 0;
  return `Swarm response readiness SRKRR report, sir. Of ${total} swarm jobs: ${fp} are fully prepared with both risk signal context and KB backing (${pct}% readiness). ${ra} are risk-aware but lack KB documentation. ${kb} have KB articles but no linked risk signals. ${unprepared} are entirely unprepared — no risk context and no knowledge coverage. Recommend prioritising knowledge documentation for risk-aware swarm operations and filling the KB gaps on unprepared jobs immediately.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SwarmRiskKnowledgeReadiness() {
  const [open, setOpen]     = useState(false);
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState(null);
  const [tab, setTab]       = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { rows: r } = await fetchAll();
      setRows(r);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:srkrr-toggle", h);
    return () => window.removeEventListener("jarvis:srkrr-toggle", h);
  }, []);

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return [r.name, r.description, r.type, r.status].join(" ").toLowerCase().includes(s);
    }
    return true;
  });

  const total     = rows.length;
  const fp        = rows.filter(r => r._class === "FULLY_PREPARED").length;
  const ra        = rows.filter(r => r._class === "RISK_AWARE").length;
  const kb        = rows.filter(r => r._class === "KB_BACKED").length;
  const unprepared = rows.filter(r => r._class === "UNPREPARED").length;
  const pct = total ? Math.round((fp / total) * 100) : 0;

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildSrkrrScript();
      const base = apiBase();
      const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
        body: JSON.stringify({ message: script }),
      }).then(r => r.json()).catch(() => null);
      const text = res?.response || res?.message || res?.content || script;
      setBrief(text);
      try {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) },
          body: JSON.stringify({ text: text.slice(0, 400) }),
        });
      } catch {}
    } catch (e) {
      setBrief("Readiness assessment unavailable: " + String(e));
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["ALL", "FULLY_PREPARED", "RISK_AWARE", "KB_BACKED", "UNPREPARED"];
  const TAB_LABELS = { ALL: "ALL", FULLY_PREPARED: "FULLY PREP.", RISK_AWARE: "RISK AWARE", KB_BACKED: "KB BACKED", UNPREPARED: "UNPREPARED" };

  const tile = (label, val, color) => (
    <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 12px", textAlign: "center", minWidth: 70 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: FONT }}>{val}</div>
      <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const severityColor = s => {
    const sv = String(s || "").toUpperCase();
    if (sv === "CRITICAL") return "#DC2626";
    if (sv === "HIGH")     return RD;
    if (sv === "MEDIUM")   return AM;
    return "#6B7280";
  };

  return (
    <>
      {/* trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="SwarmJob × RiskSignal × Knowledge Response Readiness (SRKRR)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? CY : "rgba(6,11,22,0.88)",
          color: open ? "#04060A" : CY, border: `1px solid ${CY}55`,
          borderRadius: 6, padding: "4px 10px", fontSize: 10, fontFamily: FONT,
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
          boxShadow: open ? `0 0 14px ${CY}66` : "none",
        }}
      >
        ◈ SRKRR
        {unprepared > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A",
            borderRadius: 4, padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{unprepared}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: Z_INDEX + 1, width: "min(820px,95vw)", maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`, borderRadius: 14,
          display: "flex", flexDirection: "column", fontFamily: FONT,
          boxShadow: `0 0 60px ${CY}22`,
        }}>
          {/* header */}
          <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ SRKRR</span>
              <span style={{ color: "#6E8AA0", fontSize: 11 }}>SwarmJob × RiskSignal × Knowledge Response Readiness</span>
              <button onClick={() => setOpen(false)} style={{
                marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0",
                cursor: "pointer", fontSize: 16,
              }}>✕</button>
            </div>

            {/* stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {tile("TOTAL", total, CY)}
              {tile("FULLY PREP.", fp, GR)}
              {tile("RISK AWARE", ra, RD)}
              {tile("KB BACKED", kb, TE)}
              {tile("UNPREPARED", unprepared, AM)}
            </div>

            {/* coverage bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: "#6E8AA0", minWidth: 80 }}>READINESS</span>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg,${GR},${CY})`, borderRadius: 3, transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 11, color: GR, minWidth: 36 }}>{pct}%</span>
            </div>

            {/* filter tabs */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  fontSize: 9, padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: FONT,
                  background: tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.04)",
                  color: tab === t ? "#04060A" : "#8FA8C0",
                  border: `1px solid ${tab === t ? CLASS_COLOR[t] || CY : "rgba(255,255,255,0.1)"}`,
                }}>
                  {TAB_LABELS[t]}
                </button>
              ))}
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="search jobs…"
                style={{
                  marginLeft: "auto", fontSize: 10, padding: "3px 8px", borderRadius: 4,
                  background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
                  color: "#DCEBF5", fontFamily: FONT, outline: "none", width: 130,
                }}
              />
            </div>
          </div>

          {/* body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "10px 18px 14px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>loading swarm readiness data…</div>}
            {err     && <div style={{ color: RD, fontSize: 11, padding: 12 }}>{err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 12 }}>no swarm jobs match this filter</div>
            )}
            {filtered.map((job, i) => {
              const cc = CLASS_COLOR[job._class] || CY;
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  marginBottom: 6, border: `1px solid ${cc}22`, borderRadius: 8,
                  background: "rgba(255,255,255,0.02)",
                  animation: job._class === "UNPREPARED" ? "srkrrPulse 2s ease-in-out infinite" : "none",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                      boxShadow: `0 0 6px ${cc}` }} />
                    <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{job.name || job.id || `Job #${i+1}`}</span>
                    {job.type && <span style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{String(job.type).toUpperCase()}</span>}
                    <span style={{ fontSize: 9, color: cc, letterSpacing: 1, padding: "2px 6px",
                      border: `1px solid ${cc}44`, borderRadius: 4 }}>{job._class.replace("_", " ")}</span>
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 12px" }}>
                      {job.description && (
                        <div style={{ fontSize: 10, color: "#8FA8C0", marginBottom: 8, lineHeight: 1.5 }}>{job.description}</div>
                      )}
                      {/* risk signals */}
                      {job._risk.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, color: RD, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED RISK SIGNALS</div>
                          {job._risk.map((s, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(239,68,68,0.07)", border: `1px solid ${RD}22`, borderRadius: 6 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{ fontSize: 9, color: "#FFF", background: severityColor(s.severity),
                                  padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>
                                  {String(s.severity || "UNKNOWN").toUpperCase()}
                                </span>
                                <span style={{ fontSize: 11, color: "#DCEBF5" }}>{s.title || s.name || "Signal"}</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(s._rel * 100))}%`, height: "100%",
                                    background: RD, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: RD }}>{Math.round(s._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* KB articles */}
                      {job._kb.length > 0 && (
                        <div>
                          <div style={{ fontSize: 9, color: TE, letterSpacing: 1, marginBottom: 4 }}>▸ MATCHED KB ARTICLES</div>
                          {job._kb.map((a, j) => (
                            <div key={j} style={{ marginBottom: 4, padding: "5px 8px",
                              background: "rgba(20,184,166,0.07)", border: `1px solid ${TE}22`, borderRadius: 6 }}>
                              <div style={{ fontSize: 11, color: "#DCEBF5", marginBottom: 3 }}>
                                {a.title || a.name || "Article"}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 9, color: "#6E8AA0" }}>relevance</span>
                                <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                  <div style={{ width: `${Math.min(100, Math.round(a._rel * 100))}%`, height: "100%",
                                    background: TE, borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 9, color: TE }}>{Math.round(a._rel * 100)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {job._risk.length === 0 && job._kb.length === 0 && (
                        <div style={{ fontSize: 10, color: AM, fontStyle: "italic" }}>
                          No risk signals or KB articles correlated — swarm job is unprepared.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* footer */}
          <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
            <button onClick={assess} disabled={assessing || loading} style={{
              background: assessing ? "rgba(0,207,255,0.1)" : CY, color: assessing ? CY : "#04060A",
              border: `1px solid ${CY}`, borderRadius: 6, padding: "6px 14px", fontSize: 11,
              cursor: assessing ? "not-allowed" : "pointer", fontFamily: FONT, letterSpacing: 1,
            }}>
              {assessing ? "assessing…" : "▶ ASSESS READINESS"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
                background: "rgba(0,207,255,0.06)", borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${CY}22`,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes srkrrPulse {
          0%,100% { box-shadow: 0 0 0 0 ${AM}00; }
          50%      { box-shadow: 0 0 0 4px ${AM}44; }
        }
      `}</style>
    </>
  );
}
