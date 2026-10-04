/**
 * F172 — Ops Event × Knowledge × RiskSignal Operational Readiness Index (OPRIDX)
 *
 * Parallel-fetches /v1/ops/events + /knowledge/ + /entities/RiskSignal
 * and keyword-correlates each ops event against KB articles AND risk signals to classify:
 *
 *   FULLY_PREPARED — matched both KB support and risk signal context (maximum readiness)
 *   KB_BACKED      — matched KB articles only (knowledge present, risk unmonitored)
 *   RISK_FLAGGED   — matched risk signals only (threat detected, no KB guidance)
 *   BLIND_SPOT     — no matches (neither KB nor risk signal context)
 *
 * Stat tiles: OPS EVENTS / KB ARTICLES / RISK SIGNALS + four class counts + READINESS%.
 * Amber badge on blind-spot count.
 * Filter tabs ALL / FULLY_PREPARED / KB_BACKED / RISK_FLAGGED / BLIND_SPOT + text search.
 * Expand event → matched KB article cards (green) + matched risk signal cards (red)
 *               with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence operational readiness brief + TTS.
 * 90-s auto-refresh. jarvis:opridx-toggle event.
 *
 * Voice triggers: "opridx / ops readiness / operational readiness / readiness index /
 *                  ops prepared / knowledge ops / ops blind spot"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_038_680;
const Z_INDEX  = 233;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const OPRIDX_RE = /\b(opridx|ops[\s-]readiness|operational[\s-]readiness|readiness[\s-]index|ops[\s-]prepared|knowledge[\s-]ops|ops[\s-]blind[\s-]spot)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const RD     = "#EF4444";
const AM     = "#F59E0B";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_PREPARED: GR,
  KB_BACKED:      CY,
  RISK_FLAGGED:   RD,
  BLIND_SPOT:     AM,
};

const TABS = ["ALL", "FULLY_PREPARED", "KB_BACKED", "RISK_FLAGGED", "BLIND_SPOT"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function eventText(e) {
  return `${e.name || e.title || e.event_type || e.type || ""} ${e.description || e.summary || e.message || ""} ${e.category || ""} ${e.location || ""} ${(e.tags || []).join(" ")}`;
}
function kbText(k) {
  return `${k.title || k.name || ""} ${k.content || k.description || k.summary || ""} ${k.category || k.type || ""} ${(k.tags || []).join(" ")}`;
}
function signalText(s) {
  return `${s.title || s.name || ""} ${s.description || s.summary || ""} ${s.severity || ""} ${s.category || ""} ${(s.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [evtRes, kbRes, sigRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
    fetch(`${apiBase}/knowledge/`,           { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const events  = evtRes.status === "fulfilled" && evtRes.value.ok
    ? normaliseArray(await evtRes.value.json(), ["events", "items"]) : [];
  const articles = kbRes.status === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "knowledge", "items"]) : [];
  const signals  = sigRes.status === "fulfilled" && sigRes.value.ok
    ? normaliseArray(await sigRes.value.json(), ["signals", "risk_signals", "items"]) : [];
  return { events, articles, signals };
}

function correlate(events, articles, signals) {
  return events.map(ev => {
    const kws = keywords(eventText(ev));
    const matchedKB = articles
      .map(a => ({ art: a, rel: score(kbText(a), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const matchedSig = signals
      .map(s => ({ sig: s, rel: score(signalText(s), kws) }))
      .filter(x => x.rel > 0).sort((a, b) => b.rel - a.rel).slice(0, 4);
    const hasKB  = matchedKB.length > 0;
    const hasSig = matchedSig.length > 0;
    const cls = hasKB && hasSig ? "FULLY_PREPARED"
              : hasKB           ? "KB_BACKED"
              : hasSig          ? "RISK_FLAGGED"
              :                   "BLIND_SPOT";
    return { ...ev, _cls: cls, _kb: matchedKB, _sigs: matchedSig };
  });
}

export function isOpridxQuery(q = "") { return OPRIDX_RE.test(q); }

export async function buildOpridxScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [evtRes, kbRes, sigRes] = await Promise.allSettled([
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
    fetch(`${apiBase}/knowledge/`,           { headers }),
    fetch(`${apiBase}/entities/RiskSignal`,  { headers }),
  ]);
  const events   = evtRes.status === "fulfilled" && evtRes.value.ok
    ? normaliseArray(await evtRes.value.json(), ["events", "items"]) : [];
  const articles = kbRes.status  === "fulfilled" && kbRes.value.ok
    ? normaliseArray(await kbRes.value.json(), ["articles", "knowledge", "items"]) : [];
  const signals  = sigRes.status === "fulfilled" && sigRes.value.ok
    ? normaliseArray(await sigRes.value.json(), ["signals", "risk_signals", "items"]) : [];
  const rows       = correlate(events, articles, signals);
  const fully      = rows.filter(r => r._cls === "FULLY_PREPARED").length;
  const blindSpots = rows.filter(r => r._cls === "BLIND_SPOT").length;
  const pct        = rows.length ? Math.round((rows.length - blindSpots) / rows.length * 100) : 0;
  return `Operational Readiness Index online, sir. Across ${rows.length} ops events cross-referenced against ${articles.length} knowledge articles and ${signals.length} risk signals, ${fully} events are fully prepared. ${blindSpots} remain blind spots — ${pct}% overall operational readiness coverage. Opening the OPRIDX panel for full visibility now.`;
}

export default function OpsReadinessIndex() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ events: 0, articles: 0, signals: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { events, articles, signals } = await loadAll();
      setTotals({ events: events.length, articles: articles.length, signals: signals.length });
      setRows(correlate(events, articles, signals));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:opridx-toggle", toggle);
    return () => window.removeEventListener("jarvis:opridx-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setAssessment("");
    try {
      const body = await buildOpridxScript();
      const res  = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this operational readiness coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess operational readiness at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_PREPARED: rows.filter(r => r._cls === "FULLY_PREPARED").length,
    KB_BACKED:      rows.filter(r => r._cls === "KB_BACKED").length,
    RISK_FLAGGED:   rows.filter(r => r._cls === "RISK_FLAGGED").length,
    BLIND_SPOT:     rows.filter(r => r._cls === "BLIND_SPOT").length,
  };
  const readinessPct = rows.length ? Math.round((rows.length - counts.BLIND_SPOT) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    return eventText(r).toLowerCase().includes(search.toLowerCase());
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(0,207,255,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ OPRIDX{counts.BLIND_SPOT > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.BLIND_SPOT}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 640, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(0,207,255,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ OPRIDX — OPERATIONAL READINESS INDEX</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["OPS EVENTS",    totals.events,          CY],
          ["KB ARTICLES",   totals.articles,         GR],
          ["RISK SIGNALS",  totals.signals,          RD],
          ["FULLY PREP.",   counts.FULLY_PREPARED,   GR],
          ["KB BACKED",     counts.KB_BACKED,        CY],
          ["RISK FLAGGED",  counts.RISK_FLAGGED,     RD],
          ["BLIND SPOTS",   counts.BLIND_SPOT,       AM],
          [`READY ${readinessPct}%`, readinessPct,   readinessPct >= 80 ? GR : readinessPct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 72,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${readinessPct}%`,
            background: readinessPct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? CY : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search ops events..."
          style={{
            width: "100%", background: "rgba(0,0,0,0.4)", border: "1px solid #333",
            color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 3, boxSizing: "border-box", outline: "none",
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 14px 8px" }}>
        {loading && <div style={{ color: "#555", fontSize: 10, padding: 8 }}>Loading…</div>}
        {error   && <div style={{ color: RD,   fontSize: 10, padding: 8 }}>{error}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No ops events match.</div>
        )}
        {visible.map((ev, i) => {
          const id    = ev.id || ev._id || i;
          const name  = ev.name || ev.title || ev.event_type || ev.type || `Event ${i + 1}`;
          const cat   = ev.category || ev.type || "";
          const isExp = expanded === id;
          const col   = CLASS_COLOR[ev._cls] || CY;
          return (
            <div key={id} style={{ marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "rgba(0,0,0,0.3)", border: `1px solid ${col}33`,
                  borderRadius: 4, padding: "6px 10px", cursor: "pointer",
                }}
              >
                <div>
                  <span style={{ fontSize: 11, color: CY }}>{name}</span>
                  {cat && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{cat}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{ev._cls.replace(/_/g, " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Matched KB articles */}
                  {ev._kb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 4, letterSpacing: 1 }}>KB ARTICLES</div>
                      {ev._kb.map(({ art: a, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{a.title || a.name || `Article ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: GR, padding: "1px 5px",
                              background: "rgba(34,197,94,0.1)", borderRadius: 2 }}>{a.category || a.type || "KB"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Matched risk signals */}
                  {ev._sigs.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS</div>
                      {ev._sigs.map(({ sig: s, rel }, k) => (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{s.title || s.name || `Signal ${k + 1}`}</span>
                            <span style={{ fontSize: 9, color: RD, padding: "1px 5px",
                              background: "rgba(239,68,68,0.1)", borderRadius: 2 }}>
                              {(s.severity || "SIGNAL").toUpperCase()}
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: RD, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {ev._kb.length === 0 && ev._sigs.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No KB articles or risk signals matched this event.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(0,207,255,0.08)",
          border: `1px solid ${assessing ? "#333" : CY}`,
          color: assessing ? "#555" : CY, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS OPERATIONAL READINESS"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(0,207,255,0.05)",
            border: "1px solid rgba(0,207,255,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
