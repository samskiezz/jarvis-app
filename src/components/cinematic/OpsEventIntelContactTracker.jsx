/**
 * F112 — Ops Event × IntelProfile × Contact Threat Response Tracker (OICTRC)
 *
 * Parallel-fetches /v1/ops/events + /entities/IntelProfile + /entities/Contact.
 * Keyword-correlates each ops event against intel actor profiles AND contacts to classify:
 *   RESPONSE_COORDINATED  (intel profile + contact match)
 *   ACTOR_TRACKED         (intel profile match only)
 *   CONTACT_NOTIFIED      (contact match only)
 *   UNHANDLED             (neither — no actor tracking or contact assignment)
 *
 * Red pulse + badge on unhandled count.
 * Stat tiles OPS EVENTS / INTEL PROFILES / CONTACTS + all four class counts + RESPONSE%.
 * Filter tabs ALL/RESPONSE_COORDINATED/ACTOR_TRACKED/CONTACT_NOTIFIED/UNHANDLED + text search.
 * Expand event → matched intel profile cards (orange) + contact cards (teal) with relevance bars.
 * ▶ ASSESS RESPONSE → /v1/jarvis/agent/chat 2-sentence threat response brief + TTS.
 * Voice trigger: "oictrc/ops intel contact/threat response tracker/unhandled events/event response tracker".
 * Event: jarvis:oictrc-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_005_640;
const Z_INDEX  = 174;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const OICTRC_RE = /\b(oictrc|ops[\s-]intel[\s-]contact|threat[\s-]response[\s-]tracker|unhandled[\s-]events?|event[\s-]response[\s-]tracker)\b/i;

const CY    = "#00CFFF";
const OR    = "#F97316";
const TE    = "#14B8A6";
const GR    = "#22C55E";
const AM    = "#F59E0B";
const RD    = "#EF4444";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  RESPONSE_COORDINATED: GR,
  ACTOR_TRACKED:        OR,
  CONTACT_NOTIFIED:     TE,
  UNHANDLED:            RD,
};

const TABS = ["ALL","RESPONSE_COORDINATED","ACTOR_TRACKED","CONTACT_NOTIFIED","UNHANDLED"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isOictrcQuery(text) {
  return OICTRC_RE.test(text || "");
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

function opsKey(ev) {
  return [ev.title, ev.description, ev.type, ev.category, ev.tags, ev.location, ev.id]
    .filter(Boolean).join(" ");
}

function intelKey(prof) {
  return [prof.name, prof.aliases, prof.org, prof.role, prof.tags, prof.description, prof.id]
    .filter(Boolean).join(" ");
}

function contactKey(c) {
  return [c.name, c.role, c.org, c.email, c.tags, c.department, c.id]
    .filter(Boolean).join(" ");
}

async function fetchAll() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const [opsRes, intelRes, contactRes] = await Promise.all([
    fetch(`${base}/v1/ops/events`,       { headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/IntelProfile`,{ headers }).then(r => r.ok ? r.json() : []),
    fetch(`${base}/entities/Contact`,    { headers }).then(r => r.ok ? r.json() : []),
  ]);
  const opsEvents     = norm(opsRes,     ["events","data","items","results"]);
  const intelProfiles = norm(intelRes,   ["profiles","data","items","results"]);
  const contacts      = norm(contactRes, ["contacts","data","items","results"]);
  return { opsEvents, intelProfiles, contacts };
}

function classify(opsEvents, intelProfiles, contacts) {
  return opsEvents.map(ev => {
    const ok = opsKey(ev);
    const matchedIntel   = intelProfiles.filter(p => overlap(ok, intelKey(p))   > 0.08);
    const matchedContacts = contacts.filter(c => overlap(ok, contactKey(c)) > 0.08);
    const hasIntel   = matchedIntel.length   > 0;
    const hasContact = matchedContacts.length > 0;
    const cls =
      hasIntel && hasContact ? "RESPONSE_COORDINATED" :
      hasIntel               ? "ACTOR_TRACKED"        :
      hasContact             ? "CONTACT_NOTIFIED"     :
                               "UNHANDLED";
    return {
      ...ev,
      _class:   cls,
      _intel:   matchedIntel.map(p   => ({ ...p, _rel: overlap(ok, intelKey(p))   })),
      _contacts: matchedContacts.map(c => ({ ...c, _rel: overlap(ok, contactKey(c)) })),
    };
  });
}

export async function buildOictrcScript() {
  const base    = apiBase();
  const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const { opsEvents, intelProfiles, contacts } = await fetchAll();
  const rows       = classify(opsEvents, intelProfiles, contacts);
  const total      = rows.length;
  const coordinated = rows.filter(r => r._class === "RESPONSE_COORDINATED").length;
  const actorOnly   = rows.filter(r => r._class === "ACTOR_TRACKED").length;
  const contactOnly = rows.filter(r => r._class === "CONTACT_NOTIFIED").length;
  const unhandled   = rows.filter(r => r._class === "UNHANDLED").length;
  const resPct      = total ? Math.round(((coordinated + actorOnly + contactOnly) / total) * 100) : 0;
  const ctx =
    `Ops events: ${total}. Intel profiles: ${intelProfiles.length}. Contacts: ${contacts.length}. ` +
    `Response coordinated: ${coordinated}. Actor tracked: ${actorOnly}. Contact notified: ${contactOnly}. ` +
    `Unhandled: ${unhandled}. Response coverage: ${resPct}%.`;
  const chat = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Assess operational threat response coverage. Context: ${ctx}`,
    }),
  }).then(r => r.ok ? r.json() : null);
  return chat?.response || chat?.message || chat?.content || chat?.reply ||
    `Threat response coverage stands at ${resPct} percent, sir. ${unhandled} operational events remain unhandled — no actor tracking or contact assignment — requiring immediate response coordination.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function OpsEventIntelContactTracker() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [counts,    setCounts]    = useState({ total:0, intel:0, contacts:0, coordinated:0, actorOnly:0, contactOnly:0, unhandled:0 });
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const { opsEvents, intelProfiles, contacts } = await fetchAll();
      const classified = classify(opsEvents, intelProfiles, contacts);
      setRows(classified);
      setCounts({
        total:       classified.length,
        intel:       intelProfiles.length,
        contacts:    contacts.length,
        coordinated: classified.filter(r => r._class === "RESPONSE_COORDINATED").length,
        actorOnly:   classified.filter(r => r._class === "ACTOR_TRACKED").length,
        contactOnly: classified.filter(r => r._class === "CONTACT_NOTIFIED").length,
        unhandled:   classified.filter(r => r._class === "UNHANDLED").length,
      });
    } catch(e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:oictrc-toggle", handler);
    return () => window.removeEventListener("jarvis:oictrc-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAssessing(true); setBrief("");
    try {
      const script = await buildOictrcScript();
      setBrief(script);
      const base    = apiBase();
      const headers = { ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      }).then(async r => {
        if (!r.ok) return;
        const blob  = await r.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }).catch(() => {});
    } catch(e) {
      setBrief(String(e?.message || e));
    } finally {
      setAssessing(false);
    }
  }, []);

  if (!open) {
    const unhandledBadge = counts.unhandled > 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Ops Event × IntelProfile × Contact Threat Response Tracker (OICTRC)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.85)",
          border: `1px solid ${unhandledBadge ? RD : BORDER}`,
          color: unhandledBadge ? RD : CY,
          fontFamily: FONT, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
          animation: unhandledBadge ? "oictrcPulse 2s ease-in-out infinite" : "none",
        }}
      >
        ◈ OICTRC{unhandledBadge ? ` [${counts.unhandled}]` : ""}
        <style>{`@keyframes oictrcPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.4)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}`}</style>
      </button>
    );
  }

  const resPct = counts.total
    ? Math.round(((counts.coordinated + counts.actorOnly + counts.contactOnly) / counts.total) * 100)
    : 0;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r._class !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.title || r.description || r.type || r.id || "").toLowerCase().includes(q);
    }
    return true;
  });

  const tile = (label, value, color) => (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`,
      borderRadius: 6, padding: "6px 10px", textAlign: "center", minWidth: 80,
    }}>
      <div style={{ color, fontSize: 16, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "#8892A4", fontSize: 9, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", bottom: 44, left: BTN_LEFT - 200, zIndex: Z_INDEX,
      width: 640, maxHeight: "72vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 10,
      fontFamily: FONT, fontSize: 11, color: "#C8D6E5", boxShadow: "0 8px 32px #000A",
      overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: CY, fontWeight: 700, fontSize: 12 }}>
            ◈ OICTRC — Threat Response Tracker
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={load} disabled={loading}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: CY,
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              {loading ? "…" : "↺"}
            </button>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: `1px solid ${BORDER}`, color: "#8892A4",
                fontFamily: FONT, fontSize: 10, padding: "2px 7px", borderRadius: 4, cursor: "pointer" }}>
              ✕
            </button>
          </div>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {tile("OPS EVENTS",            counts.total,       CY)}
          {tile("INTEL PROFILES",        counts.intel,       OR)}
          {tile("CONTACTS",              counts.contacts,    TE)}
          {tile("RESP. COORDINATED",     counts.coordinated, GR)}
          {tile("ACTOR TRACKED",         counts.actorOnly,   OR)}
          {tile("CONTACT NOTIFIED",      counts.contactOnly, TE)}
          {tile("UNHANDLED",             counts.unhandled,   RD)}
          {tile("RESPONSE%",             `${resPct}%`,       resPct >= 70 ? GR : resPct >= 40 ? AM : RD)}
        </div>

        {/* response coverage bar */}
        <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
          <div style={{
            height: "100%", width: `${resPct}%`,
            background: resPct >= 70 ? GR : AM,
            borderRadius: 2, transition: "width 0.4s",
          }} />
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                background: tab === t ? "rgba(0,207,255,0.12)" : "none",
                border: `1px solid ${tab === t ? CY : BORDER}`,
                color: tab === t ? CY : "#8892A4", fontFamily: FONT, fontSize: 9,
                padding: "2px 6px", borderRadius: 3, cursor: "pointer",
              }}>
              {t.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search ops events…"
          style={{
            marginTop: 7, width: "100%", boxSizing: "border-box",
            background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
            color: "#C8D6E5", fontFamily: FONT, fontSize: 10, padding: "4px 8px",
            borderRadius: 4, outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 10px" }}>
        {err && <div style={{ color: RD, padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#8892A4", textAlign: "center", padding: 16 }}>No ops events match.</div>
        )}
        {filtered.map((row, i) => {
          const isExp    = expanded === i;
          const clsColor = CLASS_COLOR[row._class] || AM;
          return (
            <div key={row.id || i} style={{
              marginBottom: 5, border: `1px solid ${clsColor}33`,
              borderRadius: 6, overflow: "hidden",
            }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex",
                  justifyContent: "space-between", alignItems: "center",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: "#EDF2F7", fontWeight: 600 }}>
                    {row.title || row.description || row.id || "Unknown Event"}
                  </span>
                  {(row.type || row.category) && (
                    <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 6 }}>
                      [{row.type || row.category}]
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{
                    background: `${clsColor}22`, border: `1px solid ${clsColor}55`,
                    color: clsColor, fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  }}>
                    {row._class.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: "#8892A4", fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>

              {isExp && (
                <div style={{ padding: "8px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Intel Profiles */}
                  {row._intel.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: OR, fontSize: 9, marginBottom: 4 }}>
                        ◆ INTEL PROFILES ({row._intel.length})
                      </div>
                      {row._intel.sort((a,b) => b._rel - a._rel).slice(0,5).map((prof, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {prof.name || prof.id}
                              {prof.role && <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 4 }}>[{prof.role}]</span>}
                            </span>
                            <span style={{ color: OR, fontSize: 9 }}>
                              {Math.round(prof._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${Math.round(prof._rel * 100)}%`, background: OR, borderRadius: 1 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Contacts */}
                  {row._contacts.length > 0 && (
                    <div>
                      <div style={{ color: TE, fontSize: 9, marginBottom: 4 }}>
                        ◇ CONTACTS ({row._contacts.length})
                      </div>
                      {row._contacts.sort((a,b) => b._rel - a._rel).slice(0,5).map((c, j) => (
                        <div key={j} style={{ marginBottom: 4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ color: "#C8D6E5", fontSize: 10 }}>
                              {c.name || c.id}
                              {c.role && <span style={{ color: "#8892A4", fontSize: 9, marginLeft: 4 }}>[{c.role}]</span>}
                            </span>
                            <span style={{ color: TE, fontSize: 9 }}>
                              {Math.round(c._rel * 100)}%
                            </span>
                          </div>
                          <div style={{ height: 2, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
                            <div style={{ height: "100%", width: `${Math.round(c._rel * 100)}%`, background: TE, borderRadius: 1 }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {row._intel.length === 0 && row._contacts.length === 0 && (
                    <div style={{ color: RD, fontSize: 10 }}>
                      No intel profile or contact match — event is UNHANDLED.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{ padding: "8px 10px", borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <button onClick={assess} disabled={assessing}
            style={{
              background: "rgba(0,207,255,0.08)", border: `1px solid ${CY}55`,
              color: CY, fontFamily: FONT, fontSize: 10, padding: "4px 12px",
              borderRadius: 4, cursor: assessing ? "not-allowed" : "pointer", flexShrink: 0,
            }}>
            {assessing ? "ASSESSING…" : "▶ ASSESS RESPONSE"}
          </button>
          {brief && (
            <div style={{
              color: "#C8D6E5", fontSize: 10, lineHeight: 1.5,
              background: "rgba(0,207,255,0.05)", border: `1px solid ${CY}22`,
              borderRadius: 4, padding: "4px 8px", flex: 1,
            }}>
              {brief}
            </div>
          )}
        </div>
        <div style={{ color: "#4A5568", fontSize: 9, marginTop: 6 }}>
          Auto-refresh 90 s · /v1/ops/events × /entities/IntelProfile × /entities/Contact
        </div>
      </div>
    </div>
  );
}
