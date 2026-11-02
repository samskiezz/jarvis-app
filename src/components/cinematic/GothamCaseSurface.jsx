/**
 * GothamCaseSurface — F271.
 *
 * CRUD surface for the Gotham case engine.
 *
 *   Left panel  — case list from GET /v1/gotham/cases (priority badges,
 *                 status, age); click row → drawer with case_id chip,
 *                 priority, status, created_by, created_at.
 *   Right panel — events feed from GET /v1/gotham/events, newest first;
 *                 filter tabs (ALL / by event kind).
 *   New Case    — modal: title + priority select + linked_objects input
 *                 → POST /v1/gotham/case.
 *   ASSESS      — /v1/jarvis/agent/chat + TTS.
 *
 * Priority colours: CRITICAL=red  HIGH=orange  NORMAL=cyan  LOW=grey
 *
 * Toggle: ◈ GOTCAS  left:199560  bottom:8  zIndex:367
 * Event:  jarvis:gotcas-toggle
 * Voice:  "gotham case surface / gotcas / case surface / gotham surface /
 *          case engine surface / gotham cases surface"
 *
 * Exported for JarvisBrain: isGotcasQuery, buildGotcasScript
 * Mounted via src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

// ─── palette ──────────────────────────────────────────────────────────────────
const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const ORNG = "#FB923C";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

const PRIO_COLORS = {
  critical: RD,
  high:     ORNG,
  normal:   CY,
  low:      GRAY,
};

function prioColor(p) {
  return PRIO_COLORS[(p || "").toLowerCase()] || GRAY;
}

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT   = 199560;
const PANEL_W    = 820;
const PANEL_H    = 580;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────

const GOTCAS_RE =
  /\b(gotham\s+case\s+surface|gotcas\b|case\s+surface|gotham\s+surface|case\s+engine\s+surface|gotham\s+cases?\s+surface)\b/i;

export function isGotcasQuery(q) {
  return GOTCAS_RE.test(q || "");
}

export async function buildGotcasScript() {
  try {
    const [cr, er] = await Promise.all([
      fetch(`${apiBase()}/v1/gotham/cases?limit=50`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/gotham/events?limit=20`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const cd = await cr.json();
    const ed = await er.json();
    const cases  = cd?.items || [];
    const events = ed?.items || [];
    if (cases.length === 0) {
      return "Gotham case surface: no cases on record. POST /v1/gotham/case to create one.";
    }
    const open     = cases.filter((c) => c.status === "open").length;
    const critical = cases.filter((c) => (c.priority || "").toLowerCase() === "critical").length;
    const high     = cases.filter((c) => (c.priority || "").toLowerCase() === "high").length;
    return (
      `Gotham case surface: ${cases.length} total cases, ${open} open. ` +
      `${critical} CRITICAL priority, ${high} HIGH priority. ` +
      `${events.length} events in the feed. ` +
      (critical > 0 ? `${critical} critical case${critical !== 1 ? "s" : ""} require immediate attention.` : "No critical cases active.")
    );
  } catch {
    return "Unable to retrieve Gotham case surface data at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function hdrs(auth = false) {
  const h = { "Content-Type": "application/json" };
  if (auth) h["Authorization"] = `Bearer ${API_KEY}`;
  return h;
}

function age(epochSec) {
  const diff = Math.floor(Date.now() / 1000) - (epochSec || 0);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchCases() {
  const r = await fetch(`${apiBase()}/v1/gotham/cases?limit=100`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`cases ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.items) ? d.items : [];
}

async function fetchEvents() {
  const r = await fetch(`${apiBase()}/v1/gotham/events?limit=200`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`events ${r.status}`);
  const d = await r.json();
  return Array.isArray(d?.items) ? d.items : [];
}

async function postCase(title, priority, linkedObjects) {
  const r = await fetch(`${apiBase()}/v1/gotham/case`, {
    method: "POST",
    headers: hdrs(true),
    body: JSON.stringify({
      title,
      priority: priority || "normal",
      linked_objects: linkedObjects
        ? linkedObjects.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `create ${r.status}`);
  }
  return r.json();
}

async function ttsSpeak(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: hdrs(true),
      body: JSON.stringify({ text, voice: "jarvis" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = new Audio(url);
    a.onended  = () => URL.revokeObjectURL(url);
    a.play().catch(() => {});
  } catch {}
}

async function assessCases() {
  const script = await buildGotcasScript();
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: hdrs(true),
    body: JSON.stringify({ message: script }),
  });
  if (!r.ok) return "Unable to assess Gotham case surface.";
  const d = await r.json();
  return d?.response || d?.message || String(d);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function PrioBadge({ priority }) {
  const col = prioColor(priority);
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1,
      textTransform: "uppercase", color: col,
      border: `1px solid ${col}`, borderRadius: 3,
      padding: "1px 5px", marginLeft: 4,
    }}>
      {priority || "normal"}
    </span>
  );
}

function StatusChip({ status }) {
  const col = status === "open" ? GN : GRAY;
  return (
    <span style={{
      fontSize: 9, color: col, border: `1px solid ${col}`,
      borderRadius: 3, padding: "1px 5px", marginLeft: 4,
      fontWeight: 700, textTransform: "uppercase",
    }}>
      {status || "open"}
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function GothamCaseSurface() {
  const [open,     setOpen]     = useState(false);
  const [cases,    setCases]    = useState([]);
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState(null);
  const [selCase,  setSelCase]  = useState(null);
  const [evtFilter, setEvtFilter] = useState("ALL");
  const [showNew,  setShowNew]  = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPrio,  setNewPrio]  = useState("normal");
  const [newLinks, setNewLinks] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState(null);
  const [assess,   setAssess]   = useState(null);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [c, e] = await Promise.all([fetchCases(), fetchEvents()]);
      setCases(c);
      setEvents(e);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = (ev) => {
      if (ev?.detail?.open !== undefined) setOpen(ev.detail.open);
      else setOpen((o) => !o);
    };
    window.addEventListener("jarvis:gotcas-toggle", handler);
    return () => window.removeEventListener("jarvis:gotcas-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  // compute event-kind tabs
  const evtKinds = ["ALL", ...Array.from(new Set(events.map((e) => e.kind).filter(Boolean)))];
  const filteredEvts = evtFilter === "ALL"
    ? events
    : events.filter((e) => e.kind === evtFilter);

  // stats
  const openCount     = cases.filter((c) => c.status === "open").length;
  const criticalCount = cases.filter((c) => (c.priority || "").toLowerCase() === "critical").length;
  const hasCritical   = criticalCount > 0;

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await postCase(newTitle.trim(), newPrio, newLinks);
      setNewTitle("");
      setNewPrio("normal");
      setNewLinks("");
      setShowNew(false);
      await load();
    } catch (ex) {
      setSaveErr(ex.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAssess() {
    setAssessing(true);
    setAssess(null);
    const txt = await assessCases();
    setAssess(txt);
    setAssessing(false);
    await ttsSpeak(txt);
  }

  const BTN_STYLE = {
    position: "fixed",
    left:     BTN_LEFT,
    bottom:   8,
    zIndex:   367,
    background: hasCritical
      ? `rgba(248,113,113,0.18)`
      : "rgba(12,24,36,0.92)",
    border: `1px solid ${hasCritical ? RD : CY}`,
    color:  hasCritical ? RD : CY,
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 11,
    fontFamily: "monospace",
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  const PANEL_STYLE = {
    position:    "fixed",
    left:        BTN_LEFT,
    bottom:      36,
    zIndex:      368,
    width:       PANEL_W,
    height:      PANEL_H,
    background:  SURF,
    border:      `1px solid ${BORD}`,
    borderRadius: 8,
    display:     "flex",
    flexDirection: "column",
    overflow:    "hidden",
    fontFamily:  "monospace",
    color:       CY,
    fontSize:    12,
  };

  return (
    <>
      {/* ◈ GOTCAS toggle button */}
      <button
        style={BTN_STYLE}
        onClick={() => setOpen((o) => !o)}
        title="Gotham Case Surface"
      >
        ◈ GOTCAS
        {hasCritical && (
          <span style={{
            marginLeft: 4, background: RD, color: "#fff",
            borderRadius: "50%", padding: "0 4px", fontSize: 9,
          }}>
            {criticalCount}
          </span>
        )}
      </button>

      {open && (
        <div style={PANEL_STYLE}>
          {/* header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px",
            borderBottom: `1px solid ${BORD}`,
            flexShrink: 0,
          }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: CY }}>
              ◈ GOTHAM CASE SURFACE
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: GRAY }}>
              {cases.length} cases · {openCount} open
              {hasCritical && (
                <span style={{ color: RD, marginLeft: 6, fontWeight: 700 }}>
                  ⚠ {criticalCount} CRITICAL
                </span>
              )}
            </span>
            <button
              onClick={() => setShowNew(true)}
              style={{
                background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`,
                color: CY, borderRadius: 4, padding: "2px 8px",
                fontSize: 10, cursor: "pointer",
              }}
            >
              + New Case
            </button>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: "rgba(245,166,35,0.12)", border: `1px solid ${AM}`,
                color: AM, borderRadius: 4, padding: "2px 8px",
                fontSize: 10, cursor: "pointer",
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent", border: "none",
                color: GRAY, cursor: "pointer", fontSize: 14,
              }}
            >
              ×
            </button>
          </div>

          {/* ASSESS result */}
          {assess && (
            <div style={{
              padding: "6px 12px", fontSize: 11, color: AM,
              borderBottom: `1px solid ${BORD}`, flexShrink: 0,
              background: "rgba(245,166,35,0.06)",
            }}>
              {assess}
            </div>
          )}

          {/* error */}
          {err && (
            <div style={{ padding: "6px 12px", color: RD, fontSize: 11, flexShrink: 0 }}>
              Error: {err}
            </div>
          )}

          {/* body: left cases + right events */}
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* ── left: cases ── */}
            <div style={{
              flex: "0 0 52%", borderRight: `1px solid ${BORD}`,
              display: "flex", flexDirection: "column", minHeight: 0,
            }}>
              <div style={{
                padding: "6px 10px", fontSize: 10, color: GRAY,
                borderBottom: `1px solid ${BORD}`, flexShrink: 0,
              }}>
                CASES {loading && <span style={{ color: AM }}>(loading…)</span>}
              </div>
              <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
                {cases.length === 0 && !loading && (
                  <div style={{ padding: "12px 10px", color: GRAY, fontSize: 11 }}>
                    No cases on record.
                  </div>
                )}
                {cases.map((c) => {
                  const isSelected = selCase?.case_id === c.case_id;
                  return (
                    <div key={c.case_id}>
                      <div
                        onClick={() => setSelCase(isSelected ? null : c)}
                        style={{
                          padding: "6px 10px",
                          cursor: "pointer",
                          background: isSelected ? "rgba(41,231,255,0.08)" : "transparent",
                          borderLeft: isSelected ? `3px solid ${CY}` : "3px solid transparent",
                          display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 11, color: "#cdd", flex: 1, minWidth: 0 }}>
                          {c.title}
                        </span>
                        <PrioBadge priority={c.priority} />
                        <StatusChip status={c.status} />
                        <span style={{ fontSize: 9, color: GRAY, marginLeft: "auto" }}>
                          {age(c.created_at)}
                        </span>
                      </div>
                      {isSelected && (
                        <div style={{
                          background: "rgba(41,231,255,0.04)",
                          padding: "6px 14px 8px",
                          fontSize: 10, color: GRAY,
                          borderBottom: `1px solid ${BORD}`,
                        }}>
                          <div style={{ marginBottom: 2 }}>
                            <span style={{ color: CY }}>ID:</span>{" "}
                            <code style={{ fontSize: 10, color: AM }}>{c.case_id}</code>
                          </div>
                          <div style={{ marginBottom: 2 }}>
                            <span style={{ color: CY }}>Priority:</span>{" "}
                            <span style={{ color: prioColor(c.priority) }}>
                              {(c.priority || "normal").toUpperCase()}
                            </span>
                          </div>
                          <div style={{ marginBottom: 2 }}>
                            <span style={{ color: CY }}>Status:</span>{" "}
                            {c.status || "open"}
                          </div>
                          <div>
                            <span style={{ color: CY }}>Created:</span>{" "}
                            {c.created_at
                              ? new Date(c.created_at * 1000).toISOString().slice(0, 19).replace("T", " ")
                              : "—"}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── right: events ── */}
            <div style={{
              flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
            }}>
              <div style={{
                padding: "6px 10px", fontSize: 10, color: GRAY,
                borderBottom: `1px solid ${BORD}`, flexShrink: 0,
                display: "flex", gap: 4, flexWrap: "wrap",
              }}>
                {evtKinds.map((k) => (
                  <button
                    key={k}
                    onClick={() => setEvtFilter(k)}
                    style={{
                      background: evtFilter === k ? "rgba(41,231,255,0.15)" : "transparent",
                      border: `1px solid ${evtFilter === k ? CY : BORD}`,
                      color: evtFilter === k ? CY : GRAY,
                      borderRadius: 3, padding: "1px 6px",
                      fontSize: 9, cursor: "pointer",
                    }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
                {filteredEvts.length === 0 && (
                  <div style={{ padding: "12px 10px", color: GRAY, fontSize: 11 }}>
                    No events{evtFilter !== "ALL" ? ` of type ${evtFilter}` : ""}.
                  </div>
                )}
                {filteredEvts.map((e) => (
                  <div
                    key={e.event_id}
                    style={{
                      padding: "5px 10px",
                      borderBottom: `1px solid rgba(41,231,255,0.05)`,
                      display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <span style={{
                      fontSize: 9, color: CY,
                      border: `1px solid ${BORD}`,
                      borderRadius: 3, padding: "1px 5px",
                      flexShrink: 0,
                    }}>
                      {e.kind || "event"}
                    </span>
                    <span style={{ fontSize: 10, color: GRAY, flexShrink: 0 }}>
                      {e.case_id ? e.case_id.slice(0, 18) : "—"}
                    </span>
                    <span style={{ fontSize: 9, color: GRAY, marginLeft: "auto", flexShrink: 0 }}>
                      {age(e.ts)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Case modal ── */}
      {showNew && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: SURF, border: `1px solid ${CY}`,
            borderRadius: 8, padding: "20px 24px", width: 380,
            fontFamily: "monospace", color: CY,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
              + NEW GOTHAM CASE
            </div>
            <label style={{ fontSize: 10, color: GRAY, display: "block", marginBottom: 4 }}>
              Title *
            </label>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Case title"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${BORD}`, borderRadius: 4,
                color: CY, fontSize: 12, padding: "5px 8px",
                outline: "none", boxSizing: "border-box", marginBottom: 10,
              }}
            />
            <label style={{ fontSize: 10, color: GRAY, display: "block", marginBottom: 4 }}>
              Priority
            </label>
            <select
              value={newPrio}
              onChange={(e) => setNewPrio(e.target.value)}
              style={{
                width: "100%", background: "rgba(10,18,28,0.97)",
                border: `1px solid ${BORD}`, borderRadius: 4,
                color: prioColor(newPrio), fontSize: 12, padding: "5px 8px",
                outline: "none", boxSizing: "border-box", marginBottom: 10,
              }}
            >
              <option value="critical">CRITICAL</option>
              <option value="high">HIGH</option>
              <option value="normal">NORMAL</option>
              <option value="low">LOW</option>
            </select>
            <label style={{ fontSize: 10, color: GRAY, display: "block", marginBottom: 4 }}>
              Linked Objects (comma-separated)
            </label>
            <input
              value={newLinks}
              onChange={(e) => setNewLinks(e.target.value)}
              placeholder="obj-123, obj-456"
              style={{
                width: "100%", background: "rgba(41,231,255,0.06)",
                border: `1px solid ${BORD}`, borderRadius: 4,
                color: CY, fontSize: 12, padding: "5px 8px",
                outline: "none", boxSizing: "border-box", marginBottom: 14,
              }}
            />
            {saveErr && (
              <div style={{ color: RD, fontSize: 10, marginBottom: 8 }}>
                Error: {saveErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setShowNew(false); setSaveErr(null); }}
                style={{
                  background: "transparent", border: `1px solid ${GRAY}`,
                  color: GRAY, borderRadius: 4, padding: "4px 12px",
                  fontSize: 11, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !newTitle.trim()}
                style={{
                  background: "rgba(41,231,255,0.12)", border: `1px solid ${CY}`,
                  color: CY, borderRadius: 4, padding: "4px 12px",
                  fontSize: 11, cursor: "pointer",
                }}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
