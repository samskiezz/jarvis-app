/**
 * F108 — Knowledge × Contact × Ops Event
 *         Personnel Intelligence Pulse (KCOPPULS)
 *
 * Parallel-fetches /knowledge/ + /entities/Contact + /v1/ops/events.
 * Keyword-correlates each contact against KB articles AND ops events to classify:
 *   FULLY_BRIEFED  (KB article + ops event match)
 *   KB_INFORMED    (KB only)
 *   OPS_EXPOSED    (ops event only)
 *   UNINFORMED     (no backing — intelligence gap)
 *
 * Amber badge on UNINFORMED count.
 * Stat tiles CONTACTS / KB ARTICLES / OPS EVENTS + all four class counts + INTEL%.
 * Filter tabs ALL/FULLY_BRIEFED/KB_INFORMED/OPS_EXPOSED/UNINFORMED + search.
 * Expand contact → matched KB article cards (green) + ops event cards (blue)
 *   with relevance bars.
 * ▶ ASSESS INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * Voice trigger: "kcoppuls/contact intel pulse/personnel intelligence/
 *   briefed contacts ops/uninformed personnel/contact knowledge ops".
 * Event: jarvis:kcoppuls-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_003_400;
const Z_INDEX  = 170;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const KCOPPULS_RE = /\b(kcoppuls|contact[\s-]intel[\s-]pulse|personnel[\s-]intelligence|briefed[\s-]contacts?[\s-]ops?|uninformed[\s-]personnel|contact[\s-]knowledge[\s-]ops?)\b/i;

const GR    = "#22C55E";
const BL    = "#3B82F6";
const AM    = "#F59E0B";
const OR    = "#F97316";
const CY    = "#00CFFF";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(34,197,94,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_BRIEFED: GR,
  KB_INFORMED:   CY,
  OPS_EXPOSED:   BL,
  UNINFORMED:    AM,
};

const TABS = ["ALL","FULLY_BRIEFED","KB_INFORMED","OPS_EXPOSED","UNINFORMED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isKcoppulsQuery(text) {
  return KCOPPULS_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, c.tags, c.id].filter(Boolean).join(" ");
}

function articleKey(a) {
  return [a.title, a.name, a.content, a.summary, a.tags, a.category, a.id].filter(Boolean).join(" ");
}

function eventKey(e) {
  return [e.name, e.title, e.description, e.type, e.category, e.id].filter(Boolean).join(" ");
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [kbRes, ctRes, opsRes] = await Promise.all([
    fetch(`${base}/knowledge/`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`, { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/v1/ops/events`, { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const articles = norm(kbRes,  ["articles","items","data","results"]);
  const contacts = norm(ctRes,  ["contacts","data","items","results"]);
  const events   = norm(opsRes, ["events","data","items","results"]);
  return { articles, contacts, events };
}

function classify(contacts, articles, events) {
  return contacts.map(ct => {
    const ck = contactKey(ct);
    const matchedArticles = articles.filter(a => overlap(ck, articleKey(a)) > 0.08);
    const matchedEvents   = events.filter(e => overlap(ck, eventKey(e)) > 0.08);
    const hasKB  = matchedArticles.length > 0;
    const hasOPS = matchedEvents.length > 0;
    const cls =
      hasKB && hasOPS ? "FULLY_BRIEFED" :
      hasKB           ? "KB_INFORMED"   :
      hasOPS          ? "OPS_EXPOSED"   :
                        "UNINFORMED";
    return {
      ...ct,
      _class:    cls,
      _articles: matchedArticles.map(a => ({ ...a, _rel: overlap(ck, articleKey(a)) })),
      _events:   matchedEvents.map(e => ({ ...e, _rel: overlap(ck, eventKey(e)) })),
    };
  });
}

export async function buildKcoppulsScript() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { articles, contacts, events } = await fetchAll();
  const classified    = classify(contacts, articles, events);
  const total         = classified.length;
  const fullyBriefed  = classified.filter(c => c._class === "FULLY_BRIEFED").length;
  const kbInformed    = classified.filter(c => c._class === "KB_INFORMED").length;
  const opsExposed    = classified.filter(c => c._class === "OPS_EXPOSED").length;
  const uninformed    = classified.filter(c => c._class === "UNINFORMED").length;
  const pct           = total > 0 ? Math.round((fullyBriefed + kbInformed + opsExposed) / total * 100) : 0;

  const context = `Contacts: ${total}. KB articles: ${articles.length}. Ops events: ${events.length}. Fully briefed: ${fullyBriefed}. KB-informed: ${kbInformed}. Ops-exposed: ${opsExposed}. Uninformed: ${uninformed}. Personnel intelligence coverage: ${pct}%.`;
  const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ message: `You are JARVIS. Given this personnel intelligence pulse summary: ${context} — write exactly 2 sentences assessing the intelligence briefing status of personnel and the risk from uninformed contacts.` }),
  });
  const j = await res.json();
  return j?.response || j?.message || j?.text || `Personnel intelligence coverage at ${pct}%: ${uninformed} of ${total} contacts lack any knowledge base or operational event context — immediate briefing required.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function KnowledgeContactOpsPulse() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [rows,      setRows]      = useState([]);
  const [kbCnt,     setKbCnt]     = useState(0);
  const [opsCnt,    setOpsCnt]    = useState(0);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { articles, contacts, events } = await fetchAll();
      setKbCnt(articles.length);
      setOpsCnt(events.length);
      setRows(classify(contacts, articles, events));
    } catch { /* network error */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => { setOpen(v => !v); if (!rows.length) load(); };
    window.addEventListener("jarvis:kcoppuls-toggle", toggle);
    return () => window.removeEventListener("jarvis:kcoppuls-toggle", toggle);
  }, [load, rows.length]);

  const total        = rows.length;
  const fullyBriefed = rows.filter(r => r._class === "FULLY_BRIEFED").length;
  const kbInformed   = rows.filter(r => r._class === "KB_INFORMED").length;
  const opsExposed   = rows.filter(r => r._class === "OPS_EXPOSED").length;
  const uninformed   = rows.filter(r => r._class === "UNINFORMED").length;
  const intelPct     = total > 0 ? Math.round((fullyBriefed + kbInformed + opsExposed) / total * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildKcoppulsScript();
      setBrief(script);
      const base    = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        const aud  = new Audio(url);
        aud.play();
      });
    } catch {}
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
    background: uninformed > 0 ? "rgba(245,158,11,0.18)" : "rgba(34,197,94,0.12)",
    border: `1px solid ${uninformed > 0 ? AM : GR}55`,
    color: uninformed > 0 ? AM : GR,
    borderRadius: 6, padding: "3px 9px", fontSize: 10, fontFamily: FONT,
    cursor: "pointer", letterSpacing: 1, userSelect: "none",
    boxShadow: open ? `0 0 10px ${AM}55` : "none",
  };

  return (
    <>
      <button style={btnStyle} onClick={() => { setOpen(v => !v); if (!rows.length) load(); }}>
        ◈ KCOPPULS
        {uninformed > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 4, padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>{uninformed}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT - 200, zIndex: Z_INDEX + 1,
          width: 560, maxHeight: "78vh",
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, fontFamily: FONT, color: "#C8DFF0",
          display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: GR, fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>◈ KCOPPULS</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", flex: 1 }}>Knowledge × Contact × Ops Personnel Intelligence Pulse</span>
            <button onClick={assess} disabled={assessing} style={{
              background: "rgba(34,197,94,0.1)", border: `1px solid ${GR}44`, color: GR,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
            }}>
              {assessing ? "ASSESSING…" : "▶ ASSESS INTELLIGENCE"}
            </button>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
            {[
              ["CONTACTS",       total,         GR],
              ["KB ARTICLES",    kbCnt,         CY],
              ["OPS EVENTS",     opsCnt,        BL],
              ["FULLY BRIEFED",  fullyBriefed,  GR],
              ["KB INFORMED",    kbInformed,    CY],
              ["OPS EXPOSED",    opsExposed,    BL],
              ["UNINFORMED",     uninformed,    AM],
              ["INTEL %",        `${intelPct}%`, intelPct > 60 ? GR : AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                borderRadius: 6, padding: "4px 8px", minWidth: 72, textAlign: "center",
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{val}</div>
                <div style={{ fontSize: 8, color: "#6E8AA0", marginTop: 1, letterSpacing: 0.5 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* intel bar */}
          <div style={{ padding: "0 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${intelPct}%`, background: intelPct > 60 ? GR : AM, borderRadius: 2, transition: "width 0.6s" }} />
            </div>
            <span style={{ fontSize: 9, color: "#6E8AA0" }}>personnel intel coverage</span>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => { setTab(t); setExpanded(null); }} style={{
                background: tab === t ? `${CLASS_COLOR[t] || GR}22` : "rgba(0,0,0,0.3)",
                border: `1px solid ${tab === t ? (CLASS_COLOR[t] || GR) : "rgba(255,255,255,0.08)"}`,
                color: tab === t ? (CLASS_COLOR[t] || GR) : "#6E8AA0",
                borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer", letterSpacing: 0.5,
              }}>{t}</button>
            ))}
            <input
              value={search} onChange={e => { setSearch(e.target.value); setExpanded(null); }}
              placeholder="search contacts…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
                color: "#C8DFF0", borderRadius: 4, padding: "2px 8px", fontSize: 9, fontFamily: FONT, width: 140,
              }}
            />
          </div>

          {/* brief */}
          {brief && (
            <div style={{ margin: "0 14px 8px", padding: "8px 10px", background: "rgba(34,197,94,0.06)", borderRadius: 6, fontSize: 11, lineHeight: 1.5, color: "#C8DFF0" }}>
              {brief}
            </div>
          )}

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 12px" }}>
            {loading && <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 8 }}>No contacts match the current filter.</div>
            )}
            {visible.map((ct, i) => {
              const col   = CLASS_COLOR[ct._class] || AM;
              const isExp = expanded === i;
              return (
                <div key={ct.id || i} style={{
                  marginBottom: 6, border: `1px solid ${col}33`, borderRadius: 8,
                  background: ct._class === "UNINFORMED" ? "rgba(245,158,11,0.05)" : "rgba(0,0,0,0.25)",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ color: col, fontSize: 10, fontWeight: 700, minWidth: 110 }}>{ct._class}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{ct.name || ct.id || "Unknown Contact"}</span>
                    {ct.role && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{ct.role}</span>}
                    <span style={{ fontSize: 10, color: GR, marginLeft: "auto" }}>
                      {ct._articles.length}KB · {ct._events.length}OPS
                    </span>
                    <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>
                  {isExp && (
                    <div style={{ padding: "0 12px 10px" }}>
                      {/* kb articles */}
                      {ct._articles.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: CY, marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES</div>
                          {ct._articles.map((a, ai) => (
                            <div key={ai} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(0,207,255,0.06)", border: `1px solid ${CY}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{a.title || a.name || a.id || "Article"}</span>
                                {a.category && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{a.category}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(0,207,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(a._rel * 100 * 4))}%`, background: CY, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {/* ops events */}
                      {ct._events.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: BL, marginBottom: 4, marginTop: 6, letterSpacing: 1 }}>OPS EVENTS</div>
                          {ct._events.map((ev, ei) => (
                            <div key={ei} style={{
                              marginBottom: 4, padding: "6px 10px",
                              background: "rgba(59,130,246,0.06)", border: `1px solid ${BL}33`, borderRadius: 6,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: 11, fontWeight: 600 }}>{ev.name || ev.title || ev.id || "Event"}</span>
                                {ev.type && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{ev.type}</span>}
                              </div>
                              <div style={{ height: 3, background: "rgba(59,130,246,0.2)", borderRadius: 2, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.min(100, Math.round(ev._rel * 100 * 4))}%`, background: BL, borderRadius: 2 }} />
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {ct._articles.length === 0 && ct._events.length === 0 && (
                        <div style={{ color: AM, fontSize: 11, padding: "4px 0" }}>
                          ⚠ No KB article or ops event matches found for this contact.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
