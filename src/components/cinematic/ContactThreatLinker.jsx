/**
 * F54 — Contact Threat Linker.
 * Parallel-fetches /entities/Contact + /entities/IntelProfile;
 * keyword-correlates each contact (name/org/tags) against threat profiles;
 * surfaces linked pairs with threat-level badges and an AI 2-sentence assessment
 * via /v1/jarvis/agent/chat + TTS through jarvis:speak-dossier.
 * Stats tiles: total contacts / total profiles / linked / high-threat.
 * Toggle: ◈ CTL at left:4340 bottom strip with red badge when high-threat contacts found.
 * "JARVIS, contact threats" / "threat contacts" / "linked contacts" → isContactThreatQuery.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const OR  = "#FB923C";
const RD  = "#FF4444";
const AM  = "#FACC15";
const GN  = "#4ADE80";
const DIM = "#566878";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CTL_RE =
  /\b(contact\s+threat|threat\s+contact|linked\s+contact|ctl|contact\s+(risk|intel|profile|link)|dangerous\s+contact)\b/i;

// ── data fetchers ─────────────────────────────────────────────────────────────

async function fetchContacts() {
  const r = await fetch(`${apiBase()}/entities/Contact`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.items)    ? d.items
    : Array.isArray(d?.contacts) ? d.contacts
    : Array.isArray(d?.results)  ? d.results
    : [];
}

async function fetchIntelProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)     ? d.data
    : Array.isArray(d?.items)    ? d.items
    : Array.isArray(d?.profiles) ? d.profiles
    : Array.isArray(d?.results)  ? d.results
    : [];
}

async function askAI(contact, profile) {
  const cName = contact.name || contact.full_name || contact.title || "Contact";
  const cOrg  = contact.org  || contact.organization || contact.company || "";
  const cRole = contact.role || contact.job_title || contact.department || "";

  const pName  = profile.name  || profile.title       || profile.subject || "Threat Profile";
  const pType  = profile.type  || profile.entity_type || profile.category || "";
  const pLevel = profile.threat_level || profile.classification || profile.risk_level || "";
  const pDesc  = (profile.description || profile.summary || "").slice(0, 300);

  let ctx = `Contact: "${cName}"`;
  if (cOrg)  ctx += `, organization: ${cOrg}`;
  if (cRole) ctx += `, role: ${cRole}`;
  ctx += `. Matched Intel Profile: "${pName}"`;
  if (pType)  ctx += `, type: ${pType}`;
  if (pLevel) ctx += `, threat level: ${pLevel}`;
  if (pDesc)  ctx += `. Profile summary: ${pDesc}`;
  ctx += ". In 2 sentences, assess the risk this link poses and recommend an action.";

  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body:    JSON.stringify({ message: ctx }),
  });
  const d = await r.json();
  return (d.answer || d.response || d.text || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── correlation helpers ───────────────────────────────────────────────────────

function tokens(obj, fields) {
  return fields
    .flatMap(f => {
      const v = obj[f];
      if (Array.isArray(v)) return v.map(String);
      if (typeof v === "string") return v.split(/[\s,._/-]+/);
      return [];
    })
    .map(w => w.toLowerCase().trim())
    .filter(w => w.length > 2);
}

function correlate(contact, profile) {
  const cWords = tokens(contact, [
    "name", "full_name", "title", "org", "organization", "company", "department", "role", "tags",
  ]);
  const pWords = tokens(profile, [
    "name", "title", "subject", "category", "tags", "sector", "aliases", "description",
  ]);
  return pWords.filter(w => cWords.includes(w)).length;
}

function threatColor(profile) {
  const v = (
    profile.threat_level || profile.classification || profile.risk_level ||
    profile.severity || profile.level || ""
  ).toString().toLowerCase();
  if (v === "critical" || v === "ts" || v === "top secret") return RD;
  if (v === "high"     || v === "s"  || v === "secret")     return OR;
  if (v === "medium"   || v === "c"  || v === "confidential") return AM;
  return CY;
}

// ── exported intent ───────────────────────────────────────────────────────────

export function isContactThreatQuery(text) {
  return CTL_RE.test(text || "");
}

export async function buildContactThreatScript() {
  let contacts = [], profiles = [];
  try {
    [contacts, profiles] = await Promise.all([fetchContacts(), fetchIntelProfiles()]);
  } catch (_) {}
  if (!contacts.length) return "No contacts found for threat linkage analysis at this time, sir.";

  const pairs = [];
  for (const c of contacts) {
    for (const p of profiles) {
      if (correlate(c, p) > 0) pairs.push({ contact: c, profile: p });
    }
  }
  const linkedIds = new Set(pairs.map(p => p.contact.id || p.contact._id || p.contact.name));
  const highThreat = pairs.filter(p => {
    const col = threatColor(p.profile);
    return col === RD || col === OR;
  });

  return (
    `Contact Threat Linker active. ${contacts.length} contact${contacts.length !== 1 ? "s" : ""} ` +
    `cross-referenced against ${profiles.length} intel profile${profiles.length !== 1 ? "s" : ""}. ` +
    `${linkedIds.size} contact${linkedIds.size !== 1 ? "s" : ""} matched` +
    (highThreat.length
      ? `; ${highThreat.length} high-threat link${highThreat.length !== 1 ? "s" : ""} detected`
      : "") +
    `. Recommend reviewing linked pairs immediately, sir.`
  );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ContactThreatLinker() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("");
  const [tab,       setTab]       = useState("ALL"); // ALL | LINKED | HIGH
  const [selected,  setSelected]  = useState(null);  // { contact, profile }
  const [aiText,    setAiText]    = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetch.current < 55_000) return;
    lastFetch.current = now;
    setLoading(true);
    try {
      const [c, p] = await Promise.all([fetchContacts(), fetchIntelProfiles()]);
      setContacts(c);
      setProfiles(p);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { lastFetch.current = 0; load(); }, 60_000);
    return () => clearInterval(t);
  }, [open, load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (CTL_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:contact-threat-toggle", onToggle);
    return () => window.removeEventListener("jarvis:contact-threat-toggle", onToggle);
  }, []);

  // Build correlated pairs
  const allPairs = [];
  for (const c of contacts) {
    for (const p of profiles) {
      const score = correlate(c, p);
      if (score > 0) allPairs.push({ contact: c, profile: p, score });
    }
  }
  const linkedIds  = new Set(allPairs.map(p => p.contact.id || p.contact._id || p.contact.name));
  const highPairs  = allPairs.filter(p => { const col = threatColor(p.profile); return col === RD || col === OR; });
  const highIds    = new Set(highPairs.map(p => p.contact.id || p.contact._id || p.contact.name));

  const totalContacts  = contacts.length;
  const totalProfiles  = profiles.length;
  const linkedCnt      = linkedIds.size;
  const highThreatCnt  = highIds.size;

  // Filtered contact rows
  const visibleContacts = contacts
    .filter(c => {
      const id = c.id || c._id || c.name;
      if (tab === "LINKED")   return linkedIds.has(id);
      if (tab === "HIGH")     return highIds.has(id);
      return true;
    })
    .filter(c => {
      if (!filter.trim()) return true;
      const hay = [c.name, c.full_name, c.org, c.organization, c.company, c.role, c.department, c.email]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(filter.toLowerCase());
    });

  async function handleSelectPair(contact, profile) {
    setSelected({ contact, profile });
    setAiText("");
    setAiLoading(true);
    try {
      const text = await askAI(contact, profile);
      setAiText(text || "No assessment available.");
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setAiText("Unable to retrieve AI assessment at this time.");
    } finally {
      setAiLoading(false);
    }
  }

  const TABS = ["ALL", "LINKED", "HIGH"];

  return (
    <>
      {/* Toggle button — left:4340 bottom strip */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Contact Threat Linker (F54)"
        style={{
          position: "fixed", left: 4340, bottom: 18, zIndex: 68,
          background: open ? CY + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : CY,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${CY}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>◈</span>
        CTL
        {highThreatCnt > 0 && (
          <span style={{
            background: "#FF444444", color: RD,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
          }}>
            {highThreatCnt}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(720px,96vw)", maxHeight: "min(760px,88vh)",
          background: "rgba(4,6,14,0.96)",
          border: `1px solid ${CY}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%", background: CY,
              boxShadow: `0 0 10px ${CY}`, display: "inline-block",
              animation: loading ? "ctlpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              CONTACT THREAT LINKER
            </span>
            <span style={{ marginLeft: "auto", color: DIM, fontSize: 9 }}>
              {loading ? "LOADING…" : `${totalContacts} contacts · ${totalProfiles} profiles`}
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: DIM,
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 8, padding: "8px 14px",
            borderBottom: `1px solid ${CY}18`, flexShrink: 0,
          }}>
            {[
              { label: "CONTACTS",    val: totalContacts, col: CY },
              { label: "PROFILES",    val: totalProfiles, col: OR },
              { label: "LINKED",      val: linkedCnt,     col: AM },
              { label: "HIGH THREAT", val: highThreatCnt, col: RD },
            ].map(({ label, val, col }) => (
              <div key={label} style={{
                flex: 1, background: col + "0d", border: `1px solid ${col}33`,
                borderRadius: 8, padding: "6px 10px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 900 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter + tabs */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 14px",
            borderBottom: `1px solid ${CY}14`, flexShrink: 0, alignItems: "center",
          }}>
            <input
              type="text"
              placeholder="filter contacts…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                flex: 1, background: `rgba(41,231,255,0.06)`, border: `1px solid ${CY}33`,
                borderRadius: 5, color: "#DCEBF5", fontSize: 9,
                padding: "4px 8px", fontFamily: "'JetBrains Mono',monospace",
                outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: tab === t ? CY + "cc" : "transparent",
                  border: `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius: 4, color: tab === t ? "#04060A" : CY,
                  cursor: "pointer", padding: "3px 8px", fontSize: 8,
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                  letterSpacing: 1,
                }}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Body: left contact list + right detail/AI panel */}
          <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>

            {/* Left: contact rows */}
            <div style={{
              width: 250, flexShrink: 0,
              borderRight: `1px solid ${CY}18`,
              overflowY: "auto",
            }}>
              {visibleContacts.length === 0 && !loading && (
                <div style={{ padding: 14, color: DIM, fontSize: 9, textAlign: "center" }}>
                  {contacts.length === 0 ? "No contacts loaded." : "No matches."}
                </div>
              )}
              {visibleContacts.map((c, idx) => {
                const id       = c.id || c._id || idx;
                const name     = c.name || c.full_name || c.title || `Contact ${idx + 1}`;
                const org      = c.org  || c.organization || c.company || "";
                const role     = c.role || c.job_title || c.department || "";
                const cId      = c.id || c._id || c.name;
                const cPairs   = allPairs.filter(p => (p.contact.id || p.contact._id || p.contact.name) === cId);
                const isLinked = cPairs.length > 0;
                const maxCol   = cPairs.length
                  ? cPairs.reduce((best, p) => {
                      const col  = threatColor(p.profile);
                      const rank = [RD, OR, AM, CY, GN];
                      return rank.indexOf(col) < rank.indexOf(best) ? col : best;
                    }, GN)
                  : DIM;
                const isSel = selected &&
                  (selected.contact.id || selected.contact._id || selected.contact.name) === cId;

                return (
                  <div
                    key={id}
                    onClick={() => {
                      if (!cPairs.length) return;
                      const best = cPairs.sort((a, b) => b.score - a.score)[0];
                      handleSelectPair(best.contact, best.profile);
                    }}
                    style={{
                      padding: "7px 10px",
                      background: isSel ? `${CY}14` : "transparent",
                      borderBottom: `1px solid ${CY}0d`,
                      borderLeft: `3px solid ${maxCol}`,
                      cursor: isLinked ? "pointer" : "default",
                      transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${CY}08`; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{
                      fontSize: 9, fontWeight: 700,
                      color: isSel ? CY : "#DCEBF5",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {name}
                    </div>
                    <div style={{ display: "flex", gap: 4, marginTop: 2, alignItems: "center", flexWrap: "wrap" }}>
                      {org && (
                        <span style={{ fontSize: 7, color: DIM, background: "rgba(255,255,255,0.04)", borderRadius: 3, padding: "1px 4px" }}>
                          {org.slice(0, 16)}
                        </span>
                      )}
                      {role && (
                        <span style={{ fontSize: 7, color: DIM }}>
                          {role.slice(0, 14)}
                        </span>
                      )}
                      {isLinked && (
                        <span style={{
                          fontSize: 7, color: maxCol,
                          background: maxCol + "22",
                          borderRadius: 3, padding: "1px 4px", marginLeft: "auto",
                        }}>
                          {cPairs.length} link{cPairs.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: linked profiles + AI assessment */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selected ? (
                <>
                  {/* Selected contact header */}
                  <div style={{
                    padding: "8px 12px", borderBottom: `1px solid ${CY}18`,
                    flexShrink: 0,
                  }}>
                    <div style={{ color: CY, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
                      ◈ {(selected.contact.name || selected.contact.full_name || "Contact").slice(0, 50)}
                    </div>
                    <div style={{ color: OR, fontSize: 9, fontWeight: 700, letterSpacing: 0.5 }}>
                      ⚠ {(selected.profile.name || selected.profile.title || selected.profile.subject || "Intel Profile").slice(0, 60)}
                    </div>
                    {(selected.profile.threat_level || selected.profile.classification || selected.profile.risk_level) && (
                      <span style={{
                        display: "inline-block", marginTop: 4,
                        fontSize: 7,
                        color: threatColor(selected.profile),
                        background: threatColor(selected.profile) + "22",
                        borderRadius: 3, padding: "1px 5px",
                      }}>
                        {String(
                          selected.profile.threat_level ||
                          selected.profile.classification ||
                          selected.profile.risk_level || ""
                        ).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* All linked profiles for this contact */}
                  {(() => {
                    const cId      = selected.contact.id || selected.contact._id || selected.contact.name;
                    const relPairs = allPairs
                      .filter(p => (p.contact.id || p.contact._id || p.contact.name) === cId)
                      .sort((a, b) => b.score - a.score);
                    return relPairs.length > 1 ? (
                      <div style={{
                        padding: "6px 12px", borderBottom: `1px solid ${CY}14`,
                        flexShrink: 0,
                      }}>
                        <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 4 }}>
                          ALL LINKED PROFILES ({relPairs.length})
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {relPairs.map((p, i) => {
                            const pName = p.profile.name || p.profile.title || p.profile.subject || `Profile ${i + 1}`;
                            const col   = threatColor(p.profile);
                            const isAct = (p.profile.id || p.profile._id || pName) ===
                                          (selected.profile.id || selected.profile._id ||
                                           selected.profile.name || selected.profile.title);
                            return (
                              <button
                                key={p.profile.id || i}
                                onClick={() => handleSelectPair(p.contact, p.profile)}
                                style={{
                                  background: isAct ? col + "33" : col + "14",
                                  border: `1px solid ${col}${isAct ? "88" : "33"}`,
                                  borderRadius: 4, color: col,
                                  cursor: "pointer", padding: "2px 7px",
                                  fontSize: 7, fontFamily: "'JetBrains Mono',monospace",
                                  maxWidth: 140, overflow: "hidden",
                                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}
                                title={pName}
                              >
                                {pName.slice(0, 22)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {/* AI assessment */}
                  <div style={{
                    flex: 1, overflowY: "auto", padding: "10px 12px",
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    {aiLoading && (
                      <div style={{
                        color: DIM, fontSize: 9, fontStyle: "italic",
                        animation: "ctlpulse 1s ease-in-out infinite",
                      }}>
                        Analysing threat link…
                      </div>
                    )}
                    {aiText && !aiLoading && (
                      <div style={{
                        background: "rgba(255,255,255,0.03)", border: `1px solid ${CY}22`,
                        borderRadius: 10, padding: "10px 12px",
                        fontSize: 9, color: "#DCEBF5", lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                      }}>
                        <div style={{ color: CY, fontSize: 7, letterSpacing: 1, marginBottom: 6 }}>
                          ◈ JARVIS THREAT ASSESSMENT
                        </div>
                        {aiText}
                      </div>
                    )}
                    {!aiLoading && !aiText && (
                      <div style={{ color: DIM, fontSize: 9, fontStyle: "italic", marginTop: 10 }}>
                        Select a linked contact to receive an AI threat assessment.
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{
                    padding: "4px 12px", borderTop: `1px solid ${CY}11`,
                    flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 7, color: DIM, letterSpacing: 0.5 }}>
                      /entities/Contact · /entities/IntelProfile · /v1/jarvis/agent/chat
                    </span>
                  </div>
                </>
              ) : (
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column", gap: 8,
                  color: DIM, fontSize: 9, fontStyle: "italic", padding: 20,
                  textAlign: "center",
                }}>
                  <span>← click a linked contact to see matched threat profiles</span>
                  {linkedCnt === 0 && !loading && totalContacts > 0 && (
                    <span style={{ color: GN, fontStyle: "normal" }}>
                      No keyword correlations found between contacts and intel profiles.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ctlpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
