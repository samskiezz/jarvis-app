/**
 * F745 — Contact × Intel Profile × Ops Events Triple Nexus (CIOETRI)
 * Endpoints: /entities/Contact  ×  /entities/IntelProfile  ×  /v1/ops/events
 * Classification: FULLY_EXPOSED | INTEL_ONLY | OPS_ONLY | DARK
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const PR  = "#B47FFF";
const DIM = "#8899AA";

const BTN_LEFT = 912_520;
const POLL_MS  = 90_000;

const CIOETRI_RE =
  /\b(cioetri|contact\s+intel\s+ops|contact\s+intel(?:ligence)?\s+profile\s+ops|intel\s+ops\s+contact|ops\s+event\s+intel|contact\s+intelligence\s+coverage|exposed\s+contact|intel\s+ops\s+nexus|dark\s+contact|unlinked\s+contact|contact\s+nexus)\b/i;

export function isCioetriQuery(t) {
  return CIOETRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.contacts)) return raw.contacts;
  if (raw && Array.isArray(raw.data))     return raw.data;
  if (raw && Array.isArray(raw.items))    return raw.items;
  return [];
}

function normaliseIntelProfiles(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.intel_profiles)) return raw.intel_profiles;
  if (raw && Array.isArray(raw.profiles))        return raw.profiles;
  if (raw && Array.isArray(raw.data))            return raw.data;
  if (raw && Array.isArray(raw.items))           return raw.items;
  return [];
}

function normaliseEvents(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.events)) return raw.events;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.role,
    obj.organisation, obj.organization, obj.tags,
    obj.type, obj.category, obj.summary,
    obj.threat_actor, obj.subject, obj.topic, obj.event_type,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(contacts, intelProfiles, opsEvents) {
  return contacts.map(contact => {
    const cKw = keywords(contact);
    const bestIntel = intelProfiles.reduce(
      (best, ip) => {
        const s = scoreMatch(cKw, keywords(ip));
        return s > best.score ? { score: s, ip } : best;
      },
      { score: 0, ip: null },
    );
    const bestEvent = opsEvents.reduce(
      (best, ev) => {
        const s = scoreMatch(cKw, keywords(ev));
        return s > best.score ? { score: s, ev } : best;
      },
      { score: 0, ev: null },
    );
    const hasIntel = bestIntel.score > 0;
    const hasEvent = bestEvent.score > 0;
    const status =
      hasIntel && hasEvent ? "FULLY_EXPOSED" :
      hasIntel              ? "INTEL_ONLY"   :
      hasEvent              ? "OPS_ONLY"     :
                              "DARK";
    return {
      contact,
      matchedIntel : hasIntel ? bestIntel.ip : null,
      matchedEvent : hasEvent ? bestEvent.ev : null,
      status,
    };
  });
}

async function fetchAll() {
  const base = apiBase();
  const [contactsRes, intelRes, eventsRes] = await Promise.all([
    fetch(`${base}/entities/Contact`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/entities/IntelProfile`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${base}/v1/ops/events`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);
  return {
    contacts      : normaliseContacts(contactsRes),
    intelProfiles : normaliseIntelProfiles(intelRes),
    opsEvents     : normaliseEvents(eventsRes),
  };
}

export async function buildCioetriScript() {
  try {
    const { contacts, intelProfiles, opsEvents } = await fetchAll();
    const nexus = buildNexus(contacts, intelProfiles, opsEvents);
    const counts = {
      FULLY_EXPOSED : nexus.filter(r => r.status === "FULLY_EXPOSED").length,
      INTEL_ONLY    : nexus.filter(r => r.status === "INTEL_ONLY").length,
      OPS_ONLY      : nexus.filter(r => r.status === "OPS_ONLY").length,
      DARK          : nexus.filter(r => r.status === "DARK").length,
    };
    const darkNames = nexus
      .filter(r => r.status === "DARK")
      .slice(0, 3)
      .map(r => r.contact.name || r.contact.title || "Unknown")
      .join("; ");
    return (
      `Contact Intel Ops Triple Nexus: ${contacts.length} contacts cross-referenced against ` +
      `${intelProfiles.length} intel profiles and ${opsEvents.length} ops events. ` +
      `${counts.FULLY_EXPOSED} fully exposed (both intel+ops match). ` +
      `${counts.INTEL_ONLY} matched to intel profile only. ` +
      `${counts.OPS_ONLY} matched to ops event only. ` +
      `${counts.DARK} dark — no coverage${darkNames ? `: ${darkNames}` : ""}. ` +
      `Review dark contacts for unlinked intelligence exposure.`
    );
  } catch {
    return "Contact Intel Ops Triple Nexus data unavailable.";
  }
}

const STATUS_META = {
  FULLY_EXPOSED : { label: "FULLY EXPOSED", col: GN  },
  INTEL_ONLY    : { label: "INTEL ONLY",    col: CY  },
  OPS_ONLY      : { label: "OPS ONLY",      col: AM  },
  DARK          : { label: "DARK",          col: RD  },
};

export default function ContactIntelOpsTriple() {
  const [open,   setOpen]   = useState(false);
  const [rows,   setRows]   = useState([]);
  const [counts, setCounts] = useState({ FULLY_EXPOSED:0, INTEL_ONLY:0, OPS_ONLY:0, DARK:0 });
  const [loading, setLoading] = useState(false);
  const [err,    setErr]    = useState(null);
  const [filter, setFilter] = useState("ALL");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { contacts, intelProfiles, opsEvents } = await fetchAll();
      const nexus = buildNexus(contacts, intelProfiles, opsEvents);
      setRows(nexus);
      setCounts({
        FULLY_EXPOSED : nexus.filter(r => r.status === "FULLY_EXPOSED").length,
        INTEL_ONLY    : nexus.filter(r => r.status === "INTEL_ONLY").length,
        OPS_ONLY      : nexus.filter(r => r.status === "OPS_ONLY").length,
        DARK          : nexus.filter(r => r.status === "DARK").length,
      });
    } catch (e) {
      setErr(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:cioetri-toggle", toggle);
    return () => window.removeEventListener("jarvis:cioetri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = filter === "ALL" ? rows : rows.filter(r => r.status === filter);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position    : "fixed",
          bottom      : 8,
          left        : BTN_LEFT,
          zIndex      : 604,
          background  : open ? "rgba(180,127,255,0.18)" : "rgba(20,24,32,0.82)",
          border      : `1px solid ${open ? PR : DIM}`,
          color       : open ? PR : DIM,
          borderRadius: 6,
          padding     : "3px 10px",
          fontSize    : 11,
          cursor      : "pointer",
          fontFamily  : "monospace",
          letterSpacing: "0.05em",
          whiteSpace  : "nowrap",
        }}
        title="Contact × Intel Profile × Ops Events Triple Nexus (F745)"
      >
        CIOETRI
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position     : "fixed",
            bottom       : 36,
            left         : BTN_LEFT,
            width        : 780,
            maxHeight    : 520,
            zIndex       : 604,
            background   : "rgba(10,13,20,0.97)",
            border       : `1px solid ${PR}`,
            borderRadius : 10,
            boxShadow    : `0 0 32px ${PR}55`,
            display      : "flex",
            flexDirection: "column",
            overflow     : "hidden",
            fontFamily   : "monospace",
          }}
        >
          {/* Header */}
          <div style={{
            padding    : "8px 14px 6px",
            borderBottom: `1px solid ${PR}44`,
            display    : "flex",
            alignItems : "center",
            gap        : 10,
            flexShrink : 0,
          }}>
            <span style={{ color: PR, fontWeight: 700, fontSize: 12, letterSpacing: "0.1em" }}>
              CONTACT × INTEL PROFILE × OPS EVENTS — TRIPLE NEXUS
            </span>
            <span style={{ color: DIM, fontSize: 10, marginLeft: "auto" }}>F745</span>
            {loading && <span style={{ color: AM, fontSize: 10 }}>LOADING…</span>}
            <button
              onClick={() => setOpen(false)}
              style={{ background:"none", border:"none", color: DIM, cursor:"pointer", fontSize:14 }}
            >✕</button>
          </div>

          {/* Stat bar */}
          <div style={{
            display     : "flex",
            gap         : 8,
            padding     : "5px 14px",
            borderBottom: `1px solid ${PR}22`,
            flexShrink  : 0,
            flexWrap    : "wrap",
          }}>
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                onClick={() => setFilter(f => f === k ? "ALL" : k)}
                style={{
                  background  : filter === k ? `${m.col}22` : "transparent",
                  border      : `1px solid ${filter === k ? m.col : DIM + "66"}`,
                  color       : filter === k ? m.col : DIM,
                  borderRadius: 4,
                  padding     : "2px 8px",
                  fontSize    : 10,
                  cursor      : "pointer",
                  fontFamily  : "monospace",
                }}
              >
                {m.label} ({counts[k]})
              </button>
            ))}
            <button
              onClick={() => setFilter("ALL")}
              style={{
                background  : filter === "ALL" ? `${PR}22` : "transparent",
                border      : `1px solid ${filter === "ALL" ? PR : DIM + "66"}`,
                color       : filter === "ALL" ? PR : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
                fontFamily  : "monospace",
              }}
            >
              ALL ({rows.length})
            </button>
            <button
              onClick={load}
              style={{
                marginLeft  : "auto",
                background  : "transparent",
                border      : `1px solid ${DIM}66`,
                color       : DIM,
                borderRadius: 4,
                padding     : "2px 8px",
                fontSize    : 10,
                cursor      : "pointer",
              }}
            >↺</button>
          </div>

          {/* Error */}
          {err && (
            <div style={{ padding:"6px 14px", color: RD, fontSize:11 }}>
              ERROR: {err}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY:"auto", flex:1, padding:"4px 0" }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize:11, padding:"12px 14px" }}>
                No contacts{filter !== "ALL" ? ` in ${filter}` : ""}.
              </div>
            )}
            {visible.map((row, i) => {
              const c = row.contact;
              const meta = STATUS_META[row.status];
              const name  = c.name  || c.title || `Contact #${i + 1}`;
              const role  = c.role  || c.type  || "";
              const org   = c.organisation || c.organization || c.org || "";
              const intelLabel = row.matchedIntel
                ? (row.matchedIntel.name || row.matchedIntel.title || row.matchedIntel.subject || "Intel Profile")
                : null;
              const evtLabel = row.matchedEvent
                ? (row.matchedEvent.title || row.matchedEvent.name || row.matchedEvent.event_type || "Ops Event")
                : null;
              return (
                <div
                  key={i}
                  style={{
                    padding     : "6px 14px",
                    borderBottom: `1px solid ${PR}11`,
                    display     : "flex",
                    gap         : 10,
                    alignItems  : "flex-start",
                  }}
                >
                  <span style={{
                    minWidth     : 130,
                    fontSize     : 9,
                    color        : meta.col,
                    fontWeight   : 700,
                    letterSpacing: "0.06em",
                    paddingTop   : 1,
                  }}>
                    {meta.label}
                  </span>
                  <div style={{ flex:1 }}>
                    <div style={{ color:"#E8EEF6", fontSize:11, fontWeight:600 }}>
                      {name}
                      {role && (
                        <span style={{ color: DIM, fontWeight:400, marginLeft:6, fontSize:10 }}>
                          [{role}]
                        </span>
                      )}
                    </div>
                    {org && (
                      <div style={{ color: DIM, fontSize:10 }}>org: {org}</div>
                    )}
                    <div style={{ display:"flex", gap:6, marginTop:2, flexWrap:"wrap" }}>
                      {intelLabel && (
                        <span style={{ color: CY, fontSize:9, background:`${CY}12`, borderRadius:3, padding:"1px 5px" }}>
                          INTEL: {intelLabel}
                        </span>
                      )}
                      {evtLabel && (
                        <span style={{ color: AM, fontSize:9, background:`${AM}12`, borderRadius:3, padding:"1px 5px" }}>
                          EVENT: {evtLabel}
                        </span>
                      )}
                      {!intelLabel && !evtLabel && (
                        <span style={{ color: RD, fontSize:9, background:`${RD}12`, borderRadius:3, padding:"1px 5px" }}>
                          NO COVERAGE
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding   : "4px 14px",
            borderTop : `1px solid ${PR}22`,
            color     : DIM,
            fontSize  : 9,
            flexShrink: 0,
          }}>
            /entities/Contact × /entities/IntelProfile × /v1/ops/events | poll {POLL_MS / 1000}s | F745
          </div>
        </div>
      )}
    </>
  );
}
