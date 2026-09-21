/**
 * F679 — Acoustic × Contact Nexus (ACCNT)
 * Cross-references /v1/acoustic/contacts against /entities/Contact.
 * Acoustic contacts with ≥1 keyword overlap with a known Contact are
 * IDENTIFIED; others are UNIDENTIFIED (no match in the contact directory).
 * Tabs: ALL / IDENTIFIED / UNIDENTIFIED | click-to-expand matched contacts.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:accnt-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 134_620;
const Z_INDEX  = 215;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACCNT_RE = /\b(accnt|acoustic\s+contacts?|contact\s+acoustic|acoustic\s+identity|sensor\s+contacts?|acoustic\s+person(?:nel)?|sound\s+contacts?|acoustic\s+contact\s+nexus|identified\s+contacts?|acoustic\s+directory)\b/i;

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseAcoustic(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
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

function crossRef(acousticContacts, knownContacts) {
  return acousticContacts.map(ac => {
    const acText = [ac.name, ac.callsign, ac.type, ac.classification, ac.description]
      .filter(Boolean).join(" ");
    const matched = knownContacts.filter(c => {
      const cText = [c.name, c.role, c.organisation, c.email, c.tags]
        .filter(Boolean).join(" ");
      return overlap(acText, cText) > 0;
    });
    return { ...ac, _matched: matched, _identified: matched.length > 0 };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAccntQuery(text) {
  return ACCNT_RE.test(text || "");
}

export async function buildAccntScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [ar, cr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/entities/Contact`,     { headers }).then(r => r.json()),
    ]);
    const acoustic = normaliseAcoustic(ar);
    const contacts = normaliseContacts(cr);
    const enriched = crossRef(acoustic, contacts);
    const identified = enriched.filter(a => a._identified);
    const summary = `${identified.length} of ${acoustic.length} acoustic contacts keyword-match known contacts (${contacts.length} in directory). Identified: ${identified.map(a => a.name || a.callsign || a.id).join(", ") || "none"}.`;
    const r2 = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Contact nexus status: ${summary} Provide a 2-sentence acoustic identity brief.` }),
    });
    const j2 = await r2.json();
    return j2?.response || j2?.message || j2?.answer || summary;
  } catch (e) {
    return `Acoustic Contact Nexus error: ${e.message}`;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticContactNexus() {
  const [open,       setOpen]       = useState(false);
  const [acoustic,   setAcoustic]   = useState([]);
  const [contacts,   setContacts]   = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const [ar, cr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,     { headers }).then(r => r.json()),
      ]);
      const ac = normaliseAcoustic(ar);
      const c  = normaliseContacts(cr);
      setAcoustic(ac);
      setContacts(c);
      setEnriched(crossRef(ac, c));
    } catch (_) { /* silent — stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:accnt-toggle", toggle);
    return () => window.removeEventListener("jarvis:accnt-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const identified   = enriched.filter(a => a._identified);
  const unidentified = enriched.filter(a => !a._identified);

  const visible = (tab === "IDENTIFIED" ? identified : tab === "UNIDENTIFIED" ? unidentified : enriched)
    .filter(a => !search || [a.name, a.callsign, a.id, a.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${identified.length} of ${acoustic.length} acoustic contacts match known contacts (${contacts.length} in directory).`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Contact nexus: ${summary} Identified: ${identified.map(a => a.name || a.callsign || a.id).join(", ") || "none"}. Provide a 2-sentence acoustic identity brief.` }),
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
        new Audio(URL.createObjectURL(blob)).play().catch(() => {});
      }
    } catch (e) { setBrief(`Assessment error: ${e.message}`); }
    setAssessing(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic × Contact Nexus (ACCNT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: identified.length > 0 ? "rgba(255,170,0,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${identified.length > 0 ? "#ffaa00" : "#00ffe7"}`,
          color: identified.length > 0 ? "#ffaa00" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACCNT{identified.length > 0 ? ` [${identified.length}]` : ""}
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
          ◈ ACOUSTIC × CONTACT NEXUS
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 11 }}>{acoustic.length} acoustic · {contacts.length} known</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tile */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px 0" }}>
        {[
          { label: "IDENTIFIED", val: identified.length, col: "#ffaa00" },
          { label: "UNIDENTIFIED", val: unidentified.length, col: "#00ffe7" },
          { label: "COVERAGE", val: acoustic.length ? `${Math.round((identified.length / acoustic.length) * 100)}%` : "—", col: "#aaffaa" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: "rgba(0,255,231,0.05)", border: `1px solid ${s.col}33`, borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
            <div style={{ color: s.col, fontSize: 16, fontWeight: 700 }}>{s.val}</div>
            <div style={{ color: "#667", fontSize: 9, letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", alignItems: "center" }}>
        {["ALL", "IDENTIFIED", "UNIDENTIFIED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#00ffe722" : "none",
            border: `1px solid ${tab === t ? "#00ffe7" : "#333"}`,
            color: tab === t ? "#00ffe7" : "#667",
            borderRadius: 4, padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {t}{t === "IDENTIFIED" ? ` (${identified.length})` : t === "UNIDENTIFIED" ? ` (${unidentified.length})` : ` (${enriched.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 120, outline: "none" }}
        />
      </div>

      {/* acoustic contact list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#444", fontSize: 12, textAlign: "center", marginTop: 20 }}>No acoustic contacts</div>
        )}
        {visible.map((a, i) => {
          const id    = a.id || a.callsign || i;
          const label = a.name || a.callsign || a.id || `Contact ${i + 1}`;
          const isExp = expanded === id;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.04)", border: `1px solid ${a._identified ? "#ffaa0044" : "#00ffe711"}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: a._identified ? "#ffaa00" : "#00ffe777" }}>
                  {a._identified ? "▲" : "○"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: a._identified ? "#ffcc44" : "#c8f0ff" }}>{label}</span>
                {a.type && <span style={{ color: "#667", fontSize: 10 }}>{a.type}</span>}
                {a._identified && (
                  <span style={{ background: "#ffaa0022", color: "#ffaa00", border: "1px solid #ffaa0055", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                    {a._matched.length} match{a._matched.length !== 1 ? "es" : ""}
                  </span>
                )}
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {a.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {a.classification}</div>}
                  {a.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{a.description}</div>}
                  {a._identified ? (
                    <>
                      <div style={{ fontSize: 11, color: "#ffaa00", marginBottom: 6, fontWeight: 700 }}>Matched Known Contacts:</div>
                      {a._matched.map((c, ri) => (
                        <div key={ri} style={{ marginBottom: 4, padding: "4px 8px", background: "rgba(255,170,0,0.07)", border: "1px solid #ffaa0033", borderRadius: 4, fontSize: 11 }}>
                          <span style={{ color: "#ffcc44" }}>{c.name || `Contact ${ri + 1}`}</span>
                          {c.role         && <span style={{ color: "#888", marginLeft: 6 }}>{c.role}</span>}
                          {c.organisation && <span style={{ color: "#667", marginLeft: 6 }}>· {c.organisation}</span>}
                          {c.email        && <div style={{ color: "#999", marginTop: 2 }}>{c.email}</div>}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>No directory keyword matches — acoustic contact unidentified.</div>
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
