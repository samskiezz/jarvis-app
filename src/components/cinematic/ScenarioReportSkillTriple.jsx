/**
 * F729 — Scenario × Report × Skill Triple Coverage (SRSKLTRI)
 *
 * Parallel-fetches /v1/scenario/list + /v1/reports + /v1/aip/skill,
 * then keyword-correlates each scenario against reports AND skills:
 *
 *   FULLY_BACKED  — matched ≥1 report AND ≥1 skill  (documented + capable)
 *   REPORT_ONLY   — has research backing, no skill match
 *   SKILL_ONLY    — has capability, no report backing
 *   DARK          — no report, no skill (operational blind spot)
 *
 * Stat tiles: SCENARIOS | FULLY BACKED | REPORT ONLY | SKILL ONLY | DARK
 * Filter tabs: ALL | FULLY_BACKED | REPORT_ONLY | SKILL_ONLY | DARK + search
 * Expand scenario → matched reports (source badge) + matched skills (domain badge + score)
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence scenario readiness brief + TTS
 *
 * Button: ◈ SRSKLTRI  left:899520 bottom:8 zIndex:588
 * Event:  jarvis:srskltri-toggle
 * Refresh: 90 s auto-poll
 * Voice:  "srskltri / scenario report skill / scenario backing / backed scenario /
 *          dark scenario / scenario knowledge coverage / scenario capability /
 *          scenario readiness triple / fully backed scenario"
 */

import { useCallback, useEffect, useRef, useState } from "react";

const CY = "#29E7FF";
const AM = "#FFB347";
const GN = "#39FF14";
const RD = "#FF4444";
const PR = "#B47FFF";
const BTN_LEFT = 899520;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  return env.VITE_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.kind, obj.type,
    obj.source, obj.domain, obj.topic, obj.status, obj.category,
  ].filter(Boolean).join(" ").toLowerCase();
}

function score(aKw, bKw) {
  const words = aKw.split(/\s+/).filter((w) => w.length > 3);
  let hits = 0;
  for (const w of words) if (bKw.includes(w)) hits++;
  return hits;
}

function classify(scenario, reports, skills) {
  const skw = keywords(scenario);
  const matchedReports = reports
    .map((r) => ({ ...r, hits: score(skw, keywords(r)) }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const matchedSkills = skills
    .map((s) => ({ ...s, hits: score(skw, keywords(s)) }))
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
  const hasReports = matchedReports.length > 0;
  const hasSkills  = matchedSkills.length > 0;
  const status =
    hasReports && hasSkills ? "FULLY_BACKED" :
    hasReports              ? "REPORT_ONLY"  :
    hasSkills               ? "SKILL_ONLY"   :
                              "DARK";
  return { ...scenario, status, matchedReports, matchedSkills };
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [scnR, rptR, sklR] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers }),
    fetch(`${base}/v1/reports`,       { headers }),
    fetch(`${base}/v1/aip/skill`,     { headers }),
  ]);
  const scnData = await scnR.json().catch(() => ({}));
  const rptData = await rptR.json().catch(() => ({}));
  const sklData = await sklR.json().catch(() => ({}));
  const scenarios = (scnData.scenarios || scnData.items || scnData.data || []).slice(0, 200);
  const reports   = (rptData.reports   || rptData.items  || rptData.data  || []).slice(0, 200);
  const skills    = (sklData.skills    || sklData.items  || sklData.data  || []).slice(0, 200);
  return { scenarios, reports, skills };
}

/* ── voice integration exports ── */

export function isSrskltriQuery(q) {
  const lq = q.toLowerCase();
  return (
    lq.includes("srskltri") ||
    lq.includes("scenario report skill") ||
    lq.includes("scenario backing") ||
    lq.includes("backed scenario") ||
    lq.includes("dark scenario") ||
    lq.includes("scenario knowledge coverage") ||
    lq.includes("scenario capability") ||
    lq.includes("scenario readiness triple") ||
    lq.includes("fully backed scenario") ||
    (lq.includes("scenario") && lq.includes("report") && lq.includes("skill")) ||
    (lq.includes("scenario") && lq.includes("triple") && lq.includes("coverage"))
  );
}

export async function buildSrskltriScript() {
  try {
    const { scenarios, reports, skills } = await fetchAll();
    const classified = scenarios.map((s) => classify(s, reports, skills));
    const fb   = classified.filter((s) => s.status === "FULLY_BACKED").length;
    const ro   = classified.filter((s) => s.status === "REPORT_ONLY").length;
    const so   = classified.filter((s) => s.status === "SKILL_ONLY").length;
    const dark = classified.filter((s) => s.status === "DARK").length;
    const pct  = scenarios.length ? Math.round((fb / scenarios.length) * 100) : 0;
    return (
      `SRSKLTRI scenario readiness summary, sir: ${scenarios.length} scenarios cross-referenced against ` +
      `${reports.length} reports and ${skills.length} skills. ` +
      `${fb} scenarios FULLY BACKED by research and capability, ${ro} REPORT ONLY, ` +
      `${so} SKILL ONLY, ${dark} DARK with no backing. ` +
      `Coverage rate ${pct}%. ` +
      (dark > 0
        ? `${dark} scenarios have no research or skill support — immediate gap to address.`
        : "All scenarios have at least partial backing.")
    );
  } catch (err) {
    return `SRSKLTRI fetch error: ${err.message}`;
  }
}

/* ── component ── */

const TABS = ["ALL", "FULLY_BACKED", "REPORT_ONLY", "SKILL_ONLY", "DARK"];

const STATUS_META = {
  FULLY_BACKED: { label: "FULLY BACKED", color: GN },
  REPORT_ONLY:  { label: "REPORT ONLY",  color: CY },
  SKILL_ONLY:   { label: "SKILL ONLY",   color: AM },
  DARK:         { label: "DARK",         color: RD },
};

export default function ScenarioReportSkillTriple() {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const raw = await fetchAll();
      const classified = raw.scenarios.map((s) => classify(s, raw.reports, raw.skills));
      setData({ ...raw, classified });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jarvis:srskltri-toggle", handler);
    return () => window.removeEventListener("jarvis:srskltri-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildSrskltriScript();
      const base   = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: `SRSKLTRI scenario readiness assessment. Data: ${script}` }),
      });
      const d = await r.json();
      const text = (d.answer || script).trim();
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (err) {
      setAssessment(`Assessment error: ${err.message}`);
    } finally {
      setAssessing(false);
    }
  }, [data]);

  if (!open) {
    const darkCount = data?.classified?.filter((s) => s.status === "DARK").length ?? 0;
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 588,
          background: "rgba(5,10,18,0.85)", border: `1px solid ${CY}55`,
          borderRadius: 6, color: CY, fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SRSKLTRI
        {darkCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
          }}>
            {darkCount}
          </span>
        )}
      </button>
    );
  }

  const { classified = [], reports = [], skills = [] } = data || {};
  const fb   = classified.filter((s) => s.status === "FULLY_BACKED").length;
  const ro   = classified.filter((s) => s.status === "REPORT_ONLY").length;
  const so   = classified.filter((s) => s.status === "SKILL_ONLY").length;
  const dark = classified.filter((s) => s.status === "DARK").length;
  const total = classified.length;

  const visible = classified.filter((s) => {
    if (tab !== "ALL" && s.status !== tab) return false;
    if (search) {
      const kw = keywords(s);
      return kw.includes(search.toLowerCase()) || (s.name || s.title || "").toLowerCase().includes(search.toLowerCase());
    }
    return true;
  });

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 480, maxHeight: "82vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 12, zIndex: 588, overflowY: "auto",
      fontFamily: "'JetBrains Mono', monospace",
      boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${CY}33`,
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ SCENARIO × REPORT × SKILL — SRSKLTRI
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 14 }}>
          ✕
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "SCENARIOS", value: total,  color: CY },
          { label: "FULLY BACKED", value: fb,  color: GN },
          { label: "REPORT ONLY",  value: ro,  color: CY },
          { label: "SKILL ONLY",   value: so,  color: AM },
          { label: "DARK",         value: dark, color: RD },
        ].map((t) => (
          <div key={t.label} style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 6,
            padding: "4px 8px", textAlign: "center", minWidth: 72,
          }}>
            <div style={{ color: t.color, fontSize: 15, fontWeight: "bold" }}>{t.value}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "rgba(255,255,255,0.04)",
            border: `1px solid ${tab === t ? CY : "#2E4050"}`,
            borderRadius: 5, color: tab === t ? CY : "#4E6070",
            fontSize: 8, letterSpacing: 1, padding: "3px 8px", cursor: "pointer",
          }}>{t.replace("_", " ")}</button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.05)",
            border: `1px solid ${CY}33`, borderRadius: 5,
            color: "#DCEBF5", fontSize: 9, padding: "3px 8px", outline: "none",
            fontFamily: "inherit", width: 100,
          }}
        />
      </div>

      {/* ASSESS button */}
      <div style={{ padding: "0 14px 8px" }}>
        <button onClick={assess} disabled={assessing || !data} style={{
          background: assessing ? "rgba(41,231,255,0.05)" : `${CY}18`,
          border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 9, letterSpacing: 1, padding: "4px 12px",
          cursor: assessing ? "default" : "pointer",
        }}>
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{
            marginTop: 6, color: "#7A95AB", fontSize: 9, lineHeight: 1.5,
            letterSpacing: 0.5, padding: "6px 8px",
            background: "rgba(41,231,255,0.04)", borderRadius: 5,
          }}>
            {assessment}
          </div>
        )}
      </div>

      {/* Scenario rows */}
      {!data && (
        <div style={{ padding: "20px 14px", color: "#4E6070", fontSize: 10, textAlign: "center" }}>
          ◌ Loading…
        </div>
      )}
      {data && visible.length === 0 && (
        <div style={{ padding: "20px 14px", color: "#4E6070", fontSize: 10, textAlign: "center" }}>
          No scenarios match filter
        </div>
      )}
      {visible.map((s, i) => {
        const sm = STATUS_META[s.status];
        const isExp = expanded === i;
        return (
          <div key={i} style={{ borderTop: `1px solid ${CY}18` }}>
            <div
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 14px", cursor: "pointer",
                background: isExp ? `${CY}08` : "transparent",
              }}
            >
              <span style={{
                fontSize: 8, letterSpacing: 1, color: sm.color,
                background: `${sm.color}18`, borderRadius: 4, padding: "1px 5px",
                flexShrink: 0,
              }}>
                {sm.label}
              </span>
              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1, letterSpacing: 0.3 }}>
                {s.name || s.title || `Scenario ${i + 1}`}
              </span>
              <span style={{ color: "#2E4050", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
            </div>

            {isExp && (
              <div style={{ padding: "6px 14px 10px 28px" }}>
                {s.matchedReports.length > 0 && (
                  <>
                    <div style={{ color: CY, fontSize: 8, letterSpacing: 1, marginBottom: 4 }}>
                      MATCHED REPORTS
                    </div>
                    {s.matchedReports.map((r, ri) => (
                      <div key={ri} style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 3,
                      }}>
                        <span style={{
                          fontSize: 7, color: CY, background: `${CY}18`,
                          borderRadius: 3, padding: "1px 4px",
                        }}>
                          {r.source || r.kind || "RPT"}
                        </span>
                        <span style={{ color: "#7A95AB", fontSize: 9 }}>
                          {r.title || r.name || "Report"}
                        </span>
                        <span style={{ color: "#2E4050", fontSize: 8, marginLeft: "auto" }}>
                          {r.hits}↑
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {s.matchedReports.length === 0 && (
                  <div style={{ color: "#2E4050", fontSize: 9, marginBottom: 4 }}>
                    No matched reports
                  </div>
                )}

                {s.matchedSkills.length > 0 && (
                  <>
                    <div style={{ color: PR, fontSize: 8, letterSpacing: 1, marginTop: 6, marginBottom: 4 }}>
                      MATCHED SKILLS
                    </div>
                    {s.matchedSkills.map((sk, ski) => (
                      <div key={ski} style={{
                        display: "flex", alignItems: "center", gap: 6, marginBottom: 3,
                      }}>
                        <span style={{
                          fontSize: 7, color: PR, background: `${PR}18`,
                          borderRadius: 3, padding: "1px 4px",
                        }}>
                          {sk.domain || sk.category || "SKL"}
                        </span>
                        <span style={{ color: "#7A95AB", fontSize: 9 }}>
                          {sk.name || sk.title || "Skill"}
                        </span>
                        {sk.score != null && (
                          <span style={{ color: GN, fontSize: 8, marginLeft: "auto" }}>
                            {Math.round((sk.score || 0) * 100)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </>
                )}
                {s.matchedSkills.length === 0 && (
                  <div style={{ color: "#2E4050", fontSize: 9, marginTop: 4 }}>
                    No matched skills
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={{
        borderTop: `1px solid ${CY}18`, padding: "7px 14px",
        color: "#2E4050", fontSize: 8, letterSpacing: 1, textAlign: "right",
      }}>
        {total} scenarios · {reports.length} reports · {skills.length} skills · 90s auto-refresh
      </div>
    </div>
  );
}
