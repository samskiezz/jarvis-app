/**
 * F190 — AIP Skill × Report × Task — Capability Documentation Coverage (CDOC)
 *
 * Parallel-fetches /v1/aip/skill + /v1/reports + /entities/Task every 90 s.
 * Keyword-correlates each skill (by name/description) against the report archive
 * AND open tasks:
 *
 *   FULLY_COVERED  — matched ≥1 report AND ≥1 task
 *   DOCUMENTED     — report coverage found, no task linkage
 *   TASKED         — task linkage found, no report documentation
 *   LATENT         — neither report nor task linkage (capability with no coverage)
 *
 * Stat tiles: skills / reports / tasks / fully covered / latent
 * Filter tabs: ALL | FULLY_COVERED | DOCUMENTED | TASKED | LATENT
 * Text search on skill name/type.
 * Expand row → matched reports (amber bars) + matched tasks (cyan bars).
 * Amber badge + pulse on LATENT count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ CDOC  at bottom:8 left:982840, zIndex:691.
 * Event:   jarvis:cdoc-toggle
 * Voice:   "cdoc / capability documentation / skill report task / latent skill /
 *           undocumented skill / skill coverage / skill documentation / capability coverage"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 982_840;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const GREEN    = "#00FF88";
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

const CDOC_RE =
  /\b(cdoc|capability\s+documentation|skill\s+report\s+task|latent\s+skill|undocumented\s+skill|skill\s+coverage|skill\s+documentation|capability\s+coverage)\b/i;

export function isCdocQuery(q) {
  return CDOC_RE.test(q || "");
}

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (v.skills) return v.skills;
  if (v.items) return v.items;
  if (v.data) return Array.isArray(v.data) ? v.data : [];
  return [];
}

function keywords(obj) {
  if (!obj) return [];
  const raw = [
    obj.name, obj.title, obj.skill_name, obj.type,
    obj.description, obj.summary, obj.category, obj.id,
  ].filter(Boolean).join(" ").toLowerCase();
  return raw.split(/[\s,;|_/-]+/).filter(w => w.length > 2);
}

function matchKws(kws, obj) {
  if (!kws.length) return false;
  const haystack = [
    obj.name, obj.title, obj.skill_name, obj.type,
    obj.description, obj.summary, obj.report_name, obj.task_name,
    obj.status, obj.category,
  ].filter(Boolean).join(" ").toLowerCase();
  return kws.some(k => haystack.includes(k));
}

export async function buildCdocScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [skr, rpr, taskr] = await Promise.allSettled([
      fetch(`${base}/v1/aip/skill`,    { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/reports`,      { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Task`,   { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const skills  = toArr(skr.value);
    const reports = toArr(rpr.value);
    const tasks   = toArr(taskr.value);
    let latent = 0;

    for (const sk of skills) {
      const kws = keywords(sk);
      const hasReport = reports.some(r => matchKws(kws, r));
      const hasTask   = tasks.some(t => matchKws(kws, t));
      if (!hasReport && !hasTask) latent++;
    }

    return `CDOC analysis: ${skills.length} skills vs ${reports.length} reports × ${tasks.length} tasks. ` +
      `${latent} latent skill${latent !== 1 ? "s" : ""} have no documentation or task linkage. ` +
      `${skills.length - latent} skill${(skills.length - latent) !== 1 ? "s" : ""} have some coverage. ` +
      `Priority: document latent capabilities and assign tasks to drive adoption.`;
  } catch (e) {
    return `CDOC error: ${e.message}`;
  }
}

// ── Classification helpers ────────────────────────────────────────────────────

const CLASS_COLOR = {
  FULLY_COVERED: GREEN,
  DOCUMENTED:    AMBER,
  TASKED:        CY,
  LATENT:        "#FF8C42",
};

function classify(hasReport, hasTask) {
  if (hasReport && hasTask) return "FULLY_COVERED";
  if (hasReport)            return "DOCUMENTED";
  if (hasTask)              return "TASKED";
  return "LATENT";
}

function skillLabel(sk) {
  return sk.name || sk.skill_name || sk.title || sk.id || "skill";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SkillReportTaskCoverage() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState("ALL");
  const [query, setQuery]     = useState("");
  const [expanded, setExpand] = useState(null);
  const [assessing, setAss]   = useState(false);
  const timer                 = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const h    = { Authorization: `Bearer ${API_KEY}` };
      const [skr, rpr, taskr] = await Promise.allSettled([
        fetch(`${base}/v1/aip/skill`,  { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/reports`,    { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Task`, { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const skills  = toArr(skr.value);
      const reports = toArr(rpr.value);
      const tasks   = toArr(taskr.value);

      const built = skills.map(sk => {
        const kws      = keywords(sk);
        const matched_reports = reports.filter(r => matchKws(kws, r));
        const matched_tasks   = tasks.filter(t => matchKws(kws, t));
        return {
          ...sk,
          _class:   classify(matched_reports.length > 0, matched_tasks.length > 0),
          _reports: matched_reports,
          _tasks:   matched_tasks,
        };
      });
      setRows(built);
    } catch { /* silently hold last data */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:cdoc-toggle", handler);
    return () => window.removeEventListener("jarvis:cdoc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const counts = { FULLY_COVERED: 0, DOCUMENTED: 0, TASKED: 0, LATENT: 0 };
  rows.forEach(r => { if (counts[r._class] !== undefined) counts[r._class]++; });

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (query) {
      const q = query.toLowerCase();
      return [r.name, r.skill_name, r.title, r.type, r.category]
        .filter(Boolean).some(v => v.toLowerCase().includes(q));
    }
    return true;
  });

  const speak = (text) => {
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  };

  const assess = async () => {
    setAss(true);
    try {
      const script = await buildCdocScript();
      speak(script);
      const base = apiBase();
      const h    = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
      await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: h,
        body: JSON.stringify({ message: script }),
      });
    } catch { /* non-fatal */ }
    finally { setAss(false); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Capability Documentation Coverage (CDOC)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 691, background: "rgba(0,0,0,.7)",
          border: `1px solid ${counts.LATENT > 0 ? AMBER : "#333"}`,
          color: counts.LATENT > 0 ? AMBER : "#555",
          fontFamily: MONO, fontSize: 8, padding: "3px 7px",
          borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          boxShadow: counts.LATENT > 0 ? `0 0 8px ${AMBER}55` : "none",
        }}
      >
        ◈ CDOC{counts.LATENT > 0 ? ` [${counts.LATENT}]` : ""}
      </button>
    );
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(false)}
        title="Close CDOC"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 692, background: "rgba(0,0,0,.85)",
          border: `1px solid ${AMBER}`,
          color: AMBER, fontFamily: MONO, fontSize: 8,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ CDOC ▲
      </button>

      {/* Panel */}
      <div style={{
        position: "fixed", bottom: 26, left: BTN_LEFT - 600,
        width: 680, height: 420, zIndex: 692,
        background: "rgba(5,10,18,.97)", border: `1px solid ${AMBER}44`,
        borderRadius: 6, display: "flex", flexDirection: "column",
        fontFamily: MONO, boxShadow: `0 0 24px ${AMBER}22`,
      }}>
        {/* Header */}
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${AMBER}33`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        }}>
          <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
            CDOC
          </span>
          <span style={{ color: "#555", fontSize: 9 }}>
            Capability Documentation Coverage
          </span>
          {loading && <span style={{ color: "#444", fontSize: 8 }}>loading…</span>}
          <button
            onClick={assess} disabled={assessing}
            style={{
              marginLeft: "auto", background: "none",
              border: `1px solid ${AMBER}66`, color: AMBER,
              fontFamily: MONO, fontSize: 8, padding: "2px 8px",
              borderRadius: 3, cursor: assessing ? "default" : "pointer",
              opacity: assessing ? 0.5 : 1,
            }}
          >
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{
          display: "flex", gap: 6, padding: "6px 14px",
          borderBottom: `1px solid ${AMBER}22`, flexShrink: 0,
        }}>
          {[
            { label: "SKILLS",        val: rows.length,           clr: "#888" },
            { label: "FULLY COVERED", val: counts.FULLY_COVERED,  clr: GREEN  },
            { label: "DOCUMENTED",    val: counts.DOCUMENTED,     clr: AMBER  },
            { label: "TASKED",        val: counts.TASKED,         clr: CY     },
            {
              label: "LATENT",
              val: counts.LATENT,
              clr: counts.LATENT > 0 ? "#FF8C42" : "#444",
              pulse: counts.LATENT > 0,
            },
          ].map(t => (
            <div key={t.label} style={{
              flex: 1, background: "rgba(255,255,255,.03)",
              border: `1px solid ${t.clr}33`, borderRadius: 3,
              padding: "4px 6px", textAlign: "center",
              animation: t.pulse ? "cdoc-pulse 1.4s infinite" : "none",
            }}>
              <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
              <div style={{ color: "#444", fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 14px", borderBottom: `1px solid #111`, flexShrink: 0,
        }}>
          {["ALL", "FULLY_COVERED", "DOCUMENTED", "TASKED", "LATENT"].map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setExpand(null); }}
              style={{
                background: tab === t ? `${CLASS_COLOR[t] || AMBER}22` : "none",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] || AMBER) : "#333"}`,
                color: tab === t ? (CLASS_COLOR[t] || AMBER) : "#555",
                fontFamily: MONO, fontSize: 7, padding: "2px 6px",
                borderRadius: 2, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setExpand(null); }}
            placeholder="search skills…"
            style={{
              background: "none", border: "1px solid #333", color: "#ccc",
              fontFamily: MONO, fontSize: 9, padding: "2px 8px", borderRadius: 3,
              outline: "none", marginLeft: "auto", width: 140,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
          {visible.length === 0 && (
            <div style={{ color: "#555", fontSize: 10, textAlign: "center", padding: 20 }}>
              {loading ? "loading…" : "no skills"}
            </div>
          )}
          {visible.map((sk, i) => {
            const isExp = expanded === i;
            const clr   = CLASS_COLOR[sk._class];
            return (
              <div key={i}>
                <div
                  onClick={() => setExpand(isExp ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "5px 14px", cursor: "pointer",
                    borderLeft: `3px solid ${clr}`,
                    background: isExp ? "rgba(255,176,32,.04)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,.03)",
                  }}
                >
                  <span style={{ color: clr, fontSize: 8, minWidth: 100, letterSpacing: 1 }}>{sk._class}</span>
                  <span style={{ color: "#ccc", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {skillLabel(sk)}
                  </span>
                  <span style={{ color: "#555", fontSize: 8 }}>{sk.type || sk.category || ""}</span>
                  <span style={{ color: AMBER, fontSize: 9 }}>R:{sk._reports.length}</span>
                  <span style={{ color: CY,    fontSize: 9 }}>T:{sk._tasks.length}</span>
                  <span style={{ color: "#444", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
                {isExp && (
                  <div style={{
                    padding: "8px 14px 12px 24px",
                    background: "rgba(255,176,32,.025)",
                    borderBottom: "1px solid rgba(255,255,255,.04)",
                    display: "flex", gap: 16,
                  }}>
                    {/* Reports */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: AMBER, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>REPORTS ({sk._reports.length})</div>
                      {sk._reports.length === 0
                        ? <div style={{ color: "#444", fontSize: 9 }}>— none matched</div>
                        : sk._reports.map((r, ri) => (
                            <div key={ri} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ height: 6, background: AMBER, borderRadius: 2, width: `${Math.min(100, 40 + ri * 12)}%`, maxWidth: 160 }} />
                              <span style={{ color: "#aaa", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name || r.title || r.report_name || r.id || "report"}
                              </span>
                            </div>
                          ))
                      }
                    </div>
                    {/* Tasks */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>TASKS ({sk._tasks.length})</div>
                      {sk._tasks.length === 0
                        ? <div style={{ color: "#444", fontSize: 9 }}>— none matched</div>
                        : sk._tasks.map((t, ti) => (
                            <div key={ti} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                              <div style={{ height: 6, background: CY, borderRadius: 2, width: `${Math.min(100, 40 + ti * 12)}%`, maxWidth: 160 }} />
                              <span style={{ color: "#aaa", fontSize: 9, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.name || t.title || t.task_name || t.id || "task"}
                              </span>
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

        {/* Footer */}
        <div style={{
          padding: "5px 14px", borderTop: `1px solid ${AMBER}22`,
          fontSize: 8, color: "#444", flexShrink: 0,
          display: "flex", justifyContent: "space-between",
        }}>
          <span>/v1/aip/skill × /v1/reports × /entities/Task</span>
          <span style={{ color: counts.LATENT > 0 ? "#FF8C42" : "#444" }}>
            {counts.LATENT > 0 ? `${counts.LATENT} LATENT SKILL${counts.LATENT > 1 ? "S" : ""} — NO COVERAGE` : "all skills covered"}
          </span>
        </div>
      </div>

      <style>{`
        @keyframes cdoc-pulse {
          0%, 100% { box-shadow: 0 0 4px ${AMBER}66; }
          50%       { box-shadow: 0 0 12px ${AMBER}cc; }
        }
      `}</style>
    </>
  );
}
