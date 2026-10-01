/**
 * F228 — Ops Event × Contact × Knowledge Situational Awareness Map (OCASAM)
 *
 * Parallel-fetches /v1/ops/events + /entities/Contact + /knowledge/
 * and keyword-correlates each ops event against contacts AND KB articles:
 *
 *   FULLY_AWARE   — matched contact + KB article (complete situational awareness)
 *   CONTACT_LINKED — matched contact only (no KB coverage)
 *   KB_ONLY        — matched KB article only (no contact coverage)
 *   BLIND          — no matches (situational awareness gap)
 *
 * Stat tiles: OPS EVENTS / CONTACTS / KB ARTICLES + four class counts + AWARENESS%.
 * Amber badge on BLIND count.
 * Filter tabs ALL / FULLY_AWARE / CONTACT_LINKED / KB_ONLY / BLIND + text search.
 * Expand event → matched contact cards (teal) + KB article cards (green).
 * ▶ ASSESS AWARENESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ocasam-toggle event.
 *
 * Voice triggers:
 *   "ocasam / ops awareness / situational awareness / event contact knowledge /
 *    blind ops events / ops situational awareness"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_070_040;
const Z_INDEX  = 289;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OCASAM_RE = /\b(ocasam|ops[\s-]awareness|situational[\s-]awareness|event[\s-]contact[\s-]knowledge|blind[\s-]ops[\s-]events?|ops[\s-]situational[\s-]awareness)\b/i;

export function isOcasamQuery(q = "") { return OCASAM_RE.test(q); }

export async function buildOcasamScript() {
  const base = apiBase();
  const [oR, cR, kR] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
  ]);
  const events   = oR.status === "fulfilled" ? (oR.value?.items || oR.value?.events || oR.value || []) : [];
  const contacts = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.contacts || cR.value || []) : [];
  const kb       = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];

  let fullyAware = 0, blind = 0;
  for (const ev of events) {
    const kws     = keywords(eventText(ev));
    const hasCon  = contacts.some(c => scoreText(contactText(c), kws) > 0);
    const hasKb   = kb.some(a => scoreText(articleText(a), kws) > 0);
    if (hasCon && hasKb) fullyAware++;
    else if (!hasCon && !hasKb) blind++;
  }
  const total     = events.length;
  const awareness = total ? Math.round((fullyAware / total) * 100) : 0;
  return `OCASAM Ops Event Situational Awareness Map online, sir. I have cross-referenced ${total} operational events against ${contacts.length} contacts and ${kb.length} knowledge base articles. ${fullyAware} events have full situational awareness — both a responsible contact and knowledge base coverage — representing ${awareness}% comprehensive situational coverage. ${blind} events are completely blind with no contact attribution and no knowledge base support whatsoever — these represent critical situational awareness gaps requiring immediate analyst attention, sir.`;
}

const CY   = "#00CFFF";
const AM   = "#F59E0B";
const RD   = "#EF4444";
const GR   = "#22C55E";
const TE   = "#14B8A6";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_AWARE:    GR,
  CONTACT_LINKED: TE,
  KB_ONLY:        CY,
  BLIND:          AM,
};

const TABS = ["ALL", "FULLY_AWARE", "CONTACT_LINKED", "KB_ONLY", "BLIND"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function eventText(e) {
  return [e.title, e.name, e.description, e.type, e.category, e.tags, e.source, e.location].filter(Boolean).join(" ");
}
function contactText(c) {
  return [c.name, c.email, c.role, c.organization, c.org, c.tags, c.notes].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.title, a.content, a.summary, a.tags, a.category].filter(Boolean).join(" ");
}

function classify(ev, contacts, kb) {
  const kws         = keywords(eventText(ev));
  const matchedCon  = contacts.map(c => ({ ...c, _score: scoreText(contactText(c), kws) })).filter(c => c._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);
  const matchedKb   = kb.map(a => ({ ...a, _score: scoreText(articleText(a), kws) })).filter(a => a._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);

  const hasCon = matchedCon.length > 0;
  const hasKb  = matchedKb.length > 0;
  let cls;
  if (hasCon && hasKb)       cls = "FULLY_AWARE";
  else if (hasCon && !hasKb) cls = "CONTACT_LINKED";
  else if (!hasCon && hasKb) cls = "KB_ONLY";
  else                       cls = "BLIND";

  return { ...ev, _cls: cls, _con: matchedCon, _kb: matchedKb };
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

export default function OpsEventContactKnowledgeMap() {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [events, setEvents]       = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [kb, setKb]               = useState([]);
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
      const [oR, cR, kR] = await Promise.allSettled([
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
      ]);
      const evs = oR.status === "fulfilled" ? (oR.value?.items || oR.value?.events || oR.value || []) : [];
      const cts = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.contacts || cR.value || []) : [];
      const ks  = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
      setEvents(evs);
      setContacts(cts);
      setKb(ks);
      setClassified(evs.map(e => classify(e, cts, ks)));
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
    window.addEventListener("jarvis:ocasam-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ocasam-toggle", onToggle);
  }, []);

  const fullyAware    = classified.filter(c => c._cls === "FULLY_AWARE").length;
  const contactLinked = classified.filter(c => c._cls === "CONTACT_LINKED").length;
  const kbOnly        = classified.filter(c => c._cls === "KB_ONLY").length;
  const blind         = classified.filter(c => c._cls === "BLIND").length;
  const total         = classified.length;
  const awarenessPct  = total ? Math.round((fullyAware / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || eventText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `OCASAM: ${total} ops events — FULLY_AWARE: ${fullyAware}, CONTACT_LINKED: ${contactLinked}, KB_ONLY: ${kbOnly}, BLIND: ${blind} (${awarenessPct}% full awareness). Contacts: ${contacts.length}. KB articles: ${kb.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `OCASAM situational awareness assessment. Context: ${ctx}. Provide a 2-sentence brief identifying the most critical blind ops events and what contact attribution or knowledge base coverage should be established to close the situational awareness gaps. Be concise and direct.` }),
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
        title="Ops Event × Contact × Knowledge Situational Awareness Map (OCASAM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${CY}55`,
          color: CY, padding: "3px 7px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {blind > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 3, padding: "0 4px", marginRight: 4, fontSize: 9 }}>
            {blind}
          </span>
        )}
        ◈ OCASAM
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
        <span style={{ color: CY, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>◈ OCASAM</span>
        <span style={{ color: "#6E8AA0", fontSize: 10, flex: 1 }}>
          Ops Event × Contact × Knowledge — Situational Awareness Map
        </span>
        {loading && <span style={{ color: CY, fontSize: 10 }}>◌ loading…</span>}
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
          ["OPS EVENTS",      total,           CY],
          ["CONTACTS",        contacts.length, TE],
          ["KB ARTICLES",     kb.length,       GR],
          ["FULLY AWARE",     fullyAware,      GR],
          ["CONTACT LINKED",  contactLinked,   TE],
          ["KB ONLY",         kbOnly,          CY],
          ["BLIND",           blind,           AM],
          ["AWARENESS%",      awarenessPct + "%", awarenessPct >= 70 ? GR : awarenessPct >= 40 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,207,255,0.04)", border: `1px solid ${col}33`,
            borderRadius: 5, padding: "5px 10px", minWidth: 85, textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#4A6A80", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Awareness bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: "#4A6A80", letterSpacing: 1, marginBottom: 3 }}>
          FULL SITUATIONAL AWARENESS — {awarenessPct}%
        </div>
        <div style={{ height: 6, background: "#0D1825", borderRadius: 3 }}>
          <div style={{
            height: 6, borderRadius: 3, transition: "width 0.6s",
            width: awarenessPct + "%",
            background: awarenessPct >= 70 ? GR : awarenessPct >= 40 ? AM : RD,
          }} />
        </div>
      </div>

      {/* Assess button */}
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={assess} disabled={assessing || loading} style={{
          ...smallBtn(CY), fontSize: 11, padding: "4px 12px",
          opacity: assessing ? 0.5 : 1,
        }}>
          {assessing ? "◌ assessing…" : "▶ ASSESS AWARENESS"}
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
            ...smallBtn(tab === t ? CY : "#4A6A80"),
            background: tab === t ? CY + "22" : "transparent",
          }}>
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search events…"
          style={{
            background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}33`,
            color: "#DCEBF5", fontFamily: FONT, fontSize: 10, padding: "2px 8px",
            borderRadius: 3, outline: "none", width: 180,
          }}
        />
        <span style={{ color: "#4A6A80", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} events
        </span>
      </div>

      {/* Event list */}
      {loading && !classified.length ? (
        <div style={{ color: "#4A6A80", fontSize: 11, padding: 20 }}>◌ loading ops events…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visible.map((ev, i) => {
            const col    = CLASS_COLOR[ev._cls] || "#6E8AA0";
            const isExp  = expanded === i;
            const maxCon = ev._con[0]?._score || 1;
            const maxKb  = ev._kb[0]?._score || 1;
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
                    {ev._cls}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title || ev.name || `Event ${i + 1}`}
                  </span>
                  {ev.type && (
                    <span style={{ fontSize: 9, color: "#4A6A80" }}>{ev.type}</span>
                  )}
                  <span style={{ color: "#4A6A80", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "0 10px 10px" }}>
                    {(ev.description || ev.summary) && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, marginBottom: 6 }}>
                        {ev.description || ev.summary}
                      </div>
                    )}

                    {/* Matched contacts */}
                    {ev._con.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: TE, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED CONTACTS ({ev._con.length})
                        </div>
                        {ev._con.map((c, ci) => (
                          <div key={ci} style={{ background: TE + "11", border: `1px solid ${TE}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: TE, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {c.name || `Contact ${ci + 1}`}
                              </span>
                              {(c.role || c.organization || c.org) && (
                                <span style={{ fontSize: 8, color: TE, border: `1px solid ${TE}55`, borderRadius: 2, padding: "0 3px" }}>
                                  {c.role || c.organization || c.org}
                                </span>
                              )}
                            </div>
                            <RelevanceBar score={c._score} max={maxCon} col={TE} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Matched KB articles */}
                    {ev._kb.length > 0 && (
                      <div>
                        <div style={{ color: GR, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                          ◈ MATCHED KNOWLEDGE BASE ({ev._kb.length})
                        </div>
                        {ev._kb.map((a, ai) => (
                          <div key={ai} style={{ background: GR + "11", border: `1px solid ${GR}33`, borderRadius: 4, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: GR, fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {a.title || `Article ${ai + 1}`}
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

                    {ev._cls === "BLIND" && (
                      <div style={{ color: "#6E8AA0", fontSize: 10, fontStyle: "italic", marginTop: 4 }}>
                        No matching contacts or knowledge base articles found. This ops event is completely blind — a critical situational awareness gap with no contact attribution and no knowledge coverage.
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
