/**
 * F682 — Acoustic × Skill Nexus (ACSKILL)
 * Cross-references /v1/acoustic/contacts against /v1/aip/skill.
 * Contacts with ≥1 keyword overlap are SKILLED; others are UNSKILLED.
 * Tabs: ALL / SKILLED / UNSKILLED | click-to-expand matched skills.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-second auto-refresh. Event: jarvis:acskill-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT  = 137_200;
const Z_INDEX   = 218;
const POLL_MS   = 90_000;
const API_KEY   = import.meta.env.VITE_API_KEY || "";

const ACSKILL_RE = /\b(acskill|acoustic\s+skill|skill\s+acoustic|sensor\s+skill|acoustic\s+capability|sound\s+skill|sensor\s+capability|acoustic\s+aip\s+skill)\b/i;

// ── helpers ──────────────────────────────────────────────────────────────────

function normaliseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.contacts)) return raw.contacts;
  if (Array.isArray(raw?.items))    return raw.items;
  if (Array.isArray(raw?.data))     return raw.data;
  return [];
}

function normaliseSkills(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.skills)) return raw.skills;
  if (Array.isArray(raw?.items))  return raw.items;
  if (Array.isArray(raw?.data))   return raw.data;
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

function crossRef(contacts, skills) {
  return contacts.map(c => {
    const name  = c.name || c.callsign || c.id || "";
    const tags  = [name, c.type, c.classification, c.vessel_type, c.description]
      .filter(Boolean).join(" ");
    const matched = skills.filter(s => {
      const skillText = [s.name, s.domain, s.description, s.category, s.label]
        .filter(Boolean).join(" ");
      return overlap(tags, skillText) > 0;
    });
    return { ...c, _matched: matched, _skilled: matched.length > 0 };
  });
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcskillQuery(text) {
  return ACSKILL_RE.test(text || "");
}

export async function buildAcskillScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, sr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/aip/skill`,         { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const skills   = normaliseSkills(sr);
    const enriched = crossRef(contacts, skills);
    const skilled  = enriched.filter(c => c._skilled);
    const summary  = `${skilled.length} of ${contacts.length} acoustic contacts linked to active skills (${skills.length} skills loaded). Skilled contacts: ${skilled.map(c => c.name || c.callsign || c.id).join(", ") || "none"}.`;
    const rr2 = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Skill nexus status: ${summary} Provide a 2-sentence sensor-capability operational brief.` }),
    });
    const rj2 = await rr2.json();
    return rj2?.response || rj2?.message || rj2?.answer || summary;
  } catch (e) {
    return `Acoustic Skill Nexus error: ${e.message}`;
  }
}

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticSkillNexus() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [skills,    setSkills]    = useState([]);
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
      const [cr, sr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/aip/skill`,         { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const s = normaliseSkills(sr);
      const e = crossRef(c, s);
      setContacts(c);
      setSkills(s);
      setEnriched(e);
    } catch (_) { /* silent — stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acskill-toggle", toggle);
    return () => window.removeEventListener("jarvis:acskill-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const skilled   = enriched.filter(c => c._skilled);
  const unskilled = enriched.filter(c => !c._skilled);

  const visible = (tab === "SKILLED" ? skilled : tab === "UNSKILLED" ? unskilled : enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${skilled.length} of ${contacts.length} acoustic contacts linked to active skills.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Skill nexus: ${summary} Skilled: ${skilled.map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence sensor-capability operational brief.` }),
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
        title="Acoustic × Skill Nexus (ACSKILL)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: skilled.length > 0 ? "rgba(255,170,0,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${skilled.length > 0 ? "#ffaa00" : "#00ffe7"}`,
          color: skilled.length > 0 ? "#ffaa00" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACSKILL{skilled.length > 0 ? ` [${skilled.length}]` : ""}
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
          ◈ ACOUSTIC × SKILL NEXUS
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 11 }}>{contacts.length} contacts · {skills.length} skills</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px 0", alignItems: "center" }}>
        {["ALL", "SKILLED", "UNSKILLED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#00ffe722" : "none",
            border: `1px solid ${tab === t ? "#00ffe7" : "#333"}`,
            color: tab === t ? "#00ffe7" : "#667",
            borderRadius: 4, padding: "2px 10px", fontSize: 11, cursor: "pointer",
          }}>
            {t}{t === "SKILLED" ? ` (${skilled.length})` : t === "UNSKILLED" ? ` (${unskilled.length})` : ` (${enriched.length})`}
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
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.04)", border: `1px solid ${c._skilled ? "#ffaa0044" : "#00ffe711"}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ fontSize: 10, color: c._skilled ? "#ffaa00" : "#00ffe777" }}>
                  {c._skilled ? "▲" : "○"}
                </span>
                <span style={{ flex: 1, fontSize: 12, color: c._skilled ? "#ffcc44" : "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                {c._skilled && (
                  <span style={{ background: "#ffaa0022", color: "#ffaa00", border: "1px solid #ffaa0055", borderRadius: 4, padding: "1px 6px", fontSize: 10 }}>
                    {c._matched.length} skill{c._matched.length !== 1 ? "s" : ""}
                  </span>
                )}
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                  {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}
                  {c._skilled ? (
                    <>
                      <div style={{ fontSize: 11, color: "#ffaa00", marginBottom: 6, fontWeight: 700 }}>Matched Skills:</div>
                      {c._matched.map((s, si) => (
                        <div key={si} style={{ marginBottom: 4, padding: "4px 8px", background: "rgba(255,170,0,0.07)", border: "1px solid #ffaa0033", borderRadius: 4, fontSize: 11 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ color: "#ffcc44" }}>{s.name || s.label || s.id || `Skill ${si + 1}`}</span>
                            {s.domain && (
                              <span style={{ background: "#00ffe711", color: "#00ffe7", border: "1px solid #00ffe733", borderRadius: 3, padding: "0 5px", fontSize: 10 }}>{s.domain}</span>
                            )}
                            {s.score != null && (
                              <span style={{ color: "#888", fontSize: 10, marginLeft: "auto" }}>score: {s.score}</span>
                            )}
                          </div>
                          {s.description && (
                            <div style={{ color: "#999", marginTop: 3 }}>{s.description}</div>
                          )}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: "#555" }}>No skill links — contact is unskilled.</div>
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
