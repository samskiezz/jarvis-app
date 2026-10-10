/**
 * F234 — IntelProfile × Dataset × Scenario Threat Data Readiness Map (TDRMAP)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/datasets + /v1/scenario/list
 * and keyword-correlates each intel actor profile against datasets AND scenarios
 * to classify:
 *
 *   FULLY_MAPPED    — matched datasets + scenarios (actor has data grounding + scenario coverage)
 *   DATA_GROUNDED   — dataset match only (data link, no scenario)
 *   SCENARIO_BACKED — scenario match only (scenario link, no data)
 *   DARK            — neither match (actor intelligence blind spot)
 *
 * Stat tiles: INTEL PROFILES / DATASETS / SCENARIOS + four class counts + READINESS%.
 * Red badge on DARK count.
 * Filter tabs ALL / FULLY_MAPPED / DATA_GROUNDED / SCENARIO_BACKED / DARK + text search.
 * Expand profile → matched dataset cards (purple) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tdrmap-toggle event.
 *
 * Voice triggers:
 *   "tdrmap / threat data readiness / intel profile scenario / intel profile data /
 *    actor data readiness / dark actor readiness / profile scenario data / actor readiness map"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_072_280;
const Z_INDEX  = 293;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TDRMAP_RE = /\b(tdrmap|threat[\s-]data[\s-]readiness|intel[\s-]profile[\s-]scenario|intel[\s-]profile[\s-]data|actor[\s-]data[\s-]readiness|dark[\s-]actor[\s-]readiness|profile[\s-]scenario[\s-]data|actor[\s-]readiness[\s-]map)\b/i;

export function isTdrmapQuery(q = "") { return TDRMAP_RE.test(q); }

export async function buildTdrmapScript() {
  const base = apiBase();
  const [profRes, datRes, scnRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/v1/datasets`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const profiles  = profRes.status === "fulfilled" ? (profRes.value?.items  || profRes.value  || []) : [];
  const datasets  = datRes.status === "fulfilled"  ? (datRes.value?.items   || datRes.value   || []) : [];
  const scenarios = scnRes.status === "fulfilled"  ? (scnRes.value?.items   || scnRes.value?.scenarios || scnRes.value  || []) : [];

  let dark = 0, fullyMapped = 0;
  for (const p of profiles) {
    const kws = keywords(profileText(p));
    const hasData = datasets.some(d  => scoreText(datasetText(d),  kws) > 0);
    const hasScn  = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    if (hasData && hasScn) fullyMapped++;
    else if (!hasData && !hasScn) dark++;
  }
  const total      = profiles.length;
  const readinessPct = total ? Math.round((fullyMapped / total) * 100) : 0;
  return `TDRMAP Threat Data Readiness Map online, sir. I have cross-referenced ${total} intel actor profiles against ${datasets.length} datasets and ${scenarios.length} threat scenarios. ${fullyMapped} profiles achieve full readiness with both data grounding and scenario coverage — representing ${readinessPct}% mapped coverage. ${dark} profiles remain completely dark with no data or scenario linkage, creating critical actor intelligence blind spots. Recommend immediate data and scenario assignment for dark profiles, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const PU     = "#A855F7";
const TE     = "#14B8A6";
const BG     = "rgba(6,11,22,0.97)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:    TE,
  DATA_GROUNDED:   PU,
  SCENARIO_BACKED: CY,
  DARK:            RD,
};

const TABS = ["ALL", "FULLY_MAPPED", "DATA_GROUNDED", "SCENARIO_BACKED", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, p.tags, p.country, p.label, p.type].filter(Boolean).join(" ");
}
function datasetText(d) {
  return [d.name, d.title, d.description, d.tags, d.category, d.source, d.type].filter(Boolean).join(" ");
}
function scenarioText(s) {
  return [s.name, s.title, s.description, s.tags, s.type, s.category, s.objective].filter(Boolean).join(" ");
}

function classify(profile, datasets, scenarios) {
  const kws = keywords(profileText(profile));
  const matchedData = datasets
    .map(d => ({ ...d, _score: scoreText(datasetText(d), kws) }))
    .filter(d => d._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedScn = scenarios
    .map(s => ({ ...s, _score: scoreText(scenarioText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasData = matchedData.length > 0;
  const hasScn  = matchedScn.length > 0;
  let cls;
  if (hasData && hasScn)  cls = "FULLY_MAPPED";
  else if (hasData)        cls = "DATA_GROUNDED";
  else if (hasScn)         cls = "SCENARIO_BACKED";
  else                     cls = "DARK";
  return { ...profile, _cls: cls, _datasets: matchedData, _scenarios: matchedScn };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

export default function IntelProfileDataScenarioMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [profiles, setProfiles]     = useState([]);
  const [datasets, setDatasets]     = useState([]);
  const [scenarios, setScenarios]   = useState([]);
  const [classified, setClassified] = useState([]);
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [brief, setBrief]           = useState("");
  const [assessing, setAssessing]   = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [profRes, datRes, scnRes] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/v1/datasets`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      ]);
      const prof = profRes.status === "fulfilled" ? (profRes.value?.items  || profRes.value  || []) : [];
      const dat  = datRes.status  === "fulfilled" ? (datRes.value?.items   || datRes.value   || []) : [];
      const scn  = scnRes.status  === "fulfilled" ? (scnRes.value?.items   || scnRes.value?.scenarios || scnRes.value  || []) : [];
      setProfiles(prof);
      setDatasets(dat);
      setScenarios(scn);
      setClassified(prof.map(p => classify(p, dat, scn)));
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
    window.addEventListener("jarvis:tdrmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tdrmap-toggle", onToggle);
  }, []);

  const fullyMapped    = classified.filter(c => c._cls === "FULLY_MAPPED").length;
  const dataGrounded   = classified.filter(c => c._cls === "DATA_GROUNDED").length;
  const scenarioBacked = classified.filter(c => c._cls === "SCENARIO_BACKED").length;
  const dark           = classified.filter(c => c._cls === "DARK").length;
  const total          = classified.length;
  const readinessPct   = total ? Math.round((fullyMapped / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || profileText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `TDRMAP: ${total} intel profiles — FULLY_MAPPED: ${fullyMapped}, DATA_GROUNDED: ${dataGrounded}, SCENARIO_BACKED: ${scenarioBacked}, DARK: ${dark} (${readinessPct}% readiness). Datasets: ${datasets.length}. Scenarios: ${scenarios.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TDRMAP threat data readiness assessment. Context: ${ctx}. Provide a 2-sentence brief about which intel actor profiles represent the highest readiness gaps, and recommend immediate data or scenario assignment priorities. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Threat data readiness assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Threat Data Readiness Map (TDRMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {dark > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {dark}
          </span>
        )}
        ◈ TDRMAP
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ TDRMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          IntelProfile × Dataset × Scenario Threat Data Readiness Map
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
          ["INTEL PROFILES", total,          CY],
          ["DATASETS",       datasets.length, PU],
          ["SCENARIOS",      scenarios.length, TE],
          ["FULLY MAPPED",   fullyMapped,     TE],
          ["DATA GROUNDED",  dataGrounded,    PU],
          ["SCENARIO BACKED",scenarioBacked,  CY],
          ["DARK",           dark,            RD],
          ["READINESS%",     readinessPct + "%", AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
          READINESS COVERAGE — {readinessPct}%
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${readinessPct}%`, height: "100%",
            background: readinessPct >= 70 ? TE : readinessPct >= 40 ? AM : RD,
            transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontFamily: FONT, fontSize: 9, letterSpacing: 1,
              background: tab === t ? `${CLASS_COLOR[t] || CY}22` : "transparent",
              border: `1px solid ${tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA044"}`,
              color: tab === t ? (CLASS_COLOR[t] || CY) : "#6E8AA0",
              padding: "3px 8px", borderRadius: 3, cursor: "pointer",
            }}
          >
            {t}
            {t !== "ALL" && (
              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                {classified.filter(c => c._cls === t).length}
              </span>
            )}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search profiles…"
          style={{
            fontFamily: FONT, fontSize: 10, background: "rgba(0,207,255,0.06)",
            border: "1px solid rgba(0,207,255,0.2)", color: CY,
            padding: "3px 8px", borderRadius: 3, outline: "none", marginLeft: "auto", width: 180,
          }}
        />
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            fontFamily: FONT, fontSize: 10, letterSpacing: 1,
            background: assessing ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.15)",
            border: `1px solid ${RD}66`, color: RD,
            padding: "5px 14px", borderRadius: 4, cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, padding: "8px 12px", background: "rgba(239,68,68,0.07)",
            border: `1px solid ${RD}33`, borderRadius: 5, color: "#CBD5E1", fontSize: 11, lineHeight: 1.6,
          }}>
            {brief}
          </div>
        )}
      </div>

      {/* Profile list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "12px 0" }}>No profiles match current filter.</div>
        )}
        {visible.map((prof, idx) => {
          const isExp = expanded === idx;
          const cls   = prof._cls;
          const col   = CLASS_COLOR[cls];
          return (
            <div key={prof.id || prof.name || idx} style={{
              border: `1px solid ${col}33`,
              borderRadius: 5, overflow: "hidden",
            }}>
              <button
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", background: `${col}0A`,
                  padding: "7px 12px", cursor: "pointer",
                  fontFamily: FONT, border: "none", textAlign: "left",
                }}
              >
                <span style={{
                  background: `${col}22`, color: col, border: `1px solid ${col}44`,
                  borderRadius: 3, fontSize: 8, padding: "1px 5px", letterSpacing: 1,
                  whiteSpace: "nowrap",
                }}>
                  {cls}
                </span>
                <span style={{ color: "#CBD5E1", fontSize: 11, flex: 1 }}>
                  {prof.name || prof.title || "(unnamed actor)"}
                </span>
                {prof._datasets.length > 0 && (
                  <span style={{ color: PU, fontSize: 9 }}>{prof._datasets.length}dat</span>
                )}
                {prof._scenarios.length > 0 && (
                  <span style={{ color: CY, fontSize: 9 }}>{prof._scenarios.length}scn</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </button>

              {isExp && (
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {prof.description && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
                      {prof.description}
                    </div>
                  )}
                  {/* Datasets */}
                  {prof._datasets.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED DATASETS ({prof._datasets.length})
                      </div>
                      {prof._datasets.map((dat, i) => {
                        const maxScore = prof._datasets[0]._score || 1;
                        const pct = Math.round((dat._score / maxScore) * 100);
                        return (
                          <div key={dat.id || dat.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${PU}22`, color: PU,
                              border: `1px solid ${PU}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {dat.type || dat.category || "DATA"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {dat.name || dat.title || "(dataset)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: PU, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: PU, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Scenarios */}
                  {prof._scenarios.length > 0 && (
                    <div>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED SCENARIOS ({prof._scenarios.length})
                      </div>
                      {prof._scenarios.map((scn, i) => {
                        const maxScore = prof._scenarios[0]._score || 1;
                        const pct = Math.round((scn._score / maxScore) * 100);
                        return (
                          <div key={scn.id || scn.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${CY}22`, color: CY,
                              border: `1px solid ${CY}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {scn.type || scn.category || "SCN"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {scn.name || scn.title || "(scenario)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: CY, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {prof._datasets.length === 0 && prof._scenarios.length === 0 && (
                    <div style={{ color: "#6E8AA0", fontSize: 10 }}>No matched datasets or scenarios for this profile.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
