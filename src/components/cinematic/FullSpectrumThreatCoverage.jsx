/**
 * F100 — AIP Skill × IntelProfile × Ops Event × RiskSignal
 *         Full-Spectrum Threat Response Coverage (FSTRC)
 *
 * Parallel-fetches /v1/aip/skill + /entities/IntelProfile +
 *   /v1/ops/events + /entities/RiskSignal.
 * Keyword-correlates each skill against threat actors, ops events AND risk
 * signals to classify:
 *   FULLY_COUNTERED  (actor + ops + risk match)
 *   ACTOR_OPS        (actor + ops)
 *   ACTOR_RISK       (actor + risk)
 *   OPS_RISK         (ops + risk)
 *   PARTIAL          (exactly one source match)
 *   DORMANT          (no match at all)
 *
 * Red pulse badge on dormant count.
 * Stat tiles SKILLS / INTEL PROFILES / OPS EVENTS / RISK SIGNALS / all classes / COVERAGE%.
 * Filter tabs ALL/FULLY_COUNTERED/ACTOR_OPS/ACTOR_RISK/OPS_RISK/PARTIAL/DORMANT + text search.
 * Expand skill → matched intel profile cards (orange) + ops event cards (blue)
 *   + risk signal cards (red) with severity badge + relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "fstrc/full spectrum threat/threat response coverage/dormant skills threat/
 *   skill threat coverage/four source coverage/capability threat coverage/full coverage threat".
 * Event: jarvis:fstrc-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 998_920;
const Z_INDEX  = 162;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const FSTRC_RE = /\b(fstrc|full[\s-]spectrum[\s-]threat|threat[\s-]response[\s-]coverage|dormant[\s-]skills?[\s-]threat|skill[\s-]threat[\s-]coverage|four[\s-]source[\s-]coverage|capability[\s-]threat[\s-]coverage|full[\s-]coverage[\s-]threat|full[\s-]spectrum[\s-]coverage)\b/i;

const CY = "#00CFFF";
const GR = "#22C55E";
const AM = "#F59E0B";
const OR = "#F97316";
const BL = "#3B82F6";
const RD = "#EF4444";
const PU = "#A855F7";
const GO = "#EAB308";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_COUNTERED: GR,
  ACTOR_OPS:       CY,
  ACTOR_RISK:      OR,
  OPS_RISK:        BL,
  PARTIAL:         AM,
  DORMANT:         RD,
};

const TABS = ["ALL","FULLY_COUNTERED","ACTOR_OPS","ACTOR_RISK","OPS_RISK","PARTIAL","DORMANT"];
const TAB_LABELS = {
  ALL:             "ALL",
  FULLY_COUNTERED: "FULLY COUNTERED",
  ACTOR_OPS:       "ACTOR + OPS",
  ACTOR_RISK:      "ACTOR + RISK",
  OPS_RISK:        "OPS + RISK",
  PARTIAL:         "PARTIAL",
  DORMANT:         "DORMANT",
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isFstrcQuery(text) {
  return FSTRC_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function skillStr(sk) {
  return [sk.name, sk.description, sk.type, sk.category,
    (sk.tags || []).join(" "), (sk.capabilities || []).join(" ")].join(" ");
}

function actorStr(a) {
  return [a.name, a.role, a.org, a.aliases, a.description,
    (a.tags || []).join(" ")].join(" ");
}

function opsStr(e) {
  return [e.title, e.description, e.type, e.category,
    (e.tags || []).join(" ")].join(" ");
}

function riskStr(r) {
  return [r.title, r.description, r.type, r.category,
    (r.tags || []).join(" ")].join(" ");
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [skillRaw, actorRaw, opsRaw, riskRaw] = await Promise.all([
    fetch(`${base}/v1/aip/skill`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()),
  ]);
  const skills  = norm(skillRaw,  ["skills","items","data","results"]);
  const actors  = norm(actorRaw,  ["intel_profiles","profiles","items","data","results"]);
  const events  = norm(opsRaw,    ["events","items","data","results"]);
  const signals = norm(riskRaw,   ["risk_signals","signals","items","data","results"]);
  return { skills, actors, events, signals };
}

function classify(skills, actors, events, signals) {
  return skills.map(sk => {
    const ss = skillStr(sk);
    const actorMatches  = actors.map(a  => ({ ...a,  rel: overlap(ss, actorStr(a))  })).filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0,4);
    const opsMatches    = events.map(e  => ({ ...e,  rel: overlap(ss, opsStr(e))    })).filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0,4);
    const riskMatches   = signals.map(r => ({ ...r,  rel: overlap(ss, riskStr(r))   })).filter(x => x.rel >= THRESHOLD).sort((a,b) => b.rel - a.rel).slice(0,4);
    const hasActor = actorMatches.length > 0;
    const hasOps   = opsMatches.length > 0;
    const hasRisk  = riskMatches.length > 0;
    const matchCount = (hasActor ? 1 : 0) + (hasOps ? 1 : 0) + (hasRisk ? 1 : 0);
    let cls;
    if (hasActor && hasOps && hasRisk)    cls = "FULLY_COUNTERED";
    else if (hasActor && hasOps)          cls = "ACTOR_OPS";
    else if (hasActor && hasRisk)         cls = "ACTOR_RISK";
    else if (hasOps && hasRisk)           cls = "OPS_RISK";
    else if (matchCount === 1)            cls = "PARTIAL";
    else                                  cls = "DORMANT";
    return { ...sk, cls, actorMatches, opsMatches, riskMatches };
  });
}

export async function buildFstrcScript() {
  const { skills, actors, events, signals } = await fetchAll();
  const classified = classify(skills, actors, events, signals);
  const total    = classified.length;
  const fully    = classified.filter(s => s.cls === "FULLY_COUNTERED").length;
  const dormant  = classified.filter(s => s.cls === "DORMANT").length;
  const partial  = classified.filter(s => s.cls === "PARTIAL").length;
  const covered  = total - dormant;
  const covPct   = total ? Math.round((covered / total) * 100) : 0;
  return `Full-Spectrum Threat Response Coverage online, sir. Cross-referencing ${total} AIP skills against ${actors.length} intel profiles, ${events.length} ops events, and ${signals.length} risk signals. ${fully} skills are fully countered with all three threat-source correlations. ${dormant} skills are completely dormant — no threat actor, operational event, or risk signal correlation found, leaving ${100 - covPct}% of the capability stack unlinked to active threats. ${partial} skills have only partial single-source coverage. Recommend urgent threat-mapping review for all dormant skills.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function FullSpectrumThreatCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessTxt, setAssessTxt] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { skills, actors, events, signals } = await fetchAll();
      setData({
        rows:        classify(skills, actors, events, signals),
        actorCount:  actors.length,
        opsCount:    events.length,
        riskCount:   signals.length,
      });
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:fstrc-toggle", handler);
    return () => window.removeEventListener("jarvis:fstrc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  /* ── collapsed button ── */
  if (!open) {
    const dormantCount = data?.rows?.filter(r => r.cls === "DORMANT").length || 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="AIP Skill × IntelProfile × Ops Event × RiskSignal Full-Spectrum Threat Response Coverage (FSTRC)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${PU}55`,
          color: PU, fontFamily: FONT, fontSize: 10, padding: "4px 10px",
          borderRadius: 6, cursor: "pointer", letterSpacing: 1,
          boxShadow: dormantCount > 0
            ? `0 0 14px ${RD}66, 0 0 0 0 ${RD}88`
            : "none",
          animation: dormantCount > 0 ? "fstrc-pulse 2s ease-in-out infinite" : "none",
        }}>
        ◈ FSTRC
        {dormantCount > 0 && (
          <span style={{ marginLeft: 6, color: RD, fontWeight: 700 }}>{dormantCount}</span>
        )}
        <style>{`@keyframes fstrc-pulse{0%,100%{box-shadow:0 0 14px ${RD}66}50%{box-shadow:0 0 28px ${RD}cc}}`}</style>
      </button>
    );
  }

  const rows     = data?.rows || [];
  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.name || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.category || "").toLowerCase().includes(s) ||
             (r.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const total   = rows.length;
  const fully   = rows.filter(r => r.cls === "FULLY_COUNTERED").length;
  const aops    = rows.filter(r => r.cls === "ACTOR_OPS").length;
  const arisk   = rows.filter(r => r.cls === "ACTOR_RISK").length;
  const orisk   = rows.filter(r => r.cls === "OPS_RISK").length;
  const partial = rows.filter(r => r.cls === "PARTIAL").length;
  const dormant = rows.filter(r => r.cls === "DORMANT").length;
  const covPct  = total ? Math.round(((total - dormant) / total) * 100) : 0;

  async function assess() {
    setAssessing(true); setAssessTxt("");
    try {
      const ctx = `${total} skills: ${fully} fully countered, ${aops} actor+ops, ${arisk} actor+risk, ${orisk} ops+risk, ${partial} partial, ${dormant} dormant. Intel profiles: ${data?.actorCount}. Ops events: ${data?.opsCount}. Risk signals: ${data?.riskCount}. Coverage: ${covPct}%.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Full-spectrum threat response coverage assessment: ${ctx} Give a 2-sentence executive brief on dormant capabilities and recommended threat-mapping actions.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessTxt(txt);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt, voice: "ash" }),
      }).then(async res => {
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const ac = new (window.AudioContext || window.webkitAudioContext)();
          const buf = await ac.decodeAudioData(ab);
          const src = ac.createBufferSource(); src.buffer = buf;
          src.connect(ac.destination); src.start();
        }
      }).catch(() => {});
    } catch (e) {
      setAssessTxt("Assessment unavailable: " + e.message);
    }
    setAssessing(false);
  }

  function toggle(id) {
    setExpanded(x => ({ ...x, [id]: !x[id] }));
  }

  const clsBadge = (cls) => (
    <span style={{
      fontSize: 9, padding: "2px 6px", borderRadius: 4,
      background: `${CLASS_COLOR[cls]}22`, color: CLASS_COLOR[cls],
      border: `1px solid ${CLASS_COLOR[cls]}55`, marginLeft: 8, letterSpacing: 1,
    }}>
      {TAB_LABELS[cls] || cls}
    </span>
  );

  const sevBadge = (sev) => {
    const c = sev === "critical" ? RD : sev === "high" ? OR : sev === "medium" ? AM : "#6E8AA0";
    return (
      <span style={{
        fontSize: 9, padding: "1px 5px", borderRadius: 3,
        background: `${c}22`, color: c, border: `1px solid ${c}44`, marginLeft: 6,
      }}>
        {(sev || "").toUpperCase()}
      </span>
    );
  };

  const relBar = (rel, color) => (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 3, height: 4, marginTop: 3, flex: 1 }}>
      <div style={{ width: `${Math.min(100, Math.round(rel * 100))}%`, height: "100%",
        background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );

  /* ── coverage bar ── */
  const CovBar = () => (
    <div style={{ padding: "4px 18px 8px", display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: "#6E8AA0", fontSize: 10, whiteSpace: "nowrap" }}>COVERAGE</span>
      <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6 }}>
        <div style={{ width: `${covPct}%`, height: "100%", borderRadius: 4,
          background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD,
          transition: "width 0.5s", boxShadow: covPct < 40 ? `0 0 8px ${RD}` : "none" }} />
      </div>
      <span style={{ color: covPct >= 70 ? GR : covPct >= 40 ? AM : RD, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
        {covPct}%
      </span>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z_INDEX + 1000, background: "rgba(2,4,8,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(1040px,96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        background: BG, border: `1px solid ${PU}44`, borderRadius: 14,
        boxShadow: `0 0 80px ${PU}18`, fontFamily: FONT, overflow: "hidden",
      }}>

        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: PU, fontSize: 13, letterSpacing: 2 }}>◈ FSTRC</span>
          <span style={{ color: "#6E8AA0", fontSize: 11 }}>
            AIP Skill × IntelProfile × Ops Event × RiskSignal — Full-Spectrum Threat Response Coverage
          </span>
          <button
            onClick={() => setOpen(false)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}>
            ✕
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" }}>
          {[
            ["SKILLS",          total,               PU],
            ["INTEL PROFILES",  data?.actorCount ?? "—", OR],
            ["OPS EVENTS",      data?.opsCount    ?? "—", BL],
            ["RISK SIGNALS",    data?.riskCount   ?? "—", RD],
            ["FULLY COUNTERED", fully,               GR],
            ["ACTOR + OPS",     aops,                CY],
            ["ACTOR + RISK",    arisk,               OR],
            ["OPS + RISK",      orisk,               BL],
            ["PARTIAL",         partial,             AM],
            ["DORMANT",         dormant,             RD],
          ].map(([label, val, color]) => (
            <div key={label} style={{
              flex: "1 1 80px", background: `${color}11`, border: `1px solid ${color}33`,
              borderRadius: 8, padding: "6px 10px", textAlign: "center",
            }}>
              <div style={{ color: color, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        <CovBar />

        {/* Filter controls */}
        <div style={{ display: "flex", gap: 6, padding: "0 18px 8px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "3px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer", letterSpacing: 1,
              background: tab === t ? `${PU}22` : "transparent",
              border: `1px solid ${tab === t ? PU : "#2A3A4A"}`,
              color: tab === t ? PU : "#6E8AA0",
            }}>{TAB_LABELS[t]}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search skills…"
            style={{
              marginLeft: "auto", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${BORDER}`, borderRadius: 6,
              color: "#DCEBF5", fontFamily: FONT, fontSize: 11,
              padding: "4px 10px", width: 200,
            }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
          {err  && <div style={{ color: RD, padding: 12, fontSize: 12 }}>Error: {err}</div>}
          {!data && !err && <div style={{ color: "#6E8AA0", padding: 12, fontSize: 12 }}>Loading…</div>}

          {filtered.map((sk, idx) => {
            const id = sk.id || sk._id || idx;
            const isExp = !!expanded[id];
            return (
              <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, padding: "8px 0" }}>
                <div onClick={() => toggle(id)} style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▼" : "▶"}</span>
                  <span style={{ color: PU, fontSize: 12, flex: 1 }}>{sk.name || "Unknown Skill"}</span>
                  {sk.type     && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{sk.type}</span>}
                  {sk.category && <span style={{ fontSize: 10, color: CY }}>{sk.category}</span>}
                  {clsBadge(sk.cls)}
                </div>

                {isExp && (
                  <div style={{ marginTop: 8, paddingLeft: 16 }}>
                    {/* Intel profiles */}
                    {sk.actorMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: OR, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                          INTEL PROFILES ({sk.actorMatches.length})
                        </div>
                        {sk.actorMatches.map((a, i) => (
                          <div key={i} style={{ background: `${OR}09`, border: `1px solid ${OR}22`, borderRadius: 6, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: "#DCEBF5", fontSize: 11 }}>{a.name || "Actor"}</span>
                              {a.role && <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 6 }}>{a.role}</span>}
                            </div>
                            {relBar(a.rel, OR)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ops events */}
                    {sk.opsMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                          OPS EVENTS ({sk.opsMatches.length})
                        </div>
                        {sk.opsMatches.map((e, i) => (
                          <div key={i} style={{ background: `${BL}09`, border: `1px solid ${BL}22`, borderRadius: 6, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ color: "#DCEBF5", fontSize: 11 }}>{e.title || e.type || "Event"}</div>
                            {relBar(e.rel, BL)}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Risk signals */}
                    {sk.riskMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: RD, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>
                          RISK SIGNALS ({sk.riskMatches.length})
                        </div>
                        {sk.riskMatches.map((r, i) => (
                          <div key={i} style={{ background: `${RD}09`, border: `1px solid ${RD}22`, borderRadius: 6, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ color: "#DCEBF5", fontSize: 11 }}>{r.title || "Signal"}</span>
                              {r.severity && sevBadge(r.severity)}
                            </div>
                            {relBar(r.rel, RD)}
                          </div>
                        ))}
                      </div>
                    )}

                    {sk.actorMatches.length === 0 && sk.opsMatches.length === 0 && sk.riskMatches.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>No threat-source correlations found for this skill.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {data && filtered.length === 0 && (
            <div style={{ color: "#6E8AA0", padding: 12, fontSize: 12 }}>No results for current filter.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <button
            onClick={assess}
            disabled={assessing || !data}
            style={{
              background: assessing ? "rgba(255,255,255,0.04)" : `${PU}22`,
              border: `1px solid ${PU}55`, color: PU, fontFamily: FONT,
              fontSize: 11, padding: "5px 14px", borderRadius: 6,
              cursor: assessing ? "not-allowed" : "pointer",
              letterSpacing: 1, whiteSpace: "nowrap",
            }}>
            {assessing ? "…" : "▶ ASSESS COVERAGE"}
          </button>
          {assessTxt && (
            <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1 }}>{assessTxt}</div>
          )}
        </div>
      </div>
    </div>
  );
}
