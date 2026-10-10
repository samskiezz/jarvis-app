/**
 * F217 — Investigation × Graph Community × AIP Skill Network Intelligence Coverage Map (IGCAIM)
 *
 * Parallel-fetches /v1/investigations + /v1/graph/communities + /v1/aip/skill and
 * keyword-correlates each investigation against graph communities AND AIP skills to classify:
 *
 *   FULLY_NETWORKED  — matched community + skill (investigation has full network + capability backing)
 *   COMMUNITY_MAPPED — community match only (graph-backed but no skill coverage)
 *   SKILL_BACKED     — skill match only (capability exists but not graph-anchored)
 *   ISOLATED         — neither match (investigation with no network intelligence coverage)
 *
 * Stat tiles: INVESTIGATIONS / COMMUNITIES / AIP SKILLS + four class counts + COVERAGE%.
 * Amber badge on ISOLATED count.
 * Filter tabs ALL / FULLY_NETWORKED / COMMUNITY_MAPPED / SKILL_BACKED / ISOLATED + text search.
 * Expand investigation → matched community cards (blue) + matched skill cards (cyan) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:igcaim-toggle event.
 *
 * Voice triggers:
 *   "igcaim / investigation network / investigation community /
 *    investigation skill coverage / networked investigation /
 *    isolated investigation / network intel coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_063_880;
const Z_INDEX  = 278;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const IGCAIM_RE = /\b(igcaim|investigation[\s-]network|investigation[\s-]community|investigation[\s-]skill[\s-]coverage|networked[\s-]investigation|isolated[\s-]investigation|network[\s-]intel[\s-]coverage)\b/i;

export function isIgcaimQuery(q = "") { return IGCAIM_RE.test(q); }

export async function buildIgcaimScript() {
  const base = apiBase();
  const [invRes, comRes, skillRes] = await Promise.allSettled([
    fetch(`${base}/v1/investigations`).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/v1/aip/skill`).then(r => r.json()),
  ]);
  const investigations = invRes.status   === "fulfilled" ? (invRes.value?.items   || invRes.value   || []) : [];
  const communities    = comRes.status   === "fulfilled" ? (comRes.value?.items   || comRes.value   || []) : [];
  const skills         = skillRes.status === "fulfilled" ? (skillRes.value?.items || skillRes.value || []) : [];

  let fullyNetworked = 0, isolated = 0;
  for (const inv of investigations) {
    const kws     = keywords(invText(inv));
    const hasCom  = communities.some(c => scoreText(communityText(c), kws) > 0);
    const hasSkl  = skills.some(s => scoreText(skillText(s), kws) > 0);
    if (hasCom && hasSkl) fullyNetworked++;
    else if (!hasCom && !hasSkl) isolated++;
  }
  const total       = investigations.length;
  const coveragePct = total ? Math.round((fullyNetworked / total) * 100) : 0;
  return `IGCAIM Investigation Network Coverage Map online, sir. I have cross-referenced ${total} active investigations against ${communities.length} graph community clusters and ${skills.length} AIP skills. ${fullyNetworked} investigations carry full network intelligence backing — both a graph community anchor and a JARVIS skill aligned — representing ${coveragePct}% coverage. ${isolated} investigations remain completely isolated with no network or capability context, indicating potential blind spots in our intelligence mesh, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const BL   = "#3B82F6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_NETWORKED:  GR,
  COMMUNITY_MAPPED: BL,
  SKILL_BACKED:     CY,
  ISOLATED:         "#6E8AA0",
};

const TABS = ["ALL", "FULLY_NETWORKED", "COMMUNITY_MAPPED", "SKILL_BACKED", "ISOLATED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function invText(inv) {
  return [inv.name, inv.title, inv.description, inv.type, inv.tags, inv.status, inv.category, inv.summary, inv.subject].filter(Boolean).join(" ");
}
function communityText(c) {
  return [c.name, c.label, c.description, c.type, c.tags, c.members, c.topic, c.cluster].filter(Boolean).join(" ");
}
function skillText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.category, s.capability, s.domain].filter(Boolean).join(" ");
}

function classify(inv, communities, skills) {
  const kws           = keywords(invText(inv));
  const matchedCom    = communities
    .map(c => ({ ...c, _score: scoreText(communityText(c), kws) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedSkills = skills
    .map(s => ({ ...s, _score: scoreText(skillText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const hasCom  = matchedCom.length > 0;
  const hasSkl  = matchedSkills.length > 0;
  let cls;
  if (hasCom && hasSkl)  cls = "FULLY_NETWORKED";
  else if (hasCom)       cls = "COMMUNITY_MAPPED";
  else if (hasSkl)       cls = "SKILL_BACKED";
  else                   cls = "ISOLATED";
  return { ...inv, _cls: cls, _communities: matchedCom, _skills: matchedSkills };
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

export default function InvestigationNetworkCoverageMap() {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [investigations, setInvestigations] = useState([]);
  const [communities, setCommunities]       = useState([]);
  const [skills, setSkills]                 = useState([]);
  const [classified, setClassified]         = useState([]);
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
      const [invRes, comRes, skillRes] = await Promise.allSettled([
        fetch(`${base}/v1/investigations`).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`).then(r => r.json()),
      ]);
      const inv  = invRes.status   === "fulfilled" ? (invRes.value?.items   || invRes.value   || []) : [];
      const com  = comRes.status   === "fulfilled" ? (comRes.value?.items   || comRes.value   || []) : [];
      const skl  = skillRes.status === "fulfilled" ? (skillRes.value?.items || skillRes.value || []) : [];
      setInvestigations(inv);
      setCommunities(com);
      setSkills(skl);
      setClassified(inv.map(i => classify(i, com, skl)));
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
    window.addEventListener("jarvis:igcaim-toggle", onToggle);
    return () => window.removeEventListener("jarvis:igcaim-toggle", onToggle);
  }, []);

  const fullyNetworked  = classified.filter(c => c._cls === "FULLY_NETWORKED").length;
  const communityMapped = classified.filter(c => c._cls === "COMMUNITY_MAPPED").length;
  const skillBacked     = classified.filter(c => c._cls === "SKILL_BACKED").length;
  const isolated        = classified.filter(c => c._cls === "ISOLATED").length;
  const total           = classified.length;
  const coveragePct     = total ? Math.round((fullyNetworked / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || invText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `IGCAIM: ${total} investigations — FULLY_NETWORKED: ${fullyNetworked}, COMMUNITY_MAPPED: ${communityMapped}, SKILL_BACKED: ${skillBacked}, ISOLATED: ${isolated} (${coveragePct}% coverage). Communities: ${communities.length}. AIP Skills: ${skills.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `IGCAIM investigation network coverage assessment. Context: ${ctx}. Provide a 2-sentence brief on which isolated investigations pose the greatest network intelligence gap and recommend immediate coverage priorities. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "Network coverage assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
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
        title="Investigation × Graph Community × AIP Skill Network Intelligence Coverage Map (IGCAIM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${AM}55`,
          color: AM, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {isolated > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {isolated}
          </span>
        )}
        ◈ IGCAIM
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
        <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ IGCAIM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Investigation × Graph Community × AIP Skill Network Intelligence Coverage Map
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
          ["INVESTIGATIONS",   total,            CY],
          ["COMMUNITIES",      communities.length, BL],
          ["AIP SKILLS",       skills.length,    GR],
          ["FULLY NETWORKED",  fullyNetworked,   GR],
          ["COMMUNITY MAPPED", communityMapped,  BL],
          ["SKILL BACKED",     skillBacked,      CY],
          ["ISOLATED",         isolated,         "#6E8AA0"],
          ["COVERAGE%",        coveragePct + "%", coveragePct >= 60 ? GR : coveragePct >= 30 ? AM : RD],
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
          NETWORK INTELLIGENCE COVERAGE — {coveragePct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: coveragePct + "%",
            background: coveragePct >= 60 ? GR : coveragePct >= 30 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(AM), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS COVERAGE"}
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
          placeholder="search investigations…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 170,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} investigations
        </span>
      </div>

      {/* Investigation list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading investigations…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((c, i) => {
            const col   = CLASS_COLOR[c._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxC  = c._communities[0]?._score || 1;
            const maxS  = c._skills[0]?._score || 1;
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
                    {c._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.title || c.subject || `Investigation ${i + 1}`}
                  </span>
                  {c.status && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{c.status}</span>
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

                    {/* Matched communities */}
                    {c._communities.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED COMMUNITIES ({c._communities.length})
                        </div>
                        {c._communities.map((com, ci) => (
                          <div key={ci} style={{
                            background: BL + "11", border: `1px solid ${BL}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {com.name || com.label || `Community ${ci + 1}`}
                              </span>
                              {com.type && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {com.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={com._score} max={maxC} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched skills */}
                    {c._skills.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED AIP SKILLS ({c._skills.length})
                        </div>
                        {c._skills.map((s, si) => (
                          <div key={si} style={{
                            background: CY + "11", border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {s.name || s.title || `Skill ${si + 1}`}
                              </span>
                              {s.type && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {s.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={s._score} max={maxS} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {c._cls === "ISOLATED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching graph communities or AIP skills found. Investigation has no network intelligence coverage.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No investigations match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
