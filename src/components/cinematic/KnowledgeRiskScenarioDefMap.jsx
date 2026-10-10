/**
 * F225 — Knowledge × RiskSignal × Scenario Defensive Coverage Map (KRSDEF)
 *
 * Parallel-fetches /knowledge/ + /entities/RiskSignal + /v1/scenario/list
 * and keyword-correlates each KB article against risk signals AND scenarios:
 *
 *   FULLY_DEFENDED  — matched risk signal + scenario (full defensive coverage)
 *   THREAT_MAPPED   — matched risk signal only (threat awareness, no playbook)
 *   SCENARIO_BACKED — matched scenario only (playbook, no identified threat)
 *   UNDEFENDED      — no matches in either source (knowledge intelligence gap)
 *
 * Stat tiles: KB ARTICLES / RISK SIGNALS / SCENARIOS + four class counts + DEFENSE%.
 * Red badge on UNDEFENDED count.
 * Filter tabs ALL / FULLY_DEFENDED / THREAT_MAPPED / SCENARIO_BACKED / UNDEFENDED + text search.
 * Expand article → matched risk signal cards (red, severity badge) + scenario cards (cyan, type badge)
 *   with relevance bars.
 * ▶ ASSESS DEFENSIVE COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:krsdef-toggle event.
 *
 * Voice triggers:
 *   "krsdef / knowledge defense / defensive coverage / undefended knowledge /
 *    threat coverage knowledge / knowledge scenario defense"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_068_360;
const Z_INDEX  = 286;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const KRSDEF_RE = /\b(krsdef|knowledge[\s-]defense|defensive[\s-]coverage|undefended[\s-]knowledge|threat[\s-]coverage[\s-]knowledge|knowledge[\s-]scenario[\s-]defense)\b/i;

export function isKrsdefQuery(q = "") { return KRSDEF_RE.test(q); }

export async function buildKrsdefScript() {
  const base = apiBase();
  const [kbR, rsR, scR] = await Promise.allSettled([
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const articles  = kbR.status === "fulfilled" ? (kbR.value?.items || kbR.value?.articles || kbR.value || []) : [];
  const signals   = rsR.status === "fulfilled" ? (rsR.value?.items || rsR.value || []) : [];
  const scenarios = scR.status === "fulfilled" ? (scR.value?.items || scR.value || []) : [];

  let fullyDefended = 0, undefended = 0;
  for (const art of articles) {
    const kws    = keywords(articleText(art));
    const hasSig = signals.some(s => scoreText(signalText(s), kws) > 0);
    const hasSc  = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    if (hasSig && hasSc) fullyDefended++;
    else if (!hasSig && !hasSc) undefended++;
  }
  const total   = articles.length;
  const defPct  = total ? Math.round((fullyDefended / total) * 100) : 0;
  return `KRSDEF Defensive Coverage Map online, sir. I have cross-referenced ${total} knowledge base articles against ${signals.length} active risk signals and ${scenarios.length} scenario playbooks. ${fullyDefended} articles are fully defended with both threat signal and scenario playbook coverage, representing ${defPct}% defensive readiness. ${undefended} articles are completely undefended with no risk signal or scenario linkage, representing critical knowledge intelligence gaps where threat awareness and response planning are both absent, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const MG   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_DEFENDED:  GR,
  THREAT_MAPPED:   RD,
  SCENARIO_BACKED: CY,
  UNDEFENDED:      AM,
};

const TABS = ["ALL", "FULLY_DEFENDED", "THREAT_MAPPED", "SCENARIO_BACKED", "UNDEFENDED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function articleText(a) {
  return [a.title, a.content, a.summary, a.description, a.tags, a.category, a.name, a.body].filter(Boolean).join(" ");
}
function signalText(s) {
  return [s.title, s.name, s.description, s.type, s.source, s.tags, s.summary, s.category].filter(Boolean).join(" ");
}
function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.objective, s.summary].filter(Boolean).join(" ");
}

function classify(article, signals, scenarios) {
  const kws = keywords(articleText(article));
  const matchedSig = signals
    .map(s => ({ ...s, _score: scoreText(signalText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedSc = scenarios
    .map(s => ({ ...s, _score: scoreText(scenarioText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);

  const hasSig = matchedSig.length > 0;
  const hasSc  = matchedSc.length  > 0;

  let cls;
  if (hasSig && hasSc)       cls = "FULLY_DEFENDED";
  else if (hasSig && !hasSc) cls = "THREAT_MAPPED";
  else if (!hasSig && hasSc) cls = "SCENARIO_BACKED";
  else                       cls = "UNDEFENDED";

  return { ...article, _cls: cls, _sig: matchedSig, _sc: matchedSc };
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

export default function KnowledgeRiskScenarioDefMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [articles, setArticles] = useState([]);
  const [signals, setSignals]   = useState([]);
  const [scenarios, setScens]   = useState([]);
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
      const [kbR, rsR, scR] = await Promise.allSettled([
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      ]);
      const arts  = kbR.status === "fulfilled" ? (kbR.value?.items || kbR.value?.articles || kbR.value || []) : [];
      const sigs  = rsR.status === "fulfilled" ? (rsR.value?.items || rsR.value || []) : [];
      const sc    = scR.status === "fulfilled" ? (scR.value?.items || scR.value || []) : [];
      setArticles(arts);
      setSignals(sigs);
      setScens(sc);
      setClass(arts.map(a => classify(a, sigs, sc)));
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
    window.addEventListener("jarvis:krsdef-toggle", onToggle);
    return () => window.removeEventListener("jarvis:krsdef-toggle", onToggle);
  }, []);

  const fullyDefended  = classified.filter(c => c._cls === "FULLY_DEFENDED").length;
  const threatMapped   = classified.filter(c => c._cls === "THREAT_MAPPED").length;
  const scenarioBacked = classified.filter(c => c._cls === "SCENARIO_BACKED").length;
  const undefended     = classified.filter(c => c._cls === "UNDEFENDED").length;
  const total          = classified.length;
  const defPct         = total ? Math.round((fullyDefended / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || articleText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `KRSDEF: ${total} KB articles — FULLY_DEFENDED: ${fullyDefended}, THREAT_MAPPED: ${threatMapped}, SCENARIO_BACKED: ${scenarioBacked}, UNDEFENDED: ${undefended} (${defPct}% defense). Risk signals: ${signals.length}. Scenarios: ${scenarios.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `KRSDEF defensive coverage assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which undefended knowledge articles represent the most critical intelligence gaps and what risk signal or scenario linkages should be established to strengthen defensive coverage. Be concise and direct.` }),
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
        title="Knowledge × RiskSignal × Scenario Defensive Coverage Map (KRSDEF)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${MG}55`,
          color: MG, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {undefended > 0 && (
          <span style={{ background: RD, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {undefended}
          </span>
        )}
        ◈ KRSDEF
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
        <span style={{ color: MG, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ KRSDEF</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Knowledge × RiskSignal × Scenario — Defensive Coverage Map
        </span>
        {loading && <span style={{ color: MG, fontSize: 10 }}>◌ loading…</span>}
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
          ["KB ARTICLES",      total,          MG],
          ["RISK SIGNALS",     signals.length, RD],
          ["SCENARIOS",        scenarios.length, CY],
          ["FULLY DEFENDED",   fullyDefended,  GR],
          ["THREAT MAPPED",    threatMapped,   RD],
          ["SCENARIO BACKED",  scenarioBacked, CY],
          ["UNDEFENDED",       undefended,     AM],
          ["DEFENSE%",         defPct + "%",   defPct >= 70 ? GR : defPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(168,85,247,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 85, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Defense coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          DEFENSIVE COVERAGE — {defPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: defPct + "%",
            background: defPct >= 70 ? GR : defPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(MG), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS DEFENSIVE COVERAGE"}
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
            ...smallBtn(tab === t ? MG : "#4A6A80"),
            background: tab === t ? MG + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search articles…"
          style={{
            background: "rgba(168,85,247,0.05)", border: `1px solid ${MG}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} articles
        </span>
      </div>

      {/* Articles list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading articles…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((art, i) => {
            const col   = CLASS_COLOR[art._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxSig = art._sig[0]?._score || 1;
            const maxSc  = art._sc[0]?._score  || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(168,85,247,0.02)", overflow: "hidden",
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
                    {art._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {art.title || art.name || `Article ${i + 1}`}
                  </span>
                  {art.category && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{art.category}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(art.summary || art.description) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {art.summary || art.description}
                      </div>
                    )}

                    {/* Matched risk signals */}
                    {art._sig.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED RISK SIGNALS ({art._sig.length})
                        </div>
                        {art._sig.map((s, si) => (
                          <div key={si} style={{
                            background: RD + "11", border: `1px solid ${RD}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: RD, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.title || s.name || `Signal ${si + 1}`}
                              </span>
                              {s.severity && (
                                <span style={{ fontSize: 8, color: RD, border: `1px solid ${RD}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {s.severity}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={s._score} max={maxSig} col={RD} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched scenarios */}
                    {art._sc.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED SCENARIOS ({art._sc.length})
                        </div>
                        {art._sc.map((sc, sci) => (
                          <div key={sci} style={{
                            background: CY + "11", border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {sc.name || sc.title || `Scenario ${sci + 1}`}
                              </span>
                              {sc.type && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {sc.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={sc._score} max={maxSc} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {art._cls === "UNDEFENDED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching risk signals or scenario playbooks found. This knowledge article has no threat awareness or response planning coverage — a defensive intelligence gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No articles match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
