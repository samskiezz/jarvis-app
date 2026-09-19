/**
 * F683 — Acoustic × Live World Intel Nexus (ACLW)
 * Cross-references /v1/acoustic/contacts against /functions/getLiveIntel.
 * Contacts with ≥1 keyword overlap with live seismic/crypto/FX events are WORLD-SIGNALED;
 * others are BACKGROUND (no live world backing).
 * Tabs: ALL / WORLD-SIGNALED / BACKGROUND | click-to-expand matched events.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 5-minute auto-refresh. Event: jarvis:aclw-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 138_060;
const Z_INDEX  = 219;
const POLL_MS  = 300_000; // 5 min — getLiveIntel is expensive
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACLW_RE = /\b(aclw|acoustic\s+world|world\s+acoustic|acoustic\s+live\s+intel|sensor\s+world|acoustic\s+world\s+intel|world\s+correlated\s+acoustic|acoustic\s+live\s+world|sound\s+world|acoustic\s+signal\s+world)\b/i;

const KIND_COLOR = { SEISMIC: "#FF6B35", CRYPTO: "#00E5A0", FX: "#29E7FF" };

// ── helpers ───────────────────────────────────────────────────────────────────

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

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseLiveEvents(data) {
  if (!data) return [];
  const all = [];

  const quakes = Array.isArray(data.earthquakes) ? data.earthquakes : [];
  quakes.forEach((q, i) => {
    all.push({
      id: q.id || `quake-${i}`,
      kind: "SEISMIC",
      name: q.place || q.name || `Magnitude ${q.magnitude} quake`,
      description: `Mag ${q.magnitude ?? "?"} at ${q.place || "unknown location"}.`,
      tags: ["seismic", "earthquake", "geologic", "disaster", q.place || ""].join(" "),
    });
  });

  const coins = Array.isArray(data.crypto) ? data.crypto
    : Array.isArray(data.coins) ? data.coins : [];
  coins.forEach((c, i) => {
    const sym = c.symbol || c.coin || c.currency || `COIN${i}`;
    all.push({
      id: `crypto-${sym}`,
      kind: "CRYPTO",
      name: sym,
      description: `Crypto ${sym}. Price: ${c.price ?? c.usd ?? "?"}.`,
      tags: ["crypto", "blockchain", "digital", "currency", "finance", sym.toLowerCase()].join(" "),
    });
  });

  const fxPairs = Array.isArray(data.fx) ? data.fx
    : Array.isArray(data.forex) ? data.forex : [];
  fxPairs.forEach((f, i) => {
    const pair = f.pair || f.symbol || f.currency_pair || `FX${i}`;
    all.push({
      id: `fx-${pair}`,
      kind: "FX",
      name: pair,
      description: `FX pair ${pair}. Rate: ${f.rate ?? f.price ?? "?"}.`,
      tags: ["forex", "currency", "exchange", "finance", pair.toLowerCase()].join(" "),
    });
  });

  return all;
}

function crossRef(contacts, events) {
  return contacts.map(c => {
    const contactText = [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
      .filter(Boolean).join(" ");
    const matched = events.filter(ev => {
      const evText = [ev.name, ev.description, ev.tags].filter(Boolean).join(" ");
      return overlap(contactText, evText) > 0;
    }).map(ev => ({
      ...ev,
      hits: overlap(contactText, [ev.name, ev.description, ev.tags].filter(Boolean).join(" ")),
    }));
    return { ...c, _matched: matched, _signaled: matched.length > 0 };
  });
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

export function isAclwQuery(text) {
  return ACLW_RE.test(text || "");
}

export async function buildAclwScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, lr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const events   = normaliseLiveEvents(lr);
    const enriched = crossRef(contacts, events);
    const signaled = enriched.filter(c => c._signaled);
    const summary  = `${signaled.length} of ${contacts.length} acoustic contacts correlated with ${events.length} live world events (${events.filter(e => e.kind === "SEISMIC").length} seismic, ${events.filter(e => e.kind === "CRYPTO").length} crypto, ${events.filter(e => e.kind === "FX").length} FX). Signaled contacts: ${signaled.map(c => c.name || c.callsign || c.id).join(", ") || "none"}.`;
    const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Live World Intel nexus: ${summary} Provide a 2-sentence acoustic world intelligence operational brief.` }),
    });
    const rj = await rr.json();
    return rj?.response || rj?.message || rj?.answer || summary;
  } catch (e) {
    return `Acoustic Live World Nexus error: ${e.message}`;
  }
}

// ── main component ─────────────────────────────────────────────────────────────

export default function AcousticLiveWorldNexus() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [events,    setEvents]    = useState([]);
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
      const [cr, lr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const e = normaliseLiveEvents(lr);
      const en = crossRef(c, e);
      setContacts(c);
      setEvents(e);
      setEnriched(en);
    } catch (_) { /* silent — stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:aclw-toggle", toggle);
    return () => window.removeEventListener("jarvis:aclw-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const signaled    = enriched.filter(c => c._signaled);
  const background  = enriched.filter(c => !c._signaled);

  const visible = (tab === "WORLD-SIGNALED" ? signaled : tab === "BACKGROUND" ? background : enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${signaled.length} of ${contacts.length} acoustic contacts correlated with ${events.length} live world events.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Live World Intel: ${summary} World-signaled: ${signaled.map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence acoustic world intelligence operational brief.` }),
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
        title="Acoustic × Live World Intel Nexus (ACLW)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: signaled.length > 0 ? "rgba(255,170,0,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${signaled.length > 0 ? "#ffaa00" : "#00ffe7"}`,
          color: signaled.length > 0 ? "#ffaa00" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACLW{signaled.length > 0 ? ` [${signaled.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 530, maxHeight: "82vh",
      background: "rgba(0,10,25,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 13 }}>
          ◈ ACOUSTIC × LIVE WORLD NEXUS
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 11 }}>{contacts.length} contacts · {events.length} events</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #00ffe711" }}>
        {[
          { label: "CONTACTS",       val: contacts.length,   color: "#00ffe7" },
          { label: "LIVE EVENTS",    val: events.length,     color: "#29E7FF" },
          { label: "WORLD-SIGNALED", val: signaled.length,   color: signaled.length > 0 ? "#ffaa00" : "#00ffe7" },
          { label: "BACKGROUND",     val: background.length, color: "#667" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,255,231,0.05)", border: "1px solid #00ffe711", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#556", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", alignItems: "center" }}>
        {["ALL", "WORLD-SIGNALED", "BACKGROUND"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#00ffe722" : "none",
            border: `1px solid ${tab === t ? "#00ffe7" : "#333"}`,
            color: tab === t ? "#00ffe7" : "#667",
            borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t}{t === "WORLD-SIGNALED" ? ` (${signaled.length})` : t === "BACKGROUND" ? ` (${background.length})` : ` (${enriched.length})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 110, outline: "none" }}
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
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.04)", border: `1px solid ${c._signaled ? "#ffaa0044" : "#00ffe711"}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: c._signaled ? "#ffaa00" : "#00ffe755" }}>
                  {c._signaled ? "▲" : "○"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: c._signaled ? "#ffcc44" : "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                {c._signaled && (
                  <span style={{ background: "#ffaa0022", color: "#ffaa00", border: "1px solid #ffaa0055", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                    {c._matched.length} event{c._matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                  {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}
                  {c._signaled ? (
                    <>
                      <div style={{ fontSize: 11, color: "#ffaa00", marginBottom: 6, fontWeight: 700 }}>Matched Live Events:</div>
                      {c._matched.map((ev, ei) => (
                        <div key={ev.id || ei} style={{ marginBottom: 4, padding: "4px 8px", background: "rgba(255,170,0,0.07)", border: "1px solid #ffaa0033", borderRadius: 4, fontSize: 11 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ background: `${KIND_COLOR[ev.kind] || "#667"}22`, color: KIND_COLOR[ev.kind] || "#667", border: `1px solid ${KIND_COLOR[ev.kind] || "#667"}55`, borderRadius: 3, padding: "0 5px", fontSize: 9 }}>{ev.kind}</span>
                            <span style={{ color: "#ffcc44", flex: 1 }}>{ev.name}</span>
                            <span style={{ color: "#888", fontSize: 10 }}>hits: {ev.hits}</span>
                          </div>
                          {ev.description && (
                            <div style={{ color: "#999", marginTop: 3, fontSize: 10 }}>{ev.description}</div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>No live world event correlation — contact is background.</div>
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
