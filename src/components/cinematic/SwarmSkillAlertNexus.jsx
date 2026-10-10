/**
 * F275 — SwarmJob × AIP Skill × Ops Alert Automation Coverage Nexus (SAANEX)
 *
 * Parallel-fetches /entities/SwarmJob, /v1/aip/skill, /v1/ops/alerts;
 * keyword-correlates each swarm job against AIP automation skills AND
 * operational alerts to classify:
 *   FULLY_AUTOMATED — matched by ≥1 AIP skill AND ≥1 ops alert
 *   SKILL_DRIVEN    — matched by AIP skill only (no alert)
 *   ALERT_RESPONSIVE— matched by ops alert only (no skill)
 *   MANUAL          — no match (automation coverage gap)
 *
 * Stat tiles: SWARM JOBS / AIP SKILLS / OPS ALERTS / AUTOMATION%
 * Filter tabs: ALL | FULLY_AUTOMATED | SKILL_DRIVEN | ALERT_RESPONSIVE | MANUAL
 * Expand any job → matched AIP skill cards (cyan) + ops alert cards (orange)
 * ▶ ASSESS AUTOMATION COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ SAANEX  left:1110160, bottom:8, zIndex:698
 * Voice:   "saanex / swarm automation / swarm skill / swarm alert /
 *           manual swarm / automation coverage nexus / aip swarm / swarm coverage"
 * Event:   jarvis:saanex-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT  = 1110160;
const POLL_MS   = 90_000;
const API_KEY   = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const SAANEX_RE =
  /\b(saanex|swarm\s+automation|swarm\s+skill(?:\s+alert)?|swarm\s+alert|manual\s+swarm|automation\s+coverage\s+nexus|aip\s+swarm|swarm\s+coverage\s+nexus|swarm\s+aip\s+skill|swarm\s+ops\s+alert)\b/i;

export function isSaanexQuery(q) { return SAANEX_RE.test(q); }

export async function buildSaanexScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [swarmRes, skillRes, alertRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,     { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,          { headers: hdr }),
      fetch(`${base}/v1/ops/alerts`,         { headers: hdr }),
    ]);
    const swarmRaw = await swarmRes.json();
    const skillRaw = await skillRes.json();
    const alertRaw = await alertRes.json();

    const jobs   = normaliseJobs(swarmRaw);
    const skills = normaliseSkills(skillRaw);
    const alerts = normaliseAlerts(alertRaw);
    const corr   = buildCorrelated(jobs, skills, alerts);

    const full  = corr.filter(j => j.cls === "FULLY_AUTOMATED").length;
    const skill = corr.filter(j => j.cls === "SKILL_DRIVEN").length;
    const alrt  = corr.filter(j => j.cls === "ALERT_RESPONSIVE").length;
    const man   = corr.filter(j => j.cls === "MANUAL").length;
    const pct   = jobs.length ? Math.round((full / jobs.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm automation coverage nexus (SAANEX): ${jobs.length} swarm jobs cross-referenced ` +
          `against ${skills.length} AIP automation skills and ${alerts.length} operational alerts. ` +
          `Classification — FULLY_AUTOMATED: ${full}, SKILL_DRIVEN: ${skill}, ` +
          `ALERT_RESPONSIVE: ${alrt}, MANUAL (gap): ${man}. Automation coverage: ${pct}%. ` +
          `Give a 2-sentence automation coverage brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "SAANEX online, sir. Assessing swarm job automation coverage across AIP skills and operational alerts.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : [];
  return arr.map(j => ({
    id:   j.id || j._id || String(Math.random()),
    name: j.name || j.title || j.job_type || "Unnamed Job",
    type: j.type || j.job_type || "",
    status: j.status || "",
    desc: `${j.name || ""} ${j.description || ""} ${j.type || ""} ${j.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.skills) ? raw.skills
    : [];
  return arr.map(s => ({
    id:       s.id || s._id || String(Math.random()),
    name:     s.name || s.skill_name || s.title || "Unnamed Skill",
    category: s.category || s.type || "",
    enabled:  s.enabled !== false,
    desc: `${s.name || ""} ${s.description || ""} ${s.category || ""} ${s.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseAlerts(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.alerts) ? raw.alerts
    : [];
  return arr.map(a => ({
    id:       a.id || a._id || String(Math.random()),
    name:     a.name || a.title || a.message || "Unnamed Alert",
    severity: a.severity || a.level || "INFO",
    type:     a.type || a.alert_type || "",
    desc: `${a.name || ""} ${a.title || ""} ${a.message || ""} ${a.type || ""} ${a.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(jobs, skills, alerts) {
  return jobs.map(job => {
    const tokens = tokenize(job.desc);
    const mSkills = skills
      .map(s => ({ ...s, rel: relevance(tokens, s.desc) }))
      .filter(s => s.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mAlerts = alerts
      .map(a => ({ ...a, rel: relevance(tokens, a.desc) }))
      .filter(a => a.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasSkill = mSkills.length > 0;
    const hasAlert = mAlerts.length > 0;
    let cls;
    if (hasSkill && hasAlert) cls = "FULLY_AUTOMATED";
    else if (hasSkill)        cls = "SKILL_DRIVEN";
    else if (hasAlert)        cls = "ALERT_RESPONSIVE";
    else                      cls = "MANUAL";
    return { ...job, cls, mSkills, mAlerts };
  });
}

// ── severity colour ───────────────────────────────────────────────────────────
function sevColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "critical") return "#ef4444";
  if (sl === "high")     return "#f97316";
  if (sl === "medium")   return "#eab308";
  return "#6b7280";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function SwarmSkillAlertNexus() {
  const [open,     setOpen]     = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [jobs,     setJobs]     = useState([]);
  const [skills,   setSkills]   = useState([]);
  const [alerts,   setAlerts]   = useState([]);
  const [corr,     setCorr]     = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [assess,   setAssess]   = useState("");
  const [assessing,setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [swarmRes, skillRes, alertRes] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
        fetch(`${base}/v1/ops/alerts`,      { headers: hdr }),
      ]);
      const swarmRaw = await swarmRes.json();
      const skillRaw = await skillRes.json();
      const alertRaw = await alertRes.json();
      const j = normaliseJobs(swarmRaw);
      const s = normaliseSkills(skillRaw);
      const a = normaliseAlerts(alertRaw);
      setJobs(j); setSkills(s); setAlerts(a);
      setCorr(buildCorrelated(j, s, a));
    } catch { /* keep previous data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:saanex-toggle", handler);
    return () => window.removeEventListener("jarvis:saanex-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildSaanexScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const full  = corr.filter(j => j.cls === "FULLY_AUTOMATED").length;
  const skil  = corr.filter(j => j.cls === "SKILL_DRIVEN").length;
  const alrt  = corr.filter(j => j.cls === "ALERT_RESPONSIVE").length;
  const man   = corr.filter(j => j.cls === "MANUAL").length;
  const pct   = jobs.length ? Math.round((full / jobs.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_AUTOMATED", "SKILL_DRIVEN", "ALERT_RESPONSIVE", "MANUAL"];

  const visible = corr.filter(j => {
    const matchTab = tab === "ALL" || j.cls === tab;
    const matchSearch = !search || j.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_AUTOMATED:  "#22d3ee",
    SKILL_DRIVEN:     "#a78bfa",
    ALERT_RESPONSIVE: "#f97316",
    MANUAL:           "#ef4444",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 698,
          background: "rgba(0,0,0,0.7)", border: "1px solid #22d3ee",
          color: "#22d3ee", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SAANEX {man > 0 && <span style={{ color: "#f97316", marginLeft: 4 }}>● {man}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 680, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #22d3ee",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
          ◈ SAANEX — Swarm Automation Coverage Nexus
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "SWARM JOBS",  val: jobs.length,   col: "#22d3ee" },
          { label: "AIP SKILLS",  val: skills.length, col: "#a78bfa" },
          { label: "OPS ALERTS",  val: alerts.length, col: "#f97316" },
          { label: "AUTO%",       val: `${pct}%`,     col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 20, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* class stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "0 14px 6px" }}>
        {[
          { label: "FULLY AUTO",   val: full, col: "#22d3ee" },
          { label: "SKILL DRIVEN", val: skil, col: "#a78bfa" },
          { label: "ALERT RESP.",  val: alrt, col: "#f97316" },
          { label: "MANUAL",       val: man,  col: "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ margin: "0 14px 8px", background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444", transition: "width 0.5s" }} />
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#22d3ee" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search jobs…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontSize: 11, width: 160,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No jobs match.</div>
        )}
        {visible.map(job => (
          <div key={job.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === job.id ? null : job.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${job.cls === "MANUAL" ? "rgba(239,68,68,0.3)" : "transparent"}`,
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{job.name}</span>
                {job.type && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{job.type}</span>}
                {job.status && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>· {job.status}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(job.cls)}22`, color: clsColor(job.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {job.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 12 }}>{expanded === job.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === job.id && (
              <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", marginTop: -2 }}>
                {job.mSkills.length > 0 && (
                  <>
                    <div style={{ color: "#a78bfa", fontSize: 10, marginBottom: 4, fontWeight: 700 }}>AIP SKILLS ({job.mSkills.length})</div>
                    {job.mSkills.map(s => (
                      <div key={s.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#c4b5fd", fontSize: 11 }}>{s.name}</span>
                          <span style={{ color: "#64748b", fontSize: 10 }}>{s.category || "skill"} · {s.rel}%</span>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ width: `${s.rel}%`, height: "100%", background: "#a78bfa" }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {job.mAlerts.length > 0 && (
                  <>
                    <div style={{ color: "#f97316", fontSize: 10, margin: "8px 0 4px", fontWeight: 700 }}>OPS ALERTS ({job.mAlerts.length})</div>
                    {job.mAlerts.map(a => (
                      <div key={a.id} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: "#fdba74", fontSize: 11 }}>{a.name}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: `${sevColor(a.severity)}22`, color: sevColor(a.severity), borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{a.severity}</span>
                            <span style={{ color: "#64748b", fontSize: 10 }}>{a.rel}%</span>
                          </span>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 3, height: 4, overflow: "hidden" }}>
                          <div style={{ width: `${a.rel}%`, height: "100%", background: sevColor(a.severity) }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
                {job.mSkills.length === 0 && job.mAlerts.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>⚠ No AIP skill or ops alert coverage — manual gap.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 14px 12px", borderTop: "1px solid #1e3a5f" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: "#22d3ee", color: "#000", border: "none", borderRadius: 6,
            padding: "6px 18px", fontSize: 12, fontWeight: 700, cursor: assessing ? "not-allowed" : "pointer", opacity: assessing ? 0.7 : 1,
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS AUTOMATION COVERAGE"}
        </button>
        {assess && (
          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 11, lineHeight: 1.5 }}>{assess}</div>
        )}
      </div>
    </div>
  );
}
