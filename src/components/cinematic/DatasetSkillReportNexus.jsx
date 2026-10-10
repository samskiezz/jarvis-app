/**
 * F230 — Dataset × AIP Skill × Report Intelligence Automation Nexus (DARINEX)
 *
 * Parallel-fetches /v1/datasets + /v1/aip/skill + /v1/reports
 * and keyword-correlates each dataset against AIP skills AND intelligence reports:
 *
 *   FULLY_AUTOMATED  — matched AIP skill + report (complete intelligence automation)
 *   SKILL_ONLY       — matched AIP skill only (no report coverage)
 *   REPORTED_ONLY    — matched report only (no AIP skill automation)
 *   UNMAPPED         — no matches (intelligence automation gap)
 *
 * Stat tiles: DATASETS / AIP SKILLS / REPORTS + four class counts + AUTOMATION%.
 * Amber badge on UNMAPPED count.
 * Filter tabs ALL / FULLY_AUTOMATED / SKILL_ONLY / REPORTED_ONLY / UNMAPPED + text search.
 * Expand dataset → matched AIP skill cards (cyan) + matched report cards (purple).
 * ▶ ASSESS AUTOMATION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:darinex-toggle event.
 *
 * Voice triggers:
 *   "darinex / dataset automation / dataset skill / dataset report / unmapped datasets /
 *    intelligence automation nexus / data intelligence automation"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_070_600;
const Z_INDEX  = 290;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const DARINEX_RE = /\b(darinex|dataset[\s-]automation|dataset[\s-]skill|dataset[\s-]report|unmapped[\s-]datasets?|intelligence[\s-]automation[\s-]nexus|data[\s-]intelligence[\s-]automation)\b/i;

export function isDarinexQuery(q = "") { return DARINEX_RE.test(q); }

export async function buildDarinexScript() {
  const base = apiBase();
  const [dR, sR, rR] = await Promise.allSettled([
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
  ]);
  const datasets = dR.status === "fulfilled" ? (dR.value?.items || dR.value?.datasets || dR.value || []) : [];
  const skills   = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.skills || sR.value || []) : [];
  const reports  = rR.status === "fulfilled" ? (rR.value?.items || rR.value?.reports || rR.value || []) : [];

  let fullyAutomated = 0, unmapped = 0;
  for (const ds of datasets) {
    const kws    = keywords(datasetText(ds));
    const hasSk  = skills.some(s => scoreText(skillText(s), kws) > 0);
    const hasRep = reports.some(r => scoreText(reportText(r), kws) > 0);
    if (hasSk && hasRep) fullyAutomated++;
    else if (!hasSk && !hasRep) unmapped++;
  }
  const total      = datasets.length;
  const automation = total ? Math.round((fullyAutomated / total) * 100) : 0;
  return `DARINEX Dataset Intelligence Automation Nexus online, sir. I have cross-referenced ${total} datasets against ${skills.length} AIP automation skills and ${reports.length} intelligence reports. ${fullyAutomated} datasets have full intelligence automation — both an AIP skill actively processing them and an intelligence report documenting findings — representing ${automation}% comprehensive automation coverage. ${unmapped} datasets are completely unmapped with no AIP skill coverage and no intelligence reporting whatsoever — these represent critical automation gaps in our intelligence pipeline requiring immediate attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A78BFA";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_AUTOMATED: GR,
  SKILL_ONLY:      CY,
  REPORTED_ONLY:   PU,
  UNMAPPED:        AM,
};

const TABS = ["ALL", "FULLY_AUTOMATED", "SKILL_ONLY", "REPORTED_ONLY", "UNMAPPED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.tags, d.type, d.category, d.source].filter(Boolean).join(" ");
}
function skillText(s) {
  return [s.name, s.description, s.type, s.category, s.tags].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.title, r.name, r.description, r.summary, r.type, r.tags, r.author].filter(Boolean).join(" ");
}

function classify(ds, skills, reports) {
  const kws        = keywords(datasetText(ds));
  const matchedSk  = skills.map(s => ({ ...s, _score: scoreText(skillText(s), kws) })).filter(s => s._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);
  const matchedRep = reports.map(r => ({ ...r, _score: scoreText(reportText(r), kws) })).filter(r => r._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);

  const hasSk  = matchedSk.length > 0;
  const hasRep = matchedRep.length > 0;
  let cls;
  if (hasSk && hasRep)       cls = "FULLY_AUTOMATED";
  else if (hasSk && !hasRep) cls = "SKILL_ONLY";
  else if (!hasSk && hasRep) cls = "REPORTED_ONLY";
  else                       cls = "UNMAPPED";

  return { ...ds, _cls: cls, _sk: matchedSk, _rep: matchedRep };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

function RelevanceBar({ score, max, col }) {
  const pct = max > 0 ? Math.min(100, Math.round((score / max) * 100)) : 0;
  return (
    <div style={{ height: 3, background: "#1A2A3A", borderRadius: 2, marginTop: 3, width: "100%" }}>
      <div style={{ height: 3, width: pct + "%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
    </div>
  );
}

export default function DatasetSkillReportNexus() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [datasets, setDatasets]   = useState([]);
  const [skills, setSkills]       = useState([]);
  const [reports, setReports]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [brief, setBrief]         = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [dR, sR, rR] = await Promise.allSettled([
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
      ]);
      const ds = dR.status === "fulfilled" ? (dR.value?.items || dR.value?.datasets || dR.value || []) : [];
      const sk = sR.status === "fulfilled" ? (sR.value?.items || sR.value?.skills || sR.value || []) : [];
      const rp = rR.status === "fulfilled" ? (rR.value?.items || rR.value?.reports || rR.value || []) : [];
      setDatasets(ds);
      setSkills(sk);
      setReports(rp);
      setClassified(ds.map(d => classify(d, sk, rp)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:darinex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:darinex-toggle", onToggle);
  }, []);

  const fullyAutomated = classified.filter(c => c._cls === "FULLY_AUTOMATED").length;
  const skillOnly      = classified.filter(c => c._cls === "SKILL_ONLY").length;
  const reportedOnly   = classified.filter(c => c._cls === "REPORTED_ONLY").length;
  const unmapped       = classified.filter(c => c._cls === "UNMAPPED").length;
  const total          = classified.length;
  const automationPct  = total ? Math.round((fullyAutomated / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || datasetText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `DARINEX: ${total} datasets — FULLY_AUTOMATED: ${fullyAutomated}, SKILL_ONLY: ${skillOnly}, REPORTED_ONLY: ${reportedOnly}, UNMAPPED: ${unmapped} (${automationPct}% full automation). AIP skills: ${skills.length}. Reports: ${reports.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `DARINEX intelligence automation assessment. Context: ${ctx}. Provide a 2-sentence brief identifying the highest-priority unmapped datasets that lack AIP skill automation and intelligence reporting, and what automation coverage should be established first. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      const tts = await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      });
      if (tts.ok) {
        const blob = await tts.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }
    } catch (e) {
      setBrief("Assessment unavailable: " + e.message);
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Dataset × AIP Skill × Report Intelligence Automation Nexus (DARINEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${CY}55`,
          color: CY, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unmapped > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unmapped}
          </span>
        )}
        ◈ DARINEX
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: Z_INDEX,
      background: BG, fontFamily: FONT, overflowY: "auto", padding: "18px 20px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ DARINEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Dataset × AIP Skill × Report — Intelligence Automation Nexus
        </span>
        {loading && <span style={{ color: CY, fontSize: 10 }}>◌ loading…</span>}
        <button onClick={load} style={smallBtn(CY)} title="Refresh">↺</button>
        <button onClick={() => setOpen(false)} style={smallBtn(RD)}>✕</button>
      </div>

      {error && (
        <div style={{ color: RD, fontSize: 11, marginBottom: 10, padding: "6px 10px", border: `1px solid ${RD}44`, borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["DATASETS",         total,           CY],
          ["AIP SKILLS",       skills.length,   CY],
          ["REPORTS",          reports.length,  PU],
          ["FULLY AUTOMATED",  fullyAutomated,  GR],
          ["SKILL ONLY",       skillOnly,       CY],
          ["REPORTED ONLY",    reportedOnly,    PU],
          ["UNMAPPED",         unmapped,        AM],
          ["AUTOMATION%",      automationPct + "%", automationPct >= 70 ? GR : automationPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 90, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Automation bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          FULL INTELLIGENCE AUTOMATION — {automationPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: automationPct + "%",
            background: automationPct >= 70 ? GR : automationPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(CY), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS AUTOMATION"}
        </button>
        {brief && (
          <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1, minWidth: 200 }}>
            {brief}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            ...smallBtn(tab === t ? CY : "#4A6A80"),
            background: tab === t ? CY + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search datasets…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} datasets
        </span>
      </div>

      {/* Dataset list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading datasets…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((ds, i) => {
            const col    = CLASS_COLOR[ds._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxSk  = ds._sk[0]?._score || 1;
            const maxRep = ds._rep[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(0,207,255,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {ds._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ds.name || ds.title || `Dataset ${i + 1}`}
                  </span>
                  {(ds.type || ds.category) && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{ds.type || ds.category}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(ds.description || ds.summary) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {ds.description || ds.summary}
                      </div>
                    )}

                    {/* Matched AIP skills */}
                    {ds._sk.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED AIP SKILLS ({ds._sk.length})
                        </div>
                        {ds._sk.map((s, si) => (
                          <div key={si} style={{ background: CY + "11", border: `1px solid ${CY}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || `Skill ${si + 1}`}
                              </span>
                              {(s.type || s.category) && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {s.type || s.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={s._score} max={maxSk} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched reports */}
                    {ds._rep.length > 0 && (
                      <div>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED REPORTS ({ds._rep.length})
                        </div>
                        {ds._rep.map((r, ri) => (
                          <div key={ri} style={{ background: PU + "11", border: `1px solid ${PU}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.title || r.name || `Report ${ri + 1}`}
                              </span>
                              {(r.type || r.category) && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {r.type || r.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={r._score} max={maxRep} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {ds._cls === "UNMAPPED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching AIP skills or intelligence reports found. This dataset has no automation coverage and no intelligence reporting — a critical gap in the intelligence pipeline.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No datasets match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
