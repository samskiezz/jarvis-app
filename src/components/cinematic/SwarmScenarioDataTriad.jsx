/**
 * F157 — SwarmJob × Scenario × Dataset Operational Execution Triad (SWEDAT)
 *
 * Answers: "Which swarm jobs have scenario playbooks AND supporting datasets,
 *           and which jobs are operating in the dark?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/SwarmJob   → automation jobs (name/description/status/type)
 *   GET /v1/scenario/list    → operational playbooks (name/description/type)
 *   GET /v1/datasets         → data sources (name/description/tags)
 *
 * Classification per swarm job (keyword correlation):
 *   FULLY_SUPPORTED  — matched ≥1 scenario + ≥1 dataset (full operational backing)
 *   SCENARIO_DRIVEN  — matched scenario only (playbook exists, no data)
 *   DATA_BACKED      — matched dataset only (data exists, no playbook)
 *   UNSUPPORTED      — matched neither (operating blind — highest risk)
 *
 * Stat tiles: JOBS / SCENARIOS / DATASETS + four class counts + SUPPORT%
 * Amber badge on UNSUPPORTED count.
 * ▶ ASSESS EXECUTION: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ SWEDAT  at left:1030280, bottom:8, zIndex:218.
 * Event:   jarvis:swedat-toggle
 * Voice:   "swedat / swarm execution / swarm scenario / swarm dataset /
 *           unsupported swarm / swarm execution triad / operational execution"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const RED    = "#FF3B6B";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#b06bff";
const TEAL   = "#00c8b0";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1030280;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","tasks","scenarios","datasets","jobs","swarm_jobs"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const str = [
    item.name, item.title, item.description, item.type,
    item.category, item.tags, item.status, item.summary,
    item.content, item.priority, item.objective,
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

const SWEDAT_RE = /\b(swedat|swarm\s+execution|swarm\s+scenario|swarm\s+dataset|unsupported\s+swarm|swarm\s+execution\s+triad|operational\s+execution\s+triad)\b/i;

export function isSwedatQuery(q) {
  return SWEDAT_RE.test(q);
}

export async function buildSwedatScript() {
  const base = apiBase();
  const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
  const [jRaw, sRaw, dRaw] = await Promise.all([
    fetch(`${base}/entities/SwarmJob`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/datasets`, { headers: h }).then(r => r.json()).catch(() => []),
  ]);
  const jobs      = normArr(jRaw);
  const scenarios = normArr(sRaw);
  const datasets  = normArr(dRaw);

  let unsupported = 0;
  for (const job of jobs) {
    const hasScenario = scenarios.some(s => overlap(job, s) > 0);
    const hasDataset  = datasets.some(d => overlap(job, d) > 0);
    if (!hasScenario && !hasDataset) unsupported++;
  }
  const pct = jobs.length ? Math.round(((jobs.length - unsupported) / jobs.length) * 100) : 0;
  return `SWEDAT Operational Execution Triad online, sir. Correlating ${jobs.length} swarm jobs against ${scenarios.length} scenario playbooks and ${datasets.length} datasets. ${unsupported} jobs are UNSUPPORTED with no execution backing — ${pct}% have operational support.`;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmScenarioDataTriad() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [stats, setStats]       = useState({ jobs: 0, scenarios: 0, datasets: 0, full: 0, scenarioOnly: 0, dataOnly: 0, unsupported: 0 });
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
      const [jRaw, sRaw, dRaw] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/scenario/list`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/datasets`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      const jobs      = normArr(jRaw);
      const scenarios = normArr(sRaw);
      const datasets  = normArr(dRaw);

      let maxSc = 0, maxDs = 0;
      for (const j of jobs) {
        for (const s of scenarios) { const h2 = overlap(j, s); if (h2 > maxSc) maxSc = h2; }
        for (const d of datasets)  { const h2 = overlap(j, d); if (h2 > maxDs) maxDs = h2; }
      }

      const built = jobs.map(job => {
        const sMatches = scenarios
          .map(s => ({ item: s, hits: overlap(job, s) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const dMatches = datasets
          .map(d => ({ item: d, hits: overlap(job, d) }))
          .filter(x => x.hits > 0)
          .sort((a, b) => b.hits - a.hits)
          .slice(0, 5);
        const hasScenario = sMatches.length > 0;
        const hasDataset  = dMatches.length > 0;
        const cls = hasScenario && hasDataset ? "FULLY_SUPPORTED"
                  : hasScenario               ? "SCENARIO_DRIVEN"
                  : hasDataset                ? "DATA_BACKED"
                  :                             "UNSUPPORTED";
        return { job, sMatches, dMatches, cls };
      });

      const full         = built.filter(r => r.cls === "FULLY_SUPPORTED").length;
      const scenarioOnly = built.filter(r => r.cls === "SCENARIO_DRIVEN").length;
      const dataOnly     = built.filter(r => r.cls === "DATA_BACKED").length;
      const unsupported  = built.filter(r => r.cls === "UNSUPPORTED").length;

      setRows(built);
      setStats({ jobs: jobs.length, scenarios: scenarios.length, datasets: datasets.length,
                 full, scenarioOnly, dataOnly, unsupported });
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
    window.addEventListener("jarvis:swedat-toggle", h);
    return () => window.removeEventListener("jarvis:swedat-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx = `Jobs:${stats.jobs} Scenarios:${stats.scenarios} Datasets:${stats.datasets} `
                + `FULLY_SUPPORTED:${stats.full} SCENARIO_DRIVEN:${stats.scenarioOnly} `
                + `DATA_BACKED:${stats.dataOnly} UNSUPPORTED:${stats.unsupported}`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `SWEDAT snapshot — ${ctx}. Provide a 2-sentence operational execution brief. Which unsupported swarm jobs pose the highest risk to mission continuity and what immediate action should the operator take?` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || "Execution assessment complete, sir.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Execution assessment complete, sir.");
    } finally {
      setAssessing(false);
    }
  }, [stats]);

  if (!open) {
    const unsupportedCount = stats.unsupported;
    return (
      <button
        onClick={() => setOpen(true)}
        title="SwarmJob × Scenario × Dataset Operational Execution Triad (SWEDAT)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 218,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${unsupportedCount > 0 ? AMBER : CY}55`,
          color: unsupportedCount > 0 ? AMBER : CY, cursor: "pointer", borderRadius: 4,
          padding: "3px 8px", fontSize: 9, fontFamily: MONO, letterSpacing: 1,
          backdropFilter: "blur(4px)", whiteSpace: "nowrap",
        }}
      >
        ◈ SWEDAT{unsupportedCount > 0
          ? <span style={{ marginLeft: 4, background: AMBER, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8 }}>{unsupportedCount}</span>
          : null}
      </button>
    );
  }

  const TABS = ["ALL","FULLY_SUPPORTED","SCENARIO_DRIVEN","DATA_BACKED","UNSUPPORTED"];
  const clsColor = {
    FULLY_SUPPORTED:  GREEN,
    SCENARIO_DRIVEN:  PURPLE,
    DATA_BACKED:      TEAL,
    UNSUPPORTED:      AMBER,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = [r.job.name, r.job.description, r.job.title, r.job.type].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const supportPct = stats.jobs ? Math.round((stats.full / stats.jobs) * 100) : 0;

  return (
    <div style={{
      position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
      zIndex: 9000, width: "min(760px,95vw)", maxHeight: "85vh",
      background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
      boxShadow: `0 0 60px ${AMBER}18`, fontFamily: MONO, display: "flex", flexDirection: "column",
    }}>
      {/* header */}
      <div style={{ padding: "12px 18px 8px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: AMBER, fontSize: 16 }}>⬡</span>
        <b style={{ color: CY, letterSpacing: 2, fontSize: 12 }}>SWEDAT</b>
        <span style={{ color: MUTED, fontSize: 10 }}>SwarmJob × Scenario × Dataset Execution Triad</span>
        <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 18px", flexWrap: "wrap" }}>
        {[
          ["JOBS",       stats.jobs,         CY],
          ["SCENARIOS",  stats.scenarios,     PURPLE],
          ["DATASETS",   stats.datasets,      TEAL],
          ["FULL SUPP",  stats.full,          GREEN],
          ["SCEN ONLY",  stats.scenarioOnly,  PURPLE],
          ["DATA ONLY",  stats.dataOnly,      TEAL],
          ["UNSUPPORTED",stats.unsupported,   AMBER],
          ["SUPPORT%",   `${supportPct}%`,    CY],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: `${col}11`, border: `1px solid ${col}33`, borderRadius: 6, padding: "4px 10px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* support coverage bar */}
      <div style={{ padding: "0 18px 8px" }}>
        <div style={{ height: 4, background: `${CY}15`, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${supportPct}%`, height: "100%", background: `linear-gradient(90deg,${AMBER},${GREEN})`, transition: "width 0.5s" }} />
        </div>
        <div style={{ fontSize: 9, color: MUTED, marginTop: 3 }}>{supportPct}% of swarm jobs fully supported (scenario + dataset)</div>
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
          placeholder="search jobs…"
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", borderRadius: 4, padding: "2px 8px", fontSize: 9,
            fontFamily: MONO, outline: "none", width: 140 }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 8px" }}>
        {loading && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>Loading execution triad…</div>}
        {error   && <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {error}</div>}
        {!loading && visible.length === 0 && <div style={{ color: MUTED, fontSize: 10, padding: 8 }}>No jobs match the current filter.</div>}
        {visible.map((row, i) => {
          const isExp = expanded === i;
          const cc = clsColor[row.cls] || CY;
          const isPulsed = row.cls === "UNSUPPORTED";
          return (
            <div key={i} style={{ borderBottom: `1px solid ${CY}11`, padding: "8px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isExp ? null : i)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", background: cc, flexShrink: 0,
                  boxShadow: isPulsed ? `0 0 8px ${AMBER}` : "none",
                  animation: isPulsed ? "swedatPulse 1.4s ease-in-out infinite" : "none",
                }} />
                <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>
                  {row.job.name || row.job.title || "(unnamed job)"}
                </span>
                <span style={{ fontSize: 8, color: MUTED, marginRight: 4 }}>
                  {row.job.status || row.job.type || ""}
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
                  {/* scenario matches */}
                  {row.sMatches.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: PURPLE, letterSpacing: 1, marginBottom: 4 }}>SCENARIOS ({row.sMatches.length})</div>
                      {row.sMatches.map((m, j) => {
                        const pct = relevancePct(m.hits, row.sMatches[0].hits);
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${PURPLE}08`, borderRadius: 4, border: `1px solid ${PURPLE}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: PURPLE, background: `${PURPLE}22`, border: `1px solid ${PURPLE}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>
                                {(m.item.type || "PLAYBOOK").toUpperCase()}
                              </span>
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.name || m.item.title || "(scenario)"}</span>
                            </div>
                            <div style={{ marginTop: 3, height: 3, background: `${PURPLE}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: PURPLE, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* dataset matches */}
                  {row.dMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: TEAL, letterSpacing: 1, marginBottom: 4 }}>DATASETS ({row.dMatches.length})</div>
                      {row.dMatches.map((m, j) => {
                        const pct = relevancePct(m.hits, row.dMatches[0].hits);
                        return (
                          <div key={j} style={{ marginBottom: 4, padding: "4px 8px", background: `${TEAL}08`, borderRadius: 4, border: `1px solid ${TEAL}22` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 8, color: TEAL, background: `${TEAL}22`, border: `1px solid ${TEAL}55`, borderRadius: 3, padding: "0 4px", letterSpacing: 1 }}>
                                {(m.item.type || "DATASET").toUpperCase()}
                              </span>
                              <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1 }}>{m.item.name || m.item.title || "(dataset)"}</span>
                            </div>
                            {m.item.description && (
                              <div style={{ fontSize: 9, color: MUTED, paddingLeft: 2, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {m.item.description.slice(0, 80)}
                              </div>
                            )}
                            <div style={{ marginTop: 3, height: 3, background: `${TEAL}22`, borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: TEAL, borderRadius: 2, transition: "width 0.4s" }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {row.sMatches.length === 0 && row.dMatches.length === 0 && (
                    <div style={{ fontSize: 10, color: AMBER, paddingLeft: 4 }}>No execution backing found — job is UNSUPPORTED.</div>
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
          {assessing ? "ASSESSING…" : "▶ ASSESS EXECUTION"}
        </button>
        {brief && (
          <div style={{ flex: 1, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      <style>{`
        @keyframes swedatPulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.6); opacity: .4; }
        }
      `}</style>
    </div>
  );
}
