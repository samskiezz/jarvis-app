/**
 * F154 — Contact × Graph Community × IntelProfile Network Alignment Map (CGNIMAP)
 *
 * Answers: "Which contacts are fully network-aligned (backed by a graph
 *           community cluster AND an intel actor profile), and which are isolated?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /entities/Contact         → operational contacts (name/role/org/tags)
 *   GET /v1/graph/communities     → network community clusters (id/name/members/description)
 *   GET /entities/IntelProfile    → known threat-actor intel profiles (name/aliases/org/role/tags)
 *
 * Classification per contact (keyword correlation):
 *   FULLY_ALIGNED   — matched ≥1 community cluster + ≥1 intel profile (both)
 *   COMMUNITY_LINKED — matched community only
 *   PROFILED_ONLY   — matched intel profile only
 *   ISOLATED        — matched neither (visibility gap)
 *
 * Stat tiles: CONTACTS / COMMUNITIES / INTEL PROFILES + four class counts + ALIGNED%
 * ▶ ASSESS: 2-sentence AI brief via /v1/jarvis/agent/chat + TTS.
 *
 * Toggle:  ◈ CGNIMAP  at left:1028600 bottom:8, zIndex:215.
 * Event:   jarvis:cgnimap-toggle
 * Voice:   "cgnimap / contact network / contact community / contact alignment /
 *           isolated contacts / contact graph alignment / network contact intel"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const RED    = "#FF3B6B";
const PURPLE = "#9B59B6";
const ORANGE = "#e67e22";
const MUTED  = "#6E8AA0";
const BG     = "rgba(4,7,14,0.96)";
const MONO   = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1028600;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of ["items","results","data","records","contacts","communities","profiles","members"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    const vals = Object.values(raw);
    if (vals.length === 1 && Array.isArray(vals[0])) return vals[0];
  }
  return [];
}

function words(item) {
  const str = [
    item.name, item.description, item.title, item.role, item.org,
    item.email, item.aliases, item.tags, item.category, item.members,
    item.summary, item.content,
  ].filter(Boolean).join(" ").toLowerCase();
  return str.split(/\W+/).filter(s => s.length > 2);
}

function overlap(a, b) {
  const setA = new Set(words(a));
  let hits = 0;
  for (const w of words(b)) if (setA.has(w)) hits++;
  return hits;
}

function relevancePct(hits, maxHits) {
  if (!maxHits) return 0;
  return Math.min(100, Math.round((hits / maxHits) * 100));
}

const CGNIMAP_RE = /\b(cgnimap|contact.?network|contact.?community|contact.?alignment|isolated.?contact|contact.?graph.?align|network.?contact.?intel)\b/i;

export function isCgnimapQuery(q) {
  return CGNIMAP_RE.test(q);
}

export async function buildCgnimapScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  const [ctR, commR, ipR] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.json()),
    fetch(`${base}/v1/graph/communities`,  { headers: h }).then(r => r.json()),
    fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
  ]);
  const contacts     = normArr(ctR.status   === "fulfilled" ? ctR.value   : []);
  const communities  = normArr(commR.status === "fulfilled" ? commR.value : []);
  const profiles     = normArr(ipR.status   === "fulfilled" ? ipR.value   : []);

  let fully = 0, commOnly = 0, profOnly = 0, isolated = 0;
  for (const c of contacts) {
    const hasComm = communities.some(g => overlap(c, g) > 0);
    const hasProf = profiles.some(p => overlap(c, p) > 0);
    if (hasComm && hasProf) fully++;
    else if (hasComm) commOnly++;
    else if (hasProf) profOnly++;
    else isolated++;
  }
  const pct = contacts.length
    ? Math.round(((fully + commOnly + profOnly) / contacts.length) * 100)
    : 0;

  return (
    `${contacts.length} contacts analysed across ${communities.length} graph communities and ${profiles.length} intel profiles: ` +
    `${fully} fully aligned, ${commOnly} community-linked only, ${profOnly} profiled only, ${isolated} isolated (visibility gap). ` +
    `Network alignment coverage ${pct}%.`
  );
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactGraphIntelAlignmentMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [contacts, setContacts]     = useState([]);
  const [communities, setCommunities] = useState([]);
  const [profiles, setProfiles]     = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    const [ctR, commR, ipR] = await Promise.allSettled([
      fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.json()),
      fetch(`${base}/v1/graph/communities`,  { headers: h }).then(r => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.json()),
    ]);
    setContacts(normArr(ctR.status   === "fulfilled" ? ctR.value   : []));
    setCommunities(normArr(commR.status === "fulfilled" ? commR.value : []));
    setProfiles(normArr(ipR.status   === "fulfilled" ? ipR.value   : []));
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:cgnimap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cgnimap-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // ── classification ──────────────────────────────────────────────────────────
  const classified = contacts.map(c => {
    const commMatches = communities.filter(g => overlap(c, g) > 0);
    const profMatches = profiles.filter(p => overlap(c, p) > 0);
    let cls;
    if (commMatches.length && profMatches.length) cls = "FULLY_ALIGNED";
    else if (commMatches.length) cls = "COMMUNITY_LINKED";
    else if (profMatches.length) cls = "PROFILED_ONLY";
    else cls = "ISOLATED";
    return { ...c, cls, commMatches, profMatches };
  });

  const maxHitsComm = Math.max(1, ...classified.flatMap(c => c.commMatches.map(g => overlap(c, g))));
  const maxHitsProf = Math.max(1, ...classified.flatMap(c => c.profMatches.map(p => overlap(c, p))));

  const fully    = classified.filter(c => c.cls === "FULLY_ALIGNED").length;
  const commOnly = classified.filter(c => c.cls === "COMMUNITY_LINKED").length;
  const profOnly = classified.filter(c => c.cls === "PROFILED_ONLY").length;
  const isolated = classified.filter(c => c.cls === "ISOLATED").length;
  const pct = contacts.length ? Math.round(((fully + commOnly + profOnly) / contacts.length) * 100) : 0;

  const TABS = ["ALL","FULLY_ALIGNED","COMMUNITY_LINKED","PROFILED_ONLY","ISOLATED"];
  const filtered = classified.filter(c => {
    if (tab !== "ALL" && c.cls !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return [c.name, c.role, c.org, c.email, c.tags].filter(Boolean).join(" ").toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    const base = apiBase();
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` };
    const ctx = `${contacts.length} contacts analysed: ${fully} fully aligned (community + intel), ${commOnly} community-linked only, ${profOnly} intel-profiled only, ${isolated} isolated. Alignment ${pct}%.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: h,
        body: JSON.stringify({ message: `CGNIMAP: Give a 2-sentence network alignment assessment. Context: ${ctx}` }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch { setBrief("Unable to reach reasoning core for assessment."); }
    setAssessing(false);
  };

  const clsColor = { FULLY_ALIGNED: GREEN, COMMUNITY_LINKED: CY, PROFILED_ONLY: ORANGE, ISOLATED: RED };
  const tabColor = t => tab === t ? CY : MUTED;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Contact × Graph Community × IntelProfile Network Alignment Map (CGNIMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 215,
          padding: "3px 8px", borderRadius: 6, border: `1px solid ${isolated > 0 ? AMBER : CY}44`,
          background: "rgba(4,7,14,0.88)", color: isolated > 0 ? AMBER : CY,
          fontSize: 9, letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ CGNIMAP
        {isolated > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: "50%",
            width: 14, height: 14, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 8, fontWeight: 700,
          }}>{isolated}</span>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 215,
          padding: "3px 8px", borderRadius: 6, border: `1px solid ${CY}`,
          background: `${CY}22`, color: CY,
          fontSize: 9, letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
        }}
      >
        ◈ CGNIMAP
      </button>

      <div style={{
        position: "fixed", bottom: 36, left: BTN_LEFT - 600, zIndex: 215,
        width: 700, maxHeight: "82vh",
        background: BG, border: `1px solid ${CY}44`, borderRadius: 12,
        display: "flex", flexDirection: "column",
        fontFamily: MONO, color: "#DCEBF5", boxShadow: `0 0 40px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "10px 16px", borderBottom: `1px solid ${CY}22`,
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
            ◈ CGNIMAP — Contact Network Alignment Map
          </span>
          <button onClick={() => setOpen(false)} style={{
            background: "transparent", border: "none", color: MUTED,
            fontSize: 14, cursor: "pointer",
          }}>✕</button>
        </div>

        {/* stat tiles */}
        <div style={{
          display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0,
          borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
        }}>
          {[
            ["CONTACTS",   contacts.length,   CY],
            ["COMMUNITIES",communities.length, PURPLE],
            ["INTEL PROFS",profiles.length,    ORANGE],
            ["FULLY ALIGNED", fully,           GREEN],
            ["COMM LINKED",commOnly,            CY],
            ["PROF ONLY",  profOnly,           ORANGE],
            ["ISOLATED",   isolated,           RED],
            [`ALIGNED ${pct}%`, null,          GREEN],
          ].map(([label, val, col]) => (
            <div key={label} style={{
              padding: "5px 10px", borderRadius: 6, border: `1px solid ${col}44`,
              background: `${col}11`, textAlign: "center", minWidth: 80,
            }}>
              <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>
                {val !== null ? val : `${pct}%`}
              </div>
              <div style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ padding: "6px 16px", flexShrink: 0 }}>
          <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
            <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: `linear-gradient(90deg,${CY},${GREEN})` }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: MUTED, marginTop: 3 }}>
            <span>0%</span><span style={{ color: CY }}>Alignment {pct}%</span><span>100%</span>
          </div>
        </div>

        {/* filter tabs */}
        <div style={{ display: "flex", gap: 6, padding: "4px 16px", flexShrink: 0, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "2px 8px", borderRadius: 4, border: `1px solid ${tabColor(t)}44`,
              background: tab === t ? `${CY}22` : "transparent",
              color: tabColor(t), fontSize: 8, cursor: "pointer", fontFamily: MONO,
            }}>{t.replace(/_/g," ")}</button>
          ))}
        </div>

        {/* search */}
        <div style={{ padding: "4px 16px 8px", flexShrink: 0 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search contacts…"
            style={{
              width: "100%", background: "rgba(255,255,255,0.04)",
              border: `1px solid ${CY}33`, borderRadius: 6,
              color: "#DCEBF5", fontSize: 10, padding: "4px 8px", fontFamily: MONO,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {loading && (
            <div style={{ color: MUTED, textAlign: "center", padding: 20, fontSize: 10 }}>
              ◌ loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ color: MUTED, textAlign: "center", padding: 20, fontSize: 10 }}>
              No contacts match this filter.
            </div>
          )}
          {filtered.map((c, i) => {
            const isExp = expanded === i;
            return (
              <div key={i} style={{
                marginBottom: 6, borderRadius: 8, border: `1px solid ${clsColor[c.cls]}33`,
                background: `${clsColor[c.cls]}08`, cursor: "pointer",
              }}
                onClick={() => setExpanded(isExp ? null : i)}
              >
                <div style={{
                  padding: "7px 12px", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: clsColor[c.cls], fontSize: 8, letterSpacing: 1 }}>
                      {c.cls.replace(/_/g," ")}
                    </span>
                    <span style={{ color: "#DCEBF5", fontSize: 10 }}>
                      {c.name || `Contact ${i+1}`}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 9 }}>
                    {c.role && <span style={{ color: ORANGE }}>{c.role}</span>}
                    {c.org  && <span style={{ color: MUTED }}>{c.org}</span>}
                    <span style={{ color: MUTED }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{
                    padding: "8px 12px 12px",
                    borderTop: `1px solid ${clsColor[c.cls]}22`,
                  }}>
                    {/* Community matches */}
                    {c.commMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: PURPLE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>◈ GRAPH COMMUNITIES ({c.commMatches.length})</div>
                        {c.commMatches.map((g, j) => {
                          const hits = overlap(c, g);
                          const pctV = relevancePct(hits, maxHitsComm);
                          return (
                            <div key={j} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                                <span>{g.name || g.id || `Community ${j+1}`}</span>
                                <span style={{ color: PURPLE }}>{pctV}%</span>
                              </div>
                              <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", marginTop: 2 }}>
                                <div style={{ height: "100%", borderRadius: 1, width: `${pctV}%`, background: PURPLE }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Intel Profile matches */}
                    {c.profMatches.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: ORANGE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>◈ INTEL PROFILES ({c.profMatches.length})</div>
                        {c.profMatches.map((p, j) => {
                          const hits = overlap(c, p);
                          const pctV = relevancePct(hits, maxHitsProf);
                          return (
                            <div key={j} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                                <span>{p.name || p.title || `Actor ${j+1}`}</span>
                                {p.role && <span style={{ color: ORANGE, fontSize: 8 }}>{p.role}</span>}
                                <span style={{ color: ORANGE }}>{pctV}%</span>
                              </div>
                              <div style={{ height: 2, borderRadius: 1, background: "rgba(255,255,255,0.06)", marginTop: 2 }}>
                                <div style={{ height: "100%", borderRadius: 1, width: `${pctV}%`, background: ORANGE }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {c.commMatches.length === 0 && c.profMatches.length === 0 && (
                      <div style={{ color: RED, fontSize: 10 }}>◌ No community or intel profile matches. Contact is ISOLATED.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess footer */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${AMBER}33`, flexShrink: 0 }}>
          <button onClick={assess} disabled={assessing || loading} style={{
            padding: "5px 14px", borderRadius: 8, border: `1px solid ${AMBER}`,
            background: assessing ? "rgba(245,166,35,0.3)" : "transparent",
            color: AMBER, fontSize: 10, letterSpacing: 1, cursor: "pointer", fontFamily: MONO,
          }}>
            {assessing ? "◌ assessing…" : "▶ ASSESS ALIGNMENT"}
          </button>
          {brief && (
            <div style={{ marginTop: 8, fontSize: 10, color: "#DCEBF5", lineHeight: 1.6, borderLeft: `2px solid ${AMBER}`, paddingLeft: 10 }}>
              {brief}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
