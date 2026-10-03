/**
 * F221 — IntelProfile × Ops Event × Knowledge Threat Actor Activity Monitor (TAAM)
 *
 * Parallel-fetches /entities/IntelProfile + /v1/ops/events + /knowledge/
 * and keyword-correlates each threat actor profile against ops events AND KB articles to classify:
 *
 *   FULLY_ACTIVE    — matched ops events + KB articles (full activity coverage)
 *   OPS_TRACKED     — matched ops events, no KB articles (active but undocumented)
 *   KNOWLEDGE_ONLY  — matched KB articles, no ops events (documented but not active)
 *   DARK            — no matches in either source (actor intelligence dark spot)
 *
 * Stat tiles: INTEL PROFILES / OPS EVENTS / KB ARTICLES + four class counts + ACTIVE%.
 * Red badge on DARK count.
 * Filter tabs ALL / FULLY_ACTIVE / OPS_TRACKED / KNOWLEDGE_ONLY / DARK + text search.
 * Expand profile → matched ops event cards (blue) + KB article cards (green) with relevance bars.
 * ▶ ASSESS THREAT ACTORS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:taam-toggle event.
 *
 * Voice triggers:
 *   "taam / threat actor activity / actor monitor / dark actor /
 *    untracked actor / intel profile activity / active threat actors"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_066_120;
const Z_INDEX  = 282;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const TAAM_RE = /\b(taam|threat[\s-]actor[\s-]activity|actor[\s-]monitor|dark[\s-]actor|untracked[\s-]actor|intel[\s-]profile[\s-]activity|active[\s-]threat[\s-]actors)\b/i;

export function isTaamQuery(q = "") { return TAAM_RE.test(q); }

export async function buildTaamScript() {
  const base = apiBase();
  const [profRes, opsRes, kbRes] = await Promise.allSettled([
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const profiles = profRes.status === "fulfilled" ? (profRes.value?.items || profRes.value || []) : [];
  const events   = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
  const articles = kbRes.status === "fulfilled" ? (kbRes.value?.items || kbRes.value || []) : [];

  let fullyActive = 0, dark = 0;
  for (const prof of profiles) {
    const kws     = keywords(profileText(prof));
    const hasOps  = events.some(e => scoreText(eventText(e), kws) > 0);
    const hasKb   = articles.some(a => scoreText(articleText(a), kws) > 0);
    if (hasOps && hasKb) fullyActive++;
    else if (!hasOps && !hasKb) dark++;
  }
  const total     = profiles.length;
  const activePct = total ? Math.round((fullyActive / total) * 100) : 0;
  return `TAAM Threat Actor Activity Monitor online, sir. I have cross-referenced ${total} intel profiles against ${events.length} operational events and ${articles.length} knowledge base articles. ${fullyActive} threat actors have full activity coverage with both operational event tracking and knowledge documentation, representing ${activePct}% active intelligence coverage. ${dark} threat actors are completely dark — no operational events or knowledge base entries match their profiles, representing critical intelligence blind spots requiring immediate attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const BL   = "#3B82F6";
const OR   = "#F97316";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ACTIVE:   GR,
  OPS_TRACKED:    BL,
  KNOWLEDGE_ONLY: PU,
  DARK:           RD,
};

const TABS = ["ALL", "FULLY_ACTIVE", "OPS_TRACKED", "KNOWLEDGE_ONLY", "DARK"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function profileText(p) {
  return [p.name, p.title, p.description, p.role, p.org, p.organization, p.aliases, p.tags, p.category, p.type, p.affiliation].filter(Boolean).join(" ");
}
function eventText(e) {
  return [e.name, e.title, e.description, e.type, e.tags, e.category, e.actor, e.source, e.location].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.name, a.title, a.description, a.tags, a.category, a.content, a.summary, a.topic].filter(Boolean).join(" ");
}

function classify(profile, events, articles) {
  const kws = keywords(profileText(profile));
  const matchedOps = events
    .map(e => ({ ...e, _score: scoreText(eventText(e), kws) }))
    .filter(e => e._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedKb = articles
    .map(a => ({ ...a, _score: scoreText(articleText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasOps = matchedOps.length > 0;
  const hasKb  = matchedKb.length > 0;

  let cls;
  if (hasOps && hasKb) cls = "FULLY_ACTIVE";
  else if (hasOps)     cls = "OPS_TRACKED";
  else if (hasKb)      cls = "KNOWLEDGE_ONLY";
  else                 cls = "DARK";

  return { ...profile, _cls: cls, _ops: matchedOps, _kb: matchedKb };
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

export default function ThreatActorActivityMonitor() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [profiles, setProfiles]   = useState([]);
  const [events, setEvents]       = useState([]);
  const [articles, setArticles]   = useState([]);
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
      const [profRes, opsRes, kbRes] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const prof = profRes.status === "fulfilled" ? (profRes.value?.items || profRes.value || []) : [];
      const ops  = opsRes.status === "fulfilled" ? (opsRes.value?.items || opsRes.value || []) : [];
      const kb   = kbRes.status === "fulfilled" ? (kbRes.value?.items || kbRes.value || []) : [];
      setProfiles(prof);
      setEvents(ops);
      setArticles(kb);
      setClassified(prof.map(p => classify(p, ops, kb)));
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
    window.addEventListener("jarvis:taam-toggle", onToggle);
    return () => window.removeEventListener("jarvis:taam-toggle", onToggle);
  }, []);

  const fullyActive    = classified.filter(c => c._cls === "FULLY_ACTIVE").length;
  const opsTracked     = classified.filter(c => c._cls === "OPS_TRACKED").length;
  const knowledgeOnly  = classified.filter(c => c._cls === "KNOWLEDGE_ONLY").length;
  const dark           = classified.filter(c => c._cls === "DARK").length;
  const total          = classified.length;
  const activePct      = total ? Math.round((fullyActive / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || profileText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `TAAM: ${total} intel profiles — FULLY_ACTIVE: ${fullyActive}, OPS_TRACKED: ${opsTracked}, KNOWLEDGE_ONLY: ${knowledgeOnly}, DARK: ${dark} (${activePct}% fully active). Ops events: ${events.length}. KB articles: ${articles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `TAAM threat actor activity assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which dark threat actors pose the highest intelligence risk and what immediate collection or knowledge base actions should be prioritised. Be concise and direct.` }),
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
        title="IntelProfile × Ops Event × Knowledge Threat Actor Activity Monitor (TAAM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${OR}55`,
          color: OR, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {dark > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {dark}
          </span>
        )}
        ◈ TAAM
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
        <span style={{ color: OR, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ TAAM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          IntelProfile × Ops Event × Knowledge Threat Actor Activity Monitor
        </span>
        {loading && <span style={{ color: OR, fontSize: 10 }}>◌ loading…</span>}
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
          ["INTEL PROFILES",   total,          OR],
          ["OPS EVENTS",       events.length,  BL],
          ["KB ARTICLES",      articles.length, GR],
          ["FULLY ACTIVE",     fullyActive,    GR],
          ["OPS TRACKED",      opsTracked,     BL],
          ["KNOWLEDGE ONLY",   knowledgeOnly,  PU],
          ["DARK",             dark,           RD],
          ["ACTIVE%",          activePct + "%", activePct >= 70 ? GR : activePct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(249,115,22,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Activity coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          THREAT ACTOR FULL COVERAGE — {activePct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: activePct + "%",
            background: activePct >= 70 ? GR : activePct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(OR), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS THREAT ACTORS"}
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
            ...smallBtn(tab === t ? OR : "#4A6A80"),
            background: tab === t ? OR + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search intel profiles…"
          style={{
            background: "rgba(249,115,22,0.05)", border: `1px solid ${OR}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} profiles
        </span>
      </div>

      {/* Profile list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading intel profiles…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((prof, i) => {
            const col    = CLASS_COLOR[prof._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxOps = prof._ops[0]?._score || 1;
            const maxKb  = prof._kb[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(249,115,22,0.02)", overflow: "hidden",
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
                    {prof._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {prof.name || prof.title || `Profile ${i + 1}`}
                  </span>
                  {prof.role && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{prof.role}</span>
                  )}
                  {prof.org && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{prof.org}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {prof.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {prof.description}
                      </div>
                    )}

                    {/* Matched ops events */}
                    {prof._ops.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED OPS EVENTS ({prof._ops.length})
                        </div>
                        {prof._ops.map((e, ei) => (
                          <div key={ei} style={{
                            background: BL + "11", border: `1px solid ${BL}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {e.name || e.title || `Event ${ei + 1}`}
                              </span>
                              {e.type && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {e.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={e._score} max={maxOps} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {prof._kb.length > 0 && (
                      <div>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KB ARTICLES ({prof._kb.length})
                        </div>
                        {prof._kb.map((a, ai) => (
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

                    {prof._cls === "DARK" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching ops events or KB articles found. This threat actor profile is a complete intelligence dark spot — no operational tracking or knowledge documentation.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No intel profiles match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
