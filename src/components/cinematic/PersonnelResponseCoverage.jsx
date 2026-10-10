/**
 * F166 — Contact × Ops Event × RiskSignal Personnel Response Coverage (PERCOV)
 *
 * Parallel-fetches /entities/Contact + /v1/ops/events + /entities/RiskSignal
 * Keyword-correlates each contact (name/role/org/email/tags) against
 * recent ops events AND active risk signals to classify:
 *   FULLY_ENGAGED  — matched both an ops event AND a risk signal
 *   OPS_RESPONDING — matched an ops event, no risk signal
 *   RISK_EXPOSED   — matched a risk signal, no ops event
 *   UNENGAGED      — no matches (personnel response gap)
 *
 * Stat tiles: CONTACTS / OPS EVENTS / RISK SIGNALS + all four class counts + ENGAGED%.
 * Amber badge on unengaged count.
 * Filter tabs ALL / FULLY_ENGAGED / OPS_RESPONDING / RISK_EXPOSED / UNENGAGED + text search.
 * Expand contact → matched ops event cards (blue, type badge) +
 *                  matched risk signal cards (red, severity badge) with relevance bars.
 * ▶ ASSESS RESPONSE → /v1/jarvis/agent/chat 2-sentence personnel coverage brief + TTS.
 * 90-s auto-refresh. jarvis:percov-toggle event.
 *
 * Voice triggers: "percov / personnel response / contact ops / contact response /
 *                  unengaged contacts / personnel risk response / contact event response".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_035_320;
const Z_INDEX  = 227;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const PERCOV_RE = /\b(percov|personnel[\s-]response|contact[\s-]ops|contact[\s-]response|unengaged[\s-]contacts?|personnel[\s-]risk[\s-]response|contact[\s-]event[\s-]response)\b/i;

const BL     = "#3B82F6";
const RD     = "#EF4444";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const CY     = "#00CFFF";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(59,130,246,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const SEV_COLOR = { CRITICAL: "#FF2D55", HIGH: "#EF4444", MEDIUM: "#F59E0B", LOW: "#22C55E" };

const CLASS_COLOR = {
  FULLY_ENGAGED:  GR,
  OPS_RESPONDING: BL,
  RISK_EXPOSED:   RD,
  UNENGAGED:      AM,
};

const TABS = ["ALL", "FULLY_ENGAGED", "OPS_RESPONDING", "RISK_EXPOSED", "UNENGAGED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return `${c.name || c.full_name || ""} ${c.role || c.title || ""} ${c.org || c.organization || ""} ${c.email || ""} ${(c.tags || []).join(" ")} ${c.description || ""}`;
}
function opsText(e) {
  return `${e.title || e.name || e.event || ""} ${e.description || ""} ${e.type || ""} ${e.status || ""} ${e.location || ""}`;
}
function riskText(r) {
  return `${r.title || r.name || ""} ${r.description || ""} ${r.severity || ""} ${r.type || ""} ${(r.tags || []).join(" ")}`;
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
  const [conRes, opsRes, rskRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Contact`,    { headers }),
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
    fetch(`${apiBase}/entities/RiskSignal`, { headers }),
  ]);
  const contacts = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "people", "items"]) : [];
  const opsEvents = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events", "items"]) : [];
  const riskSignals = rskRes.status === "fulfilled" && rskRes.value.ok
    ? normaliseArray(await rskRes.value.json(), ["signals", "risks", "items"]) : [];
  return { contacts, opsEvents, riskSignals };
}

function correlate(contacts, opsEvents, riskSignals) {
  return contacts.map(c => {
    const kws = keywords(contactText(c));
    const matchedOps = opsEvents
      .map(e => ({ event: e, rel: score(opsText(e), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const matchedRisk = riskSignals
      .map(r => ({ signal: r, rel: score(riskText(r), kws) }))
      .filter(x => x.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasOps  = matchedOps.length > 0;
    const hasRisk = matchedRisk.length > 0;
    const cls = hasOps && hasRisk ? "FULLY_ENGAGED"
              : hasOps            ? "OPS_RESPONDING"
              : hasRisk           ? "RISK_EXPOSED"
              :                     "UNENGAGED";
    return { ...c, _cls: cls, _ops: matchedOps, _risk: matchedRisk };
  });
}

export function isPercovQuery(q = "") { return PERCOV_RE.test(q); }

export async function buildPercovScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [conRes, opsRes, rskRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Contact`,    { headers }),
    fetch(`${apiBase}/v1/ops/events`,       { headers }),
    fetch(`${apiBase}/entities/RiskSignal`, { headers }),
  ]);
  const contacts = conRes.status === "fulfilled" && conRes.value.ok
    ? normaliseArray(await conRes.value.json(), ["contacts", "people", "items"]) : [];
  const opsEvents = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events", "items"]) : [];
  const riskSignals = rskRes.status === "fulfilled" && rskRes.value.ok
    ? normaliseArray(await rskRes.value.json(), ["signals", "risks", "items"]) : [];
  const rows = correlate(contacts, opsEvents, riskSignals);
  const fullyEngaged = rows.filter(r => r._cls === "FULLY_ENGAGED").length;
  const unengaged    = rows.filter(r => r._cls === "UNENGAGED").length;
  const engPct       = rows.length ? Math.round((rows.length - unengaged) / rows.length * 100) : 0;
  return `PERCOV Personnel Response Coverage online, sir. Across ${rows.length} contacts cross-referenced against ${opsEvents.length} ops events and ${riskSignals.length} risk signals, ${fullyEngaged} personnel are fully engaged with both event response and risk exposure. ${unengaged} contacts remain unengaged — ${engPct}% personnel response coverage. Opening the panel for full visibility now.`;
}

export default function PersonnelResponseCoverage() {
  const [open,       setOpen]       = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null);
  const [totals,     setTotals]     = useState({ contacts: 0, opsEvents: 0, riskSignals: 0 });
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { contacts, opsEvents, riskSignals } = await loadAll();
      setTotals({ contacts: contacts.length, opsEvents: opsEvents.length, riskSignals: riskSignals.length });
      setRows(correlate(contacts, opsEvents, riskSignals));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(v => { if (!v) load(); return !v; }); };
    window.addEventListener("jarvis:percov-toggle", toggle);
    return () => window.removeEventListener("jarvis:percov-toggle", toggle);
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
      const body = await buildPercovScript();
      const res = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ message: `You are JARVIS. In exactly 2 sentences, assess this personnel response coverage:\n${body}` }),
      });
      const data = await res.json();
      const txt  = data?.response || data?.message || data?.content || "";
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Unable to assess personnel response coverage at this time, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const counts = {
    FULLY_ENGAGED:  rows.filter(r => r._cls === "FULLY_ENGAGED").length,
    OPS_RESPONDING: rows.filter(r => r._cls === "OPS_RESPONDING").length,
    RISK_EXPOSED:   rows.filter(r => r._cls === "RISK_EXPOSED").length,
    UNENGAGED:      rows.filter(r => r._cls === "UNENGAGED").length,
  };
  const engPct = rows.length ? Math.round((rows.length - counts.UNENGAGED) / rows.length * 100) : 0;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r._cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return contactText(r).toLowerCase().includes(s);
  });

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: "1px solid rgba(59,130,246,0.35)",
          color: CY, fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          cursor: "pointer", borderRadius: 3, letterSpacing: 1,
        }}
      >
        ◈ PERCOV{counts.UNENGAGED > 0 && <span style={{ color: AM, marginLeft: 4 }}>{counts.UNENGAGED}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX,
      width: 620, maxHeight: "78vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, boxShadow: "0 0 32px rgba(59,130,246,0.15)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: BL }}>◈ PERCOV — PERSONNEL RESPONSE COVERAGE</span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 14px", flexWrap: "wrap" }}>
        {[
          ["CONTACTS",     totals.contacts,       CY],
          ["OPS EVENTS",   totals.opsEvents,       BL],
          ["RISK SIGNALS", totals.riskSignals,     RD],
          ["FULLY ENG.",   counts.FULLY_ENGAGED,   GR],
          ["OPS RESP.",    counts.OPS_RESPONDING,  BL],
          ["RISK EXP.",    counts.RISK_EXPOSED,    RD],
          ["UNENGAGED",    counts.UNENGAGED,       AM],
          [`ENGAGED ${engPct}%`, engPct,           engPct >= 80 ? GR : engPct >= 50 ? AM : RD],
        ].map(([label, val, col]) => (
          <div key={label} style={{
            background: "rgba(0,0,0,0.35)", border: `1px solid ${col}33`,
            borderRadius: 4, padding: "4px 10px", textAlign: "center", minWidth: 70,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 8, color: "#888", letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Coverage bar */}
      <div style={{ padding: "0 14px 8px" }}>
        <div style={{ height: 4, background: "#111", borderRadius: 2 }}>
          <div style={{ height: 4, width: `${engPct}%`, background: engPct >= 80 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 8px", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(59,130,246,0.2)" : "rgba(0,0,0,0.3)",
            border: `1px solid ${tab === t ? BL : "#333"}`,
            color: tab === t ? CY : "#666", fontSize: 9, padding: "3px 8px",
            cursor: "pointer", borderRadius: 3, letterSpacing: 1,
          }}>{t.replace("_", " ")}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts..."
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
          <div style={{ color: "#555", fontSize: 10, padding: 8 }}>No contacts match.</div>
        )}
        {visible.map((c, i) => {
          const id    = c.id || c._id || i;
          const name  = c.name || c.full_name || `Contact ${i + 1}`;
          const role  = c.role || c.title || "";
          const isExp = expanded === id;
          const col   = CLASS_COLOR[c._cls] || CY;
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
                  {role && <span style={{ fontSize: 9, color: "#666", marginLeft: 8 }}>{role}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9, color: col, letterSpacing: 1 }}>{c._cls.replace("_", " ")}</span>
                  <span style={{ fontSize: 9, color: "#555" }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.2)",
                  borderLeft: `2px solid ${col}`, marginLeft: 4 }}>
                  {/* Ops events */}
                  {c._ops.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: BL, marginBottom: 4, letterSpacing: 1 }}>OPS EVENTS</div>
                      {c._ops.map(({ event: e, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{e.title || e.name || e.event || `Event ${j + 1}`}</span>
                            <span style={{ fontSize: 9, color: BL, padding: "1px 5px",
                              background: "rgba(59,130,246,0.12)", borderRadius: 2 }}>{e.type || "OPS"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: BL, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Risk signals */}
                  {c._risk.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RD, marginBottom: 4, letterSpacing: 1 }}>RISK SIGNALS</div>
                      {c._risk.map(({ signal: r, rel }, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 10, color: "#ccc" }}>{r.title || r.name || `Signal ${j + 1}`}</span>
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 2,
                              background: `${SEV_COLOR[r.severity?.toUpperCase()] || AM}22`,
                              color: SEV_COLOR[r.severity?.toUpperCase()] || AM }}>{r.severity || "?"}</span>
                          </div>
                          <div style={{ height: 3, background: "#111", borderRadius: 2 }}>
                            <div style={{ height: 3, width: `${Math.min(rel * 20, 100)}%`,
                              background: RD, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {c._ops.length === 0 && c._risk.length === 0 && (
                    <div style={{ fontSize: 9, color: "#555" }}>No ops events or risk signals matched.</div>
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
          background: assessing ? "rgba(0,0,0,0.3)" : "rgba(59,130,246,0.12)",
          border: `1px solid ${assessing ? "#333" : BL}`,
          color: assessing ? "#555" : BL, fontFamily: FONT, fontSize: 10,
          padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer", borderRadius: 3,
        }}>
          {assessing ? "Assessing…" : "▶ ASSESS RESPONSE"}
        </button>
        {assessment && (
          <div style={{ marginTop: 8, fontSize: 10, color: "#aaa", lineHeight: 1.5,
            padding: "6px 10px", background: "rgba(59,130,246,0.06)",
            border: "1px solid rgba(59,130,246,0.15)", borderRadius: 4 }}>
            {assessment}
          </div>
        )}
      </div>
    </div>
  );
}
