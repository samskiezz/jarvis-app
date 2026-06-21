/**
 * F78 — Contact × Ops Event Linker
 *
 * Parallel-fetches /entities/Contact + /v1/ops/events, then keyword-correlates
 * each contact (name / role / department) against live ops event titles and
 * descriptions to surface which personnel are relevant to current incidents
 * (INVOLVED) vs not yet implicated (CLEAR).
 *
 * Stat tiles: contacts / events / involved / clear.
 * Filter tabs: ALL | INVOLVED | CLEAR.
 * Expand any contact → matched events with severity badge + timestamp.
 * ▶ ASSESS: sends a 2-sentence AI contact-ops brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ CTOPS  at bottom:8 left:9956, zIndex 69.
 * Voice:   "contact ops / ops contacts / who's involved / incident contacts / ctops"
 * Event:   jarvis:ctops-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9956;
const POLL_MS  = 60_000;

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const CTOPS_RE =
  /\b(contact\s+ops?|ops?\s+contacts?|who(?:'s|\s+is)\s+involved|incident\s+contacts?|personnel\s+ops?|responsible\s+contacts?|ctops)\b/i;

export function isCtopsQuery(q) { return CTOPS_RE.test(q); }

export async function buildCtopsScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, eRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,  { headers: hdr }),
      fetch(`${base}/v1/ops/events`,     { headers: hdr }),
    ]);
    const cRaw = await cRes.json();
    const eRaw = await eRes.json();
    const contacts = normaliseContacts(cRaw);
    const events   = normaliseEvents(eRaw);

    const involved = contacts.filter((c) =>
      events.some((ev) => relevance(c, ev) > 0)
    ).length;
    const clear = contacts.length - involved;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS contact-ops correlation: ${contacts.length} contacts, ` +
          `${events.length} live ops events, ${involved} contacts implicated in active incidents, ` +
          `${clear} contacts not connected to current ops. ` +
          `Give a 2-sentence contact-operations brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Contact operations analysis complete, sir.").trim();
  } catch {
    return "Contact-ops correlation unavailable at this time, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.contacts)         ? raw.contacts
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((c, i) => ({
    id:         c.id           || String(i),
    name:       c.name         || c.full_name  || c.display_name || `Contact ${i + 1}`,
    role:       c.role         || c.job_title  || c.title        || "",
    department: c.department   || c.dept       || c.team         || "",
  }));
}

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.events)           ? raw.events
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr
    .map((e, i) => ({
      id:          e.id          || String(i),
      title:       e.title       || e.name         || e.event_type || `Event ${i + 1}`,
      description: (e.description || e.message || e.body || e.details || "").toString().slice(0, 300),
      severity:    (e.severity   || e.level        || "low").toLowerCase(),
      timestamp:   e.timestamp   || e.created_at   || e.occurred_at || null,
    }))
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]]+/)
    .filter((w) => w.length >= 3);
}

function relevance(contact, event) {
  const cw = keywords(`${contact.name} ${contact.role} ${contact.department}`);
  const ew = keywords(`${event.title} ${event.description}`);
  return cw.filter((w) => ew.some((e) => e.includes(w) || w.includes(e))).length;
}

function buildCorrelated(contacts, events) {
  return contacts.map((c) => {
    const matched = events
      .map((e) => ({ ...e, score: relevance(c, e) }))
      .filter((e) => e.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...c, events: matched, involved: matched.length > 0 };
  });
}

function sevColor(sev) {
  if (sev === "critical") return "#FF3333";
  if (sev === "high")     return "#FF8800";
  if (sev === "medium")   return "#FFD700";
  return "#6B7280";
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch { return String(ts).slice(0, 16); }
}

// ── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "INVOLVED", "CLEAR"];

export default function ContactOpsLinker() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [events,    setEvents]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, eRes] = await Promise.all([
        fetch(`${base}/entities/Contact`, { headers: hdr }),
        fetch(`${base}/v1/ops/events`,    { headers: hdr }),
      ]);
      const cRaw = await cRes.json();
      const eRaw = await eRes.json();
      setContacts(normaliseContacts(cRaw));
      setEvents(normaliseEvents(eRaw));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ctops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ctops-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isCtopsQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(contacts, events);
  const involved   = correlated.filter((c) => c.involved).length;
  const clear      = correlated.filter((c) => !c.involved).length;

  const visible = correlated.filter((c) => {
    if (filter === "INVOLVED") return c.involved;
    if (filter === "CLEAR")    return !c.involved;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildCtopsScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Contact–Ops Linker (◈ CTOPS)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ CTOPS{involved > 0 && (
          <span style={{
            marginLeft: 4, background: "#FF8800", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{involved}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              CONTACT–OPS LINKER
            </span>
            <button
              onClick={assess}
              disabled={assessing || contacts.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || contacts.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "CONTACTS", val: contacts.length, color: C.neon    },
              { label: "EVENTS",   val: events.length,   color: C.blue    },
              { label: "INVOLVED", val: involved,         color: "#FF8800" },
              { label: "CLEAR",    val: clear,            color: "#4ADE80" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Contact list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && contacts.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No contacts match.</div>
            ) : visible.map((c) => (
              <div key={c.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${c.involved ? "#FF8800" : "#4ADE80"}`,
                  }}
                >
                  <span style={{ color: c.involved ? "#FF8800" : "#4ADE80", fontSize: 10, width: 10 }}>
                    {c.involved ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  {c.role && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${C.blue}22`, color: C.blue,
                      border: `1px solid ${C.blue}44`,
                      maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.role}
                    </span>
                  )}
                  <span style={{ color: c.involved ? "#FF8800" : "#4ADE80", fontSize: "9px", minWidth: 42, textAlign: "right" }}>
                    {c.involved ? `${c.events.length} EVT` : "CLEAR"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === c.id ? "▴" : "▾"}</span>
                </div>

                {expanded === c.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {c.involved ? c.events.map((ev) => (
                      <div key={ev.id} style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "3px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{
                          fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                          background: `${sevColor(ev.severity)}22`, color: sevColor(ev.severity),
                          border: `1px solid ${sevColor(ev.severity)}55`,
                          whiteSpace: "nowrap", textTransform: "uppercase",
                        }}>
                          {ev.severity}
                        </span>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.title}
                        </span>
                        <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>
                          {fmtTime(ev.timestamp)}
                        </span>
                        <span style={{ color: C.blue, fontSize: "9px", marginLeft: 2, whiteSpace: "nowrap" }}>
                          rel:{ev.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No active ops events linked to this contact.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/Contact · /v1/ops/events · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
