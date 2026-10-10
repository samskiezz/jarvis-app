/**
 * TaskSwarmInvestmentResourceNexus — F239.
 *
 * Parallel-fetches /entities/Task × /entities/SwarmJob × /entities/Investment
 * and keyword-correlates each task's name/description/tags against swarm job
 * labels/descriptions AND investment names/descriptions/tags to classify:
 *
 *   FULLY_RESOURCED — task has ≥1 matching swarm job AND ≥1 matching investment
 *   SWARM_ONLY      — task has matching swarm job but no investment
 *   FUNDED_ONLY     — task has matching investment but no swarm job
 *   UNFUNDED        — no matching swarm job or investment (resource gap)
 *
 * Stat tiles: TASKS / SWARM JOBS / INVESTMENTS / UNFUNDED
 * Amber badge: UNFUNDED count on toggle button.
 * Filter tabs: ALL | FULLY_RESOURCED | SWARM_ONLY | FUNDED_ONLY | UNFUNDED + text search.
 * Expand task → matched swarm job cards (cyan) + investment cards (green) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence resource priority brief + TTS.
 *
 * Toggle:  ◈ TRPIN at left:1090560, bottom:8, zIndex:663.
 * Event:   jarvis:trpin-toggle
 * Voice:   "trpin" / "resource priority" / "funded tasks" / "unfunded tasks" /
 *          "task resource nexus" / "task resourcing" / "task investment" /
 *          "swarm task resource" / "resource gap"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const AM  = "#FFB300";
const GR  = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1090560;
const Z_IDX      = 663;

const TRPIN_RE =
  /\b(trpin|resource[._\-\s]priority|funded[._\-\s]tasks?|unfunded[._\-\s]tasks?|task[._\-\s]resource[._\-\s]nexus|task[._\-\s]resourcing|task[._\-\s]investment|swarm[._\-\s]task[._\-\s]resource|resource[._\-\s]gap)\b/i;

export function isTrpinQuery(t) {
  return TRPIN_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normTasks(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.tasks || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((t, i) => ({
    id:       t.id || String(i),
    name:     t.name || t.title || t.task || `Task ${i + 1}`,
    desc:     t.description || t.summary || t.detail || "",
    status:   t.status || t.state || "",
    priority: t.priority || t.urgency || "",
    tags:     Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
  }));
}

function normSwarmJobs(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.jobs || raw.swarm_jobs || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((j, i) => ({
    id:     j.id || String(i),
    name:   j.name || j.title || j.label || j.job || `SwarmJob ${i + 1}`,
    desc:   j.description || j.summary || j.detail || "",
    status: j.status || j.state || "",
    type:   j.type || j.kind || "",
  }));
}

function normInvestments(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.investments || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((inv, i) => ({
    id:     inv.id || String(i),
    name:   inv.name || inv.title || inv.asset || `Investment ${i + 1}`,
    desc:   inv.description || inv.summary || inv.notes || "",
    type:   inv.type || inv.category || inv.asset_class || "",
    tags:   Array.isArray(inv.tags) ? inv.tags.join(" ") : (inv.tags || ""),
    amount: inv.amount || inv.value || inv.current_value || 0,
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(task, other) {
  const tWords = new Set(tokens(`${task.name} ${task.desc} ${task.tags}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""}`);
  const hits = oWords.filter(w => tWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(tasks, swarmJobs, investments) {
  return tasks.map(t => {
    const matchedSwarm = swarmJobs
      .map(j => ({ ...j, score: relevanceScore(t, j) }))
      .filter(j => j.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedInv = investments
      .map(inv => ({ ...inv, score: relevanceScore(t, inv) }))
      .filter(inv => inv.score > 0)
      .sort((a, b) => b.score - a.score);

    let resourceStatus;
    if (matchedSwarm.length > 0 && matchedInv.length > 0) {
      resourceStatus = "FULLY_RESOURCED";
    } else if (matchedSwarm.length > 0) {
      resourceStatus = "SWARM_ONLY";
    } else if (matchedInv.length > 0) {
      resourceStatus = "FUNDED_ONLY";
    } else {
      resourceStatus = "UNFUNDED";
    }

    return { ...t, resourceStatus, matchedSwarm, matchedInv };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildTrpinScript() {
  const base = apiBase();
  const [tRaw, jRaw, iRaw] = await Promise.all([
    fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/SwarmJob`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const tasks      = normTasks(tRaw);
  const swarmJobs  = normSwarmJobs(jRaw);
  const investments = normInvestments(iRaw);
  const rows       = classify(tasks, swarmJobs, investments);
  const unfunded   = rows.filter(r => r.resourceStatus === "UNFUNDED").length;
  const fullyRes   = rows.filter(r => r.resourceStatus === "FULLY_RESOURCED").length;
  return `Task Resource Priority Nexus active, sir. Of ${tasks.length} tasks cross-referenced against ${swarmJobs.length} swarm jobs and ${investments.length} investments, ${fullyRes} are fully resourced — but ${unfunded} tasks remain unfunded with no operational or financial backing. Immediate resourcing review is recommended.`;
}

// ── status colour ─────────────────────────────────────────────────────────────

function statusColour(s) {
  if (s === "FULLY_RESOURCED") return GR;
  if (s === "SWARM_ONLY")      return CY;
  if (s === "FUNDED_ONLY")     return "#9C27B0";
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function TaskSwarmInvestmentResourceNexus() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [taskCount,  setTaskCount]  = useState(0);
  const [swarmCount, setSwarmCount] = useState(0);
  const [invCount,   setInvCount]   = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [tRaw, jRaw, iRaw] = await Promise.all([
        fetch(`${base}/entities/Task`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/SwarmJob`,   { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const t   = normTasks(tRaw);
      const j   = normSwarmJobs(jRaw);
      const inv = normInvestments(iRaw);
      setTaskCount(t.length);
      setSwarmCount(j.length);
      setInvCount(inv.length);
      setRows(classify(t, j, inv));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:trpin-toggle", toggle);
    return () => window.removeEventListener("jarvis:trpin-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const unfunded = rows.filter(r => r.resourceStatus === "UNFUNDED").length;

  const FILTERS = ["ALL", "FULLY_RESOURCED", "SWARM_ONLY", "FUNDED_ONLY", "UNFUNDED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.resourceStatus === filter)
    .filter(r => !search || `${r.name} ${r.desc}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildTrpinScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      }).then(async r => {
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          new Audio(url).play();
        }
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: unfunded > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${unfunded > 0 ? AM : CY}44`,
    color: unfunded > 0 ? AM : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 580, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ TRPIN
        {unfunded > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
            animation: "pulse 1.4s infinite",
          }}>{unfunded}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, letterSpacing: 2, fontSize: 10 }}>
              ◈ TASK × SWARM × INVESTMENT RESOURCE NEXUS
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              ["TASKS",      taskCount,  CY],
              ["SWARM JOBS", swarmCount, "#9C27B0"],
              ["INVESTMENTS", invCount,  GR],
              ["UNFUNDED",   unfunded,   AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${col}22`, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {FILTERS.map(t => (
              <button key={t} onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${statusColour(t === "ALL" ? "FULLY_RESOURCED" : t)}22` : "transparent",
                  border: `1px solid ${filter === t ? statusColour(t === "ALL" ? "FULLY_RESOURCED" : t) : "rgba(255,255,255,0.12)"}`,
                  color: filter === t ? statusColour(t === "ALL" ? "FULLY_RESOURCED" : t) : "rgba(255,255,255,0.5)",
                  fontFamily: MN, fontSize: 8, padding: "3px 7px", borderRadius: 3, cursor: "pointer",
                  letterSpacing: 1,
                }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 120,
              }}
            />
          </div>

          {/* rows */}
          {loading && <div style={{ color: CY, fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>◌ LOADING…</div>}
          {err && <div style={{ color: RD, fontSize: 9, padding: "8px 0" }}>⚠ {err}</div>}
          {!loading && visible.map(row => {
            const hasDetail = row.matchedSwarm.length > 0 || row.matchedInv.length > 0;
            const col = statusColour(row.resourceStatus);
            return (
              <div key={row.id} style={{
                background: DIM, borderRadius: 4,
                border: `1px solid ${col}33`,
                marginBottom: 4, padding: "7px 10px",
                cursor: hasDetail ? "pointer" : "default",
              }} onClick={() => hasDetail && setExpanded(expanded === row.id ? null : row.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    color: col, fontSize: 7, letterSpacing: 1,
                    border: `1px solid ${col}44`, padding: "1px 4px", borderRadius: 2,
                    minWidth: 80, textAlign: "center",
                  }}>{row.resourceStatus.replace(/_/g, " ")}</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", flex: 1, fontSize: 10 }}>{row.name}</span>
                  {row.priority && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>{row.priority}</span>}
                  {hasDetail && (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                      {expanded === row.id ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* expanded matches */}
                {expanded === row.id && (
                  <div style={{ marginTop: 6, marginLeft: 88 }}>
                    {/* swarm job matches */}
                    {row.matchedSwarm.map(j => (
                      <div key={j.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(0,229,255,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${CY}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: CY, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${CY}44`, padding: "1px 4px", borderRadius: 2,
                          }}>SWARM</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{j.name}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(j.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${CY}88 ${Math.round(j.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                    {/* investment matches */}
                    {row.matchedInv.map(inv => (
                      <div key={inv.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(76,175,80,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${GR}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: GR, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${GR}44`, padding: "1px 4px", borderRadius: 2,
                          }}>FUNDED</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{inv.name}</span>
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(inv.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${GR}88 ${Math.round(inv.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: `${AM}18`,
              border: `1px solid ${AM}44`, color: AM, fontFamily: MN, fontSize: 9,
              letterSpacing: 1.5, padding: "6px 0", borderRadius: 3, cursor: "pointer",
            }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS RESOURCE PRIORITIES"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
