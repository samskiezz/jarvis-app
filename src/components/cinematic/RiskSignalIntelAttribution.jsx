/**
 * F79 — RiskSignal × IntelProfile Threat Attribution (RATTR)
 *
 * Parallel-fetches /entities/RiskSignal + /entities/IntelProfile every 90 s.
 * Keyword-correlates each active risk signal against threat intel profiles to classify:
 *   ATTRIBUTED   — ≥1 intel profile matches this risk (known threat actor behind it)
 *   UNATTRIBUTED — no intel profile backs this risk (blind-spot risk)
 *
 * Stat tiles:  signals / intel profiles / attributed / unattributed
 * Filter tabs: ALL | ATTRIBUTED | UNATTRIBUTED
 * Text search: across signal name / description / severity.
 * Expand row → matched intel profile cards with threat type + relevance score bar.
 * Amber badge on UNATTRIBUTED count.
 * ▶ ASSESS: 2-sentence threat attribution brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ RATTR  at left:22440 bottom:8, zIndex:81.
 * Event:   jarvis:rattr-toggle
 * Voice:   "risk attribution" / "rattr" / "attributed risks"
 *          / "unattributed risks" / "threat attribution"
 *          / "who is behind" / "risk actor" / "blind risk"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 22440;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseRisks(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:       String(r.id ?? r.signal_id ?? i),
    name:     r.name ?? r.title ?? r.signal_name ?? `Signal ${i + 1}`,
    severity: r.severity ?? r.level ?? r.priority ?? null,
    body:     [r.description, r.category, r.type, r.tags, r.source, r.domain]
                .filter(Boolean).join(" "),
  }));
}

function normaliseProfiles(raw) {
  return normaliseArray(raw).map((p, i) => ({
    id:         String(p.id ?? p.profile_id ?? i),
    name:       p.name ?? p.actor ?? p.title ?? `Intel Profile ${i + 1}`,
    threat_type: p.threat_type ?? p.type ?? p.category ?? null,
    summary:    p.summary ?? p.description ?? "",
    body:       [p.name, p.actor, p.description, p.type, p.category, p.tags, p.origin, p.tactics]
                  .filter(Boolean).join(" "),
  }));
}

// ─── keyword scoring ──────────────────────────────────────────────────────────

function buildKeywords(strings) {
  return strings
    .flatMap(s => String(s).toLowerCase().split(/[^a-z0-9]+/))
    .filter(t => t.length >= 3);
}

function scoreMatch(keywords, haystack) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const kw of keywords) if (h.includes(kw)) hits++;
  return hits;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [rRes, iRes] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
  ]);
  return {
    risks:    normaliseRisks(rRes.ok    ? await rRes.json() : []),
    profiles: normaliseProfiles(iRes.ok ? await iRes.json() : []),
  };
}

// ─── correlation ──────────────────────────────────────────────────────────────

function correlate(risks, profiles) {
  return risks.map(risk => {
    const kws = buildKeywords([risk.name, risk.body]);
    const matched = profiles
      .map(p => ({ p, score: scoreMatch(kws, `${p.name} ${p.body}`) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      ...risk,
      matched,
      classification: matched.length >= 1 ? "ATTRIBUTED" : "UNATTRIBUTED",
    };
  });
}

// ─── exported intent helpers ──────────────────────────────────────────────────

const RATTR_RE =
  /\b(rattr|risk[\s_-]?attrib(ution)?|attrib(uted)?[\s_-]?risk[s]?|unattrib(uted)?[\s_-]?risk[s]?|threat[\s_-]?attrib(ution)?|who[\s_-]?is[\s_-]?behind|risk[\s_-]?actor[s]?|blind[\s_-]?risk[s]?|intel[\s_-]?attrib(ution)?|risk[\s_-]?intel[\s_-]?match)\b/i;

export function isRattrQuery(q) { return RATTR_RE.test(q); }

export async function buildRattrScript() {
  try {
    const { risks, profiles } = await fetchAll();
    const rows        = correlate(risks, profiles);
    const attributed  = rows.filter(r => r.classification === "ATTRIBUTED").length;
    const unattr      = rows.filter(r => r.classification === "UNATTRIBUTED").length;
    const prompt =
      `Threat attribution analysis: ${risks.length} active risk signals cross-referenced against ` +
      `${profiles.length} intel threat profiles. ` +
      `${attributed} signals are attributed to known threat actors, ` +
      `while ${unattr} are unattributed with no intel backing — these represent blind-spot risks. ` +
      `Provide a 2-sentence operational assessment and flag the most critical unattributed signals requiring urgent intel collection.`;
    const base = apiBase();
    const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body:    JSON.stringify({ message: prompt }),
    });
    const data = await res.json();
    window.dispatchEvent(new CustomEvent("jarvis:rattr-toggle"));
    return (
      data.response ?? data.reply ?? data.message ??
      `${attributed} risks attributed, ${unattr} unattributed across ${profiles.length} intel profiles.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rattr-toggle"));
    return "Risk attribution panel is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const FILTERS = ["ALL", "ATTRIBUTED", "UNATTRIBUTED"];

const FILTER_COLOR = {
  ATTRIBUTED:   GREEN,
  UNATTRIBUTED: AMBER,
};

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     "#FF7A30",
  MED:      AMBER,
  LOW:      "#6CB8E0",
  MEDIUM:   AMBER,
};

export default function RiskSignalIntelAttribution() {
  const [open,       setOpen]       = useState(false);
  const [rows,       setRows]       = useState([]);
  const [profCount,  setProfCount]  = useState(0);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [assessing,  setAssessing]  = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { risks, profiles } = await fetchAll();
      setRows(correlate(risks, profiles));
      setProfCount(profiles.length);
    } catch (e) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:rattr-toggle", handler);
    return () => window.removeEventListener("jarvis:rattr-toggle", handler);
  }, []);

  const handleAssess = useCallback(async (risk) => {
    const key = risk.id;
    if (assessing === key) return;
    setAssessing(key);
    try {
      const matchedNames = risk.matched.map(m => m.p.name).join(", ") || "none";
      const prompt =
        `Risk signal "${risk.name}": ${risk.body.slice(0, 200)}. ` +
        `Severity: ${risk.severity ?? "unknown"}. Attribution: ${risk.classification}. ` +
        `Matched intel profiles: ${matchedNames}. ` +
        `In 2 sentences, assess the threat attribution status and recommend the most urgent ` +
        `intel collection actions to attribute or neutralise this risk.`;
      const base = apiBase();
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response ?? data.reply ?? data.message ?? "No assessment available.";
      setAssessText(prev => ({ ...prev, [key]: text }));
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText(prev => ({ ...prev, [key]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }, [assessing]);

  const attributed  = rows.filter(r => r.classification === "ATTRIBUTED").length;
  const unattributed = rows.filter(r => r.classification === "UNATTRIBUTED").length;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.classification !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.name.toLowerCase().includes(s) && !r.body.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="RiskSignal × IntelProfile Threat Attribution (RATTR)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 81,
          fontFamily: MONO, fontSize: 9, letterSpacing: 1,
          background: "rgba(4,7,14,0.85)", border: `1px solid ${CY}44`,
          color: CY, borderRadius: 4, padding: "3px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ RATTR
        {unattributed > 0 && (
          <span style={{
            background: AMBER, color: "#0B1420", borderRadius: 3,
            padding: "0 4px", fontSize: 8, fontWeight: 700, lineHeight: "14px",
          }}>
            {unattributed}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 40, left: BTN_LEFT - 200, zIndex: 81,
      width: 430, maxHeight: "70vh",
      background: BG, border: `1px solid ${CY}44`,
      borderRadius: 8, display: "flex", flexDirection: "column",
      fontFamily: MONO, overflow: "hidden",
      boxShadow: `0 0 24px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 14px", borderBottom: `1px solid ${CY}22`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
          ◈ RISK SIGNAL × INTEL ATTRIBUTION
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: MUTED,
            cursor: "pointer", fontSize: 12, lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 6, padding: "8px 14px", borderBottom: `1px solid ${CY}18`,
      }}>
        {[
          { label: "SIGNALS",      val: rows.length,   color: CY },
          { label: "INTEL PROF",   val: profCount,     color: CY },
          { label: "ATTRIBUTED",   val: attributed,    color: GREEN },
          { label: "UNATTR",       val: unattributed,  color: unattributed > 0 ? AMBER : MUTED },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            background: "rgba(10,20,35,0.7)", borderRadius: 5,
            padding: "5px 0", textAlign: "center",
            border: `1px solid ${color}22`,
          }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 7, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 14px",
        borderBottom: `1px solid ${CY}18`,
      }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              background: filter === f ? `${CY}20` : "none",
              border: `1px solid ${filter === f ? CY : CY + "33"}`,
              color: filter === f ? CY : MUTED,
              borderRadius: 3, padding: "2px 7px", cursor: "pointer",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* search */}
      <div style={{ padding: "4px 14px", borderBottom: `1px solid ${CY}18` }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search risk signals…"
          style={{
            width: "100%", boxSizing: "border-box",
            fontFamily: MONO, fontSize: 9, background: "rgba(10,20,35,0.6)",
            border: `1px solid ${CY}33`, borderRadius: 4,
            color: CY, padding: "3px 8px", outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {loading && rows.length === 0 && (
          <div style={{ color: MUTED, fontSize: 9, padding: "12px 0", textAlign: "center", letterSpacing: 1 }}>
            LOADING…
          </div>
        )}
        {error && (
          <div style={{ color: RED, fontSize: 9, padding: "6px 0" }}>{error}</div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={{ color: MUTED, fontSize: 9, padding: "12px 0", textAlign: "center", letterSpacing: 1 }}>
            NO RESULTS
          </div>
        )}
        {filtered.map(risk => {
          const isExp    = expanded === risk.id;
          const cls      = risk.classification;
          const clsColor = FILTER_COLOR[cls] ?? MUTED;
          const sevColor = SEV_COLOR[String(risk.severity ?? "").toUpperCase()] ?? MUTED;
          return (
            <div
              key={risk.id}
              onClick={() => setExpanded(isExp ? null : risk.id)}
              style={{
                marginBottom: 4, padding: "7px 10px",
                background: "rgba(10,18,30,0.7)", borderRadius: 5,
                border: `1px solid ${clsColor}33`,
                cursor: "pointer", transition: "border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: clsColor, flexShrink: 0,
                  boxShadow: cls === "UNATTRIBUTED" ? `0 0 6px ${clsColor}` : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{risk.name}</span>
                {risk.severity && (
                  <span style={{
                    fontFamily: MONO, fontSize: 8, color: sevColor,
                    border: `1px solid ${sevColor}55`, borderRadius: 3,
                    padding: "1px 4px", letterSpacing: 1, flexShrink: 0,
                  }}>
                    {String(risk.severity).toUpperCase()}
                  </span>
                )}
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: clsColor,
                  border: `1px solid ${clsColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {cls}
                </span>
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {risk.matched.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        ATTRIBUTED TO
                      </div>
                      {risk.matched.map(({ p, score }) => (
                        <div key={p.id} style={{
                          marginBottom: 4, padding: "4px 8px",
                          background: "rgba(12,22,36,0.8)", borderRadius: 4,
                          border: `1px solid ${CY}22`,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            alignItems: "center", marginBottom: 3,
                          }}>
                            <span style={{ color: "#B0D0E0", fontSize: 10 }}>{p.name}</span>
                            {p.threat_type && (
                              <span style={{ color: AMBER, fontSize: 8, letterSpacing: 1 }}>
                                {String(p.threat_type).toUpperCase()}
                              </span>
                            )}
                          </div>
                          {p.summary && (
                            <div style={{ color: MUTED, fontSize: 9, marginBottom: 3, lineHeight: 1.4 }}>
                              {p.summary.slice(0, 120)}
                            </div>
                          )}
                          {/* relevance bar */}
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <div style={{
                              flex: 1, height: 3, background: `${CY}18`, borderRadius: 2,
                            }}>
                              <div style={{
                                width: `${Math.min(100, score * 10)}%`,
                                height: "100%", background: CY, borderRadius: 2,
                              }} />
                            </div>
                            <span style={{ color: CY, fontSize: 9 }}>score {score}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No intel profiles matched — this risk is unattributed.
                    </div>
                  )}

                  {/* ASSESS button */}
                  <button
                    onClick={e => { e.stopPropagation(); handleAssess(risk); }}
                    disabled={assessing === risk.id}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${CY}18`, border: `1px solid ${CY}44`,
                      color: CY, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === risk.id ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === risk.id ? "ASSESSING…" : "▶ ASSESS ATTRIBUTION"}
                  </button>

                  {assessText[risk.id] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${CY}0A`, border: `1px solid ${CY}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[risk.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{rows.length} SIGNALS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={load}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
