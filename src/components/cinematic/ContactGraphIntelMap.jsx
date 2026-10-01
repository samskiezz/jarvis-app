/**
 * F222 — Contact × Graph Community × IntelProfile Network Actor Intelligence Map (NCAIM)
 *
 * Parallel-fetches /entities/Contact + /v1/graph/communities + /entities/IntelProfile
 * and keyword-correlates each contact against graph community clusters AND intel actor profiles:
 *
 *   FULLY_MAPPED     — matched community + intel profile (full network actor intelligence)
 *   COMMUNITY_LINKED — matched community, no intel profile (network presence, no profiling)
 *   PROFILED         — matched intel profile, no community (profiled, no network cluster)
 *   UNMAPPED         — no matches in either source (network actor intelligence gap)
 *
 * Stat tiles: CONTACTS / COMMUNITIES / INTEL PROFILES + four class counts + MAPPED%.
 * Amber badge on UNMAPPED count.
 * Filter tabs ALL / FULLY_MAPPED / COMMUNITY_LINKED / PROFILED / UNMAPPED + text search.
 * Expand contact → matched community cards (blue) + intel profile cards (orange) with relevance bars.
 * ▶ ASSESS NETWORK ACTOR INTEL → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ncaim-toggle event.
 *
 * Voice triggers:
 *   "ncaim / contact network actor / contact community profile / unmapped contacts /
 *    network actor intel / actor network map / contact intel community"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_066_680;
const Z_INDEX  = 283;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const NCAIM_RE = /\b(ncaim|contact[\s-]network[\s-]actor|contact[\s-]community[\s-]profile|unmapped[\s-]contacts|network[\s-]actor[\s-]intel|actor[\s-]network[\s-]map|contact[\s-]intel[\s-]community)\b/i;

export function isNcaimQuery(q = "") { return NCAIM_RE.test(q); }

export async function buildNcaimScript() {
  const base = apiBase();
  const [conRes, comRes, ipRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
  ]);
  const contacts    = conRes.status === "fulfilled" ? (conRes.value?.items || conRes.value || []) : [];
  const communities = comRes.status === "fulfilled" ? (comRes.value?.items || comRes.value || []) : [];
  const profiles    = ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value || []) : [];

  let fullyMapped = 0, unmapped = 0;
  for (const c of contacts) {
    const kws    = keywords(contactText(c));
    const hasCom = communities.some(cm => scoreText(communityText(cm), kws) > 0);
    const hasIp  = profiles.some(p => scoreText(profileText(p), kws) > 0);
    if (hasCom && hasIp) fullyMapped++;
    else if (!hasCom && !hasIp) unmapped++;
  }
  const total     = contacts.length;
  const mappedPct = total ? Math.round((fullyMapped / total) * 100) : 0;
  return `NCAIM Network Actor Intelligence Map online, sir. I have cross-referenced ${total} contacts against ${communities.length} graph community clusters and ${profiles.length} intel actor profiles. ${fullyMapped} contacts have full network actor intelligence coverage — matched to both a graph community and an intel profile, representing ${mappedPct}% complete mapping. ${unmapped} contacts are completely unmapped with no community cluster or intel profile associations, representing critical network actor intelligence gaps requiring immediate analytical attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const PU   = "#A855F7";
const BL   = "#3B82F6";
const OR   = "#F97316";
const TE   = "#14B8A6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:     GR,
  COMMUNITY_LINKED: BL,
  PROFILED:         OR,
  UNMAPPED:         AM,
};

const TABS = ["ALL", "FULLY_MAPPED", "COMMUNITY_LINKED", "PROFILED", "UNMAPPED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return [c.name, c.email, c.role, c.org, c.organisation, c.organization, c.title, c.description, c.tags, c.type].filter(Boolean).join(" ");
}
function communityText(cm) {
  return [cm.name, cm.label, cm.description, cm.tags, cm.cluster, cm.topic, cm.members].filter(Boolean).join(" ");
}
function profileText(p) {
  return [p.name, p.title, p.description, p.role, p.org, p.organization, p.aliases, p.tags, p.category, p.type, p.affiliation].filter(Boolean).join(" ");
}

function classify(contact, communities, profiles) {
  const kws = keywords(contactText(contact));
  const matchedCom = communities
    .map(cm => ({ ...cm, _score: scoreText(communityText(cm), kws) }))
    .filter(cm => cm._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
  const matchedIp = profiles
    .map(p => ({ ...p, _score: scoreText(profileText(p), kws) }))
    .filter(p => p._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);

  const hasCom = matchedCom.length > 0;
  const hasIp  = matchedIp.length > 0;

  let cls;
  if (hasCom && hasIp)  cls = "FULLY_MAPPED";
  else if (hasCom)      cls = "COMMUNITY_LINKED";
  else if (hasIp)       cls = "PROFILED";
  else                  cls = "UNMAPPED";

  return { ...contact, _cls: cls, _com: matchedCom, _ip: matchedIp };
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

export default function ContactGraphIntelMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [contacts, setContacts]     = useState([]);
  const [communities, setCommunities] = useState([]);
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
      const [conRes, comRes, ipRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/v1/graph/communities`).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`).then(r => r.json()),
      ]);
      const con  = conRes.status === "fulfilled" ? (conRes.value?.items || conRes.value || []) : [];
      const com  = comRes.status === "fulfilled" ? (comRes.value?.items || comRes.value || []) : [];
      const ip   = ipRes.status === "fulfilled" ? (ipRes.value?.items || ipRes.value || []) : [];
      setContacts(con);
      setCommunities(com);
      setProfiles(ip);
      setClassified(con.map(c => classify(c, com, ip)));
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
    window.addEventListener("jarvis:ncaim-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ncaim-toggle", onToggle);
  }, []);

  const fullyMapped     = classified.filter(c => c._cls === "FULLY_MAPPED").length;
  const communityLinked = classified.filter(c => c._cls === "COMMUNITY_LINKED").length;
  const profiled        = classified.filter(c => c._cls === "PROFILED").length;
  const unmapped        = classified.filter(c => c._cls === "UNMAPPED").length;
  const total           = classified.length;
  const mappedPct       = total ? Math.round((fullyMapped / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || contactText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `NCAIM: ${total} contacts — FULLY_MAPPED: ${fullyMapped}, COMMUNITY_LINKED: ${communityLinked}, PROFILED: ${profiled}, UNMAPPED: ${unmapped} (${mappedPct}% fully mapped). Communities: ${communities.length}. Intel profiles: ${profiles.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `NCAIM network actor intelligence assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which unmapped contacts represent the highest network actor intelligence gaps and what community or profiling actions should be prioritised. Be concise and direct.` }),
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
        title="Contact × Graph Community × IntelProfile Network Actor Intelligence Map (NCAIM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${TE}55`,
          color: TE, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unmapped > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unmapped}
          </span>
        )}
        ◈ NCAIM
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
        <span style={{ color: TE, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ NCAIM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Contact × Graph Community × IntelProfile Network Actor Intelligence Map
        </span>
        {loading && <span style={{ color: TE, fontSize: 10 }}>◌ loading…</span>}
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
          ["CONTACTS",         total,            TE],
          ["COMMUNITIES",      communities.length, BL],
          ["INTEL PROFILES",   profiles.length,  OR],
          ["FULLY MAPPED",     fullyMapped,      GR],
          ["COMMUNITY LINKED", communityLinked,  BL],
          ["PROFILED",         profiled,         OR],
          ["UNMAPPED",         unmapped,         AM],
          ["MAPPED%",          mappedPct + "%",  mappedPct >= 70 ? GR : mappedPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(20,184,166,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 80, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Mapping coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          NETWORK ACTOR FULL COVERAGE — {mappedPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: mappedPct + "%",
            background: mappedPct >= 70 ? GR : mappedPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(TE), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS NETWORK ACTOR INTEL"}
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
            ...smallBtn(tab === t ? TE : "#4A6A80"),
            background: tab === t ? TE + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            background: "rgba(20,184,166,0.05)", border: `1px solid ${TE}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} contacts
        </span>
      </div>

      {/* Contact list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading contacts…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((contact, i) => {
            const col    = CLASS_COLOR[contact._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxCom = contact._com[0]?._score || 1;
            const maxIp  = contact._ip[0]?._score || 1;
            return (
              <div key={i} style={{
                border: `1px solid ${col}33`, borderRadius: 5,
                background: "rgba(20,184,166,0.02)", overflow: "hidden",
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
                    {contact._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {contact.name || contact.email || `Contact ${i + 1}`}
                  </span>
                  {contact.role && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{contact.role}</span>
                  )}
                  {contact.org && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{contact.org}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {contact.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {contact.description}
                      </div>
                    )}

                    {/* Matched communities */}
                    {contact._com.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: BL, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED COMMUNITIES ({contact._com.length})
                        </div>
                        {contact._com.map((cm, ci) => (
                          <div key={ci} style={{
                            background: BL + "11", border: `1px solid ${BL}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: BL, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cm.name || cm.label || `Community ${ci + 1}`}
                              </span>
                              {cm.members !== undefined && (
                                <span style={{ fontSize: 8, color: BL, border: `1px solid ${BL}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {cm.members} members
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={cm._score} max={maxCom} col={BL} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched intel profiles */}
                    {contact._ip.length > 0 && (
                      <div>
                        <div style={{ color: OR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED INTEL PROFILES ({contact._ip.length})
                        </div>
                        {contact._ip.map((p, pi) => (
                          <div key={pi} style={{
                            background: OR + "11", border: `1px solid ${OR}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: OR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {p.name || p.title || `Profile ${pi + 1}`}
                              </span>
                              {p.role && (
                                <span style={{ fontSize: 8, color: OR, border: `1px solid ${OR}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {p.role}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={p._score} max={maxIp} col={OR} />
                          </div>
                        ))}
                      </div>
                    )}

                    {contact._cls === "UNMAPPED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching graph communities or intel profiles found. This contact represents a network actor intelligence gap — no community cluster or threat profile association exists.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No contacts match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
