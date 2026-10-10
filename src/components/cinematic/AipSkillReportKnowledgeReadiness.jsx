/**
 * F223 — AIP Skill × Report × Knowledge Multi-Domain Intelligence Readiness (MDIRS)
 *
 * Parallel-fetches /v1/aip/skill + /v1/reports + /knowledge/
 * and keyword-correlates each AIP skill against intelligence reports AND KB articles:
 *
 *   FULLY_DOCUMENTED  — matched report + KB article (full intelligence readiness)
 *   REPORT_ONLY       — matched report, no KB article (operationally covered, no KB)
 *   KB_ONLY           — matched KB article, no report (documented, no operational report)
 *   UNDOCUMENTED      — no matches in either source (capability intelligence gap)
 *
 * Stat tiles: AIP SKILLS / REPORTS / KB ARTICLES + four class counts + READINESS%.
 * Amber badge on UNDOCUMENTED count.
 * Filter tabs ALL / FULLY_DOCUMENTED / REPORT_ONLY / KB_ONLY / UNDOCUMENTED + text search.
 * Expand skill → matched report cards (purple) + KB article cards (green) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:mdirs-toggle event.
 *
 * Voice triggers:
 *   "mdirs / skill readiness / aip readiness / undocumented skill / skill documentation /
 *    multi-domain readiness / capability readiness"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_067_240;
const Z_INDEX  = 284;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const MDIRS_RE = /\b(mdirs|skill[\s-]readiness|aip[\s-]readiness|undocumented[\s-]skill|skill[\s-]documentation|multi[\s-]domain[\s-]readiness|capability[\s-]readiness)\b/i;

export function isMdirsQuery(q = "") { return MDIRS_RE.test(q); }

export async function buildMdirsScript() {
  const base = apiBase();
  const [skillRes, rptRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const skills  = skillRes.status === "fulfilled" ? (skillRes.value?.items || skillRes.value || []) : [];
  const reports = rptRes.status  === "fulfilled" ? (rptRes.value?.items  || rptRes.value  || []) : [];
  const kbarts  = kbRes.status   === "fulfilled" ? (kbRes.value?.items   || kbRes.value   || []) : [];

  let fullyDoc = 0, undoc = 0;
  for (const sk of skills) {
    const kws   = keywords(skillText(sk));
    const hasRp = reports.some(r => scoreText(reportText(r), kws) > 0);
    const hasKb = kbarts.some(a => scoreText(articleText(a), kws) > 0);
    if (hasRp && hasKb) fullyDoc++;
    else if (!hasRp && !hasKb) undoc++;
  }
  const total  = skills.length;
  const rdPct  = total ? Math.round((fullyDoc / total) * 100) : 0;
  return `MDIRS Multi-Domain Intelligence Readiness online, sir. I have cross-referenced ${total} AIP skills against ${reports.length} intelligence reports and ${kbarts.length} knowledge base articles. ${fullyDoc} skills have full documentation coverage — matched to both an operational report and a knowledge base article, representing ${rdPct}% readiness. ${undoc} skills are completely undocumented across both sources, representing critical capability intelligence gaps requiring immediate analytical attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const BL   = "#3B82F6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_DOCUMENTED: GR,
  REPORT_ONLY:      PU,
  KB_ONLY:          BL,
  UNDOCUMENTED:     AM,
};

const TABS = ["ALL", "FULLY_DOCUMENTED", "REPORT_ONLY", "KB_ONLY", "UNDOCUMENTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function skillText(sk) {
  return [sk.name, sk.title, sk.description, sk.category, sk.type, sk.tags, sk.domain, sk.objective].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.name, r.title, r.description, r.summary, r.type, r.tags, r.author, r.content].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.name, a.title, a.description, a.content, a.category, a.tags, a.topic, a.summary].filter(Boolean).join(" ");
}

function classify(skill, reports, kbarts) {
  const kws = keywords(skillText(skill));
  const matchedRp = reports
    .map(r => ({ ...r, _score: scoreText(reportText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedKb = kbarts
    .map(a => ({ ...a, _score: scoreText(articleText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasRp = matchedRp.length > 0;
  const hasKb = matchedKb.length > 0;

  let cls;
  if (hasRp && hasKb) cls = "FULLY_DOCUMENTED";
  else if (hasRp)     cls = "REPORT_ONLY";
  else if (hasKb)     cls = "KB_ONLY";
  else                cls = "UNDOCUMENTED";

  return { ...skill, _cls: cls, _rp: matchedRp, _kb: matchedKb };
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

export default function AipSkillReportKnowledgeReadiness() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [skills, setSkills]     = useState([]);
  const [reports, setReports]   = useState([]);
  const [kbarts, setKbarts]     = useState([]);
  const [classified, setClass]  = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [skR, rpR, kbR] = await Promise.allSettled([
        fetch(`${base}/v1/aip/skill`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const sk = skR.status === "fulfilled" ? (skR.value?.items || skR.value || []) : [];
      const rp = rpR.status === "fulfilled" ? (rpR.value?.items || rpR.value || []) : [];
      const kb = kbR.status === "fulfilled" ? (kbR.value?.items || kbR.value || []) : [];
      setSkills(sk);
      setReports(rp);
      setKbarts(kb);
      setClass(sk.map(s => classify(s, rp, kb)));
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
    window.addEventListener("jarvis:mdirs-toggle", onToggle);
    return () => window.removeEventListener("jarvis:mdirs-toggle", onToggle);
  }, []);

  const fullyDoc = classified.filter(c => c._cls === "FULLY_DOCUMENTED").length;
  const rptOnly  = classified.filter(c => c._cls === "REPORT_ONLY").length;
  const kbOnly   = classified.filter(c => c._cls === "KB_ONLY").length;
  const undoc    = classified.filter(c => c._cls === "UNDOCUMENTED").length;
  const total    = classified.length;
  const rdPct    = total ? Math.round((fullyDoc / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || skillText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `MDIRS: ${total} AIP skills — FULLY_DOCUMENTED: ${fullyDoc}, REPORT_ONLY: ${rptOnly}, KB_ONLY: ${kbOnly}, UNDOCUMENTED: ${undoc} (${rdPct}% readiness). Reports: ${reports.length}. KB articles: ${kbarts.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `MDIRS multi-domain intelligence readiness assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which undocumented AIP skills represent the highest capability intelligence gaps and what documentation or reporting actions should be prioritised. Be concise and direct.` }),
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
        title="AIP Skill × Report × Knowledge Multi-Domain Intelligence Readiness (MDIRS)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${GR}55`,
          color: GR, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {undoc > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {undoc}
          </span>
        )}
        ◈ MDIRS
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
        <span style={{ color: GR, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ MDIRS</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          AIP Skill × Report × Knowledge Multi-Domain Intelligence Readiness
        </span>
        {loading && <span style={{ color: GR, fontSize: 10 }}>◌ loading…</span>}
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
          ["AIP SKILLS",        total,         GR],
          ["REPORTS",           reports.length, PU],
          ["KB ARTICLES",       kbarts.length,  BL],
          ["FULLY DOCUMENTED",  fullyDoc,       GR],
          ["REPORT ONLY",       rptOnly,        PU],
          ["KB ONLY",           kbOnly,         BL],
          ["UNDOCUMENTED",      undoc,          AM],
          ["READINESS%",        rdPct + "%",    rdPct >= 70 ? GR : rdPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(34,197,94,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Readiness coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          MULTI-DOMAIN INTELLIGENCE READINESS — {rdPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: rdPct + "%",
            background: rdPct >= 70 ? GR : rdPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(GR), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS READINESS"}
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
            ...smallBtn(tab === t ? GR : "#4A6A80"),
            background: tab === t ? GR + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{
            background: "rgba(34,197,94,0.05)", border: `1px solid ${GR}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} skills
        </span>
      </div>

      {/* Skills list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading skills…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((skill, i) => {
            const col   = CLASS_COLOR[skill._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxRp = skill._rp[0]?._score || 1;
            const maxKb = skill._kb[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(34,197,94,0.02)", overflow: "hidden",
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
                    {skill._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {skill.name || skill.title || `Skill ${i + 1}`}
                  </span>
                  {skill.category && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{skill.category}</span>
                  )}
                  {skill.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{skill.type}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {skill.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {skill.description}
                      </div>
                    )}

                    {/* Matched reports */}
                    {skill._rp.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED REPORTS ({skill._rp.length})
                        </div>
                        {skill._rp.map((r, ri) => (
                          <div key={ri} style={{
                            background: PU + "11", border: `1px solid ${PU}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name || r.title || `Report ${ri + 1}`}
                              </span>
                              {r.type && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {r.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={r._score} max={maxRp} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {skill._kb.length > 0 && (
                      <div>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KB ARTICLES ({skill._kb.length})
                        </div>
                        {skill._kb.map((a, ai) => (
                          <div key={ai} style={{
                            background: GR + "11", border: `1px solid ${GR}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.name || a.title || `Article ${ai + 1}`}
                              </span>
                              {a.category && (
                                <span style={{ fontSize: 8, color: GR, border: `1px solid ${GR}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {a.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={a._score} max={maxKb} col={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {skill._cls === "UNDOCUMENTED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching intelligence reports or knowledge base articles found. This skill represents a capability intelligence gap — no operational documentation or knowledge base coverage exists.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No skills match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
