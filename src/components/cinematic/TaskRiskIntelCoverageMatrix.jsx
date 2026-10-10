/**
 * F156 — Task × Risk Signal × IntelProfile Threat Coverage Matrix (TRICM)
 *
 * Answers: "Which tasks are operating under active threat exposure (risk signal
 *           + tracked actor), and which tasks are flying blind?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Task          → operational tasks (name/description/priority/status)
 *   GET /entities/RiskSignal    → risk signals (title/description/severity)
 *   GET /entities/IntelProfile  → threat actor profiles (name/aliases/org/role/tags)
 *
 * Classification per task (keyword correlation):
 *   THREAT_MONITORED — matched ≥1 risk signal + ≥1 intel profile (fully watched)
 *   RISK_FLAGGED     — matched risk signal only (actor unknown)
 *   ACTOR_TRACKED    — matched intel profile only (risk not yet formalised)
 *   EXPOSED          — matched neither (threat gap — no risk coverage, no actor link)
 *
 * Stat tiles: TASKS / RISK SIGNALS / INTEL PROFILES + four class counts + MONITORED%
 * Red badge on EXPOSED count.
 * ▶ ASSESS EXPOSURE: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ TRICM  at left:1029720, bottom:8, zIndex:217.
 * Event:   jarvis:tricm-toggle
 * Voice:   "tricm / task risk intel / task threat coverage / exposed tasks /
 *           task actor / task threat monitoring / threat coverage matrix"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const RED    = "#FF3B6B";
const ORANGE = "#e67e22";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1029720;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","tasks","signals","profiles","knowledge"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const str = [
    item.name, item.title, item.description, item.role, item.org,
    item.type, item.category, item.tags, item.aliases, item.severity,
    item.summary, item.content, item.status, item.priority,
  ].filter(Boolean).join(" ").toLowerCase();
  return str.split(/\W+/).filter(s => s.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  let hits = 0;
  for (const w of words(b)) if (setA.has(w)) hits++;
  return hits;
}

function relevancePct(hits, maxHits) {
  if (!maxHits) return 0;
  return Math.min(100, Math.round((hits / maxHits) * 100));
}

// ─── exported helpers wired by JarvisBrain ───────────────────────────────────

const TRICM_RE = /\b(tricm|task\s+risk\s+intel|task\s+threat\s+cover|exposed\s+task|task\s+actor|task\s+threat\s+monitor|threat\s+coverage\s+matrix)\b/i;

export function isTricmQuery(q) {
  return TRICM_RE.test(q);
}

export async function buildTricmScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [tRaw, rRaw, iRaw] = await Promise.all([
    fetch(`${base}/entities/Task`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const tasks   = normArr(tRaw);
  const signals = normArr(rRaw);
  const intels  = normArr(iRaw);

  let exposed = 0;
  for (const task of tasks) {
    const hasRisk  = signals.some(s => overlap(task, s) > 0);
    const hasActor = intels.some(p => overlap(task, p) > 0);
    if (!hasRisk && !hasActor) exposed++;
  }
  const pct = tasks.length ? Math.round(((tasks.length - exposed) / tasks.length) * 100) : 0;
  return `TRICM Task Threat Coverage Matrix online, sir. Correlating ${tasks.length} tasks against ${signals.length} risk signals and ${intels.length} intel profiles. ${exposed} tasks are EXPOSED with no threat coverage — ${pct}% monitored.`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskRiskIntelCoverageMatrix() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [stats, setStats]     = useState({ tasks: 0, signals: 0, intels: 0, monitored: 0, riskOnly: 0, actorOnly: 0, exposed: 0 });
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
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
      const [tRaw, rRaw, iRaw] = await Promise.all([
        fetch(`${base}/entities/Task`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const tasks   = normArr(tRaw);
      const signals = normArr(rRaw);
      const intels  = normArr(iRaw);

      // compute max overlap scores for normalisation
      let maxRS = 0, maxAP = 0;
      for (const t of tasks) {
        for (const s of signals) { const h = overlap(t, s); if (h > maxRS) maxRS = h; }
        for (const p of intels)  { const h = overlap(t, p); if (h > maxAP) maxAP = h; }
      }

      const built = tasks.map(task => {
        const rMatches = signals
          .map(s => ({ item: s, hits: overlap(task, s) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const aMatches = intels
          .map(p => ({ item: p, hits: overlap(task, p) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const hasRisk  = rMatches.length > 0;
        const hasActor = aMatches.length > 0;
        const cls = hasRisk && hasActor ? "THREAT_MONITORED"
                  : hasRisk             ? "RISK_FLAGGED"
                  : hasActor            ? "ACTOR_TRACKED"
                  :                       "EXPOSED";
        return { task, rMatches, aMatches, cls };
      });

      const monitored = built.filter(r => r.cls === "THREAT_MONITORED").length;
      const riskOnly  = built.filter(r => r.cls === "RISK_FLAGGED").length;
      const actorOnly = built.filter(r => r.cls === "ACTOR_TRACKED").length;
      const exposed   = built.filter(r => r.cls === "EXPOSED").length;

      setRows(built);
      setStats({ tasks: tasks.length, signals: signals.length, intels: intels.length,
                 monitored, riskOnly, actorOnly, exposed });
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:tricm-toggle", h);
    return () => window.removeEventListener("jarvis:tricm-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx = `Tasks:${stats.tasks} Signals:${stats.signals} Profiles:${stats.intels} `
                + `THREAT_MONITORED:${stats.monitored} RISK_FLAGGED:${stats.riskOnly} `
                + `ACTOR_TRACKED:${stats.actorOnly} EXPOSED:${stats.exposed}`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TRICM snapshot — ${ctx}. Provide a 2-sentence operational threat coverage brief. Which exposed tasks pose the highest mission risk and what immediate action should the operator take?` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || "Threat assessment complete, sir.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Threat assessment complete, sir.");
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  if (!open) {
    const exposedCount = stats.exposed;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Task × Risk Signal × IntelProfile Threat Coverage Matrix (TRICM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 217,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${exposedCount > 0 ? RED : CY}55`,
          color: exposedCount > 0 ? RED : CY, cursor: "pointer", borderRadius: 4,
          padding: "3px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          backdropFilter: "blur(4px)", whiteSpace: "nowrap",
        }}
      >
        ◈ TRICM{exposedCount > 0 ? <span style={{ marginLeft: 4, background: RED, color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: 8 }}>{exposedCount}</span> : null}
      </button>
    );
  }

  const TABS = ["ALL","THREAT_MONITORED","RISK_FLAGGED","ACTOR_TRACKED","EXPOSED"];
  const clsColor = { THREAT_MONITORED: GREEN, RISK_FLAGGED: RED, ACTOR_TRACKED: ORANGE, EXPOSED: AMBER };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.task.name, r.task.description, r.task.title].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const monPct = stats.tasks ? Math.round((stats.monitored / stats.tasks) * 100) : 0;
  const severityColor = { CRITICAL: RED, HIGH: "#FF7F3F", MEDIUM: AMBER, LOW: GREEN };

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 9000, width: "min(760px,95vw)", maxHeight: "85vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      boxShadow: `0 0 60px ${RED}18`, fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ padding: "12px 18px 8px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: RED, fontSize: 16 }}>⬡</span>
        <b style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>TRICM</b>
        <span style={{ color: MUTED, fontSize: 10 }}>Task × Risk Signal × Intel Profile Threat Coverage</span>
        <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 18px", flexWrap: "wrap" }}>
        {[
          ["TASKS",    stats.tasks,     CY],
          ["RISK SIG", stats.signals,   RED],
          ["PROFILES", stats.intels,    ORANGE],
          ["MONITORED",stats.monitored, GREEN],
          ["RISK ONLY",stats.riskOnly,  RED],
          ["ACTOR ONLY",stats.actorOnly,ORANGE],
          ["EXPOSED",  stats.exposed,   AMBER],
          ["MONITORED%",`${monPct}%`,   CY],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "0 18px 8px" }}>
        <div style={{ height: 4, background: `${CY}15`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${monPct}%`, height: "100%", background: `linear-gradient(90deg,${RED},${GREEN})`, transition: "width 0.5s" }} />
        </div>
        <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>{monPct}% of tasks have threat coverage</div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "0 18px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? `${CY}22` : "none", border: `1px solid ${filter === t ? CY : CY+"33"}`,
            color: filter === t ? CY : MUTED, cursor: "pointer", borderRadius: 4,
            padding: "2px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 0.5,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: MONO, outline: "none", width: 140 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
        {loading && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>Loading threat matrix…</div>}
        {error   && <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>No tasks match the current filter.</div>}
        {visible.map((row, i) => {
          const isExp = expanded === i;
          const cc = clsColor[row.cls] || CY;
          const isPulsed = row.cls === "EXPOSED";
          return (
            <div key={i} style={{
              borderBottom: `1px solid ${CY}11`, padding: "8px 0", cursor: "pointer",
            }} onClick={() => setExpanded(isExp ? null : i)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                  boxShadow: isPulsed ? `0 0 8px ${RED}` : "none",
                  animation: isPulsed ? "tricmPulse 1.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {row.task.name || row.task.title || "(unnamed task)"}
                </span>
                <span style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>
                  {row.task.priority || row.task.status || ""}
                </span>
                <span style={{
                  fontSize: 8, letterSpacing: 1, color: cc,
                  background: `${cc}18`, border: `1px solid ${cc}44`,
                  borderRadius: 3, padding: "1px 6px",
                }}>{row.cls}</span>
                <span style={{ color: MUTED, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 16 }}>
                  {/* risk signal matches */}
                  {row.rMatches.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: RED, letterSpacing: 1, marginBottom: 4 }}>RISK SIGNALS ({row.rMatches.length})</div>
                      {row.rMatches.map((m, j) => {
                        const sev = (m.item.severity || "").toUpperCase();
                        const sevCol = severityColor[sev] || MUTED;
                        const pct = relevancePct(m.hits, row.rMatches[0].hits);
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${RED}08`, borderRadius: 4, border: `1px solid ${RED}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: sevCol, background: `${sevCol}22`, border: `1px solid ${sevCol}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>{sev || "SIGNAL"}</span>
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.title || m.item.name || "(signal)"}</span>
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: `${RED}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: RED, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* intel profile matches */}
                  {row.aMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 4 }}>INTEL PROFILES ({row.aMatches.length})</div>
                      {row.aMatches.map((m, j) => {
                        const pct = relevancePct(m.hits, row.aMatches[0].hits);
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${ORANGE}08`, borderRadius: 4, border: `1px solid ${ORANGE}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: ORANGE, background: `${ORANGE}22`, border: `1px solid ${ORANGE}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>{m.item.role || "ACTOR"}</span>
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.name || "(profile)"}</span>
                            </div>
                            {m.item.org && <div style={{ fontSize: 9, color: MUTED, paddingLeft: 2 }}>{m.item.org}</div>}
                            <div style={{ marginTop: 3, height: 3, background: `${ORANGE}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: ORANGE, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {row.rMatches.length === 0 && row.aMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: RED, paddingLeft: 4 }}>No threat coverage found — task is fully EXPOSED.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ borderTop: `1px solid ${CY}22`, padding: "10px 18px", display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || rows.length === 0} style={{
          background: assessing ? "none" : `${CY}22`, border: `1px solid ${CY}55`,
          color: CY, cursor: assessing ? "default" : "pointer",
          borderRadius: 4, padding: "4px 14px", fontSize: 10, fontFamily: MONO, letterSpacing: 1,
        }}>
          {assessing ? "ASSESSING…" : "▶ ASSESS EXPOSURE"}
        </button>
        {brief && (
          <div style={{ flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      <style>{`
        @keyframes tricmPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.6); opacity: .4; }
        }
      `}</style>
    </div>
  );
}
