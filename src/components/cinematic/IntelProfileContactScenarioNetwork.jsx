/**
 * F188 — IntelProfile × Contact × Scenario — Threat Actor Contact Network (TACN)
 *
 * Parallel-fetches /entities/IntelProfile + /entities/Contact + /v1/scenario/list every 90 s.
 * Keyword-correlates each intel profile against known contacts AND active scenarios:
 *
 *   FULLY_MAPPED    — matched ≥1 contact AND ≥1 scenario
 *   CONTACT_LINKED  — contact attribution found, no scenario coverage
 *   SCENARIO_LINKED — scenario coverage found, no contact attributed
 *   DARK            — no contact and no scenario linkage
 *
 * Stat tiles: profiles / contacts / scenarios / fully mapped / dark
 * Filter tabs: ALL | FULLY_MAPPED | CONTACT_LINKED | SCENARIO_LINKED | DARK
 * Text search on profile name / type / description.
 * Expand row → matched contacts (cyan bars) + matched scenarios (amber bars).
 * Red badge + pulse on DARK count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 *
 * Toggle:  ◈ TACN  at bottom:8 left:981120, zIndex:689.
 * Event:   jarvis:tacn-toggle
 * Voice:   "tacn / threat actor network / intel contact / intel scenario /
 *           dark intel / unattributed intel / threat contact network /
 *           actor contact mapping / threat actor contact"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 981_120;
const POLL_MS  = 90_000;
const CY       = "#29E7FF";
const AMBER    = "#FFB020";
const RED      = "#FF4545";
const MONO     = "'JetBrains Mono',monospace";

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const TACN_RE =
  /\b(tacn|threat\s+actor\s+network|intel\s+contact|intel\s+scenario|dark\s+intel|unattributed\s+intel|threat\s+contact\s+network|actor\s+contact\s+mapping|threat\s+actor\s+contact)\b/i;

export function isTacnQuery(q) {
  return TACN_RE.test(q || "");
}

export async function buildTacnScript() {
  const base = apiBase();
  const h = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [ipr, ctr, scr] = await Promise.allSettled([
      fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.ok ? r.json() : []),
      fetch(`${base}/v1/scenario/list`,      { headers: h }).then(r => r.ok ? r.json() : []),
    ]);
    const profiles  = toArr(ipr.value);
    const contacts  = toArr(ctr.value);
    const scenarios = toArr(scr.value);
    let dark = 0;
    profiles.forEach(p => {
      const kws = keywords(p);
      const hasContact  = contacts.some(c => matchKws(kws, c));
      const hasScenario = scenarios.some(s => matchKws(kws, s));
      if (!hasContact && !hasScenario) dark++;
    });
    return `Threat Actor Contact Network: ${profiles.length} intel profiles assessed against ${contacts.length} contacts and ${scenarios.length} active scenarios. ${dark} profiles are DARK — no contact attribution and no scenario linkage, representing unattributed threat actors requiring immediate investigation priority.`;
  } catch {
    return "TACN assessment unavailable.";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toArr(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (Array.isArray(v.items))     return v.items;
  if (Array.isArray(v.results))   return v.results;
  if (Array.isArray(v.data))      return v.data;
  if (Array.isArray(v.profiles))  return v.profiles;
  if (Array.isArray(v.contacts))  return v.contacts;
  if (Array.isArray(v.scenarios)) return v.scenarios;
  return [];
}

function txt(obj) {
  return [
    obj?.id, obj?.name, obj?.title, obj?.label,
    obj?.description, obj?.summary, obj?.type,
    obj?.category, obj?.entity_type, obj?.threat_type,
    obj?.actor_type, obj?.topic, obj?.subject,
    obj?.alias, obj?.aliases,
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywords(item) {
  return txt(item).split(/\W+/).filter(w => w.length > 3);
}

function matchKws(kws, item) {
  if (!kws.length) return false;
  const haystack = txt(item);
  return kws.some(k => haystack.includes(k));
}

function classify(profile, contacts, scenarios) {
  const kws         = keywords(profile);
  const hasContact  = contacts.some(c => matchKws(kws, c));
  const hasScenario = scenarios.some(s => matchKws(kws, s));
  if (hasContact && hasScenario) return "FULLY_MAPPED";
  if (hasContact)                return "CONTACT_LINKED";
  if (hasScenario)               return "SCENARIO_LINKED";
  return "DARK";
}

const CLASS_COLORS = {
  FULLY_MAPPED:    CY,
  CONTACT_LINKED:  "#7FEFB4",
  SCENARIO_LINKED: AMBER,
  DARK:            RED,
};

const CLASS_ORDER = ["FULLY_MAPPED", "CONTACT_LINKED", "SCENARIO_LINKED", "DARK"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntelProfileContactScenarioNetwork() {
  const [open, setOpen]             = useState(false);
  const [rows, setRows]             = useState([]);
  const [contactCount, setContactCount] = useState(0);
  const [scenarioCount, setScenarioCount] = useState(0);
  const [filter, setFilter]         = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const h = { Authorization: `Bearer ${API_KEY}` };
      const [ipr, ctr, scr] = await Promise.allSettled([
        fetch(`${base}/entities/IntelProfile`, { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/entities/Contact`,      { headers: h }).then(r => r.ok ? r.json() : []),
        fetch(`${base}/v1/scenario/list`,      { headers: h }).then(r => r.ok ? r.json() : []),
      ]);
      const profiles  = toArr(ipr.value);
      const contacts  = toArr(ctr.value);
      const scenarios = toArr(scr.value);
      setContactCount(contacts.length);
      setScenarioCount(scenarios.length);
      setRows(profiles.map(p => ({
        p,
        cls: classify(p, contacts, scenarios),
        matchedContacts:  contacts.filter(c => matchKws(keywords(p), c)).slice(0, 5),
        matchedScenarios: scenarios.filter(s => matchKws(keywords(p), s)).slice(0, 5),
      })));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (isTacnQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:tacn-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:tacn-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function assess() {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildTacnScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const ans = (d.answer || d.response || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(ans || script);
      window.dispatchEvent(new CustomEvent("jarvis:tts", { detail: { text: ans || script } }));
    } catch {
      const fallback = await buildTacnScript();
      setAssessment(fallback);
    }
    setAssessing(false);
  }

  const darkCount = rows.filter(r => r.cls === "DARK").length;

  const displayRows = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const hay = txt(r.p);
      return hay.includes(search.toLowerCase());
    }
    return true;
  });

  const stats = CLASS_ORDER.reduce((acc, cls) => {
    acc[cls] = rows.filter(r => r.cls === cls).length;
    return acc;
  }, {});

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="IntelProfile × Contact × Scenario — Threat Actor Contact Network (TACN)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 689,
          background: open ? RED + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${darkCount > 0 ? RED : "#334F62"}88`,
          borderRadius: 8, padding: "3px 8px", cursor: "pointer",
          color: open ? "#fff" : darkCount > 0 ? RED : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          boxShadow: darkCount > 0 ? `0 0 10px ${RED}44` : "none",
          animation: darkCount > 0 ? "tacn-pulse 2s infinite" : "none",
        }}
      >
        ◈ TACN{darkCount > 0 ? ` ${darkCount}!` : ""}
      </button>
      <style>{`
        @keyframes tacn-pulse {
          0%,100% { box-shadow: 0 0 10px ${RED}44; }
          50%      { box-shadow: 0 0 20px ${RED}88; }
        }
      `}</style>

      {open && (
        <div style={{
          position: "fixed", left: Math.max(8, BTN_LEFT - 340), bottom: 36, zIndex: 689,
          width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column",
          background: "rgba(6,10,18,0.94)", border: `1px solid ${CY}33`,
          borderRadius: 12, overflow: "hidden",
          backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${RED}22`,
          fontFamily: MONO,
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 10, letterSpacing: 2 }}>◈ TACN</span>
            <span style={{ color: "#334F62", fontSize: 9 }}>threat actor contact network</span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#334F62",
              cursor: "pointer", fontSize: 13, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "flex", gap: 6, padding: "6px 10px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              ["PROFILES",  rows.length,        CY],
              ["CONTACTS",  contactCount,        "#7FEFB4"],
              ["SCENARIOS", scenarioCount,       AMBER],
              ["FULLY MAP", stats.FULLY_MAPPED,  CY],
              ["DARK",      darkCount,           RED],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "3px 7px", textAlign: "center", minWidth: 54,
              }}>
                <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#334F62", fontSize: 8 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "4px 8px",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)} style={{
                background: filter === cls ? `${CLASS_COLORS[cls] || CY}22` : "transparent",
                border: `1px solid ${filter === cls ? (CLASS_COLORS[cls] || CY) : "#1A2A38"}`,
                borderRadius: 4, padding: "2px 7px", cursor: "pointer",
                color: filter === cls ? (CLASS_COLORS[cls] || CY) : "#334F62",
                fontSize: 8, letterSpacing: 0.5,
              }}>{cls === "ALL" ? `ALL (${rows.length})` : `${cls} (${stats[cls] || 0})`}</button>
            ))}
          </div>

          {/* Search */}
          <div style={{ padding: "4px 10px", borderBottom: `1px solid ${CY}11` }}>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search intel profiles…"
              style={{
                width: "100%", background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 5,
                padding: "4px 8px", color: CY, fontSize: 10,
                fontFamily: MONO, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayRows.length === 0 ? (
              <div style={{ padding: "16px", color: "#334F62", fontSize: 10, textAlign: "center" }}>
                {rows.length === 0 ? "loading…" : "no matches"}
              </div>
            ) : displayRows.map((row, i) => {
              const { p, cls, matchedContacts, matchedScenarios } = row;
              const col   = CLASS_COLORS[cls];
              const label = p?.name || p?.title || p?.label || p?.id || `Profile ${i + 1}`;
              const type  = p?.type || p?.threat_type || p?.actor_type || p?.category || "";
              const isExp = expanded === i;
              return (
                <div key={i} style={{
                  borderBottom: `1px solid ${CY}0A`, cursor: "pointer",
                  background: isExp ? "rgba(41,231,255,0.04)" : "transparent",
                }} onClick={() => setExpanded(isExp ? null : i)}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px",
                  }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, flexShrink: 0,
                      boxShadow: cls === "DARK" ? `0 0 6px ${RED}` : "none",
                    }} />
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 10,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{label}</span>
                    {type && (
                      <span style={{ color: "#334F62", fontSize: 8, flexShrink: 0 }}>
                        {String(type).slice(0, 8).toUpperCase()}
                      </span>
                    )}
                    <span style={{ color: col, fontSize: 8, flexShrink: 0 }}>{cls}</span>
                    <span style={{ color: "#334F62", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "4px 12px 8px" }}>
                      {p?.description && (
                        <div style={{ color: "#5A7A90", fontSize: 9, marginBottom: 6, lineHeight: 1.4 }}>
                          {p.description.slice(0, 120)}
                        </div>
                      )}
                      {/* Contacts */}
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ color: "#7FEFB4", fontSize: 8, marginBottom: 3 }}>
                          CONTACTS ({matchedContacts.length})
                        </div>
                        {matchedContacts.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedContacts.map((c, ci) => (
                            <div key={ci} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: "#7FEFB4",
                                  width: `${Math.min(100, 40 + ci * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(c?.name || c?.title || c?.id || "Contact").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                      {/* Scenarios */}
                      <div>
                        <div style={{ color: AMBER, fontSize: 8, marginBottom: 3 }}>
                          SCENARIOS ({matchedScenarios.length})
                        </div>
                        {matchedScenarios.length === 0
                          ? <div style={{ color: "#334F62", fontSize: 9 }}>none</div>
                          : matchedScenarios.map((s, si) => (
                            <div key={si} style={{ marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <div style={{
                                  height: 4, borderRadius: 2, background: AMBER,
                                  width: `${Math.min(100, 40 + si * 12)}%`, maxWidth: "80%",
                                }} />
                              </div>
                              <div style={{ color: "#5A7A90", fontSize: 8, marginTop: 1 }}>
                                {(s?.name || s?.title || s?.id || "Scenario").slice(0, 50)}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Assess */}
          <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}11` }}>
            <button onClick={assess} disabled={assessing} style={{
              background: assessing ? "rgba(41,231,255,0.06)" : `${CY}12`,
              border: `1px solid ${CY}44`, borderRadius: 5, padding: "4px 12px",
              cursor: assessing ? "default" : "pointer",
              color: CY, fontSize: 10, fontFamily: MONO, letterSpacing: 1,
            }}>
              {assessing ? "⟳ assessing…" : "▶ ASSESS"}
            </button>
            {assessment && (
              <div style={{
                marginTop: 8, padding: "7px 10px",
                background: "rgba(41,231,255,0.04)",
                border: `1px solid ${CY}22`, borderRadius: 6,
                fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
              }}>
                {assessment}
              </div>
            )}
          </div>

          <div style={{ padding: "4px 12px 6px", color: "#334F62", fontSize: 9 }}>
            auto-refresh {POLL_MS / 1000}s · {rows.length} profiles · {contactCount} contacts · {scenarioCount} scenarios
          </div>
        </div>
      )}
    </>
  );
}
