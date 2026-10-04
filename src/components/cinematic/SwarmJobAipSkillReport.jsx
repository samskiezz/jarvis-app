/**
 * F168 — SwarmJob × AIP Skill × Report — Swarm Intelligence Execution Audit (SIERA)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/aip/skill + /v1/reports, then
 * keyword-correlates each swarm job against the AIP skill catalog AND the
 * report archive to surface:
 *   FULLY_DOCUMENTED — skill exists + report exists  (execution + evidence)
 *   SKILLED_ONLY     — skill exists, no report        (capability, no evidence trail)
 *   REPORTED_ONLY    — no skill, report exists        (output documented, no automation)
 *   UNDOCUMENTED     — no skill, no report            (automation gap — dark ops)
 *
 * Stat tiles: jobs / skills / reports / fully documented / undocumented
 * Filter tabs: ALL | FULLY_DOCUMENTED | SKILLED_ONLY | REPORTED_ONLY | UNDOCUMENTED
 * Expand any job → matched skills (cyan bar) + matched reports (amber bar) with scores.
 * Red badge + pulse on UNDOCUMENTED count.
 * ▶ ASSESS: feeds a 2-sentence swarm execution audit brief to
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SIERA  at bottom:8 left:933260, zIndex:629.
 * Event:   jarvis:siera-toggle
 * Voice:   "siera / swarm skill report / swarm execution audit /
 *           undocumented swarm / dark ops swarm / swarm intelligence audit /
 *           swarm coverage / swarm documentation / swarm report skill"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 933_260;
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

const SIERA_RE =
  /\b(siera|swarm\s+skill\s+report|swarm\s+execution\s+audit|undocumented\s+swarm|dark\s+ops?\s+swarm|swarm\s+intelligence\s+audit|swarm\s+coverage|swarm\s+documentation|swarm\s+report\s+skill|swarm\s+aip|swarm\s+skill\s+coverage|swarm\s+fully\s+documented)\b/i;

export function isSieraQuery(q) { return SIERA_RE.test(q || ""); }

export async function buildSieraScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [jobRes, skillRes, rptRes] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
      fetch(`${base}/v1/reports`,         { headers: hdr }),
    ]);
    const jobs   = normaliseJobs(await jobRes.json());
    const skills = normaliseSkills(await skillRes.json());
    const rpts   = normaliseReports(await rptRes.json());

    const rows = classify(jobs, skills, rpts);
    const undocumented     = rows.filter((r) => r.cls === "UNDOCUMENTED").length;
    const fullyDocumented  = rows.filter((r) => r.cls === "FULLY_DOCUMENTED").length;
    const skilledOnly      = rows.filter((r) => r.cls === "SKILLED_ONLY").length;
    const reportedOnly     = rows.filter((r) => r.cls === "REPORTED_ONLY").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS swarm intelligence execution audit (SIERA): ${jobs.length} swarm jobs analysed against ` +
          `${skills.length} AIP skills and ${rpts.length} intelligence reports — ` +
          `${fullyDocumented} fully documented (skill + report), ${skilledOnly} skill-only (no report trail), ` +
          `${reportedOnly} reported-only (no automation), ${undocumented} undocumented (dark ops — no skill or report). ` +
          `Give a 2-sentence swarm execution audit brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Swarm execution audit complete, sir.").trim();
  } catch {
    return "Swarm execution audit unavailable at this time, sir.";
  }
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normaliseJobs(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.results) ? raw.results : [];
  return arr.map((j, i) => ({
    id:     j.id || j.job_id || j._id || String(i),
    title:  j.title || j.name || j.label || j.description || `Job ${i + 1}`,
    type:   j.type || j.job_type || j.category || "",
    status: j.status || j.state || "",
    tags:   Array.isArray(j.tags) ? j.tags : [],
    extra:  j,
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.skills) ? raw.skills : Array.isArray(raw?.results) ? raw.results : [];
  return arr.map((s, i) => ({
    id:    s.id || s.skill_id || s._id || String(i),
    title: s.title || s.name || s.label || s.skill_name || `Skill ${i + 1}`,
    type:  s.type || s.category || s.skill_type || "",
    tags:  Array.isArray(s.tags) ? s.tags : [],
    extra: s,
  }));
}

function normaliseReports(raw) {
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.items) ? raw.items : Array.isArray(raw?.reports) ? raw.reports : Array.isArray(raw?.results) ? raw.results : [];
  return arr.map((r, i) => ({
    id:    r.id || r.report_id || r._id || String(i),
    title: r.title || r.name || r.label || r.subject || `Report ${i + 1}`,
    type:  r.type || r.category || r.report_type || "",
    date:  r.date || r.created_at || r.published_at || "",
    tags:  Array.isArray(r.tags) ? r.tags : [],
    extra: r,
  }));
}

// ── Keyword scoring ───────────────────────────────────────────────────────────

function kw(obj) {
  return (JSON.stringify(obj || "").toLowerCase().match(/[a-z]{4,}/g) || []);
}

function score(aKw, bKw) {
  const setB = new Set(bKw);
  return aKw.filter((w) => w.length > 3 && setB.has(w)).length;
}

// ── Classify ──────────────────────────────────────────────────────────────────

function classify(jobs, skills, reports) {
  return jobs.map((job) => {
    const jKw = kw(job.extra);
    const skillMatches = skills
      .map((s) => ({ ...s, sc: score(jKw, kw(s.extra)) }))
      .filter((s) => s.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    const reportMatches = reports
      .map((r) => ({ ...r, sc: score(jKw, kw(r.extra)) }))
      .filter((r) => r.sc > 0)
      .sort((a, b) => b.sc - a.sc);

    const hasSkill  = skillMatches.length > 0;
    const hasReport = reportMatches.length > 0;
    const cls = hasSkill && hasReport ? "FULLY_DOCUMENTED"
              : hasSkill              ? "SKILLED_ONLY"
              : hasReport             ? "REPORTED_ONLY"
              :                        "UNDOCUMENTED";

    return { job, skillMatches, reportMatches, cls };
  });
}

// ── Colours ───────────────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_DOCUMENTED: "#00e5ff",
  SKILLED_ONLY:     "#69ff47",
  REPORTED_ONLY:    "#ffd600",
  UNDOCUMENTED:     "#ff1744",
};

const TABS = ["ALL", "FULLY_DOCUMENTED", "SKILLED_ONLY", "REPORTED_ONLY", "UNDOCUMENTED"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function SwarmJobAipSkillReport() {
  const [open,     setOpen]     = useState(false);
  const [rows,     setRows]     = useState([]);
  const [stats,    setStats]    = useState({ jobs: 0, skills: 0, reports: 0 });
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [jR, sR, rR] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`,  { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,       { headers: hdr }),
        fetch(`${base}/v1/reports`,         { headers: hdr }),
      ]);
      const jobs   = normaliseJobs(await jR.json());
      const skills = normaliseSkills(await sR.json());
      const rpts   = normaliseReports(await rR.json());
      setRows(classify(jobs, skills, rpts));
      setStats({ jobs: jobs.length, skills: skills.length, reports: rpts.length });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:siera-toggle", handler);
    return () => window.removeEventListener("jarvis:siera-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const filtered = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.job.title.toLowerCase().includes(q) ||
      r.job.type.toLowerCase().includes(q)  ||
      r.cls.toLowerCase().includes(q)
    );
  });

  const undocCount = rows.filter((r) => r.cls === "UNDOCUMENTED").length;

  const assess = async () => {
    setAssessing(true);
    try {
      const text = await buildSieraScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } finally {
      setAssessing(false);
    }
  };

  // ── Stat tiles ─────────────────────────────────────────────────────────────

  const tile = (label, val, color) => (
    <div style={{ background: "rgba(0,0,0,.55)", border: `1px solid ${color}30`, borderRadius: 6, padding: "6px 14px", textAlign: "center", minWidth: 78 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
      <div style={{ fontSize: 9, color: "#aaa", letterSpacing: 1 }}>{label}</div>
    </div>
  );

  const fdCount  = rows.filter((r) => r.cls === "FULLY_DOCUMENTED").length;
  const soCount  = rows.filter((r) => r.cls === "SKILLED_ONLY").length;
  const roCount  = rows.filter((r) => r.cls === "REPORTED_ONLY").length;

  // ── Panel ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm Intelligence Execution Audit (SIERA)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 629,
          background: open ? "#ff174420" : "#00000080",
          border: `1px solid ${open ? "#ff1744" : "#ffffff30"}`,
          borderRadius: 4, color: open ? "#ff1744" : "#ffffff80",
          fontSize: 9, padding: "3px 7px", cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ SIERA
        {undocCount > 0 && (
          <span style={{
            marginLeft: 5, background: "#ff1744", color: "#fff",
            borderRadius: 8, padding: "0 5px", fontSize: 8,
            animation: "pulse 1.4s infinite",
          }}>
            {undocCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 340), zIndex: 630,
          width: 680, maxHeight: "72vh",
          background: "linear-gradient(135deg,#0a0c0f 0%,#0e1218 100%)",
          border: "1px solid #ff174440", borderRadius: 10,
          boxShadow: "0 0 32px #ff174420", display: "flex", flexDirection: "column",
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #ff174420", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#ff1744", fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>◈ SIERA</span>
            <span style={{ color: "#aaa", fontSize: 9, flex: 1 }}>Swarm Intelligence Execution Audit</span>
            {loading && <span style={{ color: "#ffd600", fontSize: 9 }}>LOADING…</span>}
            <button onClick={assess} disabled={assessing} style={{ background: "none", border: "1px solid #00e5ff60", borderRadius: 4, color: "#00e5ff", fontSize: 9, padding: "2px 8px", cursor: "pointer" }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", padding: 0 }}>✕</button>
          </div>

          {err && <div style={{ padding: "6px 14px", color: "#ff1744", fontSize: 9 }}>{err}</div>}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
            {tile("JOBS",             stats.jobs,   "#00e5ff")}
            {tile("SKILLS",           stats.skills, "#69ff47")}
            {tile("REPORTS",          stats.reports,"#ffd600")}
            {tile("FULLY DOC",        fdCount,      "#00e5ff")}
            {tile("SKILLED ONLY",     soCount,      "#69ff47")}
            {tile("REPORTED ONLY",    roCount,      "#ffd600")}
            {tile("UNDOCUMENTED",     undocCount,   "#ff1744")}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CLS_COLOR[t] || "#00e5ff"}25` : "none",
                border: `1px solid ${tab === t ? (CLS_COLOR[t] || "#00e5ff") : "#333"}`,
                borderRadius: 4, color: tab === t ? (CLS_COLOR[t] || "#00e5ff") : "#888",
                fontSize: 8, padding: "2px 8px", cursor: "pointer", letterSpacing: 1,
              }}>
                {t.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search jobs…"
              style={{ marginLeft: "auto", background: "#0a0c0f", border: "1px solid #333", borderRadius: 4, color: "#ccc", fontSize: 9, padding: "2px 8px", width: 120 }}
            />
          </div>

          {/* Job rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 14px" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#555", fontSize: 10, textAlign: "center", padding: 20 }}>No results.</div>
            )}
            {filtered.map(({ job, skillMatches, reportMatches, cls }) => {
              const isExp = expanded === job.id;
              const color = CLS_COLOR[cls];
              return (
                <div key={job.id} style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : job.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 9, color, minWidth: 130, letterSpacing: 1 }}>{cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#ccc", fontSize: 10 }}>{job.title}</span>
                    {job.type && <span style={{ fontSize: 8, color: "#666", border: "1px solid #333", borderRadius: 3, padding: "1px 5px" }}>{job.type}</span>}
                    <span style={{ fontSize: 9, color: "#444" }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "6px 0 12px 8px", display: "flex", gap: 12 }}>
                      {/* Skills */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#69ff47", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>AIP SKILLS ({skillMatches.length})</div>
                        {skillMatches.length === 0 && <div style={{ color: "#444", fontSize: 9 }}>No skill match</div>}
                        {skillMatches.slice(0, 5).map((s) => (
                          <div key={s.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "#aaa", fontSize: 9 }}>{s.title}</span>
                              <span style={{ color: "#69ff47", fontSize: 8 }}>{s.sc}</span>
                            </div>
                            <div style={{ height: 2, background: "#1a1a1a", borderRadius: 1, marginTop: 2 }}>
                              <div style={{ width: `${Math.min(100, s.sc * 10)}%`, height: "100%", background: "#69ff47", borderRadius: 1 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Reports */}
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ffd600", fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>REPORTS ({reportMatches.length})</div>
                        {reportMatches.length === 0 && <div style={{ color: "#444", fontSize: 9 }}>No report match</div>}
                        {reportMatches.slice(0, 5).map((r) => (
                          <div key={r.id} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ color: "#aaa", fontSize: 9 }}>{r.title}</span>
                              <span style={{ color: "#ffd600", fontSize: 8 }}>{r.sc}</span>
                            </div>
                            {r.date && <div style={{ color: "#555", fontSize: 8 }}>{String(r.date).slice(0, 10)}</div>}
                            <div style={{ height: 2, background: "#1a1a1a", borderRadius: 1, marginTop: 2 }}>
                              <div style={{ width: `${Math.min(100, r.sc * 10)}%`, height: "100%", background: "#ffd600", borderRadius: 1 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
