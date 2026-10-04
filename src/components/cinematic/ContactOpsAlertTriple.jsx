/**
 * F134 — Contact × Ops Events × Alert Triple (COAT)
 *
 * Parallel-fetches /entities/Contact, /v1/ops/events, and /v1/alerts every 90 s.
 * Keyword-correlates each contact (name, email, title, company, description)
 * against live ops events AND active alerts to classify:
 *
 *  FULLY_EXPOSED — contact matches both ops events AND alerts
 *  OPS_ONLY      — contact matches ops events only
 *  ALERT_ONLY    — contact matches alerts only
 *  CLEAR         — no matches found for this contact
 *
 * Stat tiles: contacts / ops-events / alerts / fully-exposed
 * Amber badge on fully-exposed count.
 * Filter tabs: ALL / FULLY_EXPOSED / OPS_ONLY / ALERT_ONLY / CLEAR + text search.
 * Expand contact row → matched ops events list + matched alerts with severity badge + relevance bars.
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ COAT  at left:4620 bottom:18, zIndex:68.
 * Event:   jarvis:coat-toggle
 * Voice:   "contact ops alert / coat / contact exposure / contact ops events /
 *           contact alert exposure / contacts under fire / contact threat exposure /
 *           contact operational alert / coat panel"
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3B6B";
const GREEN = "#00c878";
const MUTED = "#6E8AA0";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4620;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseContacts(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:          String(c.id ?? c.contact_id ?? i),
    name:        c.name ?? c.full_name ?? c.display_name ?? `Contact ${i + 1}`,
    email:       c.email ?? c.email_address ?? "",
    title:       c.title ?? c.role ?? c.occupation ?? "",
    company:     c.company ?? c.organization ?? c.employer ?? "",
    description: c.description ?? c.notes ?? c.bio ?? c.summary ?? "",
    tags:        Array.isArray(c.tags) ? c.tags : [],
  }));
}

function normaliseOpsEvents(raw) {
  return normaliseArray(raw).map((e, i) => ({
    id:          String(e.id ?? e.event_id ?? i),
    type:        e.type ?? e.event_type ?? "event",
    resource:    e.resource ?? e.resource_name ?? e.service ?? "",
    description: e.description ?? e.message ?? e.detail ?? "",
    severity:    e.severity ?? e.level ?? "info",
  }));
}

function normaliseAlerts(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:          String(a.id ?? a.alert_id ?? i),
    category:    a.category ?? a.type ?? "alert",
    message:     a.message ?? a.title ?? a.description ?? `Alert ${i + 1}`,
    severity:    a.severity ?? a.level ?? "info",
    source:      a.source ?? a.origin ?? "",
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlateContact(contact, items, keyFn) {
  const haystack = [
    contact.name, contact.email, contact.title,
    contact.company, contact.description, ...contact.tags,
  ].join(" ");
  const needles = new Set(tokenise(haystack));
  const matches = [];
  for (const item of items) {
    const itemTokens = tokenise(keyFn(item));
    const score = itemTokens.filter(t => needles.has(t)).length;
    if (score > 0) matches.push({ ...item, score });
  }
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

const SEV_COLOR = { critical: RED, high: AMBER, warning: AMBER, medium: AMBER, low: GREEN, info: MUTED };

function sevColor(sev) {
  return SEV_COLOR[String(sev).toLowerCase()] ?? MUTED;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const COAT_RE = /\b(contact\s*ops\s*alert|coat\s*panel?|coat(?:\s|$)|contact\s*exposure|contact\s*ops\s*event|contact\s*alert\s*exposure|contacts?\s*under\s*fire|contact\s*threat\s*exposure|contact\s*operational\s*alert)\b/i;

export function isCoatQuery(q) {
  return COAT_RE.test(q);
}

export async function buildCoatScript() {
  try {
    const base = apiBase();
    const auth = { Authorization: `Bearer ${API_KEY}` };
    const [cr, or, ar] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: auth }),
      fetch(`${base}/v1/ops/events`,     { headers: auth }),
      fetch(`${base}/v1/alerts`,         { headers: auth }),
    ]);
    const [cRaw, oRaw, aRaw] = await Promise.all([cr.json(), or.json(), ar.json()]);
    const contacts  = normaliseContacts(cRaw);
    const opsEvents = normaliseOpsEvents(oRaw);
    const alerts    = normaliseAlerts(aRaw);

    let fully = 0;
    for (const c of contacts) {
      const hasOps   = correlateContact(c, opsEvents, e => `${e.type} ${e.resource} ${e.description}`).length > 0;
      const hasAlert = correlateContact(c, alerts,    a => `${a.category} ${a.message} ${a.source}`).length > 0;
      if (hasOps && hasAlert) fully++;
    }
    return `JARVIS COAT: ${contacts.length} contacts correlated against ${opsEvents.length} ops events and ${alerts.length} active alerts. ${fully} contacts are FULLY_EXPOSED — matching both live operational events and active alerts simultaneously — flagging them for immediate attention.`;
  } catch {
    return "COAT data unavailable. Check /entities/Contact, /v1/ops/events, and /v1/alerts endpoints.";
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function ContactOpsAlertTriple() {
  const [open, setOpen]         = useState(false);
  const [contacts, setContacts] = useState([]);
  const [opsEvents, setOps]     = useState([]);
  const [alerts, setAlerts]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing]   = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const auth = { Authorization: `Bearer ${API_KEY}` };
      const [cr, or, ar] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: auth }),
        fetch(`${base}/v1/ops/events`,    { headers: auth }),
        fetch(`${base}/v1/alerts`,        { headers: auth }),
      ]);
      const [cRaw, oRaw, aRaw] = await Promise.all([cr.json(), or.json(), ar.json()]);
      setContacts(normaliseContacts(cRaw));
      setOps(normaliseOpsEvents(oRaw));
      setAlerts(normaliseAlerts(aRaw));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:coat-toggle", handler);
    return () => window.removeEventListener("jarvis:coat-toggle", handler);
  }, []);

  const rows = contacts.map(c => {
    const opsMatches   = correlateContact(c, opsEvents, e => `${e.type} ${e.resource} ${e.description}`);
    const alertMatches = correlateContact(c, alerts,    a => `${a.category} ${a.message} ${a.source}`);
    const hasOps   = opsMatches.length > 0;
    const hasAlert = alertMatches.length > 0;
    let status;
    if (hasOps && hasAlert)  status = "FULLY_EXPOSED";
    else if (hasOps)         status = "OPS_ONLY";
    else if (hasAlert)       status = "ALERT_ONLY";
    else                     status = "CLEAR";
    return { ...c, opsMatches, alertMatches, status };
  });

  const fullyCount = rows.filter(r => r.status === "FULLY_EXPOSED").length;

  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) ||
             r.email.toLowerCase().includes(q) ||
             r.company.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true); setAssessText("");
    const script = await buildCoatScript();
    setAssessText(script);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    setAssessing(false);
  };

  const statusColor = s => ({
    FULLY_EXPOSED: RED,
    OPS_ONLY:      AMBER,
    ALERT_ONLY:    AMBER,
    CLEAR:         GREEN,
  }[s] ?? MUTED);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
          background: "rgba(0,20,40,0.85)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: MONO, fontSize: 10, padding: "4px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ COAT
        {fullyCount > 0 && (
          <span style={{
            marginLeft: 5, background: AMBER, color: "#000",
            borderRadius: 3, padding: "1px 5px", fontSize: 9,
          }}>
            {fullyCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 60, bottom: 60, zIndex: 200,
      width: 600, maxHeight: "74vh",
      background: "rgba(0,12,28,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: MONO, color: CY, fontSize: 11, overflow: "hidden",
      boxShadow: `0 0 32px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        background: "rgba(0,30,60,0.5)",
      }}>
        <span style={{ flex: 1, fontWeight: 700, letterSpacing: 1 }}>
          ◈ CONTACT × OPS EVENTS × ALERT TRIPLE
        </span>
        {loading && <span style={{ color: MUTED, fontSize: 9 }}>POLLING…</span>}
        <button onClick={load} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 13 }}>↺</button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 15 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 12px" }}>
        {[
          { label: "CONTACTS",   val: contacts.length,  col: CY },
          { label: "OPS EVENTS", val: opsEvents.length, col: MUTED },
          { label: "ALERTS",     val: alerts.length,    col: AMBER },
          { label: "FULLY EXP",  val: fullyCount,       col: RED },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            flex: 1, background: "rgba(0,20,40,0.7)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "5px 8px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: MUTED, fontSize: 8, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {["ALL", "FULLY_EXPOSED", "OPS_ONLY", "ALERT_ONLY", "CLEAR"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "3px 8px", borderRadius: 4, fontSize: 9, cursor: "pointer",
            background: tab === t ? CY : "rgba(0,20,40,0.6)",
            color: tab === t ? "#000" : CY,
            border: `1px solid ${CY}44`,
          }}>
            {t}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search contacts…"
          style={{
            flex: 1, minWidth: 100, background: "rgba(0,20,40,0.6)", border: `1px solid ${CY}33`,
            color: CY, borderRadius: 4, padding: "3px 7px", fontSize: 9, fontFamily: MONO,
          }}
        />
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 8px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!err && filtered.length === 0 && (
          <div style={{ color: MUTED, padding: 8, fontSize: 10 }}>No contacts match.</div>
        )}
        {filtered.map(r => (
          <div key={r.id} style={{ marginBottom: 4 }}>
            <div
              onClick={() => setExpanded(x => ({ ...x, [r.id]: !x[r.id] }))}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
                background: "rgba(0,20,40,0.55)", border: `1px solid ${CY}22`,
                borderRadius: 5, cursor: "pointer",
              }}
            >
              <span style={{ flex: 1, color: CY, fontSize: 10 }}>{r.name}</span>
              {r.company && <span style={{ color: MUTED, fontSize: 9 }}>{r.company}</span>}
              {r.opsMatches.length > 0 && (
                <span style={{ fontSize: 8, color: AMBER }}>OPS:{r.opsMatches.length}</span>
              )}
              {r.alertMatches.length > 0 && (
                <span style={{ fontSize: 8, color: RED }}>ALT:{r.alertMatches.length}</span>
              )}
              <span style={{
                fontSize: 8, padding: "2px 5px", borderRadius: 3,
                background: `${statusColor(r.status)}22`,
                color: statusColor(r.status),
                border: `1px solid ${statusColor(r.status)}55`,
              }}>
                {r.status}
              </span>
              <span style={{ color: MUTED, fontSize: 9 }}>{expanded[r.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[r.id] && (
              <div style={{
                background: "rgba(0,10,25,0.7)", border: `1px solid ${CY}18`,
                borderTop: "none", borderRadius: "0 0 5px 5px", padding: "6px 10px",
              }}>
                {r.email && (
                  <div style={{ color: MUTED, fontSize: 9, marginBottom: 6 }}>
                    ✉ {r.email}{r.title && <span style={{ marginLeft: 8 }}>· {r.title}</span>}
                  </div>
                )}

                {/* ops event matches */}
                <div style={{ color: AMBER, fontSize: 9, marginBottom: 4, fontWeight: 700 }}>
                  OPS EVENTS ({r.opsMatches.length})
                </div>
                {r.opsMatches.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: 9, marginBottom: 6 }}>No ops-event matches.</div>
                ) : (
                  r.opsMatches.slice(0, 5).map((m, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ color: CY, fontSize: 9, minWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.resource || m.type}
                      </span>
                      <span style={{
                        fontSize: 8, padding: "1px 4px", borderRadius: 3,
                        background: `${sevColor(m.severity)}22`, color: sevColor(m.severity),
                        border: `1px solid ${sevColor(m.severity)}44`,
                      }}>
                        {m.severity}
                      </span>
                      <div style={{ flex: 1, height: 4, background: `${AMBER}18`, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, m.score * 20)}%`, background: AMBER }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 8 }}>rel:{m.score}</span>
                    </div>
                  ))
                )}

                {/* alert matches */}
                <div style={{ color: RED, fontSize: 9, marginTop: 6, marginBottom: 4, fontWeight: 700 }}>
                  ALERTS ({r.alertMatches.length})
                </div>
                {r.alertMatches.length === 0 ? (
                  <div style={{ color: MUTED, fontSize: 9 }}>No alert matches.</div>
                ) : (
                  r.alertMatches.slice(0, 5).map((a, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ color: CY, fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.message}
                      </span>
                      <span style={{
                        fontSize: 8, padding: "1px 4px", borderRadius: 3,
                        background: `${sevColor(a.severity)}22`, color: sevColor(a.severity),
                        border: `1px solid ${sevColor(a.severity)}44`,
                      }}>
                        {a.severity}
                      </span>
                      <div style={{ width: 50, height: 4, background: `${RED}18`, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${Math.min(100, a.score * 20)}%`, background: RED }} />
                      </div>
                      <span style={{ color: MUTED, fontSize: 8 }}>rel:{a.score}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "6px 12px 10px", borderTop: `1px solid ${CY}22` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`,
            color: CY, fontFamily: MONO, fontSize: 9,
            padding: "4px 12px", borderRadius: 4, cursor: "pointer",
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>
        {assessText && (
          <div style={{
            marginTop: 6, color: GREEN, fontSize: 9,
            lineHeight: 1.5, background: `${GREEN}0D`,
            border: `1px solid ${GREEN}22`, borderRadius: 4, padding: "5px 8px",
          }}>
            {assessText}
          </div>
        )}
      </div>
    </div>
  );
}
