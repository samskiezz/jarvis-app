/**
 * F224 — Ops Event × Contact × Investment × Scenario Integrated Response Map (IRCMAP)
 *
 * Parallel-fetches /v1/ops/events + /entities/Contact + /entities/Investment + /v1/scenario/list
 * and keyword-correlates each ops event against contacts AND investments AND scenarios:
 *
 *   FULLY_MAPPED   — matched contact + investment + scenario (full integrated response)
 *   DUAL_COVERED   — matched any two sources (partial response coverage)
 *   SINGLE_LINKED  — matched exactly one source (minimal response linkage)
 *   UNADDRESSED    — no matches in any source (integrated response gap)
 *
 * Stat tiles: OPS EVENTS / CONTACTS / INVESTMENTS / SCENARIOS + four class counts + COVERAGE%.
 * Amber badge on UNADDRESSED count.
 * Filter tabs ALL / FULLY_MAPPED / DUAL_COVERED / SINGLE_LINKED / UNADDRESSED + text search.
 * Expand event → matched contact cards (teal) + investment cards (gold) + scenario cards (cyan)
 *   with relevance bars.
 * ▶ ASSESS INTEGRATED RESPONSE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ircmap-toggle event.
 *
 * Voice triggers:
 *   "ircmap / ops response map / integrated response / event contact investment /
 *    unaddressed ops / ops event response / response coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_067_800;
const Z_INDEX  = 285;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const IRCMAP_RE = /\b(ircmap|ops[\s-]response[\s-]map|integrated[\s-]response|event[\s-]contact[\s-]investment|unaddressed[\s-]ops|ops[\s-]event[\s-]response|response[\s-]coverage)\b/i;

export function isIrcmapQuery(q = "") { return IRCMAP_RE.test(q); }

export async function buildIrcmapScript() {
  const base = apiBase();
  const [evR, coR, invR, scR] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/entities/Investment`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);
  const events      = evR.status  === "fulfilled" ? (evR.value?.items  || evR.value  || []) : [];
  const contacts    = coR.status  === "fulfilled" ? (coR.value?.items  || coR.value  || []) : [];
  const investments = invR.status === "fulfilled" ? (invR.value?.items || invR.value || []) : [];
  const scenarios   = scR.status  === "fulfilled" ? (scR.value?.items  || scR.value  || []) : [];

  let fullyMapped = 0, unaddressed = 0;
  for (const ev of events) {
    const kws   = keywords(eventText(ev));
    const hasCo = contacts.some(c => scoreText(contactText(c), kws) > 0);
    const hasIn = investments.some(i => scoreText(investmentText(i), kws) > 0);
    const hasSc = scenarios.some(s => scoreText(scenarioText(s), kws) > 0);
    if (hasCo && hasIn && hasSc) fullyMapped++;
    else if (!hasCo && !hasIn && !hasSc) unaddressed++;
  }
  const total   = events.length;
  const covPct  = total ? Math.round((fullyMapped / total) * 100) : 0;
  return `IRCMAP Integrated Response Map online, sir. I have cross-referenced ${total} operational events against ${contacts.length} contacts, ${investments.length} investments, and ${scenarios.length} scenario playbooks. ${fullyMapped} events are fully mapped with coverage across all three response dimensions, representing ${covPct}% integrated response readiness. ${unaddressed} events are completely unaddressed with no contact, investment, or scenario linkage, representing critical operational response gaps requiring immediate attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const TE   = "#14B8A6";
const GD   = "#EAB308";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_MAPPED:  GR,
  DUAL_COVERED:  CY,
  SINGLE_LINKED: AM,
  UNADDRESSED:   RD,
};

const TABS = ["ALL", "FULLY_MAPPED", "DUAL_COVERED", "SINGLE_LINKED", "UNADDRESSED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function eventText(e) {
  return [e.name, e.title, e.description, e.type, e.category, e.location, e.summary, e.details].filter(Boolean).join(" ");
}
function contactText(c) {
  return [c.name, c.role, c.org, c.organisation, c.email, c.tags, c.description, c.title].filter(Boolean).join(" ");
}
function investmentText(i) {
  return [i.name, i.title, i.description, i.type, i.sector, i.tags, i.summary, i.notes].filter(Boolean).join(" ");
}
function scenarioText(s) {
  return [s.name, s.title, s.description, s.type, s.tags, s.objective, s.summary].filter(Boolean).join(" ");
}

function classify(event, contacts, investments, scenarios) {
  const kws = keywords(eventText(event));
  const matchedCo = contacts
    .map(c => ({ ...c, _score: scoreText(contactText(c), kws) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedIn = investments
    .map(i => ({ ...i, _score: scoreText(investmentText(i), kws) }))
    .filter(i => i._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);
  const matchedSc = scenarios
    .map(s => ({ ...s, _score: scoreText(scenarioText(s), kws) }))
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 4);

  const hasCo = matchedCo.length > 0;
  const hasIn = matchedIn.length > 0;
  const hasSc = matchedSc.length > 0;
  const matchCount = [hasCo, hasIn, hasSc].filter(Boolean).length;

  let cls;
  if (matchCount === 3) cls = "FULLY_MAPPED";
  else if (matchCount === 2) cls = "DUAL_COVERED";
  else if (matchCount === 1) cls = "SINGLE_LINKED";
  else cls = "UNADDRESSED";

  return { ...event, _cls: cls, _co: matchedCo, _inv: matchedIn, _sc: matchedSc };
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

export default function OpsEventIntegratedResponseMap() {
  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [events, setEvents]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [investments, setInvs]  = useState([]);
  const [scenarios, setScens]   = useState([]);
  const [classified, setClass]  = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief]       = useState("");
  const [assessing, setAssessing] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const [evR, coR, invR, scR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/entities/Investment`).then(r => r.json()),
        fetch(`${base}/v1/scenario/list`).then(r => r.json()),
      ]);
      const ev = evR.status  === "fulfilled" ? (evR.value?.items  || evR.value  || []) : [];
      const co = coR.status  === "fulfilled" ? (coR.value?.items  || coR.value  || []) : [];
      const iv = invR.status === "fulfilled" ? (invR.value?.items || invR.value || []) : [];
      const sc = scR.status  === "fulfilled" ? (scR.value?.items  || scR.value  || []) : [];
      setEvents(ev);
      setContacts(co);
      setInvs(iv);
      setScens(sc);
      setClass(ev.map(e => classify(e, co, iv, sc)));
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
    window.addEventListener("jarvis:ircmap-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ircmap-toggle", onToggle);
  }, []);

  const fullyMapped  = classified.filter(c => c._cls === "FULLY_MAPPED").length;
  const dualCovered  = classified.filter(c => c._cls === "DUAL_COVERED").length;
  const singleLinked = classified.filter(c => c._cls === "SINGLE_LINKED").length;
  const unaddressed  = classified.filter(c => c._cls === "UNADDRESSED").length;
  const total        = classified.length;
  const covPct       = total ? Math.round((fullyMapped / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || eventText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `IRCMAP: ${total} ops events — FULLY_MAPPED: ${fullyMapped}, DUAL_COVERED: ${dualCovered}, SINGLE_LINKED: ${singleLinked}, UNADDRESSED: ${unaddressed} (${covPct}% coverage). Contacts: ${contacts.length}. Investments: ${investments.length}. Scenarios: ${scenarios.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `IRCMAP integrated response map assessment. Context: ${ctx}. Provide a 2-sentence brief identifying which unaddressed operational events represent the highest response capability gaps and what contact, investment, or scenario linkages should be established to improve coverage. Be concise and direct.` }),
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
        title="Ops Event × Contact × Investment × Scenario Integrated Response Map (IRCMAP)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${TE}55`,
          color: TE, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {unaddressed > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {unaddressed}
          </span>
        )}
        ◈ IRCMAP
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
        <span style={{ color: TE, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ IRCMAP</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Ops Event × Contact × Investment × Scenario — Integrated Response Map
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
          ["OPS EVENTS",    total,              TE],
          ["CONTACTS",      contacts.length,    CY],
          ["INVESTMENTS",   investments.length, GD],
          ["SCENARIOS",     scenarios.length,   CY],
          ["FULLY MAPPED",  fullyMapped,        GR],
          ["DUAL COVERED",  dualCovered,        CY],
          ["SINGLE LINKED", singleLinked,       AM],
          ["UNADDRESSED",   unaddressed,        RD],
          ["COVERAGE%",     covPct + "%",       covPct >= 70 ? GR : covPct >= 40 ? AM : RD],
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

      {/* Coverage bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          INTEGRATED RESPONSE COVERAGE — {covPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: covPct + "%",
            background: covPct >= 70 ? GR : covPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(TE), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS INTEGRATED RESPONSE"}
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
          placeholder="search events…"
          style={{
            background: "rgba(20,184,166,0.05)", border: `1px solid ${TE}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} events
        </span>
      </div>

      {/* Events list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading events…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((ev, i) => {
            const col   = CLASS_COLOR[ev._cls] || "#6E8AA0";
            const isExp = expanded === i;
            const maxCo = ev._co[0]?._score || 1;
            const maxIn = ev._inv[0]?._score || 1;
            const maxSc = ev._sc[0]?._score || 1;
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
                    {ev._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.name || ev.title || `Event ${i + 1}`}
                  </span>
                  {ev.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{ev.type}</span>
                  )}
                  {ev.category && (
                    <span style={{ fontSize: 9, color: "#4A6A80", marginLeft: 4 }}>{ev.category}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {ev.description && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {ev.description}
                      </div>
                    )}

                    {/* Matched contacts */}
                    {ev._co.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED CONTACTS ({ev._co.length})
                        </div>
                        {ev._co.map((c, ci) => (
                          <div key={ci} style={{
                            background: TE + "11", border: `1px solid ${TE}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: TE, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name || `Contact ${ci + 1}`}
                              </span>
                              {c.role && (
                                <span style={{ fontSize: 8, color: TE, border: `1px solid ${TE}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {c.role}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={c._score} max={maxCo} col={TE} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched investments */}
                    {ev._inv.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: GD, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED INVESTMENTS ({ev._inv.length})
                        </div>
                        {ev._inv.map((inv, ii) => (
                          <div key={ii} style={{
                            background: GD + "11", border: `1px solid ${GD}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GD, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {inv.name || inv.title || `Investment ${ii + 1}`}
                              </span>
                              {inv.type && (
                                <span style={{ fontSize: 8, color: GD, border: `1px solid ${GD}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {inv.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={inv._score} max={maxIn} col={GD} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched scenarios */}
                    {ev._sc.length > 0 && (
                      <div>
                        <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED SCENARIOS ({ev._sc.length})
                        </div>
                        {ev._sc.map((sc, si) => (
                          <div key={si} style={{
                            background: CY + "11", border: `1px solid ${CY}33`,
                            borderRadius: 4, padding: "5px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: CY, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {sc.name || sc.title || `Scenario ${si + 1}`}
                              </span>
                              {sc.type && (
                                <span style={{ fontSize: 8, color: CY, border: `1px solid ${CY}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {sc.type}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={sc._score} max={maxSc} col={CY} />
                          </div>
                        ))}
                      </div>
                    )}

                    {ev._cls === "UNADDRESSED" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching contacts, investments, or scenario playbooks found. This operational event represents an integrated response gap — no personnel, financial, or playbook coverage exists.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ color: "#4A6A80", fontSize: 11, padding: "20px 0", textAlign: "center" }}>
              No events match current filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
