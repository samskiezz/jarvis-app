/**
 * F172 — Investment × SwarmJob × Task — Capital Automation Readiness (CARIT)
 *
 * Parallel-fetches /entities/Investment + /entities/SwarmJob + /entities/Task every 90 s.
 * Keyword-correlates each investment against swarm automation AND open task coverage:
 *
 *   FULLY_MANAGED   — backed by ≥1 swarm job AND ≥1 open task
 *   SWARM_MONITORED — swarm coverage but no task tracking
 *   TASK_TRACKED    — task coverage but no swarm automation
 *   UNMANAGED       — neither — capital position with no automation or task oversight
 *
 * Stat tiles: investments / swarm jobs / tasks / fully managed / unmanaged
 * Filter tabs: ALL | FULLY_MANAGED | SWARM_MONITORED | TASK_TRACKED | UNMANAGED
 * Text search on investment name/type/ticker.
 * Expand row → matched swarm jobs (cyan bars) + matched tasks (amber bars).
 * Orange badge + pulse on UNMANAGED count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence capital readiness brief + TTS.
 *
 * Toggle:  ◈ CARIT  at bottom:8 left:967360, zIndex:673.
 * Event:   jarvis:carit-toggle
 * Voice:   "carit / capital automation / investment swarm / investment task /
 *           unmanaged investment / capital readiness / portfolio automation /
 *           investment management / capital oversight / untracked investment"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 967_360;
const POLL_MS  = 90_000;

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

const CARIT_RE =
  /\b(carit|capital\s+automation|investment\s+swarm|investment\s+task|unmanaged\s+investment|capital\s+readiness|portfolio\s+automation|investment\s+management|capital\s+oversight|untracked\s+investment|capital\s+automation\s+readiness)\b/i;

export function isCaritQuery(q) { return CARIT_RE.test(q || ""); }

export async function buildCaritScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [invRes, swarmRes, taskRes] = await Promise.all([
      fetch(`${base}/entities/Investment`, { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
      fetch(`${base}/entities/Task`,        { headers: hdr }),
    ]);
    const invs   = normArr(await invRes.json(),   ["investments","data","items","results"]);
    const swarms = normArr(await swarmRes.json(), ["swarm_jobs","swarmJobs","data","items","results"]);
    const tasks  = normArr(await taskRes.json(),  ["tasks","data","items","results"]);

    const rows       = classifyInvestments(invs, swarms, tasks);
    const unmanaged  = rows.filter((r) => r.cls === "UNMANAGED").length;
    const fullManaged = rows.filter((r) => r.cls === "FULLY_MANAGED").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS capital automation readiness audit (CARIT): ${invs.length} investments ` +
          `cross-referenced against ${swarms.length} swarm jobs and ${tasks.length} tasks — ` +
          `${fullManaged} fully managed, ${unmanaged} unmanaged (no automation or task oversight). ` +
          `Give a 2-sentence capital readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return d?.response || d?.answer || d?.message || "Capital automation audit complete.";
  } catch (e) {
    return `Capital automation audit error: ${e.message}`;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normArr(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function tokens(str) {
  return String(str || "").toLowerCase().split(/\W+/).filter((t) => t.length > 2);
}

function hasOverlap(invTokens, candidate) {
  const candToks = tokens(
    `${candidate.name || ""} ${candidate.title || ""} ${candidate.description || ""} ` +
    `${candidate.type || ""} ${candidate.ticker || ""} ${candidate.symbol || ""}`
  );
  return invTokens.some((t) => candToks.includes(t));
}

function classifyInvestments(invs, swarms, tasks) {
  return invs.map((inv) => {
    const invToks     = tokens(`${inv.name || ""} ${inv.type || ""} ${inv.ticker || ""} ${inv.symbol || ""} ${inv.description || ""}`);
    const matchedSwarms = swarms.filter((sw) => hasOverlap(invToks, sw));
    const matchedTasks  = tasks.filter((tk)  => hasOverlap(invToks, tk));
    const hasSwarm = matchedSwarms.length > 0;
    const hasTask  = matchedTasks.length  > 0;
    let cls = "UNMANAGED";
    if (hasSwarm && hasTask) cls = "FULLY_MANAGED";
    else if (hasSwarm)       cls = "SWARM_MONITORED";
    else if (hasTask)        cls = "TASK_TRACKED";
    return { inv, cls, matchedSwarms, matchedTasks };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CY  = "#29E7FF";
const GR  = "#2ECC71";
const AM  = "#F39C12";
const OR  = "#FF8C00";
const RD  = "#E74C3C";

const CLS_COLOR = {
  FULLY_MANAGED:   GR,
  SWARM_MONITORED: CY,
  TASK_TRACKED:    AM,
  UNMANAGED:       OR,
};
const TABS = ["ALL", "FULLY_MANAGED", "SWARM_MONITORED", "TASK_TRACKED", "UNMANAGED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function InvestmentSwarmTaskAutonomy() {
  const [visible,    setVisible]    = useState(false);
  const [rows,       setRows]       = useState([]);
  const [invCnt,     setInvCnt]     = useState(0);
  const [swarmCnt,   setSwarmCnt]   = useState(0);
  const [taskCnt,    setTaskCnt]    = useState(0);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [answer,     setAnswer]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const timer = useRef(null);

  const unmanagedCount = rows.filter((r) => r.cls === "UNMANAGED").length;
  const fullCount      = rows.filter((r) => r.cls === "FULLY_MANAGED").length;

  async function load() {
    try {
      setLoading(true);
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [invRes, swarmRes, taskRes] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: hdr }),
        fetch(`${base}/entities/SwarmJob`,   { headers: hdr }),
        fetch(`${base}/entities/Task`,        { headers: hdr }),
      ]);
      const invs   = normArr(await invRes.json(),   ["investments","data","items","results"]);
      const swarms = normArr(await swarmRes.json(), ["swarm_jobs","swarmJobs","data","items","results"]);
      const tasks  = normArr(await taskRes.json(),  ["tasks","data","items","results"]);
      setInvCnt(invs.length);
      setSwarmCnt(swarms.length);
      setTaskCnt(tasks.length);
      setRows(classifyInvestments(invs, swarms, tasks));
    } catch (_) { /* silent — badge stays stale */ }
    finally    { setLoading(false); }
  }

  useEffect(() => {
    const toggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:carit-toggle", toggle);
    return () => window.removeEventListener("jarvis:carit-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [visible]);

  async function assess() {
    setAssessing(true);
    const text = await buildCaritScript();
    setAnswer(text);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  const filtered = rows
    .filter((r) => tab === "ALL" || r.cls === tab)
    .filter((r) => {
      const q = search.toLowerCase();
      return (
        !q ||
        String(r.inv.name   || "").toLowerCase().includes(q) ||
        String(r.inv.type   || "").toLowerCase().includes(q) ||
        String(r.inv.ticker || "").toLowerCase().includes(q)
      );
    });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jarvis:carit-toggle"))}
        title="Investment × SwarmJob × Task — Capital Automation Readiness"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 673,
          background: visible ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}66`, borderRadius: 6,
          color: visible ? "#04060A" : CY,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          padding: "3px 7px", cursor: "pointer", letterSpacing: 1,
          boxShadow: unmanagedCount > 0 ? `0 0 10px ${OR}88` : "none",
        }}
      >
        ◈ CARIT
        {unmanagedCount > 0 && (
          <span style={{
            marginLeft: 5, background: OR, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 8,
            animation: "caritpulse 1.4s ease-in-out infinite",
          }}>
            {unmanagedCount}
          </span>
        )}
      </button>

      <style>{`
        @keyframes caritpulse {
          0%,100%{opacity:1} 50%{opacity:0.4}
        }
      `}</style>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 380), zIndex: 674,
            width: "min(760px,96vw)", maxHeight: "78vh",
            background: "rgba(4,8,14,0.96)", border: `1px solid ${CY}44`,
            borderRadius: 14, overflow: "hidden",
            boxShadow: `0 0 60px ${CY}18, 0 24px 48px rgba(0,0,0,0.9)`,
            fontFamily: "'JetBrains Mono',monospace", display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ◈ INVESTMENT × SWARM × TASK — CAPITAL AUTOMATION READINESS
            </span>
            {loading && <span style={{ color: "#4E6070", fontSize: 9 }}>updating…</span>}
            <button
              onClick={assess} disabled={assessing}
              style={{
                marginLeft: "auto", background: assessing ? "#111" : `${GR}22`,
                border: `1px solid ${GR}66`, borderRadius: 5,
                color: GR, fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
              }}
            >
              {assessing ? "assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background: "transparent", border: "none",
                color: "#4E6070", fontSize: 14, cursor: "pointer", padding: "0 4px",
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 16px", flexWrap: "wrap" }}>
            {[
              { label: "INVESTMENTS",  val: invCnt,       col: CY  },
              { label: "SWARM JOBS",   val: swarmCnt,     col: GR  },
              { label: "TASKS",        val: taskCnt,      col: AM  },
              { label: "FULLY MGMT",  val: fullCount,    col: GR  },
              { label: "UNMANAGED",    val: unmanagedCount, col: OR },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                background: `${col}12`, border: `1px solid ${col}44`,
                borderRadius: 6, padding: "4px 10px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "0 16px 8px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button
                key={t} onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#2E4050"}`,
                  borderRadius: 5, color: tab === t ? (CLS_COLOR[t] || CY) : "#4E6070",
                  fontSize: 9, padding: "3px 8px", cursor: "pointer", letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="search investments…"
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}33`, borderRadius: 5,
                color: "#DCEBF5", fontSize: 9, padding: "3px 8px",
                outline: "none", width: 140, fontFamily: "inherit",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 20, color: "#4E6070", fontSize: 11, textAlign: "center" }}>
                No investments match filter
              </div>
            )}
            {filtered.map((r, i) => {
              const col   = CLS_COLOR[r.cls] || CY;
              const isExp = expanded === i;
              return (
                <div key={i}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "7px 16px", cursor: "pointer",
                      borderBottom: `1px solid ${CY}0A`,
                      background: isExp ? `${CY}08` : "transparent",
                    }}
                  >
                    <span style={{ color: col, fontSize: 10, width: 120, letterSpacing: 1, flexShrink: 0 }}>
                      {r.cls}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                      {r.inv.name || r.inv.ticker || r.inv.id || "Unnamed Investment"}
                    </span>
                    <span style={{ color: "#4E6070", fontSize: 9, marginRight: 8 }}>
                      {r.matchedSwarms.length}sw · {r.matchedTasks.length}tk
                    </span>
                    <span style={{ color: "#4E6070", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      background: "rgba(41,231,255,0.04)", padding: "10px 24px 14px",
                      borderBottom: `1px solid ${CY}0A`,
                    }}>
                      {/* Swarm jobs */}
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        SWARM COVERAGE ({r.matchedSwarms.length})
                      </div>
                      {r.matchedSwarms.length === 0 ? (
                        <div style={{ color: "#4E6070", fontSize: 10, marginBottom: 10 }}>No swarm jobs matched</div>
                      ) : (
                        r.matchedSwarms.slice(0, 5).map((sw, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{
                              height: 6, borderRadius: 3, background: CY,
                              width: `${Math.min(100, 30 + j * 10)}%`, maxWidth: 200,
                            }} />
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>
                              {sw.name || sw.title || sw.id || "Swarm Job"}
                            </span>
                          </div>
                        ))
                      )}

                      {/* Tasks */}
                      <div style={{ color: AM, fontSize: 9, letterSpacing: 1, margin: "10px 0 6px" }}>
                        TASK COVERAGE ({r.matchedTasks.length})
                      </div>
                      {r.matchedTasks.length === 0 ? (
                        <div style={{ color: "#4E6070", fontSize: 10 }}>No tasks matched</div>
                      ) : (
                        r.matchedTasks.slice(0, 5).map((tk, j) => (
                          <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{
                              height: 6, borderRadius: 3, background: AM,
                              width: `${Math.min(100, 30 + j * 10)}%`, maxWidth: 200,
                            }} />
                            <span style={{ color: "#DCEBF5", fontSize: 10 }}>
                              {tk.name || tk.title || tk.id || "Task"}
                            </span>
                            {tk.status && (
                              <span style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1 }}>
                                [{tk.status}]
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Answer strip */}
          {answer && (
            <div style={{
              padding: "8px 16px", borderTop: `1px solid ${CY}22`,
              color: "#8AAFC0", fontSize: 10, lineHeight: 1.5,
            }}>
              {answer}
            </div>
          )}
        </div>
      )}
    </>
  );
}
