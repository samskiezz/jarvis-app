/**
 * F216 — Task × Report × Knowledge Action Intelligence Readiness Map (TRKARM)
 *
 * Parallel-fetches /entities/Task + /v1/reports + /knowledge/ and keyword-correlates
 * each task against intelligence reports AND KB articles to classify:
 *
 *   FULLY_INFORMED  — matched report + KB article (task has full intel backing)
 *   REPORT_ONLY     — report match only (documented but no KB context)
 *   KNOWLEDGE_ONLY  — KB article match only (KB-guided but no formal report)
 *   BLIND           — neither match (task with no intelligence backing)
 *
 * Stat tiles: TASKS / REPORTS / KB ARTICLES + four class counts + INFORMED%.
 * Amber badge on BLIND count.
 * Filter tabs ALL / FULLY_INFORMED / REPORT_ONLY / KNOWLEDGE_ONLY / BLIND + text search.
 * Expand task → matched report cards (purple) + KB article cards (green) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:trkarm-toggle event.
 *
 * Voice triggers:
 *   "trkarm / task intel readiness / task report knowledge /
 *    blind tasks / task action readiness / task intelligence map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_063_320;
const Z_INDEX  = 277;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TRKARM_RE = /\b(trkarm|task[\s-]intel[\s-]readiness|task[\s-]report[\s-]knowledge|blind[\s-]tasks|task[\s-]action[\s-]readiness|task[\s-]intelligence[\s-]map)\b/i;

export function isTrkarmQuery(q = "") { return TRKARM_RE.test(q); }

export async function buildTrkarmScript() {
  const base = apiBase();
  const [taskRes, rptRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/entities/Task`).then(r => r.json()),
    fetch(`${base}/v1/reports`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const tasks   = taskRes.status === "fulfilled" ? (taskRes.value?.items   || taskRes.value   || []) : [];
  const reports = rptRes.status  === "fulfilled" ? (rptRes.value?.items    || rptRes.value    || []) : [];
  const kb      = kbRes.status   === "fulfilled" ? (kbRes.value?.items     || kbRes.value     || []) : [];

  let fullyInformed = 0, blind = 0;
  for (const t of tasks) {
    const kws      = keywords(taskText(t));
    const hasRpt   = reports.some(r => scoreText(reportText(r), kws) > 0);
    const hasKb    = kb.some(k => scoreText(kbText(k), kws) > 0);
    if (hasRpt && hasKb) fullyInformed++;
    else if (!hasRpt && !hasKb) blind++;
  }
  const total       = tasks.length;
  const informedPct = total ? Math.round((fullyInformed / total) * 100) : 0;
  return `TRKARM Task Action Intelligence Readiness Map online, sir. I have cross-referenced ${total} active tasks against ${reports.length} intelligence reports and ${kb.length} knowledge base articles. ${fullyInformed} tasks carry full intelligence backing — both a formal report and a KB article aligned — representing ${informedPct}% task readiness coverage. ${blind} tasks remain completely blind with no intelligence context, requiring immediate briefing before execution, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_INFORMED: GR,
  REPORT_ONLY:    PU,
  KNOWLEDGE_ONLY: CY,
  BLIND:          "#6E8AA0",
};

const TABS = ["ALL", "FULLY_INFORMED", "REPORT_ONLY", "KNOWLEDGE_ONLY", "BLIND"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function taskText(t) {
  return [t.name, t.title, t.description, t.type, t.tags, t.priority, t.status, t.category, t.label].filter(Boolean).join(" ");
}
function reportText(r) {
  return [r.name, r.title, r.description, r.type, r.tags, r.author, r.category, r.summary].filter(Boolean).join(" ");
}
function kbText(k) {
  return [k.name, k.title, k.content, k.summary, k.tags, k.category, k.topic, k.keywords].filter(Boolean).join(" ");
}

function classify(task, reports, kb) {
  const kws          = keywords(taskText(task));
  const matchedRpts  = reports
    .map(r => ({ ...r, _score: scoreText(reportText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedKb    = kb
    .map(k => ({ ...k, _score: scoreText(kbText(k), kws) }))
    .filter(k => k._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasRpt       = matchedRpts.length > 0;
  const hasKb        = matchedKb.length > 0;
  let cls;
  if (hasRpt && hasKb)   cls = "FULLY_INFORMED";
  else if (hasRpt)       cls = "REPORT_ONLY";
  else if (hasKb)        cls = "KNOWLEDGE_ONLY";
  else                   cls = "BLIND";
  return { ...task, _cls: cls, _reports: matchedRpts, _kb: matchedKb };
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

export default function TaskReportKnowledgeReadiness() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tasks, setTasks]     = useState([]);
  const [reports, setReports] = useState([]);
  const [kb, setKb]           = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [taskRes, rptRes, kbRes] = await Promise.allSettled([
        fetch(`${base}/entities/Task`).then(r => r.json()),
        fetch(`${base}/v1/reports`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const t  = taskRes.status === "fulfilled" ? (taskRes.value?.items || taskRes.value || []) : [];
      const rp = rptRes.status  === "fulfilled" ? (rptRes.value?.items  || rptRes.value  || []) : [];
      const kv = kbRes.status   === "fulfilled" ? (kbRes.value?.items   || kbRes.value   || []) : [];
      setTasks(t);
      setReports(rp);
      setKb(kv);
      setClassified(t.map(task => classify(task, rp, kv)));
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
    window.addEventListener("jarvis:trkarm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:trkarm-toggle", onToggle);
  }, []);

  const fullyInformed  = classified.filter(c => c._cls === "FULLY_INFORMED").length;
  const reportOnly     = classified.filter(c => c._cls === "REPORT_ONLY").length;
  const knowledgeOnly  = classified.filter(c => c._cls === "KNOWLEDGE_ONLY").length;
  const blind          = classified.filter(c => c._cls === "BLIND").length;
  const total          = classified.length;
  const informedPct    = total ? Math.round((fullyInformed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || taskText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `TRKARM: ${total} tasks — FULLY_INFORMED: ${fullyInformed}, REPORT_ONLY: ${reportOnly}, KNOWLEDGE_ONLY: ${knowledgeOnly}, BLIND: ${blind} (${informedPct}% readiness). Reports: ${reports.length}. KB articles: ${kb.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TRKARM task intelligence readiness assessment. Context: ${ctx}. Provide a 2-sentence brief on which blind tasks pose the greatest operational risk and recommend immediate intelligence briefing priorities. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Readiness assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Task × Report × Knowledge Action Intelligence Readiness Map (TRKARM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {blind > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {blind}
          </span>
        )}
        ◈ TRKARM
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
        <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ TRKARM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Task × Report × Knowledge Action Intelligence Readiness Map
        </span>
        {loading && <span style={{ color: AM, fontSize: 10 }}>◌ loading…</span>}
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
          ["TASKS",           total,         CY],
          ["REPORTS",         reports.length, PU],
          ["KB ARTICLES",     kb.length,     GR],
          ["FULLY INFORMED",  fullyInformed, GR],
          ["REPORT ONLY",     reportOnly,    PU],
          ["KNOWLEDGE ONLY",  knowledgeOnly, CY],
          ["BLIND",           blind,         "#6E8AA0"],
          ["INFORMED%",       informedPct + "%", informedPct >= 60 ? GR : informedPct >= 30 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          TASK READINESS COVERAGE — {informedPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: informedPct + "%",
            background: informedPct >= 60 ? GR : informedPct >= 30 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(AM), fontSize: 11, padding: "4px 12px",
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
            ...smallBtn(tab === t ? AM : "#4A6A80"),
            background: tab === t ? AM + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 160,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} tasks
        </span>
      </div>

      {/* Task list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading tasks…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((c, i) => {
            const col      = CLASS_COLOR[c._cls] || "#6E8AA0";
            const isExp    = expanded === i;
            const maxRpt   = c._reports[0]?._score || 1;
            const maxKb    = c._kb[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(0,207,255,0.02)", overflow: "hidden",
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    fontSize: 9, letterSpacing: 1, color: col,
                    border: `1px solid ${col}55`, borderRadius: 3, padding: "1px 5px",
                    whiteSpace: "nowrap",
                  }}>
                    {c._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.title || c.description || `Task ${i + 1}`}
                  </span>
                  {c.priority && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{c.priority}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {c.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 8, lineHeight: 1.4 }}>
                        {c.description}
                      </div>
                    )}

                    {/* Matched reports */}
                    {c._reports.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED REPORTS ({c._reports.length})
                        </div>
                        {c._reports.map((r, ri) => (
                          <div key={ri} style={{
                            background: PU + "11", border: `1px solid ${PU}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: PU, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.title || r.name || `Report ${ri + 1}`}
                              </span>
                              {r.type && (
                                <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {r.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={r._score} max={maxRpt} col={PU} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {c._kb.length > 0 && (
                      <div>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KB ARTICLES ({c._kb.length})
                        </div>
                        {c._kb.map((k, ki) => (
                          <div key={ki} style={{
                            background: GR + "11", border: `1px solid ${GR}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {k.title || k.name || `Article ${ki + 1}`}
                              </span>
                              {k.category && (
                                <span style={{ fontSize: 8, color: GR, border: `1px solid ${GR}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {k.category}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={k._score} max={maxKb} col={GR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {c._cls === "BLIND" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching reports or KB articles found. Task requires intelligence briefing.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No tasks match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
