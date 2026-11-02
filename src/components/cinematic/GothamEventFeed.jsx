/**
 * GothamEventFeed — F288.
 *
 * Scrolling feed of Gotham events, newest first.
 *
 *   Feed        — GET /v1/gotham/events (poll every 10s); newest first.
 *   Row         — event_type badge + description + timestamp + "Link to Case" button.
 *   Link modal  — case selector from GET /v1/gotham/cases; since no write endpoint
 *                 exists this is a draft proposal shown in a confirm dialog and
 *                 logged to the console for audit review.
 *   Filter      — filter by event_type tabs.
 *   Unread badge — counts events seen since last open; pulses red when > 0.
 *   ASSESS      — /v1/jarvis/agent/chat + TTS.
 *
 * Toggle: ◈ GOEVTFD  left:209080  bottom:8  zIndex:384
 * Event:  jarvis:goevtfd-toggle
 * Voice:  "gotham event feed / goevtfd / gotham events / event feed /
 *          gotham event stream / gotham feed"
 *
 * Exported for JarvisBrain: isGoevtfdQuery
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
const PU   = "#A78BFA";
const GRAY = "#4E6070";
const SURF = "rgba(10,18,28,0.97)";
const BORD = "rgba(41,231,255,0.18)";

// event_type → badge color
function typeColor(t) {
  const lo = (t || "").toLowerCase();
  if (lo.includes("alert") || lo.includes("critical") || lo.includes("error")) return RD;
  if (lo.includes("warn"))   return AM;
  if (lo.includes("link") || lo.includes("case"))  return CY;
  if (lo.includes("create") || lo.includes("add")) return GN;
  if (lo.includes("update") || lo.includes("edit")) return ORNG;
  if (lo.includes("delete") || lo.includes("remove")) return RD;
  return PU;
}

function fmtTs(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return ts || "—"; }
}

// ─── constants ────────────────────────────────────────────────────────────────
const BTN_LEFT   = 209080;
const PANEL_W    = 720;
const PANEL_H    = 560;
const POLL_MS    = 10_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain export ───────────────────────────────────────────────────────
const GOEVTFD_RE =
  /\b(gotham\s+event\s+feed|goevtfd\b|gotham\s+events?\b|event\s+feed\b|gotham\s+event\s+stream|gotham\s+feed\b)\b/i;

export function isGoevtfdQuery(q) {
  return GOEVTFD_RE.test(q || "");
}

// ─── helpers ──────────────────────────────────────────────────────────────────
async function fetchEvents(limit = 200) {
  const r = await fetch(`${apiBase()}/v1/gotham/events?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return d?.items || d?.events || (Array.isArray(d) ? d : []);
}

async function fetchCases(limit = 100) {
  const r = await fetch(`${apiBase()}/v1/gotham/cases?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return d?.items || d?.cases || (Array.isArray(d) ? d : []);
}

// ─── component ────────────────────────────────────────────────────────────────
export default function GothamEventFeed() {
  const [open, setOpen]           = useState(false);
  const [events, setEvents]       = useState([]);
  const [cases, setCases]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);
  const [filter, setFilter]       = useState("ALL");
  const [unread, setUnread]       = useState(0);
  const [linkEvt, setLinkEvt]     = useState(null);  // event being "linked"
  const [selectedCase, setSelectedCase] = useState("");
  const [linkDraft, setLinkDraft] = useState(null);  // confirmed draft proposal
  const [assessing, setAssessing] = useState(false);
  const seenIds = useRef(new Set());
  const pollRef = useRef(null);

  const load = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      const evts = await fetchEvents();
      setEvents(evts);
      setErr(null);
      // compute unread only after first load
      if (!isInitial) {
        const newCount = evts.filter(e => {
          const id = e.event_id || e.id || JSON.stringify(e);
          return !seenIds.current.has(id);
        }).length;
        if (newCount > 0) setUnread(u => u + newCount);
      }
      evts.forEach(e => {
        const id = e.event_id || e.id || JSON.stringify(e);
        seenIds.current.add(id);
      });
    } catch (ex) {
      setErr(ex.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  // Toggle listener
  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:goevtfd-toggle", handler);
    return () => window.removeEventListener("jarvis:goevtfd-toggle", handler);
  }, []);

  // Load cases once
  useEffect(() => {
    fetchCases().then(setCases).catch(() => {});
  }, []);

  // Initial load + polling
  useEffect(() => {
    if (!open) return;
    setUnread(0);
    load(true);
    pollRef.current = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  // Filtered events
  const types = ["ALL", ...Array.from(new Set(events.map(e => e.event_type || "unknown")))];
  const visible = filter === "ALL" ? events : events.filter(e => (e.event_type || "unknown") === filter);

  // ASSESS
  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const typeCounts = {};
      events.forEach(e => {
        const t = e.event_type || "unknown";
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      const summary = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([t, n]) => `${t}:${n}`)
        .join(", ");
      const prompt = `Gotham event feed has ${events.length} events. Type distribution: ${summary}. ` +
        `Most recent: ${events.slice(0, 3).map(e => e.event_type || "unknown").join(", ")}. ` +
        `Provide a 2-sentence situational assessment of event type distribution and any notable patterns.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data?.response || data?.message || data?.text || "Assessment complete.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      // silent
    } finally {
      setAssessing(false);
    }
  }, [events, assessing]);

  // Link-to-case draft proposal
  const confirmLink = useCallback(() => {
    if (!linkEvt || !selectedCase) return;
    const cas = cases.find(c => (c.case_id || c.id) === selectedCase);
    const draft = {
      event_id:   linkEvt.event_id || linkEvt.id || "(unknown)",
      event_type: linkEvt.event_type || "unknown",
      case_id:    selectedCase,
      case_title: cas?.title || selectedCase,
      proposed_at: new Date().toISOString(),
      note: "DRAFT PROPOSAL — no write endpoint available. Manual review required.",
    };
    console.info("[JARVIS:GothamEventFeed] Link-to-case draft proposal:", JSON.stringify(draft, null, 2));
    setLinkDraft(draft);
    setLinkEvt(null);
    setSelectedCase("");
  }, [linkEvt, selectedCase, cases]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 384,
          background: "rgba(10,18,28,0.88)", border: `1px solid ${BORD}`,
          color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
          letterSpacing: 2, padding: "3px 7px", cursor: "pointer",
          borderRadius: 3, whiteSpace: "nowrap",
        }}
      >
        ◈ GOEVTFD
        {unread > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff",
            borderRadius: "50%", fontSize: 8, padding: "1px 4px",
            animation: "pulse 1.4s infinite",
          }}>
            {unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, left: BTN_LEFT - 320,
      width: PANEL_W, maxHeight: PANEL_H, zIndex: 384,
      background: SURF, border: `1px solid ${BORD}`,
      borderRadius: 6, fontFamily: "'JetBrains Mono',monospace",
      fontSize: 11, color: CY, display: "flex", flexDirection: "column",
      boxShadow: "0 0 24px rgba(41,231,255,0.12)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderBottom: `1px solid ${BORD}`, flexShrink: 0,
      }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ GOTHAM EVENT FEED
        </span>
        <span style={{ color: GRAY, fontSize: 10 }}>{events.length} events</span>
        {unread > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 3, fontSize: 9, padding: "1px 5px" }}>
            +{unread} new
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={assess} disabled={assessing} style={btnStyle(CY)}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={btnStyle(GRAY)}>✕</button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex", gap: 4, padding: "6px 12px",
        borderBottom: `1px solid ${BORD}`, flexShrink: 0, flexWrap: "wrap",
      }}>
        {types.map(t => (
          <button key={t} onClick={() => setFilter(t)} style={{
            background: filter === t ? CY : "transparent",
            color: filter === t ? "#0a121c" : GRAY,
            border: `1px solid ${filter === t ? CY : BORD}`,
            borderRadius: 3, fontSize: 9, padding: "2px 7px", cursor: "pointer",
            letterSpacing: 1,
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading && <div style={{ color: GRAY, padding: "16px 12px" }}>Loading events…</div>}
        {err && <div style={{ color: RD, padding: "8px 12px" }}>Error: {err}</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: GRAY, padding: "16px 12px" }}>No events.</div>
        )}
        {visible.map((evt, i) => {
          const id  = evt.event_id || evt.id || i;
          const typ = evt.event_type || "unknown";
          const desc = evt.description || evt.message || evt.content || "(no description)";
          const ts  = evt.created_at || evt.timestamp || evt.ts || "";
          return (
            <div key={id} style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "6px 12px", borderBottom: `1px solid rgba(41,231,255,0.06)`,
            }}>
              {/* type badge */}
              <span style={{
                background: typeColor(typ), color: "#0a121c",
                borderRadius: 3, fontSize: 9, padding: "2px 6px",
                whiteSpace: "nowrap", flexShrink: 0, fontWeight: 700,
                letterSpacing: 1,
              }}>
                {typ.toUpperCase()}
              </span>
              {/* description */}
              <span style={{ flex: 1, color: "#d0e8f5", fontSize: 10, lineHeight: 1.5, wordBreak: "break-word" }}>
                {desc}
              </span>
              {/* timestamp */}
              <span style={{ color: GRAY, fontSize: 9, whiteSpace: "nowrap", flexShrink: 0 }}>
                {fmtTs(ts)}
              </span>
              {/* link button */}
              <button onClick={() => { setLinkEvt(evt); setSelectedCase(""); }} style={{
                ...btnStyle(ORNG), fontSize: 9, padding: "2px 6px", flexShrink: 0,
              }}>
                Link
              </button>
            </div>
          );
        })}
      </div>

      {/* Link-to-Case modal */}
      {linkEvt && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(5,10,18,0.92)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
          borderRadius: 6,
        }}>
          <div style={{
            background: SURF, border: `1px solid ${BORD}`, borderRadius: 6,
            padding: 20, width: 400, maxWidth: "90%",
          }}>
            <div style={{ color: CY, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>
              LINK EVENT TO CASE
            </div>
            <div style={{ color: GRAY, fontSize: 10, marginBottom: 12 }}>
              Event: <span style={{ color: AM }}>{(linkEvt.event_type || "unknown").toUpperCase()}</span>
              <br />
              {linkEvt.description || "(no description)"}
            </div>
            <div style={{ color: GRAY, fontSize: 9, marginBottom: 10 }}>
              Note: No write endpoint exists. This creates a <span style={{ color: RD }}>DRAFT PROPOSAL</span> logged for manual review.
            </div>
            <select
              value={selectedCase}
              onChange={e => setSelectedCase(e.target.value)}
              style={{
                width: "100%", background: "#0d1a28", color: CY,
                border: `1px solid ${BORD}`, borderRadius: 3,
                padding: "5px 8px", fontSize: 10, marginBottom: 12,
              }}
            >
              <option value="">— Select case —</option>
              {cases.map(c => (
                <option key={c.case_id || c.id} value={c.case_id || c.id}>
                  {c.title || c.case_id || c.id} [{(c.priority || "").toUpperCase()}]
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setLinkEvt(null)} style={btnStyle(GRAY)}>Cancel</button>
              <button
                onClick={confirmLink}
                disabled={!selectedCase}
                style={btnStyle(selectedCase ? ORNG : GRAY)}
              >
                Propose Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Draft-confirmed banner */}
      {linkDraft && (
        <div style={{
          padding: "8px 12px", background: "rgba(251,146,60,0.12)",
          borderTop: `1px solid ${ORNG}`, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ color: ORNG, fontSize: 10 }}>
            DRAFT PROPOSAL logged: event {linkDraft.event_id} → case "{linkDraft.case_title}". Awaiting manual review.
          </span>
          <button onClick={() => setLinkDraft(null)} style={{ ...btnStyle(GRAY), fontSize: 9 }}>✕</button>
        </div>
      )}
    </div>
  );
}

function btnStyle(col) {
  return {
    background: "transparent", color: col, border: `1px solid ${col}`,
    borderRadius: 3, fontSize: 10, padding: "3px 8px", cursor: "pointer",
    letterSpacing: 1,
  };
}
