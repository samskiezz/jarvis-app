/**
 * F188 — Contact × Knowledge × Scenario Personnel Readiness Map (CPRSMAP)
 *
 * Parallel-fetches /entities/Contact + /knowledge/ + /v1/scenario/list
 * and keyword-correlates each contact against KB articles AND scenarios to classify:
 *
 *   FULLY_READY        — matched KB article + scenario (full readiness grounding)
 *   KB_INFORMED        — KB match only, no scenario assignment
 *   SCENARIO_ASSIGNED  — scenario match only, no KB coverage
 *   UNREADY            — no matches (personnel readiness gap)
 *
 * Stat tiles: CONTACTS / KB ARTICLES / SCENARIOS + four class counts + READY%.
 * Amber badge on UNREADY count.
 * Filter tabs ALL / FULLY_READY / KB_INFORMED / SCENARIO_ASSIGNED / UNREADY + text search.
 * Expand contact → matched KB article cards (green) + scenario cards (cyan) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:cprsmap-toggle event.
 *
 * Voice triggers:
 *   "cprsmap / personnel readiness / contact readiness / unready contacts /
 *    contact scenario / contact kb / personnel scenario readiness"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_047_640;
const Z_INDEX  = 249;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CPRSMAP_RE = /\b(cprsmap|personnel[\s-]readiness|contact[\s-]readiness|unready[\s-]contacts?|contact[\s-]scenario|contact[\s-]kb|personnel[\s-]scenario[\s-]readiness)\b/i;

export function isCprsmapQuery(q = "") { return CPRSMAP_RE.test(q); }

export async function buildCprsmapScript() {
  const base = apiBase();
  const [contactsRes, kbRes, scenariosRes] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const contacts  = (contactsRes.status  === "fulfilled" ? (contactsRes.value?.items  || contactsRes.value  || []) : []);
  const articles  = (kbRes.status        === "fulfilled" ? (kbRes.value?.items        || kbRes.value        || []) : []);
  const scenarios = (scenariosRes.status === "fulfilled" ? (scenariosRes.value?.items || scenariosRes.value || []) : []);
  const unready = contacts.filter(c => {
    const kws = keywords(contactText(c));
    const hasKb = articles.some(a => scoreText(kbText(a), kws) > 0);
    const hasSc = scenarios.some(s => scoreText(scenText(s), kws) > 0);
    return !hasKb && !hasSc;
  }).length;
  const total = contacts.length;
  const ready = total - unready;
  const pct   = total ? Math.round((ready / total) * 100) : 0;
  return `CPRSMAP Personnel Readiness Map online, sir. I am correlating ${total} contacts against ${articles.length} knowledge articles and ${scenarios.length} scenario playbooks. ${ready} personnel have readiness grounding — ${pct}% coverage. ${unready} contact${unready === 1 ? "" : "s"} remain unready with no KB backing and no scenario assignment. Recommend immediate knowledge and scenario alignment for those personnel.`;
}

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_READY:       GR,
  KB_INFORMED:       "#22D3EE",
  SCENARIO_ASSIGNED: OR,
  UNREADY:           AM,
};

const TABS = ["ALL", "FULLY_READY", "KB_INFORMED", "SCENARIO_ASSIGNED", "UNREADY"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return [c.name, c.role, c.org, c.email, c.title, c.department, c.tags, c.description].filter(Boolean).join(" ");
}
function kbText(a) {
  return [a.title, a.content, a.summary, a.tags, a.category, a.topic].filter(Boolean).join(" ");
}
function scenText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.objectives, s.category].filter(Boolean).join(" ");
}

function classify(contact, articles, scenarios) {
  const kws = keywords(contactText(contact));
  const matchedKb = articles
    .map(a => ({ ...a, _score: scoreText(kbText(a), kws) }))
    .filter(a => a._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedSc = scenarios
    .map(s => ({ ...s, _score: scoreText(scenText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const hasKb = matchedKb.length > 0;
  const hasSc = matchedSc.length > 0;
  let cls;
  if (hasKb && hasSc) cls = "FULLY_READY";
  else if (hasKb)     cls = "KB_INFORMED";
  else if (hasSc)     cls = "SCENARIO_ASSIGNED";
  else                cls = "UNREADY";
  return { ...contact, _cls: cls, _kb: matchedKb, _sc: matchedSc };
}

export default function ContactPersonnelReadinessMap() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [contacts, setContacts]     = useState([]);
  const [articles, setArticles]     = useState([]);
  const [scenarios, setScenarios]   = useState([]);
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
      const [contactsRes, kbRes, scenariosRes] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      ]);
      const ct = contactsRes.status  === "fulfilled" ? (contactsRes.value?.items  || contactsRes.value  || []) : [];
      const ar = kbRes.status        === "fulfilled" ? (kbRes.value?.items        || kbRes.value        || []) : [];
      const sc = scenariosRes.status === "fulfilled" ? (scenariosRes.value?.items || scenariosRes.value || []) : [];
      setContacts(ct);
      setArticles(ar);
      setScenarios(sc);
      setClassified(ct.map(c => classify(c, ar, sc)));
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
    window.addEventListener("jarvis:cprsmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:cprsmap-toggle", onToggle);
  }, []);

  const fullyReady   = classified.filter(c => c._cls === "FULLY_READY").length;
  const kbInformed   = classified.filter(c => c._cls === "KB_INFORMED").length;
  const scenAssigned = classified.filter(c => c._cls === "SCENARIO_ASSIGNED").length;
  const unready      = classified.filter(c => c._cls === "UNREADY").length;
  const total        = classified.length;
  const readyPct     = total ? Math.round(((fullyReady + kbInformed + scenAssigned) / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || contactText(c).toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const base = apiBase();
      const ctx = `Contacts:${total} KBArticles:${articles.length} Scenarios:${scenarios.length} FullyReady:${fullyReady} KbInformed:${kbInformed} ScenarioAssigned:${scenAssigned} Unready:${unready} ReadyCoverage:${readyPct}%`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `In 2 sentences, assess personnel readiness coverage gaps: ${ctx}` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(txt);
      if (txt) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: txt }),
        }).then(async res => {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.play().catch(() => {});
        }).catch(() => {});
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        title="Contact × Knowledge × Scenario Personnel Readiness Map (CPRSMAP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: open ? AM : "rgba(5,8,13,0.85)",
          border: `1px solid ${AM}`,
          color: open ? "#000" : AM,
          fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer",
          boxShadow: unready > 0 ? `0 0 8px ${AM}88` : "none",
          whiteSpace: "nowrap",
        }}
      >
        ◈ CPRSMAP
        {unready > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#000",
            borderRadius: 8, fontSize: 8, padding: "0 4px", fontWeight: 700,
          }}>{unready}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          zIndex: Z_INDEX + 100, width: 820, maxHeight: "82vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 8, fontFamily: FONT, fontSize: 11,
          color: "#DCEBF5", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: `0 0 40px rgba(0,207,255,0.12)`,
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ color: AM, fontWeight: 700, letterSpacing: 2 }}>CPRSMAP</span>
              <span style={{ color: "#6B7280", marginLeft: 8, fontSize: 10 }}>Contact × Knowledge × Scenario — Personnel Readiness Map</span>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ padding: "8px 14px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
            {[
              { label: "CONTACTS",          val: contacts.length,  clr: OR },
              { label: "KB ARTICLES",       val: articles.length,  clr: GR },
              { label: "SCENARIOS",         val: scenarios.length, clr: CY },
              { label: "FULLY READY",       val: fullyReady,       clr: GR },
              { label: "KB INFORMED",       val: kbInformed,       clr: "#22D3EE" },
              { label: "SCENARIO ASSIGNED", val: scenAssigned,     clr: OR },
              { label: "UNREADY",           val: unready,          clr: AM },
              { label: "READY%",            val: `${readyPct}%`,   clr: readyPct >= 70 ? GR : readyPct >= 40 ? AM : RD },
            ].map(t => (
              <div key={t.label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${t.clr}33`,
                borderRadius: 4, padding: "4px 8px", minWidth: 80, textAlign: "center",
              }}>
                <div style={{ color: t.clr, fontSize: 14, fontWeight: 700 }}>{loading ? "…" : t.val}</div>
                <div style={{ color: "#6B7280", fontSize: 8, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {!loading && total > 0 && (
            <div style={{ padding: "4px 14px", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ height: 4, background: "#1e2936", borderRadius: 2 }}>
                <div style={{ height: "100%", width: `${readyPct}%`, background: readyPct >= 70 ? GR : readyPct >= 40 ? AM : RD, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          )}

          {/* Controls */}
          <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? AM : "rgba(0,0,0,0.4)",
                border: `1px solid ${tab === t ? AM : "#334155"}`,
                color: tab === t ? "#000" : "#94A3B8",
                fontFamily: FONT, fontSize: 9, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t.replace(/_/g, " ")}</button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid #334155`,
                color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3,
                width: 160, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
            {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
            {!loading && !error && visible.length === 0 && (
              <div style={{ color: "#6B7280", padding: 12, textAlign: "center" }}>No contacts match current filter.</div>
            )}
            {visible.map((c, i) => {
              const clr   = CLASS_COLOR[c._cls] || AM;
              const isExp = expanded === i;
              return (
                <div key={c.id || i} style={{ marginBottom: 4 }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 4,
                      border: `1px solid ${isExp ? clr : "transparent"}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: clr, fontSize: 9, letterSpacing: 1, minWidth: 140 }}>{c._cls.replace(/_/g, " ")}</span>
                    <span style={{ flex: 1, color: "#DCEBF5", fontSize: 10 }}>{c.name || c.title || "Unknown Contact"}</span>
                    {c.role && <span style={{ color: OR, fontSize: 8, border: `1px solid ${OR}44`, borderRadius: 2, padding: "0 4px" }}>{c.role}</span>}
                    {c.org && <span style={{ color: "#94A3B8", fontSize: 8 }}>{c.org}</span>}
                    <span style={{ color: "#334155", fontSize: 9 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "6px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "0 0 4px 4px", marginTop: 1 }}>
                      {c._kb.length > 0 && (
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>KNOWLEDGE ARTICLES ({c._kb.length})</div>
                          {c._kb.map((a, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(34,197,94,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{a.title || a.name || "Article"}</span>
                                {a.category && <span style={{ color: GR, fontSize: 8, border: `1px solid ${GR}33`, borderRadius: 2, padding: "0 3px" }}>{a.category}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (a._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {c._sc.length > 0 && (
                        <div>
                          <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>SCENARIOS ({c._sc.length})</div>
                          {c._sc.map((s, k) => (
                            <div key={k} style={{ marginBottom: 3, padding: "3px 6px", background: "rgba(0,207,255,0.06)", borderRadius: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{s.name || s.title || "Scenario"}</span>
                                {s.type && <span style={{ color: CY, fontSize: 8, border: `1px solid ${CY}33`, borderRadius: 2, padding: "0 3px" }}>{s.type}</span>}
                              </div>
                              <div style={{ marginTop: 2, height: 3, background: "#1e2936", borderRadius: 2 }}>
                                <div style={{ height: "100%", width: `${Math.min(100, (s._score / 5) * 100)}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {c._kb.length === 0 && c._sc.length === 0 && (
                        <div style={{ color: "#6B7280", fontSize: 10, padding: "4px 0" }}>No KB article or scenario coverage — personnel readiness gap.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "#1e2936" : AM, color: assessing ? "#6B7280" : "#000",
                border: "none", fontFamily: FONT, fontSize: 9, letterSpacing: 1,
                padding: "4px 12px", borderRadius: 3, cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS READINESS"}
            </button>
            {brief && <div style={{ flex: 1, color: "#94A3B8", fontSize: 10, lineHeight: 1.4 }}>{brief}</div>}
            <span style={{ color: "#334155", fontSize: 9, marginLeft: "auto" }}>
              auto-refresh 90s · /entities/Contact · /knowledge/ · /v1/scenario/list
            </span>
          </div>
        </div>
      )}
    </>
  );
}
