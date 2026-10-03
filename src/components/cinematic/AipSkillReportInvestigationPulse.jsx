/**
 * F176 — AIP Skill × Report × Investigation Coverage Pulse (ARICP)
 *
 * Parallel-fetches /v1/aip/skill + /v1/reports + /v1/investigations and
 * keyword-correlates each AIP skill against intelligence reports AND open
 * investigations to classify:
 *
 *   FULLY_COVERED   — matched both a report AND an investigation
 *   REPORT_ONLY     — matched a report, no investigation
 *   INVESTIGATED    — matched an investigation, no report
 *   UNCOVERED       — no matches (capability blind spot)
 *
 * Stat tiles: AIP SKILLS / REPORTS / INVESTIGATIONS + four class counts + COVERAGE%.
 * Red badge on uncovered count.
 * Filter tabs ALL / FULLY_COVERED / REPORT_ONLY / INVESTIGATED / UNCOVERED + text search.
 * Expand skill → matched report cards (purple, type badge) + investigation cards (cyan,
 *               status badge) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:aricp-toggle event.
 *
 * Voice triggers:
 *   "aricp / aip report coverage / skill report / skill investigation coverage /
 *    uncovered skills / capability report gap / skill intelligence coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_040_920;
const Z_INDEX  = 237;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ARICP_RE = /\b(aricp|aip[\s-]report[\s-]coverage|skill[\s-]report\b|skill[\s-]investigation[\s-]coverage|uncovered[\s-]skills|capability[\s-]report[\s-]gap|skill[\s-]intelligence[\s-]coverage)\b/i;

const CY   = "#00CFFF";
const PU   = "#A855F7";
const GR   = "#22C55E";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const BG   = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COVERED: GR,
  REPORT_ONLY:   PU,
  INVESTIGATED:  CY,
  UNCOVERED:     RD,
};

const TABS = ["ALL", "FULLY_COVERED", "REPORT_ONLY", "INVESTIGATED", "UNCOVERED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function skillText(s) {
  return `${s.name || s.skill_name || ""} ${s.description || s.summary || ""} ${s.category || s.type || ""} ${(s.tags || []).join(" ")}`;
}
function reportText(r) {
  return `${r.title || r.name || ""} ${r.description || r.summary || r.content || ""} ${r.type || r.category || ""} ${(r.tags || []).join(" ")} ${r.author || ""}`;
}
function invText(i) {
  return `${i.title || i.name || ""} ${i.description || i.summary || ""} ${i.status || ""} ${i.priority || ""} ${(i.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [skillRes, repRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/aip/skill`,      { headers }),
    fetch(`${apiBase}/v1/reports`,        { headers }),
    fetch(`${apiBase}/v1/investigations`, { headers }),
  ]);
  const skills = skillRes.status === "fulfilled" && skillRes.value.ok
    ? normaliseArray(await skillRes.value.json(), ["skills", "items"]) : [];
  const reports = repRes.status === "fulfilled" && repRes.value.ok
    ? normaliseArray(await repRes.value.json(), ["reports", "items"]) : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "items"]) : [];
  return { skills, reports, investigations };
}

function correlate(skills, reports, investigations) {
  return skills.map(skill => {
    const kws = keywords(skillText(skill));
    const matchedReports = reports
      .map(r => ({ ...r, _score: score(reportText(r), kws) }))
      .filter(r => r._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedInvs = investigations
      .map(i => ({ ...i, _score: score(invText(i), kws) }))
      .filter(i => i._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const hasReport = matchedReports.length > 0;
    const hasInv    = matchedInvs.length > 0;
    let cls;
    if (hasReport && hasInv)   cls = "FULLY_COVERED";
    else if (hasReport)        cls = "REPORT_ONLY";
    else if (hasInv)           cls = "INVESTIGATED";
    else                       cls = "UNCOVERED";
    return { ...skill, _cls: cls, _reports: matchedReports, _invs: matchedInvs };
  });
}

export async function buildAricpScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { skills, reports, investigations } = await loadAll();
  const corr = correlate(skills, reports, investigations);
  const uncovered  = corr.filter(s => s._cls === "UNCOVERED").length;
  const fully      = corr.filter(s => s._cls === "FULLY_COVERED").length;
  const context = `AIP skills: ${skills.length}, Reports: ${reports.length}, Investigations: ${investigations.length}. Fully covered: ${fully}. Uncovered (no report or investigation): ${uncovered}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `Assess JARVIS AIP skill intelligence coverage. ${context} Give a 2-sentence operational coverage brief focusing on uncovered capabilities.` }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${uncovered} AIP skills lack both report and investigation coverage — these represent unmonitored capability blind spots. ${fully} skills are fully documented with both report and investigation backing.`;
}

export function isAricpQuery(q) { return ARICP_RE.test(q); }

export default function AipSkillReportInvestigationPulse() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [skills,     setSkills]     = useState([]);
  const [reports,    setReports]    = useState([]);
  const [invs,       setInvs]       = useState([]);
  const [corr,       setCorr]       = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadAll();
      setSkills(data.skills);
      setReports(data.reports);
      setInvs(data.investigations);
      setCorr(correlate(data.skills, data.reports, data.investigations));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:aricp-toggle", toggle);
    return () => window.removeEventListener("jarvis:aricp-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const text = await buildAricpScript();
      setBrief(text);
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const r = await fetch(`${apiBase}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const fully     = corr.filter(s => s._cls === "FULLY_COVERED").length;
  const repOnly   = corr.filter(s => s._cls === "REPORT_ONLY").length;
  const invOnly   = corr.filter(s => s._cls === "INVESTIGATED").length;
  const uncovered = corr.filter(s => s._cls === "UNCOVERED").length;
  const covPct    = corr.length ? Math.round((fully / corr.length) * 100) : 0;

  const visible = corr.filter(s => {
    const matchTab = tab === "ALL" || s._cls === tab;
    const matchSrch = !search || skillText(s).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: uncovered > 0 ? RD : CY, fontFamily: FONT, fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: uncovered > 0 ? `0 0 8px ${RD}55` : "none",
        }}
        title="AIP Skill × Report × Investigation Coverage Pulse (F176)"
      >
        ◈ ARICP{uncovered > 0 && <span style={{ color: RD, marginLeft: 4 }}>●{uncovered}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 40, right: 16, width: 560, maxHeight: "calc(100vh - 60px)",
      zIndex: Z_INDEX + 100, background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, fontFamily: FONT, fontSize: 11, color: CY,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 24px rgba(0,207,255,0.12)`,
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          ◈ ARICP — AIP Skill × Report × Investigation Coverage
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: AM, fontSize: 10 }}>⟳ loading…</span>}
          <button onClick={refresh} style={{ background: "none", border: `1px solid ${BORDER}`, color: CY, cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["SKILLS", corr.length, CY],
          ["REPORTS", reports.length, PU],
          ["INVESTIGATIONS", invs.length, CY],
          ["FULLY CVR", fully, GR],
          ["REPORT ONLY", repOnly, PU],
          ["INVESTIGATED", invOnly, CY],
          ["UNCOVERED", uncovered, RD],
          [`${covPct}% COV`, null, GR],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 70 }}>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{val ?? label}</div>
            {val !== null && <div style={{ color: "#6B7280", fontSize: 9, marginTop: 1 }}>{label}</div>}
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 3 }}>FULL COVERAGE</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${covPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "none",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "#6B7280", cursor: "pointer",
            padding: "2px 7px", borderRadius: 3, fontSize: 9, fontFamily: FONT,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontFamily: FONT }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: "#6B7280", padding: 8, textAlign: "center" }}>No items match.</div>
        )}
        {visible.map((s, i) => {
          const id = s.id || s.skill_id || i;
          const isExp = expanded === id;
          const clr = CLASS_COLOR[s._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{s._cls}</span>
                  <span style={{ color: CY }}>{s.name || s.skill_name || `Skill ${id}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                  {s._reports.length > 0 && <span style={{ color: PU }}>RPT:{s._reports.length}</span>}
                  {s._invs.length > 0 && <span style={{ color: CY }}>INV:{s._invs.length}</span>}
                  <span>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {s.description && <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>{s.description.slice(0, 100)}</div>}
              {isExp && (
                <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                  {s._reports.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: PU, fontSize: 9, marginBottom: 3 }}>REPORTS</div>
                      {s._reports.map((r, ri) => (
                        <div key={ri} style={{ background: "rgba(168,85,247,0.07)", border: `1px solid rgba(168,85,247,0.2)`, borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: PU, fontSize: 10 }}>{r.title || r.name || "Report"}</span>
                            {r.type && <span style={{ background: "rgba(168,85,247,0.2)", color: PU, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{r.type.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (r._score / 5) * 100)}%`, background: PU, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {s._invs.length > 0 && (
                    <div>
                      <div style={{ color: CY, fontSize: 9, marginBottom: 3 }}>INVESTIGATIONS</div>
                      {s._invs.map((inv, ii) => (
                        <div key={ii} style={{ background: "rgba(0,207,255,0.06)", border: `1px solid rgba(0,207,255,0.18)`, borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: CY, fontSize: 10 }}>{inv.title || inv.name || "Investigation"}</span>
                            {inv.status && <span style={{ background: "rgba(0,207,255,0.15)", color: CY, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{inv.status.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (inv._score / 5) * 100)}%`, background: CY, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {s._reports.length === 0 && s._invs.length === 0 && (
                    <div style={{ color: RD, fontSize: 9, padding: "4px 0" }}>No report or investigation coverage found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess button */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, cursor: assessing ? "wait" : "pointer", padding: "5px 14px", borderRadius: 4, fontFamily: FONT, fontSize: 10, width: "100%" }}
        >
          {assessing ? "⟳ Assessing…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
