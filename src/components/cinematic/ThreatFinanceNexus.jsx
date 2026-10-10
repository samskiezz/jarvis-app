/**
 * F213 — Ops Event × Investment × IntelProfile Threat Finance Nexus (TFINEX)
 *
 * Parallel-fetches /v1/ops/events + /entities/Investment + /entities/IntelProfile
 * and keyword-correlates each ops event against investments AND intel actor
 * profiles to classify:
 *
 *   FULL_RISK      — matched investments + intel profiles (financial + actor threat)
 *   FINANCIAL_RISK — investment match only (financial exposure, no known actor)
 *   ACTOR_LINKED   — intel profile match only (actor threat, no financial link)
 *   UNCORRELATED   — neither match (no threat finance coverage)
 *
 * Stat tiles: OPS EVENTS / INVESTMENTS / INTEL PROFILES + four class counts + RISK%.
 * Amber badge on FULL_RISK count.
 * Filter tabs ALL / FULL_RISK / FINANCIAL_RISK / ACTOR_LINKED / UNCORRELATED + text search.
 * Expand event → matched investment cards (gold) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS THREAT FINANCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:tfinex-toggle event.
 *
 * Voice triggers:
 *   "tfinex / threat finance / ops investment / financial threat / actor investment /
 *    ops finance / ops actor investment / threat finance nexus"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_061_640;
const Z_INDEX  = 274;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TFINEX_RE = /\b(tfinex|threat[\s-]finance|ops[\s-]investment|financial[\s-]threat|actor[\s-]investment|ops[\s-]finance|ops[\s-]actor[\s-]investment|threat[\s-]finance[\s-]nexus)\b/i;

export function isTfinexQuery(q = "") { return TFINEX_RE.test(q); }

export async function buildTfinexScript() {
  const base = apiBase();
  const [opsRes, invRes, intRes] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/entities/Investment`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const events   = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
  const invests  = invRes.status === "fulfilled" ? (invRes.value?.items  || invRes.value  || []) : [];
  const profiles = intRes.status === "fulfilled" ? (intRes.value?.items  || intRes.value  || []) : [];

  let fullRisk = 0, uncorrelated = 0;
  for (const ev of events) {
    const kws = keywords(eventText(ev));
    const hasInv  = invests.some(i  => scoreText(investText(i),   kws) > 0);
    const hasAct  = profiles.some(p => scoreText(profileText(p),  kws) > 0);
    if (hasInv && hasAct) fullRisk++;
    else if (!hasInv && !hasAct) uncorrelated++;
  }
  const total    = events.length;
  const riskPct  = total ? Math.round((fullRisk / total) * 100) : 0;
  return `TFINEX Threat Finance Nexus online, sir. I have cross-referenced ${total} operational events against ${invests.length} portfolio investments and ${profiles.length} threat actor intel profiles. ${fullRisk} events carry both financial exposure and known actor linkage — representing ${riskPct}% full-risk coverage. ${uncorrelated} events remain uncorrelated with no financial or actor threat context. Recommend immediate triage of full-risk events, sir.`;
}

const CY     = "#00CFFF";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const GR     = "#22C55E";
const GO     = "#EAB308";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULL_RISK:      RD,
  FINANCIAL_RISK: GO,
  ACTOR_LINKED:   OR,
  UNCORRELATED:   "#6E8AA0",
};

const TABS = ["ALL", "FULL_RISK", "FINANCIAL_RISK", "ACTOR_LINKED", "UNCORRELATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function eventText(e) {
  return [e.title, e.name, e.description, e.type, e.location, e.tags, e.category, e.source].filter(Boolean).join(" ");
}
function investText(i) {
  return [i.name, i.title, i.type, i.sector, i.description, i.tags, i.ticker, i.symbol, i.category].filter(Boolean).join(" ");
}
function profileText(p) {
  return [p.name, p.aliases, p.org, p.organisation, p.role, p.description, p.tags, p.country, p.label].filter(Boolean).join(" ");
}

function classify(event, invests, profiles) {
  const kws = keywords(eventText(event));
  const matchedInv = invests
    .map(i => ({ ...i, _score: scoreText(investText(i), kws) }))
    .filter(i => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedAct = profiles
    .map(p => ({ ...p, _score: scoreText(profileText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasInv = matchedInv.length > 0;
  const hasAct = matchedAct.length > 0;
  let cls;
  if (hasInv && hasAct)   cls = "FULL_RISK";
  else if (hasInv)        cls = "FINANCIAL_RISK";
  else if (hasAct)        cls = "ACTOR_LINKED";
  else                    cls = "UNCORRELATED";
  return { ...event, _cls: cls, _invests: matchedInv, _actors: matchedAct };
}

function smallBtn(col) {
  return {
    fontFamily: FONT, fontSize: 10, background: "transparent",
    border: `1px solid ${col}55`, color: col, padding: "2px 7px",
    borderRadius: 3, cursor: "pointer",
  };
}

export default function ThreatFinanceNexus() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [events, setEvents]         = useState([]);
  const [invests, setInvests]       = useState([]);
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
      const [opsRes, invRes, intRes] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/entities/Investment`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const evs  = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
      const inv  = invRes.status === "fulfilled" ? (invRes.value?.items  || invRes.value  || []) : [];
      const prof = intRes.status === "fulfilled" ? (intRes.value?.items  || intRes.value  || []) : [];
      setEvents(evs);
      setInvests(inv);
      setProfiles(prof);
      setClassified(evs.map(ev => classify(ev, inv, prof)));
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
    window.addEventListener("jarvis:tfinex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tfinex-toggle", onToggle);
  }, []);

  const fullRisk     = classified.filter(c => c._cls === "FULL_RISK").length;
  const finRisk      = classified.filter(c => c._cls === "FINANCIAL_RISK").length;
  const actorLinked  = classified.filter(c => c._cls === "ACTOR_LINKED").length;
  const uncorrelated = classified.filter(c => c._cls === "UNCORRELATED").length;
  const total        = classified.length;
  const riskPct      = total ? Math.round((fullRisk / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || eventText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `TFINEX: ${total} ops events — FULL_RISK: ${fullRisk}, FINANCIAL_RISK: ${finRisk}, ACTOR_LINKED: ${actorLinked}, UNCORRELATED: ${uncorrelated} (${riskPct}% full-risk). Investments: ${invests.length}. Intel Profiles: ${profiles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TFINEX threat finance nexus assessment. Context: ${ctx}. Provide a 2-sentence brief about which operational events represent the highest combined financial and actor threat risk, and recommend immediate action. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Threat finance assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Threat Finance Nexus (TFINEX)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {fullRisk > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {fullRisk}
          </span>
        )}
        ◈ TFINEX
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ TFINEX</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Ops Event × Investment × IntelProfile Threat Finance Nexus
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
          ["OPS EVENTS",     total,        CY],
          ["INVESTMENTS",    invests.length, GO],
          ["INTEL PROFILES", profiles.length, OR],
          ["FULL RISK",      fullRisk,     RD],
          ["FINANCIAL RISK", finRisk,      GO],
          ["ACTOR LINKED",   actorLinked,  OR],
          ["UNCORRELATED",   uncorrelated, "#6E8AA0"],
          ["RISK%",          riskPct + "%", AM],
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
          FULL-RISK COVERAGE — {riskPct}%
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 3, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${riskPct}%`, height: "100%",
            background: riskPct >= 70 ? RD : riskPct >= 40 ? AM : "#6E8AA0",
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
          placeholder="search events…"
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
          {assessing ? "◌ ASSESSING…" : "▶ ASSESS THREAT FINANCE"}
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

      {/* Event list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#6E8AA0", fontSize: 11, padding: "12px 0" }}>No events match current filter.</div>
        )}
        {visible.map((ev, idx) => {
          const isExp = expanded === idx;
          const cls   = ev._cls;
          const col   = CLASS_COLOR[cls];
          return (
            <div key={ev.id || ev.title || idx} style={{
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
                  {ev.title || ev.name || "(untitled event)"}
                </span>
                {ev._invests.length > 0 && (
                  <span style={{ color: GO, fontSize: 9 }}>{ev._invests.length}inv</span>
                )}
                {ev._actors.length > 0 && (
                  <span style={{ color: OR, fontSize: 9 }}>{ev._actors.length}act</span>
                )}
                <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
              </button>

              {isExp && (
                <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {ev.description && (
                    <div style={{ color: "#94A3B8", fontSize: 10, marginBottom: 10, lineHeight: 1.5 }}>
                      {ev.description}
                    </div>
                  )}
                  {/* Investments */}
                  {ev._invests.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: GO, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED INVESTMENTS ({ev._invests.length})
                      </div>
                      {ev._invests.map((inv, i) => {
                        const maxScore = ev._invests[0]._score || 1;
                        const pct = Math.round((inv._score / maxScore) * 100);
                        return (
                          <div key={inv.id || inv.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${GO}22`, color: GO,
                              border: `1px solid ${GO}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {inv.type || inv.sector || "INV"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {inv.name || inv.title || "(investment)"}
                            </span>
                            <div style={{ width: 80, background: "rgba(255,255,255,0.08)", borderRadius: 2, height: 4 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: GO, borderRadius: 2 }} />
                            </div>
                            <span style={{ color: GO, fontSize: 9, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Intel Profiles */}
                  {ev._actors.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        MATCHED INTEL PROFILES ({ev._actors.length})
                      </div>
                      {ev._actors.map((act, i) => {
                        const maxScore = ev._actors[0]._score || 1;
                        const pct = Math.round((act._score / maxScore) * 100);
                        return (
                          <div key={act.id || act.name || i} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}>
                            <span style={{
                              background: `${OR}22`, color: OR,
                              border: `1px solid ${OR}44`, borderRadius: 3,
                              fontSize: 8, padding: "1px 5px", whiteSpace: "nowrap",
                            }}>
                              {act.role || act.type || "ACTOR"}
                            </span>
                            <span style={{ color: "#CBD5E1", fontSize: 10, flex: 1 }}>
                              {act.name || act.title || "(actor)"}
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
                  {ev._invests.length === 0 && ev._actors.length === 0 && (
                    <div style={{ color: "#6E8AA0", fontSize: 10 }}>No matched investments or intel profiles for this event.</div>
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
