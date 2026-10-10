/**
 * F160 — Risk Signal × Task × Investigation Management Coverage (RTSICM)
 *
 * Answers: "Which active risk signals are truly managed — backed by both a
 *           running task AND an open investigation — and which are UNMITIGATED
 *           with no operational response at all?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/RiskSignal  → active threats  (title/description/severity/status)
 *   GET /entities/Task        → running missions (name/description/status/priority)
 *   GET /v1/investigations    → open cases       (title/description/status/priority)
 *
 * Classification per risk signal (keyword correlation):
 *   FULLY_MANAGED  — task + investigation (both matched)
 *   TASK_ONLY      — task matched, no investigation
 *   INVESTIGATED   — investigation matched, no task
 *   UNMITIGATED    — neither matched (critical coverage gap)
 *
 * Stat tiles: RISK SIGNALS / TASKS / INVESTIGATIONS + four class counts + MANAGED%
 * Red badge on UNMITIGATED count.
 * Coverage bar showing FULLY_MANAGED share.
 * ▶ ASSESS COVERAGE: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ RTSICM  at left:1031960, bottom:8, zIndex:221.
 * Event:   jarvis:rtsicm-toggle
 * Voice:   "rtsicm / risk task coverage / unmitigated risk / risk management coverage /
 *           managed risk / risk investigation"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF3B6B";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const TEAL  = "#00CFB4";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1031960;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RTSICM_RE =
  /\b(rtsicm|risk task coverage|unmitigated risk|risk management coverage|managed risk|risk investigation)\b/i;

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [
      "items","results","data","records","signals","tasks","investigations",
      "entries","list","risks",
    ]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(obj) {
  return Object.values(obj || {})
    .filter(v => typeof v === "string")
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const wa = new Set(words(a));
  const wb = words(b);
  return wb.filter(w => wa.has(w)).length;
}

function classify(signal, tasks, invs) {
  const hasTask = tasks.some(t => overlap(signal, t) > 0);
  const hasInv  = invs.some(i => overlap(signal, i) > 0);
  if (hasTask && hasInv)  return "FULLY_MANAGED";
  if (hasTask)            return "TASK_ONLY";
  if (hasInv)             return "INVESTIGATED";
  return "UNMITIGATED";
}

function matchedItems(signal, pool) {
  return pool
    .map(item => ({ item, score: overlap(signal, item) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function sevColor(sev) {
  if (!sev) return MUTED;
  const s = String(sev).toUpperCase();
  if (s === "CRITICAL") return RED;
  if (s === "HIGH")     return "#FF7A59";
  if (s === "MEDIUM")   return AMBER;
  return GREEN;
}

function label(cls) {
  return {
    FULLY_MANAGED: { text: "FULLY MANAGED", color: GREEN  },
    TASK_ONLY:     { text: "TASK ONLY",     color: TEAL   },
    INVESTIGATED:  { text: "INVESTIGATED",  color: CY     },
    UNMITIGATED:   { text: "UNMITIGATED",   color: RED    },
  }[cls] ?? { text: cls, color: MUTED };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isRtsicmQuery(q) {
  return RTSICM_RE.test(q);
}

export async function buildRtsicmScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [sigRaw, taskRaw, invRaw] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Task`,        { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/investigations`,    { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const signals = normArr(sigRaw);
  const tasks   = normArr(taskRaw);
  const invs    = normArr(invRaw);

  let fullCount = 0;
  let unmitCount = 0;
  for (const sig of signals) {
    const cls = classify(sig, tasks, invs);
    if (cls === "FULLY_MANAGED") fullCount++;
    if (cls === "UNMITIGATED")   unmitCount++;
  }
  const managedPct = signals.length
    ? Math.round((fullCount / signals.length) * 100) : 0;

  return `RTSICM Risk Management Coverage online, sir. `
    + `Across ${signals.length} active risk signals, ${fullCount} are FULLY_MANAGED with both task and investigation backing — `
    + `${unmitCount} are completely UNMITIGATED with no operational response, representing a ${100 - managedPct}% management gap that requires immediate action.`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function RiskTaskInvestigationCoverage() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({
    signals: 0, tasks: 0, invs: 0,
    full: 0, taskOnly: 0, investigated: 0, unmit: 0,
  });
  const [filter, setFilter]     = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const [sigRaw, taskRaw, invRaw] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Task`,        { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/investigations`,    { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const signals = normArr(sigRaw);
      const tasks   = normArr(taskRaw);
      const invs    = normArr(invRaw);

      let full = 0, taskOnly = 0, investigated = 0, unmit = 0;
      const built = signals.map(sig => {
        const cls          = classify(sig, tasks, invs);
        const taskMatches  = matchedItems(sig, tasks);
        const invMatches   = matchedItems(sig, invs);
        if (cls === "FULLY_MANAGED")  full++;
        else if (cls === "TASK_ONLY") taskOnly++;
        else if (cls === "INVESTIGATED") investigated++;
        else unmit++;
        return { sig, cls, taskMatches, invMatches };
      });

      setRows(built);
      setStats({ signals: signals.length, tasks: tasks.length, invs: invs.length,
                 full, taskOnly, investigated, unmit });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => {
      setOpen(o => {
        const next = !o;
        if (next) load();
        return next;
      });
    };
    window.addEventListener("jarvis:rtsicm-toggle", toggle);
    return () => window.removeEventListener("jarvis:rtsicm-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
      const ctx = `Risk management coverage: ${stats.signals} signals, ${stats.full} fully managed, `
        + `${stats.unmit} unmitigated. Top signals need task assignment and investigation backing.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: `Assess this risk management coverage and give a 2-sentence recommendation: ${ctx}` }),
      });
      const d = await r.json();
      const script = (d.answer || "Risk management assessment complete.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch (e) {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = (r.sig.title || r.sig.name || "").toLowerCase();
      if (!title.includes(q)) return false;
    }
    return true;
  });

  const managedPct = stats.signals
    ? Math.round((stats.full / stats.signals) * 100) : 0;

  const TABS = ["ALL", "FULLY_MANAGED", "TASK_ONLY", "INVESTIGATED", "UNMITIGATED"];

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 221,
          background: "rgba(4,7,14,0.88)", border: `1px solid ${RED}88`,
          color: RED, fontFamily: MONO, fontSize: 10, letterSpacing: 2,
          padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          textShadow: `0 0 8px ${RED}`,
        }}
      >
        ◈ RTSICM{stats.unmit > 0 && (
          <span style={{
            marginLeft: 5, background: RED, color: "#fff",
            borderRadius: "50%", padding: "1px 5px", fontSize: 9,
          }}>{stats.unmit}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.72)", zIndex: 9900,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: BG, border: `1px solid ${RED}55`, borderRadius: 14,
        padding: "20px 22px", width: "min(860px,95vw)", maxHeight: "88vh",
        overflow: "auto", fontFamily: MONO, color: "#DCEBF5", position: "relative",
        boxShadow: `0 0 60px ${RED}22`,
      }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ color: RED, fontSize: 11, letterSpacing: 3 }}>◈ RTSICM</span>
          <span style={{ color: MUTED, fontSize: 10 }}>Risk Signal × Task × Investigation Coverage</span>
          <button onClick={load} disabled={loading}
            style={{ marginLeft: "auto", background: "none", border: `1px solid ${CY}44`,
              color: CY, fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>
            {loading ? "…" : "↺"}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ background: "none", border: `1px solid ${MUTED}44`, color: MUTED,
              fontSize: 10, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {[
            ["RISK SIGNALS", stats.signals, CY],
            ["TASKS",        stats.tasks,   TEAL],
            ["INVESTIGATIONS",stats.invs,   "#9B8AFB"],
            ["FULLY MANAGED",stats.full,    GREEN],
            ["TASK ONLY",    stats.taskOnly, TEAL],
            ["INVESTIGATED", stats.investigated, CY],
            ["UNMITIGATED",  stats.unmit,   RED],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: `${col}11`, border: `1px solid ${col}44`,
              borderRadius: 6, padding: "6px 12px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
              <div style={{ color: MUTED, fontSize: 9, letterSpacing: 1 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <span style={{ color: MUTED, fontSize: 10 }}>MANAGEMENT COVERAGE</span>
            <span style={{ color: managedPct >= 70 ? GREEN : managedPct >= 40 ? AMBER : RED, fontSize: 10 }}>
              {managedPct}%
            </span>
          </div>
          <div style={{ background: "#0A1A28", borderRadius: 4, height: 6 }}>
            <div style={{
              width: `${managedPct}%`, height: "100%", borderRadius: 4,
              background: managedPct >= 70 ? GREEN : managedPct >= 40 ? AMBER : RED,
              transition: "width 0.6s",
            }} />
          </div>
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setFilter(t)}
              style={{
                background: filter === t ? `${RED}22` : "none",
                border: `1px solid ${filter === t ? RED : MUTED + "44"}`,
                color: filter === t ? RED : MUTED, fontSize: 9, letterSpacing: 1,
                padding: "3px 10px", borderRadius: 4, cursor: "pointer",
              }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search signals…"
            style={{
              marginLeft: "auto", background: "#0A1A28", border: `1px solid ${MUTED}33`,
              color: "#DCEBF5", fontSize: 10, padding: "3px 8px", borderRadius: 4,
              fontFamily: MONO, outline: "none",
            }} />
        </div>

        {error && <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>Error: {error}</div>}

        {/* rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map((row, i) => {
            const sig    = row.sig;
            const lbl    = label(row.cls);
            const name   = sig.title || sig.name || `Signal ${i + 1}`;
            const sev    = sig.severity || sig.level || "";
            const isExp  = expanded === i;
            return (
              <div key={i} style={{
                background: "#080E18", border: `1px solid ${lbl.color}33`,
                borderRadius: 8, padding: "10px 14px", cursor: "pointer",
                boxShadow: row.cls === "UNMITIGATED" ? `0 0 8px ${RED}22` : "none",
              }} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: lbl.color,
                    border: `1px solid ${lbl.color}55`, borderRadius: 3, padding: "1px 6px",
                    ...(row.cls === "UNMITIGATED" ? { animation: "rtsicm-pulse 1.2s ease-in-out infinite" } : {}),
                  }}>{lbl.text}</span>
                  {sev && (
                    <span style={{
                      fontSize: 9, color: sevColor(sev),
                      border: `1px solid ${sevColor(sev)}44`, borderRadius: 3, padding: "1px 5px",
                    }}>{sev.toUpperCase()}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#DCEBF5", flex: 1 }}>{name}</span>
                  <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
                {sig.description && (
                  <div style={{ color: MUTED, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
                    {String(sig.description).slice(0, 120)}{sig.description.length > 120 ? "…" : ""}
                  </div>
                )}

                {isExp && (
                  <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {/* matched tasks */}
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ color: TEAL, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                        ◆ MATCHED TASKS ({row.taskMatches.length})
                      </div>
                      {row.taskMatches.length === 0
                        ? <div style={{ color: MUTED, fontSize: 10 }}>No task matches</div>
                        : row.taskMatches.map((m, j) => {
                            const t = m.item;
                            const pct = Math.min(100, m.score * 20);
                            return (
                              <div key={j} style={{
                                background: `${TEAL}0D`, border: `1px solid ${TEAL}33`,
                                borderRadius: 5, padding: "6px 10px", marginBottom: 5,
                              }}>
                                <div style={{ fontSize: 11, color: "#DCEBF5" }}>
                                  {t.name || t.title || `Task ${j + 1}`}
                                </div>
                                {t.status && (
                                  <div style={{ color: MUTED, fontSize: 9, marginTop: 2 }}>{t.status}</div>
                                )}
                                <div style={{ marginTop: 4, background: "#0A1A28", borderRadius: 3, height: 3 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 3 }} />
                                </div>
                              </div>
                            );
                          })
                      }
                    </div>

                    {/* matched investigations */}
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 2, marginBottom: 6 }}>
                        ◆ MATCHED INVESTIGATIONS ({row.invMatches.length})
                      </div>
                      {row.invMatches.length === 0
                        ? <div style={{ color: MUTED, fontSize: 10 }}>No investigation matches</div>
                        : row.invMatches.map((m, j) => {
                            const inv = m.item;
                            const pct = Math.min(100, m.score * 20);
                            return (
                              <div key={j} style={{
                                background: `${CY}0D`, border: `1px solid ${CY}33`,
                                borderRadius: 5, padding: "6px 10px", marginBottom: 5,
                              }}>
                                <div style={{ fontSize: 11, color: "#DCEBF5" }}>
                                  {inv.title || inv.name || `Investigation ${j + 1}`}
                                </div>
                                {inv.status && (
                                  <div style={{ color: MUTED, fontSize: 9, marginTop: 2 }}>{inv.status}</div>
                                )}
                                <div style={{ marginTop: 4, background: "#0A1A28", borderRadius: 3, height: 3 }}>
                                  <div style={{ width: `${pct}%`, height: "100%", background: CY, borderRadius: 3 }} />
                                </div>
                              </div>
                            );
                          })
                      }
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && !loading && (
          <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 24 }}>
            No signals match current filter.
          </div>
        )}

        {/* assess button + brief */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: assessing ? "#0A1A28" : `${RED}22`,
              border: `1px solid ${RED}66`, color: RED,
              fontFamily: MONO, fontSize: 10, letterSpacing: 1,
              padding: "5px 14px", borderRadius: 5, cursor: assessing ? "default" : "pointer",
            }}>
            {assessing ? "assessing…" : "▶ ASSESS COVERAGE"}
          </button>
          {brief && (
            <div style={{
              flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              background: "#080E18", border: `1px solid ${CY}22`,
              borderRadius: 5, padding: "6px 10px",
            }}>{brief}</div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes rtsicm-pulse {
          0%,100% { opacity:1; box-shadow:0 0 0 ${RED}; }
          50%      { opacity:0.6; box-shadow:0 0 8px ${RED}; }
        }
      `}</style>
    </div>
  );
}
