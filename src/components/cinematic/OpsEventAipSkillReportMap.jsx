/**
 * F202 — Ops Event × AIP Skill × Report Operational Response Coverage (OASRMAP)
 *
 * Parallel-fetches /v1/ops/events + /v1/aip/skill + /v1/reports
 * and keyword-correlates each ops event against AIP skills AND intelligence
 * reports to classify:
 *
 *   FULLY_RESPONDED  — matched AIP skill + report (full operational coverage)
 *   SKILL_ACTIVE     — skill match only, no report
 *   REPORT_BACKED    — report match only, no skill
 *   UNRESPONDED      — no matches (operational blind spot)
 *
 * Stat tiles: OPS EVENTS / AIP SKILLS / REPORTS + four class counts + COVERAGE%.
 * Amber badge on UNRESPONDED count.
 * Filter tabs ALL / FULLY_RESPONDED / SKILL_ACTIVE / REPORT_BACKED / UNRESPONDED + text search.
 * Expand event → matched AIP skill cards (cyan, type badge) + report cards (purple, type badge)
 * with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:oasrmap-toggle event.
 *
 * Voice triggers:
 *   "oasrmap / ops response / skill report coverage / unresponded events /
 *    operational response coverage / ops skill report"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_055_480;
const Z_INDEX  = 263;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OASRMAP_RE = /\b(oasrmap|ops[\s-]response|skill[\s-]report[\s-]coverage|unresponded[\s-]events?|operational[\s-]response[\s-]coverage|ops[\s-]skill[\s-]report)\b/i;

export function isOasrmapQuery(q = "") { return OASRMAP_RE.test(q); }

function keywords(text = "") {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreText(target = "", kws = []) {
  const t = target.toLowerCase();
  return kws.filter(k => t.includes(k)).length;
}

function evText(e) {
  return [e.name, e.type, e.description, e.category, e.title, e.event_type, e.source].filter(Boolean).join(" ");
}

function skillText(s) {
  return [s.name, s.description, s.category, s.type, (s.tags || []).join(" ")].filter(Boolean).join(" ");
}

function reportText(r) {
  return [r.title, r.description, r.type, r.author, (r.tags || []).join(" ")].filter(Boolean).join(" ");
}

export async function buildOasrmapScript() {
  const base = apiBase();
  const [opsRes, skillRes, repRes] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
  ]);
  const events = (opsRes.status   === "fulfilled" ? (opsRes.value?.items   || opsRes.value?.events  || opsRes.value   || []) : []);
  const skills  = (skillRes.status === "fulfilled" ? (skillRes.value?.items || skillRes.value?.skills || skillRes.value || []) : []);
  const reports = (repRes.status   === "fulfilled" ? (repRes.value?.items   || repRes.value?.reports  || repRes.value  || []) : []);

  const unresponded = events.filter(ev => {
    const kws = keywords(evText(ev));
    return !skills.some(s => scoreText(skillText(s), kws) > 0) &&
           !reports.some(r => scoreText(reportText(r), kws) > 0);
  }).length;
  const fully = events.filter(ev => {
    const kws = keywords(evText(ev));
    return skills.some(s => scoreText(skillText(s), kws) > 0) &&
           reports.some(r => scoreText(reportText(r), kws) > 0);
  }).length;
  const total  = events.length;
  const covPct = total ? Math.round(((total - unresponded) / total) * 100) : 0;
  return `OASRMAP Operational Response Coverage online, sir. I am correlating ${total} operational events against ${skills.length} AIP skills and ${reports.length} intelligence reports. ${fully} event${fully === 1 ? "" : "s"} are fully responded — covered by both an active skill and a report. ${unresponded} event${unresponded === 1 ? "" : "s"} remain unresponded with no skill or report coverage. Overall response coverage stands at ${covPct}%. Recommend immediate review of unresponded events to close operational gaps.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A78BFA";
const GR     = "#22C55E";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_RESPONDED: GR,
  SKILL_ACTIVE:    CY,
  REPORT_BACKED:   PU,
  UNRESPONDED:     AM,
};

const SEVERITY_COLOR = { CRITICAL: RD, HIGH: AM, MEDIUM: CY, LOW: GR };

function classify(ev, skills, reports) {
  const kws  = keywords(evText(ev));
  const hasS = skills.some(s => scoreText(skillText(s), kws) > 0);
  const hasR = reports.some(r => scoreText(reportText(r), kws) > 0);
  if (hasS && hasR) return "FULLY_RESPONDED";
  if (hasS)         return "SKILL_ACTIVE";
  if (hasR)         return "REPORT_BACKED";
  return "UNRESPONDED";
}

function getMatches(ev, list, textFn) {
  const kws = keywords(evText(ev));
  return list
    .map(item => ({ item, score: scoreText(textFn(item), kws) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export default function OpsEventAipSkillReportMap() {
  const [open,     setOpen]     = useState(false);
  const [events,   setEvents]   = useState([]);
  const [skills,   setSkills]   = useState([]);
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [tab,      setTab]      = useState("ALL");
  const [search,   setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [brief,    setBrief]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const [opsR, sklR, repR] = await Promise.allSettled([
      fetch(`${base}/v1/ops/events`).then(r => r.json()),
      fetch(`${base}/v1/aip/skill`).then(r => r.json()),
      fetch(`${base}/v1/reports`).then(r => r.json()),
    ]);
    setEvents(opsR.status  === "fulfilled" ? (opsR.value?.items   || opsR.value?.events  || opsR.value   || []) : []);
    setSkills(sklR.status  === "fulfilled" ? (sklR.value?.items   || sklR.value?.skills  || sklR.value   || []) : []);
    setReports(repR.status === "fulfilled" ? (repR.value?.items   || repR.value?.reports || repR.value   || []) : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:oasrmap-toggle", handler);
    return () => window.removeEventListener("jarvis:oasrmap-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = events.map(ev => ({ ev, cls: classify(ev, skills, reports) }));
  const counts = { FULLY_RESPONDED: 0, SKILL_ACTIVE: 0, REPORT_BACKED: 0, UNRESPONDED: 0 };
  classified.forEach(({ cls }) => counts[cls]++);
  const covPct = events.length ? Math.round(((events.length - counts.UNRESPONDED) / events.length) * 100) : 0;

  const filtered = classified.filter(({ ev, cls }) => {
    if (tab !== "ALL" && cls !== tab) return false;
    if (!search) return true;
    return evText(ev).toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const base = apiBase();
      const ctx  = `${events.length} ops events, ${skills.length} AIP skills, ${reports.length} reports. FULLY_RESPONDED:${counts.FULLY_RESPONDED} SKILL_ACTIVE:${counts.SKILL_ACTIVE} REPORT_BACKED:${counts.REPORT_BACKED} UNRESPONDED:${counts.UNRESPONDED} Coverage:${covPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `OASRMAP operational response coverage assessment. Data: ${ctx}. Provide a 2-sentence brief on which unresponded events are most critical and the highest-priority gap to close.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
      setBrief(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setBrief("Assessment unavailable.");
    }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}`,
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
        title="Ops Event × AIP Skill × Report Operational Response Coverage"
      >
        ◈ OASRMAP
        {counts.UNRESPONDED > 0 && (
          <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>
            {counts.UNRESPONDED}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "FULLY_RESPONDED", "SKILL_ACTIVE", "REPORT_BACKED", "UNRESPONDED"];

  return (
    <div style={{
      position: "fixed", top: 40, left: "50%", transform: "translateX(-50%)",
      width: 760, maxHeight: "80vh", overflowY: "auto",
      background: BG, border: `1px solid ${CY}`, borderRadius: 8,
      zIndex: Z_INDEX + 1000, fontFamily: FONT, color: CY, padding: 18,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
          ◈ OASRMAP — OPS EVENT × AIP SKILL × REPORT OPERATIONAL RESPONSE COVERAGE
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 12 }}>
        {[
          ["OPS EVENTS",      events.length,           CY],
          ["AIP SKILLS",      skills.length,            CY],
          ["REPORTS",         reports.length,           CY],
          ["FULLY RESP.",     counts.FULLY_RESPONDED,  GR],
          ["SKILL ACTIVE",    counts.SKILL_ACTIVE,     CY],
          ["REPORT BACKED",   counts.REPORT_BACKED,    PU],
          ["UNRESPONDED",     counts.UNRESPONDED,      AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(0,207,255,0.05)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "6px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#666", marginBottom: 3 }}>
          <span>RESPONSE COVERAGE</span><span>{covPct}%</span>
        </div>
        <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
          <div style={{ height: "100%", width: `${covPct}%`, background: covPct > 70 ? GR : covPct > 40 ? AM : RD, borderRadius: 2, transition: "width .4s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.18)" : "transparent",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontFamily: FONT, fontSize: 9,
            padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          }}>
            {t}{t !== "ALL" ? ` (${counts[t] ?? 0})` : ` (${events.length})`}
          </button>
        ))}
        <input
          placeholder="search…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 8px", borderRadius: 3, width: 140, outline: "none" }}
        />
      </div>

      {loading && <div style={{ color: "#666", fontSize: 11, marginBottom: 8 }}>⟳ Loading…</div>}

      {/* Event rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {filtered.map(({ ev, cls }, i) => {
          const id      = ev.id || ev._id || i;
          const isExp   = expanded === id;
          const clrCls  = CLASS_COLOR[cls];
          const skillMatches  = getMatches(ev, skills,  skillText);
          const reportMatches = getMatches(ev, reports, reportText);
          return (
            <div key={id} style={{ border: `1px solid ${BORDER}`, borderRadius: 5, background: "rgba(0,207,255,0.03)" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 8, background: `${clrCls}22`, border: `1px solid ${clrCls}`, color: clrCls, borderRadius: 3, padding: "1px 5px", minWidth: 90, textAlign: "center", letterSpacing: 1 }}>
                  {cls.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 10, flex: 1 }}>{ev.name || ev.title || ev.type || "Ops Event"}</span>
                {ev.type && <span style={{ fontSize: 8, color: "#666" }}>{ev.type}</span>}
                <span style={{ fontSize: 9, color: isExp ? CY : "#444" }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ padding: "0 10px 10px", borderTop: `1px solid ${BORDER}` }}>
                  {ev.description && <div style={{ fontSize: 9, color: "#888", marginTop: 6, marginBottom: 8 }}>{ev.description}</div>}
                  {skillMatches.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: CY, marginBottom: 4, letterSpacing: 1 }}>▸ MATCHED AIP SKILLS</div>
                      {skillMatches.map(({ item: s, score }) => (
                        <div key={s.id || s.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 8px", background: "rgba(0,207,255,0.05)", borderRadius: 3 }}>
                          <span style={{ fontSize: 9, flex: 1 }}>{s.name}</span>
                          {s.category && <span style={{ fontSize: 8, color: "#888", background: "rgba(0,207,255,0.1)", borderRadius: 2, padding: "0 4px" }}>{s.category}</span>}
                          <div style={{ width: 60, height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, score * 15)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {reportMatches.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 4, letterSpacing: 1 }}>▸ MATCHED REPORTS</div>
                      {reportMatches.map(({ item: r, score }) => (
                        <div key={r.id || r.title} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, padding: "4px 8px", background: "rgba(167,139,250,0.05)", borderRadius: 3 }}>
                          <span style={{ fontSize: 9, flex: 1 }}>{r.title}</span>
                          {r.type && <span style={{ fontSize: 8, color: "#888", background: "rgba(167,139,250,0.1)", borderRadius: 2, padding: "0 4px" }}>{r.type}</span>}
                          <div style={{ width: 60, height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, score * 15)}%`, background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {skillMatches.length === 0 && reportMatches.length === 0 && (
                    <div style={{ fontSize: 9, color: AM, marginTop: 6 }}>⚠ No matching AIP skills or reports found — operational blind spot.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <div style={{ color: "#555", fontSize: 10, textAlign: "center", padding: 20 }}>No events match current filter.</div>
        )}
      </div>

      {/* Assess button */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 10, padding: "5px 14px", cursor: "pointer", borderRadius: 3, letterSpacing: 1 }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && <div style={{ fontSize: 9, color: "#aaa", flex: 1 }}>{brief}</div>}
      </div>
    </div>
  );
}
