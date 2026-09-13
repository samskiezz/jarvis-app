/**
 * F681 — Acoustic × Reminders Nexus (ACREM)
 * Cross-references /v1/acoustic/contacts against /reminders/list.
 * Contacts with ≥1 keyword overlap are NOTED; others are UNRECORDED.
 * Tabs: ALL / NOTED / UNRECORDED | click-to-expand matched reminders.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acrem-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT  = 136_340;
const Z_INDEX   = 217;
const POLL_MS   = 90_000;
const API_KEY   = import.meta.env.VITE_API_KEY || "";

const ACREM_RE = /\b(acrem|acoustic\s+reminders?|reminder\s+acoustic|sound\s+reminders?|sensor\s+reminders?|acoustic\s+reminder\s+nexus|acoustic\s+note|sensor\s+note)\b/i;

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseReminders(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.reminders)) return raw.reminders;
  if (Array.isArray(raw?.items))     return raw.items;
  if (Array.isArray(raw?.data))      return raw.data;
  return [];
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function overlap(a, b) {
  const setA = new Set(keywords(a));
  return keywords(b).filter(w => setA.has(w)).length;
}

function crossRef(contacts, reminders) {
  return contacts.map(c => {
    const name    = c.name || c.callsign || c.id || "";
    const tags    = [name, c.type, c.classification, c.vessel_type, c.description]
      .filter(Boolean).join(" ");
    const matched = reminders.filter(r => {
      const reminderText = [r.content, r.text, r.body, r.title, r.note, r.label]
        .filter(Boolean).join(" ");
      return overlap(tags, reminderText) > 0;
    });
    return { ...c, _matched: matched, _noted: matched.length > 0 };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcremQuery(text) {
  return ACREM_RE.test(text || "");
}

export async function buildAcremScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, rr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/reminders/list`,       { headers }).then(r => r.json()),
    ]);
    const contacts  = normaliseContacts(cr);
    const reminders = normaliseReminders(rr);
    const enriched  = crossRef(contacts, reminders);
    const noted     = enriched.filter(c => c._noted);
    const summary   = `${noted.length} of ${contacts.length} acoustic contacts linked to active reminders (${reminders.length} reminders loaded). Noted contacts: ${noted.map(c => c.name || c.callsign || c.id).join(", ") || "none"}.`;
    const rr2 = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Reminders nexus status: ${summary} Provide a 2-sentence operational brief.` }),
    });
    const rj2 = await rr2.json();
    return rj2?.response || rj2?.message || rj2?.answer || summary;
  } catch (e) {
    return `Acoustic Reminders Nexus error: ${e.message}`;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticRemindersNexus() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [reminders, setReminders] = useState([]);
  const [enriched,  setEnriched]  = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [cr, rr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/reminders/list`,       { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const r = normaliseReminders(rr);
      const e = crossRef(c, r);
      setContacts(c);
      setReminders(r);
      setEnriched(e);
    } catch (_) { /* silent — stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acrem-toggle", toggle);
    return () => window.removeEventListener("jarvis:acrem-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const noted      = enriched.filter(c => c._noted);
  const unrecorded = enriched.filter(c => !c._noted);

  const visible = (tab === "NOTED" ? noted : tab === "UNRECORDED" ? unrecorded : enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${noted.length} of ${contacts.length} acoustic contacts linked to active reminders.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Reminders nexus: ${summary} Noted: ${noted.map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence operational brief.` }),
      });
      const j = await r.json();
      const text = j?.response || j?.message || j?.answer || summary;
      setBrief(text);
      const ttsRes = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers,
        body: JSON.stringify({ text }),
      });
      if (ttsRes.ok) {
        const blob = await ttsRes.blob();
        const url  = URL.createObjectURL(blob);
        new Audio(url).play().catch(() => {});
      }
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic × Reminders Nexus (ACREM)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: noted.length > 0 ? "rgba(255,170,0,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${noted.length > 0 ? "#ffaa00" : "#00ffe7"}`,
          color: noted.length > 0 ? "#ffaa00" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACREM{noted.length > 0 ? ` [${noted.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 520, maxHeight: "82vh",
      background: "rgba(0,10,25,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ ACOUSTIC × REMINDERS NEXUS
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 11 }}>{contacts.length} contacts · {reminders.length} reminders</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", alignItems: "center" }}>
        {["ALL", "NOTED", "UNRECORDED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#00ffe722" : "none",
            border: `1px solid ${tab === t ? "#00ffe7" : "#333"}`,
            color: tab === t ? "#00ffe7" : "#667",
            borderRadius: 4, padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {t}{t === "NOTED" ? ` (${noted.length})` : t === "UNRECORDED" ? ` (${unrecorded.length})` : ` (${enriched.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 120, outline: "none" }}
        />
      </div>

      {/* contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No contacts</div>
        )}
        {visible.map((c, i) => {
          const id    = c.id || c.callsign || i;
          const label = c.name || c.callsign || c.id || `Contact ${i + 1}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.04)", border: `1px solid ${c._noted ? "#ffaa0044" : "#00ffe711"}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: c._noted ? "#ffaa00" : "#00ffe777" }}>
                  {c._noted ? "▲" : "○"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: c._noted ? "#ffcc44" : "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                {c._noted && (
                  <span style={{ background: "#ffaa0022", color: "#ffaa00", border: "1px solid #ffaa0055", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                    {c._matched.length} reminder{c._matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                  {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}
                  {c._noted ? (
                    <>
                      <div style={{ fontSize: 11, color: "#ffaa00", marginBottom: 6, fontWeight: 700 }}>Linked Reminders:</div>
                      {c._matched.map((r, ri) => (
                        <div key={ri} style={{ marginBottom: 4, padding: "4px 8px", background: "rgba(255,170,0,0.07)", border: "1px solid #ffaa0033", borderRadius: 4, fontSize: 11 }}>
                          <span style={{ color: "#ffcc44" }}>{r.title || r.label || r.id || `Reminder ${ri + 1}`}</span>
                          {(r.content || r.text || r.body) && (
                            <div style={{ color: "#999", marginTop: 3 }}>{r.content || r.text || r.body}</div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>No reminder links — contact is unrecorded.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ borderTop: "1px solid #00ffe733", padding: "10px 14px" }}>
        {brief && (
          <div style={{ fontSize: 11, color: "#c8f0ff", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
            {brief}
          </div>
        )}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            width: "100%", background: assessing ? "#001a2e" : "rgba(0,255,231,0.12)",
            border: "1px solid #00ffe7", color: "#00ffe7", borderRadius: 6,
            padding: "6px 0", fontSize: 12, cursor: assessing ? "default" : "pointer",
            fontFamily: "monospace", letterSpacing: 1,
          }}
        >
          {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
        </button>
      </div>
    </div>
  );
}
