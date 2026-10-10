/**
 * F231 — Contact × Knowledge × Ops Event Situational Awareness Bridge (CKOEAB)
 *
 * Parallel-fetches /entities/Contact + /knowledge/ + /v1/ops/events
 * and keyword-correlates each contact against knowledge articles AND ops events:
 *
 *   FULLY_AWARE     — matched knowledge article + ops event (full situational awareness)
 *   KNOWLEDGE_LINKED — matched knowledge only (no ops event exposure)
 *   EVENT_EXPOSED    — matched ops event only (no backing knowledge article)
 *   UNAWARE          — no matches (awareness gap)
 *
 * Stat tiles: CONTACTS / KNOWLEDGE ARTICLES / OPS EVENTS + four class counts + AWARENESS%.
 * Amber badge on UNAWARE count.
 * Filter tabs ALL / FULLY_AWARE / KNOWLEDGE_LINKED / EVENT_EXPOSED / UNAWARE + text search.
 * Expand contact → matched knowledge cards (teal) + matched ops event cards (orange).
 * ▶ ASSESS AWARENESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:ckoeab-toggle event.
 *
 * Voice triggers:
 *   "ckoeab / contact awareness / contact knowledge ops / unaware contacts /
 *    situational awareness bridge / contact ops / contact situation"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_041_480;
const Z_INDEX  = 662;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const CKOEAB_RE = /\b(ckoeab|contact[\s-]awareness|contact[\s-]knowledge[\s-]ops?|unaware[\s-]contacts?|situational[\s-]awareness[\s-]bridge|contact[\s-]ops?[\s-]bridge|contact[\s-]situation)\b/i;

export function isCkoeabQuery(q = "") { return CKOEAB_RE.test(q); }

export async function buildCkoeabScript() {
  const base = apiBase();
  const [cR, kR, oR] = await Promise.allSettled([
    fetch(`${base}/entities/Contact`).then(r => r.json()),
    fetch(`${base}/knowledge/`).then(r => r.json()),
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
  ]);
  const contacts  = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.contacts || cR.value || []) : [];
  const knowledge = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
  const events    = oR.status === "fulfilled" ? (oR.value?.items || oR.value?.events || oR.value || []) : [];

  let fullyAware = 0, unaware = 0;
  for (const c of contacts) {
    const kws  = keywords(contactText(c));
    const hasK = knowledge.some(a => scoreText(articleText(a), kws) > 0);
    const hasE = events.some(e => scoreText(eventText(e), kws) > 0);
    if (hasK && hasE) fullyAware++;
    else if (!hasK && !hasE) unaware++;
  }
  const total    = contacts.length;
  const awarenessP = total ? Math.round((fullyAware / total) * 100) : 0;
  return `CKOEAB Contact Situational Awareness Bridge online, sir. I have cross-referenced ${total} contacts against ${knowledge.length} knowledge articles and ${events.length} operational events. ${fullyAware} contacts have full situational awareness — both a knowledge article and an ops event in their domain — representing ${awarenessP}% comprehensive awareness coverage. ${unaware} contacts are completely unaware with no knowledge coverage and no ops event exposure — these represent critical intelligence gaps requiring immediate briefing, sir.`;
}

const CY   = "#00CFFF";
const TE   = "#2DD4BF";
const AM   = "#F59E0B";
const OR   = "#F97316";
const GR   = "#22C55E";
const BG   = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_AWARE:      GR,
  KNOWLEDGE_LINKED: TE,
  EVENT_EXPOSED:    OR,
  UNAWARE:          AM,
};

const TABS = ["ALL", "FULLY_AWARE", "KNOWLEDGE_LINKED", "EVENT_EXPOSED", "UNAWARE"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return [c.name, c.role, c.organisation, c.org, c.email, c.tags, c.description, c.notes].filter(Boolean).join(" ");
}
function articleText(a) {
  return [a.title, a.name, a.content, a.summary, a.tags, a.category, a.topic].filter(Boolean).join(" ");
}
function eventText(e) {
  return [e.title, e.name, e.description, e.type, e.category, e.summary, e.tags].filter(Boolean).join(" ");
}

function classify(contact, knowledge, events) {
  const kws     = keywords(contactText(contact));
  const matchedK = knowledge.map(a => ({ ...a, _score: scoreText(articleText(a), kws) })).filter(a => a._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);
  const matchedE = events.map(e => ({ ...e, _score: scoreText(eventText(e), kws) })).filter(e => e._score > 0).sort((a, b) => b._score - a._score).slice(0, 4);

  const hasK = matchedK.length > 0;
  const hasE = matchedE.length > 0;
  let cls;
  if (hasK && hasE)       cls = "FULLY_AWARE";
  else if (hasK && !hasE) cls = "KNOWLEDGE_LINKED";
  else if (!hasK && hasE) cls = "EVENT_EXPOSED";
  else                    cls = "UNAWARE";

  return { ...contact, _cls: cls, _k: matchedK, _e: matchedE };
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

export default function ContactKnowledgeOpsAwarenessBridge() {
  const [open, setOpen]             = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [contacts, setContacts]     = useState([]);
  const [knowledge, setKnowledge]   = useState([]);
  const [opsEvents, setOpsEvents]   = useState([]);
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
      const [cR, kR, oR] = await Promise.allSettled([
        fetch(`${base}/entities/Contact`).then(r => r.json()),
        fetch(`${base}/knowledge/`).then(r => r.json()),
        fetch(`${base}/v1/ops/events`).then(r => r.json()),
      ]);
      const c = cR.status === "fulfilled" ? (cR.value?.items || cR.value?.contacts || cR.value || []) : [];
      const k = kR.status === "fulfilled" ? (kR.value?.items || kR.value?.articles || kR.value || []) : [];
      const o = oR.status === "fulfilled" ? (oR.value?.items || oR.value?.events || oR.value || []) : [];
      setContacts(c);
      setKnowledge(k);
      setOpsEvents(o);
      setClassified(c.map(ct => classify(ct, k, o)));
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
    window.addEventListener("jarvis:ckoeab-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ckoeab-toggle", onToggle);
  }, []);

  const fullyAware      = classified.filter(c => c._cls === "FULLY_AWARE").length;
  const knowledgeLinked = classified.filter(c => c._cls === "KNOWLEDGE_LINKED").length;
  const eventExposed    = classified.filter(c => c._cls === "EVENT_EXPOSED").length;
  const unaware         = classified.filter(c => c._cls === "UNAWARE").length;
  const total           = classified.length;
  const awarenessPct    = total ? Math.round((fullyAware / total) * 100) : 0;

  const visible = classified
    .filter(c => tab === "ALL" || c._cls === tab)
    .filter(c => !search || contactText(c).toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const ctx = `CKOEAB: ${total} contacts — FULLY_AWARE: ${fullyAware}, KNOWLEDGE_LINKED: ${knowledgeLinked}, EVENT_EXPOSED: ${eventExposed}, UNAWARE: ${unaware} (${awarenessPct}% full awareness). Knowledge articles: ${knowledge.length}. Ops events: ${opsEvents.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `CKOEAB contact situational awareness assessment. Context: ${ctx}. Provide a 2-sentence brief identifying the highest-priority unaware contacts who lack both knowledge coverage and ops event exposure, and what awareness briefings should be prioritised. Be concise and direct.` }),
      });
      const d = await r.json();
      const txt = d?.response || d?.message || d?.content || d?.text || JSON.stringify(d);
      setBrief(txt);
      const base2 = apiBase();
      await fetch(`${base2}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play().catch(() => {});
      }).catch(() => {});
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
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 9, background: "rgba(0,207,255,0.07)",
          border: "1px solid #00CFFF44", color: CY, padding: "3px 8px",
          borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
        title="Contact × Knowledge × Ops Event Situational Awareness Bridge"
      >
        {unaware > 0 && (
          <span style={{ background: AM, color: "#000", borderRadius: 2, padding: "0 4px", marginRight: 4, fontSize: 8 }}>
            {unaware}
          </span>
        )}
        ◈ CKOEAB
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 48, left: BTN_LEFT - 400, zIndex: Z_INDEX,
      width: 560, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: "1px solid #00CFFF33", borderRadius: 6,
      fontFamily: FONT, color: CY, fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #00CFFF22", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 10, letterSpacing: 1 }}>◈ CKOEAB — CONTACT × KNOWLEDGE × OPS AWARENESS</span>
        <button onClick={load} style={smallBtn(CY)} disabled={loading}>{loading ? "…" : "↻"}</button>
        <button onClick={() => setOpen(false)} style={smallBtn("#EF4444")}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px", flexWrap: "wrap" }}>
        {[
          ["CONTACTS", total, CY],
          ["KNOWLEDGE", knowledge.length, TE],
          ["OPS EVENTS", opsEvents.length, OR],
          ["FULLY AWARE", fullyAware, GR],
          ["KNOW. LINKED", knowledgeLinked, TE],
          ["EVT EXPOSED", eventExposed, OR],
          ["UNAWARE", unaware, AM],
          ["AWARENESS", awarenessPct + "%", awarenessPct > 60 ? GR : awarenessPct > 30 ? AM : "#EF4444"],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "#0A1628", border: `1px solid ${col}33`, borderRadius: 4, padding: "4px 8px", minWidth: 70, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: col, fontWeight: 700 }}>{val}</div>
            <div style={{ fontSize: 8, color: "#4A7A9B", marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              ...smallBtn(tab === t ? CLASS_COLOR[t] || CY : "#4A7A9B"),
              background: tab === t ? (CLASS_COLOR[t] || CY) + "22" : "transparent",
              fontSize: 9,
            }}
          >
            {t.replace(/_/g, " ")} {t !== "ALL" && classified.filter(c => c._cls === t).length > 0 ? `(${classified.filter(c => c._cls === t).length})` : ""}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 12px 6px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search contacts…"
          style={{
            width: "100%", background: "#0A1628", border: "1px solid #00CFFF22",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ color: "#EF4444", fontSize: 9, padding: "0 12px 6px" }}>Error: {error}</div>
      )}

      {/* Rows */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 8px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#4A7A9B", fontSize: 10, textAlign: "center", padding: 16 }}>No contacts found.</div>
        )}
        {visible.map((c, i) => {
          const col  = CLASS_COLOR[c._cls] || CY;
          const isEx = expanded === (c.id || c.name || i);
          return (
            <div
              key={c.id || c.name || i}
              style={{ borderBottom: "1px solid #0A1628", padding: "6px 0", cursor: "pointer" }}
              onClick={() => setExpanded(isEx ? null : (c.id || c.name || i))}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: col, fontSize: 9, minWidth: 110 }}>{c._cls.replace(/_/g, " ")}</span>
                <span style={{ flex: 1, color: "#E0F0FF", fontSize: 10 }}>{c.name || c.email || "(unknown)"}</span>
                {c.role && <span style={{ color: "#4A7A9B", fontSize: 9 }}>{c.role}</span>}
                <span style={{ color: "#4A7A9B", fontSize: 9 }}>{isEx ? "▲" : "▼"}</span>
              </div>
              {c.organisation && (
                <div style={{ color: "#4A7A9B", fontSize: 9, marginTop: 1, paddingLeft: 116 }}>{c.organisation}</div>
              )}

              {isEx && (
                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                  {/* Knowledge matches */}
                  {c._k.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 4 }}>KNOWLEDGE ARTICLES ({c._k.length})</div>
                      {c._k.map((a, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${TE}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: TE, fontSize: 9, flex: 1 }}>{a.title || a.name || "(untitled)"}</span>
                            {a.category && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{a.category}</span>}
                          </div>
                          <RelevanceBar score={a._score} max={c._k[0]?._score || 1} col={TE} />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Ops Event matches */}
                  {c._e.length > 0 && (
                    <div>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 4 }}>OPS EVENTS ({c._e.length})</div>
                      {c._e.map((e, j) => (
                        <div key={j} style={{ background: "#0A1628", border: `1px solid ${OR}33`, borderRadius: 3, padding: "4px 8px", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ color: OR, fontSize: 9, flex: 1 }}>{e.title || e.name || e.type || "(event)"}</span>
                            {e.type && <span style={{ color: "#4A7A9B", fontSize: 8 }}>{e.type}</span>}
                          </div>
                          <RelevanceBar score={e._score} max={c._e[0]?._score || 1} col={OR} />
                        </div>
                      ))}
                    </div>
                  )}
                  {c._k.length === 0 && c._e.length === 0 && (
                    <div style={{ color: AM, fontSize: 9 }}>No knowledge or ops event matches — contact is unaware.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess + brief */}
      <div style={{ padding: "8px 12px", borderTop: "1px solid #00CFFF22" }}>
        <button
          onClick={assess}
          disabled={assessing || total === 0}
          style={{
            ...smallBtn(CY),
            background: assessing ? "#0A1628" : "rgba(0,207,255,0.12)",
            fontSize: 10, width: "100%",
          }}
        >
          {assessing ? "▷ ASSESSING…" : "▶ ASSESS AWARENESS"}
        </button>
        {brief && (
          <div style={{ marginTop: 8, color: "#A0D0E8", fontSize: 9, lineHeight: 1.5, background: "#0A1628", borderRadius: 3, padding: "6px 8px" }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
