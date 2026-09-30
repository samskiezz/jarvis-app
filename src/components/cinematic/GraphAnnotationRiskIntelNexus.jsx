/**
 * F215 — Graph Annotation × RiskSignal × IntelProfile Risk Attribution Nexus (ARBNEX)
 *
 * Parallel-fetches /v1/graph/annotations + /entities/RiskSignal + /entities/IntelProfile
 * and keyword-correlates each graph annotation against risk signals AND intel actor
 * profiles to classify:
 *
 *   THREAT_ATTRIBUTED — matched risk signal + intel profile (attributed threat annotation)
 *   RISK_ONLY         — risk signal match only (risk-flagged, no actor context)
 *   ACTOR_ONLY        — intel profile match only (actor-aware, no risk signal)
 *   UNATTRIBUTED      — neither match (annotation with no risk or actor attribution)
 *
 * Stat tiles: ANNOTATIONS / RISK SIGNALS / INTEL PROFILES + four class counts + ATTRIB%.
 * Red badge on UNATTRIBUTED count.
 * Filter tabs ALL / THREAT_ATTRIBUTED / RISK_ONLY / ACTOR_ONLY / UNATTRIBUTED + text search.
 * Expand annotation → matched risk signal cards (red) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS ATTRIBUTION → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:arbnex-toggle event.
 *
 * Voice triggers:
 *   "arbnex / annotation risk / attributed annotation / unattributed annotation /
 *    risk annotation / graph annotation risk / actor annotation"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_062_760;
const Z_INDEX  = 276;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const ARBNEX_RE = /\b(arbnex|annotation[\s-]risk|attributed[\s-]annotation|unattributed[\s-]annotation|risk[\s-]annotation|graph[\s-]annotation[\s-]risk|actor[\s-]annotation)\b/i;

export function isArbnexQuery(q = "") { return ARBNEX_RE.test(q); }

export async function buildArbnexScript() {
  const base = apiBase();
  const [annotRes, riskRes, profileRes] = await Promise.allSettled([
    fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const annotations = annotRes.status   === "fulfilled" ? (annotRes.value?.items   || annotRes.value   || []) : [];
  const risks       = riskRes.status    === "fulfilled" ? (riskRes.value?.items    || riskRes.value    || []) : [];
  const profiles    = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];

  let threatAttributed = 0, unattributed = 0;
  for (const ann of annotations) {
    const kws = keywords(annotationText(ann));
    const hasRisk    = risks.some(r    => scoreText(riskText(r),    kws) > 0);
    const hasProfile = profiles.some(p => scoreText(profileText(p), kws) > 0);
    if (hasRisk && hasProfile) threatAttributed++;
    else if (!hasRisk && !hasProfile) unattributed++;
  }
  const total   = annotations.length;
  const attPct  = total ? Math.round((threatAttributed / total) * 100) : 0;
  return `ARBNEX Graph Annotation Risk Attribution Nexus online, sir. I have cross-referenced ${total} graph annotations against ${risks.length} active risk signals and ${profiles.length} intel actor profiles. ${threatAttributed} annotations carry full threat attribution — both a risk signal and an actor profile aligned — representing ${attPct}% attribution coverage. ${unattributed} annotations remain completely unattributed with no risk or actor context, requiring immediate intelligence triage, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const OR   = "#F97316";
const PU   = "#A855F7";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  THREAT_ATTRIBUTED: RD,
  RISK_ONLY:         AM,
  ACTOR_ONLY:        OR,
  UNATTRIBUTED:      "#6E8AA0",
};

const TABS = ["ALL", "THREAT_ATTRIBUTED", "RISK_ONLY", "ACTOR_ONLY", "UNATTRIBUTED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function annotationText(a) {
  return [a.label, a.note, a.text, a.content, a.body, a.description, a.type, a.tags, a.entity_id, a.node_id, a.target].filter(Boolean).join(" ");
}
function riskText(r) {
  return [r.name, r.title, r.description, r.type, r.tags, r.category, r.signal, r.indicator, r.label].filter(Boolean).join(" ");
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, p.tags, p.country, p.label].filter(Boolean).join(" ");
}

function classify(ann, risks, profiles) {
  const kws = keywords(annotationText(ann));
  const matchedRisks = risks
    .map(r => ({ ...r, _score: scoreText(riskText(r), kws) }))
    .filter(r => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedProfiles = profiles
    .map(p => ({ ...p, _score: scoreText(profileText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasRisk    = matchedRisks.length > 0;
  const hasProfile = matchedProfiles.length > 0;
  let cls;
  if (hasRisk && hasProfile)   cls = "THREAT_ATTRIBUTED";
  else if (hasRisk)            cls = "RISK_ONLY";
  else if (hasProfile)         cls = "ACTOR_ONLY";
  else                         cls = "UNATTRIBUTED";
  return { ...ann, _cls: cls, _risks: matchedRisks, _profiles: matchedProfiles };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

export default function GraphAnnotationRiskIntelNexus() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [risks, setRisks]           = useState([]);
  const [profiles, setProfiles]     = useState([]);
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
      const [annotRes, riskRes, profileRes] = await Promise.allSettled([
        fetch(`${base}/v1/graph/annotations`).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const a  = annotRes.status   === "fulfilled" ? (annotRes.value?.items   || annotRes.value   || []) : [];
      const rs = riskRes.status    === "fulfilled" ? (riskRes.value?.items    || riskRes.value    || []) : [];
      const pr = profileRes.status === "fulfilled" ? (profileRes.value?.items || profileRes.value || []) : [];
      setAnnotations(a);
      setRisks(rs);
      setProfiles(pr);
      setClassified(a.map(ann => classify(ann, rs, pr)));
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
    window.addEventListener("jarvis:arbnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:arbnex-toggle", onToggle);
  }, []);

  const threatAttributed = classified.filter(c => c._cls === "THREAT_ATTRIBUTED").length;
  const riskOnly         = classified.filter(c => c._cls === "RISK_ONLY").length;
  const actorOnly        = classified.filter(c => c._cls === "ACTOR_ONLY").length;
  const unattributed     = classified.filter(c => c._cls === "UNATTRIBUTED").length;
  const total            = classified.length;
  const attPct           = total ? Math.round((threatAttributed / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || annotationText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `ARBNEX: ${total} graph annotations — THREAT_ATTRIBUTED: ${threatAttributed}, RISK_ONLY: ${riskOnly}, ACTOR_ONLY: ${actorOnly}, UNATTRIBUTED: ${unattributed} (${attPct}% attributed). Risk Signals: ${risks.length}. Intel Profiles: ${profiles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `ARBNEX graph annotation risk attribution assessment. Context: ${ctx}. Provide a 2-sentence brief on which unattributed annotations pose the greatest risk intelligence gap and recommend immediate attribution action. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Attribution assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Graph Annotation Risk Attribution Nexus (ARBNEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${RD}55`,
          color: RD, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unattributed > 0 && (
          <span style={{ background: RD, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unattributed}
          </span>
        )}
        ◈ ARBNEX
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
        <span style={{ color: RD, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ ARBNEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Graph Annotation × RiskSignal × IntelProfile Risk Attribution Nexus
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
          ["ANNOTATIONS",       total,            CY],
          ["RISK SIGNALS",      risks.length,     RD],
          ["INTEL PROFILES",    profiles.length,  OR],
          ["THREAT ATTRIBUTED", threatAttributed, RD],
          ["RISK ONLY",         riskOnly,         AM],
          ["ACTOR ONLY",        actorOnly,        OR],
          ["UNATTRIBUTED",      unattributed,     "#6E8AA0"],
          ["ATTRIB%",           attPct + "%",     attPct >= 60 ? GR : attPct >= 30 ? AM : RD],
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
          THREAT ATTRIBUTION COVERAGE — {attPct}%
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${attPct}%`, height: "100%",
            background: attPct >= 60 ? GR : attPct >= 30 ? AM : RD,
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
          placeholder="search annotations…"
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
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS ATTRIBUTION"}
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

      {/* Annotation list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "12px 0" }}>No annotations match current filter.</div>
        )}
        {visible.map((ann, idx) => {
          const isExp = expanded === idx;
          const cls   = ann._cls;
          const col   = CLASS_COLOR[cls];
          return (
            <div key={ann.id || ann.label || idx} style={{
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
                  {ann.label || ann.note || ann.text || ann.entity_id || "(annotation)"}
                </span>
                {ann._risks.length > 0 && (
                  <span style={{ color: RD, fontSize: 9 }}>{ann._risks.length}rs</span>
                )}
                {ann._profiles.length > 0 && (
                  <span style={{ color: OR, fontSize: 9 }}>{ann._profiles.length}ip</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </button>

              {isExp && (
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {(ann.description || ann.content || ann.body) && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
                      {ann.description || ann.content || ann.body}
                    </div>
                  )}
                  {/* Risk Signals */}
                  {ann._risks.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: RD, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED RISK SIGNALS ({ann._risks.length})
                      </div>
                      {ann._risks.map((rs, i) => {
                        const maxScore = ann._risks[0]._score || 1;
                        const pct = Math.round((rs._score / maxScore) * 100);
                        return (
                          <div key={rs.id || rs.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${RD}22`, color: RD,
                              border: `1px solid ${RD}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {rs.type || rs.category || "RISK"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {rs.name || rs.title || rs.signal || "(risk signal)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: RD, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: RD, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Intel Profiles */}
                  {ann._profiles.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED INTEL PROFILES ({ann._profiles.length})
                      </div>
                      {ann._profiles.map((pr, i) => {
                        const maxScore = ann._profiles[0]._score || 1;
                        const pct = Math.round((pr._score / maxScore) * 100);
                        return (
                          <div key={pr.id || pr.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${OR}22`, color: OR,
                              border: `1px solid ${OR}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {pr.role || pr.type || "ACTOR"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {pr.name || pr.title || "(actor)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: OR, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: OR, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {ann._risks.length === 0 && ann._profiles.length === 0 && (
                    <div style={{ color: "#6E8AA0", fontSize: 10 }}>No matched risk signals or intel profiles for this annotation.</div>
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
