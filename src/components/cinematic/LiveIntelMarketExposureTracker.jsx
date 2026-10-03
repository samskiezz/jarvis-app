/**
 * F135 — Live Intel × Contact × Investment
 *         Market Exposure Tracker (LICIMEX)
 *
 * Parallel-fetches:
 *   /functions/getLiveIntel  → live quake / crypto / FX events
 *   /entities/Contact        → people / organisations
 *   /entities/Investment     → portfolio assets
 *
 * Keyword-correlates each live world event (place names, crypto tickers,
 * FX pairs) against contacts AND investments to classify:
 *   BOTH_EXPOSED       — matched a contact AND an investment
 *   CONTACT_ONLY       — matched a contact, no investment link
 *   INVESTMENT_ONLY    — matched an investment, no contact link
 *   CLEAR              — no match in either dimension
 *
 * Amber badge on both-exposed count.
 * ▶ ASSESS EXPOSURE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 5-min auto-refresh.  jarvis:licimex-toggle event.
 * Voice: "licimex / live intel market / live market exposure /
 *         intel exposure / world event portfolio / event exposure".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_018_520;
const Z_INDEX  = 197;
const POLL_MS  = 300_000; // 5 min — matches getLiveIntel cadence
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const LICIMEX_RE =
  /\b(licimex|live[\s-]intel[\s-]market|live[\s-]market[\s-]exposure|intel[\s-]exposure|world[\s-]event[\s-]portfolio|event[\s-]exposure)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const RE     = "#EF4444";
const GO     = "#EAB308";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isLicimexQuery(text) {
  return LICIMEX_RE.test(text || "");
}

export async function buildLicimexScript() {
  const base    = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [intel, contacts, investments] = await Promise.all([
    fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()).catch(() => ({})),
    fetch(`${base}/entities/Contact`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/Investment`,    { headers }).then(r => r.json()).catch(() => []),
  ]);

  const events  = normaliseIntel(intel);
  const total   = events.length;
  let bothExp   = 0;
  events.forEach(ev => {
    const kws = extractKeywords(ev);
    const hC  = matchList(kws, contacts,   ["name","org","role","email","tags"]);
    const hI  = matchList(kws, investments,["name","type","sector","description"]);
    if (hC && hI) bothExp++;
  });
  const cPct = total ? Math.round((bothExp / total) * 100) : 0;
  return `Sir, LICIMEX scanned ${total} live world events across ${contacts.length} contacts and ${investments.length} portfolio investments. ${bothExp} events (${cPct}%) are BOTH_EXPOSED — they correlate with at least one contact and one investment, indicating real-world events with direct personnel and asset exposure that require immediate situational awareness review.`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function normaliseIntel(raw) {
  const evts = [];
  // earthquakes
  const quakes = raw?.earthquakes || raw?.seismic || [];
  (Array.isArray(quakes) ? quakes : []).forEach(q => {
    evts.push({ id: q.id || q.place || q.time, title: q.place || "Quake", type: "QUAKE", raw: q });
  });
  // crypto
  const crypto = raw?.crypto || raw?.cryptocurrency || [];
  (Array.isArray(crypto) ? crypto : []).forEach(c => {
    evts.push({ id: c.symbol || c.id, title: `${c.symbol || c.id} ${c.price ? `$${c.price}` : ""}`.trim(), type: "CRYPTO", raw: c });
  });
  // FX
  const fx = raw?.fx || raw?.forex || [];
  (Array.isArray(fx) ? fx : []).forEach(f => {
    evts.push({ id: f.pair || f.symbol, title: f.pair || f.symbol, type: "FX", raw: f });
  });
  return evts;
}

function extractKeywords(ev) {
  const txt = (ev.title || "") + " " + (ev.raw?.place || "") + " " +
              (ev.raw?.symbol || "") + " " + (ev.raw?.pair || "");
  return txt.toLowerCase().split(/[\s,./\-_]+/).filter(w => w.length > 2);
}

function matchList(keywords, list, fields) {
  return list.some(item => {
    const haystack = fields.map(f => {
      const v = item[f];
      return Array.isArray(v) ? v.join(" ") : (v || "");
    }).join(" ").toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
  });
}

function matchedItems(keywords, list, fields) {
  return list.filter(item => {
    const haystack = fields.map(f => {
      const v = item[f];
      return Array.isArray(v) ? v.join(" ") : (v || "");
    }).join(" ").toLowerCase();
    return keywords.some(kw => haystack.includes(kw));
  });
}

function relevancePct(keywords, item, fields) {
  const haystack = fields.map(f => {
    const v = item[f];
    return Array.isArray(v) ? v.join(" ") : (v || "");
  }).join(" ").toLowerCase();
  const hits = keywords.filter(kw => haystack.includes(kw)).length;
  return Math.min(100, Math.round((hits / Math.max(keywords.length, 1)) * 100) + 10);
}

const TYPE_COLOUR = { QUAKE: "#F97316", CRYPTO: "#EAB308", FX: "#00CFFF" };
const CLASS_COLOUR = {
  BOTH_EXPOSED:     RE,
  CONTACT_ONLY:     OR,
  INVESTMENT_ONLY:  GO,
  CLEAR:            GR,
};

// ── component ────────────────────────────────────────────────────────────────
export default function LiveIntelMarketExposureTracker() {
  const [open,       setOpen]       = useState(false);
  const [events,     setEvents]     = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [investments,setInvestments]= useState([]);
  const [loading,    setLoading]    = useState(false);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [brief,      setBrief]      = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base    = apiBase();
    const headers = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [intel, ctrs, invs] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()).catch(() => ({})),
        fetch(`${base}/entities/Contact`,       { headers }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/Investment`,    { headers }).then(r => r.json()).catch(() => []),
      ]);
      setEvents(normaliseIntel(intel));
      setContacts(Array.isArray(ctrs) ? ctrs : []);
      setInvestments(Array.isArray(invs) ? invs : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(o => !o);
    window.addEventListener("jarvis:licimex-toggle", h);
    return () => window.removeEventListener("jarvis:licimex-toggle", h);
  }, []);

  // ── classify each event ──────────────────────────────────────────────────
  const rows = events.map(ev => {
    const kws = extractKeywords(ev);
    const mC  = matchedItems(kws, contacts,    ["name","org","role","email","tags"]);
    const mI  = matchedItems(kws, investments, ["name","type","sector","description"]);
    let cls;
    if (mC.length && mI.length) cls = "BOTH_EXPOSED";
    else if (mC.length)         cls = "CONTACT_ONLY";
    else if (mI.length)         cls = "INVESTMENT_ONLY";
    else                        cls = "CLEAR";
    return { ...ev, kws, mC, mI, cls };
  });

  const counts = {
    BOTH_EXPOSED:    rows.filter(r => r.cls === "BOTH_EXPOSED").length,
    CONTACT_ONLY:    rows.filter(r => r.cls === "CONTACT_ONLY").length,
    INVESTMENT_ONLY: rows.filter(r => r.cls === "INVESTMENT_ONLY").length,
    CLEAR:           rows.filter(r => r.cls === "CLEAR").length,
  };

  const visible = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || "").toLowerCase().includes(q) || r.cls.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildLicimexScript();
      setBrief(script);
      // TTS
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script }),
      });
    } catch {
      setBrief("Assessment unavailable at this time.");
    } finally {
      setAssessing(false);
    }
  };

  // ── button (always rendered) ──────────────────────────────────────────────
  const btn = (
    <button
      onClick={() => setOpen(o => !o)}
      style={{
        position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
        background: counts.BOTH_EXPOSED > 0 ? `${RE}22` : `${CY}11`,
        border: `1px solid ${counts.BOTH_EXPOSED > 0 ? RE : CY}55`,
        borderRadius: 4, padding: "3px 8px",
        color: counts.BOTH_EXPOSED > 0 ? RE : CY,
        fontSize: 9, cursor: "pointer", fontFamily: FONT, whiteSpace: "nowrap",
      }}
    >
      ◈ LICIMEX
      {counts.BOTH_EXPOSED > 0 && (
        <span style={{
          marginLeft: 4, background: RE, color: "#fff",
          borderRadius: 8, padding: "1px 5px", fontSize: 8,
          animation: "pulse 1.5s infinite",
        }}>
          {counts.BOTH_EXPOSED}
        </span>
      )}
    </button>
  );

  if (!open) return btn;

  return (
    <>
      {btn}
      <div style={{
        position: "fixed", bottom: 32, left: BTN_LEFT - 640, zIndex: Z_INDEX + 1,
        width: 660, maxHeight: 540, background: BG,
        border: `1px solid ${BORDER}`, borderRadius: 8,
        fontFamily: FONT, display: "flex", flexDirection: "column",
        boxShadow: `0 0 24px rgba(0,207,255,0.10)`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 14px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: CY, fontSize: 11, letterSpacing: 1 }}>
            ◈ LIVE INTEL MARKET EXPOSURE TRACKER
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {loading && <span style={{ color: DIM, fontSize: 9 }}>⟳</span>}
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 13 }}>✕</button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, padding: "6px 14px" }}>
          {[
            ["EVENTS",          events.length,          CY],
            ["BOTH EXPOSED",    counts.BOTH_EXPOSED,    RE],
            ["CONTACT ONLY",    counts.CONTACT_ONLY,    OR],
            ["INVEST ONLY",     counts.INVESTMENT_ONLY, GO],
          ].map(([lbl, val, col]) => (
            <div key={lbl} style={{
              background: `${col}11`, border: `1px solid ${col}33`,
              borderRadius: 4, padding: "5px 8px", textAlign: "center",
            }}>
              <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 8, marginTop: 1 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* coverage bar */}
        <div style={{ padding: "0 14px 4px" }}>
          <div style={{ fontSize: 9, color: DIM, marginBottom: 2 }}>
            EXPOSURE RATE &nbsp;
            <span style={{ color: events.length ? RE : GR }}>
              {events.length ? Math.round(((counts.BOTH_EXPOSED + counts.CONTACT_ONLY + counts.INVESTMENT_ONLY) / events.length) * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: events.length ? `${Math.round(((counts.BOTH_EXPOSED + counts.CONTACT_ONLY + counts.INVESTMENT_ONLY) / events.length) * 100)}%` : "0%",
              background: `linear-gradient(90deg, ${RE}, ${OR})`,
            }} />
          </div>
        </div>

        {/* filter tabs + search */}
        <div style={{ padding: "4px 14px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {["ALL","BOTH_EXPOSED","CONTACT_ONLY","INVESTMENT_ONLY","CLEAR"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? `${CY}22` : "none",
              border: `1px solid ${filter === f ? CY : DIM}55`,
              borderRadius: 3, padding: "2px 8px",
              color: filter === f ? CY : DIM, fontSize: 9, cursor: "pointer", fontFamily: FONT,
            }}>{f.replace(/_/g," ")}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search…"
            style={{
              marginLeft: "auto", background: "rgba(0,207,255,0.05)",
              border: `1px solid ${BORDER}`, borderRadius: 3,
              color: CY, fontSize: 9, padding: "2px 8px", fontFamily: FONT, width: 110,
            }}
          />
        </div>

        {/* rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
          {visible.length === 0 && (
            <div style={{ color: DIM, fontSize: 10, padding: 8 }}>No events match.</div>
          )}
          {visible.map((ev, idx) => {
            const col = CLASS_COLOUR[ev.cls] || DIM;
            const tCol = TYPE_COLOUR[ev.type] || DIM;
            const isExp = expanded === idx;
            return (
              <div key={ev.id || idx} style={{
                marginBottom: 4, borderRadius: 4,
                border: `1px solid ${col}33`,
                background: `${col}08`,
              }}>
                <div
                  onClick={() => setExpanded(isExp ? null : idx)}
                  style={{
                    padding: "5px 8px", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ fontSize: 9, color: tCol, border: `1px solid ${tCol}44`, borderRadius: 2, padding: "0 4px" }}>{ev.type}</span>
                  <span style={{ flex: 1, fontSize: 10, color: "#cce8ff" }}>{ev.title}</span>
                  <span style={{ fontSize: 9, color: col, border: `1px solid ${col}44`, borderRadius: 2, padding: "0 5px" }}>{ev.cls.replace(/_/g," ")}</span>
                  <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>

                {isExp && (
                  <div style={{ padding: "6px 12px 8px", borderTop: `1px solid ${col}22` }}>
                    {/* matched contacts */}
                    {ev.mC.length > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 9, color: OR, marginBottom: 3, letterSpacing: 1 }}>CONTACTS ({ev.mC.length})</div>
                        {ev.mC.map((c, i) => {
                          const pct = relevancePct(ev.kws, c, ["name","org","role","email","tags"]);
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#cce8ff" }}>{c.name || c.id}</span>
                                {c.role && <span style={{ fontSize: 8, color: OR, border: `1px solid ${OR}55`, borderRadius: 2, padding: "0 4px" }}>{c.role}</span>}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: OR }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* matched investments */}
                    {ev.mI.length > 0 && (
                      <div>
                        <div style={{ fontSize: 9, color: GO, marginBottom: 3, letterSpacing: 1 }}>INVESTMENTS ({ev.mI.length})</div>
                        {ev.mI.map((inv, i) => {
                          const pct = relevancePct(ev.kws, inv, ["name","type","sector","description"]);
                          return (
                            <div key={i} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 10, color: "#cce8ff" }}>{inv.name || inv.id}</span>
                                {inv.type && <span style={{ fontSize: 8, color: GO, border: `1px solid ${GO}55`, borderRadius: 2, padding: "0 4px" }}>{inv.type}</span>}
                              </div>
                              <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: GO }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {ev.mC.length === 0 && ev.mI.length === 0 && (
                      <div style={{ color: GR, fontSize: 10 }}>No direct contact or investment exposure found for this event.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* assess button */}
        <div style={{ padding: "6px 14px 10px", borderTop: `1px solid rgba(234,179,8,0.18)` }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(0,0,0,0.4)" : `${AM}22`,
              border: `1px solid ${AM}55`, borderRadius: 4, padding: "5px 14px",
              color: AM, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
              fontFamily: FONT,
            }}
          >
            {assessing ? "⟳ ASSESSING…" : "▶ ASSESS EXPOSURE"}
          </button>
          {brief && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#cce8ff", lineHeight: 1.5, opacity: 0.9 }}>
              {brief}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}
