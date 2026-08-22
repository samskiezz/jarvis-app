/**
 * F69 — SwarmJob × Risk Signal Coverage Monitor (SRSC)
 *
 * Answers: "Which active risk signals have swarm jobs addressing them,
 *           and which are unsupervised?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob    → running/queued swarm intelligence jobs
 *   GET /entities/RiskSignal  → active risk signals
 *
 * Each RiskSignal's name/description/severity/source is keyword-matched against
 * each SwarmJob's name/description/target/objective to produce:
 *   COVERED    — at least one swarm job correlates to this signal
 *   UNCOVERED  — no swarm job is working on this risk signal
 *
 * Stat tiles:  signals / jobs / covered / uncovered
 * Red badge:   uncovered count on button (unsupervised risks are the gap).
 * Expand row:  matched swarm jobs with status badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SRSC  at left:1680 bottom:18, zIndex:68.
 * Event:   jarvis:srsc-toggle
 * Voice:   "swarm risk / risk swarm / srsc / uncovered risks / risk coverage /
 *           which risks have swarm / swarm coverage / swarm signal / risk supervision"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1680;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter(t => t.length > 2);
}

function scoreMatch(signal, job) {
  const sigTokens = new Set([
    ...tokens(signal.name),
    ...tokens(signal.description),
    ...tokens(signal.source),
    ...tokens(signal.severity),
    ...tokens(Array.isArray(signal.tags) ? signal.tags.join(" ") : signal.tags),
  ]);
  const jobSrc = [
    job.name, job.description,
    job.target, job.objective,
    Array.isArray(job.tags) ? job.tags.join(" ") : job.tags,
  ].join(" ");
  const jobTokens = tokens(jobSrc);
  return jobTokens.filter(t => sigTokens.has(t)).length;
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [sr, jr] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/SwarmJob`,   { headers }).then(r => r.json()).catch(() => []),
  ]);
  const signals = normArr(sr);
  const jobs    = normArr(jr);
  const correlated = signals.map(s => {
    const matches = jobs
      .map(j => ({ job: j, sc: scoreMatch(s, j) }))
      .filter(x => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return {
      signal: s,
      classification: matches.length > 0 ? "COVERED" : "UNCOVERED",
      matches,
    };
  });
  return { correlated, signalCount: signals.length, jobCount: jobs.length };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSrscQuery(q) {
  const t = q.toLowerCase();
  return (
    t.includes("swarm risk") || t.includes("risk swarm") ||
    t.includes("srsc") || t.includes("uncovered risk") ||
    t.includes("risk coverage") || t.includes("which risks have swarm") ||
    t.includes("swarm coverage") || t.includes("swarm signal") ||
    t.includes("risk supervision") || t.includes("supervised risk") ||
    t.includes("swarm monitor risk")
  );
}

export async function buildSrscScript() {
  try {
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    const [sr, jr] = await Promise.all([
      fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
      fetch(`${base}/entities/SwarmJob`,   { headers }).then(r => r.json()).catch(() => []),
    ]);
    const signals  = normArr(sr);
    const jobs     = normArr(jr);
    const covered  = signals.filter(s => jobs.some(j => scoreMatch(s, j) > 0)).length;
    const uncovered = signals.length - covered;
    return (
      `Swarm Risk Coverage: ${signals.length} signals, ${jobs.length} jobs. ` +
      `${covered} signals are covered by swarm activity. ` +
      `${uncovered} are unsupervised. ` +
      (uncovered > 0
        ? `Top unsupervised signal: ${
            signals.find(s => !jobs.some(j => scoreMatch(s, j) > 0))?.name || "unknown"
          }.`
        : "Full swarm coverage achieved.")
    );
  } catch (e) {
    return `Swarm risk coverage check failed: ${e.message}`;
  }
}

// ─── assess ──────────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const covered   = correlated.filter(c => c.classification === "COVERED").length;
  const uncovered = correlated.filter(c => c.classification === "UNCOVERED").length;
  const topUncovered = correlated
    .filter(c => c.classification === "UNCOVERED")
    .slice(0, 2)
    .map(c => c.signal?.name || "?")
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on SwarmJob × Risk Signal coverage: ` +
    `${covered} risk signals have swarm job coverage, ${uncovered} are unsupervised. ` +
    `${uncovered > 0 ? `Top unsupervised: ${topUncovered}.` : "All signals supervised."} ` +
    `Conclude with the most urgent operational action.`;
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j    = await r.json();
    const text = j.response || j.reply || j.message || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmRiskCoverageMonitor() {
  const [open, setOpen]             = useState(false);
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const result = await fetchAll();
      setData(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:srsc-toggle", handler);
    return () => window.removeEventListener("jarvis:srsc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const speak = useCallback((text) => {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: localStorage.getItem("jarvis_voice") || "ash" }),
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      new Audio(url).play().catch(() => {});
    }).catch(() => {});
  }, []);

  if (!open) {
    const uncoveredCount =
      data?.correlated?.filter(c => c.classification === "UNCOVERED").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Risk Signal Coverage Monitor (SRSC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(4,7,14,0.82)", border: `1px solid ${RED}44`,
          color: RED, fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 3, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ SRSC
        {uncoveredCount > 0 && (
          <span style={{
            background: RED, color: "#fff", borderRadius: 8,
            padding: "0 5px", fontSize: 9, fontWeight: 700,
          }}>{uncoveredCount}</span>
        )}
      </button>
    );
  }

  const { correlated = [], signalCount = 0, jobCount = 0 } = data || {};
  const covered   = correlated.filter(c => c.classification === "COVERED").length;
  const uncovered = correlated.filter(c => c.classification === "UNCOVERED").length;

  const visible = correlated.filter(c => {
    if (filter === "COVERED"   && c.classification !== "COVERED")   return false;
    if (filter === "UNCOVERED" && c.classification !== "UNCOVERED") return false;
    if (search) {
      const q    = search.toLowerCase();
      const name = String(c.signal?.name        || "").toLowerCase();
      const desc = String(c.signal?.description || "").toLowerCase();
      if (!name.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  const TAB_STYLE = (active, col = RED) => ({
    background: active ? col : "transparent",
    color: active ? (col === RED ? "#fff" : "#000") : MUTED,
    border: `1px solid ${active ? col : MUTED}44`,
    borderRadius: 3, padding: "2px 8px", fontSize: 9,
    fontFamily: MONO, cursor: "pointer", letterSpacing: 1,
  });

  const sevCol = (sev) => {
    const s = String(sev || "").toUpperCase();
    if (s === "CRITICAL") return RED;
    if (s === "HIGH")     return "#FF7A00";
    if (s === "MEDIUM")   return AMBER;
    return GREEN;
  };

  return (
    <div style={{
      position: "fixed", right: 18, top: 60, width: 520, maxHeight: "80vh",
      background: BG, border: `1px solid ${RED}55`, borderRadius: 6,
      fontFamily: MONO, fontSize: 11, color: CY, zIndex: 160,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${RED}33`,
        flexShrink: 0,
      }}>
        <span style={{ color: RED, fontWeight: 700, letterSpacing: 2 }}>
          ◈ SWARM × RISK SIGNAL COVERAGE
        </span>
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: MUTED,
          cursor: "pointer", fontSize: 14, lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 12px", flexShrink: 0,
      }}>
        {[
          ["SIGNALS",   signalCount,  CY],
          ["JOBS",      jobCount,     CY],
          ["COVERED",   covered,      GREEN],
          ["UNCOVERED", uncovered,    RED],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{loading ? "…" : val}</div>
            <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "0 12px 6px", flexShrink: 0, flexWrap: "wrap",
      }}>
        {["ALL", "COVERED", "UNCOVERED"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={TAB_STYLE(filter === f)}>
            {f}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            background: "rgba(255,255,255,0.04)", border: `1px solid ${MUTED}44`,
            color: CY, fontFamily: MONO, fontSize: 10, borderRadius: 3,
            padding: "2px 8px", outline: "none", flex: 1, minWidth: 100,
          }}
        />
        <button
          onClick={async () => {
            if (assessing) return;
            setAssessing(true); setAssessText("");
            await runAssess(correlated, setAssessText, speak);
            setAssessing(false);
          }}
          style={TAB_STYLE(false, CY)}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
      </div>

      {assessText && (
        <div style={{
          margin: "0 12px 6px", padding: "6px 10px",
          background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}33`,
          borderRadius: 4, color: CY, fontSize: 10, lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {assessText}
        </div>
      )}

      {err && (
        <div style={{ margin: "0 12px 6px", color: RED, fontSize: 10, flexShrink: 0 }}>
          {err}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: MUTED, textAlign: "center", padding: 18, fontSize: 10 }}>
            No signals match filter.
          </div>
        )}
        {visible.map((c, i) => {
          const sig  = c.signal || {};
          const isEx = expanded === i;
          const col  = c.classification === "COVERED" ? GREEN : RED;
          return (
            <div key={i} style={{
              borderBottom: `1px solid ${CY}0D`,
              cursor: "pointer",
            }} onClick={() => setExpanded(isEx ? null : i)}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 12px",
              }}>
                <span style={{
                  background: col, color: "#000", borderRadius: 3,
                  padding: "1px 6px", fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>
                  {c.classification}
                </span>
                <span style={{
                  background: sevCol(sig.severity) + "33",
                  color: sevCol(sig.severity), borderRadius: 3,
                  padding: "1px 5px", fontSize: 8, flexShrink: 0,
                }}>
                  {sig.severity || "?"}
                </span>
                <span style={{ color: CY, flex: 1, fontSize: 11 }}>
                  {sig.name || sig.id || "Unknown Signal"}
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>
                  {c.matches.length} job{c.matches.length !== 1 ? "s" : ""}
                </span>
                <span style={{ color: MUTED, fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>

              {isEx && (
                <div style={{
                  padding: "0 12px 8px 12px",
                  background: "rgba(255,255,255,0.02)",
                }}>
                  {sig.description && (
                    <div style={{
                      color: MUTED, fontSize: 9, marginBottom: 6,
                      lineHeight: 1.4,
                    }}>
                      {sig.description}
                    </div>
                  )}
                  {c.matches.length === 0 ? (
                    <div style={{ color: RED, fontSize: 9 }}>No swarm jobs cover this signal.</div>
                  ) : (
                    c.matches.slice(0, 5).map((m, mi) => {
                      const job   = m.job || {};
                      const maxSc = c.matches[0]?.sc || 1;
                      const pct   = Math.round((m.sc / maxSc) * 100);
                      const stCol =
                        String(job.status || "").toLowerCase() === "running" ? GREEN :
                        String(job.status || "").toLowerCase() === "failed"  ? RED   : AMBER;
                      return (
                        <div key={mi} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              background: stCol + "33", color: stCol,
                              borderRadius: 3, padding: "1px 5px", fontSize: 8, flexShrink: 0,
                            }}>
                              {job.status || "?"}
                            </span>
                            <span style={{ color: CY, fontSize: 10, flex: 1 }}>
                              {job.name || job.id || "Unknown Job"}
                            </span>
                            <span style={{ color: MUTED, fontSize: 8 }}>{m.sc}pt</span>
                          </div>
                          <div style={{
                            height: 2, background: `${CY}22`,
                            borderRadius: 1, margin: "2px 0 0",
                          }}>
                            <div style={{
                              height: 2, width: `${pct}%`,
                              background: col, borderRadius: 1,
                            }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        borderTop: `1px solid ${RED}22`, padding: "5px 12px",
        color: MUTED, fontSize: 9, letterSpacing: 1, flexShrink: 0,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>SWARM × RISK — {visible.length}/{correlated.length} signals</span>
        <span>auto-refresh 60s</span>
      </div>
    </div>
  );
}
