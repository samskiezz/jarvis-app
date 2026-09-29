/**
 * F180 — Contact × Ops Event × SwarmJob × Investigation Full Accountability Matrix (COSIA)
 *
 * Parallel-fetches /entities/Contact + /v1/ops/events + /entities/SwarmJob + /v1/investigations
 * and keyword-correlates each contact against ops events AND swarm jobs AND investigations to
 * classify:
 *
 *   FULLY_TRACKED  — matched ops event + swarm job + investigation (complete accountability)
 *   DUAL_TRACKED   — matched any two of the three
 *   SINGLE_LINKED  — matched exactly one
 *   UNTRACKED      — no matches (accountability gap)
 *
 * Stat tiles: CONTACTS / OPS EVENTS / SWARM JOBS / INVESTIGATIONS + four class counts + TRACKED%.
 * Amber badge on untracked count.
 * Filter tabs ALL / FULLY_TRACKED / DUAL_TRACKED / SINGLE_LINKED / UNTRACKED + text search.
 * Expand contact → matched ops event cards (blue, type badge) + swarm job cards (cyan, status badge)
 *                + investigation cards (teal, priority badge) with relevance bars.
 * ▶ ASSESS ACCOUNTABILITY → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:cosia-toggle event.
 *
 * Voice triggers:
 *   "cosia / contact accountability / contact ops / contact swarm investigation /
 *    contact event coverage / contact ops link / untracked contact / ops contact coverage"
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_043_160;
const Z_INDEX  = 241;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

export const COSIA_RE = /\b(cosia|contact[\s-]accountability|contact[\s-]ops(?:[\s-]link)?|contact[\s-]swarm[\s-]investigation|contact[\s-]event[\s-]coverage|untracked[\s-]contact|ops[\s-]contact[\s-]coverage)\b/i;

const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BL     = "#3B82F6";
const TE     = "#14B8A6";
const OR     = "#F97316";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_TRACKED:  GR,
  DUAL_TRACKED:   CY,
  SINGLE_LINKED:  OR,
  UNTRACKED:      RD,
};

const TABS = ["ALL", "FULLY_TRACKED", "DUAL_TRACKED", "SINGLE_LINKED", "UNTRACKED"];

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function score(haystack, kws) {
  const h = haystack.toLowerCase();
  return kws.filter(k => h.includes(k)).length;
}
function contactText(c) {
  return `${c.name || c.full_name || ""} ${c.role || c.title || ""} ${c.org || c.organization || c.company || ""} ${c.email || ""} ${(c.tags || []).join(" ")}`;
}
function opsText(e) {
  return `${e.title || e.name || ""} ${e.description || e.summary || ""} ${e.type || e.event_type || ""} ${(e.tags || []).join(" ")}`;
}
function swarmText(j) {
  return `${j.name || j.title || ""} ${j.description || j.summary || ""} ${j.type || ""} ${j.objective || ""} ${(j.tags || []).join(" ")}`;
}
function invText(i) {
  return `${i.title || i.name || ""} ${i.description || i.summary || ""} ${(i.tags || []).join(" ")}`;
}

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  if (Array.isArray(raw?.data))    return raw.data;
  if (Array.isArray(raw?.items))   return raw.items;
  if (Array.isArray(raw?.results)) return raw.results;
  return [];
}

async function loadAll() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [contactsRes, opsRes, swarmRes, invRes] = await Promise.allSettled([
    fetch(`${apiBase}/entities/Contact`,   { headers }),
    fetch(`${apiBase}/v1/ops/events`,      { headers }),
    fetch(`${apiBase}/entities/SwarmJob`,  { headers }),
    fetch(`${apiBase}/v1/investigations`,  { headers }),
  ]);
  const contacts = contactsRes.status === "fulfilled" && contactsRes.value.ok
    ? normaliseArray(await contactsRes.value.json(), ["contacts", "items"]) : [];
  const ops = opsRes.status === "fulfilled" && opsRes.value.ok
    ? normaliseArray(await opsRes.value.json(), ["events", "ops_events", "items"]) : [];
  const swarm = swarmRes.status === "fulfilled" && swarmRes.value.ok
    ? normaliseArray(await swarmRes.value.json(), ["jobs", "swarm_jobs", "items"]) : [];
  const investigations = invRes.status === "fulfilled" && invRes.value.ok
    ? normaliseArray(await invRes.value.json(), ["investigations", "items"]) : [];
  return { contacts, ops, swarm, investigations };
}

function correlate(contacts, ops, swarm, investigations) {
  return contacts.map(contact => {
    const kws = keywords(contactText(contact));
    const matchedOps = ops
      .map(e => ({ ...e, _score: score(opsText(e), kws) }))
      .filter(e => e._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedSwarm = swarm
      .map(j => ({ ...j, _score: score(swarmText(j), kws) }))
      .filter(j => j._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const matchedInv = investigations
      .map(i => ({ ...i, _score: score(invText(i), kws) }))
      .filter(i => i._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    const count = (matchedOps.length > 0 ? 1 : 0) +
                  (matchedSwarm.length > 0 ? 1 : 0) +
                  (matchedInv.length > 0 ? 1 : 0);
    let cls;
    if (count === 3) cls = "FULLY_TRACKED";
    else if (count === 2) cls = "DUAL_TRACKED";
    else if (count === 1) cls = "SINGLE_LINKED";
    else cls = "UNTRACKED";
    return { ...contact, _cls: cls, _ops: matchedOps, _swarm: matchedSwarm, _inv: matchedInv };
  });
}

export async function buildCosiaScript() {
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { contacts, ops, swarm, investigations } = await loadAll();
  const corr      = correlate(contacts, ops, swarm, investigations);
  const untracked = corr.filter(c => c._cls === "UNTRACKED").length;
  const fully     = corr.filter(c => c._cls === "FULLY_TRACKED").length;
  const context   = `Contacts: ${contacts.length}, ops events: ${ops.length}, swarm jobs: ${swarm.length}, investigations: ${investigations.length}. Fully tracked (ops + swarm + investigation): ${fully}. Untracked (no coverage): ${untracked}.`;
  const r = await fetch(`${apiBase}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      message: `Assess JARVIS contact accountability coverage across ops events, swarm jobs, and investigations. ${context} Give a 2-sentence brief focusing on untracked contacts and accountability gaps.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
    `${untracked} contacts lack ops event, swarm job, and investigation linkage — these represent critical accountability gaps in JARVIS coverage. ${fully} contacts are fully tracked across all three operational dimensions.`;
}

export function isCosiaQuery(q) { return COSIA_RE.test(q); }

export default function ContactOpsSwarmInvestigationMatrix() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [contacts,  setContacts]  = useState([]);
  const [ops,       setOps]       = useState([]);
  const [swarm,     setSwarm]     = useState([]);
  const [invs,      setInvs]      = useState([]);
  const [corr,      setCorr]      = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await loadAll();
      setContacts(data.contacts);
      setOps(data.ops);
      setSwarm(data.swarm);
      setInvs(data.investigations);
      setCorr(correlate(data.contacts, data.ops, data.swarm, data.investigations));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:cosia-toggle", toggle);
    return () => window.removeEventListener("jarvis:cosia-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const text = await buildCosiaScript();
      setBrief(text);
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const r = await fetch(`${apiBase}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const blob = await r.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play().catch(() => {});
      }
    } catch { setBrief("Assessment unavailable."); }
    finally { setAssessing(false); }
  }, []);

  const fully     = corr.filter(c => c._cls === "FULLY_TRACKED").length;
  const dual      = corr.filter(c => c._cls === "DUAL_TRACKED").length;
  const single    = corr.filter(c => c._cls === "SINGLE_LINKED").length;
  const untracked = corr.filter(c => c._cls === "UNTRACKED").length;
  const trackedPct = corr.length ? Math.round((fully / corr.length) * 100) : 0;

  const visible = corr.filter(c => {
    const matchTab  = tab === "ALL" || c._cls === tab;
    const matchSrch = !search || contactText(c).toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSrch;
  });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)", border: `1px solid ${BORDER}`,
          color: untracked > 0 ? AM : CY, fontFamily: FONT, fontSize: 10,
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: untracked > 0 ? `0 0 8px ${AM}55` : "none",
        }}
        title="Contact × Ops Event × SwarmJob × Investigation Full Accountability Matrix (F180)"
      >
        ◈ COSIA{untracked > 0 && <span style={{ color: AM, marginLeft: 4 }}>●{untracked}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 40, right: 16, width: 580, maxHeight: "calc(100vh - 60px)",
      zIndex: Z_INDEX + 100, background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 8, fontFamily: FONT, fontSize: 11, color: CY,
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: "0 0 24px rgba(0,207,255,0.12)",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
          ◈ COSIA — Contact Ops/Swarm/Investigation Accountability
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: AM, fontSize: 10 }}>⟳ loading…</span>}
          <button onClick={refresh} style={{ background: "none", border: `1px solid ${BORDER}`, color: CY, cursor: "pointer", padding: "2px 6px", borderRadius: 3, fontSize: 10 }}>↺</button>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
        {[
          ["CONTACTS",      corr.length,  CY],
          ["OPS EVENTS",    ops.length,   BL],
          ["SWARM JOBS",    swarm.length, TE],
          ["INVESTIGATIONS", invs.length, GR],
          ["FULLY TRACKED", fully,        GR],
          ["DUAL TRACKED",  dual,         CY],
          ["SINGLE LINKED", single,       OR],
          ["UNTRACKED",     untracked,    AM],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 72 }}>
            <div style={{ color, fontWeight: 700, fontSize: 13 }}>{val}</div>
            <div style={{ color: "#6B7280", fontSize: 9, marginTop: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Full accountability coverage bar */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9, color: "#6B7280", marginBottom: 3 }}>FULL CONTACT ACCOUNTABILITY COVERAGE ({trackedPct}%)</div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${trackedPct}%`, background: GR, borderRadius: 3, transition: "width 0.6s" }} />
        </div>
      </div>

      {/* Filter tabs + search */}
      <div style={{ padding: "6px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "rgba(0,207,255,0.15)" : "none",
            border: `1px solid ${tab === t ? CY : BORDER}`,
            color: tab === t ? CY : "#6B7280", cursor: "pointer",
            padding: "2px 7px", borderRadius: 3, fontSize: 9, fontFamily: FONT,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{ flex: 1, minWidth: 100, background: "rgba(255,255,255,0.05)", border: `1px solid ${BORDER}`, color: CY, padding: "2px 6px", borderRadius: 3, fontSize: 10, fontFamily: FONT }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
        {error && <div style={{ color: RD, padding: 8 }}>Error: {error}</div>}
        {!error && visible.length === 0 && !loading && (
          <div style={{ color: "#6B7280", padding: 8, textAlign: "center" }}>No items match.</div>
        )}
        {visible.map((contact, i) => {
          const id   = contact.id || contact.contact_id || i;
          const isExp = expanded === id;
          const clr  = CLASS_COLOR[contact._cls] || AM;
          return (
            <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 6, marginBottom: 6 }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: clr, fontWeight: 700, fontSize: 10 }}>{contact._cls}</span>
                  <span style={{ color: CY }}>{contact.name || contact.full_name || `Contact ${id}`}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 9, color: "#6B7280" }}>
                  {contact._ops.length > 0   && <span style={{ color: BL }}>OPS:{contact._ops.length}</span>}
                  {contact._swarm.length > 0  && <span style={{ color: TE }}>SWM:{contact._swarm.length}</span>}
                  {contact._inv.length > 0    && <span style={{ color: GR }}>INV:{contact._inv.length}</span>}
                  <span>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {(contact.role || contact.org || contact.organization) && (
                <div style={{ color: "#9CA3AF", fontSize: 9, paddingLeft: 4, marginBottom: 2 }}>
                  {contact.role}{contact.role && (contact.org || contact.organization) ? " · " : ""}{contact.org || contact.organization || ""}
                </div>
              )}
              {isExp && (
                <div style={{ paddingLeft: 8, paddingTop: 4 }}>
                  {contact._ops.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: BL, fontSize: 9, marginBottom: 3 }}>MATCHED OPS EVENTS</div>
                      {contact._ops.map((e, ei) => (
                        <div key={ei} style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: BL, fontSize: 10 }}>{e.title || e.name || "Event"}</span>
                            {(e.type || e.event_type) && <span style={{ background: "rgba(59,130,246,0.15)", color: BL, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{(e.type || e.event_type).toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (e._score / 5) * 100)}%`, background: BL, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {contact._swarm.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 3 }}>MATCHED SWARM JOBS</div>
                      {contact._swarm.map((j, ji) => (
                        <div key={ji} style={{ background: "rgba(20,184,166,0.06)", border: "1px solid rgba(20,184,166,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: TE, fontSize: 10 }}>{j.name || j.title || "SwarmJob"}</span>
                            {j.status && <span style={{ background: "rgba(20,184,166,0.15)", color: TE, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{j.status.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (j._score / 5) * 100)}%`, background: TE, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {contact._inv.length > 0 && (
                    <div>
                      <div style={{ color: GR, fontSize: 9, marginBottom: 3 }}>MATCHED INVESTIGATIONS</div>
                      {contact._inv.map((inv, ii) => (
                        <div key={ii} style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 4, padding: "4px 7px", marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: GR, fontSize: 10 }}>{inv.title || inv.name || "Investigation"}</span>
                            {inv.priority && <span style={{ background: "rgba(34,197,94,0.15)", color: GR, padding: "1px 4px", borderRadius: 2, fontSize: 8 }}>{inv.priority.toUpperCase()}</span>}
                          </div>
                          <div style={{ marginTop: 3, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (inv._score / 5) * 100)}%`, background: GR, borderRadius: 2 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {contact._ops.length === 0 && contact._swarm.length === 0 && contact._inv.length === 0 && (
                    <div style={{ color: AM, fontSize: 9, padding: "4px 0" }}>No ops event, swarm job, or investigation coverage found for this contact.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Assess button */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess} disabled={assessing}
          style={{ background: "rgba(0,207,255,0.1)", border: `1px solid ${CY}`, color: CY, cursor: assessing ? "wait" : "pointer", padding: "5px 14px", borderRadius: 4, fontFamily: FONT, fontSize: 10, width: "100%" }}
        >
          {assessing ? "⟳ Assessing…" : "▶ ASSESS CONTACT ACCOUNTABILITY"}
        </button>
        {brief && <div style={{ color: "#9CA3AF", fontSize: 10, marginTop: 6, lineHeight: 1.5 }}>{brief}</div>}
      </div>
    </div>
  );
}
